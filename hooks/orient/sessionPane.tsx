import { atom, read } from 'claude-code'
import type { On } from 'claude-code'

import type { AgentRow, ExplainPanel, FileTouch, Pin, PlanItem, TimelineRow, UsageReading } from '../../types'
import { usageLine } from './limits'
import { formatClock } from '../format'
import { SCREEN, type ScreenTone } from '../palette'
import { fitEnd, fitSegments, fitStart, type Segment } from './fit'
import type { SESSION_PANE } from './paneToggle'
import { timed } from '../perf'
import { getFlags } from '../flags'
import { scrollToRow, timelineText } from './timeline'

const PENDING = atom({ plugin: 'realce', key: 'pending' } as const, null)
const PLAN = atom({ plugin: 'realce', key: 'plan' } as const, [])
const FILES = atom({ plugin: 'realce', key: 'files' } as const, [])
const FAILURES = atom({ plugin: 'realce', key: 'failures' } as const, [])
const AGENTS = atom({ plugin: 'realce', key: 'agents' } as const, [])
const ENV = atom({ plugin: 'realce', key: 'env' } as const, null)
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

const AGENT_STATUS: Record<string, { label: string; tone: ScreenTone }> = {
  running: { label: 'Rodando', tone: 'run' },
  pending: { label: 'Na fila', tone: 'dim' },
  waiting: { label: 'Aguardando', tone: 'warn' },
  idle: { label: 'Ocioso', tone: 'dim' },
  completed: { label: 'Concluído', tone: 'ok' },
  failed: { label: 'Falhou', tone: 'bad' },
  killed: { label: 'Parado', tone: 'warn' },
}

const relative = (path: string, cwd: string | undefined) =>
  cwd !== undefined && path.startsWith(`${cwd}/`) ? path.slice(cwd.length + 1) : path

function fileSegments(f: FileTouch, cwd: string | undefined, cols: number): Segment[] {
  const counts = ` +${f.added} −${f.removed}`
  return [
    { text: fitStart(relative(f.path, cwd), Math.max(1, cols - [...counts].length)) },
    { text: ' ' },
    { text: `+${f.added}`, color: SCREEN.ok },
    { text: ' ' },
    { text: `−${f.removed}`, color: SCREEN.bad },
  ]
}

function agentSegments(a: AgentRow, tzOffsetMinutes: number | undefined): Segment[] {
  const status = AGENT_STATUS[a.status] ?? { label: a.status, tone: 'dim' }
  const segments: Segment[] = [
    { text: '◆ ', color: SCREEN.agent },
    { text: a.description },
    { text: ` · ${a.type} · `, color: SCREEN.dim },
    { text: status.label, color: SCREEN[status.tone] },
  ]
  // Since when, not for how long: a clock time stays true without redrawing the pane every second.
  if (tzOffsetMinutes !== undefined) segments.push({ text: ` · desde ${formatClock(a.firstSeenAt, tzOffsetMinutes)}`, color: SCREEN.dim })
  return segments
}

