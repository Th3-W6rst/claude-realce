export type DiffPiece = { text: string; isChanged: boolean }

const TOKEN = /\w+|\s+|[^\w\s]/gu

// Past these a line is a rewrite, not an edit: marking words would mark nearly all of them, at a quadratic cost.
const MAX_CHARS = 500
const MAX_TOKENS = 200

/** Adjacent pieces of the same kind as one: fewer Text runs to draw. */
function merge(pieces: readonly DiffPiece[]): DiffPiece[] {
  const out: DiffPiece[] = []
  for (const p of pieces) {
    const last = out[out.length - 1]
    if (last !== undefined && last.isChanged === p.isChanged) last.text += p.text
    else out.push({ ...p })
  }
  return out
}

/** The words a removed line and its added line do not share (longest common subsequence of tokens); null when too long. */
export function wordDiff(a: string, b: string): { removed: DiffPiece[]; added: DiffPiece[] } | null {
  if (a.length > MAX_CHARS || b.length > MAX_CHARS) return null
  const x = a.match(TOKEN) ?? []
  const y = b.match(TOKEN) ?? []
  if (x.length > MAX_TOKENS || y.length > MAX_TOKENS) return null
  // lcs[i][j]: the common length of x[i..] and y[j..].
  const lcs = Array.from({ length: x.length + 1 }, () => new Array<number>(y.length + 1).fill(0))
  for (let i = x.length - 1; i >= 0; i--) {
    for (let j = y.length - 1; j >= 0; j--) lcs[i]![j] = x[i] === y[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!)
  }
  const removed: DiffPiece[] = []
  const added: DiffPiece[] = []
  let i = 0
  let j = 0
  while (i < x.length && j < y.length) {
    if (x[i] === y[j]) {
      removed.push({ text: x[i]!, isChanged: false })
      added.push({ text: y[j]!, isChanged: false })
      i++
      j++
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) removed.push({ text: x[i++]!, isChanged: true })
    else added.push({ text: y[j++]!, isChanged: true })
  }
  while (i < x.length) removed.push({ text: x[i++]!, isChanged: true })
  while (j < y.length) added.push({ text: y[j++]!, isChanged: true })
  return { removed: merge(removed), added: merge(added) }
}
