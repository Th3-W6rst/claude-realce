import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { AgentInfo, On, PromptEditInput, RenderPropsOf } from 'claude-code'

import { awaySummary, awayText } from '../hooks/orient/away'
import { limitText, limitWarning, usageLine } from '../hooks/orient/limits'
import { togglePin } from '../hooks/orient/pins'
import { reportText } from '../hooks/orient/report'
import { scrollRefusal } from '../hooks/orient/timeline'
import { questionHeader } from '../hooks/orient/question'
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
  on('config.list', () => ({ value: [] }))
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
    mock.clock(on)
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
    mock.store(on)
    mock.clock(on)
    const { sent, played } = notifyWorld(on)
    await longTurn($, 61_000)
    expect(sent).toEqual([{ text: '1m 1s · ✔ testes · ✔ provado', title: 'Claude terminou' }])
    expect(played).toEqual([])
  })

  test('a short turn does not', async ($, on) => {
    mock.store(on)
    mock.clock(on)
    const { sent } = notifyWorld(on)
    await longTurn($, 59_000)
    expect(sent).toEqual([])
  })

  test('an aborted turn does not', async ($, on) => {
    mock.store(on)
    mock.clock(on)
    const { sent } = notifyWorld(on)
    await longTurn($, 61_000, { isAborted: true })
    expect(sent).toEqual([])
  })

  test("a subagent's turn does not", async ($, on) => {
    mock.store(on)
    mock.clock(on)
    const { sent } = notifyWorld(on)
    await $.turn.complete({ answer: 'x', durationMs: 90_000, isAborted: false, turnId: 't2', reason: 'answer', agentId: 'sub1' })
    expect(sent).toEqual([])
  })

  test('a question after a minute of work notifies', async ($, on) => {
    mock.store(on)
    const clock = mock.clock(on)
    const { sent } = notifyWorld(on)
    await $.prompt.submit({ text: 'oi', origin: { kind: 'composer' }, wait: false })
    await clock.advance(61_000)
    await $.tool.call({ tool: 'AskUserQuestion', questions: [{ question: 'Qual nome?', header: 'Nome', options: [], multiSelect: false }] })
    expect(sent).toEqual([{ text: 'Qual nome?', title: 'Claude precisa de você' }])
  })

  test('a question right away does not', async ($, on) => {
    mock.store(on)
    mock.clock(on)
    const { sent } = notifyWorld(on)
    await $.prompt.submit({ text: 'oi', origin: { kind: 'composer' }, wait: false })
    await $.tool.call({ tool: 'AskUserQuestion', questions: [{ question: 'Qual nome?', header: 'Nome', options: [], multiSelect: false }] })
    expect(sent).toEqual([])
  })

  test('som plays a system sound with the notice', async ($, on) => {
    mock.store(on, { flags: { som: true } })
    const clock = mock.clock(on)
    const { played } = notifyWorld(on)
    await longTurn($, 61_000)
    await clock.settle()
    expect(played).toEqual([['afplay', '/System/Library/Sounds/Glass.aiff']])
  })

  test('a refused notice shows in status', async ($, on) => {
    mock.store(on)
    mock.clock(on)
    notifyWorld(on, { isSent: false, reason: 'disabled' })
    on('prompt.compose', () => ({ sections: [] }))
    await longTurn($, 61_000)
    const RUN = { command: 'realce', origin: { kind: 'composer' as const }, presentation: { isFullscreen: true, columns: 120 } }
    expect((await $.command.run({ ...RUN, args: 'status' })).text).toMatch(/Último aviso não enviado: disabled\./)
  })

  test('a terminal with no channel gets the macOS banner instead', async ($, on) => {
    mock.store(on)
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
    mock.store(on)
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
    mock.store(on, { flags: { avisos: false } })
    mock.clock(on)
    const { sent } = notifyWorld(on)
    await longTurn($, 61_000)
    expect(sent).toEqual([])
  })
})

