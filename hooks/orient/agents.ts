import { atom, read, update } from 'claude-code'
import type { AgentInfo, EngineInterface } from 'claude-code'

import type { AgentRow } from '../../types'
import { getFlags } from '../flags'
import { listAgents } from '../io'
import { isSessionPaneOpen } from './paneToggle'
import { guard } from '../safe'

const AGENTS = atom({ plugin: 'realce', key: 'agents' } as const, [])

// The list says no start time: the first poll that sees an id stands in for it.
function agentRows(list: readonly AgentInfo[], known: readonly AgentRow[], now: number): AgentRow[] {
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
  // A timer has no dispatch to fail: the failure is reported, never swallowed.
  await guard($, 'agents', async () => {
    // The cards and the pane read the agents (the pane whatever the flags say): with neither, the poll rests.
    if (!(await getFlags($)).agentes && !isSessionPaneOpen()) return
    const [list, now, known] = await Promise.all([listAgents($), $.clock.now(), read($, AGENTS)])
    if (sameRows(known, agentRows(list, known, now))) return
    await update($, AGENTS, current => agentRows(list, current, now))
  })
}
