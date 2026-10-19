// Cutting text to the cells a band or pane gives: one cell per code point, the cut marked with '…'.

export type Segment = { text: string; color?: string }

const cells = (text: string) => [...text].length

/** `text` in at most `cols` cells, cut at the end. */
export function fitEnd(text: string, cols: number): string {
  const chars = [...text]
  if (chars.length <= cols) return text
  return cols < 1 ? '' : `${chars.slice(0, cols - 1).join('')}…`
}

/** `text` in at most `cols` cells, cut at the start: a path keeps its file name. */
export function fitStart(text: string, cols: number): string {
  const chars = [...text]
  if (chars.length <= cols) return text
  return cols < 1 ? '' : `…${chars.slice(chars.length - cols + 1).join('')}`
}

/** Colored parts of one row, cut at the end to `cols` cells. */
export function fitSegments(segments: readonly Segment[], cols: number): Segment[] {
  const total = segments.reduce((n, s) => n + cells(s.text), 0)
  if (total <= cols) return [...segments]
  const kept: Segment[] = []
  let room = cols - 1
  for (const s of segments) {
    if (room <= 0) break
    const chars = [...s.text]
    kept.push({ ...s, text: chars.slice(0, room).join('') })
    room -= Math.min(room, chars.length)
  }
  kept.push({ text: '…', ...(kept.at(-1)?.color !== undefined ? { color: kept.at(-1)!.color } : {}) })
  return kept
}

/** Word-wrapped lines of at most `cols` cells, at most `rows` of them; a cut last line ends in '…'. */
export function wrapLines(text: string, cols: number, rows: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(' ')) {
    const joined = line === '' ? word : `${line} ${word}`
    if (cells(joined) <= cols) {
      line = joined
      continue
    }
    if (line !== '') lines.push(line)
    // A word wider than the row is cut across rows.
    let rest = [...word]
    while (rest.length > cols) {
      lines.push(rest.slice(0, cols).join(''))
      rest = rest.slice(cols)
    }
    line = rest.join('')
  }
  if (line !== '') lines.push(line)
  if (lines.length <= rows) return lines
  const kept = lines.slice(0, rows)
  kept[rows - 1] = `${[...kept[rows - 1]!].slice(0, cols - 1).join('')}…`
  return kept
}
