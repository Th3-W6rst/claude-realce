const MAX_PENDING = 6

const FENCE = /^\s*(```|~~~)/
const INLINE_CODE = /`[^`\n]*`/g
const ATTENTION = /\{!(.+?)!\}/g
const DECISION = /^\s*>\s*\[!(?:decisão|decisao|decision)\][+-]?\s*(.*)$/iu
const QUOTED = /^\s*>\s?(.*)$/
// Typed marks and bold inside a callout title are emphasis, not part of what is asked.
const MARKS = /\{[+\-!]|[+\-!]\}|==|\*\*/g

const clean = (text: string) => text.replace(MARKS, '').replace(/\s+/g, ' ').trim()

/** What a reply asks of the person: its `{!…!}` spans and the titles of its decision callouts, in reading order. */
export function extractPending(answer: string): string[] {
  const found: string[] = []
  const lines = answer.split('\n')
  let isInFence = false
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    if (FENCE.test(line)) {
      isInFence = !isInFence
      continue
    }
    if (isInFence) continue
    const prose = line.replace(INLINE_CODE, '')
    const decision = DECISION.exec(prose)
    if (decision !== null) {
      // An untitled decision is asked by its first line.
      const title = decision[1]!.trim() !== '' ? decision[1]! : (QUOTED.exec(lines[i + 1] ?? '')?.[1] ?? '')
      found.push(clean(title))
      continue
    }
    for (const m of prose.matchAll(ATTENTION)) found.push(clean(m[1]!))
  }
  return [...new Set(found.filter(item => item !== ''))].slice(0, MAX_PENDING)
}
