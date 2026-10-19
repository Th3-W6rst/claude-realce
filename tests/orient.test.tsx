import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { AgentInfo, On, RenderPropsOf } from 'claude-code'

import { extractPending } from '../hooks/orient/pending'
import { applyPlanCall, planRow, type PlanItem } from '../hooks/orient/plan'

const BAND: RenderPropsOf['AbovePrompt'] = {
  hasSurvey: false,
  isWorking: false,
  maxRows: 6,
  bodyColumns: 100,
  scroll: { offset: 0, bodyRows: 6 },
  view: {},
}
const PANE: RenderPropsOf['Pane'] = {
  title: 'Sessão',
  isFocused: false,
  bodyColumns: 80,
  placement: 'dock',
  scroll: { offset: 0, bodyRows: 40 },
  view: {},
}
const ANSWER = 'Falta {!o GO para subir!}.\n> [!DECISÃO] Instalar o realce?\n> Copia para ~/mods.'
const TODOS = [
  { content: 'Escrever testes', status: 'in_progress' as const, activeForm: 'Escrevendo testes' },
  { content: 'Implementar', status: 'pending' as const, activeForm: 'Implementando' },
]
const TODOS_DONE = TODOS.map(t => ({ ...t, status: 'completed' as const }))

// Stands for the engine beneath the plugin: its band, its tools, its turn ends and its prompts.
function engine(on: On): void {
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  on('tool.call', () => ({ result: {} }))
  on('turn.complete', () => ({ text: '' }))
  on('prompt.submit', ($, e) => ({ text: e.text }))
}

