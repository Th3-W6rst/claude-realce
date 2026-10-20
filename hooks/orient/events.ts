import { atom, read, update } from 'claude-code'
import type { Args, EngineInterface, ResultOf } from 'claude-code'

import { getFlags } from '../flags'
import { refreshAgents } from './agents'
import { noteInput, noteTurnEnd } from './away'
import { noteTurnStart, notifyFinish } from './notify'
import { notePinnable } from './pins'
import { completeTimeline, recordPrompt } from './timeline'
import { openSessionPane } from './paneToggle'
import { extractPending } from './pending'
import { applyPlanCall } from './plan'

// The orient area's share of the session's shared events. hooks/events.ts calls each by name (the engine follows $
// only into declared functions), so these five names stay; a body left empty means the area does not listen.

const PENDING = atom({ plugin: 'realce', key: 'pending' } as const, null)
const PLAN = atom({ plugin: 'realce', key: 'plan' } as const, [])

const PLAN_TOOLS: readonly string[] = ['TodoWrite', 'TaskCreate', 'TaskUpdate', 'TaskList']
const AGENTS_POLL_MS = 2000

export async function orientSessionStart($: EngineInterface, e: Args<'session.start'>): Promise<void> {
  // Timers die with the module: each load starts its own poll. The pane reads agents whatever the flags say.
  $.clock.every(AGENTS_POLL_MS, () => void refreshAgents($))
  const flags = await getFlags($)
  // On by default, so a -p run or the SDK would hold a pane nobody can see.
  if (flags.painel && e.isInteractive) await openSessionPane($)
}

export async function orientPromptSubmit($: EngineInterface, e: Args<'prompt.submit'>): Promise<void> {
  // Only the person's own prompt answers what the band asked; cleared whatever pendencias says, so turning it on
  // later never shows a stale ask.
  if (e.isMeta !== true && (await read($, PENDING)) !== null) await update($, PENDING, () => null)
  await noteTurnStart($, e)
  await noteInput($, e)
}

/** After the call settled; subagents' calls too (`e.agentId`). */
export async function orientToolCall($: EngineInterface, e: Args<'tool.call'>, result: ResultOf['tool.call']): Promise<void> {
  if (e.agentId !== undefined || !PLAN_TOOLS.includes(e.tool)) return
  if (result.deny !== undefined || result.isError === true) return
  const flags = await getFlags($)
  if (!flags.plano) return
  await update($, PLAN, plan => applyPlanCall(plan, e.tool, e, result.result))
}

/** The main loop's turns and subagents' (`e.agentId`). */
export async function orientTurnComplete($: EngineInterface, e: Args<'turn.complete'>): Promise<void> {
  if (e.agentId !== undefined) return
  await notifyFinish($, e)
  await noteTurnEnd($, e)
  await completeTimeline($, e)
  const flags = await getFlags($)
  if (!flags.pendencias) return
  const items = extractPending(e.answer)
  await update($, PENDING, () => (items.length === 0 ? null : { items, turnId: e.turnId }))
}

/** Once the row is stored. */
export async function orientAppend($: EngineInterface, e: Args<'session.append'>, stored: ResultOf['session.append']): Promise<void> {
  await recordPrompt($, e, stored)
  await notePinnable($, e, stored)
}
