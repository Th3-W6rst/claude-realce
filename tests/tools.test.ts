import { describe, expect, mock, test } from 'claude-code/testing'

import { summarizeGroup, summarizeTool } from '../hooks/screen/tools'
import { BASH_OK, EDIT_RESULT, drawnText, engineRow } from './world'
import { PT } from './lang'

describe('tools by kind', () => {
  test('an edit counts its lines', () => {
    expect(summarizeTool('Edit', { file_path: '/a/b/x.ts', old_string: 'a', new_string: 'a\nb\nc' }, '/a/b')).toMatchObject({
      kind: 'edit',
      verb: 'Editou',
      target: 'x.ts',
      added: 3,
      removed: 1,
    })
  })

  test('a settled edit counts from its diff, a new file says so', () => {
    expect(summarizeTool('Edit', { file_path: '/a/b/x.ts', old_string: 'a', new_string: 'a\nb\nc' }, '/a/b', EDIT_RESULT)).toMatchObject({ added: 2, removed: 0 })
    const written = summarizeTool('Write', { file_path: '/elsewhere/n.md', content: 'a\nb' }, '/a/b', { type: 'create', filePath: '/elsewhere/n.md', content: 'a\nb', structuredPatch: [], originalFile: null })
    expect(written).toMatchObject({ kind: 'edit', target: '/elsewhere/n.md', added: 2, isNew: true })
  })

  test('reads, runs, agents, web, plan, mcp tools and unknown tools', () => {
    expect(summarizeTool('Read', { file_path: '/a/b/x.ts' }, '/a/b')).toMatchObject({ kind: 'read', verb: 'Leu', target: 'x.ts' })
    expect(summarizeTool('Bash', { command: 'npm test' }, '/a/b')).toMatchObject({ kind: 'run', target: 'npm test' })
    expect(summarizeTool('Agent', { description: 'Revisar desenho', prompt: 'p', subagent_type: 'opus-medium' }, '/a/b')).toMatchObject({ kind: 'agent', verb: 'Agente opus-medium:', target: 'Revisar desenho' })
    expect(summarizeTool('WebSearch', { query: 'ghostty bold', mode: 'standard' }, '/a/b')).toMatchObject({ kind: 'web', verb: 'Buscou:', target: 'ghostty bold' })
    expect(summarizeTool('WebFetch', { url: 'https://x.com', prompt: 'p' }, '/a/b')).toMatchObject({ kind: 'web', verb: 'Abriu:', target: 'https://x.com' })
    const todos = [
      { content: 'a', status: 'completed', activeForm: 'A' },
      { content: 'b', status: 'in_progress', activeForm: 'B' },
      { content: 'c', status: 'pending', activeForm: 'C' },
    ]
    expect(summarizeTool('TodoWrite', { todos }, '/a/b')).toMatchObject({ kind: 'plan', verb: 'Plano:', target: '1/3' })
    expect(summarizeTool('mcp__plugin-authoring__scan_secrets', {}, '/a/b')).toMatchObject({ kind: 'mcp', target: 'plugin-authoring · scan_secrets' })
    expect(summarizeTool('Frobnicate', {}, '/a/b')).toBeNull()
  })

  test('a group says what it did', () => {
    const read = { tool: 'Read', input: { file_path: '/a/x.ts' } }
    expect(summarizeGroup([read, read, { tool: 'Grep', input: { pattern: 'x' } }])).toBe('Leu 2 arquivos · buscou 1 vez')
    expect(summarizeGroup([{ tool: 'Bash', input: { command: 'ls' } }, { tool: 'Bash', input: { command: 'pwd' } }, read])).toBe('Rodou 2 comandos · leu 1 arquivo')
  })

  test('an edit row shows icon, verb and colored counts', async ($, on) => {
    mock.store(on, PT)
    engineRow(on, 'ToolUse')
    const ui = await $.ui.mount({
      plugin: 'realce',
      surface: 'terminal',
      component: 'ToolUse',
      props: { tool_use_id: 't1', tool: 'Edit', input: { file_path: '/a/b/x.ts', old_string: 'a', new_string: 'a\nb\nc' }, isRunning: false, isErrored: false, isInterrupted: false },
    })
    expect(await drawnText(ui, 'realce-tool')).toBe('✎ Editou /a/b/x.ts  +3 −1')
    const spans = await ui.findAll({ type: 'Text' })
    expect(spans.find(s => s.text === '+3')).toMatchObject({ props: { color: '#00FF41' } })
    expect(spans.find(s => s.text === '−1')).toMatchObject({ props: { color: '#FF5C63' } })
    expect(await ui.find({ text: 'engine' })).toBeUndefined()
  })

  test('a remembered row is drawn again when its call settles', async ($, on) => {
    mock.store(on, PT)
    engineRow(on, 'ToolUse')
    const input = { file_path: '/a/b/x.ts', old_string: 'a', new_string: 'a\nb\nc' }
    const running = { tool_use_id: 'm1', tool: 'Edit', input, isRunning: true, isErrored: false, isInterrupted: false }
    const ui = await $.ui.mount({ plugin: 'realce', surface: 'terminal', component: 'ToolUse', requestId: 'm1', props: running })
    expect(await drawnText(ui, 'realce-tool')).toBe('◌ Editou /a/b/x.ts  +3 −1')
    await ui.redraw(running)
    expect(await drawnText(ui, 'realce-tool')).toBe('◌ Editou /a/b/x.ts  +3 −1')
    // Settled: the stored patch is the count that holds now, not the strings the model sent.
    const output = { structuredPatch: [{ lines: ['+a', '+b', '-c', ' d'] }] }
    await ui.redraw({ ...running, isRunning: false, output })
    expect(await drawnText(ui, 'realce-tool')).toBe('✎ Editou /a/b/x.ts  +2 −1')
  })

  test('a call with its result is settled, whatever isRunning says', async ($, on) => {
    // Seen live: a pytest that wrote files kept isRunning true on every draw after its result came back.
    mock.store(on, PT)
    on('ui.invalidate', () => ({ value: undefined }))
    engineRow(on, 'ToolUse')
    engineRow(on, 'ToolGroup')
    const call = { tool_use_id: 'r1', tool: 'Bash', input: { command: 'python3 -m pytest -q' }, isRunning: true, isErrored: false, isInterrupted: false, output: BASH_OK('2 passed in 25.02s') }
    const ui = await $.ui.mount({ plugin: 'realce', surface: 'terminal', component: 'ToolUse', requestId: 'r1', props: call })
    expect(((await drawnText(ui, 'realce-tool')) ?? '').startsWith('◌')).toBe(false)
    const group = await $.ui.mount({ plugin: 'realce', surface: 'terminal', component: 'ToolGroup', props: { calls: [call], isActive: false, isExpanded: false } })
    expect(((await drawnText(group, 'realce-group')) ?? '').startsWith('◌')).toBe(false)
    await $.command.run({ command: 'realce', args: 'foco on', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } })
    await ui.redraw(call)
    expect(await ui.find({ key: 'realce-tool' })).toBeUndefined()
  })

  test('a Bash row draws its command highlighted, two lines at most', async ($, on) => {
    mock.store(on, PT)
    engineRow(on, 'ToolUse')
    const ui = await $.ui.mount({
      plugin: 'realce',
      surface: 'terminal',
      component: 'ToolUse',
      props: { tool_use_id: 't1', tool: 'Bash', input: { command: 'cd x\nnpm test\necho fim' }, isRunning: false, isErrored: false, isInterrupted: false },
    })
    const row = (await drawnText(ui, 'realce-tool')) ?? ''
    expect(row).toContain('▶ cd x')
    expect(row).toContain('npm test …')
    expect(row).not.toContain('echo')
    expect((await ui.findAll({ type: 'Text' })).find(s => s.text === 'npm')).toMatchObject({ props: { color: '#24D3E0' } })
  })

  test('running, errored and interrupted rows', async ($, on) => {
    mock.store(on, PT)
    engineRow(on, 'ToolUse')
    const row = (state: { isRunning: boolean; isErrored: boolean; isInterrupted: boolean }) =>
      $.ui.mount({ plugin: 'realce', surface: 'terminal', component: 'ToolUse', props: { tool_use_id: 't1', tool: 'Read', input: { file_path: '/x.ts' }, ...state } })
    expect(await drawnText(await row({ isRunning: true, isErrored: false, isInterrupted: false }), 'realce-tool')).toBe('◌ Leu /x.ts')
    const errored = await row({ isRunning: false, isErrored: true, isInterrupted: false })
    expect(await drawnText(errored, 'realce-tool')).toBe('✖ Leu /x.ts')
    expect((await errored.findAll({ type: 'Text' })).find(s => s.text === '✖ Leu /x.ts')).toMatchObject({ props: { color: '#FF5C63' } })
    expect(await drawnText(await row({ isRunning: false, isErrored: false, isInterrupted: true }), 'realce-tool')).toBe('◇ Leu /x.ts · interrompida')
  })

  test('a folded group draws one dim line; expanded is the engine', async ($, on) => {
    mock.store(on, PT)
    engineRow(on, 'ToolGroup')
    const calls = [
      { tool: 'Read', input: { file_path: '/x.ts' }, isRunning: false, isErrored: false, isInterrupted: false },
      { tool: 'Grep', input: { pattern: 'x' }, isRunning: false, isErrored: false, isInterrupted: false },
    ]
    const folded = await $.ui.mount({ plugin: 'realce', surface: 'terminal', component: 'ToolGroup', props: { calls, isActive: false, isExpanded: false } })
    expect(await drawnText(folded, 'realce-group')).toBe('◇ Leu 1 arquivo · buscou 1 vez')
    const expanded = await $.ui.mount({ plugin: 'realce', surface: 'terminal', component: 'ToolGroup', props: { calls, isActive: false, isExpanded: true } })
    expect(await expanded.find({ text: 'engine' })).toBeDefined()
  })

  test('ferramentas off draws the engine rows, and unknown tools are the engine', async ($, on) => {
    mock.store(on, { ...PT, flags: { ferramentas: false } })
    engineRow(on, 'ToolUse')
    const ui = await $.ui.mount({
      plugin: 'realce',
      surface: 'terminal',
      component: 'ToolUse',
      props: { tool_use_id: 't1', tool: 'Read', input: { file_path: '/x.ts' }, isRunning: false, isErrored: false, isInterrupted: false },
    })
    expect(await ui.find({ text: 'engine' })).toBeDefined()
    expect(await ui.find({ key: 'realce-tool' })).toBeUndefined()
  })
})

