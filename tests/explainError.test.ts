import { describe, expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { isAnswerExit } from '../hooks/screen/explainError'
import { USAGE, engineRow } from './world'
import { PT, PT_ALL } from './lang'

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
    mock.store(on, PT_ALL)
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
    mock.store(on, PT_ALL)
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
    mock.store(on, PT_ALL)
    const clock = mock.clock(on)
    engineRow(on, 'ToolGroup')
    explainWorld(on, () => ({ isAnswered: true, text: 'O arquivo não existe.', usage: USAGE }))
    await $.tool.call({ tool: 'Bash', command: 'cat sumiu.txt', tool_use_id: 'b1' })
    await clock.settle()
    const calls = [{ tool_use_id: 'b1', tool: 'Bash', input: { command: 'cat sumiu.txt' }, isRunning: false, isErrored: true, isInterrupted: false }]
    const ui = await $.ui.mount({ plugin: 'realce', surface: 'terminal', component: 'ToolGroup', props: { calls, isActive: false, isExpanded: false } })
    expect(await why(ui)).toBe('↳ Por quê: O arquivo não existe.')
    // The group holds an error, so the engine's line stays above the sentence.
    expect(await ui.find({ text: 'engine' })).toBeDefined()
  })

  test('a long answer is cut to two lines', async ($, on) => {
    mock.store(on, PT_ALL)
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
    mock.store(on, PT_ALL)
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
    mock.store(on, PT_ALL)
    const clock = mock.clock(on)
    const asked = explainWorld(on, () => ({ isAnswered: true, text: 'x', usage: USAGE }))
    await $.tool.call({ tool: 'Bash', command: 'cat a', tool_use_id: 'b1' })
    await $.tool.call({ tool: 'Bash', command: 'cat a', tool_use_id: 'b2' })
    await clock.settle()
    expect(asked).toHaveLength(1)
  })

  test('status counts the explanations sent', async ($, on) => {
    mock.store(on, PT_ALL)
    const clock = mock.clock(on)
    explainWorld(on, () => ({ isAnswered: true, text: 'x', usage: USAGE }))
    on('prompt.compose', () => ({ sections: [] }))
    await $.tool.call({ tool: 'Bash', command: 'cat a', tool_use_id: 'b1' })
    await $.tool.call({ tool: 'Bash', command: 'cat b', tool_use_id: 'b2' })
    await clock.settle()
    const RUN = { command: 'realce', origin: { kind: 'composer' as const }, presentation: { isFullscreen: true, columns: 120 } }
    expect((await $.command.run({ ...RUN, args: 'status' })).text).toMatch(/Erros explicados pelo Haiku desde que o mod carregou: 2 de 20\./)
  })

  test('the 21st error is not sent', async ($, on) => {
    mock.store(on, PT_ALL)
    const clock = mock.clock(on)
    const asked = explainWorld(on, () => ({ isAnswered: true, text: 'x', usage: USAGE }))
    for (let i = 0; i < 21; i++) await $.tool.call({ tool: 'Bash', command: `cat f${i}`, tool_use_id: `b${i}` })
    await clock.settle()
    expect(asked).toHaveLength(20)
  })

  test('a model failure says why, once', async ($, on) => {
    mock.store(on, PT_ALL)
    const clock = mock.clock(on)
    engineRow(on, 'ToolUse')
    const asked = explainWorld(on, () => ({ isAnswered: false, reason: 'api-error', status: 529, error: { kind: 'overloaded' }, usage: USAGE }))
    await $.tool.call({ tool: 'Bash', command: 'cat a', tool_use_id: 'b1' })
    await clock.settle()
    expect(await why(await $.ui.mount(failedRow('b1', 'cat a')))).toBe('↳ Sem explicação: api-error')
    expect(asked).toHaveLength(1)
  })

  test('a call that throws says why', async ($, on) => {
    mock.store(on, PT_ALL)
    const clock = mock.clock(on)
    engineRow(on, 'ToolUse')
    explainWorld(on, () => ({ deny: 'sem rede' }))
    await $.tool.call({ tool: 'Bash', command: 'cat a', tool_use_id: 'b1' })
    await clock.settle()
    expect(await why(await $.ui.mount(failedRow('b1', 'cat a')))).toMatch(/^↳ Sem explicação: .*sem rede/)
  })

  test('answer-style failures are not explained', async ($, on) => {
    mock.store(on, PT)
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
    mock.store(on, PT_ALL)
    const clock = mock.clock(on)
    const asked = explainWorld(on, () => ({ isAnswered: true, text: 'x', usage: USAGE }))
    await $.tool.call({ tool: 'Bash', command: 'grep x sumiu.txt', tool_use_id: 'g2' })
    await clock.settle()
    expect(asked).toHaveLength(1)
  })

  test('erros off sends nothing', async ($, on) => {
    mock.store(on, { ...PT, flags: { erros: false } })
    const clock = mock.clock(on)
    const asked = explainWorld(on, () => ({ isAnswered: true, text: 'x', usage: USAGE }))
    await $.tool.call({ tool: 'Bash', command: 'cat a', tool_use_id: 'b1' })
    await clock.settle()
    expect(asked).toHaveLength(0)
  })
})
