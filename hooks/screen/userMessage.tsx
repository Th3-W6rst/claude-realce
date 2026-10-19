import { atom, read } from 'claude-code'
import type { On } from 'claude-code'

import { getFlags } from '../flags'
import { timed } from '../perf'
import { agentCard, noticeOf } from './agents'

const AGENTS = atom({ plugin: 'realce', key: 'agents' } as const, [])

/** A background task's notification becomes a card; the person's own prompts never reach the mod. */
export function registerUserMessage(on: On): void {
  on('ui.render', { component: 'UserMessage', props: { origin: { kind: 'task-notification' } } }, async ($, e, next) => timed('UserMessage', async () => {
    if (e.surface !== 'terminal' || e.props.isExpanded) return next(e)
    const flags = await getFlags($)
    if (!flags.agentes) return next(e)
    const notice = noticeOf(e.props)
    if (notice === null) return next(e)
    const taskId = e.props.task?.id
    const agent = taskId === undefined ? null : ((await read($, AGENTS)).find(a => a.id === taskId) ?? null)
    return agentCard($.ui.resolve(e), notice, agent, e.props.task?.durationMs)
  }))
}
