import { atom, read, update } from 'claude-code'
import type { EngineInterface, On } from 'claude-code'

import { tr } from '../i18n'
import { closePane, openPane } from '../io'

const PANE_OPEN = atom({ plugin: 'realce', key: 'paneOpen' } as const, false)

// The id predates the English names and stays: a pane open across a reload keeps its id.
export const SESSION_PANE = 'realce-sessao'

// The state's copy, for the agents' poll: a read every two seconds would be a trip to the engine each time.
let isOpen = false
// Opened unasked below 144 columns, the pane waits undrawn: the person's toggle then opens it rather than close it.
let isPlaced = true

export const isSessionPaneOpen = () => isOpen

/** At each load: whether the pane was left open, from the state. */
export async function loadPaneOpen($: EngineInterface): Promise<void> {
  isOpen = await read($, PANE_OPEN)
}

export async function openSessionPane($: EngineInterface, focus = false): Promise<void> {
  isPlaced = (await openPane($, { id: SESSION_PANE, title: tr('Session', 'Sessão'), ...(focus ? { focus: true } : {}) })).isPlaced
  isOpen = true
  await update($, PANE_OPEN, () => true)
}

/** The language changed: an open session pane takes its title in the new one (the title is set when it opens). */
export async function retitleSessionPane($: EngineInterface): Promise<void> {
  if (await read($, PANE_OPEN)) await openPane($, { id: SESSION_PANE, title: tr('Session', 'Sessão') })
}

/** Opens the session pane, or closes it when open; resolves whether it is open now. */
export async function toggleSessionPane($: EngineInterface): Promise<boolean> {
  if (isPlaced && (await read($, PANE_OPEN))) {
    await closePane($, { id: SESSION_PANE })
    return false
  }
  await openSessionPane($)
  return true
}

export function registerPaneToggle(on: On): void {
  // However the pane closes (the person's mark, Esc, this mod), the next toggle opens it again.
  on('ui.close', { id: SESSION_PANE }, async ($, e, next) => {
    const closed = await next(e)
    isOpen = false
    await update($, PANE_OPEN, () => false)
    return closed
  })
}
