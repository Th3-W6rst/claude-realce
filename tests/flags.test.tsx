import { describe, expect, mock, test } from 'claude-code/testing'
import type { On, PromptComposeInput, RenderPropsOf } from 'claude-code'

import { FLAGS, type Flags } from '../hooks/flags'
import { formatClock, formatDuration, parseTzOffset, plural } from '../hooks/format'
import { buildSection } from '../hooks/prompt'

const RUN = { command: 'realce', origin: { kind: 'composer' as const }, presentation: { isFullscreen: true, columns: 120 } }
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
  test('every flag starts on', async ($, on) => {
    mock.store(on)
    mock.clock(on)
    baseSections(on)
    expect((await $.command.run({ ...RUN, args: 'status' })).text).toMatch(/Recursos desligados: nenhum\./)
  })

  test('/realce coluna off turns one flag off', async ($, on) => {
    mock.store(on)
    mock.clock(on)
    baseSections(on)
    expect((await $.command.run({ ...RUN, args: 'coluna off' })).text).toBe('Desligado: Coluna de leitura.')
    expect((await $.command.run({ ...RUN, args: 'status' })).text).toMatch(/Recursos desligados: Coluna de leitura\./)
  })

  test('/realce off and on keep each flag as it was', async ($, on) => {
    mock.store(on)
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

  test('/realce with anything else answers the usage', async ($, on) => {
    mock.store(on)
    const text = (await $.command.run({ ...RUN, args: 'xyz' })).text ?? ''
    expect(text).toMatch(/^Uso: \/realce \[on\|off\|status\|painel\|<recurso> on\|off\]/)
    expect(text).toMatch(/coluna/)
  })

  test('/realce with no argument opens the flags pane', async ($, on) => {
    mock.store(on)
    let opened = ''
    on('ui.open', ($, e) => {
      opened = e.id
      return { value: { isPlaced: true as const } }
    })
    expect(await $.command.run({ ...RUN, args: '' })).toEqual({})
    expect(opened).toBe('realce-flags')
  })

  test('/realce painel opens the session pane, then closes it', async ($, on) => {
    mock.store(on)
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
    mock.store(on)
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

  test('with the master off the pane says so', async ($, on) => {
    mock.store(on, { master: false })
    const ui = await $.ui.mount({ plugin: 'realce', surface: 'terminal', component: 'Pane', requestId: 'realce-flags', props: PANE })
    expect(await ui.find({ type: 'Text', text: 'Realce desligado: /realce on liga.' })).toBeDefined()
  })
})

describe('prompt section', () => {
  test('all flags on teach every aid', () => {
    const text = buildSection(allFlags(true), true)?.text ?? ''
    for (const aid of ['{!attention!}', '[!DECISÃO]', 'de X para Y', 'markdown table', '```mermaid']) expect(text).toContain(aid)
  })

  test('no mermaid without mmdc or with diagramas off', () => {
    expect(buildSection(allFlags(true), false)?.text).not.toContain('mermaid')
    expect(buildSection({ ...allFlags(true), diagramas: false }, true)?.text).not.toContain('mermaid')
  })

  test('enfase off drops the typed marks only', () => {
    const text = buildSection({ ...allFlags(true), enfase: false }, true)?.text ?? ''
    expect(text).not.toContain('{+good+}')
    expect(text).toContain('[!DECISÃO]')
  })

  test('every aid off gives no section', () => {
    expect(buildSection(allFlags(false), true)).toBeNull()
  })

  test('compose adds the section on the terminal, never bare or headless', async ($, on) => {
    mock.store(on)
    mock.clock(on)
    baseSections(on)
    expect((await $.prompt.compose(COMPOSE)).sections.map(s => s.id)).toEqual(['intro', 'realce:reading-aids'])
    expect((await $.prompt.compose({ ...COMPOSE, traits: ['bare'] })).sections.map(s => s.id)).toEqual(['intro'])
    expect((await $.prompt.compose({ ...COMPOSE, surfaces: [], traits: ['print'] })).sections.map(s => s.id)).toEqual(['intro'])
  })

  test('a compose ahead of session.start still teaches diagrams where mmdc is', async ($, on) => {
    mock.store(on)
    mock.clock(on)
    baseSections(on)
    on('process.run', ($, e) => ({
      value: { exitCode: 0, stdout: e.argv[0] === 'which' ? '/opt/homebrew/bin/mmdc\n' : '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
    }))
    const section = (await $.prompt.compose(COMPOSE)).sections.find(s => s.id === 'realce:reading-aids')
    expect(section?.text).toContain('```mermaid')
  })

  test('/realce status says whether the last request taught the aids', async ($, on) => {
    mock.store(on)
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
    mock.store(on)
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
    on('session.start', () => ({ cwd: '/a/b' }))
    await $.session.start({ cwd: '/a/b', surface: 'terminal', isInteractive: true })
    const text = (await $.command.run({ ...RUN, args: 'status' })).text ?? ''
    expect(text).toMatch(/Editor dos links: cursor\. Diagramas: mmdc em \/opt\/homebrew\/bin\/mmdc\./)
  })
})

describe('format', () => {
  test('durations as the engine spells them', () => {
    expect(formatDuration(12_000)).toBe('12s')
    expect(formatDuration(385_600)).toBe('6m 25s')
    expect(formatDuration(3_720_000)).toBe('1h 2m')
  })

  test('clocks at the session offset', () => {
    expect(formatClock(Date.UTC(2026, 9, 19, 18, 41), -180)).toBe('15:41')
    expect(parseTzOffset('-0300\n')).toBe(-180)
    expect(parseTzOffset('+0530')).toBe(330)
  })

  test('plurals', () => {
    expect(plural(1, 'arquivo', 'arquivos')).toBe('1 arquivo')
    expect(plural(3, 'arquivo', 'arquivos')).toBe('3 arquivos')
  })
})
