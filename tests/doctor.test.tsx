import { describe, expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const RUN = { command: 'realce', origin: { kind: 'composer' as const }, presentation: { isFullscreen: true, columns: 120 } }

function machine(on: On, m: { version: string; colorterm?: string; uname: string; mmdc: boolean; chrome: boolean; cursor: boolean }) {
  mock.env(on, { HOME: '/Users/u', ...(m.colorterm === undefined ? {} : { COLORTERM: m.colorterm }) })
  on('session.version', () => ({ value: { version: m.version } }) as never)
  on('fs.exists', ($, e) => ({ value: (m.cursor && e.path === '/Applications/Cursor.app') || (m.chrome && e.path.endsWith('chrome-headless-shell')) }))
  on('process.run', ($, e) => {
    const done = { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false }
    if (e.argv[0] === 'date') return { value: { ...done, stdout: '-0300\n' } }
    if (e.argv[0] === 'uname') return { value: { ...done, stdout: `${m.uname}\n` } }
    if (e.argv[0] === 'which') return { value: m.mmdc ? { ...done, stdout: '/opt/homebrew/bin/mmdc\n' } : { ...done, exitCode: 1 } }
    if (e.argv[0] === 'find') return { value: { ...done, stdout: m.chrome ? '/Users/u/.cache/puppeteer/chrome-headless-shell/x/chrome-headless-shell\n' : '' } }
    return { value: { ...done, exitCode: 1 } }
  })
  on('config.list', () => ({ value: [] }))
  on('session.messages', () => ({ value: [] }))
  on('ui.invalidate', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('ui.toast', () => ({ value: undefined }))
  on('http.fetch', () => ({ deny: 'sem rede' }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('prompt.compose', () => ({ sections: [] }))
  on('session.start', () => ({ cwd: '/a/b' }))
}

describe('/realce diagnostico', () => {
  test('a ready machine passes every check', async ($, on) => {
    mock.store(on)
    mock.clock(on)
    machine(on, { version: '2.1.304', colorterm: 'truecolor', uname: 'Darwin', mmdc: true, chrome: true, cursor: true })
    await $.session.start({ cwd: '/a/b', surface: 'terminal', isInteractive: true })
    const text = (await $.command.run({ ...RUN, args: 'diagnostico' })).text ?? ''
    expect(text.split('\n')[0]).toBe('Diagnóstico do realce:')
    expect(text).toContain('✔ Claude Code 2.1.304')
    expect(text).toContain('✔ Cor de 24 bits')
    expect(text).toContain('✔ macOS')
    expect(text).toContain('✔ Tela cheia')
    expect(text).toContain('✔ Editor dos caminhos: cursor')
    expect(text).toContain('✔ Diagramas: mmdc em /opt/homebrew/bin/mmdc')
    expect(text).toContain('✔ PNG do print: Chrome headless')
    expect(text).not.toContain('✖')
  })

  test('a bare machine says what to install', async ($, on) => {
    mock.store(on)
    mock.clock(on)
    machine(on, { version: '2.1.200', uname: 'Linux', mmdc: false, chrome: false, cursor: false })
    await $.session.start({ cwd: '/a/b', surface: 'terminal', isInteractive: true })
    const text = (await $.command.run({ ...RUN, args: 'diagnostico', presentation: { isFullscreen: false, columns: 120 } })).text ?? ''
    expect(text).toContain('✖ Claude Code 2.1.200: o realce pede 2.1.304 ou mais novo (claude update)')
    expect(text).toContain('⚠ Cor de 24 bits: COLORTERM não diz truecolor')
    expect(text).toContain('⚠ Linux: avisos, som e print usam recursos do macOS')
    expect(text).toContain('⚠ Tela cheia desligada: "tui": "fullscreen" no ~/.claude/settings.json')
    expect(text).toContain('⚠ Editor dos caminhos: nenhum (Cursor, VS Code ou Zed); os caminhos abrem como file://')
    expect(text).toContain('⚠ Diagramas: mmdc não encontrado (brew install mermaid-cli)')
    expect(text).toContain('⚠ PNG do print: Chrome headless não encontrado (o print salva só o HTML)')
  })
})
