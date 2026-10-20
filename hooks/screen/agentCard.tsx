import { atom, read } from 'claude-code'
import type { Elements, On, RenderElement, RenderPropsOf } from 'claude-code'

import type { AgentRow } from '../../types'
import { flagsVersion, getFlags } from '../flags'
import { formatDuration, formatTokens, plural } from '../format'
import { pick, tr, type Text } from '../i18n'
import { memo } from '../memo'
import { SCREEN, type ScreenTone } from '../palette'
import { timed } from '../perf'

const AGENTS = atom({ plugin: 'realce', key: 'agents' } as const, [])

type T = Pick<Elements['terminal'], 'Box' | 'Text'>

type TaskNotice = { status: string; name: string | null; result: string | null; tokens?: number; toolUses?: number; durationMs?: number }

const tag = (text: string, name: string) => new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(text)?.[1] ?? null

const numberTag = (text: string, name: string) => {
  const value = tag(text, name)
  return value !== null && /^\s*\d+\s*$/.test(value) ? Number(value) : undefined
}

// The summary names the run in quotes: 'Agent "Revisar desenho" finished', 'Background command "npm test" completed'.
const quotedName = (summary: string) => /"(.+)"/.exec(summary)?.[1] ?? null

/** The result's first line worth reading, its markdown marks dropped. */
function firstLine(result: string): string | null {
  for (const raw of result.split('\n')) {
    const line = raw.replace(/\*\*|__|`/g, '').replace(/^\s*(#+|[-*>])\s+/, '').trim()
    if (line !== '') return line
  }
  return null
}

/** A `<task-notification>` as the model reads it; null when the text is not one. */
export function parseTaskNotification(text: string): TaskNotice | null {
  if (!text.includes('<task-notification>')) return null
  const status = tag(text, 'status')?.trim()
  if (status === undefined || status === '') return null
  const result = tag(text, 'result')
  const notice: TaskNotice = { status, name: quotedName(tag(text, 'summary') ?? ''), result: result === null ? null : firstLine(result) }
  const tokens = numberTag(text, 'subagent_tokens') ?? numberTag(text, 'total_tokens')
  const toolUses = numberTag(text, 'tool_uses')
  const durationMs = numberTag(text, 'duration_ms')
  if (tokens !== undefined) notice.tokens = tokens
  if (toolUses !== undefined) notice.toolUses = toolUses
  if (durationMs !== undefined) notice.durationMs = durationMs
  return notice
}

/** The row's notice: the whole notification when the row carries it, else its summary line and the task's fields. */
function noticeOf(props: RenderPropsOf['UserMessage']): TaskNotice | null {
  const parsed = parseTaskNotification(props.text)
  if (parsed !== null) return parsed
  const status = props.task?.status
  const name = quotedName(props.text)
  if (status === undefined || name === null) return null
  return { status, name, result: null, ...(props.task?.durationMs !== undefined ? { durationMs: props.task.durationMs } : {}) }
}

// An agent's status in words and tone, the card's and the session pane's: one table, so both say the same.
const AGENT_STATUS: Record<string, { label: Text; tone: ScreenTone }> = {
  running: { label: { en: 'Running', pt: 'Rodando' }, tone: 'run' },
  pending: { label: { en: 'Queued', pt: 'Na fila' }, tone: 'dim' },
  waiting: { label: { en: 'Waiting', pt: 'Aguardando' }, tone: 'warn' },
  idle: { label: { en: 'Idle', pt: 'Ocioso' }, tone: 'dim' },
  completed: { label: { en: 'Done', pt: 'Concluído' }, tone: 'ok' },
  failed: { label: { en: 'Failed', pt: 'Falhou' }, tone: 'bad' },
  killed: { label: { en: 'Stopped', pt: 'Parado' }, tone: 'warn' },
  stopped: { label: { en: 'Stopped', pt: 'Parado' }, tone: 'warn' },
}

/** A status the table does not know reads as the engine named it, dimmed. */
export function agentStatus(status: string): { label: string; tone: ScreenTone } {
  const known = AGENT_STATUS[status]
  return known === undefined ? { label: status, tone: 'dim' } : { label: pick(known.label), tone: known.tone }
}

/** The compact card of a finished background task; ctrl+o (isExpanded) shows the engine's whole row. */
function agentCard(t: T, notice: TaskNotice, agent: AgentRow | null, taskDurationMs: number | undefined): RenderElement {
  const { Box, Text } = t
  const name = notice.name ?? agent?.description ?? ''
  const title = agent !== null && agent.type !== '' ? `${agent.type}: ${name}` : name
  const status = agentStatus(notice.status)
  const statusColor = SCREEN[status.tone]
  const durationMs = notice.durationMs ?? taskDurationMs
  const facts = [
    durationMs !== undefined ? formatDuration(durationMs) : null,
    notice.toolUses !== undefined ? plural(notice.toolUses, tr('tool', 'ferramenta'), tr('tools', 'ferramentas')) : null,
    notice.tokens !== undefined ? formatTokens(notice.tokens) : null,
  ].filter((f): f is string => f !== null)
  return (
    <Box key="realce-card" flexDirection="column" borderStyle="round" borderColor={SCREEN.agent} paddingX={1}>
      <Box key="realce-card-head">
        <Text wrap="truncate-end">
          <Text color={SCREEN.agent}>{`◆ ${title}`}</Text>
          <Text color={SCREEN.dim}> · </Text>
          <Text color={statusColor}>{status.label}</Text>
          {facts.length > 0 && <Text color={SCREEN.dim}>{` · ${facts.join(' · ')}`}</Text>}
        </Text>
      </Box>
      {notice.result !== null && (
        <Box key="realce-card-result">
          <Text color={SCREEN.dim} wrap="truncate-end">{notice.result}</Text>
        </Box>
      )}
      <Text color={SCREEN.dim}>{tr('ctrl+o to see it all', 'ctrl+o para ver tudo')}</Text>
    </Box>
  )
}

/** A background task's notification becomes a card; the person's own prompts never reach the mod. */
export function registerAgentCard(on: On): void {
  on('ui.render', { component: 'UserMessage', props: { origin: { kind: 'task-notification' } } }, async ($, e, next) => timed('UserMessage', async () => {
    if (e.surface !== 'terminal' || e.props.isExpanded) return next(e)
    const flags = await getFlags($)
    if (!flags.agentes) return next(e)
    // A notification carries the agent's whole report: parsed once per text, not on every scroll past it.
    const notice = memo('notice', `${e.requestId}|${e.props.task?.status}|${e.props.task?.durationMs}|${e.props.text.length}`, () => noticeOf(e.props), 500)
    if (notice === null) return next(e)
    const taskId = e.props.task?.id
    const agent = taskId === undefined ? null : ((await read($, AGENTS)).find(a => a.id === taskId) ?? null)
    const key = `${e.requestId}|${flagsVersion()}|${JSON.stringify(agent)}|${e.props.task?.durationMs}|${e.props.text.length}|${notice.status}`
    return memo('UserMessage', key, () => agentCard($.ui.resolve(e), notice, agent, e.props.task?.durationMs))
  }))
}
