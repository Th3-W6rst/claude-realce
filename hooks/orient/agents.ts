import { atom, read, update } from 'claude-code'
import type { AgentInfo, EngineInterface } from 'claude-code'

import type { AgentRow } from '../../types'

const AGENTS = atom({ plugin: 'realce', key: 'agents' } as const, [])

// The list says no start time: the first poll that sees an id stands in for it.
function rowsOf(list: readonly AgentInfo[], known: readonly AgentRow[], now: number): AgentRow[] {
  return list.map(a => ({
    id: a.id,
    type: a.type,
    description: a.description,
    status: a.status,
    firstSeenAt: known.find(k => k.id === a.id)?.firstSeenAt ?? now,
  }))
}

const sameRows = (a: readonly AgentRow[], b: readonly AgentRow[]) =>
  a.length === b.length && a.every((r, i) => JSON.stringify(r) === JSON.stringify(b[i]))

/** Mirrors `$.agent.list()` into `agents`, writing only on a change so its readers redraw only then. */
export async function refreshAgents($: EngineInterface): Promise<void> {
  try {
    const [list, now, known] = await Promise.all([$.agent.list(), $.clock.now(), read($, AGENTS)])
    if (sameRows(known, rowsOf(list, known, now))) return
    await update($, AGENTS, current => rowsOf(list, current, now))
  } catch (error) {
    // A timer has no dispatch to fail: the failure is reported, never swallowed.
    $.ui.log(`realce: agentes falhou: ${error instanceof Error ? error.message : String(error)}`)
  }
}
