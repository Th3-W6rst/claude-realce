import { atom, read } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { Failure, FileTouch, TimelineRow } from '../../types'
import { formatClock, plural, testCount } from '../format'
import { allCommits } from '../screen/notes'
import { shortPath } from '../screen/toolInfo'
import { sealLabel } from '../screen/turns'

const TIMELINE = atom({ plugin: 'realce', key: 'timeline' } as const, [])
const FILES = atom({ plugin: 'realce', key: 'files' } as const, [])
const FAILURES = atom({ plugin: 'realce', key: 'failures' } as const, [])

const MAX_TURNS = 10

export type ReportInput = {
  timeline: readonly TimelineRow[]
  files: readonly FileTouch[]
  commits: readonly string[]
  failures: readonly Failure[]
  cwd: string
  tzOffsetMinutes: number
}

/** The session in markdown, ready to paste into a PR or a report: turns and their seals, tests, files, git, failures. */
export function reportText(r: ReportInput): string {
  if (r.timeline.length + r.files.length + r.commits.length + r.failures.length === 0) return '## Resumo da sessão\n\nNada aconteceu ainda nesta sessão.'
  const first = r.timeline[0]
  const last = r.timeline[r.timeline.length - 1]
  const span = first === undefined || last === undefined ? '' : ` (${formatClock(first.at, r.tzOffsetMinutes)}–${formatClock(last.at + (last.durationMs ?? 0), r.tzOffsetMinutes)})`
  const lines = [`## Resumo da sessão${span}`, '']
  if (r.timeline.length > 0) {
    const count = (seal: TimelineRow['seal']) => r.timeline.filter(t => t.seal === seal).length
    const seals = [
      count('proved') > 0 ? `✔ ${plural(count('proved'), 'provado', 'provados')}` : null,
      count('unproved') > 0 ? `⚠ ${count('unproved')} sem prova` : null,
      count('failing') > 0 ? `✖ ${count('failing')} com testes falhando` : null,
    ].filter((s): s is string => s !== null)
    lines.push(`- **Turnos:** ${r.timeline.length}${seals.length === 0 ? '' : ` (${seals.join(' · ')})`}`)
    // The last ten prompts, each with its verdict: what was asked, at a glance.
    for (const t of r.timeline.slice(-MAX_TURNS)) {
      const seal = sealLabel(t.seal)
      lines.push(`  - ${formatClock(t.at, r.tzOffsetMinutes)} · ${t.prompt}${seal === null ? '' : ` · ${seal.text}`}`)
    }
    const tests = [...r.timeline].reverse().find(t => t.tests !== null)?.tests
    if (tests !== undefined && tests !== null) {
      lines.push(`- **Testes:** último placar ${tests.failed === 0 ? `✔ ${testCount(tests.passed, tests.unit)}` : `✖ ${plural(tests.failed, 'teste falhou', 'testes falharam')}`}`)
    }
  }
  if (r.files.length > 0) {
    const added = r.files.reduce((n, f) => n + f.added, 0)
    const removed = r.files.reduce((n, f) => n + f.removed, 0)
    lines.push(`- **Arquivos:** ${r.files.length} (+${added} −${removed})`)
    for (const f of r.files) lines.push(`  - \`${shortPath(f.path, r.cwd)}\` +${f.added} −${f.removed}`)
  }
  if (r.commits.length > 0) lines.push(`- **Git:** ${r.commits.join(' · ')}`)
  if (r.failures.length > 0) {
    const f = r.failures[r.failures.length - 1]!
    lines.push(`- **Falhas:** ${r.failures.length} (última: \`${f.command}\` → ${f.line})`)
  }
  return lines.join('\n')
}

/** `/realce resumo`: the report shown, and on the clipboard. */
export async function reportCommand($: EngineInterface, cwd: string, tzOffsetMinutes: number): Promise<string> {
  const [timeline, files, failures] = await Promise.all([read($, TIMELINE), read($, FILES), read($, FAILURES)])
  const text = reportText({ timeline, files, commits: allCommits(), failures, cwd, tzOffsetMinutes })
  const copied = await $.ui.copy({ text })
  return `${copied.isCopied ? 'Resumo copiado.' : `Não deu para copiar (${copied.reason}).`}\n\n${text}`
}
