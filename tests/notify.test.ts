import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { questionHeader } from '../hooks/orient/question'
import { engine } from './world'
import { PT } from './lang'

describe('finish notice', () => {
  function notifyWorld(on: On, result: unknown = { isSent: true, channel: 'osc9' }) {
    const sent: { text: string; title?: string }[] = []
    const played: string[][] = []
    const runs: string[][] = []
    on('ui.notify', ($, e) => {
      sent.push({ text: e.text, ...(e.title === undefined ? {} : { title: e.title }) })
      return { value: result as never }
    })
    on('process.run', ($, e) => {
      runs.push([...e.argv])
      if (e.argv[0] === 'afplay') played.push([...e.argv])
      return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
    })
    on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout: '===== 12 passed in 0.50s =====', stderr: '', interrupted: false } }))
    on('ui.log', () => ({ value: undefined }))
    engine(on)
    return { sent, played, runs }
  }

  const longTurn = async ($: Engine, durationMs: number, extra: { isAborted?: boolean } = {}) => {
    await $.prompt.submit({ text: 'oi', origin: { kind: 'composer' }, wait: false })
    await $.tool.call({ tool: 'Edit', file_path: '/a/b/x.ts', old_string: 'a', new_string: 'b' })
    await $.tool.call({ tool: 'Bash', command: 'pytest' })
    await $.turn.complete({ answer: 'Pronto.', durationMs, isAborted: false, turnId: 't1', reason: 'answer', ...extra })
  }

  test('a long turn notifies with its duration, tests and seal', async ($, on) => {
    mock.store(on, PT)
    mock.clock(on)
    const { sent, played } = notifyWorld(on)
    await longTurn($, 61_000)
    expect(sent).toEqual([{ text: '1m 1s · ✔ testes · ✔ provado', title: 'Claude terminou' }])
    expect(played).toEqual([])
  })

  test('a short turn does not', async ($, on) => {
    mock.store(on, PT)
    mock.clock(on)
    const { sent } = notifyWorld(on)
    await longTurn($, 59_000)
    expect(sent).toEqual([])
  })

  test('an aborted turn does not', async ($, on) => {
    mock.store(on, PT)
    mock.clock(on)
    const { sent } = notifyWorld(on)
    await longTurn($, 61_000, { isAborted: true })
    expect(sent).toEqual([])
  })

  test("a subagent's turn does not", async ($, on) => {
    mock.store(on, PT)
    mock.clock(on)
    const { sent } = notifyWorld(on)
    await $.turn.complete({ answer: 'x', durationMs: 90_000, isAborted: false, turnId: 't2', reason: 'answer', agentId: 'sub1' })
    expect(sent).toEqual([])
  })

  test('a question after a minute of work notifies', async ($, on) => {
    mock.store(on, PT)
    const clock = mock.clock(on)
    const { sent } = notifyWorld(on)
    await $.prompt.submit({ text: 'oi', origin: { kind: 'composer' }, wait: false })
    await clock.advance(61_000)
    await $.tool.call({ tool: 'AskUserQuestion', questions: [{ question: 'Qual nome?', header: 'Nome', options: [], multiSelect: false }] })
    expect(sent).toEqual([{ text: 'Qual nome?', title: 'Claude precisa de você' }])
  })

  test('a question right away does not', async ($, on) => {
    mock.store(on, PT)
    mock.clock(on)
    const { sent } = notifyWorld(on)
    await $.prompt.submit({ text: 'oi', origin: { kind: 'composer' }, wait: false })
    await $.tool.call({ tool: 'AskUserQuestion', questions: [{ question: 'Qual nome?', header: 'Nome', options: [], multiSelect: false }] })
    expect(sent).toEqual([])
  })

  test('som plays a system sound with the notice', async ($, on) => {
    mock.store(on, { ...PT, flags: { som: true } })
    const clock = mock.clock(on)
    const { played } = notifyWorld(on)
    await longTurn($, 61_000)
    await clock.settle()
    expect(played).toEqual([['afplay', '/System/Library/Sounds/Glass.aiff']])
  })

  test('a refused notice shows in status', async ($, on) => {
    mock.store(on, PT)
    mock.clock(on)
    notifyWorld(on, { isSent: false, reason: 'disabled' })
    on('prompt.compose', () => ({ sections: [] }))
    await longTurn($, 61_000)
    const RUN = { command: 'realce', origin: { kind: 'composer' as const }, presentation: { isFullscreen: true, columns: 120 } }
    expect((await $.command.run({ ...RUN, args: 'status' })).text).toMatch(/Último aviso não enviado: disabled\./)
  })

  test('a terminal with no channel gets the macOS banner instead', async ($, on) => {
    mock.store(on, PT)
    const clock = mock.clock(on)
    const { runs } = notifyWorld(on, { isSent: false, reason: 'no-channel' })
    on('prompt.compose', () => ({ sections: [] }))
    await longTurn($, 61_000)
    await clock.settle()
    const banner = runs.find(a => a[0] === 'osascript')
    expect(banner?.slice(-2)).toEqual(['1m 1s · ✔ testes · ✔ provado', 'Claude terminou'])
    const RUN = { command: 'realce', origin: { kind: 'composer' as const }, presentation: { isFullscreen: true, columns: 120 } }
    const status = (await $.command.run({ ...RUN, args: 'status' })).text ?? ''
    expect(status).toMatch(/Último aviso: entregue ao macOS \(o terminal não dá canal ao Claude Code\)\./)
    expect(status).not.toMatch(/não enviado/)
  })

  test('a notice text that starts with a dash still reaches the banner', async ($, on) => {
    mock.store(on, PT)
    const clock = mock.clock(on)
    const { runs } = notifyWorld(on, { isSent: false, reason: 'no-channel' })
    await $.prompt.submit({ text: 'oi', origin: { kind: 'composer' }, wait: false })
    await clock.advance(61_000)
    await $.tool.call({ tool: 'AskUserQuestion', questions: [{ question: '-e qual opção?', header: 'X', options: [], multiSelect: false }] })
    await clock.settle()
    const banner = runs.find(a => a[0] === 'osascript')
    expect(banner?.slice(-3)).toEqual(['--', '-e qual opção?', 'Claude precisa de você'])
  })

  test('avisos off sends nothing', async ($, on) => {
    mock.store(on, { ...PT, flags: { avisos: false } })
    mock.clock(on)
    const { sent } = notifyWorld(on)
    await longTurn($, 61_000)
    expect(sent).toEqual([])
  })
})

describe('question header', () => {
  const QUESTIONS = [
    { question: 'Público ou privado?', header: 'Repo', multiSelect: false, options: [{ label: 'Público (Recomendado)', description: 'x' }, { label: 'Privado', description: 'y' }] },
    { question: 'Nome?', header: 'Nome', multiSelect: false, options: [{ label: 'a', description: 'b' }, { label: 'c', description: 'd' }] },
  ]

  test('the header counts the questions and names the recommended option', () => {
    expect(questionHeader(QUESTIONS)).toBe('◆ O Claude precisa de você · 2 perguntas · recomendada: Público')
    expect(questionHeader([QUESTIONS[1]])).toBe('◆ O Claude precisa de você · 1 pergunta')
    expect(questionHeader([{ ...QUESTIONS[1], options: [{ label: 'Sim (Recommended)', description: '' }] }])).toBe('◆ O Claude precisa de você · 1 pergunta · recomendada: Sim')
  })

  // The kit cannot make the engine's own dialog node, which the tree must hold once: the wrapper is checked live.
})
