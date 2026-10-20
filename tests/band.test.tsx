import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { RenderPropsOf } from 'claude-code'

import { extractPending } from '../hooks/orient/pending'
import { applyPlanCall } from '../hooks/orient/plan'
import type { PlanItem } from '../types'
import { ANSWER, BAND, TODOS, TODOS_DONE, engine, finish, mountBand, planRow } from './world'
import { PT, PT_ALL } from './lang'

describe('pending', () => {
  test('pending items come from attention marks and decisions', () => {
    expect(extractPending(ANSWER)).toEqual(['o GO para subir', 'Instalar o realce?'])
  })

  test('decisions in any spelling, untitled ones by their first line, no repeats, at most 6', () => {
    expect(extractPending('> [!decisao] A?\n\n> [!Decision]\n> Subir B?\n\n{!A?!}')).toEqual(['A?', 'Subir B?'])
    expect(extractPending('> [!DECISÃO] {!Subir?!}')).toEqual(['Subir?'])
    expect(extractPending([1, 2, 3, 4, 5, 6, 7].map(n => `{!item ${n}!}`).join(' '))).toHaveLength(6)
  })

  test('code quoted inside what is asked stays in it', () => {
    // Seen live: "se viro um `@pytest.mark.slow` excluído" reached the band as "se viro um excluído".
    expect(extractPending('{!você decide se viro um `@pytest.mark.slow` excluído!}')).toEqual(['você decide se viro um @pytest.mark.slow excluído'])
    expect(extractPending('> [!DECISÃO] Apagar `test_lento.py`?')).toEqual(['Apagar test_lento.py?'])
  })

  test('marks quoted as code are not asked of you', () => {
    expect(extractPending('Use `{!x!}` para marcar.\n```\n{!y!}\n> [!DECISÃO] z\n```\nNada.')).toEqual([])
  })

  test('a fence inside a longer one stays code: what it quotes asks nothing, and what follows still asks', () => {
    // A `~~~` line inside a ``` block toggled the old rule off: the example reached the band, the real ask did not.
    expect(extractPending('```md\n~~~\n{!exemplo!}\n```\nFalta {!o GO!}.')).toEqual(['o GO'])
    expect(extractPending('````\n```\n{!dentro!}\n```\n````\n{!fora!}')).toEqual(['fora'])
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
    mock.store(on, PT_ALL)
    engine(on)
    await finish($, ANSWER)
    const ui = await mountBand($)
    expect(await ui.find({ text: '⚠ Precisa de você: o GO para subir · Instalar o realce?' })).toBeDefined()
    // What is drawn beneath (the engine's band or another mod's) stays under the notice.
    expect(await ui.find({ text: 'engine' })).toBeDefined()
    await ui.press({ key: 'hide-pending' })
    expect(await ui.find({ text: 'Precisa de você' })).toBeUndefined()
    expect(await ui.find({ text: 'engine' })).toBeDefined()
  })

  test('the band shows the plan while working', async ($, on) => {
    mock.store(on, PT)
    engine(on)
    await finish($, ANSWER)
    await $.tool.call({ tool: 'TodoWrite', todos: [TODOS_DONE[0]!, { ...TODOS[1]!, status: 'in_progress' }] })
    const ui = await mountBand($, { isWorking: true })
    expect(await ui.find({ text: 'Plano ▰▰▰▰▰▱▱▱▱▱ 1/2 · Agora: Implementando' })).toBeDefined()
    expect(await ui.find({ text: 'Precisa de você' })).toBeUndefined()
  })

  test('idle with nothing pending, an open plan still shows; a finished one does not', async ($, on) => {
    mock.store(on, PT)
    engine(on)
    await $.tool.call({ tool: 'TodoWrite', todos: TODOS })
    const ui = await mountBand($)
    expect(await ui.find({ text: 'Plano ▱▱▱▱▱▱▱▱▱▱ 0/2 · Agora: Escrevendo testes' })).toBeDefined()
    await $.tool.call({ tool: 'TodoWrite', todos: TODOS_DONE })
    expect(await ui.find({ text: 'Plano' })).toBeUndefined()
    expect(await ui.find({ text: 'engine' })).toBeDefined()
  })

  test('the person\'s next prompt clears what needed you', async ($, on) => {
    mock.store(on, PT_ALL)
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
    mock.store(on, PT)
    engine(on)
    await finish($, ANSWER, 'agent-1')
    await $.tool.call({ tool: 'TodoWrite', todos: TODOS, agentId: 'agent-1' } as Parameters<Engine['tool']['call']>[0])
    const ui = await mountBand($)
    expect(await ui.find({ text: 'engine' })).toBeDefined()
    expect(await (await mountBand($, { isWorking: true })).find({ text: 'engine' })).toBeDefined()
  })

  test('an answer with nothing for you clears the band', async ($, on) => {
    mock.store(on, PT)
    engine(on)
    await finish($, ANSWER)
    await finish($, 'Pronto.')
    expect(await (await mountBand($)).find({ text: 'engine' })).toBeDefined()
  })

  test('a survey holds the band', async ($, on) => {
    mock.store(on, PT)
    engine(on)
    await finish($, ANSWER)
    expect(await (await mountBand($, { hasSurvey: true })).find({ text: 'engine' })).toBeDefined()
  })

  test('the band fits its width and rows', async ($, on) => {
    mock.store(on, PT_ALL)
    engine(on)
    await finish($, Array.from({ length: 6 }, (_, n) => `{!uma pendência bem comprida de número ${n}!}`).join(' '))
    // Three rows, one of them the engine's line beneath: two for the notice.
    const ui = await mountBand($, { bodyColumns: 50, maxRows: 3 })
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

  for (const surface of ['terminal', 'desktop'] as const) {
    test(`the plan and what needs you keep what is drawn beneath them (${surface})`, async ($, on) => {
      mock.store(on, PT_ALL)
      engine(on)
      const mount = (props: Partial<RenderPropsOf['AbovePrompt']>) =>
        $.ui.mount({ plugin: 'realce', surface, component: 'AbovePrompt', props: { ...BAND, ...props } })
      await $.tool.call({ tool: 'TodoWrite', todos: TODOS })
      const plan = await mount({ isWorking: true })
      expect(await plan.find({ text: 'Plano ▱▱▱▱▱▱▱▱▱▱ 0/2 · Agora: Escrevendo testes' })).toBeDefined()
      expect(await plan.find({ text: 'engine' })).toBeDefined()
      await finish($, ANSWER)
      const pending = await mount({})
      expect(await pending.find({ text: 'Precisa de você' })).toBeDefined()
      expect(await pending.find({ text: 'engine' })).toBeDefined()
    })
  }

  test("the engine's own node beneath stays where the engine lets it: under no sized Box", async ($, on) => {
    mock.store(on, PT)
    // Core answers next(e) with its own node; a Box with a width, height or position over it is refused.
    on('ui.render', { component: 'AbovePrompt' }, () => ({ type: 'engine' as const, ref: 0 }))
    on('tool.call', () => ({ result: {} }))
    await $.tool.call({ tool: 'TodoWrite', todos: TODOS })
    const ui = await mountBand($, { isWorking: true })
    expect(await ui.find({ text: 'Plano ▱▱▱▱▱▱▱▱▱▱ 0/2 · Agora: Escrevendo testes' })).toBeDefined()
  })

  test('a limit keeps what is drawn beneath it', async ($, on) => {
    mock.store(on, PT)
    mock.clock(on, { now: Date.UTC(2026, 9, 19, 18, 41) })
    on('state.get', { plugin: 'realce', key: 'limit' }, () => ({ value: { value: { kind: 'rate', window: 'five_hour', percent: 86, resetsAt: null }, version: 1 } }))
    engine(on)
    const limit = await mountBand($)
    expect(await limit.find({ key: 'hide-limit' })).toBeDefined()
    expect(await limit.find({ text: 'engine' })).toBeDefined()
  })

  test('the away summary keeps what is drawn beneath it', async ($, on) => {
    mock.store(on, PT)
    on('state.get', { plugin: 'realce', key: 'away' }, () => ({ value: { value: { minutes: 12, turns: 2, files: 1, tests: null, seal: null, pending: 0 }, version: 1 } }))
    engine(on)
    const away = await mountBand($)
    expect(await away.find({ key: 'hide-away' })).toBeDefined()
    expect(await away.find({ text: 'engine' })).toBeDefined()
  })

  test('the notice leaves the rows the band beneath it takes', async ($, on) => {
    mock.store(on, PT_ALL)
    on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
      const { Text } = $.ui.resolve(e)
      return <Text>{'other mod 1\nother mod 2\nother mod 3'}</Text>
    })
    on('tool.call', () => ({ result: {} }))
    on('turn.complete', () => ({ text: '' }))
    await finish($, Array.from({ length: 6 }, (_, n) => `{!uma pendência bem comprida de número ${n}!}`).join(' '))
    const ui = await mountBand($, { bodyColumns: 50, maxRows: 5 })
    const texts = (await ui.findAll({ type: 'Text' })).map(el => el.text)
    expect(texts.find(t => t.startsWith('⚠ Precisa de você: '))?.split('\n')).toHaveLength(2)
    expect(texts).toContain('other mod 1\nother mod 2\nother mod 3')
    // With every row taken beneath, the notice keeps one and the band scrolls.
    const full = await mountBand($, { bodyColumns: 50, maxRows: 3 })
    const fullTexts = (await full.findAll({ type: 'Text' })).map(el => el.text)
    expect(fullTexts.find(t => t.startsWith('⚠ Precisa de você: '))?.split('\n')).toHaveLength(1)
    expect(fullTexts).toContain('other mod 1\nother mod 2\nother mod 3')
  })

  test('pendencias and plano off draw the engine', async ($, on) => {
    mock.store(on, { ...PT, flags: { pendencias: false, plano: false } })
    engine(on)
    await finish($, ANSWER)
    await $.tool.call({ tool: 'TodoWrite', todos: TODOS })
    expect(await (await mountBand($)).find({ text: 'engine' })).toBeDefined()
    expect(await (await mountBand($, { isWorking: true })).find({ text: 'engine' })).toBeDefined()
  })
})