// What session.start reaches beneath the plugin; every pane opened and every line logged is kept to assert on.
function startStandIns(on: On, agents: () => AgentInfo[] = () => []): { opened: string[]; logs: string[] } {
  const opened: string[] = []
  const logs: string[] = []
  on('ui.log', ($, e) => {
    logs.push(e.text)
    return { value: undefined }
  })
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  mock.env(on, { HOME: '/Users/u' })
  on('fs.exists', () => ({ value: false }))
  on('process.run', ($, e) => ({
    value: { exitCode: 0, stdout: e.argv[0] === 'date' ? '-0300\n' : '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
  }))
  on('agent.list', () => ({ value: agents() }))
  on('ui.open', ($, e) => {
    opened.push(e.id)
    return { value: { isPlaced: true as const } }
  })
  on('session.start', () => ({ cwd: '/a/b' }))
  return { opened, logs }
}

const finish = ($: Engine, answer: string, agentId?: string) =>
  $.turn.complete({ answer, durationMs: 1000, isAborted: false, turnId: 't1', reason: 'answer', ...(agentId ? { agentId } : {}) })

const mountBand = ($: Engine, props: Partial<RenderPropsOf['AbovePrompt']> = {}) =>
  $.ui.mount({ plugin: 'realce', surface: 'terminal', component: 'AbovePrompt', props: { ...BAND, ...props } })

const mountPane = ($: Engine) =>
  $.ui.mount({ plugin: 'realce', surface: 'terminal', component: 'Pane', requestId: 'realce-sessao', props: PANE })

describe('pending', () => {
  test('pending items come from attention marks and decisions', () => {
    expect(extractPending(ANSWER)).toEqual(['o GO para subir', 'Instalar o realce?'])
  })

  test('decisions in any spelling, untitled ones by their first line, no repeats, at most 6', () => {
    expect(extractPending('> [!decisao] A?\n\n> [!Decision]\n> Subir B?\n\n{!A?!}')).toEqual(['A?', 'Subir B?'])
    expect(extractPending('> [!DECISÃO] {!Subir?!}')).toEqual(['Subir?'])
    expect(extractPending([1, 2, 3, 4, 5, 6, 7].map(n => `{!item ${n}!}`).join(' '))).toHaveLength(6)
  })

  test('marks quoted as code are not asked of you', () => {
    expect(extractPending('Use `{!x!}` para marcar.\n```\n{!y!}\n> [!DECISÃO] z\n```\nNada.')).toEqual([])
  })
})

describe('plan', () => {
  test('the plan follows its tools', () => {
    let plan: PlanItem[] = applyPlanCall([], 'TodoWrite', { todos: TODOS }, { oldTodos: [], newTodos: TODOS })
    expect(plan).toEqual([
      { text: 'Escrever testes', status: 'in_progress', activeForm: 'Escrevendo testes' },
      { text: 'Implementar', status: 'pending', activeForm: 'Implementando' },
    ])
    plan = applyPlanCall([], 'TaskCreate', { subject: 'Revisar', description: 'd', activeForm: 'Revisando' }, { task: { id: '7', subject: 'Revisar' } })
    expect(plan).toEqual([{ id: '7', text: 'Revisar', status: 'pending', activeForm: 'Revisando' }])
    plan = applyPlanCall(plan, 'TaskUpdate', { taskId: '7', status: 'in_progress', subject: 'Revisar tudo' }, { success: true, taskId: '7', updatedFields: [] })
    expect(plan).toEqual([{ id: '7', text: 'Revisar tudo', status: 'in_progress', activeForm: 'Revisando' }])
    plan = applyPlanCall(plan, 'TaskUpdate', { taskId: '7', status: 'completed' }, { success: true, taskId: '7', updatedFields: [] })
    expect(plan[0]?.status).toBe('completed')
    expect(applyPlanCall(plan, 'TaskUpdate', { taskId: '7', status: 'deleted' }, { success: true, taskId: '7', updatedFields: [] })).toEqual([])
  })

  test('a task list resyncs and keeps the active forms; other tools change nothing', () => {
    const plan: PlanItem[] = [{ id: '1', text: 'A', status: 'pending', activeForm: 'Fazendo A' }]
    const tasks = [
      { id: '1', subject: 'A', status: 'in_progress', blockedBy: [] },
      { id: '2', subject: 'B', status: 'pending', blockedBy: [] },
    ]
    expect(applyPlanCall(plan, 'TaskList', {}, { tasks })).toEqual([
      { id: '1', text: 'A', status: 'in_progress', activeForm: 'Fazendo A' },
      { id: '2', text: 'B', status: 'pending' },
    ])
    expect(applyPlanCall(plan, 'Bash', { command: 'ls' }, {})).toBe(plan)
    expect(applyPlanCall(plan, 'TaskUpdate', { taskId: '1', status: 'completed' }, { success: false, taskId: '1', updatedFields: [] })).toBe(plan)
  })

  test('the plan row', () => {
    const plan = applyPlanCall([], 'TodoWrite', { todos: TODOS }, {})
    expect(planRow(plan)).toBe('Plano ▱▱▱▱▱▱▱▱▱▱ 0/2 · Agora: Escrevendo testes')
    expect(planRow(applyPlanCall([], 'TodoWrite', { todos: [TODOS_DONE[0], TODOS[1]] }, {}))).toBe('Plano ▰▰▰▰▰▱▱▱▱▱ 1/2')
    expect(planRow(applyPlanCall([], 'TodoWrite', { todos: TODOS_DONE }, {}))).toBeNull()
    expect(planRow([])).toBeNull()
  })
})

describe('band', () => {
  test('the band shows what needs you when idle', async ($, on) => {
    mock.store(on)
    engine(on)
    await finish($, ANSWER)
    const ui = await mountBand($)
    expect(await ui.find({ text: '⚠ Precisa de você: o GO para subir · Instalar o realce?' })).toBeDefined()
    expect(await ui.find({ text: 'engine' })).toBeUndefined()
    await ui.press({ key: 'hide-pending' })
    expect(await ui.find({ text: 'Precisa de você' })).toBeUndefined()
    expect(await ui.find({ text: 'engine' })).toBeDefined()
  })

  test('the band shows the plan while working', async ($, on) => {
    mock.store(on)
    engine(on)
    await finish($, ANSWER)
    await $.tool.call({ tool: 'TodoWrite', todos: [TODOS_DONE[0]!, { ...TODOS[1]!, status: 'in_progress' }] })
    const ui = await mountBand($, { isWorking: true })
    expect(await ui.find({ text: 'Plano ▰▰▰▰▰▱▱▱▱▱ 1/2 · Agora: Implementando' })).toBeDefined()
    expect(await ui.find({ text: 'Precisa de você' })).toBeUndefined()
  })

  test('idle with nothing pending, an open plan still shows; a finished one does not', async ($, on) => {
    mock.store(on)
    engine(on)
    await $.tool.call({ tool: 'TodoWrite', todos: TODOS })
    const ui = await mountBand($)
    expect(await ui.find({ text: 'Plano ▱▱▱▱▱▱▱▱▱▱ 0/2 · Agora: Escrevendo testes' })).toBeDefined()
    await $.tool.call({ tool: 'TodoWrite', todos: TODOS_DONE })
    expect(await ui.find({ text: 'Plano' })).toBeUndefined()
    expect(await ui.find({ text: 'engine' })).toBeDefined()
  })

  test('the person\'s next prompt clears what needed you', async ($, on) => {
    mock.store(on)
    engine(on)
    await finish($, ANSWER)
    const ui = await mountBand($)
    expect(await ui.find({ text: 'Precisa de você' })).toBeDefined()
    await $.prompt.submit({ text: 'Agente terminou', wait: false, origin: { kind: 'task-notification' }, isMeta: true })
    expect(await ui.find({ text: 'Precisa de você' })).toBeDefined()
    await $.prompt.submit({ text: 'Vai', wait: false, origin: { kind: 'composer' } })
    expect(await ui.find({ text: 'Precisa de você' })).toBeUndefined()
  })

  test('a subagent answer or plan does not reach the band', async ($, on) => {
    mock.store(on)
    engine(on)
    await finish($, ANSWER, 'agent-1')
    await $.tool.call({ tool: 'TodoWrite', todos: TODOS, agentId: 'agent-1' } as Parameters<Engine['tool']['call']>[0])
    const ui = await mountBand($)
    expect(await ui.find({ text: 'engine' })).toBeDefined()
    expect(await (await mountBand($, { isWorking: true })).find({ text: 'engine' })).toBeDefined()
  })

  test('an answer with nothing for you clears the band', async ($, on) => {
    mock.store(on)
    engine(on)
    await finish($, ANSWER)
    await finish($, 'Pronto.')
    expect(await (await mountBand($)).find({ text: 'engine' })).toBeDefined()
  })

  test('a survey holds the band', async ($, on) => {
    mock.store(on)
    engine(on)
    await finish($, ANSWER)
    expect(await (await mountBand($, { hasSurvey: true })).find({ text: 'engine' })).toBeDefined()
  })

  test('the band fits its width and rows', async ($, on) => {
    mock.store(on)
    engine(on)
    await finish($, Array.from({ length: 6 }, (_, n) => `{!uma pendência bem comprida de número ${n}!}`).join(' '))
    const ui = await mountBand($, { bodyColumns: 50, maxRows: 2 })
    const texts = (await ui.findAll({ type: 'Text' })).map(el => el.text)
    const band = (texts.find(t => t.startsWith('⚠ Precisa de você: ')) ?? '').split('\n')
    expect(band).toHaveLength(2)
    expect(band[1]!.endsWith('…')).toBe(true)
    // The hide button takes 12 cells beside the text.
    for (const line of band) expect([...line].length).toBeLessThanOrEqual(50 - 12)
    await $.tool.call({ tool: 'TodoWrite', todos: TODOS })
    const plan = await mountBand($, { isWorking: true, bodyColumns: 30 })
    const row = (await plan.findAll({ type: 'Text' })).map(el => el.text).find(t => t.startsWith('Plano')) ?? ''
    expect([...row].length).toBeLessThanOrEqual(30)
    expect(row.endsWith('…')).toBe(true)
  })

  test('pendencias and plano off draw the engine', async ($, on) => {
    mock.store(on, { flags: { pendencias: false, plano: false } })
    engine(on)
    await finish($, ANSWER)
    await $.tool.call({ tool: 'TodoWrite', todos: TODOS })
    expect(await (await mountBand($)).find({ text: 'engine' })).toBeDefined()
    expect(await (await mountBand($, { isWorking: true })).find({ text: 'engine' })).toBeDefined()
  })
})

describe('session pane', () => {
  const AGENT: AgentInfo = { id: 'a1', description: 'Revisar desenho', type: 'Explore', status: 'running' }

  test('the session pane lists the plan, what needs you, files, failures and agents', async ($, on) => {
    mock.store(on)
    const clock = mock.clock(on, { now: Date.UTC(2026, 9, 19, 18, 41) })
    engine(on)
    let agents: AgentInfo[] = []
    const { logs } = startStandIns(on, () => agents)
    // The screen area writes files and failures; here they stand as already written.
    const files = [
      { path: '/a/b/old.ts', added: 1, removed: 0, edits: 1, at: 1 },
      { path: '/a/b/hooks/x.ts', added: 3, removed: 1, edits: 2, at: 2 },
    ]
    on('state.get', { plugin: 'realce', key: 'files' }, () => ({ value: { value: files, version: 1 } }))
    on('state.get', { plugin: 'realce', key: 'failures' }, () => ({ value: { value: [{ command: 'npm test', line: '2 failing', at: 3 }], version: 1 } }))
    await $.session.start({ cwd: '/a/b', surface: 'terminal', isInteractive: true })
    await finish($, ANSWER)
    await $.tool.call({ tool: 'TodoWrite', todos: TODOS })
    agents = [AGENT, { id: 'a0', description: 'Varrer docs', type: 'general-purpose', status: 'completed' }]
    await clock.advance(2000)
    const ui = await mountPane($)
    const texts = (await ui.findAll({ type: 'Text' })).map(el => el.text)
    expect(texts).toContain('Plano 0/2')
    expect(texts).toContain('▸ Escrevendo testes')
    expect(texts).toContain('○ Implementar')
    expect(texts).toContain('• o GO para subir')
    expect(texts).toContain('Arquivos (2)')
    expect(texts.indexOf('hooks/x.ts +3 −1')).toBeLessThan(texts.indexOf('old.ts +1 −0'))
    expect(texts).toContain('npm test')
    expect(texts).toContain('2 failing')
    const rows = texts.filter(t => t.startsWith('◆ ') && t.length > 2)
    expect(rows).toEqual(['◆ Revisar desenho · Explore · Rodando · desde 15:41', '◆ Varrer docs · general-purpose · Concluído · desde 15:41'])
    expect(logs).toEqual([])
  })

  test('an agent keeps the time it was first seen, and its new status shows', async ($, on) => {
    mock.store(on)
    const clock = mock.clock(on, { now: Date.UTC(2026, 9, 19, 18, 41) })
    engine(on)
    let agents: AgentInfo[] = [AGENT]
    const { logs } = startStandIns(on, () => agents)
    await $.session.start({ cwd: '/a/b', surface: 'terminal', isInteractive: true })
    await clock.advance(2000)
    agents = [{ ...AGENT, status: 'failed' }]
    await clock.advance(120_000)
    const ui = await mountPane($)
    expect(await ui.find({ text: '◆ Revisar desenho · Explore · Falhou · desde 15:41' })).toBeDefined()
    expect(logs).toEqual([])
  })

  test('agents are written only when the list changes', async ($, on) => {
    mock.store(on)
    const clock = mock.clock(on)
    let writes = 0
    on('state.set', { plugin: 'realce', key: 'agents' }, ($, e, next) => {
      writes++
      return next(e)
    })
    let agents: AgentInfo[] = [AGENT]
    startStandIns(on, () => agents)
    await $.session.start({ cwd: '/a/b', surface: 'terminal', isInteractive: true })
    await clock.advance(10_000)
    expect(writes).toBe(1)
    agents = [{ ...AGENT, status: 'completed' }]
    await clock.advance(10_000)
    expect(writes).toBe(2)
  })

  test('a narrow pane keeps each row on its line, file names whole', async ($, on) => {
    mock.store(on)
    on('state.get', { plugin: 'realce', key: 'files' }, () => ({
      value: { value: [{ path: '/x/uma/pasta/bem/funda/arquivo.ts', added: 12, removed: 3, edits: 1, at: 1 }], version: 1 },
    }))
    const ui = await $.ui.mount({ plugin: 'realce', surface: 'terminal', component: 'Pane', requestId: 'realce-sessao', props: { ...PANE, bodyColumns: 24 } })
    const texts = (await ui.findAll({ type: 'Text' })).map(el => el.text)
    expect(texts).toContain('…funda/arquivo.ts +12 −3')
    for (const t of texts) expect([...t].length).toBeLessThanOrEqual(24)
  })

  test('an empty session says so', async ($, on) => {
    mock.store(on)
    expect(await (await mountPane($)).find({ text: 'Nada por aqui ainda.' })).toBeDefined()
  })

  test('painel opens at start by default', async ($, on) => {
    mock.store(on)
    mock.clock(on)
    const { opened } = startStandIns(on)
    await $.session.start({ cwd: '/a/b', surface: 'terminal', isInteractive: true })
    expect(opened).toEqual(['realce-sessao'])
  })

  test('a -p run opens no pane', async ($, on) => {
    mock.store(on)
    mock.clock(on)
    const { opened } = startStandIns(on)
    await $.session.start({ cwd: '/a/b', surface: null, isInteractive: false })
    expect(opened).toEqual([])
  })

  test('painel off leaves the pane closed at start', async ($, on) => {
    mock.store(on, { flags: { painel: false } })
    mock.clock(on)
    const { opened } = startStandIns(on)
    await $.session.start({ cwd: '/a/b', surface: 'terminal', isInteractive: true })
    expect(opened).toEqual([])
  })
})
