import { describe, expect, mock, test } from 'claude-code/testing'

import { parseTaskNotification } from '../hooks/screen/agentCard'
import type { AgentRow } from '../types'
import { drawnText, engineRow } from './world'
import { PT } from './lang'

describe('agent cards', () => {
  const NOTICE = [
    '<task-notification>',
    '<task-id>a0123456789abcdef</task-id>',
    '<tool-use-id>toolu_01</tool-use-id>',
    '<output-file>/tmp/a.output</output-file>',
    '<status>completed</status>',
    '<summary>Agent "Revisar desenho" finished</summary>',
    '<note>A task-notification fires each time this agent stops.</note>',
    "<result>\n\nI'd still need about four answers before planning this well.\n\n**Questions**</result>",
    '<usage><subagent_tokens>73201</subagent_tokens><tool_uses>20</tool_uses><duration_ms>102761</duration_ms></usage>',
    '</task-notification>',
  ].join('\n')
  const TASK = { id: 'a0123456789abcdef', status: 'completed', durationMs: 102_761 }

  test('a task notification parses', () => {
    expect(parseTaskNotification(NOTICE)).toEqual({
      status: 'completed',
      name: 'Revisar desenho',
      result: "I'd still need about four answers before planning this well.",
      tokens: 73_201,
      toolUses: 20,
      durationMs: 102_761,
    })
    expect(parseTaskNotification('hello')).toBeNull()
  })

  test('the card sums the run', async ($, on) => {
    mock.store(on, PT)
    engineRow(on, 'UserMessage')
    const ui = await $.ui.mount({
      plugin: 'realce',
      surface: 'terminal',
      component: 'UserMessage',
      props: { text: NOTICE, origin: { kind: 'task-notification' }, isExpanded: false, task: TASK },
    })
    expect(await drawnText(ui, 'realce-card-head')).toBe('◆ Revisar desenho · Concluído · 1m 42s · 20 ferramentas · 73k tokens')
    expect((await ui.findAll({ type: 'Text' })).find(s => s.text === 'Concluído')).toMatchObject({ props: { color: '#00FF41' } })
    expect(await drawnText(ui, 'realce-card-result')).toBe("I'd still need about four answers before planning this well.")
    expect(await ui.find({ text: 'ctrl+o para ver tudo' })).toBeDefined()
    expect(await ui.find({ text: 'engine' })).toBeUndefined()
  })

  test('a summary-only row takes its status and time from the task', async ($, on) => {
    mock.store(on, PT)
    engineRow(on, 'UserMessage')
    const ui = await $.ui.mount({
      plugin: 'realce',
      surface: 'terminal',
      component: 'UserMessage',
      props: { text: 'Agent "Revisar desenho" failed', origin: { kind: 'task-notification' }, isExpanded: false, task: { ...TASK, status: 'failed' } },
    })
    expect(await drawnText(ui, 'realce-card-head')).toBe('◆ Revisar desenho · Falhou · 1m 42s')
  })

  test('the agent list names the card by the task id', async ($, on) => {
    mock.store(on, PT)
    engineRow(on, 'UserMessage')
    // The agent list is the orientation area's to write: here it stands beneath the plugin.
    const rows: AgentRow[] = [{ id: TASK.id, type: 'opus-medium', description: 'Revisar', status: 'completed', firstSeenAt: 0 }]
    on('state.get', ($, e, next) => (e.key === 'agents' ? { value: { value: rows, version: 1 } } : next(e)))
    const ui = await $.ui.mount({
      plugin: 'realce',
      surface: 'terminal',
      component: 'UserMessage',
      props: { text: NOTICE, origin: { kind: 'task-notification' }, isExpanded: false, task: TASK },
    })
    expect(await drawnText(ui, 'realce-card-head')).toMatch(/^◆ opus-medium: Revisar desenho · Concluído/)
  })

  test('expanded, unknown text and agentes off draw the engine', async ($, on) => {
    mock.store(on, PT)
    engineRow(on, 'UserMessage')
    const mount = (props: { text: string; isExpanded: boolean; task?: typeof TASK }) =>
      $.ui.mount({ plugin: 'realce', surface: 'terminal', component: 'UserMessage', props: { origin: { kind: 'task-notification' as const }, ...props } })
    expect(await (await mount({ text: NOTICE, isExpanded: true, task: TASK })).find({ key: 'realce-card' })).toBeUndefined()
    expect(await (await mount({ text: 'Shell finished', isExpanded: false })).find({ text: 'engine' })).toBeDefined()
    await $.command.run({ command: 'realce', args: 'agentes off', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } })
    const off = await mount({ text: NOTICE, isExpanded: false, task: TASK })
    expect(await off.find({ key: 'realce-card' })).toBeUndefined()
    expect(await off.find({ text: 'engine' })).toBeDefined()
  })
})
