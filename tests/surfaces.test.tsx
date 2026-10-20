import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

// Every drawing the mod hooks, on every surface it may meet: the engine must take each tree (a refused one throws in
// mount), and off the terminal the mod mostly steps aside.

const SURFACES = ['terminal', 'desktop'] as const

function engineBelow(on: On): void {
  for (const component of ['AssistantMessage', 'ToolUse', 'ToolGroup', 'ToolResult', 'TurnDuration', 'UserMessage', 'Spinner', 'AbovePrompt'] as const) {
    on('ui.render', { component: component as 'ToolUse' }, ($, e) => {
      const { Text } = $.ui.resolve(e)
      return <Text>engine</Text>
    })
  }
}

const REPLY = [
  '**Rótulo:** um **termo**, ==fato==, {+bom+}, {-ruim-}, {!atenção!} e 102761 ms.',
  '',
  '> [!DECISÃO] Publicar?',
  '> Sim ou não.',
  '',
  '| a | b |',
  '|---|---|',
  '| 1 | 2 |',
  '',
  '```ts',
  'const x = 1',
  '```',
].join('\n')

async function drawAll($: Engine, surface: (typeof SURFACES)[number], columns = 120) {
  const base = { plugin: 'realce' as const, surface, viewport: { columns, rows: 40 } }
  await $.ui.mount({ ...base, component: 'AssistantMessage', props: { text: REPLY, isFirstOfReply: true } })
  await $.ui.mount({ ...base, component: 'ToolUse', requestId: 't1', props: { tool_use_id: 't1', tool: 'Bash', input: { command: 'ls' }, isRunning: false, isErrored: false, isInterrupted: false, output: { stdout: 'a', stderr: '', interrupted: false } } })
  await $.ui.mount({ ...base, component: 'ToolGroup', props: { calls: [{ tool: 'Read', input: { file_path: '/a/x.ts' }, isRunning: false, isErrored: false, isInterrupted: false }], isActive: false, isExpanded: false } })
  await $.ui.mount({ ...base, component: 'ToolResult', requestId: 'e1', props: { tool_use_id: 'e1', tool: 'Edit', output: { filePath: '/a/x.ts', structuredPatch: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines: ['-a', '+b'] }] }, isErrored: false } })
  await $.ui.mount({ ...base, component: 'TurnDuration', props: { word: 'Baked', durationMs: 5_000 } })
  await $.ui.mount({ ...base, component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 6, bodyColumns: Math.max(10, columns - 5), scroll: { offset: 0, bodyRows: 6 }, view: {} } })
  const pane = { title: 'x', isFocused: false, bodyColumns: Math.min(60, columns), placement: 'dock' as const, scroll: { offset: 0, bodyRows: 40 }, view: {} }
  await $.ui.mount({ ...base, component: 'Pane', requestId: 'realce-sessao', props: pane })
  await $.ui.mount({ ...base, component: 'Pane', requestId: 'realce-flags', props: pane })
}

describe('every surface takes every drawing', () => {
  for (const surface of SURFACES) {
    test(`${surface}`, async ($, on) => {
      mock.store(on)
      mock.clock(on)
      engineBelow(on)
      on('prompt.compose', () => ({ sections: [] }))
      await drawAll($, surface)
      expect(true).toBe(true)
    })

    test(`${surface} at 30 columns`, async ($, on) => {
      mock.store(on)
      mock.clock(on)
      engineBelow(on)
      on('prompt.compose', () => ({ sections: [] }))
      await drawAll($, surface, 30)
      expect(true).toBe(true)
    })

    test(`${surface} with every flag off`, async ($, on) => {
      mock.store(on, { master: false })
      mock.clock(on)
      engineBelow(on)
      on('prompt.compose', () => ({ sections: [] }))
      await drawAll($, surface)
      expect(true).toBe(true)
    })
  }

  test('off the terminal a reply is the engine\'s, its marks as plain bold', async ($, on) => {
    mock.store(on)
    let drawn = ''
    on('ui.render', { component: 'AssistantMessage' }, ($, e) => {
      drawn = e.props.text
      const { Text } = $.ui.resolve(e)
      return <Text>{e.props.text}</Text>
    })
    await $.ui.mount({ plugin: 'realce', surface: 'desktop', component: 'AssistantMessage', props: { text: 'um {+bom+} e ==fato==', isFirstOfReply: true } })
    expect(drawn).toBe('um **bom** e **fato**')
  })
})