describe('while you were away', () => {
  const PASSED = { runner: 'bun', passed: 159, failed: 0, skipped: 0, unit: 'testes' as const }
  const stats = (files: number, tests: typeof PASSED | null = null) => ({ endedAt: 0, tools: 3, files, tests, seal: null })

  test('a short gap or no finished turn makes no summary', () => {
    expect(awaySummary(9 * 60_000, 0, [stats(1)], 0)).toBeNull()
    expect(awaySummary(32 * 60_000, 0, [], 0)).toBeNull()
  })

  test('the summary names what happened, the parts it has', () => {
    const s = awaySummary(32 * 60_000, 0, [stats(2), stats(3, PASSED)], 1)
    expect(s && awayText(s)).toBe('↺ Enquanto você estava fora (32 min): 2 turnos · 5 arquivos · ✔ 159 testes · 1 decisão esperando')
    const one = awaySummary(12 * 60_000, 0, [{ ...stats(1), seal: 'unproved' as const }], 2)
    expect(one && awayText(one)).toBe('↺ Enquanto você estava fora (12 min): 1 turno · 1 arquivo · ⚠ sem prova · 2 decisões esperando')
    const bare = awaySummary(15 * 60_000, 0, [stats(0)], 0)
    expect(bare && awayText(bare)).toBe('↺ Enquanto você estava fora (15 min): 1 turno')
  })

  // The kit raises prompt.edit as the engine does, though its typed `$` lists no call for it.
  const edit = ($: Engine) =>
    ($.prompt as unknown as { edit: (e: PromptEditInput) => Promise<unknown> }).edit({ origin: { kind: 'composer' }, text: '', cursor: 0, start: 0, end: 0, inputText: 'a' })

  async function awayWorld($: Engine, on: On, minutes: number) {
    mock.store(on)
    const clock = mock.clock(on, { now: Date.UTC(2026, 9, 19, 20, 0) })
    engine(on)
    on('prompt.edit', ($, e) => ({ text: e.text + e.inputText, cursor: e.cursor + e.inputText.length }))
    await $.prompt.submit({ text: 'faz tudo', origin: { kind: 'composer' }, wait: false })
    await $.tool.call({ tool: 'Edit', file_path: '/a/b/x.ts', old_string: 'a', new_string: 'b' })
    await clock.advance(minutes * 60_000)
    await finish($, 'Feito.')
    return clock
  }

  test('the band shows it on the first keystroke back, and a submit clears it', async ($, on) => {
    await awayWorld($, on, 32)
    await edit($)
    const ui = await mountBand($)
    expect(await ui.find({ text: '↺ Enquanto você estava fora (32 min): 1 turno · 1 arquivo' })).toBeDefined()
    await $.prompt.submit({ text: 'valeu', origin: { kind: 'composer' }, wait: false })
    expect(await ui.find({ text: /Enquanto você estava fora/ })).toBeUndefined()
  })

  test('typing while the turn ran means you were there', async ($, on) => {
    mock.store(on)
    const clock = mock.clock(on, { now: Date.UTC(2026, 9, 19, 20, 0) })
    engine(on)
    on('prompt.edit', ($, e) => ({ text: e.text + e.inputText, cursor: e.cursor + e.inputText.length }))
    await $.prompt.submit({ text: 'faz tudo', origin: { kind: 'composer' }, wait: false })
    await clock.advance(15 * 60_000)
    await edit($)
    await clock.advance(2 * 60_000)
    await finish($, 'Feito.')
    await clock.advance(60_000)
    await edit($)
    expect(await (await mountBand($)).find({ text: /Enquanto você estava fora/ })).toBeUndefined()
  })

  test('typing soon after the turn shows nothing', async ($, on) => {
    await awayWorld($, on, 3)
    await edit($)
    expect(await (await mountBand($)).find({ text: /Enquanto você estava fora/ })).toBeUndefined()
  })

  test('what needs you comes first', async ($, on) => {
    mock.store(on)
    const clock = mock.clock(on, { now: Date.UTC(2026, 9, 19, 20, 0) })
    engine(on)
    on('prompt.edit', ($, e) => ({ text: e.text + e.inputText, cursor: e.cursor + e.inputText.length }))
    await $.prompt.submit({ text: 'faz tudo', origin: { kind: 'composer' }, wait: false })
    await clock.advance(20 * 60_000)
    await finish($, ANSWER)
    await edit($)
    const ui = await mountBand($)
    expect(await ui.find({ text: /Precisa de você/ })).toBeDefined()
    expect(await ui.find({ text: /Enquanto você estava fora/ })).toBeUndefined()
  })

  test('the band fits 40 columns on one line', async ($, on) => {
    await awayWorld($, on, 32)
    await edit($)
    const line = (await (await mountBand($, { bodyColumns: 40 })).findAll({ type: 'Text' })).find(t => t.text.startsWith('↺'))
    expect(line?.props.wrap).toBe('truncate-end')
  })

  test('ausencia off shows nothing', async ($, on) => {
    mock.store(on, { flags: { ausencia: false } })
    const clock = mock.clock(on)
    engine(on)
    on('prompt.edit', ($, e) => ({ text: e.text + e.inputText, cursor: e.cursor + e.inputText.length }))
    await $.prompt.submit({ text: 'faz tudo', origin: { kind: 'composer' }, wait: false })
    await clock.advance(30 * 60_000)
    await finish($, 'Feito.')
    await edit($)
    expect(await (await mountBand($)).find({ text: /Enquanto você estava fora/ })).toBeUndefined()
  })
})

