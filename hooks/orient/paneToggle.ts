import { atom, read, update } from 'claude-code'
import type { EngineInterface, On } from 'claude-code'

import { tr } from '../i18n'
import { closePane, openPane, panes } from '../io'

const PANE_OPEN = atom({ plugin: 'realce', key: 'paneOpen' } as const, false)
// Held for the session, across reloads: the pane opens by itself once, at the session's first load.
const AUTO_OPENED = atom({ plugin: 'realce', key: 'paneAutoOpened' } as const, false)

// The id predates the English names and stays: a pane open across a reload keeps its id.
export const SESSION_PANE = 'realce-sessao'

// The state's copy, for the agents' poll: a read every two seconds would be a trip to the engine each time.
let isOpen = false

export const isSessionPaneOpen = () => isOpen

/** At each load: whether the pane was left open, from the state. */
export async function loadPaneOpen($: EngineInterface): Promise<void> {
  isOpen = await read($, PANE_OPEN)
}

export async function openSessionPane($: EngineInterface, focus = false): Promise<void> {
  await openPane($, { id: SESSION_PANE, title: tr('Session', 'Sessão'), ...(focus ? { focus: true } : {}) })
  isOpen = true
  await update($, PANE_OPEN, () => true)
}

/** The language changed: an open session pane takes its title in the new one (the title is set when it opens). */
export async function retitleSessionPane($: EngineInterface): Promise<void> {
  if (await read($, PANE_OPEN)) await openPane($, { id: SESSION_PANE, title: tr('Session', 'Sessão') })
}

/** The session's first load opens the pane by itself; a later load (a reload, an enable) leaves it as the person did. */
export async function autoOpenSessionPane($: EngineInterface): Promise<void> {
  if (await read($, AUTO_OPENED)) return
  await update($, AUTO_OPENED, () => true)
  await openSessionPane($)
}

/** Opens the session pane, or closes it when drawn; resolves whether it is open now. */
export async function toggleSessionPane($: EngineInterface): Promise<boolean> {
  // The engine's word, not a copy: a pane opened unasked in a narrow terminal waits undrawn (the toggle opens it), and
  // is drawn without a word to the mod once the terminal widens (the toggle closes it).
  if ((await panes($)).some(p => p.id === SESSION_PANE && p.isPlaced)) {
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
