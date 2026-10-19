import { atom, read } from 'claude-code'
import type { On } from 'claude-code'

import type { AgentRow, FileTouch, PlanItem } from '../../types'
import { formatClock } from '../format'
import { SCREEN } from '../palette'
import { fitEnd, fitSegments, fitStart, type Segment } from './fit'
import type { SESSION_PANE } from './paneToggle'
import { timed } from '../perf'

const PENDING = atom({ plugin: 'realce', key: 'pending' } as const, null)
const PLAN = atom({ plugin: 'realce', key: 'plan' } as const, [])
const FILES = atom({ plugin: 'realce', key: 'files' } as const, [])
const FAILURES = atom({ plugin: 'realce', key: 'failures' } as const, [])
const AGENTS = atom({ plugin: 'realce', key: 'agents' } as const, [])
const ENV = atom({ plugin: 'realce', key: 'env' } as const, null)

// A literal, so the module scan can name the pane's matcher; the type ties it to the toggle's id.
const PANE_ID: typeof SESSION_PANE = 'realce-sessao'

const MAX_FILES = 12
const MAX_FAILURES = 5
const ACTIVE_AGENT = new Set(['running', 'pending', 'waiting'])

const PLAN_MARK: Record<PlanItem['status'], { glyph: string; color: string }> = {
  completed: { glyph: '✓', color: SCREEN.ok },
  in_progress: { glyph: '▸', color: SCREEN.plan },
  pending: { glyph: '○', color: SCREEN.dim },
}

const AGENT_STATUS: Record<string, { label: string; color: string }> = {
  running: { label: 'Rodando', color: SCREEN.run },
  pending: { label: 'Na fila', color: SCREEN.dim },
  waiting: { label: 'Aguardando', color: SCREEN.warn },
  idle: { label: 'Ocioso', color: SCREEN.dim },
  completed: { label: 'Concluído', color: SCREEN.ok },
  failed: { label: 'Falhou', color: SCREEN.bad },
  killed: { label: 'Parado', color: SCREEN.warn },
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
  const status = AGENT_STATUS[a.status] ?? { label: a.status, color: SCREEN.dim }
  const segments: Segment[] = [
    { text: '◆ ', color: SCREEN.agent },
    { text: a.description },
    { text: ` · ${a.type} · `, color: SCREEN.dim },
    { text: status.label, color: status.color },
  ]
  // Since when, not for how long: a clock time stays true without redrawing the pane every second.
  if (tzOffsetMinutes !== undefined) segments.push({ text: ` · desde ${formatClock(a.firstSeenAt, tzOffsetMinutes)}`, color: SCREEN.dim })
  return segments
}

export function registerSessionPane(on: On): void {
  on('ui.render', { component: 'Pane', requestId: PANE_ID }, async ($, e) => timed('Pane:sessao', async () => {
    const { Box, Text } = $.ui.resolve(e)
    const cols = e.props.bodyColumns
    const [pending, plan, files, failures, agents, env] = await Promise.all([
      read($, PENDING),
      read($, PLAN),
      read($, FILES),
      read($, FAILURES),
      read($, AGENTS),
      read($, ENV),
    ])
    const items = pending?.items ?? []
    if (plan.length + items.length + files.length + failures.length + agents.length === 0) {
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
        {plan.length > 0 && (
          <Box flexDirection="column" marginBottom={1}>
            {heading(`Plano ${done}/${plan.length}`)}
            {plan.map(p => {
              const mark = PLAN_MARK[p.status]
              const text = p.status === 'in_progress' ? (p.activeForm ?? p.text) : p.text
              return row([{ text: `${mark.glyph} `, color: mark.color }, { text, ...(p.status === 'completed' ? { color: SCREEN.dim } : {}) }])
            })}
          </Box>
        )}
        {items.length > 0 && (
          <Box flexDirection="column" marginBottom={1}>
            {heading('Precisa de você')}
            {items.map(item => row([{ text: `• ${item}`, color: SCREEN.warn }]))}
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
