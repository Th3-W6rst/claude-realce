import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { sessionPrompt } from '../hooks/orient/ask'
import { planWindow } from '../hooks/orient/pane/overview'
import type { PlanItem } from '../types'
import { BASH_OK, TURN, drawnText, engine, engineEvents, engineRow, mountPane, PANE, RUN, startStandIns } from './world'
import { PT } from './lang'

const USAGE = { input_tokens: 40, output_tokens: 24, cache_creation_input_tokens: 0, cache_read_input_tokens: 31_000 }

const ANSWERED = () => ({ isAnswered: true, text: 'Mudaram **2** arquivos.', usage: USAGE })

// The world beneath the pane's agent: the fork, the subagent and the prompt box answer, and every call is kept. A test
// whose other stand-ins already answer ui.open or prompt.submit leaves them out (`beneath`).
function agentWorld(on: On, fork: (prompt: string) => unknown = ANSWERED, beneath: { open?: false; submit?: false } = {}) {
  const forks: string[] = []
  const spawns: { prompt: string; description?: string }[] = []
  const fills: { text: string; mode?: string }[] = []
  const submits: string[] = []
  const copies: string[] = []
  on('model.fork', ($, e) => {
    forks.push(e.prompt)
    return { value: fork(e.prompt) } as never
  })
  on('agent.spawn', ($, e) => {
    spawns.push(e as never)
    return { model: 'claude-opus-5-5', agentId: `p${spawns.length}` } as never
  })
  on('prompt.fill', ($, e) => {
    fills.push(e as never)
    return { isFilled: true } as never
  })
  if (beneath.submit !== false) {
    on('prompt.submit', ($, e) => {
      submits.push(e.text)
      return { text: e.text }
    })
  }
  on('ui.copy', ($, e) => {
    copies.push(e.text)
    return { value: { isCopied: true as const } } as never
  })
  on('ui.toast', () => ({ value: undefined }))
  if (beneath.open !== false) on('ui.open', () => ({ value: { isPlaced: true as const } }))
  return { forks, spawns, fills, submits, copies }
}

// One state value the test starts and watches: each write bumps its version, as the engine's store does.
function stateOf(on: On, key: 'chat', initial: unknown, written: (value: unknown) => void) {
  let value = initial
  let version = 1
  on('state.get', { plugin: 'realce', key }, () => ({ value: { value, version } }) as never)
  on('state.set', { plugin: 'realce', key }, ($, e) => {
    value = e.value
    version += 1
    written(value)
    return { value: { isSet: true, version } } as never
  })
}

async function agentPane($: Engine) {
  const ui = await mountPane($)
  await ui.press({ key: 'tab-agent' })
  return ui
}

const markdown = async (ui: Awaited<ReturnType<typeof mountPane>>) => (await ui.findAll({ type: 'Markdown' })).map(m => m.props.text)
const texts = async (ui: Awaited<ReturnType<typeof mountPane>>) => (await ui.findAll({ type: 'Text' })).map(el => el.text)
const keyed = async (ui: Awaited<ReturnType<typeof mountPane>>, prefix: string) => (await ui.findAll({ type: 'Button' })).map(b => b.key ?? '').filter(k => k.startsWith(prefix))

