import { atom, update } from 'claude-code'
import type { Args, EngineInterface, On } from 'claude-code'

import type { LimitWarning, UsageReading } from '../../types'
import { SCREEN } from '../palette'
import type { Segment } from '../fit'
import { getFlags } from '../flags'
import { formatClock, formatDayMonth } from '../format'
import { pickOr, tr, type Text } from '../i18n'

const LIMIT = atom({ plugin: 'realce', key: 'limit' } as const, null)
const USAGE = atom({ plugin: 'realce', key: 'usage' } as const, null)

const WARN_AT = 80
// A long session sits in the 80s of its context for a while; the warning waits for the 90s there.
const CONTEXT_WARN_AT = 90
// Hidden, the warning comes back at the next of these: the person said "I know", not "never".
const STEPS = [80, 90, 95, 100] as const
const DAY_MS = 24 * 3_600_000

const WINDOW_NAMES: Record<string, Text> = {
  five_hour: { en: '5 h', pt: '5 h' },
  seven_day: { en: '7 days', pt: '7 dias' },
  spend_limit: { en: 'spend', pt: 'gasto' },
}

const windowName = (kind: string): string => pickOr(WINDOW_NAMES, kind)

// What the person hid, by source: hiding the context's warning leaves the 5-hour window's to say its own.
let hidden: { window: string; step: number } | null = null

const stepOf = (percent: number) => [...STEPS].reverse().find(s => percent >= s) ?? 0

/** The fullest of the rate-limit windows and the context, when one has passed 80%. */
export function limitWarning(e: Pick<Args<'session.measure'>, 'context' | 'rateLimits'>): LimitWarning | null {
  const candidates: LimitWarning[] = e.rateLimits.map(r => ({
    kind: 'rate' as const,
    window: r.kind,
    percent: Math.round(r.percentUsed),
    resetsAt: r.resetsAt === undefined ? null : Date.parse(r.resetsAt),
  }))
  if (e.context.percent !== undefined) candidates.push({ kind: 'context', window: 'context', percent: Math.round(e.context.percent), resetsAt: null })
  const top = candidates.filter(c => c.percent >= (c.kind === 'context' ? CONTEXT_WARN_AT : WARN_AT)).sort((a, b) => b.percent - a.percent)[0]
  return top ?? null
}

/** '⚠ 5 h limit at 86% · resets at 23:40' ('resets Oct 22 at 23:40' past a day; or in Portuguese); the context's advice. */
export function limitText(w: LimitWarning, tzOffsetMinutes: number | undefined, now: number): string {
  if (w.kind === 'context') return tr(`⚠ Context at ${w.percent}%: a /compact before anything big`, `⚠ Contexto em ${w.percent}%: um /compact antes de algo grande`)
  const name = windowName(w.window)
  const head = tr(`⚠ ${name} limit at ${w.percent}%`, `⚠ Limite de ${name} em ${w.percent}%`)
  if (w.resetsAt === null || Number.isNaN(w.resetsAt) || tzOffsetMinutes === undefined) return head
  const clock = formatClock(w.resetsAt, tzOffsetMinutes)
  if (w.resetsAt - now <= DAY_MS) return tr(`${head} · resets at ${clock}`, `${head} · renova às ${clock}`)
  const day = formatDayMonth(w.resetsAt, tzOffsetMinutes)
  return tr(`${head} · resets ${day} at ${clock}`, `${head} · renova em ${day} às ${clock}`)
}

const tone = (percent: number, warnAt: number) => (percent >= 95 ? SCREEN.bad : percent >= warnAt ? SCREEN.warn : SCREEN.dim)

/** 'Context 30% · 5 h 46% · 7 days 12%', each part in the color its fill calls for; nothing before a reading. */
export function usageLine(u: UsageReading): Segment[] {
  // The context colors as its warning comes: from 90%; the windows from 80%.
  const parts = [...(u.context === null ? [] : [{ label: tr('Context', 'Contexto'), percent: u.context, warnAt: CONTEXT_WARN_AT }]), ...u.windows.map(w => ({ label: windowName(w.window), percent: w.percent, warnAt: WARN_AT }))]
  return parts.flatMap((p, i) => [...(i > 0 ? [{ text: ' · ', color: SCREEN.dim }] : []), { text: `${p.label} ${p.percent}%`, color: tone(p.percent, p.warnAt) }])
}

const readingOf = (e: Pick<Args<'session.measure'>, 'context' | 'rateLimits'>): UsageReading => ({
  context: e.context.percent === undefined ? null : Math.round(e.context.percent),
  windows: e.rateLimits.map(r => ({ window: r.kind, percent: Math.round(r.percentUsed) })),
})

export async function hideLimit($: EngineInterface, w: LimitWarning): Promise<void> {
  hidden = { window: w.window, step: stepOf(w.percent) }
  await update($, LIMIT, () => null)
}

async function noteMeasure($: EngineInterface, e: Args<'session.measure'>): Promise<void> {
  if (!(await getFlags($)).limite) {
    // Off: no warning waits to come back stale when it is turned on.
    await update($, LIMIT, current => (current === null ? current : null))
    return
  }
  const reading = readingOf(e)
  await update($, USAGE, current => (JSON.stringify(current) === JSON.stringify(reading) ? current : reading))
  const warning = limitWarning(e)
  if (warning === null) {
    // A reading that left a unit out says nothing about it: only one that measured it clears what was hidden.
    if (e.changed.includes('rateLimits') || e.changed.includes('context')) hidden = null
    await update($, LIMIT, current => (current === null ? current : null))
    return
  }
  if (hidden !== null && hidden.window === warning.window && stepOf(warning.percent) <= hidden.step) return
  if (hidden?.window === warning.window) hidden = null
  await update($, LIMIT, current => (JSON.stringify(current) === JSON.stringify(warning) ? current : warning))
}

export function registerLimits(on: On): void {
  // The engine raises it after each response with the windows' readings: no polling.
  on('session.measure', async ($, e, next) => {
    const result = await next(e)
    await noteMeasure($, e)
    return result
  })
}
