import { describe, expect, mock, test } from 'claude-code/testing'
import type { On, PromptComposeInput, RenderPropsOf } from 'claude-code'

import { featureOff, FLAGS, type Flags } from '../hooks/flags'
import { buildSection } from '../hooks/prompt'
import { RUN } from './world'
import { PT } from './lang'

const COMPOSE: PromptComposeInput = { model: 'm', promptModel: 'm', surfaces: ['terminal'], tools: [], outputStyle: null, traits: [] }
const PANE: RenderPropsOf['Pane'] = {
  title: 'Realce',
  isFocused: true,
  bodyColumns: 80,
  placement: 'dock',
  scroll: { offset: 0, bodyRows: 40 },
  view: {},
}

const allFlags = (value: boolean) => Object.fromEntries(FLAGS.map(f => [f.id, value])) as Record<keyof Flags, boolean>

// Stands for the engine's own system prompt beneath the plugins.
const baseSections = (on: On) => on('prompt.compose', () => ({ sections: [{ id: 'intro', text: 'base', scope: 'shared' as const }] }))

describe('commands', () => {
  test('every flag starts on except erros, foco, pendencias and som', async ($, on) => {
    mock.store(on, PT)
    mock.clock(on)
    baseSections(on)
    expect((await $.command.run({ ...RUN, args: 'status' })).text).toMatch(/Recursos desligados: Erro explicado, Modo foco, Precisa de você, Som nos avisos\./)
  })

  test('/realce coluna off turns one flag off', async ($, on) => {
    mock.store(on, PT)
    mock.clock(on)
    baseSections(on)
    expect((await $.command.run({ ...RUN, args: 'coluna off' })).text).toBe('Desligado: Coluna de leitura.')
    expect((await $.command.run({ ...RUN, args: 'status' })).text).toMatch(/Recursos desligados: Coluna de leitura, Erro explicado, Modo foco, Precisa de você, Som nos avisos\./)
  })

  test("a flag another session changed since this one loaded survives this one's change", async ($, on) => {
    // The store every session shares: another session writes to it behind this one's back.
    const store = new Map<string, unknown>([['language', 'pt']])
    on('store.get', ($, e) => ({ value: store.get(e.key) }))
    on('store.set', ($, e) => {
      store.set(e.key, e.value)
      return { value: undefined }
    })
    mock.clock(on)
    baseSections(on)
    await $.command.run({ ...RUN, args: 'status' })
    store.set('flags', { ...(store.get('flags') as object), foco: true })
    await $.command.run({ ...RUN, args: 'coluna off' })
    expect(store.get('flags')).toMatchObject({ foco: true, coluna: false })
  })

  test('/realce off and on keep each flag as it was', async ($, on) => {
    mock.store(on, PT)
    mock.clock(on)
    baseSections(on)
    await $.command.run({ ...RUN, args: 'coluna off' })
    expect((await $.command.run({ ...RUN, args: 'off' })).text).toBe('Realce desligado.')
    expect((await $.prompt.compose(COMPOSE)).sections.map(s => s.id)).toEqual(['intro'])
    expect((await $.command.run({ ...RUN, args: 'on' })).text).toBe('Realce ligado.')
    const status = (await $.command.run({ ...RUN, args: 'status' })).text ?? ''
    expect(status).toMatch(/^Realce ligado\./)
    expect(status).toMatch(/Coluna de leitura/)
  })

  test('/realce status says whether the screen is fullscreen', async ($, on) => {
    mock.store(on, PT)
    mock.clock(on)
    baseSections(on)
    expect((await $.command.run({ ...RUN, args: 'status' })).text).toMatch(/Tela cheia: sim\./)
    const inline = (await $.command.run({ ...RUN, args: 'status', presentation: { isFullscreen: false, columns: 120 } })).text ?? ''
    expect(inline).toMatch(/Tela cheia: não\. Rolar pela linha do tempo e pelas fixadas, e selecionar para o \/realce explica, pedem "tui": "fullscreen" no settings\.json\./)
  })

  test('/realce ajuda lists every command', async ($, on) => {
    mock.store(on, PT)
    const text = (await $.command.run({ ...RUN, args: 'ajuda' })).text ?? ''
    for (const word of ['/realce on', '/realce painel', '/realce foco', '/realce explica', '/realce fixar', '/realce print', '/realce demo', '/realce status']) expect(text).toContain(word)
    expect(text.split('\n')[0]).toBe('Comandos do realce:')
  })

  test('the help does not promise a key to every flag', async ($, on) => {
    mock.store(on, PT)
    expect((await $.command.run({ ...RUN, args: 'ajuda' })).text).not.toMatch(/uma tecla por recurso/)
  })

  test('the new flag takes no earlier flag\'s key', async ($, on) => {
    mock.store(on, PT)
    on('prompt.compose', () => ({ sections: [] }))
    const ui = await $.ui.mount({ plugin: 'realce', surface: 'terminal', component: 'Pane', requestId: 'realce-flags', props: PANE })
    expect((await ui.find({ key: 'flag-atualizacao' }))?.props.hotkey).toBe('9')
    expect((await ui.find({ key: 'flag-limite' }))?.props.hotkey).toBeUndefined()
  })

  test('/realce copiar copies the last reply', async ($, on) => {
    mock.store(on, PT)
    const copied: string[] = []
    on('ui.copy', ($, e) => {
      copied.push(e.text)
      return { value: { isCopied: true as const } }
    })
    on('session.messages', () => ({ value: [{ role: 'assistant' as const, text: 'primeira', toolUses: [] }, { role: 'user' as const, text: 'oi', toolUses: [] }, { role: 'assistant' as const, text: 'Feito {+ok+}', toolUses: [] }] }))
    expect((await $.command.run({ ...RUN, args: 'copiar' })).text).toBe('Última resposta copiada.')
    expect(copied).toEqual(['Feito **ok**'])
  })

  test('/realce with anything else answers the usage', async ($, on) => {
    mock.store(on, PT)
    const text = (await $.command.run({ ...RUN, args: 'xyz' })).text ?? ''
    expect(text).toMatch(/^Uso: \/realce \[ajuda\|diagnostico\|on\|off\|status\|painel\|copiar\|resumo\|foco\|explica\|fixar\|print\|demo\|idioma\|<recurso> on\|off\]/)
    expect(text).toMatch(/coluna/)
  })

  test('/realce with no argument opens the flags pane', async ($, on) => {
    mock.store(on, PT)
    let opened = ''
    on('ui.open', ($, e) => {
      opened = e.id
      return { value: { isPlaced: true as const } }
    })
    expect(await $.command.run({ ...RUN, args: '' })).toEqual({})
    expect(opened).toBe('realce-flags')
  })

  test('/realce painel opens the session pane, then closes it', async ($, on) => {
    mock.store(on, PT)
    const calls: string[] = []
    on('ui.open', ($, e) => {
      calls.push(`open ${e.id}`)
      return { value: { isPlaced: true as const } }
    })
    on('ui.close', ($, e) => {
      calls.push(`close ${e.id}`)
      return { value: undefined }
    })
    expect((await $.command.run({ ...RUN, args: 'painel' })).text).toBe('Painel da sessão aberto.')
    expect((await $.command.run({ ...RUN, args: 'painel' })).text).toBe('Painel da sessão fechado.')
    expect((await $.command.run({ ...RUN, args: 'painel' })).text).toBe('Painel da sessão aberto.')
    expect(calls).toEqual(['open realce-sessao', 'close realce-sessao', 'open realce-sessao'])
  })
})

