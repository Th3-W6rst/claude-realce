import { describe, expect, mock, test } from 'claude-code/testing'

import { summaryText } from '../hooks/system/summary'
import { engine } from './world'
import { PT, PT_ALL } from './lang'

describe('session summary', () => {
  const PASSED = { runner: 'pytest', passed: 12, failed: 0, skipped: 0, unit: 'tests' as const }

  test("the last failure's explanation rides under it", () => {
    const text = summaryText({ timeline: [], files: [], commits: [], failures: [{ command: 'cat x', line: 'cat: x: No such file', at: 1 }], cwd: '/', tzOffsetMinutes: 0, lastWhy: 'O arquivo x não existe; confira o nome.' })
    expect(text).toContain('- **Falhas:** 1 (última: `cat x` → cat: x: No such file)\n  - Por quê: O arquivo x não existe; confira o nome.')
  })

  test('the summary sums turns, seals, files, commits and failures', () => {
    const text = summaryText({
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
      '  - 20:41 · 12s · Renomeia b · ✔ provado',
      '  - 21:05 · 4s · Sobe a versão · ⚠ sem prova',
      '- **Testes:** último placar ✔ 12 testes',
      '- **Arquivos:** 2 (+13 −1)',
      '  - `calc.py` +3 −1',
      '  - `README.md` +10 −0',
      '- **Git:** ● commit 9cd805a · ↑ push main',
      '- **Falhas:** 1 (última: `npm test` → 2 failing)',
    ].join('\n'))
  })

  test('one passing test is one test', () => {
    const one = { runner: 'pytest', passed: 1, failed: 0, skipped: 0, unit: 'tests' as const }
    const text = summaryText({ timeline: [{ requestId: 'u', at: 0, prompt: 'x', durationMs: 1000, seal: 'proved', tests: one }], files: [], commits: [], failures: [], cwd: '/', tzOffsetMinutes: 0 })
    expect(text).toContain('último placar ✔ 1 teste')
    expect(text).not.toContain('1 testes')
  })

  test('a capped list says it is the latest part', () => {
    const rows = Array.from({ length: 50 }, (_, i) => ({ requestId: `u${i}`, at: i * 60_000, prompt: `p${i}`, durationMs: 1000, seal: null, tests: null }))
    const failures = Array.from({ length: 20 }, (_, i) => ({ command: `c${i}`, line: 'x', at: i }))
    const text = summaryText({ timeline: rows, files: [], commits: [], failures, cwd: '/', tzOffsetMinutes: 0, isTimelineFull: true, isFailuresFull: true })
    expect(text).toContain('- **Turnos:** os últimos 50')
    expect(text).toContain('- **Falhas:** as últimas 20')
  })

  test('a multi-line command or one with backticks keeps the markdown whole', () => {
    const text = summaryText({ timeline: [], files: [], commits: [], failures: [{ command: 'git commit -m "$(cat <<EOF\nmsg\nEOF\n)"', line: 'erro `x`', at: 1 }], cwd: '/', tzOffsetMinutes: 0 })
    expect(text).toContain('(última: `git commit -m "$(cat <<EOF…` → erro ˋxˋ)')
  })

  test('the command shows the summary without markdown marks', async ($, on) => {
    mock.store(on, PT)
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

  test("the summary's why follows the erros flag, as the pane does", async ($, on) => {
    mock.store(on, PT_ALL)
    const clock = mock.clock(on)
    // The specific tool answers before the engine's catch-all below it.
    on('tool.call', { tool: 'Bash' }, () => ({ isError: true as const, result: 'Exit code 1\ncat: x: No such file', text: 'Exit code 1\ncat: x: No such file' }))
    engine(on)
    on('ui.copy', () => ({ value: { isCopied: true as const } }))
    on('session.cwd', () => ({ value: '/a/b' }))
    on('process.run', () => ({ value: { exitCode: 0, stdout: '-0300\n', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
    on('ui.invalidate', () => ({ value: undefined }))
    on('model.complete', () => ({ value: { isAnswered: true, text: 'O arquivo x não existe.', usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } } }) as never)
    await $.tool.call({ tool: 'Bash', command: 'cat x', tool_use_id: 'r1' })
    await clock.settle()
    const RUN = { command: 'realce', origin: { kind: 'composer' as const }, presentation: { isFullscreen: true, columns: 120 } }
    expect((await $.command.run({ ...RUN, args: 'resumo' })).text).toContain('Por quê: O arquivo x não existe.')
    await $.command.run({ ...RUN, args: 'erros off' })
    expect((await $.command.run({ ...RUN, args: 'resumo' })).text).not.toContain('Por quê')
  })

  test('an empty session says so', () => {
    expect(summaryText({ timeline: [], files: [], commits: [], failures: [], cwd: '/a', tzOffsetMinutes: -180 })).toBe('## Resumo da sessão\n\nNada aconteceu ainda nesta sessão.')
  })

  test('/realce resumo copies the summary and shows it', async ($, on) => {
    mock.store(on, PT)
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
    mock.store(on, { ...PT, flags: { resumo: false } })
    const RUN = { command: 'realce', origin: { kind: 'composer' as const }, presentation: { isFullscreen: true, columns: 120 } }
    expect((await $.command.run({ ...RUN, args: 'resumo' })).text).toBe('Recurso desligado: Resumo da sessão. /realce resumo on liga.')
  })

  test('a failing go test counts packages; before the env is read the paths show whole', () => {
    const failing = { runner: 'go', passed: 3, failed: 2, skipped: 0, unit: 'packages' as const }
    const text = summaryText({
      timeline: [{ requestId: 'u', at: 0, prompt: 'x', durationMs: 1000, seal: null, tests: failing }],
      files: [{ path: '/a/b/x.go', added: 1, removed: 0, edits: 1, at: 1 }],
      commits: [],
      failures: [],
      cwd: null,
      tzOffsetMinutes: 0,
    })
    expect(text).toContain('último placar ✖ 2 pacotes falharam')
    expect(text).toContain('`/a/b/x.go` +1 −0')
  })
})
