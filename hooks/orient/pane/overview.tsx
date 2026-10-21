import type { EngineInterface, RenderElement } from 'claude-code'

import type { AgentRow, Failure, PlanItem } from '../../../types'
import { fitEnd, segmentRow, type Segment } from '../../fit'
import { formatClock } from '../../format'
import { tr } from '../../i18n'
import { fill } from '../../io'
import { SCREEN, type ScreenTone } from '../../palette'
import { agentStatus } from '../../screen/agentCard'
import { explanationFor } from '../../screen/notes'
import { usageParts } from '../limits'
import { scrollToRow } from '../timeline'
import { added, bar, heading, removed, section, type PaneData, type UI } from './parts'

const PLAN_ROWS = 8
const FAILURE_ROWS = 3

const PLAN_MARK: Record<PlanItem['status'], { glyph: string; tone: ScreenTone }> = {
  completed: { glyph: '✓', tone: 'ok' },
  in_progress: { glyph: '▸', tone: 'plan' },
  pending: { glyph: '○', tone: 'dim' },
}

/** The plan's rows that fit, around the item in progress (or the first still open), and how many lie above and below. */
export function planWindow(plan: readonly PlanItem[], rows = PLAN_ROWS): { items: PlanItem[]; above: number; below: number } {
  if (plan.length <= rows) return { items: [...plan], above: 0, below: 0 }
  const open = plan.findIndex(p => p.status !== 'completed')
  const focus = open < 0 ? plan.length - 1 : Math.max(open, plan.findIndex(p => p.status === 'in_progress'))
  const start = Math.max(0, Math.min(focus - 2, plan.length - rows))
  return { items: plan.slice(start, start + rows), above: start, below: plan.length - start - rows }
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

/** The prompt the Fix button leaves in the prompt box: the failed command and its line, for the person to send. */
export function fixPrompt(f: Failure): string {
  const command = f.command.split('\n')[0] ?? ''
  return tr(`Fix the failure of \`${command}\`: ${f.line}`, `Conserte a falha de \`${command}\`: ${f.line}`)
}

export async function draftFix($: EngineInterface, f: Failure): Promise<void> {
  await fill($, { text: fixPrompt(f) })
}

/** Whether the session has anything for the pane to show. */
export function hasAnything(d: PaneData): boolean {
  const items = d.pending?.items.length ?? 0
  return d.plan.length + items + d.files.length + d.failures.length + d.agents.length + d.timeline.length + d.pins.length + d.chat.length > 0 || d.usage !== null
}

function failureRows($: EngineInterface, t: UI, d: PaneData, cols: number): RenderElement {
  const { Box, Text, Button } = t
  const shown = d.failures.slice(-FAILURE_ROWS).reverse()
  const older = d.failures.length - shown.length
  return section(t, [
    heading(t, `${tr('Failures', 'Falhas')} (${d.failures.length})`, cols),
    ...shown.map(f => {
      const why = d.flags.erros && f.toolUseId !== undefined ? explanationFor(f.toolUseId) : null
      const command = fitEnd(`✗ ${f.command.split('\n')[0] ?? ''}`, cols)
      return (
        <Box flexDirection="column">
          {f.toolUseId === undefined ? (
            <Text color={SCREEN.bad} wrap="truncate-end">
              {command}
            </Text>
          ) : (
            <Button plain key={`fail-${f.toolUseId}`} onPress={() => void scrollToRow($, f.toolUseId!)}>
              <Text color={SCREEN.bad}>{command}</Text>
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
          {d.flags.agente && (
            <Box paddingLeft={2}>
              <Button plain key={`fix-${f.toolUseId ?? f.at}`} dimColor onPress={() => void draftFix($, f)}>
                {tr('Fix it → chat', 'Consertar → chat')}
              </Button>
            </Box>
          )}
        </Box>
      )
    }),
    ...(older > 0 ? [<Text dimColor>{tr(`+${older} older`, `+${older} anteriores`)}</Text>] : []),
  ])
}

/** What matters at a glance: usage, the plan, what needs the person, failures, agents, and a row per other tab. */
export function overviewTab($: EngineInterface, t: UI, d: PaneData, cols: number): RenderElement {
  const { Box, Text, Button } = t
  if (!hasAnything(d)) return <Text dimColor>{tr('Nothing here yet.', 'Nada por aqui ainda.')}</Text>
  const usage = d.usage === null ? [] : usageParts(d.usage)
  const items = d.pending?.items ?? []
  const done = d.plan.filter(p => p.status === 'completed').length
  const plan = planWindow(d.plan)
  // A finished agent is a count; one at work, failed or stopped keeps its row.
  const active = d.agents.filter(a => a.status !== 'completed')
  const finished = d.agents.length - active.length
  const tz = d.env?.tzOffsetMinutes
  const labelCells = Math.max(0, ...usage.map(u => u.label.length))
  const lastAnswer = d.chat.at(-1)
  return (
    <Box flexDirection="column" width={cols}>
      {usage.length > 0 &&
        section(t, [
          heading(t, tr('Usage', 'Uso'), cols),
          ...usage.map(u => segmentRow(t, [{ text: `${u.label.padEnd(labelCells)} ` }, ...bar(u.percent / 100, u.color), { text: ` ${u.percent}%`, color: u.color }], cols)),
        ])}
      {d.plan.length > 0 &&
        section(t, [
          heading(t, `${tr('Plan', 'Plano')} ${done}/${d.plan.length}`, cols, [{ text: ' ' }, ...bar(done / d.plan.length, SCREEN.plan)]),
          ...(plan.above > 0 ? [<Text dimColor>{tr(`↑ ${plan.above} more`, `↑ mais ${plan.above}`)}</Text>] : []),
          ...plan.items.map(p => {
            const mark = PLAN_MARK[p.status]
            const text = p.status === 'in_progress' ? (p.activeForm ?? p.text) : p.text
            return segmentRow(t, [{ text: `${mark.glyph} `, color: SCREEN[mark.tone] }, { text, ...(p.status === 'completed' ? { color: SCREEN.dim } : {}) }], cols)
          }),
          ...(plan.below > 0 ? [<Text dimColor>{tr(`↓ ${plan.below} more`, `↓ mais ${plan.below}`)}</Text>] : []),
        ])}
      {items.length > 0 && section(t, [heading(t, tr('Needs you', 'Precisa de você'), cols), ...items.map(item => segmentRow(t, [{ text: `• ${item}`, color: SCREEN.warn }], cols))])}
      {d.failures.length > 0 && failureRows($, t, d, cols)}
      {d.agents.length > 0 &&
        section(t, [
          heading(t, `${tr('Agents', 'Agentes')} (${d.agents.length})`, cols),
          ...active.map(a => segmentRow(t, agentSegments(a, tz), cols)),
          ...(finished > 0 ? [<Text dimColor>{tr(`+${finished} finished`, `+${finished} concluídos`)}</Text>] : []),
        ])}
      {/* Plain rows under each tab's digit: a Button that switches the tab vanishes under its own press, and the
          pane's focus falls into the prompt box with it. */}
      {d.files.length > 0 && <Text dimColor>{fitEnd(`3 · ${tr('Files', 'Arquivos')} (${d.files.length}) · +${added(d.files)} −${removed(d.files)}`, cols)}</Text>}
      {d.timeline.length + d.pins.length > 0 && (
        <Text dimColor>{fitEnd(`4 · ${tr('Turns', 'Turnos')} (${d.timeline.length})${d.pins.length > 0 ? tr(` · ${d.pins.length} pinned`, ` · ${d.pins.length} fixadas`) : ''}`, cols)}</Text>
      )}
      {lastAnswer !== undefined && <Text dimColor>{fitEnd(`2 · ${tr('Agent', 'Agente')} (${d.chat.length}) · ${lastAnswer.question.replace(/\s+/g, ' ')}`, cols)}</Text>}
    </Box>
  )
}