describe('timeline', () => {
  async function promptRow($: Engine, text: string, uuid: string) {
    await $.prompt.submit({ text, origin: { kind: 'composer' }, wait: false })
    await $.session.append({ message: { type: 'user', role: 'user', content: [{ type: 'text', text }] }, door: 'prompt', origin: { kind: 'composer' }, uuid })
  }

  test('a prompt opens a row, its turn completes it', async ($, on) => {
    mock.store(on)
    mock.clock(on, { now: Date.UTC(2026, 9, 19, 23, 41) })
    engine(on)
    startStandIns(on)
    await $.session.start({ cwd: '/a/b', surface: 'terminal', isInteractive: true })
    await promptRow($, 'Renomeia o parâmetro b', 'u1')
    const ui = await mountPane($)
    expect((await ui.find({ key: 'turn-u1' }))?.text).toBe('20:41 · Renomeia o parâmetro b')
    await $.turn.complete({ answer: 'Feito.', durationMs: 12_000, isAborted: false, turnId: 't1', reason: 'answer' })
    expect((await ui.find({ key: 'turn-u1' }))?.text).toBe('20:41 · 12s · Renomeia o parâmetro b')
  })

  // The kit has no transcript to scroll ($.ui.scroll to a row answers "no implementation"): the scroll itself is
  // checked live; here, each row is the button that asks for it.
  test('each row is a button to its prompt', async ($, on) => {
    mock.store(on)
    mock.clock(on)
    engine(on)
    await promptRow($, 'oi', 'u7')
    const row = await (await mountPane($)).find({ key: 'turn-u7' })
    expect(row?.type).toBe('Button')
  })

  test('a prompt typed over a running turn joins its row', async ($, on) => {
    mock.store(on)
    mock.clock(on)
    engine(on)
    await promptRow($, 'primeiro', 'u1')
    await $.prompt.submit({ text: 'e mais isso', origin: { kind: 'composer' }, wait: false, turnId: 'running' })
    await $.session.append({ message: { type: 'user', role: 'user', content: [{ type: 'text', text: 'e mais isso' }] }, door: 'prompt', origin: { kind: 'composer' }, uuid: 'u2' })
    await $.turn.complete({ answer: 'ok', durationMs: 9_000, isAborted: false, turnId: 't1', reason: 'answer' })
    const ui = await mountPane($)
    expect(await ui.find({ key: 'turn-u2' })).toBeUndefined()
    expect((await ui.find({ key: 'turn-u1' }))?.text).toBe('9s · primeiro')
  })

  test('a refused scroll says why', () => {
    expect(scrollRefusal('not person-initiated')).toBe('A linha do tempo rola só em tela cheia.')
    expect(scrollRefusal('none scrolls')).toBe('A linha do tempo rola só em tela cheia.')
    expect(scrollRefusal('the window moved meanwhile')).toBe('Não deu para rolar: the window moved meanwhile.')
  })

  test('a reminder or a tool result opens no row', async ($, on) => {
    mock.store(on)
    mock.clock(on)
    engine(on)
    await $.session.append({ message: { type: 'user', role: 'user', isMeta: true, content: [{ type: 'text', text: 'lembrete' }] }, door: 'prompt', origin: { kind: 'composer' }, uuid: 'm1' })
    expect(await (await mountPane($)).find({ key: 'turn-m1' })).toBeUndefined()
  })

  test('linha off hides the section', async ($, on) => {
    mock.store(on, { flags: { linha: false } })
    mock.clock(on)
    engine(on)
    await promptRow($, 'oi', 'u1')
    expect(await (await mountPane($)).find({ key: 'turn-u1' })).toBeUndefined()
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

describe('explain this', () => {
  const RUN = { command: 'realce', origin: { kind: 'composer' as const }, presentation: { isFullscreen: true, columns: 120 } }
  const USAGE = { input_tokens: 10, output_tokens: 10, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }

  function explainWorld(on: On, selection: { text: string } | undefined, answer: Record<string, unknown> = { isAnswered: true, text: 'É uma forma de repintar só um pedaço.', usage: USAGE }) {
    const asked: { model: string; system?: unknown; prompt: unknown; maxTokens?: number; timeoutMs?: number }[] = []
    on('ui.selection', () => ({ value: selection as never }))
    on('model.complete', ($, e) => {
      asked.push(e as never)
      return ('deny' in answer ? answer : { value: answer }) as never
    })
    on('ui.open', () => ({ value: { isPlaced: true as const } }))
    return asked
  }

  test('no selection says how', async ($, on) => {
    mock.store(on)
    mock.clock(on)
    explainWorld(on, undefined)
    expect((await $.command.run({ ...RUN, args: 'explica' })).text).toBe('Selecione um trecho da conversa (em tela cheia) ou escreva o que explicar: /realce explica <texto>.')
  })

  test('the text after the command is explained when given', async ($, on) => {
    mock.store(on)
    const clock = mock.clock(on)
    const asked = explainWorld(on, undefined)
    expect((await $.command.run({ ...RUN, args: 'explica O que é um Hook?' })).text).toBe('Explicando no painel.')
    await clock.settle()
    expect(String(asked[0]!.prompt)).toBe('O que é um Hook?')
  })

  test('a selection is explained in the pane', async ($, on) => {
    mock.store(on)
    const clock = mock.clock(on)
    const asked = explainWorld(on, { text: 'ui.blit repinta um Raster' })
    expect((await $.command.run({ ...RUN, args: 'explica' })).text).toBe('Explicando no painel.')
    const ui = await mountPane($)
    expect(await ui.find({ text: 'Explicando…' })).toBeDefined()
    await clock.settle()
    expect(asked[0]).toMatchObject({ model: 'haiku', maxTokens: 400, timeoutMs: 30000 })
    expect(String(asked[0]!.system)).toBe('Explique em português simples, em até 4 frases, para quem não é especialista.')
    expect(String(asked[0]!.prompt)).toBe('ui.blit repinta um Raster')
    expect(await ui.find({ text: 'Explicação' })).toBeDefined()
    expect(await ui.find({ text: 'É uma forma de repintar só um pedaço.' })).toBeDefined()
  })

  test('a late answer to an older request does not replace the newer one', async ($, on) => {
    mock.store(on)
    const clock = mock.clock(on)
    let selection = { text: 'primeiro' }
    let release: (v: unknown) => void = () => {}
    on('ui.selection', () => ({ value: selection }))
    on('ui.open', () => ({ value: { isPlaced: true as const } }))
    on('model.complete', ($, e) =>
      String((e as { prompt: unknown }).prompt) === 'primeiro'
        ? (new Promise(r => (release = r)) as never)
        : ({ value: { isAnswered: true, text: 'Resposta do segundo.', usage: USAGE } } as never),
    )
    await $.command.run({ ...RUN, args: 'explica' })
    await clock.advance(1)
    selection = { text: 'segundo' }
    await $.command.run({ ...RUN, args: 'explica' })
    await clock.settle()
    release({ value: { isAnswered: true, text: 'Resposta do primeiro.', usage: USAGE } })
    await clock.settle()
    const ui = await mountPane($)
    expect(await ui.find({ text: 'Resposta do segundo.' })).toBeDefined()
    expect(await ui.find({ text: 'Resposta do primeiro.' })).toBeUndefined()
  })

  test('the explanation closes from the pane', async ($, on) => {
    mock.store(on)
    const clock = mock.clock(on)
    explainWorld(on, { text: 'abc' })
    await $.command.run({ ...RUN, args: 'explica' })
    await clock.settle()
    const ui = await mountPane($)
    await ui.press({ key: 'close-explain' })
    expect(await ui.find({ text: 'Explicação' })).toBeUndefined()
  })

  test('a long selection is cut to 4000 characters', async ($, on) => {
    mock.store(on)
    const clock = mock.clock(on)
    const asked = explainWorld(on, { text: 'x'.repeat(9000) })
    await $.command.run({ ...RUN, args: 'explica' })
    await clock.settle()
    expect(String(asked[0]!.prompt).length).toBe(4000)
  })

  test('a model failure shows why', async ($, on) => {
    mock.store(on)
    const clock = mock.clock(on)
    explainWorld(on, { text: 'abc' }, { isAnswered: false, reason: 'empty-reply', usage: USAGE })
    await $.command.run({ ...RUN, args: 'explica' })
    await clock.settle()
    expect(await (await mountPane($)).find({ text: 'Sem explicação: empty-reply' })).toBeDefined()
  })

  test('explica off says how to turn it on', async ($, on) => {
    mock.store(on, { flags: { explica: false } })
    mock.clock(on)
    explainWorld(on, { text: 'abc' })
    expect((await $.command.run({ ...RUN, args: 'explica' })).text).toBe('Recurso desligado: Explica isso. /realce explica on liga.')
  })
})

describe('pins', () => {
  const RUN = { command: 'realce', origin: { kind: 'composer' as const }, presentation: { isFullscreen: true, columns: 120 } }
  const pin = (n: number) => ({ requestId: `r${n}`, at: n, preview: `resposta ${n}` })

  test('a pin toggles, and the oldest of 21 goes', () => {
    expect(togglePin([], pin(1))).toEqual([pin(1)])
    expect(togglePin([pin(1), pin(2)], pin(1))).toEqual([pin(2)])
    const full = Array.from({ length: 20 }, (_, i) => pin(i))
    const more = togglePin(full, pin(99))
    expect(more).toHaveLength(20)
    expect(more[0]).toEqual(pin(1))
    expect(more[19]).toEqual(pin(99))
  })

  async function reply($: Engine, text: string, uuid: string) {
    await $.session.append({ message: { type: 'assistant', role: 'assistant', content: [{ type: 'text', text }] }, door: 'response', origin: { kind: 'model', model: 'm' }, uuid })
  }

  test('/realce fixar pins the last reply, then unpins it', async ($, on) => {
    mock.store(on)
    mock.clock(on)
    on('ui.selection', () => ({ value: undefined as never }))
    expect((await $.command.run({ ...RUN, args: 'fixar' })).text).toBe('Nenhuma resposta para fixar ainda.')
    await reply($, 'Primeira resposta\nmais', 'a1')
    await reply($, 'Resposta importante sobre o deploy', 'a2')
    expect((await $.command.run({ ...RUN, args: 'fixar' })).text).toBe('Resposta fixada.')
    const ui = await mountPane($)
    expect((await ui.find({ key: 'pin-a2' }))?.text).toMatch(/Resposta importante sobre o deploy$/)
    expect((await ui.find({ key: 'pin-a2' }))?.type).toBe('Button')
    expect((await $.command.run({ ...RUN, args: 'fixar' })).text).toBe('Resposta desafixada.')
    expect(await ui.find({ key: 'pin-a2' })).toBeUndefined()
  })

  test('a selection in a reply pins that reply', async ($, on) => {
    mock.store(on)
    mock.clock(on)
    on('ui.selection', () => ({ value: { text: 'Primeira resposta', requestId: 'a1' } }))
    await reply($, 'Primeira resposta', 'a1')
    await reply($, 'Segunda', 'a2')
    await $.command.run({ ...RUN, args: 'fixar' })
    const ui = await mountPane($)
    expect(await ui.find({ key: 'pin-a1' })).toBeDefined()
    expect(await ui.find({ key: 'pin-a2' })).toBeUndefined()
  })

  test('fixar off says how to turn it on', async ($, on) => {
    mock.store(on, { flags: { fixar: false } })
    expect((await $.command.run({ ...RUN, args: 'fixar' })).text).toBe('Recurso desligado: Fixar respostas. /realce fixar on liga.')
  })
})

describe('usage limit', () => {
  const CONTEXT = { window: 1_000_000, tokens: 300_000, percent: 30 }
  const measure = (rateLimits: { kind: string; percentUsed: number; resetsAt?: string }[], context = CONTEXT) => ({ context, rateLimits, changed: ['rateLimits' as const] })

  test('the highest window past 80% is the warning', () => {
    expect(limitWarning(measure([{ kind: 'five_hour', percentUsed: 60 }]))).toBeNull()
    expect(limitWarning(measure([{ kind: 'five_hour', percentUsed: 86, resetsAt: '2026-10-20T02:40:00Z' }, { kind: 'seven_day', percentUsed: 81 }]))).toEqual({ kind: 'rate', label: '5 h', percent: 86, resetsAt: Date.UTC(2026, 9, 20, 2, 40) })
    expect(limitWarning(measure([], { window: 200_000, tokens: 182_000, percent: 91 }))).toEqual({ kind: 'context', label: 'contexto', percent: 91, resetsAt: null })
  })

  test('the warning says what fills and when it renews', () => {
    expect(limitText({ kind: 'rate', label: '5 h', percent: 86, resetsAt: Date.UTC(2026, 9, 20, 2, 40) }, -180, Date.UTC(2026, 9, 20, 2, 0))).toBe('⚠ Limite de 5 h em 86% · renova às 23:40')
    expect(limitText({ kind: 'rate', label: '7 dias', percent: 91, resetsAt: null }, -180, Date.UTC(2026, 9, 20, 2, 0))).toBe('⚠ Limite de 7 dias em 91%')
    expect(limitText({ kind: 'context', label: 'contexto', percent: 85, resetsAt: null }, -180, Date.UTC(2026, 9, 20, 2, 0))).toBe('⚠ Contexto em 85%: um /compact antes de algo grande')
  })

  test('a renewal more than a day away says the date', () => {
    const now = Date.UTC(2026, 9, 20, 2, 0)
    expect(limitText({ kind: 'rate', label: '7 dias', percent: 91, resetsAt: Date.UTC(2026, 9, 22, 2, 40) }, -180, now)).toBe('⚠ Limite de 7 dias em 91% · renova em 21/10 às 23:40')
    expect(limitText({ kind: 'rate', label: '5 h', percent: 86, resetsAt: Date.UTC(2026, 9, 20, 2, 40) }, -180, now)).toBe('⚠ Limite de 5 h em 86% · renova às 23:40')
  })

  test('the context warns from 90%, the windows from 80%', () => {
    expect(limitWarning(measure([], { window: 200_000, tokens: 170_000, percent: 85 }))).toBeNull()
    expect(limitWarning(measure([], { window: 200_000, tokens: 182_000, percent: 91 }))?.kind).toBe('context')
  })

  test('hiding one warning does not hide another source at the same step', async ($, on) => {
    mock.store(on)
    mock.clock(on)
    engine(on)
    on('session.measure', ($, e) => ({ changed: e.changed }))
    await $.session.measure(measure([], { window: 200_000, tokens: 182_000, percent: 91 }))
    const ui = await mountBand($)
    await ui.press({ key: 'hide-limit' })
    await $.session.measure(measure([{ kind: 'five_hour', percentUsed: 92 }], { window: 200_000, tokens: 182_000, percent: 91 }))
    expect(await ui.find({ text: /Limite de 5 h em 92%/ })).toBeDefined()
  })

  test('while Claude works, the plan bar comes before the limit', async ($, on) => {
    mock.store(on)
    mock.clock(on)
    engine(on)
    on('session.measure', ($, e) => ({ changed: e.changed }))
    await $.tool.call({ tool: 'TodoWrite', todos: TODOS })
    await $.session.measure(measure([{ kind: 'five_hour', percentUsed: 86 }]))
    expect(await (await mountBand($, { isWorking: true })).find({ text: /Plano/ })).toBeDefined()
    expect(await (await mountBand($, { isWorking: false })).find({ text: /Limite de 5 h/ })).toBeDefined()
  })

  test('the band shows it, hides it, and shows it again past the next step', async ($, on) => {
    mock.store(on)
    mock.clock(on, { now: Date.UTC(2026, 9, 20, 2, 0) })
    engine(on)
    startStandIns(on)
    on('session.measure', ($, e) => ({ changed: e.changed }))
    await $.session.start({ cwd: '/a/b', surface: 'terminal', isInteractive: true })
    await $.session.measure(measure([{ kind: 'five_hour', percentUsed: 86, resetsAt: '2026-10-20T02:40:00Z' }]))
    const ui = await mountBand($)
    expect(await ui.find({ text: '⚠ Limite de 5 h em 86% · renova às 23:40' })).toBeDefined()
    await ui.press({ key: 'hide-limit' })
    expect(await ui.find({ text: /Limite de 5 h/ })).toBeUndefined()
    await $.session.measure(measure([{ kind: 'five_hour', percentUsed: 88 }]))
    expect(await ui.find({ text: /Limite de 5 h/ })).toBeUndefined()
    await $.session.measure(measure([{ kind: 'five_hour', percentUsed: 91 }]))
    expect(await ui.find({ text: '⚠ Limite de 5 h em 91%' })).toBeDefined()
  })

  test('the usage line names the context and each window', () => {
    expect(usageLine({ context: 30, windows: [{ label: '5 h', percent: 46 }, { label: '7 dias', percent: 12 }] }).map(s => s.text).join('')).toBe('Contexto 30% · 5 h 46% · 7 dias 12%')
    expect(usageLine({ context: null, windows: [] })).toEqual([])
  })

  test('the context colors like its warning: amber from 90%', () => {
    const tones = (context: number) => usageLine({ context, windows: [] })[0]?.color
    expect(tones(85)).toBe(usageLine({ context: 10, windows: [] })[0]?.color)
    expect(tones(91)).not.toBe(tones(85))
  })

  test('the session pane shows the usage once measured', async ($, on) => {
    mock.store(on)
    mock.clock(on)
    engine(on)
    on('session.measure', ($, e) => ({ changed: e.changed }))
    await $.session.measure(measure([{ kind: 'five_hour', percentUsed: 46 }, { kind: 'seven_day', percentUsed: 12 }]))
    const ui = await mountPane($)
    expect(await ui.find({ text: 'Uso' })).toBeDefined()
    expect(await ui.find({ text: /Contexto 30% · 5 h 46% · 7 dias 12%/ })).toBeDefined()
  })

  test('limite off shows nothing', async ($, on) => {
    mock.store(on, { flags: { limite: false } })
    mock.clock(on)
    engine(on)
    on('session.measure', ($, e) => ({ changed: e.changed }))
    await $.session.measure(measure([{ kind: 'five_hour', percentUsed: 97 }]))
    expect(await (await mountBand($)).find({ text: /Limite/ })).toBeUndefined()
  })
})

describe('pane links', () => {
  test('a touched file opens in the editor, a failure scrolls to its command', async ($, on) => {
    mock.store(on)
    mock.clock(on)
    // The specific tools answer before the engine's catch-all below them.
    on('tool.call', { tool: 'Edit' }, () => ({ result: { filePath: '/a/b/x.ts', structuredPatch: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines: ['-a', '+b'] }] } }))
    on('tool.call', { tool: 'Bash' }, () => ({ isError: true as const, result: 'Exit code 1\nnope', text: 'Exit code 1\nnope' }))
    engine(on)
    startStandIns(on)
    on('model.complete', () => ({ value: { isAnswered: true, text: 'x', usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } } }) as never)
    on('ui.invalidate', () => ({ value: undefined }))
    on('ui.toast', () => ({ value: undefined }))
    await $.session.start({ cwd: '/a/b', surface: 'terminal', isInteractive: true })
    await $.tool.call({ tool: 'Edit', file_path: '/a/b/x.ts', old_string: 'a', new_string: 'b' })
    await $.tool.call({ tool: 'Bash', command: 'npm test', tool_use_id: 'b1' })
    const ui = await mountPane($)
    const links = (await ui.findAll({ type: 'Link' })).map(l => l.props.href)
    expect(links).toContain('file:///a/b/x.ts')
    expect((await ui.find({ key: 'fail-b1' }))?.type).toBe('Button')
  })
})

describe('session report', () => {
  const PASSED = { runner: 'pytest', passed: 12, failed: 0, skipped: 0, unit: 'testes' as const }

  test('the report sums turns, seals, files, commits and failures', () => {
    const text = reportText({
      timeline: [
        { requestId: 'u1', at: Date.UTC(2026, 9, 19, 23, 41), prompt: 'Renomeia b', durationMs: 12_000, seal: 'proved', tests: PASSED },
        { requestId: 'u2', at: Date.UTC(2026, 9, 20, 0, 5), prompt: 'Sobe a versão', durationMs: 4_000, seal: 'unproved', tests: null },
      ],
      files: [{ path: '/a/b/calc.py', added: 3, removed: 1, edits: 2, at: 1 }, { path: '/a/b/README.md', added: 10, removed: 0, edits: 1, at: 2 }],
      commits: ['● commit 9cd805a', '↑ push main'],
      failures: [{ command: 'npm test', line: '2 failing', at: 3 }],
      cwd: '/a/b',
      tzOffsetMinutes: -180,
    })
    expect(text).toBe([
      '## Resumo da sessão (20:41–21:05)',
      '',
      '- **Turnos:** 2 (✔ 1 provado · ⚠ 1 sem prova)',
      '  - 20:41 · Renomeia b · ✔ provado',
      '  - 21:05 · Sobe a versão · ⚠ sem prova',
      '- **Testes:** último placar ✔ 12 testes',
      '- **Arquivos:** 2 (+13 −1)',
      '  - `calc.py` +3 −1',
      '  - `README.md` +10 −0',
      '- **Git:** ● commit 9cd805a · ↑ push main',
      '- **Falhas:** 1 (última: `npm test` → 2 failing)',
    ].join('\n'))
  })

  test('one passing test is one test', () => {
    const one = { runner: 'pytest', passed: 1, failed: 0, skipped: 0, unit: 'testes' as const }
    const text = reportText({ timeline: [{ requestId: 'u', at: 0, prompt: 'x', durationMs: 1000, seal: 'proved', tests: one }], files: [], commits: [], failures: [], cwd: '/', tzOffsetMinutes: 0 })
    expect(text).toContain('último placar ✔ 1 teste')
    expect(text).not.toContain('1 testes')
  })

  test('a capped list says it is the latest part', () => {
    const rows = Array.from({ length: 50 }, (_, i) => ({ requestId: `u${i}`, at: i * 60_000, prompt: `p${i}`, durationMs: 1000, seal: null, tests: null }))
    const failures = Array.from({ length: 20 }, (_, i) => ({ command: `c${i}`, line: 'x', at: i }))
    const text = reportText({ timeline: rows, files: [], commits: [], failures, cwd: '/', tzOffsetMinutes: 0, isTimelineFull: true, isFailuresFull: true })
    expect(text).toContain('- **Turnos:** os últimos 50')
    expect(text).toContain('- **Falhas:** as últimas 20')
  })

  test('a multi-line command or one with backticks keeps the markdown whole', () => {
    const text = reportText({ timeline: [], files: [], commits: [], failures: [{ command: 'git commit -m "$(cat <<EOF\nmsg\nEOF\n)"', line: 'erro `x`', at: 1 }], cwd: '/', tzOffsetMinutes: 0 })
    expect(text).toContain('(última: `git commit -m "$(cat <<EOF…` → erro ˋxˋ)')
  })

  test('the command shows the report without markdown marks', async ($, on) => {
    mock.store(on)
    mock.clock(on)
    engine(on)
    on('ui.copy', () => ({ value: { isCopied: true as const } }))
    on('session.cwd', () => ({ value: '/a/b' }))
    on('process.run', () => ({ value: { exitCode: 0, stdout: '-0300\n', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
    await $.tool.call({ tool: 'Edit', file_path: '/a/b/x.ts', old_string: 'a', new_string: 'b' })
    const RUN = { command: 'realce', origin: { kind: 'composer' as const }, presentation: { isFullscreen: true, columns: 120 } }
    const text = (await $.command.run({ ...RUN, args: 'resumo' })).text ?? ''
    expect(text).toContain('Arquivos: 1')
    expect(text).not.toContain('**')
  })

  test('an empty session says so', () => {
    expect(reportText({ timeline: [], files: [], commits: [], failures: [], cwd: '/a', tzOffsetMinutes: -180 })).toBe('## Resumo da sessão\n\nNada aconteceu ainda nesta sessão.')
  })

  test('/realce resumo copies the report and shows it', async ($, on) => {
    mock.store(on)
    mock.clock(on)
    engine(on)
    const copied: string[] = []
    on('ui.copy', ($, e) => {
      copied.push(e.text)
      return { value: { isCopied: true as const } }
    })
    on('session.cwd', () => ({ value: '/a/b' }))
    on('process.run', () => ({ value: { exitCode: 0, stdout: '-0300\n', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
    const RUN = { command: 'realce', origin: { kind: 'composer' as const }, presentation: { isFullscreen: true, columns: 120 } }
    const text = (await $.command.run({ ...RUN, args: 'resumo' })).text ?? ''
    expect(text.startsWith('Resumo copiado em markdown.\n\nResumo da sessão')).toBe(true)
    expect(copied[0]?.startsWith('## Resumo da sessão')).toBe(true)
  })

  test('resumo off says how to turn it on', async ($, on) => {
    mock.store(on, { flags: { resumo: false } })
    const RUN = { command: 'realce', origin: { kind: 'composer' as const }, presentation: { isFullscreen: true, columns: 120 } }
    expect((await $.command.run({ ...RUN, args: 'resumo' })).text).toBe('Recurso desligado: Resumo da sessão. /realce resumo on liga.')
  })
})