describe('flags pane', () => {
  test('a press toggles its flag', async ($, on) => {
    mock.store(on, PT)
    mock.clock(on)
    on('prompt.compose', () => ({ sections: [] }))
    const ui = await $.ui.mount({ plugin: 'realce', surface: 'terminal', component: 'Pane', requestId: 'realce-flags', props: PANE })
    const label = async (key: string) => (await ui.find({ key }))?.text
    expect(await label('flag-coluna')).toBe('[x] Coluna de leitura · Prosa limitada a 100 colunas')
    expect(await label('flag-painel')).toBe('[x] Painel ao iniciar · Abre o painel lateral da sessão sozinho')
    await ui.press({ key: 'flag-coluna' })
    expect((await $.command.run({ ...RUN, args: 'status' })).text).toMatch(/Recursos desligados: Coluna de leitura/)
    expect(await label('flag-coluna')).toBe('[ ] Coluna de leitura · Prosa limitada a 100 colunas')
  })

  test('the pane lists 38 flags under 5 groups, 36 of them on a key', async ($, on) => {
    mock.store(on, PT)
    on('prompt.compose', () => ({ sections: [] }))
    const ui = await $.ui.mount({ plugin: 'realce', surface: 'terminal', component: 'Pane', requestId: 'realce-flags', props: PANE })
    for (const group of ['Texto', 'Código', 'Ferramentas', 'Orientação', 'Sistema']) expect(await ui.find({ type: 'Text', text: group })).toBeDefined()
    expect(await ui.find({ key: 'flag-atualizacao' })).toBeDefined()
    const buttons = (await ui.findAll({ type: 'Button' })).filter(b => b.key?.startsWith('flag-'))
    expect(buttons).toHaveLength(38)
    // The engine takes 36 keys (a–z, 0–9): the 37th flag is reached with Tab and Enter.
    expect(new Set(buttons.map(b => b.props.hotkey).filter(k => k !== undefined)).size).toBe(36)
    expect(await ui.find({ type: 'Text', text: 'Letra ou número alterna · Tab e Enter também · Esc fecha' })).toBeDefined()
  })

  test('a narrow pane keeps each flag on one line, in the theme colors', async ($, on) => {
    mock.store(on, PT)
    on('prompt.compose', () => ({ sections: [] }))
    const ui = await $.ui.mount({ plugin: 'realce', surface: 'terminal', component: 'Pane', requestId: 'realce-flags', props: { ...PANE, bodyColumns: 40 } })
    for (const b of await ui.findAll({ type: 'Button' })) expect([...b.text].length).toBeLessThanOrEqual(37)
    expect((await ui.find({ key: 'flag-coluna' }))?.text).toBe('[x] Coluna de leitura · Prosa limita…')
    expect((await ui.find({ type: 'Text', text: 'Texto' }))?.props.color).toBe('#24D3E0')
  })

  test('pressing a new flag toggles it', async ($, on) => {
    mock.store(on, PT)
    mock.clock(on)
    on('prompt.compose', () => ({ sections: [] }))
    const ui = await $.ui.mount({ plugin: 'realce', surface: 'terminal', component: 'Pane', requestId: 'realce-flags', props: PANE })
    await ui.press({ key: 'flag-selo' })
    expect((await $.command.run({ ...RUN, args: 'status' })).text).toMatch(/Recursos desligados: Selo de prova, Erro explicado, Modo foco/)
  })

  test('the pane switches the whole mod on and off', async ($, on) => {
    mock.store(on, PT)
    mock.clock(on)
    on('prompt.compose', () => ({ sections: [] }))
    const ui = await $.ui.mount({ plugin: 'realce', surface: 'terminal', component: 'Pane', requestId: 'realce-flags', props: PANE })
    expect((await ui.find({ key: 'master' }))?.text).toBe('[x] Realce ligado')
    await ui.press({ key: 'master' })
    expect((await $.command.run({ ...RUN, args: 'status' })).text).toMatch(/^Realce desligado\./)
    expect((await ui.find({ key: 'master' }))?.text).toBe('[ ] Realce ligado')
  })

  test('with the master off the pane says so', async ($, on) => {
    mock.store(on, { ...PT, master: false })
    const ui = await $.ui.mount({ plugin: 'realce', surface: 'terminal', component: 'Pane', requestId: 'realce-flags', props: PANE })
    expect(await ui.find({ type: 'Text', text: 'Realce desligado: /realce on liga.' })).toBeDefined()
  })
})

