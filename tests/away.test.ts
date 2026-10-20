import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On, PromptEditInput } from 'claude-code'

import { awaySummary, awayText } from '../hooks/orient/away'
import { ANSWER, engine, finish, mountBand } from './world'
import { PT, PT_ALL } from './lang'

describe('while you were away', () => {
  const PASSED = { runner: 'bun', passed: 159, failed: 0, skipped: 0, unit: 'tests' as const }
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
    mock.store(on, PT)
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
    mock.store(on, PT)
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
    mock.store(on, PT_ALL)
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
    mock.store(on, { ...PT, flags: { ausencia: false } })
    const clock = mock.clock(on)
    engine(on)
    on('prompt.edit', ($, e) => ({ text: e.text + e.inputText, cursor: e.cursor + e.inputText.length }))
    await $.prompt.submit({ text: 'faz tudo', origin: { kind: 'composer' }, wait: false })
    await clock.advance(30 * 60_000)
    await finish($, 'Feito.')
    await edit($)
    expect(await (await mountBand($)).find({ text: /Enquanto você estava fora/ })).toBeUndefined()
  })

  test('a failing go test counts packages, as the turn rule does', () => {
    const failing = { runner: 'go', passed: 3, failed: 2, skipped: 0, unit: 'packages' as const }
    const summary = awaySummary(32 * 60_000, 0, [stats(1, failing as unknown as typeof PASSED)], 0)!
    expect(awayText(summary)).toContain('✖ 2 pacotes falharam')
  })
})
