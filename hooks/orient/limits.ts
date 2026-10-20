import { atom, update } from 'claude-code'
import type { Args, EngineInterface, On } from 'claude-code'

import type { LimitWarning } from '../../types'
import { getFlags } from '../flags'
import { formatClock } from '../format'

const LIMIT = atom({ plugin: 'realce', key: 'limit' } as const, null)

const WARN_AT = 80
// Hidden, the warning comes back at the next of these: the person said "I know", not "never".
const STEPS = [80, 90, 95, 100] as const

const WINDOW_NAMES: Record<string, string> = { five_hour: '5 h', seven_day: '7 dias', spend_limit: 'gasto' }

let hiddenStep: number | null = null

const stepOf = (percent: number) => [...STEPS].reverse().find(s => percent >= s) ?? 0

/** The fullest of the rate-limit windows and the context, when one has passed 80%. */
export function limitWarning(e: Pick<Args<'session.measure'>, 'context' | 'rateLimits'>): LimitWarning | null {
  const candidates: LimitWarning[] = e.rateLimits.map(r => ({
    kind: 'rate' as const,
    label: WINDOW_NAMES[r.kind] ?? r.kind,
    percent: Math.round(r.percentUsed),
    resetsAt: r.resetsAt === undefined ? null : Date.parse(r.resetsAt),
  }))
  if (e.context.percent !== undefined) candidates.push({ kind: 'context', label: 'contexto', percent: Math.round(e.context.percent), resetsAt: null })
  const top = candidates.filter(c => c.percent >= WARN_AT).sort((a, b) => b.percent - a.percent)[0]
  return top ?? null
}

/** '⚠ Limite de 5 h em 86% · renova às 23:40', '⚠ Contexto em 85%: um /compact antes de algo grande'. */
export function limitText(w: LimitWarning, tzOffsetMinutes: number | undefined): string {
  if (w.kind === 'context') return `⚠ Contexto em ${w.percent}%: um /compact antes de algo grande`
  const renews = w.resetsAt !== null && !Number.isNaN(w.resetsAt) && tzOffsetMinutes !== undefined ? ` · renova às ${formatClock(w.resetsAt, tzOffsetMinutes)}` : ''
  return `⚠ Limite de ${w.label} em ${w.percent}%${renews}`
}

export async function hideLimit($: EngineInterface, w: LimitWarning): Promise<void> {
  hiddenStep = stepOf(w.percent)
  await update($, LIMIT, () => null)
}

async function noteMeasure($: EngineInterface, e: Args<'session.measure'>): Promise<void> {
  if (!(await getFlags($)).limite) return
  const warning = limitWarning(e)
  if (warning === null) {
    hiddenStep = null
    await update($, LIMIT, current => (current === null ? current : null))
    return
  }
  if (hiddenStep !== null && stepOf(warning.percent) <= hiddenStep) return
  hiddenStep = null
  await update($, LIMIT, () => warning)
}

export function registerLimits(on: On): void {
  // The engine raises it after each response with the windows' readings: no polling.
  on('session.measure', async ($, e, next) => {
    const result = await next(e)
    await noteMeasure($, e)
    return result
  })
}
