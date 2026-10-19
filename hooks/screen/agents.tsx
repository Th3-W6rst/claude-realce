import type { Elements, RenderElement, RenderPropsOf } from 'claude-code'

import type { AgentRow } from '../../types'
import { formatDuration, plural } from '../format'
import { SCREEN } from '../palette'

type T = Pick<Elements['terminal'], 'Box' | 'Text'>

export type TaskNotice = { status: string; name: string | null; result: string | null; tokens?: number; toolUses?: number; durationMs?: number }

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
export function noticeOf(props: RenderPropsOf['UserMessage']): TaskNotice | null {
  const parsed = parseTaskNotification(props.text)
  if (parsed !== null) return parsed
  const status = props.task?.status
  const name = quotedName(props.text)
  if (status === undefined || name === null) return null
  return { status, name, result: null, ...(props.task?.durationMs !== undefined ? { durationMs: props.task.durationMs } : {}) }
}

const STATUS: Record<string, { label: string; color: string }> = {
  completed: { label: 'Concluído', color: SCREEN.ok },
  failed: { label: 'Falhou', color: SCREEN.bad },
  killed: { label: 'Parado', color: SCREEN.warn },
  stopped: { label: 'Parado', color: SCREEN.warn },
}

const formatTokens = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k tokens` : plural(n, 'token', 'tokens'))

/** The compact card of a finished background task; ctrl+o (isExpanded) shows the engine's whole row. */
export function agentCard(t: T, notice: TaskNotice, agent: AgentRow | null, taskDurationMs: number | undefined): RenderElement {
  const { Box, Text } = t
  const name = notice.name ?? agent?.description ?? ''
  const title = agent !== null && agent.type !== '' ? `${agent.type}: ${name}` : name
  const status = STATUS[notice.status] ?? { label: notice.status, color: SCREEN.dim }
  const durationMs = notice.durationMs ?? taskDurationMs
  const facts = [
    durationMs !== undefined ? formatDuration(durationMs) : null,
    notice.toolUses !== undefined ? plural(notice.toolUses, 'ferramenta', 'ferramentas') : null,
    notice.tokens !== undefined ? formatTokens(notice.tokens) : null,
  ].filter((f): f is string => f !== null)
  return (
    <Box key="realce-card" flexDirection="column" borderStyle="round" borderColor={SCREEN.agent} paddingX={1}>
      <Box key="realce-card-head">
        <Text wrap="truncate-end">
          <Text color={SCREEN.agent}>{`◆ ${title}`}</Text>
          <Text color={SCREEN.dim}> · </Text>
          <Text color={status.color}>{status.label}</Text>
          {facts.length > 0 && <Text color={SCREEN.dim}>{` · ${facts.join(' · ')}`}</Text>}
        </Text>
      </Box>
      {notice.result !== null && (
        <Box key="realce-card-result">
          <Text color={SCREEN.dim} wrap="truncate-end">{notice.result}</Text>
        </Box>
      )}
      <Text color={SCREEN.dim}>ctrl+o para ver tudo</Text>
    </Box>
  )
}
