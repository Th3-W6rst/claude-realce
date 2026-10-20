import type { PlanItem } from '../../types'
import type { Segment } from '../fit'
import { tr } from '../i18n'
import { SCREEN } from '../palette'
import { asRecord, str } from '../safe'

type Status = PlanItem['status']

const BAR_CELLS = 10
const STATUSES: readonly Status[] = ['pending', 'in_progress', 'completed']

const isStatus = (v: unknown): v is Status => STATUSES.includes(v as Status)
// An item's optional text: absent, not null, when the call left it out.
const optional = (v: unknown): string | undefined => str(v) ?? undefined

function item(id: string | undefined, text: string, status: Status, activeForm: string | undefined): PlanItem {
  return { ...(id !== undefined ? { id } : {}), text, status, ...(activeForm !== undefined ? { activeForm } : {}) }
}

/**
 * The plan after one call of a plan tool: TodoWrite replaces it, TaskCreate appends (its id from the result),
 * TaskUpdate edits or (`deleted`) removes, TaskList resyncs. Any other call, or a shape not recognized, returns
 * `plan` itself, so the caller can tell nothing changed.
 */
export function applyPlanCall(plan: readonly PlanItem[], tool: string, call: unknown, result: unknown): PlanItem[] {
  const self = plan as PlanItem[]
  const input = asRecord(call)
  const output = asRecord(result)
  if (tool === 'TodoWrite') {
    if (!Array.isArray(input.todos)) return self
    return input.todos.map(asRecord).flatMap(t => (typeof t.content === 'string' && isStatus(t.status) ? [item(undefined, t.content, t.status, optional(t.activeForm))] : []))
  }
  if (tool === 'TaskCreate') {
    if (typeof input.subject !== 'string') return self
    return [...plan, item(optional(asRecord(output.task).id), input.subject, 'pending', optional(input.activeForm))]
  }
  if (tool === 'TaskUpdate') {
    if (typeof input.taskId !== 'string' || output.success === false) return self
    const at = plan.findIndex(p => p.id === input.taskId)
    if (at < 0) return self
    if (input.status === 'deleted') return plan.filter((_, i) => i !== at)
    const old = plan[at]!
    const next = item(old.id, optional(input.subject) ?? old.text, isStatus(input.status) ? input.status : old.status, optional(input.activeForm) ?? old.activeForm)
    return plan.map((p, i) => (i === at ? next : p))
  }
  if (tool === 'TaskList') {
    if (!Array.isArray(output.tasks)) return self
    // The list carries no active form: keep the one each task was created or updated with.
    return output.tasks.map(asRecord).flatMap(t => {
      const id = optional(t.id)
      if (id === undefined || typeof t.subject !== 'string' || !isStatus(t.status)) return []
      return [item(id, t.subject, t.status, plan.find(p => p.id === id)?.activeForm)]
    })
  }
  return self
}

export type PlanProgress = { done: number; total: number; filled: number; now: string | null }

/** How far the plan is, its bar's filled cells, and what runs now; null while nothing is open. */
export function planProgress(plan: readonly PlanItem[]): PlanProgress | null {
  if (!plan.some(p => p.status !== 'completed')) return null
  const done = plan.filter(p => p.status === 'completed').length
  const running = plan.find(p => p.status === 'in_progress')
  return { done, total: plan.length, filled: Math.round((done / plan.length) * BAR_CELLS), now: running === undefined ? null : (running.activeForm ?? running.text) }
}

const planBar = (filled: number) => ({ filled: '▰'.repeat(filled), empty: '▱'.repeat(BAR_CELLS - filled) })

/** 'Plan ▰▰▰▰▰▱▱▱▱▱ 1/2 · Now: Writing tests' in its colors: the word and the bar in the plan's, what runs now plain. */
export function planSegments(p: PlanProgress): Segment[] {
  const bar = planBar(p.filled)
  const segments: Segment[] = [
    { text: tr('Plan', 'Plano'), color: SCREEN.plan },
    { text: ' ' },
    { text: bar.filled, color: SCREEN.plan },
    { text: bar.empty, color: SCREEN.dim },
    { text: ` ${p.done}/${p.total}` },
  ]
  if (p.now !== null) segments.push({ text: tr(' · Now:', ' · Agora:'), color: SCREEN.dim }, { text: ` ${p.now}` })
  return segments
}
