import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { AgentInfo, On } from 'claude-code'

import { togglePin } from '../hooks/orient/pins'
import { scrollRefusal } from '../hooks/orient/timeline'
import { ANSWER, engine, finish, mountPane, PANE, RUN, startStandIns, TODOS } from './world'
import { PT, PT_ALL } from './lang'

describe('session pane', () => {
  const AGENT: AgentInfo = { id: 'a1', description: 'Revisar desenho', type: 'Explore', status: 'running' }

  test('the session pane lists the plan, what needs you, files, failures and agents', async ($, on) => {
    mock.store(on, PT_ALL)
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
    mock.store(on, PT)
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
    mock.store(on, PT)
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
    mock.store(on, PT)
    on('state.get', { plugin: 'realce', key: 'files' }, () => ({
      value: { value: [{ path: '/x/uma/pasta/bem/funda/arquivo.ts', added: 12, removed: 3, edits: 1, at: 1 }], version: 1 },
    }))
    const ui = await $.ui.mount({ plugin: 'realce', surface: 'terminal', component: 'Pane', requestId: 'realce-sessao', props: { ...PANE, bodyColumns: 24 } })
    const texts = (await ui.findAll({ type: 'Text' })).map(el => el.text)
    expect(texts).toContain('…funda/arquivo.ts +12 −3')
    for (const t of texts) expect([...t].length).toBeLessThanOrEqual(24)
  })

  test('an empty session says so', async ($, on) => {
    mock.store(on, PT)
    expect(await (await mountPane($)).find({ text: 'Nada por aqui ainda.' })).toBeDefined()
  })

  test('painel opens at start by default', async ($, on) => {
    mock.store(on, PT)
    mock.clock(on)
    const { opened } = startStandIns(on)
    await $.session.start({ cwd: '/a/b', surface: 'terminal', isInteractive: true })
    expect(opened).toEqual(['realce-sessao'])
  })

  test('a -p run opens no pane', async ($, on) => {
    mock.store(on, PT)
    mock.clock(on)
    const { opened } = startStandIns(on)
    await $.session.start({ cwd: '/a/b', surface: null, isInteractive: false })
    expect(opened).toEqual([])
  })

  test('painel off leaves the pane closed at start', async ($, on) => {
    mock.store(on, { ...PT, flags: { painel: false } })
    mock.clock(on)
    const { opened } = startStandIns(on)
    await $.session.start({ cwd: '/a/b', surface: 'terminal', isInteractive: true })
    expect(opened).toEqual([])
  })

  test('an agent the engine killed reads as stopped, and in English its row says since', async ($, on) => {
    mock.store(on, { language: 'en' })
    const clock = mock.clock(on, { now: Date.UTC(2026, 9, 19, 18, 41) })
    engine(on)
    startStandIns(on, () => [{ ...AGENT, status: 'killed' }])
    await $.session.start({ cwd: '/a/b', surface: 'terminal', isInteractive: true })
    await clock.advance(2000)
    const ui = await mountPane($)
    expect(await ui.find({ text: '◆ Revisar desenho · Explore · Stopped · since 15:41' })).toBeDefined()
  })

  test('with the cards off and the pane closed, nobody reads the agents: the poll rests', async ($, on) => {
    mock.store(on, { ...PT, flags: { agentes: false, painel: false } })
    const clock = mock.clock(on)
    engine(on)
    let polls = 0
    startStandIns(on, () => {
      polls += 1
      return []
    })
    await $.session.start({ cwd: '/a/b', surface: 'terminal', isInteractive: true })
    await clock.advance(10_000)
    expect(polls).toBe(0)
  })
})

