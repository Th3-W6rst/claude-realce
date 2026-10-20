import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { parseTaskNotification } from '../hooks/screen/agents'
import { formatScore, parseTestSummary } from '../hooks/screen/score'
import { activityOf, isTestCommand, runningWord, SPINNER_WORDS, translateSpinnerMessage } from '../hooks/screen/spinner'
import { summarizeGroup, summarizeTool } from '../hooks/screen/tools'
import { isAnswerExit, isAnswerStyle } from '../hooks/screen/explainError'
import { shellCommands } from '../hooks/screen/toolInfo'
import { cardText, commitCards } from '../hooks/screen/commit'
import { claimsDone, sealOf } from '../hooks/screen/seal'
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
  on('config.list', () => ({ value: [] }))
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

  test('a call with its result is settled, whatever isRunning says', async ($, on) => {
    // Seen live: a pytest that wrote files kept isRunning true on every draw after its result came back.
    mock.store(on)
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
  test('node --test', () => expect(score('ℹ tests 12\nℹ suites 0\nℹ pass 11\nℹ fail 1\nℹ cancelled 0\nℹ skipped 2\nℹ todo 0\nℹ duration_ms 52.3')).toEqual([11, 1, 2, 0.0523, 'testes']))
  test('node --test, the TAP spelling', () => expect(score('# tests 3\n# pass 3\n# fail 0\n# skipped 0\n# duration_ms 8.1')).toEqual([3, 0, 0, 0.0081, 'testes']))
  test('rspec', () => expect(score('Finished in 0.5 seconds (files took 0.2 seconds to load)\n12 examples, 1 failure, 2 pending')).toEqual([9, 1, 2, 0.5, 'testes']))
  test('deno', () => expect(score('FAILED | 11 passed | 1 failed | 2 ignored (60ms)')).toEqual([11, 1, 2, 0.06, 'testes']))
  test('deno with filtered tests, steps and minutes', () => {
    expect(score('ok | 12 passed | 0 failed | 2 filtered out (12ms)')).toEqual([12, 0, 0, 0.012, 'testes'])
    expect(score('FAILED | 3 passed (4 steps) | 1 failed (1 step) (40ms)')).toEqual([3, 1, 0, 0.04, 'testes'])
    expect(score('ok | 9 passed | 0 failed (1m6s)')).toEqual([9, 0, 0, 66, 'testes'])
  })
  test('a doc that mentions examples or tests is no score', () => {
    expect(parseTestSummary('README:\n12 examples, 0 failures\nfim')).toBeNull()
    expect(parseTestSummary('# tests 3\n\nnotas')).toBeNull()
    expect(parseTestSummary('ℹ tests 3')).toBeNull()
  })
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
    const stats = { endedAt: Date.UTC(2026, 9, 19, 18, 41), tools: 14, files: 3, tests: { runner: 'jest', passed: 3, failed: 0, skipped: 0, unit: 'testes' as const }, seal: null }
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
    expect(rule).toContain('── 15:41 · 6m 25s · ✖ afirmou com testes falhando · 2 ferramentas · ✖ 2 testes falharam ──')
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
    expect(await drawnText(main, 'realce-turn')).toContain('── 12s · ✔ provado · 1 ferramenta · ✔ testes ──')
  })

  test('a count of nothing stays off the rule', async ($, on) => {
    mock.store(on)
    mock.clock(on)
    engineEvents(on)
    engineRow(on, 'TurnDuration')
    await $.prompt.submit({ text: 'oi', origin: { kind: 'composer' }, wait: false })
    await $.tool.call({ tool: 'Bash', command: 'ls' })
    await $.turn.complete({ ...TURN, answer: 'aqui está', durationMs: 2_000 })
    const ui = await $.ui.mount({ plugin: 'realce', surface: 'terminal', component: 'TurnDuration', props: { word: 'Baked', durationMs: 2_000 }, viewport: { columns: 120, rows: 40 } })
    const rule = (await drawnText(ui, 'realce-turn')) ?? ''
    expect(rule).toContain('1 ferramenta')
    expect(rule).not.toContain('arquivos')
    await $.prompt.submit({ text: 'e aí?', origin: { kind: 'composer' }, wait: false })
    await $.turn.complete({ ...TURN, answer: 'nada a fazer', turnId: 't2', durationMs: 1_000 })
    const bare = await $.ui.mount({ plugin: 'realce', surface: 'terminal', component: 'TurnDuration', props: { word: 'Baked', durationMs: 1_000 }, viewport: { columns: 120, rows: 40 } })
    expect(await drawnText(bare, 'realce-turn')).not.toContain('ferramentas')
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

const PASSED = { runner: 'pytest', passed: 12, failed: 0, skipped: 0, unit: 'testes' as const }
const FAILED = { ...PASSED, passed: 10, failed: 2 }

const GIT_STDOUT = '[main 9cd805a] realce 0.3.0: tudo\n 8 files changed, 120 insertions(+), 3 deletions(-)\n'

describe('commit card', () => {
  test('a commit, a push, a PR and a merge read as one line each', () => {
    const commit = commitCards({ stdout: GIT_STDOUT, stderr: '', gitOperation: { commit: { sha: '9cd805a1b2c3', kind: 'committed', branch: 'main' } } })
    expect(commit.map(cardText)).toEqual(['● commit 9cd805a · main · realce 0.3.0: tudo · 8 arquivos +120 −3'])
    const both = commitCards({ stdout: GIT_STDOUT, stderr: '', gitOperation: { commit: { sha: '9cd805a1b2c3', kind: 'amended' }, push: { branch: 'main' } } })
    expect(both.map(cardText)).toEqual(['● amend 9cd805a · main · realce 0.3.0: tudo · 8 arquivos +120 −3', '↑ push main'])
    expect(commitCards({ stdout: '', gitOperation: { pr: { number: 12, url: 'https://github.com/o/r/pull/12', action: 'created' } } }).map(cardText)).toEqual(['⇡ PR #12 criado · https://github.com/o/r/pull/12'])
    expect(commitCards({ stdout: '', gitOperation: { branch: { ref: 'feat/x', action: 'merged' } } }).map(cardText)).toEqual(['⎇ mesclou feat/x'])
    expect(commitCards({ stdout: 'ok' })).toEqual([])
  })

  const gitRow = (output: unknown, columns = 100) => ({
    plugin: 'realce' as const,
    surface: 'terminal' as const,
    component: 'ToolUse' as const,
    props: { tool_use_id: 'g1', tool: 'Bash', input: { command: 'git commit -m "realce 0.3.0: tudo"' }, isRunning: false, isErrored: false, isInterrupted: false, output },
    viewport: { columns, rows: 40 },
  })
  const OUTPUT = { stdout: GIT_STDOUT, stderr: '', interrupted: false, gitOperation: { commit: { sha: '9cd805a1b2c3', kind: 'committed', branch: 'main' } } }

  test('a Bash row with a git operation draws the card', async ($, on) => {
    mock.store(on)
    engineRow(on, 'ToolUse')
    const ui = await $.ui.mount(gitRow(OUTPUT))
    expect(await drawnText(ui, 'realce-tool')).toBe('● commit 9cd805a · main · realce 0.3.0: tudo · 8 arquivos +120 −3')
  })

  test('without a git operation, or with commits off, the command row', async ($, on) => {
    mock.store(on, { flags: { commits: false } })
    engineRow(on, 'ToolUse')
    expect(await drawnText(await $.ui.mount(gitRow(OUTPUT)), 'realce-tool')).toMatch(/^▶ git commit/)
  })

  test('a folded group names the commit it holds', async ($, on) => {
    mock.store(on)
    mock.clock(on)
    engineRow(on, 'ToolGroup')
    on('tool.call', { tool: 'Bash' }, () => ({ result: OUTPUT }))
    await $.tool.call({ tool: 'Bash', command: 'git commit -m x', tool_use_id: 'g1' })
    const calls = [
      { tool_use_id: 'p1', tool: 'Bash', input: { command: 'pytest' }, isRunning: false, isErrored: false, isInterrupted: false },
      { tool_use_id: 'g1', tool: 'Bash', input: { command: 'git commit -m x' }, isRunning: false, isErrored: false, isInterrupted: false },
    ]
    const ui = await $.ui.mount({ plugin: 'realce', surface: 'terminal', component: 'ToolGroup', props: { calls, isActive: false, isExpanded: false } })
    expect(await drawnText(ui, 'realce-group')).toBe('◇ Rodou 2 comandos · ● commit 9cd805a')
  })

  test('a group draw reads no state once the cards are known', async ($, on) => {
    mock.store(on)
    mock.clock(on)
    engineRow(on, 'ToolGroup')
    let reads = 0
    on('state.get', ($, e, next) => {
      if ((e as { key?: string }).key === 'commits' || (e as { key?: string }).key === 'explanations') reads++
      return next(e)
    })
    on('tool.call', { tool: 'Bash' }, () => ({ result: OUTPUT }))
    await $.tool.call({ tool: 'Bash', command: 'git commit -m x', tool_use_id: 'g1' })
    const calls = [{ tool_use_id: 'g1', tool: 'Bash', input: { command: 'git commit -m x' }, isRunning: false, isErrored: false, isInterrupted: false }]
    const ui = await $.ui.mount({ plugin: 'realce', surface: 'terminal', component: 'ToolGroup', props: { calls, isActive: false, isExpanded: false } })
    const before = reads
    for (let i = 0; i < 3; i++) await ui.redraw({ calls, isActive: false, isExpanded: false })
    expect(reads - before).toBe(0)
    expect(await drawnText(ui, 'realce-group')).toBe('◇ Rodou 1 comando · ● commit 9cd805a')
  })

  test('the card fits 40 columns on one line', async ($, on) => {
    mock.store(on)
    engineRow(on, 'ToolUse')
    const ui = await $.ui.mount(gitRow(OUTPUT, 40))
    const card = (await ui.findAll({ type: 'Text' })).find(t => t.text.startsWith('● commit'))
    expect(card?.props.wrap).toBe('truncate-end')
  })
})

const USAGE = { input_tokens: 120, output_tokens: 14, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }

describe('error explained', () => {
  type Ask = { model: string; system?: unknown; prompt: unknown; maxTokens?: number; timeoutMs?: number }

  function explainWorld(on: On, answer: (req: Ask) => unknown) {
    const asked: Ask[] = []
    on('model.complete', ($, e) => {
      asked.push(e as unknown as Ask)
      const r = answer(e as unknown as Ask) as Record<string, unknown>
      return ('deny' in r ? r : { value: r }) as never
    })
    on('tool.call', { tool: 'Bash' }, ($, e) => {
      const command = String(e.command)
      if (command === 'grep x sumiu.txt') return { isError: true as const, result: 'Exit code 2\ngrep: sumiu.txt: No such file or directory', text: 'Exit code 2\ngrep: sumiu.txt: No such file or directory' }
      if (command.startsWith('grep') || command.startsWith('test ')) return { isError: true as const, result: 'Exit code 1', text: 'Exit code 1' }
      if (command === 'quiet') return { isError: true as const, result: '', text: '' }
      if (command === 'stopped') return { isError: true as const, result: { stdout: 'parcial', stderr: '', interrupted: true }, text: 'Interrompido' }
      return { isError: true as const, result: `Exit code 1\n${command}: No such file or directory`, text: `Exit code 1\n${command}: No such file or directory` }
    })
    return asked
  }

  const failedRow = (id: string, command: string) => ({
    plugin: 'realce' as const,
    surface: 'terminal' as const,
    component: 'ToolUse' as const,
    requestId: id,
    props: { tool_use_id: id, tool: 'Bash', input: { command }, isRunning: false, isErrored: true, isInterrupted: false },
  })
  const why = async (ui: { findAll: (q: { type: string }) => Promise<{ text: string }[]> }) => (await ui.findAll({ type: 'Text' })).map(t => t.text).find(t => t.startsWith('↳'))

  test('the model is told who ran the command, and how short to be', async ($, on) => {
    // Seen live: "O comando falhou porque você tentou ler…", to a person who ran nothing, cut mid-sentence at 200 chars.
    mock.store(on)
    const clock = mock.clock(on)
    const asked = explainWorld(on, () => ({ isAnswered: true, text: 'O arquivo não existe.', usage: USAGE }))
    await $.tool.call({ tool: 'Bash', command: 'cat sumiu.txt', tool_use_id: 'b1' })
    await clock.settle()
    const system = String(asked[0]?.system)
    expect(system).toContain('assistente')
    expect(system).toContain('nunca "você"')
    expect(system).toContain('25 palavras')
  })

  test('a failed command gets one sentence', async ($, on) => {
    mock.store(on)
    const clock = mock.clock(on)
    engineRow(on, 'ToolUse')
    const asked = explainWorld(on, () => ({ isAnswered: true, text: 'O arquivo não existe.', usage: USAGE }))
    await $.tool.call({ tool: 'Bash', command: 'cat sumiu.txt', tool_use_id: 'b1' })
    const ui = await $.ui.mount(failedRow('b1', 'cat sumiu.txt'))
    expect(await why(ui)).toBe('↳ Explicando…')
    await clock.settle()
    expect(await why(ui)).toBe('↳ Por quê: O arquivo não existe.')
    // The indent is the box's, so a long sentence wraps under itself and not at the left edge.
    expect(await ui.find({ key: 'realce-why' })).toMatchObject({ props: { paddingLeft: 2 } })
    expect(asked).toHaveLength(1)
    expect(asked[0]).toMatchObject({ model: 'haiku', maxTokens: 200, timeoutMs: 20000 })
    expect(String(asked[0]!.system)).toContain('em UMA frase de no máximo 25 palavras, em português simples')
    expect(String(asked[0]!.prompt)).toContain('cat sumiu.txt')
  })

  test('a folded group shows the sentence of its failed command', async ($, on) => {
    mock.store(on)
    const clock = mock.clock(on)
    engineRow(on, 'ToolGroup')
    explainWorld(on, () => ({ isAnswered: true, text: 'O arquivo não existe.', usage: USAGE }))
    await $.tool.call({ tool: 'Bash', command: 'cat sumiu.txt', tool_use_id: 'b1' })
    await clock.settle()
    const calls = [{ tool_use_id: 'b1', tool: 'Bash', input: { command: 'cat sumiu.txt' }, isRunning: false, isErrored: true, isInterrupted: false }]
    const ui = await $.ui.mount({ plugin: 'realce', surface: 'terminal', component: 'ToolGroup', props: { calls, isActive: false, isExpanded: false } })
    expect(await why(ui)).toBe('↳ Por quê: O arquivo não existe.')
  })

  test('a long answer is cut to two lines', async ($, on) => {
    mock.store(on)
    const clock = mock.clock(on)
    engineRow(on, 'ToolUse')
    explainWorld(on, () => ({ isAnswered: true, text: `O comando falhou ${'porque sim '.repeat(40)}`, usage: USAGE }))
    await $.tool.call({ tool: 'Bash', command: 'cat sumiu.txt', tool_use_id: 'b1' })
    await clock.settle()
    const line = (await why(await $.ui.mount(failedRow('b1', 'cat sumiu.txt')))) ?? ''
    expect([...line].length).toBeLessThanOrEqual('↳ Por quê: '.length + 200)
    expect(line.endsWith('…')).toBe(true)
  })

  test('an explanation a reload cut short says so', async ($, on) => {
    mock.store(on)
    mock.clock(on)
    engineRow(on, 'ToolUse')
    explainWorld(on, () => ({ isAnswered: true, text: 'x', usage: USAGE }))
    on('config.list', () => ({ value: [] }))
    on('session.start', () => ({ cwd: '/a/b' }))
    mock.env(on, { HOME: '/Users/u' })
    on('fs.exists', () => ({ value: false }))
    await $.tool.call({ tool: 'Bash', command: 'cat sumiu.txt', tool_use_id: 'b1' })
    await $.session.start({ cwd: '/a/b', surface: 'terminal', isInteractive: true })
    expect(await why(await $.ui.mount(failedRow('b1', 'cat sumiu.txt')))).toBe('↳ Sem explicação: interrompida ao recarregar o mod')
  })

  test('the same error is explained once', async ($, on) => {
    mock.store(on)
    const clock = mock.clock(on)
    const asked = explainWorld(on, () => ({ isAnswered: true, text: 'x', usage: USAGE }))
    await $.tool.call({ tool: 'Bash', command: 'cat a', tool_use_id: 'b1' })
    await $.tool.call({ tool: 'Bash', command: 'cat a', tool_use_id: 'b2' })
    await clock.settle()
    expect(asked).toHaveLength(1)
  })

  test('status counts the explanations sent', async ($, on) => {
    mock.store(on)
    const clock = mock.clock(on)
    explainWorld(on, () => ({ isAnswered: true, text: 'x', usage: USAGE }))
    on('prompt.compose', () => ({ sections: [] }))
    await $.tool.call({ tool: 'Bash', command: 'cat a', tool_use_id: 'b1' })
    await $.tool.call({ tool: 'Bash', command: 'cat b', tool_use_id: 'b2' })
    await clock.settle()
    const RUN = { command: 'realce', origin: { kind: 'composer' as const }, presentation: { isFullscreen: true, columns: 120 } }
    expect((await $.command.run({ ...RUN, args: 'status' })).text).toMatch(/Erros explicados pelo Haiku nesta sessão: 2 de 20\./)
  })

  test('the 21st error is not sent', async ($, on) => {
    mock.store(on)
    const clock = mock.clock(on)
    const asked = explainWorld(on, () => ({ isAnswered: true, text: 'x', usage: USAGE }))
    for (let i = 0; i < 21; i++) await $.tool.call({ tool: 'Bash', command: `cat f${i}`, tool_use_id: `b${i}` })
    await clock.settle()
    expect(asked).toHaveLength(20)
  })

  test('a model failure says why, once', async ($, on) => {
    mock.store(on)
    const clock = mock.clock(on)
    engineRow(on, 'ToolUse')
    const asked = explainWorld(on, () => ({ isAnswered: false, reason: 'api-error', status: 529, error: { kind: 'overloaded' }, usage: USAGE }))
    await $.tool.call({ tool: 'Bash', command: 'cat a', tool_use_id: 'b1' })
    await clock.settle()
    expect(await why(await $.ui.mount(failedRow('b1', 'cat a')))).toBe('↳ Sem explicação: api-error')
    expect(asked).toHaveLength(1)
  })

  test('a call that throws says why', async ($, on) => {
    mock.store(on)
    const clock = mock.clock(on)
    engineRow(on, 'ToolUse')
    explainWorld(on, () => ({ deny: 'sem rede' }))
    await $.tool.call({ tool: 'Bash', command: 'cat a', tool_use_id: 'b1' })
    await clock.settle()
    expect(await why(await $.ui.mount(failedRow('b1', 'cat a')))).toMatch(/^↳ Sem explicação: .*sem rede/)
  })

  test('answer-style failures are not explained', async ($, on) => {
    mock.store(on)
    const clock = mock.clock(on)
    const asked = explainWorld(on, () => ({ isAnswered: true, text: 'x', usage: USAGE }))
    for (const [i, command] of ['grep foo x.ts', 'test -f a && echo sim', 'quiet', 'stopped'].entries()) await $.tool.call({ tool: 'Bash', command, tool_use_id: `q${i}` })
    await clock.settle()
    expect(asked).toHaveLength(0)
  })

  test('an exit code is an answer only where the command makes 1 a no', () => {
    expect(isAnswerExit('grep -q x f', 'Exit code 1')).toBe(true)
    expect(isAnswerExit('test -f a && echo sim', 'Exit code 1')).toBe(true)
    expect(isAnswerExit('grep x sumiu.txt', 'Exit code 2\ngrep: sumiu.txt: No such file or directory')).toBe(false)
    expect(isAnswerExit('cat x', 'Exit code 1\ncat: x: No such file or directory')).toBe(false)
    // No exit code (a timeout, a sandbox refusal) is no answer.
    expect(isAnswerExit('which mmdc', '')).toBe(false)
    expect(isAnswerExit('grep -r x .', 'Command timed out after 2m')).toBe(false)
  })

  test('a grep that could not read its file is explained', async ($, on) => {
    mock.store(on)
    const clock = mock.clock(on)
    const asked = explainWorld(on, () => ({ isAnswered: true, text: 'x', usage: USAGE }))
    await $.tool.call({ tool: 'Bash', command: 'grep x sumiu.txt', tool_use_id: 'g2' })
    await clock.settle()
    expect(asked).toHaveLength(1)
  })

  test('erros off sends nothing', async ($, on) => {
    mock.store(on, { flags: { erros: false } })
    const clock = mock.clock(on)
    const asked = explainWorld(on, () => ({ isAnswered: true, text: 'x', usage: USAGE }))
    await $.tool.call({ tool: 'Bash', command: 'cat a', tool_use_id: 'b1' })
    await clock.settle()
    expect(asked).toHaveLength(0)
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
    mock.store(on, { flags: { foco: true } })
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
    mock.store(on, { flags: { foco: true } })
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
    mock.store(on, { flags: { foco: true } })
    engineRow(on, 'ToolUse')
    engineRow(on, 'ToolResult')
    const answered = row('Bash', { command: 'grep -q TODO y.ts' }, { isErrored: true }, 'g9')
    expect(await isHidden(await $.ui.mount({ ...answered, props: { ...answered.props, output: 'Exit code 1' } }))).toBe(true)
    const result = await $.ui.mount({ plugin: 'realce', surface: 'terminal', component: 'ToolResult', requestId: 'g9', props: { tool_use_id: 'g9', tool: 'Bash', output: 'Exit code 1', isErrored: true } })
    expect(await isHidden(result)).toBe(true)
  })

  test('foco keeps an interrupted row', async ($, on) => {
    mock.store(on, { flags: { foco: true } })
    engineRow(on, 'ToolUse')
    const ui = await $.ui.mount({ ...row('Bash', { command: 'sleep 9' }, {}, 'i1'), props: { ...row('Bash', { command: 'sleep 9' }, {}, 'i1').props, isInterrupted: true } })
    expect(await isHidden(ui)).toBe(false)
  })

  test('foco hides a finished group, keeps one with an error', async ($, on) => {
    mock.store(on, { flags: { foco: true } })
    engineRow(on, 'ToolGroup')
    const calls = [{ tool: 'Read', input: { file_path: '/x.ts' }, isRunning: false, isErrored: false, isInterrupted: false }]
    expect(await isHidden(await $.ui.mount({ plugin: 'realce', surface: 'terminal', component: 'ToolGroup', props: { calls, isActive: false, isExpanded: false } }))).toBe(true)
    const withError = [{ ...calls[0]!, isErrored: true }]
    expect(await isHidden(await $.ui.mount({ plugin: 'realce', surface: 'terminal', component: 'ToolGroup', requestId: 'g2', props: { calls: withError, isActive: false, isExpanded: false } }))).toBe(false)
  })

  test('foco off draws as before', async ($, on) => {
    mock.store(on)
    engineRow(on, 'ToolUse')
    expect(await isHidden(await $.ui.mount(row('Read', { file_path: '/a/b/x.ts' })))).toBe(false)
  })

  test('/realce foco toggles the mode', async ($, on) => {
    mock.store(on)
    const RUN = { command: 'realce', origin: { kind: 'composer' as const }, presentation: { isFullscreen: true, columns: 120 } }
    on('ui.invalidate', () => ({ value: undefined }))
    expect((await $.command.run({ ...RUN, args: 'foco' })).text).toBe('Modo foco ligado.')
    expect((await $.command.run({ ...RUN, args: 'foco' })).text).toBe('Modo foco desligado.')
  })
})

describe('proof seal', () => {
  test('a claim of delivery is found, a negated one is not', () => {
    for (const text of ['Pronto: 159 testes passam', '> [!FEITO] Publicado', 'Corrigido e testado.', 'Fixed the bug', 'Tudo verde agora.']) expect(claimsDone(text)).toBe(true)
    for (const text of ['Ainda não está pronto', 'Vou rodar os testes.', 'not done yet', 'O que falta?', 'Não está corrigido ainda.']) expect(claimsDone(text)).toBe(false)
  })

  test('contracted, short and cross-sentence negations read right', () => {
    for (const text of ["It isn't done yet.", "This isn't fixed.", "It hasn't been implemented.", 'Nem terminei.', 'Não sei se está pronto.', 'Nunca funcionando direito.']) expect(claimsDone(text)).toBe(false)
    for (const text of ['Não encontrei erros. Pronto.', 'Os testes ainda passam.', 'Não achei nada estranho, está pronto.']) expect(claimsDone(text)).toBe(true)
  })

  test('the seal weighs the claim against the tests after the last edit', () => {
    expect(sealOf({ hasEdits: true, testsSinceEdit: null, tests: PASSED }, 'Pronto.')).toBe('unproved')
    expect(sealOf({ hasEdits: true, testsSinceEdit: FAILED, tests: FAILED }, 'Pronto.')).toBe('failing')
    expect(sealOf({ hasEdits: true, testsSinceEdit: PASSED, tests: PASSED }, 'Pronto.')).toBe('proved')
    expect(sealOf({ hasEdits: false, testsSinceEdit: null, tests: null }, 'Pronto.')).toBeNull()
    expect(sealOf({ hasEdits: false, testsSinceEdit: PASSED, tests: PASSED }, 'Pronto.')).toBe('proved')
    expect(sealOf({ hasEdits: true, testsSinceEdit: PASSED, tests: PASSED }, 'Vou olhar o resto.')).toBeNull()
  })

  async function turnWith($: Engine, on: On, calls: readonly object[], answer: string, flags: Record<string, boolean> = {}, columns = 100) {
    mock.store(on, { flags })
    mock.clock(on)
    engineEvents(on)
    engineRow(on, 'TurnDuration')
    await $.prompt.submit({ text: 'oi', origin: { kind: 'composer' }, wait: false })
    for (const call of calls) await $.tool.call(call as Parameters<Engine['tool']['call']>[0])
    await $.turn.complete({ ...TURN, answer, durationMs: 7_000 })
    const ui = await $.ui.mount({ plugin: 'realce', surface: 'terminal', component: 'TurnDuration', props: { word: 'Baked', durationMs: 7_000 }, viewport: { columns, rows: 40 } })
    return (await drawnText(ui, 'realce-turn')) ?? ''
  }

  const EDIT = { tool: 'Edit', file_path: '/a/b/x.ts', old_string: 'a', new_string: 'b' }
  const GREEN = { tool: 'Bash', command: 'pytest' }

  test('an edit after the tests makes them stale', async ($, on) => {
    expect(await turnWith($, on, [EDIT, GREEN, EDIT], 'Pronto.')).toContain('── 7s · ⚠ sem prova ·')
  })

  test('tests after the last edit prove it', async ($, on) => {
    expect(await turnWith($, on, [EDIT, GREEN], 'Pronto.')).toContain('── 7s · ✔ provado ·')
  })

  test('a sed -i after the tests makes them stale', async ($, on) => {
    on('tool.call', { tool: 'Bash', command: 'sed -i s/a/b/ x.ts' }, () => ({
      result: { ...BASH_OK(''), bashEditDiff: { files: [{ filePath: '/a/b/x.ts', hunks: [] }], moreFiles: 0 } },
    }))
    expect(await turnWith($, on, [EDIT, GREEN, { tool: 'Bash', command: 'sed -i s/a/b/ x.ts' }], 'Pronto.')).toContain('⚠ sem prova')
  })

  test("a subagent's tests prove a subagent's edit", async ($, on) => {
    expect(await turnWith($, on, [inSubagent(EDIT), inSubagent(GREEN)], 'Pronto.')).toContain('✔ provado')
  })

  test("a subagent's edit after the tests makes them stale", async ($, on) => {
    expect(await turnWith($, on, [GREEN, inSubagent(EDIT)], 'Pronto.')).toContain('⚠ sem prova')
  })

  test('no claim, no seal', async ($, on) => {
    expect(await turnWith($, on, [EDIT], 'Vou olhar o resto amanhã.')).not.toMatch(/provado|sem prova|afirmou/)
  })

  test('the seal survives a narrow rule', async ($, on) => {
    const rule = await turnWith($, on, [EDIT, GREEN], 'Pronto.', {}, 30)
    expect(rule).toContain('7s · ✔ provado')
    expect([...rule].length).toBeLessThanOrEqual(28)
  })

  test('a failing seal keeps a short form on a narrow rule', async ($, on) => {
    const rule = await turnWith($, on, [EDIT, { tool: 'Bash', command: 'npm test' }], 'Pronto.', {}, 40)
    expect(rule).toContain('7s · ✖ falhando')
    expect([...rule].length).toBeLessThanOrEqual(38)
  })

  test('selo on with separador off draws the seal alone', async ($, on) => {
    expect(await turnWith($, on, [EDIT, GREEN], 'Pronto.', { separador: false }, 40)).toBe(`── ✔ provado ${'─'.repeat(25)}`)
  })

  test('selo off draws no seal', async ($, on) => {
    expect(await turnWith($, on, [EDIT, GREEN], 'Pronto.', { selo: false })).not.toContain('provado')
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
    expect(written.failures).toMatchObject([{ command: 'npm test', line: 'Tests:       2 failed, 424 passed, 426 total', at: 1_000 }])
    expect(typeof (written.failures as { toolUseId?: string }[])[0]?.toolUseId).toBe('string')
  })

  test('a command whose exit code is an answer, or one cut short, is no failure', async ($, on) => {
    mock.store(on)
    mock.clock(on, { now: 1_000 })
    on('tool.call', { tool: 'Bash' }, ($, e) => {
      const command = String(e.command)
      if (command === 'stopped') return { isError: true as const, result: { stdout: 'parcial', stderr: '', interrupted: true }, text: 'Interrompido' }
      return { isError: true as const, result: `Exit code 1\n${command}: falhou`, text: `Exit code 1\n${command}: falhou` }
    })
    const written = watchState(on)
    await $.tool.call({ tool: 'Bash', command: 'grep -q TODO hooks/flags.ts' })
    await $.tool.call({ tool: 'Bash', command: 'test -f nada.txt' })
    await $.tool.call({ tool: 'Bash', command: 'stopped' })
    expect(written.failures).toBeUndefined()
    await $.tool.call({ tool: 'Bash', command: 'cat sumiu.txt' })
    expect(written.failures).toMatchObject([{ command: 'cat sumiu.txt' }])
  })

  test('a no-match row reads as an answer, not an error', async ($, on) => {
    mock.store(on)
    engineRow(on, 'ToolUse')
    engineRow(on, 'ToolGroup')
    const call = { tool_use_id: 'n1', tool: 'Bash', input: { command: 'grep -q TODO hooks/flags.ts' }, isRunning: false, isErrored: true, isInterrupted: false, output: 'Exit code 1' }
    const row = await $.ui.mount({ plugin: 'realce', surface: 'terminal', component: 'ToolUse', requestId: 'n1', props: call })
    const text = (await drawnText(row, 'realce-tool')) ?? ''
    expect(text.startsWith('✖')).toBe(false)
    expect(text).toContain('sem resultado')
    const group = await $.ui.mount({ plugin: 'realce', surface: 'terminal', component: 'ToolGroup', props: { calls: [call], isActive: false, isExpanded: false } })
    expect(await drawnText(group, 'realce-group')).not.toContain('com erro')
  })

  test('a folded group without outputs still counts a real grep error', async ($, on) => {
    // Seen live: the group's calls came without output, and a grep that exited 2 lost its "com erro".
    mock.store(on)
    mock.clock(on)
    engineRow(on, 'ToolGroup')
    on('tool.call', { tool: 'Bash' }, ($, e) =>
      String(e.command).startsWith('grep -q')
        ? { isError: true as const, result: 'Exit code 1', text: 'Exit code 1' }
        : { isError: true as const, result: 'Exit code 2\ngrep: sumiu.txt: No such file or directory', text: 'Exit code 2\ngrep: sumiu.txt: No such file or directory' },
    )
    await $.tool.call({ tool: 'Bash', command: 'grep -q nada calc.py', tool_use_id: 'a1' })
    await $.tool.call({ tool: 'Bash', command: 'grep x sumiu.txt', tool_use_id: 'a2' })
    const calls = [
      { tool_use_id: 'a1', tool: 'Bash', input: { command: 'grep -q nada calc.py' }, isRunning: false, isErrored: true, isInterrupted: false },
      { tool_use_id: 'a2', tool: 'Bash', input: { command: 'grep x sumiu.txt' }, isRunning: false, isErrored: true, isInterrupted: false },
    ]
    const group = await $.ui.mount({ plugin: 'realce', surface: 'terminal', component: 'ToolGroup', props: { calls, isActive: false, isExpanded: false } })
    expect(await drawnText(group, 'realce-group')).toContain('1 com erro')
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

  test('a command splits into what runs, quotes kept whole', () => {
    expect(shellCommands('cd app && npm test')).toEqual([['cd', 'app'], ['npm', 'test']])
    expect(shellCommands('git commit -m "fix; a && b" | cat\nls -la')).toEqual([['git', 'commit', '-m', 'fix; a && b'], ['cat'], ['ls', '-la']])
    expect(shellCommands("(cd x; echo 'it''s') & wait")).toEqual([['cd', 'x'], ['echo', 'its'], ['wait']])
    expect(shellCommands('echo a\\;b ""')).toEqual([['echo', 'a;b', '']])
    expect(isAnswerStyle('grep -q x f && echo ok')).toBe(true)
    expect(isAnswerStyle('command -v mmdc')).toBe(true)
    expect(isAnswerStyle('echo "a; grep x"')).toBe(false)
    expect(isAnswerStyle('cat x')).toBe(false)
    // From the review: a chain whose exit 1 may come from a real failure is no answer.
    expect(isAnswerStyle('npm run build && grep -q ok dist/out')).toBe(false)
    expect(isAnswerStyle('grep -q x f || { echo missing; exit 1; }')).toBe(false)
    expect(isAnswerStyle('cd app && grep -q x f')).toBe(false)
  })

  test('heredoc bodies and comments are not commands', () => {
    expect(shellCommands('cat > a.md <<EOF\ntest coverage is low\nnpm test\nEOF\nls')).toEqual([['cat', '>', 'a.md'], ['ls']])
    expect(shellCommands("cat <<-'END'\n\tnpm test\n\tEND\necho fim")).toEqual([['cat'], ['echo', 'fim']])
    expect(shellCommands('cat <<< "npm test"')).toEqual([['cat', '<<<', 'npm test']])
    expect(shellCommands('grep -q x f 2>&1')).toEqual([['grep', '-q', 'x', 'f', '2>&1']])
    expect(shellCommands('npm test &> log.txt; echo $?')).toEqual([['npm', 'test', '&>', 'log.txt'], ['echo', '$?']])
    expect(shellCommands('make 2>&1 |& tee out')).toEqual([['make', '2>&1'], ['tee', 'out']])
    expect(isAnswerStyle('grep -q x f 2>&1')).toBe(true)
    expect(shellCommands("# don't do this\nnpm test")).toEqual([['npm', 'test']])
    expect(shellCommands('echo a#b # comment')).toEqual([['echo', 'a#b']])
    expect(isTestCommand("# don't do this\nnpm test")).toBe(true)
    expect(isTestCommand('cat > notes.md <<EOF\nnpm test\nEOF')).toBe(false)
    expect(isTestCommand('PYTHONPATH=./src pytest -q')).toBe(true)
  })

  test('a test command is told apart from any other', () => {
    for (const command of [
      'npm test', 'npm run test:unit', 'yarn test', 'pnpm t', 'bun test', 'pytest -q tests/', 'python3 -m pytest', 'python -m unittest',
      'cargo test', 'cargo nextest run', 'go test ./...', 'deno test -A', 'node --test', 'npx vitest run', 'CI=1 npx jest',
      'bundle exec rspec', 'uv run pytest', 'timeout 60 pytest', './gradlew test', 'mvn verify', 'make check', 'swift test',
      'xcodebuild -scheme App test', 'claude plugin test .', 'cd app && npm test', 'tsc -p . && claude plugin test .',
      './node_modules/.bin/jest', 'dotnet test', 'mix test',
      // From the review: interpreters by path, flags before the subcommand, runners through a package manager.
      '.venv/bin/python -m pytest', 'npm --prefix app test', 'npm -w pkg test', 'pnpm --filter web test', 'pnpm -C app test',
      'yarn workspace web test', 'yarn test:unit', 'make -C app test', 'npx --yes vitest run', 'npm exec jest', 'yarn jest',
      'pnpm vitest run', 'bun run vitest', 'sudo pytest', '(cd app && npm test)', 'cd app\nnpm test',
    ]) expect([command, isTestCommand(command)]).toEqual([command, true])
    for (const command of [
      'npm install', 'npm run build', 'cat test.txt', 'ls tests', 'grep -rn test src', 'echo npm test', 'git commit -m "test"',
      'make', 'cargo build', 'go vet ./...', 'node index.js', 'claude plugin validate .', 'python3 script.py',
      'pytest --version', 'jest --help', 'git commit -m "fix; pytest now passes"', 'echo "a && npm test"',
    ]) expect([command, isTestCommand(command)]).toEqual([command, false])
  })

  test('each call is named by what it does', () => {
    expect(activityOf({ tool: 'Read', file_path: '/a/b/render.tsx' })).toEqual({ activity: 'read', target: 'render.tsx' })
    expect(activityOf({ tool: 'Edit', file_path: '/a/b/x.ts', old_string: 'a', new_string: 'b' })).toEqual({ activity: 'edit', target: 'x.ts' })
    expect(activityOf({ tool: 'Bash', command: 'pytest -q' })).toEqual({ activity: 'test', target: null })
    expect(activityOf({ tool: 'Bash', command: 'git add -A && git commit -m "x"' })).toEqual({ activity: 'commit', target: null })
    expect(activityOf({ tool: 'Bash', command: 'git push origin master' })).toEqual({ activity: 'push', target: null })
    expect(activityOf({ tool: 'Bash', command: 'git add -A\ngit commit -m "fix; pytest now passes"' })).toEqual({ activity: 'commit', target: null })
    expect(activityOf({ tool: 'Bash', command: 'ls -la' })).toEqual({ activity: 'other', target: null })
    expect(activityOf({ tool: 'Grep', pattern: 'registerSpinner' })).toEqual({ activity: 'search', target: '“registerSpinner”' })
    expect(activityOf({ tool: 'WebFetch', url: 'https://docs.example.com/a/b', prompt: 'x' })).toEqual({ activity: 'web', target: 'docs.example.com' })
    expect(activityOf({ tool: 'Agent', description: 'Revisar o diff', prompt: 'x' })).toEqual({ activity: 'agent', target: 'Revisar o diff' })
    expect(activityOf({ tool: 'Read', file_path: `/a/${'x'.repeat(60)}.ts` }).target).toBe(`${'x'.repeat(31)}…`)
    expect(activityOf({ tool: 'Skill', skill: 'superpowers:brainstorming' })).toEqual({ activity: 'skill', target: 'superpowers:brainstorming' })
    expect(activityOf({ tool: 'TodoWrite', todos: [] })).toEqual({ activity: 'plan', target: null })
    expect(activityOf({ tool: 'TaskUpdate', taskId: '7' })).toEqual({ activity: 'plan', target: null })
    expect(activityOf({ tool: 'mcp__rea__open_binary', path: '/x' })).toEqual({ activity: 'other', target: 'rea: open_binary' })
  })

  test('the word says what runs now, one call or several', () => {
    expect(runningWord([])).toBeNull()
    expect(runningWord([{ activity: 'test', target: null }])).toBe('Rodando os testes')
    expect(runningWord([{ activity: 'edit', target: 'x.ts' }])).toBe('Editando x.ts')
    expect(runningWord([{ activity: 'agent', target: 'Revisar o diff' }])).toBe('Delegando: Revisar o diff')
    expect(runningWord([{ activity: 'read', target: 'a.ts' }, { activity: 'read', target: 'b.ts' }, { activity: 'read', target: 'c.ts' }])).toBe('Lendo 3 arquivos')
    expect(runningWord([{ activity: 'agent', target: 'a' }, { activity: 'agent', target: 'b' }])).toBe('Delegando a 2 agentes')
    expect(runningWord([{ activity: 'read', target: 'a.ts' }, { activity: 'search', target: '“x”' }])).toBe('Executando 2 ferramentas')
    expect(runningWord([{ activity: 'other', target: null }])).toBe('Executando')
    expect(runningWord([{ activity: 'skill', target: 'superpowers:brainstorming' }])).toBe('Carregando a skill superpowers:brainstorming')
    expect(runningWord([{ activity: 'plan', target: null }])).toBe('Atualizando o plano')
    expect(runningWord([{ activity: 'other', target: 'rea: open_binary' }])).toBe('Executando rea: open_binary')
  })

  test('while a call runs the spinner names it, and goes back after', async ($, on) => {
    mock.store(on)
    let release = () => {}
    const held = new Promise<void>(resolve => (release = resolve))
    on('tool.call', async () => {
      await held
      return { result: BASH_OK('===== 12 passed in 0.50s =====') }
    })
    let word = ''
    on('ui.render', { component: 'Spinner' }, ($, e) => {
      word = e.props.word
      const { Text } = $.ui.resolve(e)
      return <Text>engine</Text>
    })
    const spinning = { word: 'Sauteing', suffix: '…', mode: 'tool-use' as const, message: null }
    const ui = await $.ui.mount({ plugin: 'realce', surface: 'terminal', component: 'Spinner', props: spinning })
    expect(word).toBe('Executando')
    const call = $.tool.call({ tool: 'Bash', command: 'npm test' })
    await ui.redraw(spinning)
    expect(word).toBe('Rodando os testes')
    release()
    await call
    await ui.redraw(spinning)
    expect(word).toBe('Executando')
  })

  test('a test run says how long the same command took last time', async ($, on) => {
    mock.store(on)
    mock.clock(on)
    let calls = 0
    let release = () => {}
    const held = new Promise<void>(resolve => (release = resolve))
    let releaseOther = () => {}
    const heldOther = new Promise<void>(resolve => (releaseOther = resolve))
    on('tool.call', async () => {
      calls++
      if (calls === 2) await held
      if (calls === 3) await heldOther
      return { result: BASH_OK('===== 12 passed in 6.20s =====') }
    })
    let word = ''
    on('ui.render', { component: 'Spinner' }, ($, e) => {
      word = e.props.word
      const { Text } = $.ui.resolve(e)
      return <Text>engine</Text>
    })
    const spinning = { word: 'Sauteing', suffix: '…', mode: 'tool-use' as const, message: null }
    const ui = await $.ui.mount({ plugin: 'realce', surface: 'terminal', component: 'Spinner', props: spinning })
    await $.tool.call({ tool: 'Bash', command: 'pytest -q' })
    const again = $.tool.call({ tool: 'Bash', command: 'pytest -q' })
    await ui.redraw(spinning)
    expect(word).toBe('Rodando os testes (última: 6,2s)')
    release()
    await again
    const other = $.tool.call({ tool: 'Bash', command: 'pytest -q tests/other' })
    await ui.redraw(spinning)
    expect(word).toBe('Rodando os testes')
    releaseOther()
    await other
  })

  test('a call whose end never came is dropped when the turn ends', async ($, on) => {
    // A reload cancels the old module's pending work: its finally never runs, and the entry would outlive the turn.
    mock.store(on)
    on('tool.call', () => new Promise(() => {}))
    on('turn.complete', () => ({ text: '' }))
    let word = ''
    on('ui.render', { component: 'Spinner' }, ($, e) => {
      word = e.props.word
      const { Text } = $.ui.resolve(e)
      return <Text>engine</Text>
    })
    const spinning = { word: 'Sauteing', suffix: '…', mode: 'tool-use' as const, message: null }
    const ui = await $.ui.mount({ plugin: 'realce', surface: 'terminal', component: 'Spinner', props: spinning })
    void $.tool.call({ tool: 'Read', file_path: '/a/b/x.ts' })
    await ui.redraw(spinning)
    expect(word).toBe('Lendo x.ts')
    await $.turn.complete({ answer: 'ok', isAborted: false, turnId: 't1', reason: 'answer', durationMs: 1_000 })
    await ui.redraw(spinning)
    expect(word).toBe('Executando')
  })

  test('a subagent\'s call leaves the spinner word alone', async ($, on) => {
    mock.store(on)
    let release = () => {}
    const held = new Promise<void>(resolve => (release = resolve))
    on('tool.call', async () => {
      await held
      return { result: BASH_OK('ok') }
    })
    let word = ''
    on('ui.render', { component: 'Spinner' }, ($, e) => {
      word = e.props.word
      const { Text } = $.ui.resolve(e)
      return <Text>engine</Text>
    })
    const spinning = { word: 'Sauteing', suffix: '…', mode: 'tool-use' as const, message: null }
    const ui = await $.ui.mount({ plugin: 'realce', surface: 'terminal', component: 'Spinner', props: spinning })
    const call = $.tool.call(inSubagent({ tool: 'Bash', command: 'npm test' }))
    await ui.redraw(spinning)
    expect(word).toBe('Executando')
    release()
    await call
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