describe('focus mode', () => {
  const row = (tool: string, input: unknown, state: Partial<{ isRunning: boolean; isErrored: boolean }> = {}, id = 'f1') => ({
    plugin: 'realce' as const,
    surface: 'terminal' as const,
    component: 'ToolUse' as const,
    requestId: id,
    props: { tool_use_id: id, tool, input, isRunning: false, isErrored: false, isInterrupted: false, ...state },
  })
  const isHidden = async (ui: { find: (q: { key: string }) => Promise<unknown> }) => (await ui.find({ key: 'realce-hidden' })) !== undefined

  test('foco hides a finished row and its result, keeps a running or failed one', async ($, on) => {
    mock.store(on, { ...PT, flags: { foco: true } })
    engineRow(on, 'ToolUse')
    engineRow(on, 'ToolResult')
    expect(await isHidden(await $.ui.mount(row('Read', { file_path: '/a/b/x.ts' }, {}, 'r1')))).toBe(true)
    expect(await isHidden(await $.ui.mount(row('Read', { file_path: '/a/b/x.ts' }, { isRunning: true }, 'r2')))).toBe(false)
    expect(await isHidden(await $.ui.mount(row('Bash', { command: 'false' }, { isErrored: true }, 'r3')))).toBe(false)
    expect(await isHidden(await $.ui.mount(row('Skill', { skill: 'x' }, {}, 'r4')))).toBe(true)
    expect(await isHidden(await $.ui.mount(row('Skill', { skill: 'x' }, { isErrored: true }, 'r5')))).toBe(false)
    const result = await $.ui.mount({ plugin: 'realce', surface: 'terminal', component: 'ToolResult', requestId: 'r1', props: { tool_use_id: 'r1', tool: 'Read', output: {}, isErrored: false } })
    expect(await isHidden(result)).toBe(true)
    const failed = await $.ui.mount({ plugin: 'realce', surface: 'terminal', component: 'ToolResult', requestId: 'r3', props: { tool_use_id: 'r3', tool: 'Bash', output: 'x', isErrored: true } })
    expect(await failed.find({ text: 'engine' })).toBeDefined()
  })

  test('foco hides a grep with no match, row and result', async ($, on) => {
    mock.store(on, { ...PT, flags: { foco: true } })
    mock.clock(on)
    engineRow(on, 'ToolUse')
    engineRow(on, 'ToolResult')
    on('tool.call', () => ({ isError: true as const, result: 'Exit code 1', text: 'Exit code 1' }))
    await $.tool.call({ tool: 'Bash', command: 'grep -q TODO x.ts', tool_use_id: 'g1' })
    const answered = row('Bash', { command: 'grep -q TODO x.ts' }, { isErrored: true }, 'g1')
    expect(await isHidden(await $.ui.mount({ ...answered, props: { ...answered.props, output: 'Exit code 1' } }))).toBe(true)
    const result = await $.ui.mount({ plugin: 'realce', surface: 'terminal', component: 'ToolResult', requestId: 'g1', props: { tool_use_id: 'g1', tool: 'Bash', output: 'Exit code 1', isErrored: true } })
    expect(await isHidden(result)).toBe(true)
  })

  test('foco after a reload hides an answered row and its result alike', async ($, on) => {
    // From the review: with no tool.call seen (a reload, a resumed session) the row was hidden by its text, the result kept.
    mock.store(on, { ...PT, flags: { foco: true } })
    engineRow(on, 'ToolUse')
    engineRow(on, 'ToolResult')
    const answered = row('Bash', { command: 'grep -q TODO y.ts' }, { isErrored: true }, 'g9')
    expect(await isHidden(await $.ui.mount({ ...answered, props: { ...answered.props, output: 'Exit code 1' } }))).toBe(true)
    const result = await $.ui.mount({ plugin: 'realce', surface: 'terminal', component: 'ToolResult', requestId: 'g9', props: { tool_use_id: 'g9', tool: 'Bash', output: 'Exit code 1', isErrored: true } })
    expect(await isHidden(result)).toBe(true)
  })

  test('foco keeps an interrupted row', async ($, on) => {
    mock.store(on, { ...PT, flags: { foco: true } })
    engineRow(on, 'ToolUse')
    const ui = await $.ui.mount({ ...row('Bash', { command: 'sleep 9' }, {}, 'i1'), props: { ...row('Bash', { command: 'sleep 9' }, {}, 'i1').props, isInterrupted: true } })
    expect(await isHidden(ui)).toBe(false)
  })

  test('foco hides a finished group, keeps one with an error', async ($, on) => {
    mock.store(on, { ...PT, flags: { foco: true } })
    engineRow(on, 'ToolGroup')
    const calls = [{ tool: 'Read', input: { file_path: '/x.ts' }, isRunning: false, isErrored: false, isInterrupted: false }]
    expect(await isHidden(await $.ui.mount({ plugin: 'realce', surface: 'terminal', component: 'ToolGroup', props: { calls, isActive: false, isExpanded: false } }))).toBe(true)
    const withError = [{ ...calls[0]!, isErrored: true }]
    expect(await isHidden(await $.ui.mount({ plugin: 'realce', surface: 'terminal', component: 'ToolGroup', requestId: 'g2', props: { calls: withError, isActive: false, isExpanded: false } }))).toBe(false)
  })

  test('foco off draws as before', async ($, on) => {
    mock.store(on, PT)
    engineRow(on, 'ToolUse')
    expect(await isHidden(await $.ui.mount(row('Read', { file_path: '/a/b/x.ts' })))).toBe(false)
  })

  test('/realce foco toggles the mode', async ($, on) => {
    mock.store(on, PT)
    const RUN = { command: 'realce', origin: { kind: 'composer' as const }, presentation: { isFullscreen: true, columns: 120 } }
    on('ui.invalidate', () => ({ value: undefined }))
    expect((await $.command.run({ ...RUN, args: 'foco' })).text).toBe('Modo foco ligado.')
    expect((await $.command.run({ ...RUN, args: 'foco' })).text).toBe('Modo foco desligado.')
  })
})
