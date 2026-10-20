import { describe, expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'

import { PALETTES } from '../hooks/palettes'
import { DEMO_TEXT } from '../hooks/system/demo'
import { compareVersions } from '../hooks/system/update'
import { estimateHeight, replyHtml } from '../hooks/system/printHtml'

const RUN = { command: 'realce', origin: { kind: 'composer' as const }, presentation: { isFullscreen: true, columns: 120 } }
const CHROME = '/Users/u/.cache/puppeteer/chrome-headless-shell/mac_arm-154/chrome-headless-shell-mac-arm64/chrome-headless-shell'

describe('print html', () => {
  test('a reply becomes a page in the palette, escaped', () => {
    const html = replyHtml('Tudo {+ok+} aqui <script>x</script>', PALETTES.dark, () => null)
    expect(html).toContain('&lt;script&gt;')
    expect(html).not.toContain('<script>')
    expect(html).toMatch(/<span style="[^"]*color: #00FF41[^"]*">ok<\/span>/)
    expect(html).toContain('background: #111111')
    expect(replyHtml('{+ok+}', PALETTES.light, () => null)).toMatch(/color: #0A7D32/)
  })

  test('the print reads as the screen does: human numbers included', () => {
    expect(replyHtml('levou 102761 ms', PALETTES.dark, () => null, { numeros: true })).toContain('(1m 42s)')
    expect(replyHtml('levou 102761 ms', PALETTES.dark, () => null, { numeros: false })).not.toContain('(1m 42s)')
  })

  test('a ready diagram is its picture', () => {
    const html = replyHtml('```mermaid\ngraph TD\n  A-->B\n```', PALETTES.dark, () => ({ file: '/Users/u/.cache/realce/diagrams/x.png', width: 720, height: 724 }))
    expect(html).toContain('<img src="file:///Users/u/.cache/realce/diagrams/x.png"')
  })

  test('a pictured diagram counts as its picture, not as its source lines', () => {
    const pic = { width: 1440, height: 1440 }
    const source = '```mermaid\n' + Array.from({ length: 12 }, (_, i) => `  A${i} --> B${i}`).join('\n') + '\n```'
    expect(estimateHeight(`texto\n${source}`, [pic])).toBeLessThanOrEqual(estimateHeight('texto', [pic]) + 3 * 22)
  })

  test('the height grows with the reply and its pictures', () => {
    expect(estimateHeight('uma linha', [])).toBeGreaterThanOrEqual(200)
    expect(estimateHeight(Array.from({ length: 80 }, () => 'linha').join('\n'), [])).toBeGreaterThan(estimateHeight('linha', []))
    expect(estimateHeight('x', [{ width: 1440, height: 1440 }])).toBeGreaterThan(estimateHeight('x', []) + 600)
  })
})

describe('/realce print', () => {
  function printWorld(on: On, opts: { chrome?: boolean; desktop?: boolean; reply?: string | null; chromeExit?: number } = {}) {
    const { chrome = true, desktop = true, reply = 'Tudo {+ok+}.', chromeExit = 0 } = opts
    const writes: Record<string, string> = {}
    const runs: string[][] = []
    mock.env(on, { HOME: '/Users/u' })
    on('session.messages', () => ({ value: reply === null ? [] : [{ role: 'assistant' as const, text: reply, toolUses: [] }] }))
    on('fs.exists', ($, e) => ({ value: e.path === '/Users/u/Desktop' ? desktop : chrome && e.path === CHROME }))
    on('fs.write', ($, e) => {
      writes[e.path] = e.text
      return { value: undefined }
    })
    on('process.run', ($, e) => {
      const done = { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false }
      if (e.argv[0] === 'date') return { value: { ...done, stdout: '-0300\n' } }
      if (e.argv[0] === 'find') return { value: { ...done, stdout: chrome ? `${CHROME}\n` : '' } }
      runs.push([...e.argv])
      return { value: { ...done, exitCode: chromeExit, stderr: chromeExit === 0 ? '' : 'crashed\n' } }
    })
    return { writes, runs }
  }

  test('without Chrome the HTML is kept and said', async ($, on) => {
    mock.store(on)
    mock.clock(on, { now: Date.UTC(2026, 9, 19, 23, 43) })
    const { writes } = printWorld(on, { chrome: false })
    expect((await $.command.run({ ...RUN, args: 'print' })).text).toBe('PNG precisa do Chrome headless; HTML salvo em /Users/u/Desktop/realce-19-10_20-43.html.')
    expect(writes['/Users/u/Desktop/realce-19-10_20-43.html']).toContain('ok')
  })

  test('with Chrome it shoots the PNG', async ($, on) => {
    mock.store(on)
    mock.clock(on, { now: Date.UTC(2026, 9, 19, 23, 43) })
    const { runs } = printWorld(on)
    expect((await $.command.run({ ...RUN, args: 'print' })).text).toBe('Print salvo em /Users/u/Desktop/realce-19-10_20-43.png.')
    expect(runs).toHaveLength(1)
    expect(runs[0]![0]).toBe(CHROME)
    expect(runs[0]).toContain('--headless')
    expect(runs[0]).toContain('--screenshot=/Users/u/Desktop/realce-19-10_20-43.png')
    expect(runs[0]!.some(a => /^--window-size=1000,\d+$/.test(a))).toBe(true)
    expect(runs[0]![runs[0]!.length - 1]).toBe('file:///Users/u/Desktop/realce-19-10_20-43.html')
  })

  test('a Chrome that fails says so and keeps the HTML', async ($, on) => {
    mock.store(on)
    mock.clock(on, { now: Date.UTC(2026, 9, 19, 23, 43) })
    printWorld(on, { chromeExit: 1 })
    expect((await $.command.run({ ...RUN, args: 'print' })).text).toBe('O Chrome não gerou o PNG (crashed); HTML salvo em /Users/u/Desktop/realce-19-10_20-43.html.')
  })

  test('no reply yet, or no Desktop', async ($, on) => {
    mock.store(on)
    mock.clock(on, { now: Date.UTC(2026, 9, 19, 23, 43) })
    printWorld(on, { reply: null })
    expect((await $.command.run({ ...RUN, args: 'print' })).text).toBe('Nenhuma resposta para imprimir ainda.')
  })

  test('without a Desktop it saves in the home', async ($, on) => {
    mock.store(on)
    mock.clock(on, { now: Date.UTC(2026, 9, 19, 23, 43) })
    printWorld(on, { desktop: false })
    expect((await $.command.run({ ...RUN, args: 'print' })).text).toBe('Print salvo em /Users/u/realce-19-10_20-43.png.')
  })

  test('print off says how to turn it on', async ($, on) => {
    mock.store(on, { flags: { print: false } })
    expect((await $.command.run({ ...RUN, args: 'print' })).text).toBe('Recurso desligado: Print bonito. /realce print on liga.')
  })
})

describe('/realce demo', () => {
  const STEP = { turnId: 't1', index: 0, model: 'm', messageCount: 1 }

  function demoWorld(on: On, refuse?: string) {
    const submitted: string[] = []
    let isModelAsked = false
    on('prompt.submit', ($, e) => {
      submitted.push(e.text)
      return (refuse === undefined ? { text: e.text } : { drop: refuse }) as never
    })
    on('turn.step', async function* ($, e) {
      isModelAsked = true
      yield { kind: 'text' as const, index: 0, text: 'modelo' }
      return { turnId: e.turnId, index: e.index, answer: 'modelo', toolUses: [], stopReason: 'end_turn' as const, usage: null }
    })
    return { submitted, wasModelAsked: () => isModelAsked }
  }

  async function readStep($: Engine) {
    // The generator's own return is the chain's answer; `result` is what beneath returned, nothing when unasked.
    const stream = $.turn.step(STEP)
    const texts: string[] = []
    let step = await stream.next()
    while (step.done !== true) {
      if (step.value.kind === 'text') texts.push(step.value.text)
      step = await stream.next()
    }
    return { texts, result: step.value }
  }

  test('the demo is answered without the model', async ($, on) => {
    mock.store(on)
    const clock = mock.clock(on)
    const world = demoWorld(on)
    expect(await $.command.run({ ...RUN, args: 'demo' })).toEqual({})
    await clock.settle()
    expect(world.submitted).toEqual(['Demonstração do realce'])
    const { texts, result } = await readStep($)
    expect(texts.join('')).toBe(DEMO_TEXT)
    expect(result).toMatchObject({ answer: DEMO_TEXT, toolUses: [], stopReason: 'end_turn' })
    expect(world.wasModelAsked()).toBe(false)
  })

  test('a step with no demo armed goes to the model', async ($, on) => {
    mock.store(on)
    const world = demoWorld(on)
    expect((await readStep($)).texts.join('')).toBe('modelo')
    expect(world.wasModelAsked()).toBe(true)
  })

  test('the demo shows every aid', () => {
    for (const piece of ['{+', '{-', '{!', '==', '> [!FEITO]', '> [!DICA]', '```mermaid', '```ts', '| ', 'de 22 ms para 9 ms']) expect(DEMO_TEXT).toContain(piece)
  })

  test('a submit that fails disarms the demo and says why', async ($, on) => {
    mock.store(on)
    const clock = mock.clock(on)
    const logs: string[] = []
    on('ui.log', ($, e) => {
      logs.push(e.text)
      return { value: undefined }
    })
    const world = demoWorld(on, 'ocupado')
    await $.command.run({ ...RUN, args: 'demo' })
    await clock.settle()
    expect((await readStep($)).texts.join('')).toBe('modelo')
    expect(world.wasModelAsked()).toBe(true)
    expect(logs.some(l => l.startsWith('realce: demo não enviada'))).toBe(true)
  })

  test('only the first step of a turn is the demo', async ($, on) => {
    mock.store(on)
    const clock = mock.clock(on)
    const world = demoWorld(on)
    await $.command.run({ ...RUN, args: 'demo' })
    await clock.settle()
    const stream = $.turn.step({ ...STEP, index: 2 })
    let step = await stream.next()
    while (step.done !== true) step = await stream.next()
    expect(world.wasModelAsked()).toBe(true)
  })

  test('demo off says how to turn it on', async ($, on) => {
    mock.store(on, { flags: { demo: false } })
    expect((await $.command.run({ ...RUN, args: 'demo' })).text).toBe('Recurso desligado: Demonstração. /realce demo on liga.')
  })
})

describe('welcome hint', () => {
  function startWorld(on: On) {
    const toasts: string[] = []
    mock.env(on, { HOME: '/Users/u' })
    on('fs.exists', () => ({ value: false }))
    on('process.run', ($, e) => ({ value: { exitCode: e.argv[0] === 'date' ? 0 : 1, stdout: e.argv[0] === 'date' ? '-0300\n' : '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
    on('config.list', () => ({ value: [] }))
    on('session.messages', () => ({ value: [] }))
    on('ui.invalidate', () => ({ value: undefined }))
    on('ui.open', () => ({ value: { isPlaced: true as const } }))
    on('command.register', ($, e) => ({ value: { command: e.name } }))
    on('http.fetch', () => ({ deny: 'sem rede' }))
    on('ui.toast', ($, e) => {
      toasts.push(e.text)
      return { value: undefined }
    })
    on('session.start', () => ({ cwd: '/a/b' }))
    return toasts
  }

  test('the first interactive session hints once', async ($, on) => {
    mock.store(on)
    mock.clock(on)
    const toasts = startWorld(on)
    await $.session.start({ cwd: '/a/b', surface: 'terminal', isInteractive: true })
    await $.session.start({ cwd: '/a/b', surface: 'terminal', isInteractive: true })
    expect(toasts.filter(t => t === 'realce instalado: /realce demo mostra o que ele faz.')).toHaveLength(1)
  })

  test('a -p run gets no hint', async ($, on) => {
    mock.store(on)
    mock.clock(on)
    const toasts = startWorld(on)
    await $.session.start({ cwd: '/a/b', surface: null, isInteractive: false })
    expect(toasts).toEqual([])
  })
})

describe('update notice', () => {
  const RAW = 'https://raw.githubusercontent.com/Th3-W6rst/claude-realce/main/.claude-plugin/plugin.json'

  function updateWorld(on: On, remote: { ok: true; version: string } | { ok: false; status: number } | 'deny') {
    const toasts: string[] = []
    const fetched: string[] = []
    mock.env(on, { HOME: '/Users/u' })
    on('fs.exists', () => ({ value: false }))
    on('fs.read', ($, e) => (e.path.endsWith('/.claude-plugin/plugin.json') ? { value: '{"name":"realce","version":"0.4.0"}' } : { deny: 'ENOENT' }))
    on('process.run', ($, e) => ({ value: { exitCode: e.argv[0] === 'date' ? 0 : 1, stdout: e.argv[0] === 'date' ? '-0300\n' : '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
    on('config.list', () => ({ value: [] }))
    on('session.messages', () => ({ value: [] }))
    on('ui.invalidate', () => ({ value: undefined }))
    on('ui.open', () => ({ value: { isPlaced: true as const } }))
    on('command.register', ($, e) => ({ value: { command: e.name } }))
    on('prompt.compose', () => ({ sections: [] }))
    on('http.fetch', ($, e) => {
      fetched.push(e.url)
      if (remote === 'deny') return { deny: 'sem rede' }
      return { value: remote.ok ? { status: 200, ok: true, headers: {}, text: `{"name":"realce","version":"${remote.version}"}` } : { status: remote.status, ok: false, headers: {}, text: '' } } as never
    })
    on('ui.toast', ($, e) => {
      toasts.push(e.text)
      return { value: undefined }
    })
    on('session.start', () => ({ cwd: '/a/b' }))
    return { toasts, fetched }
  }

  const start = ($: Engine, isInteractive = true) => $.session.start({ cwd: '/a/b', surface: isInteractive ? 'terminal' : null, isInteractive })
  const status = async ($: Engine) => (await $.command.run({ ...RUN, args: 'status' })).text ?? ''

  test('versions compare by number', () => {
    expect(compareVersions('0.4.0', '0.3.1')).toBeGreaterThan(0)
    expect(compareVersions('0.4.0', '0.4.0')).toBe(0)
    expect(compareVersions('0.10.0', '0.9.9')).toBeGreaterThan(0)
    expect(compareVersions('0.3.9', '0.4.0')).toBeLessThan(0)
  })

  test('a pre-release is older than its release, and garbage is no version', () => {
    expect(compareVersions('0.5.0-beta', '0.5.0')).toBeLessThan(0)
    expect(compareVersions('0.5.0-beta', '0.4.0')).toBeGreaterThan(0)
    expect(Number.isNaN(compareVersions('x.y', '0.4.0'))).toBe(false)
  })

  test('a remote plugin.json without a version is not "em dia"', async ($, on) => {
    mock.store(on, { demoHintShown: true })
    const clock = mock.clock(on)
    updateWorld(on, { ok: true, version: '' })
    await start($)
    await clock.settle()
    expect(await status($)).toMatch(/Atualização: não verificada \(versão no GitHub não lida\)\./)
  })

  test('a newer version on GitHub is announced', async ($, on) => {
    mock.store(on, { demoHintShown: true })
    const clock = mock.clock(on)
    const { toasts, fetched } = updateWorld(on, { ok: true, version: '0.4.1' })
    await start($)
    await clock.settle()
    expect(fetched).toEqual([RAW])
    expect(toasts).toContain('realce 0.4.1 disponível: claude plugin marketplace update claude-realce e claude plugin update realce@claude-realce')
    expect(await status($)).toMatch(/Atualização: 0\.4\.1 disponível \(instalada 0\.4\.0\)\./)
  })

  test('the same version says nothing but the status', async ($, on) => {
    mock.store(on, { demoHintShown: true })
    const clock = mock.clock(on)
    const { toasts } = updateWorld(on, { ok: true, version: '0.4.0' })
    await start($)
    await clock.settle()
    expect(toasts).toEqual([])
    expect(await status($)).toMatch(/Atualização: em dia \(0\.4\.0\)\./)
  })

  test('a check in the last day is not repeated', async ($, on) => {
    const now = Date.UTC(2026, 9, 20, 12, 0)
    mock.store(on, { demoHintShown: true, updateCheckedAt: now - 3_600_000 })
    const clock = mock.clock(on, { now })
    const { fetched } = updateWorld(on, { ok: true, version: '0.4.1' })
    await start($)
    await clock.settle()
    expect(fetched).toEqual([])
  })

  test('a network failure shows only in status', async ($, on) => {
    mock.store(on, { demoHintShown: true })
    const clock = mock.clock(on)
    const { toasts } = updateWorld(on, 'deny')
    await start($)
    await clock.settle()
    expect(toasts).toEqual([])
    expect(await status($)).toMatch(/Atualização: não verificada \(.*sem rede.*\)\./)
  })

  test('atualizacao off or a -p run fetches nothing', async ($, on) => {
    mock.store(on, { demoHintShown: true, flags: { atualizacao: false } })
    const clock = mock.clock(on)
    const { fetched } = updateWorld(on, { ok: true, version: '0.4.1' })
    await start($)
    await start($, false)
    await clock.settle()
    expect(fetched).toEqual([])
  })
})
