import { describe, expect, mock, test } from 'claude-code/testing'

import { limitText, limitWarning, usageParts } from '../hooks/orient/limits'
import { TODOS, engine, mountBand, mountPane, startStandIns } from './world'
import { PT } from './lang'

describe('usage limit', () => {
  const CONTEXT = { window: 1_000_000, tokens: 300_000, percent: 30 }
  const measure = (rateLimits: { kind: string; percentUsed: number; resetsAt?: string }[], context = CONTEXT) => ({ context, rateLimits, changed: ['rateLimits' as const] })

  test('the highest window past 80% is the warning', () => {
    expect(limitWarning(measure([{ kind: 'five_hour', percentUsed: 60 }]))).toBeNull()
    expect(limitWarning(measure([{ kind: 'five_hour', percentUsed: 86, resetsAt: '2026-10-20T02:40:00Z' }, { kind: 'seven_day', percentUsed: 81 }]))).toEqual({ kind: 'rate', window: 'five_hour', percent: 86, resetsAt: Date.UTC(2026, 9, 20, 2, 40) })
    expect(limitWarning(measure([], { window: 200_000, tokens: 182_000, percent: 91 }))).toEqual({ kind: 'context', window: 'context', percent: 91, resetsAt: null })
  })

  test('the warning says what fills and when it renews', () => {
    expect(limitText({ kind: 'rate', window: 'five_hour', percent: 86, resetsAt: Date.UTC(2026, 9, 20, 2, 40) }, -180, Date.UTC(2026, 9, 20, 2, 0))).toBe('⚠ Limite de 5 h em 86% · renova às 23:40')
    expect(limitText({ kind: 'rate', window: 'seven_day', percent: 91, resetsAt: null }, -180, Date.UTC(2026, 9, 20, 2, 0))).toBe('⚠ Limite de 7 dias em 91%')
    expect(limitText({ kind: 'context', window: 'context', percent: 85, resetsAt: null }, -180, Date.UTC(2026, 9, 20, 2, 0))).toBe('⚠ Contexto em 85%: um /compact antes de algo grande')
  })

  test('a renewal more than a day away says the date', () => {
    const now = Date.UTC(2026, 9, 20, 2, 0)
    expect(limitText({ kind: 'rate', window: 'seven_day', percent: 91, resetsAt: Date.UTC(2026, 9, 22, 2, 40) }, -180, now)).toBe('⚠ Limite de 7 dias em 91% · renova em 21/10 às 23:40')
    expect(limitText({ kind: 'rate', window: 'five_hour', percent: 86, resetsAt: Date.UTC(2026, 9, 20, 2, 40) }, -180, now)).toBe('⚠ Limite de 5 h em 86% · renova às 23:40')
  })

  test('the context warns from 90%, the windows from 80%', () => {
    expect(limitWarning(measure([], { window: 200_000, tokens: 170_000, percent: 85 }))).toBeNull()
    expect(limitWarning(measure([], { window: 200_000, tokens: 182_000, percent: 91 }))?.kind).toBe('context')
  })

  test('hiding one warning does not hide another source at the same step', async ($, on) => {
    mock.store(on, PT)
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
    mock.store(on, PT)
    mock.clock(on)
    engine(on)
    on('session.measure', ($, e) => ({ changed: e.changed }))
    await $.tool.call({ tool: 'TodoWrite', todos: TODOS })
    await $.session.measure(measure([{ kind: 'five_hour', percentUsed: 86 }]))
    expect(await (await mountBand($, { isWorking: true })).find({ text: /Plano/ })).toBeDefined()
    expect(await (await mountBand($, { isWorking: false })).find({ text: /Limite de 5 h/ })).toBeDefined()
  })

  test('the band shows it, hides it, and shows it again past the next step', async ($, on) => {
    mock.store(on, PT)
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

  test('the usage names the context and each window', () => {
    expect(usageParts({ context: 30, windows: [{ window: 'five_hour', percent: 46 }, { window: 'seven_day', percent: 12 }] }).map(p => `${p.label} ${p.percent}%`)).toEqual(['Contexto 30%', '5 h 46%', '7 dias 12%'])
    expect(usageParts({ context: null, windows: [] })).toEqual([])
  })

  test('the context colors like its warning: amber from 90%', () => {
    const tones = (context: number) => usageParts({ context, windows: [] })[0]?.color
    expect(tones(85)).toBe(usageParts({ context: 10, windows: [] })[0]?.color)
    expect(tones(91)).not.toBe(tones(85))
  })

  test('the session pane shows the usage once measured', async ($, on) => {
    mock.store(on, PT)
    mock.clock(on)
    engine(on)
    on('session.measure', ($, e) => ({ changed: e.changed }))
    await $.session.measure(measure([{ kind: 'five_hour', percentUsed: 46 }, { kind: 'seven_day', percentUsed: 12 }]))
    const ui = await mountPane($)
    expect(await ui.find({ text: 'Uso' })).toBeDefined()
    const texts = (await ui.findAll({ type: 'Text' })).map(el => el.text)
    expect(texts).toContain('Contexto ▰▰▰▱▱▱▱▱▱▱ 30%')
    expect(texts).toContain('5 h      ▰▰▰▰▰▱▱▱▱▱ 46%')
    expect(texts).toContain('7 dias   ▰▱▱▱▱▱▱▱▱▱ 12%')
  })

  test('limite off shows nothing', async ($, on) => {
    mock.store(on, { ...PT, flags: { limite: false } })
    mock.clock(on)
    engine(on)
    on('session.measure', ($, e) => ({ changed: e.changed }))
    await $.session.measure(measure([{ kind: 'five_hour', percentUsed: 97 }]))
    expect(await (await mountBand($)).find({ text: /Limite/ })).toBeUndefined()
  })
})