describe('feature commands', () => {
  test('a feature that is off says how to turn it on', () => {
    expect(featureOff('explica')).toBe('Recurso desligado: Explica isso. /realce explica on liga.')
  })
})

describe('prompt section', () => {
  test('all flags on teach every aid', () => {
    const text = buildSection(allFlags(true), true)?.text ?? ''
    for (const aid of ['{!', '[!DECISÃO]', 'de X para Y', 'markdown table', '```mermaid']) expect(text).toContain(aid)
  })

  test('each mark is taught around real words, never as a bare tag', () => {
    // A placeholder like {!attention!} was copied as a tag in front of a sentence ("{!attention!}25 segundos…").
    const text = buildSection(allFlags(true), true)?.text ?? ''
    for (const tag of ['{+good+}', '{-bad-}', '{!attention!}', '==fact==']) expect(text).not.toContain(tag)
    for (const example of ['{+all 342 tests pass+}', '{-the build fails-}', '{!waiting for your GO!}']) expect(text).toContain(example)
    expect(text).toContain('never a tag in front of a sentence')
  })

  test('an arrow is taught for changes with a unit only', () => {
    const text = buildSection(allFlags(true), true)?.text ?? ''
    expect(text).toContain('`X ms → Y ms`')
    expect(text).toContain('arrow between bare numbers stays a mapping')
  })

  test('selo tells the model the turn is sealed by its tests', () => {
    expect(buildSection(allFlags(true), true)?.text).toContain('seals each turn')
    expect(buildSection({ ...allFlags(true), selo: false }, true)?.text).not.toContain('seals each turn')
  })

  test('no mermaid without mmdc or with diagramas off', () => {
    expect(buildSection(allFlags(true), false)?.text).not.toContain('mermaid')
    expect(buildSection({ ...allFlags(true), diagramas: false }, true)?.text).not.toContain('mermaid')
  })

  test('enfase off drops the typed marks only', () => {
    const text = buildSection({ ...allFlags(true), enfase: false }, true)?.text ?? ''
    expect(text).not.toContain('{+')
    expect(text).toContain('[!DECISÃO]')
  })

  test('every aid off gives no section', () => {
    expect(buildSection(allFlags(false), true)).toBeNull()
  })

  test('compose adds the section on the terminal, never bare or headless', async ($, on) => {
    mock.store(on, PT)
    mock.clock(on)
    baseSections(on)
    expect((await $.prompt.compose(COMPOSE)).sections.map(s => s.id)).toEqual(['intro', 'realce:reading-aids'])
    expect((await $.prompt.compose({ ...COMPOSE, traits: ['bare'] })).sections.map(s => s.id)).toEqual(['intro'])
    expect((await $.prompt.compose({ ...COMPOSE, surfaces: [], traits: ['print'] })).sections.map(s => s.id)).toEqual(['intro'])
  })

  test('a compose ahead of session.start still teaches diagrams where mmdc is', async ($, on) => {
    mock.store(on, PT)
    mock.clock(on)
    baseSections(on)
    on('process.run', ($, e) => ({
      value: { exitCode: 0, stdout: e.argv[0] === 'which' ? '/opt/homebrew/bin/mmdc\n' : '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
    }))
    const section = (await $.prompt.compose(COMPOSE)).sections.find(s => s.id === 'realce:reading-aids')
    expect(section?.text).toContain('```mermaid')
  })

  test('/realce status says whether the last request taught the aids', async ($, on) => {
    mock.store(on, PT)
    mock.clock(on)
    baseSections(on)
    expect((await $.command.run({ ...RUN, args: 'status' })).text).toMatch(/Nenhum request/)
    await $.prompt.compose(COMPOSE)
    const text = (await $.command.run({ ...RUN, args: 'status' })).text ?? ''
    expect(text).toMatch(/leva a seção de leitura/)
    expect(text).toMatch(/seção incluída; superfícies \[terminal\]/)
  })
})

describe('session env', () => {
  test('session.start records directory, home, editor, offset and mmdc', async ($, on) => {
    mock.store(on, PT)
    mock.clock(on)
    mock.env(on, { HOME: '/Users/u' })
    baseSections(on)
    on('fs.exists', ($, e) => ({ value: e.path === '/Applications/Cursor.app' }))
    on('process.run', ($, e) => ({
      value: {
        exitCode: 0,
        stdout: e.argv[0] === 'date' ? '-0300\n' : '/opt/homebrew/bin/mmdc\n',
        stderr: '',
        isStdoutTruncated: false,
        isStderrTruncated: false,
      },
    }))
    on('config.list', () => ({ value: [] }))
  on('session.start', () => ({ cwd: '/a/b' }))
    await $.session.start({ cwd: '/a/b', surface: 'terminal', isInteractive: true })
    const text = (await $.command.run({ ...RUN, args: 'status' })).text ?? ''
    expect(text).toMatch(/Editor dos links: cursor\. Diagramas: mmdc em \/opt\/homebrew\/bin\/mmdc\./)
  })
})
