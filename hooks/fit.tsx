import type { Elements, RenderElement } from 'claude-code'

// Cutting text to the cells a row gives, measured as the terminal draws them (a CJK letter or an emoji takes two),
// the cut marked with '…'.

export type Segment = { text: string; color?: string }

const ASCII = /^[\x20-\x7e]*$/
const WIDE =
  /[ᄀ-ᅟ⺀-〾ぁ-㏿㐀-䶿一-鿿ꀀ-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦\u{20000}-\u{3FFFD}]|\p{Emoji_Presentation}/u
const PICTOGRAPH = /\p{Extended_Pictographic}/u
const ZERO = /[\p{Mn}\p{Me}\p{Cf}]/u
const REGIONAL = /[\u{1F1E6}-\u{1F1FF}]/u

/** Each character of `text` with the cells drawn up to and including it, emoji sequences and flags joined. */
function* cellSteps(text: string): Generator<readonly [string, number]> {
  let width = 0
  let prev = ''
  let isJoined = false
  let isFlagOpen = false
  for (const ch of text) {
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
    yield [ch, width]
  }
}

/** Cells a text takes on the terminal: emoji, CJK and wide signs 2, combining marks and joiners 0. */
export function cellWidth(text: string): number {
  if (ASCII.test(text)) return text.length
  let width = 0
  for (const [, w] of cellSteps(text)) width = w
  return width
}

/** The longest start of `text` that takes at most `cols` cells. */
function headOf(text: string, cols: number): string {
  if (ASCII.test(text)) return text.slice(0, Math.max(0, cols))
  let head = ''
  for (const [ch, width] of cellSteps(text)) {
    if (width > cols) break
    head += ch
  }
  return head
}

/** `text` in at most `cols` cells, cut at the end. */
export function fitEnd(text: string, cols: number): string {
  if (cellWidth(text) <= cols) return text
  return cols < 1 ? '' : `${headOf(text, cols - 1).trimEnd()}…`
}

/** `text` in at most `cols` cells, cut at the start: a path keeps its file name. */
export function fitStart(text: string, cols: number): string {
  if (cellWidth(text) <= cols) return text
  if (cols < 1) return ''
  const chars = [...text]
  for (let i = 1; i < chars.length; i++) {
    const tail = chars.slice(i).join('')
    if (cellWidth(tail) <= cols - 1) return `…${tail}`
  }
  return '…'
}

/** Colored parts of one row, cut at the end to `cols` cells. */
export function fitSegments(segments: readonly Segment[], cols: number): Segment[] {
  const total = segments.reduce((n, s) => n + cellWidth(s.text), 0)
  if (total <= cols) return [...segments]
  const kept: Segment[] = []
  let room = cols - 1
  for (const s of segments) {
    if (room <= 0) break
    const head = headOf(s.text, room)
    kept.push({ ...s, text: head })
    // A part cut short ends the row, even when a wide sign left a cell over.
    room = head.length < s.text.length ? 0 : room - cellWidth(head)
  }
  kept.push({ text: '…', ...(kept.at(-1)?.color !== undefined ? { color: kept.at(-1)!.color } : {}) })
  return kept
}

/** Colored parts drawn as one row cut to `cols` cells. */
export function segmentRow(t: Pick<Elements['terminal'], 'Text'>, segments: readonly Segment[], cols: number): RenderElement {
  const { Text } = t
  return (
    <Text wrap="truncate-end">
      {fitSegments(segments, cols).map(s => (s.color === undefined ? s.text : <Text color={s.color}>{s.text}</Text>))}
    </Text>
  )
}

/** Word-wrapped lines of at most `cols` cells, at most `rows` of them; a cut last line ends in '…'. */
export function wrapLines(text: string, cols: number, rows: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(' ')) {
    const joined = line === '' ? word : `${line} ${word}`
    if (cellWidth(joined) <= cols) {
      line = joined
      continue
    }
    if (line !== '') lines.push(line)
    // A word wider than the row is cut across rows; a sign wider than the whole row goes on one by itself.
    let rest = word
    while (cellWidth(rest) > cols) {
      const head = headOf(rest, cols) || [...rest][0]!
      lines.push(head)
      rest = rest.slice(head.length)
    }
    line = rest
  }
  if (line !== '') lines.push(line)
  if (lines.length <= rows) return lines
  const kept = lines.slice(0, rows)
  kept[rows - 1] = `${headOf(kept[rows - 1]!, cols - 1)}…`
  return kept
}