describe('pane links', () => {
  test("a failure's explanation shows under it in the pane, once it arrives", async ($, on) => {
    mock.store(on, PT_ALL)
    const clock = mock.clock(on)
    on('tool.call', { tool: 'Bash' }, () => ({ isError: true as const, result: 'Exit code 1\ncat: x: No such file', text: 'Exit code 1\ncat: x: No such file' }))
    engine(on)
    startStandIns(on)
    on('model.complete', () => ({ value: { isAnswered: true, text: 'O arquivo x não existe; confira o nome.', usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } } }) as never)
    // The sentence lives in the module: its arrival redraws the pane through the engine's own invalidate.
    on('ui.toast', () => ({ value: undefined }))
    await $.session.start({ cwd: '/a/b', surface: 'terminal', isInteractive: true })
    await $.tool.call({ tool: 'Bash', command: 'cat x', tool_use_id: 'c1' })
    const ui = await mountPane($)
    expect(await ui.find({ key: 'why-c1' })).toBeUndefined()
    await clock.settle()
    expect((await ui.find({ key: 'why-c1' }))?.text).toBe('↳ O arquivo x não existe; confira o nome.')
  })

  test('a touched file opens in the editor, a failure scrolls to its command', async ($, on) => {
    mock.store(on, PT)
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

describe('timeline', () => {
  async function promptRow($: Engine, text: string, uuid: string) {
    await $.prompt.submit({ text, origin: { kind: 'composer' }, wait: false })
    await $.session.append({ message: { type: 'user', role: 'user', content: [{ type: 'text', text }] }, door: 'prompt', origin: { kind: 'composer' }, uuid })
  }

  test('a prompt opens a row, its turn completes it', async ($, on) => {
    mock.store(on, PT)
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
    mock.store(on, PT)
    mock.clock(on)
    engine(on)
    await promptRow($, 'oi', 'u7')
    const row = await (await mountPane($)).find({ key: 'turn-u7' })
    expect(row?.type).toBe('Button')
  })

  test('a prompt typed over a running turn joins its row', async ($, on) => {
    mock.store(on, PT)
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

  test("a plugin's prompt is shown by its words, not the engine's frame", async ($, on) => {
    // Seen live: /realce demo's row read "The realce plugin sent a me…".
    mock.store(on, PT)
    mock.clock(on)
    engine(on)
    const framed = 'The realce plugin sent a message:\nDemonstração do realce\n\nThis is how Claude Code surfaces a prompt a plugin submits between turns.'
    await $.prompt.submit({ text: 'Demonstração do realce', origin: { kind: 'composer' }, wait: false })
    await $.session.append({ message: { type: 'user', role: 'user', content: [{ type: 'text', text: framed }] }, door: 'prompt', origin: { kind: 'composer' }, uuid: 'p1' })
    expect((await (await mountPane($)).find({ key: 'turn-p1' }))?.text).toBe('realce: Demonstração do realce')
  })

  test('a refused scroll says why', () => {
    expect(scrollRefusal('not person-initiated')).toBe('A linha do tempo rola só em tela cheia.')
    expect(scrollRefusal('none scrolls')).toBe('A linha do tempo rola só em tela cheia.')
    expect(scrollRefusal('the window moved meanwhile')).toBe('Não deu para rolar: the window moved meanwhile.')
  })

  test('a reminder or a tool result opens no row', async ($, on) => {
    mock.store(on, PT)
    mock.clock(on)
    engine(on)
    await $.session.append({ message: { type: 'user', role: 'user', isMeta: true, content: [{ type: 'text', text: 'lembrete' }] }, door: 'prompt', origin: { kind: 'composer' }, uuid: 'm1' })
    expect(await (await mountPane($)).find({ key: 'turn-m1' })).toBeUndefined()
  })

  test('linha off hides the section', async ($, on) => {
    mock.store(on, { ...PT, flags: { linha: false } })
    mock.clock(on)
    engine(on)
    await promptRow($, 'oi', 'u1')
    expect(await (await mountPane($)).find({ key: 'turn-u1' })).toBeUndefined()
  })
})

describe('pins', () => {
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
    mock.store(on, PT)
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
    mock.store(on, PT)
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
    mock.store(on, { ...PT, flags: { fixar: false } })
    expect((await $.command.run({ ...RUN, args: 'fixar' })).text).toBe('Recurso desligado: Fixar respostas. /realce fixar on liga.')
  })
})

describe('explain this', () => {
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
    mock.store(on, PT)
    mock.clock(on)
    explainWorld(on, undefined)
    expect((await $.command.run({ ...RUN, args: 'explica' })).text).toBe('Selecione um trecho da conversa (em tela cheia) ou escreva o que explicar: /realce explica <texto>.')
  })

  test('the text after the command is explained when given', async ($, on) => {
    mock.store(on, PT)
    const clock = mock.clock(on)
    const asked = explainWorld(on, undefined)
    expect((await $.command.run({ ...RUN, args: 'explica O que é um Hook?' })).text).toBe('Explicando no painel.')
    await clock.settle()
    expect(String(asked[0]!.prompt)).toBe('O que é um Hook?')
  })

  test('a selection is explained in the pane', async ($, on) => {
    mock.store(on, PT)
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
    mock.store(on, PT)
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
    mock.store(on, PT)
    const clock = mock.clock(on)
    explainWorld(on, { text: 'abc' })
    await $.command.run({ ...RUN, args: 'explica' })
    await clock.settle()
    const ui = await mountPane($)
    await ui.press({ key: 'close-explain' })
    expect(await ui.find({ text: 'Explicação' })).toBeUndefined()
  })

  test('a long selection is cut to 4000 characters', async ($, on) => {
    mock.store(on, PT)
    const clock = mock.clock(on)
    const asked = explainWorld(on, { text: 'x'.repeat(9000) })
    await $.command.run({ ...RUN, args: 'explica' })
    await clock.settle()
    expect(String(asked[0]!.prompt).length).toBe(4000)
  })

  test('a model failure shows why', async ($, on) => {
    mock.store(on, PT)
    const clock = mock.clock(on)
    explainWorld(on, { text: 'abc' }, { isAnswered: false, reason: 'empty-reply', usage: USAGE })
    await $.command.run({ ...RUN, args: 'explica' })
    await clock.settle()
    expect(await (await mountPane($)).find({ text: 'Sem explicação: empty-reply' })).toBeDefined()
  })

  test('explica off says how to turn it on', async ($, on) => {
    mock.store(on, { ...PT, flags: { explica: false } })
    mock.clock(on)
    explainWorld(on, { text: 'abc' })
    expect((await $.command.run({ ...RUN, args: 'explica' })).text).toBe('Recurso desligado: Explica isso. /realce explica on liga.')
  })
})
