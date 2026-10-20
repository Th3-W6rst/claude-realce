import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { Explanation } from '../../types'

// What the mod learned about single calls (a commit's card, a failure's sentence), by tool_use_id. The state keeps
// them past a reload; the drawings read the module's copy, so a scroll costs no trip to the engine, and a new note
// redraws the screen once.

const EXPLANATIONS = atom({ plugin: 'realce', key: 'explanations' } as const, {})
const COMMITS = atom({ plugin: 'realce', key: 'commits' } as const, {})

const MAX_KEPT = 200

const explanations = new Map<string, Explanation>()
const commits = new Map<string, string>()

/** The newest `MAX_KEPT` entries, in the order they came. */
function keepNewest<V>(record: Record<string, V>): Record<string, V> {
  const entries = Object.entries(record)
  return entries.length <= MAX_KEPT ? record : Object.fromEntries(entries.slice(-MAX_KEPT))
}

export const explanationFor = (toolUseId: string): Explanation | null => explanations.get(toolUseId) ?? null
export const commitFor = (toolUseId: string): string | null => commits.get(toolUseId) ?? null

/**
 * At each load: the notes back from the state. A sentence the model was still writing when the module reloaded
 * will never arrive; it says so instead of "Explicando…" for good.
 */
export async function loadNotes($: EngineInterface): Promise<void> {
  const stored = await read($, EXPLANATIONS)
  const cut = Object.entries(stored).filter(([, x]) => x.status === 'pending')
  for (const [id, x] of Object.entries(stored)) explanations.set(id, x)
  for (const [id, c] of Object.entries(await read($, COMMITS))) commits.set(id, c)
  if (cut.length === 0) return
  const failed: Explanation = { status: 'failed', reason: 'interrompida ao recarregar o mod' }
  for (const [id] of cut) explanations.set(id, failed)
  await update($, EXPLANATIONS, all => ({ ...all, ...Object.fromEntries(cut.map(([id]) => [id, failed])) }))
}

export async function setExplanation($: EngineInterface, toolUseId: string, explanation: Explanation): Promise<void> {
  explanations.set(toolUseId, explanation)
  await update($, EXPLANATIONS, all => keepNewest({ ...all, [toolUseId]: explanation }))
  $.ui.invalidate('ui.render')
}

export async function setCommit($: EngineInterface, toolUseId: string, card: string): Promise<void> {
  commits.set(toolUseId, card)
  await update($, COMMITS, all => keepNewest({ ...all, [toolUseId]: card }))
  $.ui.invalidate('ui.render')
}
