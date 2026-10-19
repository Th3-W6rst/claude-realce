// The block structure of a reply: just enough markdown to lay prose out the way
// the engine does (paragraphs, headings, lists, quotes, callouts, fences, tables, rules).

import type { CalloutKind } from '../palette'

export type { CalloutKind }

export type Block = { hasGapBefore: boolean } & (
  // `indent`: the columns of the list item an indented paragraph continues (absent at the top level).
  | { type: 'paragraph'; lines: string[]; indent?: number }
  | { type: 'heading'; level: number; text: string }
  | { type: 'item'; depth: number; marker: string; isOrdered: boolean; check: boolean | null; lines: string[] }
  | { type: 'quote'; lines: string[] }
  // `raw`: the quote as written, `[!TIPO]` line included, drawn as is with callouts off.
  | { type: 'callout'; kind: CalloutKind; title: string; lines: string[]; raw: string[] }
  | { type: 'code'; language: string; source: string }
  | { type: 'table'; text: string }
  | { type: 'rule' }
)

const FENCE = /^(\s*)(`{3,}|~{3,})\s*([^\s`]*)/
const HEADING = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/
const RULE = /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/
const ITEM = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/
const QUOTE = /^\s{0,3}>\s?(.*)$/
const TABLE_ROW = /^\s*\|.*\|\s*$/
const TABLE_RULE = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/
const CALLOUT_TAG = /^\[!(\p{L}+)\][ \t]*(.*)$/u

const CALLOUT_TAGS: Record<string, CalloutKind> = {
  DECISAO: 'decision', DECISION: 'decision',
  RISCO: 'risk', RISK: 'risk', WARNING: 'risk', CAUTION: 'risk',
  FEITO: 'done', DONE: 'done', SUCCESS: 'done',
  RESUMO: 'summary', SUMMARY: 'summary', TLDR: 'summary',
  NOTA: 'note', NOTE: 'note', INFO: 'note',
  DICA: 'tip', TIP: 'tip',
}

/** The kind a `[!TIPO]` tag names, in Portuguese or English, any case, accents optional; null for any other. */
export function calloutKind(tag: string): CalloutKind | null {
  return CALLOUT_TAGS[tag.normalize('NFD').replace(/\p{M}/gu, '').toUpperCase()] ?? null
}

const startsBlock = (line: string) =>
  FENCE.test(line) || HEADING.test(line) || RULE.test(line) || ITEM.test(line) || QUOTE.test(line) || TABLE_ROW.test(line)

export function parseBlocks(text: string): Block[] {
  const lines = text.split('\n')
  const blocks: Block[] = []
  // Indents of the open list levels, so a deeper marker nests and a shallower one pops.
  let listIndents: number[] = []
  // Where the last list item's text starts, for an indented paragraph that continues it after a blank line.
  let itemColumn: number | null = null
  let gap = false
  let i = 0
  const add = (b: Block) => {
    blocks.push(b)
    gap = false
  }

  while (i < lines.length) {
    const line = lines[i]!
    if (line.trim() === '') {
      gap = blocks.length > 0
      i++
      continue
    }

    const fence = FENCE.exec(line)
    if (fence) {
      const [, , ticks = '```', language = ''] = fence
      const body: string[] = []
      i++
      // An unclosed fence (a reply still streaming) runs to the end.
      while (i < lines.length && !new RegExp(`^\\s*${ticks[0] === '`' ? '`' : '~'}{${ticks.length},}\\s*$`).test(lines[i]!)) {
        body.push(lines[i]!)
        i++
      }
      i++
      add({ type: 'code', language, source: body.join('\n'), hasGapBefore: gap })
      listIndents = []
      continue
    }

    const heading = HEADING.exec(line)
    if (heading) {
      add({ type: 'heading', level: heading[1]!.length, text: heading[2]!, hasGapBefore: gap })
      listIndents = []
      i++
      continue
    }

    // A rule before an item: "- - -" and "***" are rules, not bullets.
    if (RULE.test(line)) {
      add({ type: 'rule', hasGapBefore: gap })
      listIndents = []
      i++
      continue
    }

    if (TABLE_ROW.test(line) && i + 1 < lines.length && TABLE_RULE.test(lines[i + 1]!)) {
      const rows: string[] = []
      while (i < lines.length && TABLE_ROW.test(lines[i]!)) rows.push(lines[i++]!)
      add({ type: 'table', text: rows.join('\n'), hasGapBefore: gap })
      listIndents = []
      continue
    }

    const quote = QUOTE.exec(line)
    if (quote) {
      const body: string[] = []
      while (i < lines.length) {
        const q = QUOTE.exec(lines[i]!)
        if (!q) break
        body.push(q[1]!)
        i++
      }
      // An unknown or unfinished tag ("[!DECIS" mid-stream) leaves the quote as written.
      const tag = CALLOUT_TAG.exec(body[0]!)
      const kind = tag ? calloutKind(tag[1]!) : null
      if (tag && kind !== null) add({ type: 'callout', kind, title: tag[2]!.trim(), lines: body.slice(1), raw: body, hasGapBefore: gap })
      else add({ type: 'quote', lines: body, hasGapBefore: gap })
      continue
    }

    const item = ITEM.exec(line)
    if (item) {
      const indent = item[1]!.length
      while (listIndents.length > 0 && indent < listIndents[listIndents.length - 1]!) listIndents.pop()
      if (listIndents.length === 0 || indent > listIndents[listIndents.length - 1]!) listIndents.push(indent)
      let content = item[3]!
      const task = /^\[([ xX])\]\s+(.*)$/.exec(content)
      if (task) content = task[2]!
      const marker = item[2]!
      const body = [content]
      i++
      // Continuation: any following line that starts nothing new, indented or lazy.
      while (i < lines.length && lines[i]!.trim() !== '' && !startsBlock(lines[i]!)) {
        body.push(lines[i]!.trim())
        i++
      }
      itemColumn = (listIndents.length - 1) * 2 + marker.length + 1
      add({
        type: 'item',
        depth: listIndents.length - 1,
        marker,
        isOrdered: /\d/.test(marker),
        check: task ? task[1] !== ' ' : null,
        lines: body,
        hasGapBefore: gap,
      })
      continue
    }

    const body = [line]
    i++
    while (i < lines.length && lines[i]!.trim() !== '' && !startsBlock(lines[i]!)) body.push(lines[i++]!)
    const continuesItem = itemColumn !== null && listIndents.length > 0 && leading(line) >= 2
    add({ type: 'paragraph', lines: body.map(l => l.trim()), ...(continuesItem ? { indent: itemColumn! } : {}), hasGapBefore: gap })
    if (leading(line) === 0) {
      listIndents = []
      itemColumn = null
    }
  }
  return blocks
}

const leading = (line: string) => line.length - line.trimStart().length