describe('pane agent', () => {
  test('a question over the session is answered in the pane, with what it cost', async ($, on) => {
    mock.store(on, PT)
    const clock = mock.clock(on, { now: Date.UTC(2026, 9, 21, 20, 5) })
    const world = agentWorld(on, ANSWERED, { open: false, submit: false })
    startStandIns(on)
    engine(on)
    await $.session.start({ cwd: '/a/b', surface: 'terminal', isInteractive: true })
    const ui = await agentPane($)
    await ui.input({ key: 'ask', text: 'O que mudou?' })
    expect(await texts(ui)).toContain('Pensando…')
    await clock.settle()
    expect(world.forks).toHaveLength(1)
    expect(world.forks[0]).toContain('não chame ferramenta')
    expect(world.forks[0]!.endsWith('Pergunta: O que mudou?')).toBe(true)
    expect(await markdown(ui)).toEqual(['Mudaram **2** arquivos.'])
    expect(await texts(ui)).toContain('17:05 · 0,0 s · 64 tokens · Sessão')
  })

  test("the answer's footer keeps its words beside the buttons in a narrow pane", async ($, on) => {
    mock.store(on, PT)
    const clock = mock.clock(on, { now: Date.UTC(2026, 9, 21, 20, 5) })
    agentWorld(on, ANSWERED, { open: false, submit: false })
    startStandIns(on)
    engine(on)
    await $.session.start({ cwd: '/a/b', surface: 'terminal', isInteractive: true })
    const ui = await $.ui.mount({ plugin: 'realce', surface: 'terminal', component: 'Pane', requestId: 'realce-sessao', props: { ...PANE, bodyColumns: 62 } })
    await ui.press({ key: 'tab-agent' })
    await ui.input({ key: 'ask', text: 'O que mudou?' })
    await clock.settle()
    expect(await texts(ui)).toContain('17:05 · 0,0 s · 64 tokens · Sessão')
  })

  test('asked while a turn runs, the question waits for its end', async ($, on) => {
    mock.store(on, PT)
    const clock = mock.clock(on)
    const world = agentWorld(on, ANSWERED, { submit: false })
    engineEvents(on)
    on('turn.step', async function* () {
      return { turnId: 't1', index: 0, answer: '', toolUses: [], stopReason: 'end_turn' as const, usage: null }
    })
    await stepMain($)
    const ui = await agentPane($)
    await ui.input({ key: 'ask', text: 'Por que demorou?' })
    await clock.settle()
    expect(world.forks).toEqual([])
    expect(await texts(ui)).toContain('Na fila: responde quando o turno terminar.')
    await $.turn.complete({ ...TURN, durationMs: 3000 })
    await clock.settle()
    expect(world.forks).toHaveLength(1)
    expect(await markdown(ui)).toEqual(['Mudaram **2** arquivos.'])
  })

  test('before any turn ends there is nothing to ask about, and the pane says so', async ($, on) => {
    mock.store(on, PT)
    const clock = mock.clock(on)
    agentWorld(on, () => ({ isAnswered: false, reason: 'nothing-to-fork' }))
    const ui = await agentPane($)
    await ui.input({ key: 'ask', text: 'oi' })
    await clock.settle()
    expect(await texts(ui)).toContain('Sem resposta: Nada para consultar ainda: espere o primeiro turno terminar.')
  })

  test('the pane remembers its last exchanges for the next question', async ($, on) => {
    mock.store(on, PT)
    const clock = mock.clock(on)
    const world = agentWorld(on, prompt => ({ isAnswered: true, text: prompt.endsWith('primeira') ? 'resposta um' : 'resposta dois', usage: USAGE }))
    const ui = await agentPane($)
    await ui.input({ key: 'ask', text: 'primeira' })
    await clock.settle()
    await ui.input({ key: 'ask', text: 'e a segunda?' })
    await clock.settle()
    expect(world.forks[1]).toContain('Antes no painel — P: primeira\nR: resposta um')
    expect(await markdown(ui)).toEqual(['resposta um', 'resposta dois'])
  })

  test('the history keeps the last 20 questions and shows the last 5', async ($, on) => {
    mock.store(on, PT)
    const clock = mock.clock(on)
    agentWorld(on)
    const ui = await agentPane($)
    for (let i = 0; i < 23; i++) {
      await ui.input({ key: 'ask', text: `q${i}` })
      await clock.settle()
    }
    expect(await markdown(ui)).toHaveLength(5)
    expect(await texts(ui)).toContain('+15 anteriores')
  })

  test('in Tools mode the question goes to a subagent; one the engine gives no id says so', async ($, on) => {
    mock.store(on, PT)
    const clock = mock.clock(on)
    const world = agentWorld(on)
    const ui = await agentPane($)
    await ui.press({ key: 'mode-tools' })
    await ui.input({ key: 'ask', text: 'Tem teste para o x.ts?' })
    await clock.settle()
    expect(world.spawns).toHaveLength(1)
    expect(world.spawns[0]!.description).toBe('Realce: Tem teste para o x.ts?')
    expect(world.spawns[0]!.prompt).toContain('não altere nada')
    // The kit's spawn starts no agent (its id is the engine's to set): the entry says no agent started.
    expect(await texts(ui)).toContain('Sem resposta: Nenhum agente começou.')
  })

  test("a subagent the pane started answers in its entry, and its calls stay out of the main turn's proof", async ($, on) => {
    mock.store(on, PT)
    mock.clock(on)
    agentWorld(on, ANSWERED, { submit: false })
    engineEvents(on)
    engineRow(on, 'TurnDuration')
    let chat: unknown = [{ id: 'e1', mode: 'tools', question: 'Tem teste?', status: 'pending', text: '', at: 1, agentId: 'p1' }]
    stateOf(on, 'chat', chat, value => (chat = value))
    on('tool.call', { tool: 'Bash', command: 'pytest' }, () => ({ result: BASH_OK('===== 12 passed in 0.50s =====') }))
    await $.prompt.submit({ text: 'oi', origin: { kind: 'composer' }, wait: false })
    await $.tool.call({ tool: 'Edit', file_path: '/a/b/x.ts', old_string: 'a', new_string: 'b' })
    await $.tool.call({ tool: 'Bash', command: 'pytest' })
    // The pane's agent edits after the main turn's tests: the main turn's proof stands.
    await $.tool.call({ tool: 'Edit', file_path: '/a/b/y.ts', old_string: 'a', new_string: 'b', agentId: 'p1' } as never)
    await $.turn.complete({ ...TURN, answer: 'Tem: tests/x.test.ts.', durationMs: 2000, agentId: 'p1' })
    expect(chat).toMatchObject([{ id: 'e1', status: 'ready', text: 'Tem: tests/x.test.ts.' }])
    await $.turn.complete({ ...TURN, answer: 'Pronto.', durationMs: 7000 })
    const rule = await $.ui.mount({ plugin: 'realce', surface: 'terminal', component: 'TurnDuration', props: { word: 'Baked', durationMs: 7000 }, viewport: { columns: 100, rows: 40 } })
    expect(await drawnText(rule, 'realce-turn')).toContain('✔ provado')
  })

  test('a refused subagent says why', async ($, on) => {
    mock.store(on, PT)
    const clock = mock.clock(on)
    on('agent.spawn', () => ({ deny: 'past a Stop' }) as never)
    const ui = await agentPane($)
    await ui.press({ key: 'mode-tools' })
    await ui.input({ key: 'ask', text: 'oi' })
    await clock.settle()
    expect(await texts(ui)).toContain('Sem resposta: Recusado: past a Stop')
  })

  test('an answer goes to the prompt box, is sent, or is copied', async ($, on) => {
    mock.store(on, PT)
    const clock = mock.clock(on)
    const world = agentWorld(on)
    const ui = await agentPane($)
    await ui.input({ key: 'ask', text: 'O que mudou?' })
    await clock.settle()
    const [chat] = await keyed(ui, 'chat-')
    const [send] = await keyed(ui, 'send-')
    const [copy] = await keyed(ui, 'copy-')
    await ui.press({ key: chat! })
    expect(world.fills).toMatchObject([{ text: 'Mudaram **2** arquivos.', mode: 'append' }])
    await ui.press({ key: send! })
    expect(world.submits).toEqual(['Mudaram **2** arquivos.'])
    await ui.press({ key: copy! })
    expect(world.copies).toEqual(['Mudaram **2** arquivos.'])
  })

  test('a ready-made question asks in its mode, the review only with files touched', async ($, on) => {
    mock.store(on, PT)
    const clock = mock.clock(on)
    const world = agentWorld(on)
    on('state.get', { plugin: 'realce', key: 'files' }, () => ({ value: { value: [{ path: '/a/b/x.ts', added: 1, removed: 0, edits: 1, at: 1 }], version: 1 } }))
    on('state.get', { plugin: 'realce', key: 'failures' }, () => ({ value: { value: [{ command: 'npm test', line: '2 failing', at: 3, toolUseId: 'b1' }], version: 1 } }))
    const ui = await agentPane($)
    expect(await keyed(ui, 'quick-')).toEqual(['quick-summary', 'quick-next', 'quick-failure', 'quick-review'])
    await ui.press({ key: 'quick-summary' })
    await ui.press({ key: 'quick-failure' })
    await ui.press({ key: 'quick-review' })
    await clock.settle()
    expect(world.forks[0]).toContain('Resuma o que foi feito nesta sessão')
    expect(world.forks[1]).toContain('Explique esta falha e como resolver: o comando `npm test` falhou com 2 failing')
    expect(world.forks[1]).not.toContain('Conserte')
    expect(world.spawns[0]!.prompt).toMatch(/Revise os arquivos mexidos nesta sessão \(\/a\/b\/x\.ts\)/)
  })

  test("a failure's Fix leaves a ready prompt in the prompt box", async ($, on) => {
    mock.store(on, PT)
    const world = agentWorld(on)
    on('state.get', { plugin: 'realce', key: 'failures' }, () => ({ value: { value: [{ command: 'npm test\n--watch', line: '2 failing', at: 3, toolUseId: 'b1' }], version: 1 } }))
    const ui = await mountPane($)
    await ui.press({ key: 'fix-b1' })
    expect(world.fills).toMatchObject([{ text: 'Conserte a falha de `npm test`: 2 failing' }])
  })

  test('/realce pergunta asks from the prompt; alone it opens the field', async ($, on) => {
    mock.store(on, PT)
    const clock = mock.clock(on)
    const world = agentWorld(on, ANSWERED, { open: false })
    const opened: { id: string; focus?: boolean }[] = []
    on('ui.open', ($, e) => {
      opened.push(e)
      return { value: { isPlaced: true as const } }
    })
    expect((await $.command.run({ ...RUN, args: 'pergunta O que Falta?' })).text).toBe('Perguntando no painel.')
    await clock.settle()
    expect(world.forks[0]!.endsWith('Pergunta: O que Falta?')).toBe(true)
    expect((await $.command.run({ ...RUN, args: 'ask' })).text).toBe('Escreva a pergunta no painel.')
    expect(opened.map(o => o.focus === true)).toEqual([false, true])
    const ui = await mountPane($)
    expect(await markdown(ui)).toEqual(['Mudaram **2** arquivos.'])
  })

  test('agente off: no Agent tab, no Fix, and the command says how to turn it on', async ($, on) => {
    mock.store(on, { ...PT, flags: { agente: false } })
    agentWorld(on)
    on('state.get', { plugin: 'realce', key: 'failures' }, () => ({ value: { value: [{ command: 'npm test', line: '2 failing', at: 3, toolUseId: 'b1' }], version: 1 } }))
    const ui = await mountPane($)
    expect(await keyed(ui, 'tab-')).toEqual(['tab-overview', 'tab-files', 'tab-turns'])
    expect(await keyed(ui, 'fix-')).toEqual([])
    expect((await $.command.run({ ...RUN, args: 'pergunta oi' })).text).toBe('Recurso desligado: Agente no painel. /realce agente on liga.')
  })

  test('a question cut by a reload says so; a queued one is answered', async ($, on) => {
    mock.store(on, PT)
    const clock = mock.clock(on)
    const world = agentWorld(on, ANSWERED, { open: false })
    startStandIns(on, () => [{ id: 'p9', description: 'Realce: agente', type: 'general-purpose', status: 'running' }])
    const chat = [
      { id: 'a', mode: 'session', question: 'cortada', status: 'pending', text: '', at: 1 },
      { id: 'b', mode: 'session', question: 'na fila', status: 'queued', text: '', at: 2 },
      { id: 'c', mode: 'tools', question: 'agente', status: 'pending', text: '', at: 3, agentId: 'p9' },
    ]
    let written: unknown = null
    stateOf(on, 'chat', chat, value => (written = value))
    await $.session.start({ cwd: '/a/b', surface: 'terminal', isInteractive: true })
    await clock.settle()
    const after = written as { id: string; status: string; text: string }[]
    expect(after.find(c => c.id === 'a')).toMatchObject({ status: 'failed', text: 'Interrompida por um recarregamento.' })
    expect(after.find(c => c.id === 'b')).toMatchObject({ status: 'ready', text: 'Mudaram **2** arquivos.' })
    expect(after.find(c => c.id === 'c')).toMatchObject({ status: 'pending' })
    expect(world.forks).toHaveLength(1)
  })
})

