import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { parseTaskNotification } from '../hooks/screen/agents'
import { formatScore, parseTestSummary } from '../hooks/screen/score'
import { SPINNER_WORDS, translateSpinnerMessage } from '../hooks/screen/spinner'
import { summarizeGroup, summarizeTool } from '../hooks/screen/tools'
import { turnRule } from '../hooks/screen/turns'
import type { AgentRow } from '../types'

// Stands for the engine's own drawing of a component beneath the plugin.
function engineRow(on: On, component: 'ToolUse' | 'ToolGroup' | 'ToolResult' | 'TurnDuration' | 'UserMessage' | 'Spinner'): void {
  on('ui.render', { component: component as 'ToolUse' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
}

// Raises session.start with the world beneath it, so `env` holds the session's offset (-03:00).
async function startSession($: Engine, on: On): Promise<void> {
  mock.env(on, { HOME: '/Users/u' })
  on('fs.exists', () => ({ value: false }))
  on('process.run', ($, e) => ({
    value: { exitCode: e.argv[0] === 'date' ? 0 : 1, stdout: e.argv[0] === 'date' ? '-0300\n' : '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
  }))
  on('session.start', () => ({ cwd: '/a/b' }))
  await $.session.start({ cwd: '/a/b', surface: 'terminal', isInteractive: true })
}

const BASH_OK = (stdout: string) => ({ stdout, stderr: '', interrupted: false })
const EDIT_RESULT = {
  filePath: '/a/b/x.ts',
  oldString: 'a',
  newString: 'a\nb\nc',
  originalFile: 'a\n',
  structuredPatch: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 3, lines: [' a', '+b', '+c'] }],
  userModified: false,
  replaceAll: false,
}

// The world beneath the session's events: tools answer, prompts enter, turns end.
function engineEvents(on: On): void {
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('tool.call', ($, e) => {
    if (e.tool === 'Edit') return { result: EDIT_RESULT }
    if (e.tool === 'Bash' && e.command === 'npm test') {
      return { isError: true as const, result: 'Exit code 1\nFAIL src/a.test.ts\nTests:       2 failed, 424 passed, 426 total', text: 'Exit code 1\nFAIL src/a.test.ts\nTests:       2 failed, 424 passed, 426 total' }
    }
    return { result: BASH_OK('===== 12 passed in 0.50s =====') }
  })
  on('turn.complete', () => ({ text: '' }))
}

const TURN = { answer: 'feito', isAborted: false, turnId: 't1', reason: 'answer' as const }

const drawnText = async (ui: { findAll: (q: { key?: string; type?: string }) => Promise<{ text: string }[]> }, key: string) =>
  (await ui.findAll({ key }))[0]?.text

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
    mock.store(on)
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
    mock.store(on)
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

  test('a Bash row draws its command highlighted, two lines at most', async ($, on) => {
    mock.store(on)
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
    mock.store(on)
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
    mock.store(on)
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
    mock.store(on, { flags: { ferramentas: false } })
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

describe('test score', () => {
  const score = (output: string) => {
    const s = parseTestSummary(output)
    return s && [s.passed, s.failed, s.skipped, s.seconds, s.unit]
  }

  test('pytest', () => expect(score('===== 426 passed, 2 failed, 3 skipped in 12.30s =====')).toEqual([426, 2, 3, 12.3, 'testes']))
  test('jest', () => expect(score('Tests:       2 failed, 424 passed, 426 total\nTime:        12.3 s')).toEqual([424, 2, 0, 12.3, 'testes']))
  test('vitest', () => expect(score('      Tests  42 passed | 1 skipped (43)\n   Duration  1.20s')).toEqual([42, 0, 1, 1.2, 'testes']))
  test('bun and claude plugin test', () => expect(score(' 16 pass\n 0 fail\nRan 16 tests across 1 file. [0.62s]')).toEqual([16, 0, 0, 0.62, 'testes']))
  test('mocha', () => expect(score('  42 passing (2s)\n  1 failing')).toEqual([42, 1, 0, 2, 'testes']))
  test('cargo', () => expect(score('test result: ok. 42 passed; 0 failed; 1 ignored; 0 measured; 0 filtered out; finished in 0.52s')).toEqual([42, 0, 1, 0.52, 'testes']))
  test('go', () => expect(score('ok  \tgithub.com/x/a\t0.1s\nFAIL\tgithub.com/x/b\t0.2s')).toEqual([1, 1, 0, undefined, 'pacotes']))
  test('XCTest', () => expect(score('Executed 42 tests, with 1 failure (0 unexpected) in 1.234 (1.300) seconds')).toEqual([41, 1, 0, 1.234, 'testes']))
  test('Swift Testing', () => expect(score('✔ Test run with 42 tests in 5 suites passed after 0.123 seconds.')).toEqual([42, 0, 0, 0.123, 'testes']))

  test('the last summary wins, colors are stripped', () => {
    expect(score('\u001b[32m===== 1 passed in 0.10s =====\u001b[0m\n...\n===== 3 passed, 1 failed in 0.20s =====')).toEqual([3, 1, 0, 0.2, 'testes'])
  })

  test('no summary, no score', () => {
    expect(parseTestSummary('hello')).toBeNull()
    expect(parseTestSummary('0 fail')).toBeNull()
  })

  test('the score line in Portuguese', () => {
    expect(formatScore({ runner: 'pytest', passed: 426, failed: 2, skipped: 3, seconds: 12.3, unit: 'testes' })).toBe('✔ 426 passaram · ✖ 2 falharam · ⏭ 3 pulados · ⏱ 12,3s')
    expect(formatScore({ runner: 'pytest', passed: 1, failed: 1, skipped: 1, unit: 'testes' })).toBe('✔ 1 passou · ✖ 1 falhou · ⏭ 1 pulado')
    expect(formatScore({ runner: 'go', passed: 1, failed: 0, skipped: 0, unit: 'pacotes' })).toBe('✔ 1 pacote passou · ✖ 0 pacotes falharam')
  })

  const bashRow = (props: { output: unknown; isErrored: boolean }) => ({
    plugin: 'realce',
    surface: 'terminal' as const,
    component: 'ToolUse' as const,
    props: { tool_use_id: 't1', tool: 'Bash', input: { command: 'npm test' }, isRunning: false, isInterrupted: false, ...props },
  })

  test('a Bash row carries its test score under the command', async ($, on) => {
    mock.store(on)
    engineRow(on, 'ToolUse')
    const ui = await $.ui.mount(bashRow({ output: BASH_OK('===== 426 passed, 2 failed, 3 skipped in 12.30s ====='), isErrored: false }))
    const score = await ui.find({ key: 'realce-score' })
    expect(score?.text).toBe('  ✔ 426 passaram · ✖ 2 falharam · ⏭ 3 pulados · ⏱ 12,3s')
    expect((await ui.findAll({ type: 'Text' })).find(t => t.text.startsWith('  ✔ 426'))?.props).toMatchObject({ color: '#FF5C63' })
    expect(await ui.find({ text: 'engine' })).toBeUndefined()
  })

  test('an errored run reads the text the model read', async ($, on) => {
    mock.store(on)
    engineRow(on, 'ToolUse')
    const ui = await $.ui.mount(bashRow({ output: 'Exit code 1\n 15 pass\n 1 fail\nRan 16 tests across 1 file. [0.62s]', isErrored: true }))
    expect((await ui.find({ key: 'realce-score' }))?.text).toBe('  ✔ 15 passaram · ✖ 1 falhou · ⏱ 0,62s')
  })

  test('placar off, or no summary, leaves the row without a score', async ($, on) => {
    mock.store(on, { flags: { placar: false } })
    engineRow(on, 'ToolUse')
    const off = await $.ui.mount(bashRow({ output: BASH_OK('===== 1 passed in 0.10s ====='), isErrored: false }))
    expect(await off.find({ key: 'realce-score' })).toBeUndefined()
    const plain = await $.ui.mount(bashRow({ output: BASH_OK('hello'), isErrored: false }))
    expect(await plain.find({ key: 'realce-score' })).toBeUndefined()
  })
})

describe('turn rule', () => {
  test('the rule fits its width and drops what does not fit', () => {
    const stats = { endedAt: Date.UTC(2026, 9, 19, 18, 41), tools: 14, files: 3, tests: { runner: 'jest', passed: 3, failed: 0, skipped: 0, unit: 'testes' as const } }
    const wide = turnRule(stats, 385_600, 80, -180)
    expect(wide.startsWith('── 15:41 · 6m 25s · 14 ferramentas · 3 arquivos · ✔ testes ──')).toBe(true)
    expect(wide.length).toBe(80)
    const narrow = turnRule(stats, 385_600, 30, -180)
    expect(narrow.length).toBeLessThanOrEqual(30)
    expect(narrow).toContain('6m 25s')
  })

  test('an unknown turn shows only its duration', () => {
    expect(turnRule(null, 385_600, 16, -180)).toBe(`── 6m 25s ${'─'.repeat(6)}`)
  })

  test('a turn closes with its stats', async ($, on) => {
    mock.store(on)
    const clock = mock.clock(on, { now: Date.UTC(2026, 9, 19, 18, 35) })
    engineEvents(on)
    engineRow(on, 'TurnDuration')
    await startSession($, on)
    await $.prompt.submit({ text: 'oi', origin: { kind: 'composer' }, wait: false })
    await $.tool.call({ tool: 'Edit', file_path: '/a/b/x.ts', old_string: 'a', new_string: 'a\nb\nc' })
    await $.tool.call({ tool: 'Bash', command: 'npm test' })
    await $.tool.call(inSubagent({ tool: 'Read', file_path: '/a/b/y.ts' }))
    await clock.set(Date.UTC(2026, 9, 19, 18, 41))
    await $.turn.complete({ ...TURN, durationMs: 385_600 })
    const ui = await $.ui.mount({ plugin: 'realce', surface: 'terminal', component: 'TurnDuration', props: { word: 'Baked', durationMs: 385_600 }, viewport: { columns: 100, rows: 40 } })
    const rule = (await drawnText(ui, 'realce-turn')) ?? ''
    expect(rule).toContain('── 15:41 · 6m 25s · 2 ferramentas · 1 arquivo · ✖ 2 testes falharam ──')
    expect(rule.length).toBe(98)
  })

  test('a subagent turn and a call into a running turn leave the main stats alone', async ($, on) => {
    mock.store(on)
    mock.clock(on)
    engineEvents(on)
    engineRow(on, 'TurnDuration')
    await $.prompt.submit({ text: 'oi', origin: { kind: 'composer' }, wait: false })
    await $.tool.call({ tool: 'Bash', command: 'ls' })
    await $.prompt.submit({ text: 'e mais isso', origin: { kind: 'composer' }, wait: false, turnId: 'running' })
    await $.turn.complete({ ...TURN, durationMs: 5_000, agentId: 'sub1' })
    await $.turn.complete({ ...TURN, durationMs: 12_000 })
    const sub = await $.ui.mount({ plugin: 'realce', surface: 'terminal', component: 'TurnDuration', props: { word: 'Baked', durationMs: 5_000 }, viewport: { columns: 40, rows: 40 } })
    expect(await drawnText(sub, 'realce-turn')).toBe(`── 5s ${'─'.repeat(32)}`)
    const main = await $.ui.mount({ plugin: 'realce', surface: 'terminal', component: 'TurnDuration', props: { word: 'Baked', durationMs: 12_000 }, viewport: { columns: 60, rows: 40 } })
    expect(await drawnText(main, 'realce-turn')).toContain('── 12s · 1 ferramenta · 0 arquivos · ✔ testes ──')
  })

  test("the person's prompt stays the engine's own row", async ($, on) => {
    mock.store(on)
    engineRow(on, 'UserMessage')
    const ui = await $.ui.mount({ plugin: 'realce', surface: 'terminal', component: 'UserMessage', props: { text: 'oi', origin: { kind: 'composer' }, isExpanded: false } })
    expect(await ui.find({ text: 'engine' })).toBeDefined()
  })

  test('separador off draws the engine', async ($, on) => {
    mock.store(on, { flags: { separador: false } })
    engineRow(on, 'TurnDuration')
    engineRow(on, 'UserMessage')
    const end = await $.ui.mount({ plugin: 'realce', surface: 'terminal', component: 'TurnDuration', props: { word: 'Baked', durationMs: 5_000 } })
    expect(await end.find({ key: 'realce-turn' })).toBeUndefined()
    expect(await end.find({ text: 'engine' })).toBeDefined()
    const prompt = await $.ui.mount({ plugin: 'realce', surface: 'terminal', component: 'UserMessage', props: { text: 'oi', origin: { kind: 'composer' }, isExpanded: false } })
    expect(await prompt.find({ key: 'realce-prompt-rule' })).toBeUndefined()
  })
})

describe('session tracking', () => {
  test('edits and failed commands reach the session lists', async ($, on) => {
    mock.store(on)
    mock.clock(on, { now: 1_000 })
    engineEvents(on)
    const written = watchState(on)
    await $.prompt.submit({ text: 'oi', origin: { kind: 'composer' }, wait: false })
    await $.tool.call({ tool: 'Edit', file_path: '/a/b/x.ts', old_string: 'a', new_string: 'a\nb\nc' })
    await $.tool.call({ tool: 'Edit', file_path: '/a/b/x.ts', old_string: 'a', new_string: 'a\nb\nc' })
    await $.tool.call({ tool: 'Bash', command: 'npm test' })
    expect((await $.tool.call(inSubagent({ tool: 'Edit', file_path: '/a/b/z.ts', old_string: 'a', new_string: 'b' }))).deny).toBeUndefined()
    expect(written.files).toEqual([{ path: '/a/b/x.ts', added: 4, removed: 0, edits: 2, at: 1_000 }])
    expect(written.failures).toEqual([{ command: 'npm test', line: 'Tests:       2 failed, 424 passed, 426 total', at: 1_000 }])
  })

  test('the master switch off tracks nothing', async ($, on) => {
    mock.store(on, { master: false })
    mock.clock(on)
    engineEvents(on)
    const written = watchState(on)
    await $.prompt.submit({ text: 'oi', origin: { kind: 'composer' }, wait: false })
    await $.tool.call({ tool: 'Edit', file_path: '/a/b/x.ts', old_string: 'a', new_string: 'b' })
    await $.turn.complete({ ...TURN, durationMs: 1_000 })
    expect(Object.keys(written)).toEqual([])
  })
})

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
    mock.store(on)
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
    mock.store(on)
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
    mock.store(on)
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
    mock.store(on)
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

describe('spinner', () => {
  const spinner = async ($: Engine, on: On, props: { mode: 'thinking' | 'tool-use'; message: string | null }) => {
    let seen = { word: '', message: null as string | null }
    on('ui.render', { component: 'Spinner' }, ($, e) => {
      seen = { word: e.props.word, message: e.props.message }
      const { Text } = $.ui.resolve(e)
      return <Text>engine</Text>
    })
    await $.ui.mount({ plugin: 'realce', surface: 'terminal', component: 'Spinner', props: { word: 'Sauteing', suffix: '…', ...props } })
    return seen
  }

  test('the spinner word follows the mode in Portuguese', async ($, on) => {
    mock.store(on)
    expect(await spinner($, on, { mode: 'thinking', message: null })).toEqual({ word: 'Pensando', message: null })
    expect(SPINNER_WORDS['tool-use']).toBe('Executando')
  })

  test('known messages are translated, others kept', async ($, on) => {
    expect(translateSpinnerMessage('Waiting for 1 background agent to finish')).toBe('Esperando 1 agente em segundo plano')
    expect(translateSpinnerMessage('Waiting for 3 background agents to finish…')).toBe('Esperando 3 agentes em segundo plano…')
    expect(translateSpinnerMessage('Compacting conversation')).toBe('Compactando a conversa')
    expect(translateSpinnerMessage('Doing something else')).toBe('Doing something else')
    mock.store(on)
    expect((await spinner($, on, { mode: 'tool-use', message: 'Compacting conversation' })).message).toBe('Compactando a conversa')
  })

  test('spinner off keeps the engine word', async ($, on) => {
    mock.store(on, { flags: { spinner: false } })
    expect((await spinner($, on, { mode: 'thinking', message: null })).word).toBe('Sauteing')
  })
})

// A subagent's call: the kit's typing leaves agentId to the engine, which stamps it on a subagent's loop.
const inSubagent = <C extends object>(call: C): C => ({ ...call, agentId: 'sub1' })

// What the plugin wrote to its session state, last value per key, as the kit beneath stores it.
function watchState(on: On): Record<string, unknown> {
  const written: Record<string, unknown> = {}
  on('state.set', ($, e, next) => {
    written[e.key] = e.value
    return next(e)
  })
  return written
}
