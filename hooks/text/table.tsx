import type { RenderElement } from 'claude-code'

import { cellWidth } from '../fit'
import { flagsVersion } from '../flags'
import { memo } from '../memo'
import { BG, TABLE } from '../palette'
import type { RenderCtx } from './ctx'
import { inlineOptsOf, plainText, spansOf, type InlineOpts, type Span } from './inline'
import { drawSpans } from './render'

type Align = 'left' | 'right' | 'center' | null
type ParsedTable = { header: string[]; rows: string[][]; align: Align[] }

const GAP = 2
const MIN_WIDTH = 4

/** A markdown table's text (header, rule, rows), every row cut or padded to the header's cells. */
export function parseTable(text: string): ParsedTable {
  const [head = '', rule = '', ...body] = text.split('\n')
  const header = splitRow(head)
  const rules = splitRow(rule)
  return {
    header,
    align: header.map((_, j) => alignOf(rules[j] ?? '')),
    rows: body.filter(line => line.trim() !== '').map(line => {
      const cells = splitRow(line).slice(0, header.length)
      while (cells.length < header.length) cells.push('')
      return cells
    }),
  }
}

// A pipe inside a code span stays in the cell, as the writer meant it; `\|` is a literal pipe.
function splitRow(line: string): string[] {
  let s = line.trim()
  if (s.startsWith('|')) s = s.slice(1)
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1)
  const cells: string[] = []
  let cell = ''
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!
    if (c === '\\' && s[i + 1] === '|') {
      cell += '|'
      i++
    } else if (c === '`') {
      let run = 1
      while (s[i + run] === '`') run++
      const close = closingTicks(s, i + run, run)
      const end = close === -1 ? i + run : close + run
      cell += s.slice(i, end)
      i = end - 1
    } else if (c === '|') {
      cells.push(cell.trim())
      cell = ''
    } else {
      cell += c
    }
  }
  cells.push(cell.trim())
  return cells
}

function closingTicks(s: string, from: number, run: number): number {
  for (let j = from; j < s.length; ) {
    if (s[j] !== '`') {
      j++
      continue
    }
    let r = 1
    while (s[j + r] === '`') r++
    if (r === run) return j
    j += r
  }
  return -1
}

function alignOf(rule: string): Align {
  const r = rule.trim()
  if (!/^:?-+:?$/.test(r)) return null
  const isLeft = r.startsWith(':')
  const isRight = r.endsWith(':')
  return isLeft && isRight ? 'center' : isRight ? 'right' : isLeft ? 'left' : null
}

/**
 * Column widths that fit `available` with `gap` between columns: the widest shrink
 * first, down to a common cap, never below `min`; whatever the cap leaves goes back to them.
 */
export function fitColumns(natural: readonly number[], available: number, gap: number, min: number): number[] {
  const room = available - gap * Math.max(0, natural.length - 1)
  const sum = (cap: number) => natural.reduce((a, w) => a + Math.min(w, cap), 0)
  if (sum(Infinity) <= room) return [...natural]
  if (sum(min) >= room) return natural.map(w => Math.min(w, min))
  let lo = min
  let hi = Math.max(...natural)
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (sum(mid) <= room) lo = mid
    else hi = mid - 1
  }
  let left = room - sum(lo)
  return natural.map(w => {
    if (w <= lo) return w
    const extra = left > 0 ? 1 : 0
    left -= extra
    return lo + extra
  })
}

const NUMERIC = /^(?:R\$|US\$|\$|€|£)?\s?[+\-−±~≈]?\d+(?:[.,]\d+)*\s?(?:%|p\.p\.|[\p{L}µ]{1,3}\.?)?$/u
const NOTHING = new Set(['', '—', '–', '-'])

/** A column whose filled cells are at least 80% numbers (with sign, currency or unit) aligns right. */
export function isNumericColumn(cells: readonly string[]): boolean {
  const filled = cells.map(c => c.trim()).filter(c => !NOTHING.has(c))
  if (filled.length === 0) return false
  return filled.filter(c => NUMERIC.test(c)).length >= 0.8 * filled.length
}

type Justify = { justifyContent?: 'flex-end' | 'center' }
type TableLayout = { head: string[]; body: Span[][][]; widths: number[]; total: number; justify: Justify[] }

/** Where each cell sits: its spans, the columns' widths in `columns` cells, and which side each column keeps to. */
function layoutOf(table: ParsedTable, columns: number, opts: InlineOpts): TableLayout {
  const head = table.header.map(label => plainText(spansOf(label, false, { deltas: false })))
  const body = table.rows.map(row => row.map(cell => spansOf(cell, false, opts)))
  // Numbers decide alignment as written, before a delta adds its note.
  const written = (spans: Span[]) => plainText(spans.filter(s => !s.kinds.includes('delta')))
  const cells = table.header.map((_, j) => body.map(row => row[j] ?? []))
  const natural = cells.map((column, j) => Math.max(1, cellWidth(head[j] ?? ''), ...column.map(c => cellWidth(plainText(c)))))
  const widths = fitColumns(natural, Math.max(1, columns - 2), GAP, MIN_WIDTH)
  const total = widths.reduce((a, w) => a + w, 0) + GAP * Math.max(0, widths.length - 1)
  const justify = cells.map((column, j): Justify => {
    const align = table.align[j] ?? null
    if (align === 'right' || (align === null && isNumericColumn(column.map(written)))) return { justifyContent: 'flex-end' }
    return align === 'center' ? { justifyContent: 'center' } : {}
  })
  return { head, body, widths, total, justify }
}

/** A table drawn by the mod: cyan underlined header, zebra rows, no vertical rules, numbers to the right. */
export function renderTable(ctx: RenderCtx, text: string, key: string): RenderElement {
  const { Box, Text } = ctx.t
  // The layout is plain data, kept per text, width and flags: a scroll draws the table again, not its parse.
  const { head, body, widths, total, justify } = memo('table', `${flagsVersion()}|${ctx.columns}|${text}`, () => layoutOf(parseTable(text), ctx.columns, inlineOptsOf(ctx.flags)), 500)
  const cell = (j: number, content: RenderElement) => (
    <Box width={widths[j]!} flexShrink={0} {...(j < widths.length - 1 ? { marginRight: GAP } : {})} {...justify[j]}>
      {content}
    </Box>
  )
  return (
    <Box flexDirection="column">
      <Box key={`${key}-head`} flexDirection="row" width={total}>
        {head.map((label, j) => cell(j, <Text {...TABLE.header}>{label}</Text>))}
      </Box>
      {body.map((row, i) => (
        <Box key={`${key}-row-${i}`} flexDirection="row" width={total} {...(i % 2 === 1 ? { backgroundColor: BG.zebra } : {})}>
          {row.map((spans, j) => cell(j, <Text>{spans.length === 0 ? ' ' : drawSpans(ctx, spans)}</Text>))}
        </Box>
      ))}
    </Box>
  )
}
