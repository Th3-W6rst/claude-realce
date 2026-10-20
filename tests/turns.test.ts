import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { formatScore, parseTestSummary } from '../hooks/screen/score'
import { claimsDone, sealOf } from '../hooks/screen/seal'
import { BASH_OK, FAILED, PASSED, TURN, drawnText, engineEvents, engineRow, inSubagent, rule, startSession, watchState } from './world'
import { PT } from './lang'

describe('turn rule', () => {
  test('the rule fits its width and drops what does not fit', () => {
    const stats = { endedAt: Date.UTC(2026, 9, 19, 18, 41), tools: 14, files: 3, tests: { runner: 'jest', passed: 3, failed: 0, skipped: 0, unit: 'tests' as const }, seal: null }
    const wide = rule(stats, 385_600, 80, -180)
    expect(wide.startsWith('── 15:41 · 6m 25s · 14 ferramentas · 3 arquivos · ✔ testes ──')).toBe(true)
    expect(wide.length).toBe(80)
    const narrow = rule(stats, 385_600, 30, -180)
    expect(narrow.length).toBeLessThanOrEqual(30)
    expect(narrow).toContain('6m 25s')
  })

  test('an unknown turn shows only its duration', () => {
    expect(rule(null, 385_600, 16, -180)).toBe(`── 6m 25s ${'─'.repeat(6)}`)
  })

  test('a turn closes with its stats', async ($, on) => {
    mock.store(on, PT)
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
    mock.store(on, PT)
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

  test('a turn no prompt.submit opened still gets its stats', async ($, on) => {
    // The mod's own prompt (the demo) skips the mod's own prompt.submit hook.
    mock.store(on, PT)
    mock.clock(on)
    engineEvents(on)
    const written = watchState(on)
    on('turn.step', async function* ($, e) {
      yield { kind: 'text' as const, index: 0, text: '5' }
      return { turnId: e.turnId, index: e.index, answer: '5', toolUses: [], stopReason: 'end_turn' as const, usage: null }
    })
    const stream = $.turn.step({ turnId: 'n1', index: 0, model: 'm', messageCount: 3 })
    for (let step = await stream.next(); step.done !== true; step = await stream.next()) {}
    expect(written.turn).toMatchObject({ tools: 0, files: [] })
    // A later step of the same turn leaves its stats alone.
    await $.tool.call({ tool: 'Bash', command: 'ls' })
    const later = $.turn.step({ turnId: 'n1', index: 1, model: 'm', messageCount: 5 })
    for (let step = await later.next(); step.done !== true; step = await later.next()) {}
    expect(written.turn).toMatchObject({ tools: 1 })
  })

  test('a count of nothing stays off the rule', async ($, on) => {
    mock.store(on, PT)
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
    mock.store(on, PT)
    engineRow(on, 'UserMessage')
    const ui = await $.ui.mount({ plugin: 'realce', surface: 'terminal', component: 'UserMessage', props: { text: 'oi', origin: { kind: 'composer' }, isExpanded: false } })
    expect(await ui.find({ text: 'engine' })).toBeDefined()
  })

  test('separador off draws the engine', async ($, on) => {
    mock.store(on, { ...PT, flags: { separador: false } })
    engineRow(on, 'TurnDuration')
    engineRow(on, 'UserMessage')
    const end = await $.ui.mount({ plugin: 'realce', surface: 'terminal', component: 'TurnDuration', props: { word: 'Baked', durationMs: 5_000 } })
    expect(await end.find({ key: 'realce-turn' })).toBeUndefined()
    expect(await end.find({ text: 'engine' })).toBeDefined()
    const prompt = await $.ui.mount({ plugin: 'realce', surface: 'terminal', component: 'UserMessage', props: { text: 'oi', origin: { kind: 'composer' }, isExpanded: false } })
    expect(await prompt.find({ key: 'realce-prompt-rule' })).toBeUndefined()
  })
})

describe('proof seal', () => {
  test('a claim of delivery is found, a negated one is not', () => {
    for (const text of ['Pronto: 159 testes passam', '> [!FEITO] Publicado', 'Corrigido e testado.', 'Fixed the bug', 'Tudo verde agora.']) expect(claimsDone(text)).toBe(true)
    for (const text of ['Ainda não está pronto', 'Vou rodar os testes.', 'not done yet', 'O que falta?', 'Não está corrigido ainda.']) expect(claimsDone(text)).toBe(false)
  })

  test('English claims read as the Portuguese ones do: the done callout and tests that pass', () => {
    for (const text of ['> [!DONE] Shipped', 'Fix: sum the quantities. All 4 tests pass (pytest, 0.03s).', 'The tests pass now.', 'Everything is passing.', 'The suite passes.', 'Resolved.'])
      expect(claimsDone(text)).toBe(true)
    for (const text of ["The tests don't pass yet.", 'I will pass the value along.', 'Two tests still fail.', 'It is not resolved.', 'Not passing yet.'])
      expect(claimsDone(text)).toBe(false)
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
    mock.store(on, { ...PT, flags })
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
    mock.store(on, PT)
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
    mock.store(on, PT)
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
    mock.store(on, PT)
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
    mock.store(on, PT)
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
    mock.store(on, { ...PT, master: false })
    mock.clock(on)
    engineEvents(on)
    const written = watchState(on)
    await $.prompt.submit({ text: 'oi', origin: { kind: 'composer' }, wait: false })
    await $.tool.call({ tool: 'Edit', file_path: '/a/b/x.ts', old_string: 'a', new_string: 'b' })
    await $.turn.complete({ ...TURN, durationMs: 1_000 })
    expect(Object.keys(written)).toEqual([])
  })
})

describe('test score', () => {
  const score = (output: string) => {
    const s = parseTestSummary(output)
    return s && [s.passed, s.failed, s.skipped, s.seconds, s.unit]
  }

  test('pytest', () => expect(score('===== 426 passed, 2 failed, 3 skipped in 12.30s =====')).toEqual([426, 2, 3, 12.3, 'tests']))
  test('jest', () => expect(score('Tests:       2 failed, 424 passed, 426 total\nTime:        12.3 s')).toEqual([424, 2, 0, 12.3, 'tests']))
  test('vitest', () => expect(score('      Tests  42 passed | 1 skipped (43)\n   Duration  1.20s')).toEqual([42, 0, 1, 1.2, 'tests']))
  test('bun and claude plugin test', () => expect(score(' 16 pass\n 0 fail\nRan 16 tests across 1 file. [0.62s]')).toEqual([16, 0, 0, 0.62, 'tests']))
  test('mocha', () => expect(score('  42 passing (2s)\n  1 failing')).toEqual([42, 1, 0, 2, 'tests']))
  test('cargo', () => expect(score('test result: ok. 42 passed; 0 failed; 1 ignored; 0 measured; 0 filtered out; finished in 0.52s')).toEqual([42, 0, 1, 0.52, 'tests']))
  test('go', () => expect(score('ok  \tgithub.com/x/a\t0.1s\nFAIL\tgithub.com/x/b\t0.2s')).toEqual([1, 1, 0, undefined, 'packages']))
  test('node --test', () => expect(score('ℹ tests 12\nℹ suites 0\nℹ pass 11\nℹ fail 1\nℹ cancelled 0\nℹ skipped 2\nℹ todo 0\nℹ duration_ms 52.3')).toEqual([11, 1, 2, 0.0523, 'tests']))
  test('node --test, the TAP spelling', () => expect(score('# tests 3\n# pass 3\n# fail 0\n# skipped 0\n# duration_ms 8.1')).toEqual([3, 0, 0, 0.0081, 'tests']))
  test('rspec', () => expect(score('Finished in 0.5 seconds (files took 0.2 seconds to load)\n12 examples, 1 failure, 2 pending')).toEqual([9, 1, 2, 0.5, 'tests']))
  test('deno', () => expect(score('FAILED | 11 passed | 1 failed | 2 ignored (60ms)')).toEqual([11, 1, 2, 0.06, 'tests']))
  test('deno with filtered tests, steps and minutes', () => {
    expect(score('ok | 12 passed | 0 failed | 2 filtered out (12ms)')).toEqual([12, 0, 0, 0.012, 'tests'])
    expect(score('FAILED | 3 passed (4 steps) | 1 failed (1 step) (40ms)')).toEqual([3, 1, 0, 0.04, 'tests'])
    expect(score('ok | 9 passed | 0 failed (1m6s)')).toEqual([9, 0, 0, 66, 'tests'])
  })
  test('a doc that mentions examples or tests is no score', () => {
    expect(parseTestSummary('README:\n12 examples, 0 failures\nfim')).toBeNull()
    expect(parseTestSummary('# tests 3\n\nnotas')).toBeNull()
    expect(parseTestSummary('ℹ tests 3')).toBeNull()
  })
  test('XCTest', () => expect(score('Executed 42 tests, with 1 failure (0 unexpected) in 1.234 (1.300) seconds')).toEqual([41, 1, 0, 1.234, 'tests']))
  test('Swift Testing', () => expect(score('✔ Test run with 42 tests in 5 suites passed after 0.123 seconds.')).toEqual([42, 0, 0, 0.123, 'tests']))

  test('the last summary wins, colors are stripped', () => {
    expect(score('\u001b[32m===== 1 passed in 0.10s =====\u001b[0m\n...\n===== 3 passed, 1 failed in 0.20s =====')).toEqual([3, 1, 0, 0.2, 'tests'])
  })

  test('no summary, no score', () => {
    expect(parseTestSummary('hello')).toBeNull()
    expect(parseTestSummary('0 fail')).toBeNull()
  })

  test('the score line in Portuguese', () => {
    expect(formatScore({ runner: 'pytest', passed: 426, failed: 2, skipped: 3, seconds: 12.3, unit: 'tests' })).toBe('✔ 426 passaram · ✖ 2 falharam · ⏭ 3 pulados · ⏱ 12,3s')
    expect(formatScore({ runner: 'pytest', passed: 1, failed: 1, skipped: 1, unit: 'tests' })).toBe('✔ 1 passou · ✖ 1 falhou · ⏭ 1 pulado')
    expect(formatScore({ runner: 'go', passed: 1, failed: 0, skipped: 0, unit: 'packages' })).toBe('✔ 1 pacote passou · ✖ 0 pacotes falharam')
  })

  const bashRow = (props: { output: unknown; isErrored: boolean }) => ({
    plugin: 'realce',
    surface: 'terminal' as const,
    component: 'ToolUse' as const,
    props: { tool_use_id: 't1', tool: 'Bash', input: { command: 'npm test' }, isRunning: false, isInterrupted: false, ...props },
  })

  test('a Bash row carries its test score under the command', async ($, on) => {
    mock.store(on, PT)
    engineRow(on, 'ToolUse')
    const ui = await $.ui.mount(bashRow({ output: BASH_OK('===== 426 passed, 2 failed, 3 skipped in 12.30s ====='), isErrored: false }))
    const score = await ui.find({ key: 'realce-score' })
    expect(score?.text).toBe('  ✔ 426 passaram · ✖ 2 falharam · ⏭ 3 pulados · ⏱ 12,3s')
    expect((await ui.findAll({ type: 'Text' })).find(t => t.text.startsWith('  ✔ 426'))?.props).toMatchObject({ color: '#FF5C63' })
    expect(await ui.find({ text: 'engine' })).toBeUndefined()
  })

  test('an errored run reads the text the model read', async ($, on) => {
    mock.store(on, PT)
    engineRow(on, 'ToolUse')
    const ui = await $.ui.mount(bashRow({ output: 'Exit code 1\n 15 pass\n 1 fail\nRan 16 tests across 1 file. [0.62s]', isErrored: true }))
    expect((await ui.find({ key: 'realce-score' }))?.text).toBe('  ✔ 15 passaram · ✖ 1 falhou · ⏱ 0,62s')
  })

  test('placar off, or no summary, leaves the row without a score', async ($, on) => {
    mock.store(on, { ...PT, flags: { placar: false } })
    engineRow(on, 'ToolUse')
    const off = await $.ui.mount(bashRow({ output: BASH_OK('===== 1 passed in 0.10s ====='), isErrored: false }))
    expect(await off.find({ key: 'realce-score' })).toBeUndefined()
    const plain = await $.ui.mount(bashRow({ output: BASH_OK('hello'), isErrored: false }))
    expect(await plain.find({ key: 'realce-score' })).toBeUndefined()
  })
})
