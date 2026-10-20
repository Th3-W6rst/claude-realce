import { atom, read } from 'claude-code'
import type { On } from 'claude-code'

import { tr } from '../i18n'
import type { AgentRow, ExplainPanel, FileTouch, Pin, PlanItem, TimelineRow, UsageReading } from '../../types'
import { usageLine } from './limits'
import { closeExplanation } from './explain'
import { pathHref } from '../code/links'
import { cachedEnv } from '../env'
import { formatClock } from '../format'
import { SCREEN, type ScreenTone } from '../palette'
import { fitEnd, fitStart, segmentRow, type Segment } from '../fit'
import type { SESSION_PANE } from './paneToggle'
import { timed } from '../perf'
import { getFlags } from '../flags'
import { agentStatus } from '../screen/agentCard'
import { explanationFor } from '../screen/notes'
import { shortPath } from '../screen/toolInfo'
import { scrollToRow, timelineText } from './timeline'

const PENDING = atom({ plugin: 'realce', key: 'pending' } as const, null)
const PLAN = atom({ plugin: 'realce', key: 'plan' } as const, [])
const FILES = atom({ plugin: 'realce', key: 'files' } as const, [])
const FAILURES = atom({ plugin: 'realce', key: 'failures' } as const, [])
const AGENTS = atom({ plugin: 'realce', key: 'agents' } as const, [])
const TIMELINE = atom({ plugin: 'realce', key: 'timeline' } as const, [])
const EXPLAIN = atom({ plugin: 'realce', key: 'explain' } as const, null)
const PINS = atom({ plugin: 'realce', key: 'pins' } as const, [])
const USAGE = atom({ plugin: 'realce', key: 'usage' } as const, null)

// A literal, so the module scan can name the pane's matcher; the type ties it to the toggle's id.
const PANE_ID: typeof SESSION_PANE = 'realce-sessao'

const MAX_FILES = 12
const MAX_FAILURES = 5
const MAX_TURNS = 20
const ACTIVE_AGENT = new Set(['running', 'pending', 'waiting'])

const PLAN_MARK: Record<PlanItem['status'], { glyph: string; tone: ScreenTone }> = {
  completed: { glyph: '✓', tone: 'ok' },
  in_progress: { glyph: '▸', tone: 'plan' },
  pending: { glyph: '○', tone: 'dim' },
}

function fileSegments(f: FileTouch, cwd: string | null, cols: number): Segment[] {
  const counts = ` +${f.added} −${f.removed}`
  return [
    { text: fitStart(shortPath(f.path, cwd), Math.max(1, cols - counts.length)) },
    { text: ' ' },
    { text: `+${f.added}`, color: SCREEN.ok },
    { text: ' ' },
    { text: `−${f.removed}`, color: SCREEN.bad },
  ]
}

function agentSegments(a: AgentRow, tzOffsetMinutes: number | undefined): Segment[] {
  const status = agentStatus(a.status)
  const segments: Segment[] = [
    { text: '◆ ', color: SCREEN.agent },
    { text: a.description },
    { text: ` · ${a.type} · `, color: SCREEN.dim },
    { text: status.label, color: SCREEN[status.tone] },
  ]
  // Since when, not for how long: a clock time stays true without redrawing the pane every second.
  if (tzOffsetMinutes !== undefined) segments.push({ text: tr(` · since ${formatClock(a.firstSeenAt, tzOffsetMinutes)}`, ` · desde ${formatClock(a.firstSeenAt, tzOffsetMinutes)}`), color: SCREEN.dim })
  return segments
}

