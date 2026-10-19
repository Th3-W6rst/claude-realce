import type { PlanItem } from '../../types'

export type { PlanItem }

type Status = PlanItem['status']

const BAR_CELLS = 10
const STATUSES: readonly Status[] = ['pending', 'in_progress', 'completed']

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null
const isStatus = (v: unknown): v is Status => STATUSES.includes(v as Status)
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)

function item(id: string | undefined, text: string, status: Status, activeForm: string | undefined): PlanItem {
  return { ...(id !== undefined ? { id } : {}), text, status, ...(activeForm !== undefined ? { activeForm } : {}) }
}

/**
 * The plan after one call of a plan tool: TodoWrite replaces it, TaskCreate appends (its id from the result),
 * TaskUpdate edits or (`deleted`) removes, TaskList resyncs. Any other call, or a shape not recognized, returns
 * `plan` itself, so the caller can tell nothing changed.
 */
export function applyPlanCall(plan: readonly PlanItem[], tool: string, input: unknown, result: unknown): PlanItem[] {
  const self = plan as PlanItem[]
  if (!isRecord(input)) return self
  if (tool === 'TodoWrite') {
    if (!Array.isArray(input.todos)) return self
    return input.todos.filter(isRecord).flatMap(t => (typeof t.content === 'string' && isStatus(t.status) ? [item(undefined, t.content, t.status, str(t.activeForm))] : []))
  }
  if (tool === 'TaskCreate') {
    if (typeof input.subject !== 'string') return self
    const id = isRecord(result) && isRecord(result.task) ? str(result.task.id) : undefined
    return [...plan, item(id, input.subject, 'pending', str(input.activeForm))]
  }
  if (tool === 'TaskUpdate') {
    if (typeof input.taskId !== 'string' || (isRecord(result) && result.success === false)) return self
    const at = plan.findIndex(p => p.id === input.taskId)
    if (at < 0) return self
    if (input.status === 'deleted') return plan.filter((_, i) => i !== at)
    const old = plan[at]!
    const next = item(old.id, str(input.subject) ?? old.text, isStatus(input.status) ? input.status : old.status, str(input.activeForm) ?? old.activeForm)
    return plan.map((p, i) => (i === at ? next : p))
  }
  if (tool === 'TaskList') {
    if (!isRecord(result) || !Array.isArray(result.tasks)) return self
    // The list carries no active form: keep the one each task was created or updated with.
    return result.tasks.filter(isRecord).flatMap(t => {
      const id = str(t.id)
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

export const planBar = (filled: number) => ({ filled: '▰'.repeat(filled), empty: '▱'.repeat(BAR_CELLS - filled) })

/** 'Plano ▰▰▰▰▰▱▱▱▱▱ 1/2 · Agora: Escrevendo testes'; null while nothing is open. */
export function planRow(plan: readonly PlanItem[]): string | null {
  const p = planProgress(plan)
  if (p === null) return null
  const bar = planBar(p.filled)
  const row = `Plano ${bar.filled}${bar.empty} ${p.done}/${p.total}`
  return p.now === null ? row : `${row} · Agora: ${p.now}`
}
