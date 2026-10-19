import type { TestScore } from '../../types'
import { formatDecimal, formatDuration } from '../format'

// A runner's summary and where it ends in the output: the one ending last is the run's own.
type Found = { score: TestScore; at: number }

const ANSI = /\u001b\[[0-9;?]*[A-Za-z]/g

const toSeconds = (value: string, unit: string) => Number(value) * (unit === 'ms' ? 0.001 : unit === 'm' ? 60 : 1)

/** Counts like "426 passed, 2 failed" or "42 passed | 1 skipped", by the words each runner uses. */
function countWords(text: string, words: Record<string, 'passed' | 'failed' | 'skipped'>): Record<'passed' | 'failed' | 'skipped', number> {
  const counts = { passed: 0, failed: 0, skipped: 0 }
  for (const m of text.matchAll(/(\d+) ([a-z]+)/g)) {
    const kind = words[m[2]!]
    if (kind !== undefined) counts[kind] += Number(m[1])
  }
  return counts
}

const lastMatch = (text: string, re: RegExp) => [...text.matchAll(re)].pop()

function pytest(text: string): Found | null {
  const m = lastMatch(text, /^=*[ \t]*((?:\d+ (?:passed|failed|skipped|errors?|xfailed|xpassed|deselected|warnings?)(?:, )?)+) in ([\d.]+)s(?: \([^)\n]*\))?[ \t]*=*[ \t]*$/gm)
  if (m === undefined) return null
  const c = countWords(m[1]!, { passed: 'passed', xpassed: 'passed', failed: 'failed', error: 'failed', errors: 'failed', skipped: 'skipped', xfailed: 'skipped' })
  return { score: { runner: 'pytest', ...c, seconds: Number(m[2]), unit: 'testes' }, at: m.index! + m[0].length }
}

function jest(text: string): Found | null {
  const m = lastMatch(text, /^Tests:[ \t]+(.*?)\d+ total[ \t]*$/gm)
  if (m === undefined) return null
  const c = countWords(m[1]!, { passed: 'passed', failed: 'failed', skipped: 'skipped', todo: 'skipped' })
  const time = /^Time:[ \t]+([\d.]+)[ \t]*(ms|s)\b/m.exec(text.slice(m.index!))
  return { score: { runner: 'jest', ...c, ...(time ? { seconds: toSeconds(time[1]!, time[2]!) } : {}), unit: 'testes' }, at: m.index! + m[0].length }
}

function vitest(text: string): Found | null {
  const m = lastMatch(text, /^[ \t]*Tests[ \t]{2,}(.+?)[ \t]+\(\d+\)[ \t]*$/gm)
  if (m === undefined) return null
  const c = countWords(m[1]!, { passed: 'passed', failed: 'failed', skipped: 'skipped', todo: 'skipped' })
  const time = /^[ \t]*Duration[ \t]+([\d.]+)(ms|s)\b/m.exec(text.slice(m.index!))
  return { score: { runner: 'vitest', ...c, ...(time ? { seconds: toSeconds(time[1]!, time[2]!) } : {}), unit: 'testes' }, at: m.index! + m[0].length }
}

// bun test, and `claude plugin test`, which runs on it: " 16 pass\n 0 fail\nRan 16 tests across 1 file. [0.62s]".
function bun(text: string): Found | null {
  const m = lastMatch(text, /^Ran \d+ tests? across \d+ files?\. \[([\d.]+)(ms|s)\]/gm)
  if (m === undefined) return null
  const before = text.slice(0, m.index!)
  const count = (word: string) => Number(lastMatch(before, new RegExp(`^[ \\t]*(\\d+) ${word}[ \\t]*$`, 'gm'))?.[1] ?? 0)
  const score: TestScore = { runner: 'bun', passed: count('pass'), failed: count('fail'), skipped: count('skip') + count('todo'), seconds: toSeconds(m[1]!, m[2]!), unit: 'testes' }
  return { score, at: m.index! + m[0].length }
}

function mocha(text: string): Found | null {
  const m = lastMatch(text, /^[ \t]*(\d+) passing \((\d+)(ms|s|m)\)[ \t]*$/gm)
  if (m === undefined) return null
  const rest = text.slice(m.index! + m[0].length)
  const failed = /^[ \t]*(\d+) failing/m.exec(rest)
  const pending = /^[ \t]*(\d+) pending/m.exec(rest)
  const score: TestScore = { runner: 'mocha', passed: Number(m[1]), failed: Number(failed?.[1] ?? 0), skipped: Number(pending?.[1] ?? 0), seconds: toSeconds(m[2]!, m[3]!), unit: 'testes' }
  return { score, at: m.index! + m[0].length }
}