export function registerSessionPane(on: On): void {
  on('ui.render', { component: 'Pane', requestId: PANE_ID }, async ($, e) => timed('Pane:sessao', async () => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const cols = e.props.bodyColumns
    const flags = await getFlags($)
    const [pending, plan, files, failures, agents, env, timeline, explain, pins, usage] = await Promise.all([
      read($, PENDING),
      read($, PLAN),
      read($, FILES),
      read($, FAILURES),
      read($, AGENTS),
      read($, ENV),
      flags.linha ? read($, TIMELINE) : Promise.resolve([] as TimelineRow[]),
      flags.explica ? read($, EXPLAIN) : Promise.resolve(null as ExplainPanel | null),
      flags.fixar ? read($, PINS) : Promise.resolve([] as Pin[]),
      flags.limite ? read($, USAGE) : Promise.resolve(null as UsageReading | null),
    ])
    const items = pending?.items ?? []
    if (plan.length + items.length + files.length + failures.length + agents.length + timeline.length + pins.length === 0 && explain === null && usage === null) {
      return <Text dimColor>Nada por aqui ainda.</Text>
    }
    const row = (segments: readonly Segment[]) => (
      <Text wrap="truncate-end">
        {fitSegments(segments, cols).map(s => (s.color === undefined ? s.text : <Text color={s.color}>{s.text}</Text>))}
      </Text>
    )
    const heading = (title: string) => <Text color={SCREEN.plan}>{fitEnd(title, cols)}</Text>
    const done = plan.filter(p => p.status === 'completed').length
    const sorted = [...agents].sort((a, b) => Number(ACTIVE_AGENT.has(b.status)) - Number(ACTIVE_AGENT.has(a.status)))
    return (
      <Box flexDirection="column" width={cols}>
        {usage !== null && usageLine(usage).length > 0 && (
          <Box flexDirection="column" marginBottom={1}>
            {heading('Uso')}
            {row(usageLine(usage))}
          </Box>
        )}
        {explain !== null && (
          <Box flexDirection="column" marginBottom={1}>
            {heading('Explicação')}
            <Text dimColor wrap="truncate-end">{fitEnd(`“${explain.excerpt.replace(/\s+/g, ' ')}”`, cols)}</Text>
            {explain.status === 'pending' ? (
              <Text dimColor>Explicando…</Text>
            ) : explain.status === 'failed' ? (
              <Text dimColor>{`Sem explicação: ${explain.text}`}</Text>
            ) : (
              <Text>{explain.text}</Text>
            )}
          </Box>
        )}
        {plan.length > 0 && (
          <Box flexDirection="column" marginBottom={1}>
            {heading(`Plano ${done}/${plan.length}`)}
            {plan.map(p => {
              const mark = PLAN_MARK[p.status]
              const text = p.status === 'in_progress' ? (p.activeForm ?? p.text) : p.text
              return row([{ text: `${mark.glyph} `, color: SCREEN[mark.tone] }, { text, ...(p.status === 'completed' ? { color: SCREEN.dim } : {}) }])
            })}
          </Box>
        )}
        {items.length > 0 && (
          <Box flexDirection="column" marginBottom={1}>
            {heading('Precisa de você')}
            {items.map(item => row([{ text: `• ${item}`, color: SCREEN.warn }]))}
          </Box>
        )}
        {pins.length > 0 && (
          <Box flexDirection="column" marginBottom={1}>
            {heading(`Fixadas (${pins.length})`)}
            {[...pins].reverse().map(p => (
              <Button plain key={`pin-${p.requestId}`} dimColor onPress={() => void scrollToRow($, p.requestId)}>
                {fitEnd(env === null ? p.preview : `${formatClock(p.at, env.tzOffsetMinutes)} · ${p.preview}`, cols)}
              </Button>
            ))}
          </Box>
        )}
        {timeline.length > 0 && (
          <Box flexDirection="column" marginBottom={1}>
            {heading(`Turnos (${timeline.length})`)}
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
            {heading(`Arquivos (${files.length})`)}
            {files.slice(-MAX_FILES).reverse().map(f => row(fileSegments(f, env?.cwd, cols)))}
          </Box>
        )}
        {failures.length > 0 && (
          <Box flexDirection="column" marginBottom={1}>
            {heading(`Falhas (${failures.length})`)}
            {failures.slice(-MAX_FAILURES).reverse().map(f => (
              <Box flexDirection="column">
                <Text color={SCREEN.bad} wrap="truncate-end">
                  {fitEnd(f.command, cols)}
                </Text>
                <Box paddingLeft={2}>
                  <Text dimColor wrap="truncate-end">
                    {fitEnd(f.line, cols - 2)}
                  </Text>
                </Box>
              </Box>
            ))}
          </Box>
        )}
        {agents.length > 0 && (
          <Box flexDirection="column">
            {heading(`Agentes (${agents.length})`)}
            {sorted.map(a => row(agentSegments(a, env?.tzOffsetMinutes)))}
          </Box>
        )}
      </Box>
    )
  }))
}