describe('pane agent and the turn', () => {
  function stepWorld(on: On) {
    on('turn.step', async function* ($, e) {
      return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn' as const, usage: null }
    })
  }

  async function askNow($: Engine, ui: Awaited<ReturnType<typeof mountPane>>, clock: { settle: () => Promise<unknown> }, text: string) {
    await ui.input({ key: 'ask', text })
    await clock.settle()
  }

  test('a later step of the main turn holds the questions too (a reload in the middle of a turn)', async ($, on) => {
    mock.store(on, PT)
    const clock = mock.clock(on)
    const world = agentWorld(on, ANSWERED, { submit: false })
    engineEvents(on)
    stepWorld(on)
    await stepMain($, 3)
    await askNow($, await agentPane($), clock, 'e agora?')
    expect(world.forks).toEqual([])
  })

  test("the person's prompt holds the questions before the turn's first step", async ($, on) => {
    mock.store(on, PT)
    const clock = mock.clock(on)
    const world = agentWorld(on, ANSWERED, { submit: false })
    engineEvents(on)
    await $.prompt.submit({ text: 'oi', origin: { kind: 'composer' }, wait: false })
    await askNow($, await agentPane($), clock, 'resuma')
    expect(world.forks).toEqual([])
  })

  test("a subagent's step holds nothing", async ($, on) => {
    mock.store(on, PT)
    const clock = mock.clock(on)
    const world = agentWorld(on, ANSWERED, { submit: false })
    engineEvents(on)
    stepWorld(on)
    await stepMain($, 0, 'sub1')
    await askNow($, await agentPane($), clock, 'oi')
    expect(world.forks).toHaveLength(1)
  })

  test('an aborted main turn lets the queue go', async ($, on) => {
    mock.store(on, PT)
    const clock = mock.clock(on)
    const world = agentWorld(on, ANSWERED, { submit: false })
    engineEvents(on)
    stepWorld(on)
    await stepMain($)
    const ui = await agentPane($)
    await askNow($, ui, clock, 'oi')
    await $.turn.complete({ ...TURN, isAborted: true, reason: 'aborted', durationMs: 1000 })
    await clock.settle()
    expect(world.forks).toHaveLength(1)
  })

  test("a subagent that stopped, refused or erred says so", async ($, on) => {
    mock.store(on, PT)
    mock.clock(on)
    agentWorld(on, ANSWERED, { open: false, submit: false })
    // The load reads the language; the three agents still run then.
    startStandIns(on, () => ['p1', 'p2', 'p3'].map(id => ({ id, description: 'Realce: q', type: 'general-purpose', status: 'running' })))
    engineEvents(on)
    let chat: unknown = ['p1', 'p2', 'p3'].map((agentId, i) => ({ id: `e${i}`, mode: 'tools', question: 'q', status: 'pending', text: '', at: 1, agentId }))
    stateOf(on, 'chat', chat, value => (chat = value))
    await $.session.start({ cwd: '/a/b', surface: 'terminal', isInteractive: true })
    await $.turn.complete({ ...TURN, answer: '', isAborted: true, reason: 'aborted', durationMs: 1, agentId: 'p1' })
    await $.turn.complete({ answer: '', isAborted: false, turnId: 't2', reason: 'refusal', refusal: { category: 'cyber', explanation: 'fora da política' }, durationMs: 1, agentId: 'p2' } as never)
    await $.turn.complete({ ...TURN, answer: '', reason: 'error', durationMs: 1, agentId: 'p3' })
    expect((chat as { text: string }[]).map(c => c.text)).toEqual(['O agente foi interrompido.', 'O agente recusou: fora da política', 'O agente parou num erro.'])
  })

  test('Clear takes away a question still waiting, which then never lands', async ($, on) => {
    mock.store(on, PT)
    const clock = mock.clock(on)
    agentWorld(on, ANSWERED, { submit: false })
    engineEvents(on)
    stepWorld(on)
    await stepMain($)
    const ui = await agentPane($)
    await askNow($, ui, clock, 'na fila')
    await ui.press({ key: 'clear-chat' })
    expect(await ui.find({ text: '› na fila' })).toBeUndefined()
    await $.turn.complete({ ...TURN, durationMs: 1000 })
    await clock.settle()
    expect(await markdown(ui)).toEqual([])
  })

  test('the history drops answered questions first, never one still waiting', async ($, on) => {
    mock.store(on, PT)
    const clock = mock.clock(on)
    agentWorld(on)
    let chat: unknown = [{ id: 'w', mode: 'tools', question: 'esperando', status: 'pending', text: '', at: 0, agentId: 'p1' }]
    stateOf(on, 'chat', chat, value => (chat = value))
    const ui = await agentPane($)
    for (let i = 0; i < 21; i++) await askNow($, ui, clock, `q${i}`)
    const kept = chat as { id: string }[]
    expect(kept).toHaveLength(20)
    expect(kept[0]!.id).toBe('w')
  })

  test("at a reload, a subagent the engine no longer runs is marked as lost", async ($, on) => {
    mock.store(on, PT)
    const clock = mock.clock(on)
    agentWorld(on, ANSWERED, { open: false })
    startStandIns(on, () => [{ id: 'p2', description: 'Realce: q', type: 'general-purpose', status: 'running' }])
    let chat: unknown = [
      { id: 'a', mode: 'tools', question: 'perdida', status: 'pending', text: '', at: 1, agentId: 'p1' },
      { id: 'b', mode: 'tools', question: 'viva', status: 'pending', text: '', at: 2, agentId: 'p2' },
    ]
    stateOf(on, 'chat', chat, value => (chat = value))
    await $.session.start({ cwd: '/a/b', surface: 'terminal', isInteractive: true })
    await clock.settle()
    expect(chat).toMatchObject([{ id: 'a', status: 'failed', text: 'O agente não está mais rodando.' }, { id: 'b', status: 'pending' }])
  })

  test('with agente off, a history left by explain can still be cleared', async ($, on) => {
    mock.store(on, { ...PT, flags: { agente: false } })
    agentWorld(on)
    let chat: unknown = [{ id: 'x', mode: 'explain', question: 'abc', status: 'ready', text: 'r', at: 1 }]
    stateOf(on, 'chat', chat, value => (chat = value))
    const ui = await agentPane($)
    await ui.press({ key: 'clear-chat' })
    expect(chat).toEqual([])
  })
})

