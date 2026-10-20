import { atom, read, update } from 'claude-code'
import type { EngineInterface, On } from 'claude-code'

import { tr } from '../i18n'
import { closePane, openPane } from '../io'

const PANE_OPEN = atom({ plugin: 'realce', key: 'paneOpen' } as const, false)

export const SESSION_PANE = 'realce-sessao'

export async function openSessionPane($: EngineInterface): Promise<void> {
  await openPane($, { id: SESSION_PANE, title: tr('Session', 'Sessão') })
  await update($, PANE_OPEN, () => true)
}

/** The language changed: an open session pane takes its title in the new one (the title is set when it opens). */
export async function retitleSessionPane($: EngineInterface): Promise<void> {
  if (await read($, PANE_OPEN)) await openPane($, { id: SESSION_PANE, title: tr('Session', 'Sessão') })
}

/** Opens the session pane, or closes it when open; resolves whether it is open now. */
export async function toggleSessionPane($: EngineInterface): Promise<boolean> {
  if (await read($, PANE_OPEN)) {
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
    await update($, PANE_OPEN, () => false)
    return closed
  })
}
