import { atom, read } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { Failure, FileTouch, TimelineRow } from '../../types'
import { getFlags } from '../flags'
import { tr } from '../i18n'
import { formatClock, formatDuration, plural, testCount } from '../format'
import { allCommits, explanationFor } from '../screen/notes'
import { shortPath } from '../screen/toolInfo'
import { sealLabel } from '../screen/turns'
import { copyText } from '../io'

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
  // The session keeps the last 50 turns and 20 failures: past that the report says it shows the latest.
  isTimelineFull?: boolean
  isFailuresFull?: boolean
  // The Haiku's sentence for the last failure, once it came back.
  lastWhy?: string
}

/** A command as one inline-code run: its first line, and no backtick that would close the run early. */
const inlineCode = (text: string) => {
  const lines = text.trim().split('\n')
  return `\`${(lines[0] ?? '').replace(/`/g, 'ˋ')}${lines.length > 1 ? '…' : ''}\``
}

/** The session in markdown, ready to paste into a PR or a report: turns and their seals, tests, files, git, failures. */
export function reportText(r: ReportInput): string {
  const title = tr('## Session summary', '## Resumo da sessão')
  if (r.timeline.length + r.files.length + r.commits.length + r.failures.length === 0) {
    return `${title}\n\n${tr('Nothing happened in this session yet.', 'Nada aconteceu ainda nesta sessão.')}`
  }
  const first = r.timeline[0]
  const last = r.timeline[r.timeline.length - 1]
  const span = first === undefined || last === undefined ? '' : ` (${formatClock(first.at, r.tzOffsetMinutes)}–${formatClock(last.at + (last.durationMs ?? 0), r.tzOffsetMinutes)})`
  const lines = [`${title}${span}`, '']
  if (r.timeline.length > 0) {
    const count = (seal: TimelineRow['seal']) => r.timeline.filter(t => t.seal === seal).length
    const seals = [
      count('proved') > 0 ? `✔ ${plural(count('proved'), tr('proved', 'provado'), tr('proved', 'provados'))}` : null,
      count('unproved') > 0 ? `⚠ ${count('unproved')} ${tr('without proof', 'sem prova')}` : null,
      count('failing') > 0 ? `✖ ${count('failing')} ${tr('with tests failing', 'com testes falhando')}` : null,
    ].filter((s): s is string => s !== null)
    const turns = r.isTimelineFull === true ? tr(`the last ${r.timeline.length}`, `os últimos ${r.timeline.length}`) : r.timeline.length
    lines.push(`- **${tr('Turns', 'Turnos')}:** ${turns}${seals.length === 0 ? '' : ` (${seals.join(' · ')})`}`)
    // The last ten prompts, each with its verdict: what was asked, at a glance.
    for (const t of r.timeline.slice(-MAX_TURNS)) {
      const seal = sealLabel(t.seal)
      // The pane's own row: time, how long it took (none while it runs), what was asked, the verdict.
      const took = t.durationMs === null ? '' : ` · ${formatDuration(t.durationMs)}`
      lines.push(`  - ${formatClock(t.at, r.tzOffsetMinutes)}${took} · ${t.prompt}${seal === null ? '' : ` · ${seal.text}`}`)
    }
    const tests = [...r.timeline].reverse().find(t => t.tests !== null)?.tests
    if (tests !== undefined && tests !== null) {
      const score = tests.failed === 0 ? `✔ ${testCount(tests.passed, tests.unit)}` : `✖ ${plural(tests.failed, tr('test failed', 'teste falhou'), tr('tests failed', 'testes falharam'))}`
      lines.push(`- **${tr('Tests', 'Testes')}:** ${tr('last score', 'último placar')} ${score}`)
    }
  }
  if (r.files.length > 0) {
    const added = r.files.reduce((n, f) => n + f.added, 0)
    const removed = r.files.reduce((n, f) => n + f.removed, 0)
    lines.push(`- **${tr('Files', 'Arquivos')}:** ${r.files.length} (+${added} −${removed})`)
    for (const f of r.files) lines.push(`  - \`${shortPath(f.path, r.cwd)}\` +${f.added} −${f.removed}`)
  }
  if (r.commits.length > 0) lines.push(`- **Git:** ${r.commits.join(' · ')}`)
  if (r.failures.length > 0) {
    const f = r.failures[r.failures.length - 1]!
    const count = r.isFailuresFull === true ? tr(`the last ${r.failures.length}`, `as últimas ${r.failures.length}`) : r.failures.length
    lines.push(`- **${tr('Failures', 'Falhas')}:** ${count} (${tr('last', 'última')}: ${inlineCode(f.command)} → ${f.line.replace(/`/g, 'ˋ')})`)
    if (r.lastWhy !== undefined) lines.push(`  - ${tr('Why', 'Por quê')}: ${r.lastWhy}`)
  }
  return lines.join('\n')
}

/** `/realce summary` (`resumo`): the report shown, and on the clipboard. */
export async function reportCommand($: EngineInterface, cwd: string, tzOffsetMinutes: number): Promise<string> {
  const [timeline, files, failures] = await Promise.all([read($, TIMELINE), read($, FILES), read($, FAILURES)])
  // The why follows the erros flag, as the pane's does.
  const lastId = (await getFlags($)).erros ? failures[failures.length - 1]?.toolUseId : undefined
  const why = lastId === undefined ? null : explanationFor(lastId)
  const text = reportText({
    timeline, files, commits: allCommits(), failures, cwd, tzOffsetMinutes, isTimelineFull: timeline.length >= 50, isFailuresFull: failures.length >= 20,
    ...(why?.status === 'ready' ? { lastWhy: why.text } : {}),
  })
  const copied = await copyText($, { text })
  // The clipboard takes the markdown; the transcript shows it as text, where the marks would print as written.
  const plain = text.replace(/\*\*/g, '').replace(/`/g, '').replace(/^## /gm, '')
  const said = copied.isCopied ? tr('Summary copied as markdown.', 'Resumo copiado em markdown.') : tr(`Could not copy (${copied.reason}).`, `Não deu para copiar (${copied.reason}).`)
  return `${said}\n\n${plain}`
}
