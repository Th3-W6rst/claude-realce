import { atom, read } from 'claude-code'
import type { On } from 'claude-code'

import { flagsVersion, getFlags } from '../flags'
import { memo } from '../memo'
import { timed } from '../perf'
import { agentCard, noticeOf } from './agents'

const AGENTS = atom({ plugin: 'realce', key: 'agents' } as const, [])

/** A background task's notification becomes a card; the person's own prompts never reach the mod. */
export function registerUserMessage(on: On): void {
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
