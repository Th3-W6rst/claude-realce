const MAX_PENDING = 6

const FENCE = /^\s*(```|~~~)/
const INLINE_CODE = /`[^`\n]*`/g
const ATTENTION = /\{!(.+?)!\}/g
const DECISION = /^\s*>\s*\[!(?:decisão|decisao|decision)\][+-]?\s*(.*)$/iu
const QUOTED = /^\s*>\s?(.*)$/
// Typed marks and bold inside a callout title are emphasis, not part of what is asked.
const MARKS = /\{[+\-!]|[+\-!]\}|==|\*\*/g

// Code spans are held out of the matching (a `{!x!}` quoted as code asks nothing) and come back as their text.
const HELD = /\uE000(\d+)\uE001/g

function holdCode(line: string): { prose: string; codes: string[] } {
  const codes: string[] = []
  const prose = line.replace(INLINE_CODE, code => `\uE000${codes.push(code.slice(1, -1)) - 1}\uE001`)
  return { prose, codes }
}

const clean = (text: string, codes: readonly string[]) =>
  text.replace(MARKS, '').replace(HELD, (_, n: string) => codes[Number(n)] ?? '').replace(/\s+/g, ' ').trim()

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
    const { prose, codes } = holdCode(line)
    const decision = DECISION.exec(prose)
    if (decision !== null) {
      if (decision[1]!.trim() !== '') found.push(clean(decision[1]!, codes))
      else {
        // An untitled decision is asked by its first line.
        const next = holdCode(lines[i + 1] ?? '')
        found.push(clean(QUOTED.exec(next.prose)?.[1] ?? '', next.codes))
      }
      continue
    }
    for (const m of prose.matchAll(ATTENTION)) found.push(clean(m[1]!, codes))
  }
  return [...new Set(found.filter(item => item !== ''))].slice(0, MAX_PENDING)
}
