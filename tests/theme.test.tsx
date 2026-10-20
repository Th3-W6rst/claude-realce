import { describe, expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'

import { flagsVersion } from '../hooks/flags'
import { PROSE, SCREEN } from '../hooks/palette'
import { applyTheme, classifyTheme } from '../hooks/theme'
import { diagramHash, hashSource } from '../hooks/code/diagram'

const ENGINE = { plugin: 'engine', tier: 'core' as const }
const themeRow = (value: string) => ({ key: 'theme', label: 'Theme', kind: 'choice' as const, value, options: ['dark', 'light'], provider: ENGINE, isLocked: false })

/** The machine beneath the plugin: a theme in /config, a home, the files and commands each test names. */
function world(on: On, theme: string, files: Record<string, string> = {}, appearance: string | null = 'Dark') {
  const logs: string[] = []
  mock.env(on, { HOME: '/Users/u' })
  on('config.list', () => ({ value: [themeRow(theme)] }))
  on('fs.read', ($, e) => (e.path in files ? { value: files[e.path]! } : { deny: `ENOENT: ${e.path}` }))
  on('fs.exists', () => ({ value: false }))
  on('process.run', ($, e) => {
    const done = { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false }
    if (e.argv[0] === 'date') return { value: { ...done, stdout: '-0300\n' } }
    if (e.argv[0] === 'defaults') return { value: appearance === null ? { ...done, exitCode: 1, stderr: 'does not exist' } : { ...done, stdout: `${appearance}\n` } }
    return { value: { ...done, exitCode: 1 } }
  })
  on('session.messages', () => ({ value: [] }))
  on('ui.invalidate', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('session.start', () => ({ cwd: '/a/b' }))
  on('ui.log', ($, e) => {
    logs.push(e.text)
    return { value: undefined }
  })
  return { logs }
}

const goodColor = async (ui: Awaited<ReturnType<typeof mountGood>>) => (await ui.findAll({ type: 'Text', text: 'ok' })).find(el => el.text === 'ok')?.props.color

function mountGood($: Engine) {
  return $.ui.mount({ plugin: 'realce', surface: 'terminal', component: 'AssistantMessage', props: { text: 'Tudo {+ok+} aqui.', isFirstOfReply: true } })
}

describe('theme', () => {
  test('a base names its class', () => {
    expect(classifyTheme('dark')).toBe('dark')
    expect(classifyTheme('light')).toBe('light')
    expect(classifyTheme('dark-daltonized')).toBe('dark-cb')
    expect(classifyTheme('light-daltonized')).toBe('light-cb')
    expect(classifyTheme('dark-ansi')).toBe('dark-ansi')
    expect(classifyTheme('light-ansi')).toBe('light-ansi')
  })

  test('applying a theme repaints the palette and the drawings', () => {
    const before = flagsVersion()
    applyTheme('light')
    expect(PROSE.good.color).toBe('#0A7D32')
    expect(SCREEN.bad).toBe('#B3121B')
    expect(flagsVersion()).not.toBe(before)
    applyTheme('dark-cb')
    expect(PROSE.good.color).toBe('#56B4E9')
    expect(SCREEN.bad).toBe('#E69F00')
    applyTheme('light-ansi')
    // ANSI themes paint with the theme's own keys: the engine maps those onto the terminal's sixteen colors.
    expect(PROSE.good.color).toBe('success')
    expect(SCREEN.dim).toBe('inactive')
    expect(PROSE.bad.backgroundColor).toBeUndefined()
    applyTheme('dark')
    expect(PROSE.good.color).toBe('#00FF41')
    expect(SCREEN.bad).toBe('#FF5C63')
  })

  test('a light theme draws a reply in light colors', async ($, on) => {
    mock.store(on)
    mock.clock(on)
    world(on, 'light')
    await $.session.start({ cwd: '/a/b', surface: 'terminal', isInteractive: true })
    expect(await goodColor(await mountGood($))).toBe('#0A7D32')
  })

  test('a custom theme follows its base', async ($, on) => {
    mock.store(on)
    mock.clock(on)
    world(on, 'custom:zero-bone-ansi', { '/Users/u/.claude/themes/zero-bone-ansi.json': '{"name":"Zero Bone","base":"light-ansi"}' })
    await $.session.start({ cwd: '/a/b', surface: 'terminal', isInteractive: true })
    expect(await goodColor(await mountGood($))).toBe('success')
  })

  test('auto follows macOS', async ($, on) => {
    mock.store(on)
    mock.clock(on)
    world(on, 'auto', {}, null)
    await $.session.start({ cwd: '/a/b', surface: 'terminal', isInteractive: true })
    expect(await goodColor(await mountGood($))).toBe('#0A7D32')
  })

  test('a custom theme that cannot be read is said, and stays dark', async ($, on) => {
    mock.store(on)
    mock.clock(on)
    const { logs } = world(on, 'custom:sumiu')
    await $.session.start({ cwd: '/a/b', surface: 'terminal', isInteractive: true })
    expect(logs.some(l => /^realce: tema custom:sumiu não lido \(.+\); usando o escuro$/.test(l))).toBe(true)
    expect(await goodColor(await mountGood($))).toBe('#00FF41')
  })

  test('tema off keeps the neon', async ($, on) => {
    mock.store(on, { flags: { tema: false } })
    mock.clock(on)
    world(on, 'light')
    await $.session.start({ cwd: '/a/b', surface: 'terminal', isInteractive: true })
    expect(await goodColor(await mountGood($))).toBe('#00FF41')
  })

  test('turning tema off and on repaints at once', async ($, on) => {
    mock.store(on)
    mock.clock(on)
    world(on, 'light')
    const RUN = { command: 'realce', origin: { kind: 'composer' as const }, presentation: { isFullscreen: true, columns: 120 } }
    await $.session.start({ cwd: '/a/b', surface: 'terminal', isInteractive: true })
    await $.command.run({ ...RUN, args: 'tema off' })
    expect(await goodColor(await mountGood($))).toBe('#00FF41')
    await $.command.run({ ...RUN, args: 'tema on' })
    expect(await goodColor(await mountGood($))).toBe('#0A7D32')
  })

  test('/realce status names the palette in force', async ($, on) => {
    mock.store(on)
    mock.clock(on)
    world(on, 'light')
    on('prompt.compose', () => ({ sections: [] }))
    const RUN = { command: 'realce', origin: { kind: 'composer' as const }, presentation: { isFullscreen: true, columns: 120 } }
    await $.session.start({ cwd: '/a/b', surface: 'terminal', isInteractive: true })
    expect((await $.command.run({ ...RUN, args: 'status' })).text).toMatch(/Cores: tema claro\./)
  })

  test('a light theme names its own diagram', () => {
    applyTheme('light')
    expect(diagramHash('graph TD\n  A-->B')).toBe(`${hashSource('graph TD\n  A-->B')}-light`)
    applyTheme('dark')
    expect(diagramHash('graph TD\n  A-->B')).toBe(hashSource('graph TD\n  A-->B'))
  })

  test('a theme picked in /config repaints', async ($, on) => {
    mock.store(on)
    mock.clock(on)
    world(on, 'dark')
    on('config.set', ($, e) => ({ value: e.value }))
    await $.session.start({ cwd: '/a/b', surface: 'terminal', isInteractive: true })
    expect(await goodColor(await mountGood($))).toBe('#00FF41')
    await $.config.set({ key: 'theme', value: 'light', previous: 'dark', provider: ENGINE, origin: { kind: 'composer' } })
    expect(await goodColor(await mountGood($))).toBe('#0A7D32')
  })
})
