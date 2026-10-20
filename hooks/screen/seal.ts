import type { OpenTurn, Seal } from '../../types'

// Words that say the work is delivered. JS's \b knows only ASCII, so the edges are letters and digits of any script.
const CLAIM = /(?<![\p{L}\p{N}])(pront[oa]s?|feit[oa]s?|conclu[íi]d[oa]s?|terminei|implementad[oa]s?|corrigid[oa]s?|resolvid[oa]s?|funcionando|tudo verde|passam|passando|done|fixed|implemented|completed|resolved|passing|passes|tests? pass)(?![\p{L}\p{N}])/giu

// "isn't" splits into "isn" and "t": the stems stand for the contractions.
const NEGATIONS: ReadonlySet<string> = new Set([
  'não', 'nao', 'nem', 'nunca', 'not', 'never', 'no',
  'isn', 'aren', 'wasn', 'weren', 'hasn', 'haven', 'hadn', 'don', 'doesn', 'didn', 'won', 'couldn', 'shouldn',
])

/** Up to four words before a claim, within its own clause: a negation among them takes it back ("não está pronto"). */
function isNegated(before: string): boolean {
  const clause = before.split(/[.,;:!?\n]/u).pop() ?? ''
  const words = clause.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean).slice(-4)
  return words.some(w => NEGATIONS.has(w))
}

/** Whether the reply says the work is done, fixed or passing. */
export function claimsDone(answer: string): boolean {
  if (/\[!(?:FEITO|DONE)\]/i.test(answer)) return true
  for (const m of answer.matchAll(CLAIM)) if (!isNegated(answer.slice(0, m.index))) return true
  return false
}

/**
 * The turn's verdict on its own claim: tests that passed after the last edit prove it; tests that failed, or no
 * tests since an edit, do not. No claim, or nothing to prove, gives no seal.
 */
export function sealOf(turn: Pick<OpenTurn, 'hasEdits' | 'testsSinceEdit' | 'tests'>, answer: string): Seal | null {
  if (!claimsDone(answer)) return null
  const tests = turn.hasEdits ? turn.testsSinceEdit : turn.tests
  if (tests === null) return turn.hasEdits ? 'unproved' : null
  return tests.failed > 0 ? 'failing' : 'proved'
}
