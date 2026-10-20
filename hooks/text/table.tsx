import type { RenderElement } from 'claude-code'

import { BG, TABLE } from '../palette'
import type { RenderCtx } from './ctx'
import { parseInline, plainText, type Span } from './inline'
import { drawSpans, inlineOpts } from './render'

export type Align = 'left' | 'right' | 'center' | null
export type ParsedTable = { header: string[]; rows: string[][]; align: Align[] }

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

const WIDE =
  /[ᄀ-ᅟ⺀-〾ぁ-㏿㐀-䶿一-鿿ꀀ-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦\u{20000}-\u{3FFFD}]|\p{Emoji_Presentation}/u
const PICTOGRAPH = /\p{Extended_Pictographic}/u
const ZERO = /[\p{Mn}\p{Me}\p{Cf}]/u
const REGIONAL = /[\u{1F1E6}-\u{1F1FF}]/u

/** Cells a text takes on the terminal: emoji, CJK and wide signs 2, combining marks and joiners 0. */
export function cellWidth(s: string): number {
  let width = 0
  let prev = ''
  let isJoined = false
  let isFlagOpen = false
  for (const ch of s) {
    if (ch === '️') {
      // The emoji selector widens a sign drawn narrow by default ("⚠️").
      if (PICTOGRAPH.test(prev) && !WIDE.test(prev)) width += 1
    } else if (ch === '‍') {
      isJoined = true
    } else if (ZERO.test(ch)) {
      // Combining marks sit on the letter before them.
    } else if (isJoined && PICTOGRAPH.test(ch)) {
      isJoined = false
    } else if (REGIONAL.test(ch)) {
      // Two regional letters are one flag.
      if (!isFlagOpen) width += 2
      isFlagOpen = !isFlagOpen
    } else {
      isJoined = false
      isFlagOpen = false
      width += WIDE.test(ch) ? 2 : 1
    }
    prev = ch
  }
  return width
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

/** A table drawn by the mod: cyan underlined header, zebra rows, no vertical rules, numbers to the right. */
export function renderTable(ctx: RenderCtx, table: ParsedTable, key = 'table'): RenderElement {
  const { Box, Text } = ctx.t
  const opts = inlineOpts(ctx)
  const head = table.header.map(label => plainText(parseInline(label, [], false, { deltas: false })))
  const body = table.rows.map(row => row.map(cell => parseInline(cell, [], false, opts)))
  // Numbers decide alignment as written, before a delta adds its note.
  const written = (spans: Span[]) => plainText(spans.filter(s => !s.kinds.includes('delta')))
  const columns = table.header.map((_, j) => body.map(row => row[j] ?? []))
  const natural = columns.map((cells, j) => Math.max(1, cellWidth(head[j] ?? ''), ...cells.map(c => cellWidth(plainText(c)))))
  const widths = fitColumns(natural, Math.max(1, ctx.columns - 2), GAP, MIN_WIDTH)
  const total = widths.reduce((a, w) => a + w, 0) + GAP * Math.max(0, widths.length - 1)
  const justify = columns.map((cells, j) => {
    const align = table.align[j] ?? null
    if (align === 'right' || (align === null && isNumericColumn(cells.map(written)))) return { justifyContent: 'flex-end' as const }
    return align === 'center' ? { justifyContent: 'center' as const } : {}
  })
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