describe('pane in English', () => {
  test('the tabs, the agent and its answer speak English', async ($, on) => {
    mock.store(on, { language: 'en' })
    const clock = mock.clock(on)
    const world = agentWorld(on)
    const ui = await agentPane($)
    expect((await ui.findAll({ type: 'Button' })).filter(b => b.key?.startsWith('tab-')).map(b => b.text)).toEqual(['Overview', 'Agent', 'Files', 'Turns'])
    expect((await ui.find({ key: 'ask' }))?.props.placeholder).toBe('Ask about the session…')
    await ui.input({ key: 'ask', text: 'What changed?' })
    await clock.settle()
    expect(world.forks[0]).toContain('do not call any tool')
    expect(world.forks[0]!.endsWith('Question: What changed?')).toBe(true)
    const [chat] = await keyed(ui, 'chat-')
    expect((await ui.find({ key: chat! }))?.text).toBe('To chat')
    expect(await texts(ui)).toContain('Click the pane to type.')
  })
})

describe('pane tabs', () => {
  test('each tab answers to its digit, and a press switches to it', async ($, on) => {
    mock.store(on, PT)
    const ui = await mountPane($)
    const tabs = (await ui.findAll({ type: 'Button' })).filter(b => b.key?.startsWith('tab-'))
    expect(tabs.map(b => [b.key, b.props.hotkey])).toEqual([
      ['tab-overview', '1'],
      ['tab-agent', '2'],
      ['tab-files', '3'],
      ['tab-turns', '4'],
    ])
    await ui.press({ key: 'tab-files' })
    expect(await ui.find({ text: 'Nenhum arquivo mexido ainda.' })).toBeDefined()
    await ui.press({ key: 'tab-turns' })
    expect(await ui.find({ text: 'Nenhum turno ainda.' })).toBeDefined()
  })

  test('a long plan shows the rows around the item in progress', () => {
    const plan: PlanItem[] = Array.from({ length: 12 }, (_, i) => ({ text: `t${i}`, status: i < 6 ? 'completed' : i === 6 ? 'in_progress' : 'pending' }))
    const window = planWindow(plan)
    expect(window.items.map(p => p.text)).toEqual(['t4', 't5', 't6', 't7', 't8', 't9', 't10', 't11'])
    expect([window.above, window.below]).toEqual([4, 0])
    const done = planWindow(plan.map(p => ({ ...p, status: 'completed' as const })))
    expect([done.above, done.below]).toEqual([4, 0])
    expect(planWindow(plan.slice(0, 5)).items).toHaveLength(5)
  })

  test("the fork's prompt frames the question as a side question", () => {
    const prompt = sessionPrompt([], 'oi')
    expect(prompt.startsWith('Esta é uma pergunta lateral')).toBe(true)
    expect(prompt.endsWith('Pergunta: oi')).toBe(true)
  })
})

/** A main turn's first step, as the engine raises it once a prompt starts the model. */
async function stepMain($: Engine, index = 0, agentId?: string) {
  const stream = $.turn.step({ turnId: 't1', index, model: 'claude-haiku-5-5', ...(agentId === undefined ? {} : { agentId }) } as never)
  for await (const _ of stream as AsyncIterable<unknown>) void _
}