export function registerSessionPane(on: On): void {
  on('ui.render', { component: 'Pane', requestId: PANE_ID }, async ($, e) => timed('Pane:sessao', async () => {
    const { Box, Text, Button, Link } = $.ui.resolve(e)
    const cols = e.props.bodyColumns
    const flags = await getFlags($)
    // The env and the failures' sentences come from the module: each change of them redraws the screen.
    const env = cachedEnv()
    const [pending, plan, files, failures, agents, timeline, explain, pins, usage] = await Promise.all([
      read($, PENDING),
      read($, PLAN),
      read($, FILES),
      read($, FAILURES),
      read($, AGENTS),
      flags.linha ? read($, TIMELINE) : Promise.resolve([] as TimelineRow[]),
      flags.explica ? read($, EXPLAIN) : Promise.resolve(null as ExplainPanel | null),
      flags.fixar ? read($, PINS) : Promise.resolve([] as Pin[]),
      flags.limite ? read($, USAGE) : Promise.resolve(null as UsageReading | null),
    ])
    const items = pending?.items ?? []
    if (plan.length + items.length + files.length + failures.length + agents.length + timeline.length + pins.length === 0 && explain === null && usage === null) {
      return <Text dimColor>{tr('Nothing here yet.', 'Nada por aqui ainda.')}</Text>
    }
    const t = $.ui.resolve(e)
    const row = (segments: readonly Segment[]) => segmentRow(t, segments, cols)
    const heading = (title: string) => <Text color={SCREEN.plan}>{fitEnd(title, cols)}</Text>
    const done = plan.filter(p => p.status === 'completed').length
    const sorted = [...agents].sort((a, b) => Number(ACTIVE_AGENT.has(b.status)) - Number(ACTIVE_AGENT.has(a.status)))
    return (
      <Box flexDirection="column" width={cols}>
        {usage !== null && usageLine(usage).length > 0 && (
          <Box flexDirection="column" marginBottom={1}>
            {heading(tr('Usage', 'Uso'))}
            {row(usageLine(usage))}
          </Box>
        )}
        {explain !== null && (
          <Box flexDirection="column" marginBottom={1}>
            <Box flexDirection="row" width={cols}>
              <Box flexGrow={1}>{heading(tr('Explanation', 'Explicação'))}</Box>
              <Button plain key="close-explain" dimColor onPress={() => void closeExplanation($)}>
                {tr('Close', 'Fechar')}
              </Button>
            </Box>
            <Text dimColor wrap="truncate-end">{fitEnd(`“${explain.excerpt.replace(/\s+/g, ' ')}”`, cols)}</Text>
            {explain.status === 'pending' ? (
              <Text dimColor>{tr('Explaining…', 'Explicando…')}</Text>
            ) : explain.status === 'failed' ? (
              <Text dimColor>{tr(`No explanation: ${explain.text}`, `Sem explicação: ${explain.text}`)}</Text>
            ) : (
              <Text>{explain.text}</Text>
            )}
          </Box>
        )}
        {plan.length > 0 && (
          <Box flexDirection="column" marginBottom={1}>
            {heading(`${tr('Plan', 'Plano')} ${done}/${plan.length}`)}
            {plan.map(p => {
              const mark = PLAN_MARK[p.status]
              const text = p.status === 'in_progress' ? (p.activeForm ?? p.text) : p.text
              return row([{ text: `${mark.glyph} `, color: SCREEN[mark.tone] }, { text, ...(p.status === 'completed' ? { color: SCREEN.dim } : {}) }])
            })}
          </Box>
        )}
        {items.length > 0 && (
          <Box flexDirection="column" marginBottom={1}>
            {heading(tr('Needs you', 'Precisa de você'))}
            {items.map(item => row([{ text: `• ${item}`, color: SCREEN.warn }]))}
          </Box>
        )}
        {pins.length > 0 && (
          <Box flexDirection="column" marginBottom={1}>
            {heading(`${tr('Pinned', 'Fixadas')} (${pins.length})`)}
            {[...pins].reverse().map(p => (
              <Button plain key={`pin-${p.requestId}`} dimColor onPress={() => void scrollToRow($, p.requestId)}>
                {fitEnd(env === null ? p.preview : `${formatClock(p.at, env.tzOffsetMinutes)} · ${p.preview}`, cols)}
              </Button>
            ))}
          </Box>
        )}
        {timeline.length > 0 && (
          <Box flexDirection="column" marginBottom={1}>
            {heading(`${tr('Turns', 'Turnos')} (${timeline.length})`)}
            {timeline
              .slice(-MAX_TURNS)
              .reverse()
              .map(r => (
                <Button plain key={`turn-${r.requestId}`} dimColor onPress={() => void scrollToRow($, r.requestId)}>
                  {fitEnd(timelineText(r, env?.tzOffsetMinutes), cols)}
                </Button>
              ))}
          </Box>
        )}
        {files.length > 0 && (
          <Box flexDirection="column" marginBottom={1}>
            {heading(`${tr('Files', 'Arquivos')} (${files.length})`)}
            {files
              .slice(-MAX_FILES)
              .reverse()
              .map(f => (flags.caminhos && env !== null ? <Link href={pathHref(f.path, env)}>{row(fileSegments(f, env.cwd, cols))}</Link> : row(fileSegments(f, env?.cwd ?? null, cols))))}
          </Box>
        )}
        {failures.length > 0 && (
          <Box flexDirection="column" marginBottom={1}>
            {heading(`${tr('Failures', 'Falhas')} (${failures.length})`)}
            {failures.slice(-MAX_FAILURES).reverse().map(f => {
              const why = flags.erros && f.toolUseId !== undefined ? explanationFor(f.toolUseId) : null
              return (
                <Box flexDirection="column">
                  {f.toolUseId === undefined ? (
                    <Text color={SCREEN.bad} wrap="truncate-end">
                      {fitEnd(f.command, cols)}
                    </Text>
                  ) : (
                    <Button plain key={`fail-${f.toolUseId}`} onPress={() => void scrollToRow($, f.toolUseId!)}>
                      <Text color={SCREEN.bad}>{fitEnd(f.command.split('\n')[0] ?? '', cols)}</Text>
                    </Button>
                  )}
                  <Box paddingLeft={2}>
                    <Text dimColor wrap="truncate-end">
                      {fitEnd(f.line, cols - 2)}
                    </Text>
                  </Box>
                  {why?.status === 'ready' && (
                    // The sentence wraps: it is what to do next, worth its lines.
                    <Box key={`why-${f.toolUseId}`} paddingLeft={2}>
                      <Text color={SCREEN.warn}>{`↳ ${why.text}`}</Text>
                    </Box>
                  )}
                </Box>
              )
            })}
          </Box>
        )}
        {agents.length > 0 && (
          <Box flexDirection="column">
            {heading(`${tr('Agents', 'Agentes')} (${agents.length})`)}
            {sorted.map(a => row(agentSegments(a, env?.tzOffsetMinutes)))}
          </Box>
        )}
      </Box>
    )
  }))
}