// One line per test binary (unit, integration, doc tests): the run is their sum.
function cargo(text: string): Found | null {
  const lines = [...text.matchAll(/^test result: \w+\. (\d+) passed; (\d+) failed; (\d+) ignored;.*?finished in ([\d.]+)s/gm)]
  if (lines.length === 0) return null
  const sum = (i: number) => lines.reduce((n, m) => n + Number(m[i]), 0)
  const last = lines[lines.length - 1]!
  return { score: { runner: 'cargo', passed: sum(1), failed: sum(2), skipped: sum(3), seconds: Number(sum(4).toFixed(3)), unit: 'testes' }, at: last.index! + last[0].length }
}

// go test reports packages, not tests: one "ok" or "FAIL" line each.
function goTest(text: string): Found | null {
  const lines = [...text.matchAll(/^(ok|FAIL|\?)[ \t]+\S+[ \t]+(?:[\d.]+s|\(cached\)|\[no test files\])/gm)]
  if (lines.length === 0 || lines.every(m => m[1] === '?')) return null
  const count = (word: string) => lines.filter(m => m[1] === word).length
  const last = lines[lines.length - 1]!
  return { score: { runner: 'go', passed: count('ok'), failed: count('FAIL'), skipped: count('?'), unit: 'pacotes' }, at: last.index! + last[0].length }
}

// XCTest prints one line per suite and the whole run's last.
function xctest(text: string): Found | null {
  const m = lastMatch(text, /Executed (\d+) tests?, with (?:(\d+) tests? skipped and )?(\d+) failures? \(\d+ unexpected\) in ([\d.]+) \([\d.]+\) seconds/g)
  if (m === undefined) return null
  const skipped = Number(m[2] ?? 0)
  const failed = Number(m[3])
  const score: TestScore = { runner: 'xctest', passed: Number(m[1]) - failed - skipped, failed, skipped, seconds: Number(m[4]), unit: 'testes' }
  return { score, at: m.index! + m[0].length }
}

// Swift Testing counts issues, not failed tests: those are its "✘ Test x() failed" lines.
function swiftTesting(text: string): Found | null {
  const m = lastMatch(text, /[✔✘] Test run with (\d+) tests?(?: in \d+ suites?)? (passed|failed) after ([\d.]+) seconds(?: with (\d+) issues?)?/g)
  if (m === undefined) return null
  const total = Number(m[1])
  const failedTests = new Set([...text.slice(0, m.index!).matchAll(/^.*?✘ Test (.+?) failed after/gm)].map(f => f[1]))
  const failed = m[2] === 'passed' ? 0 : Math.min(total, failedTests.size || Number(m[4] ?? 1))
  return { score: { runner: 'swift-testing', passed: total - failed, failed, skipped: 0, seconds: Number(m[3]), unit: 'testes' }, at: m.index! + m[0].length }
}

const RUNNERS = [pytest, jest, vitest, bun, mocha, cargo, goTest, xctest, swiftTesting]

/** The test summary a command printed: the last one any known runner wrote, or null for none. */
export function parseTestSummary(output: string): TestScore | null {
  const text = output.replace(ANSI, '').replace(/\r\n?/g, '\n')
  let best: Found | null = null
  for (const runner of RUNNERS) {
    const found = runner(text)
    if (found !== null && (best === null || found.at > best.at)) best = found
  }
  return best?.score ?? null
}

function formatSeconds(seconds: number): string {
  if (seconds >= 60) return formatDuration(seconds * 1000)
  return `${formatDecimal(seconds, seconds < 10 ? 2 : 1).replace(/,?0+$/, '')}s`
}

/** '✔ 426 passaram · ✖ 2 falharam · ⏭ 3 pulados · ⏱ 12,3s': skipped and time only when there are. */
export function formatScore(s: TestScore): string {
  const noun = (n: number) => (s.unit === 'pacotes' ? (n === 1 ? 'pacote ' : 'pacotes ') : '')
  const verb = (n: number, one: string, many: string) => `${n} ${noun(n)}${n === 1 ? one : many}`
  const parts = [`✔ ${verb(s.passed, 'passou', 'passaram')}`, `✖ ${verb(s.failed, 'falhou', 'falharam')}`]
  if (s.skipped > 0) parts.push(`⏭ ${verb(s.skipped, 'pulado', 'pulados')}`)
  if (s.seconds !== undefined) parts.push(`⏱ ${formatSeconds(s.seconds)}`)
  return parts.join(' · ')
}
