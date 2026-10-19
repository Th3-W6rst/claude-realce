import { atom, read, update } from 'claude-code'
import type { EngineInterface, On } from 'claude-code'

const PANE_OPEN = atom({ plugin: 'realce', key: 'paneOpen' } as const, false)

export const SESSION_PANE = 'realce-sessao'

export async function openSessionPane($: EngineInterface): Promise<void> {
  await $.ui.open({ id: SESSION_PANE, title: 'Sessão' })
  await update($, PANE_OPEN, () => true)
}

/** Opens the session pane, or closes it when open; resolves whether it is open now. */
export async function toggleSessionPane($: EngineInterface): Promise<boolean> {
  if (await read($, PANE_OPEN)) {
    await $.ui.close({ id: SESSION_PANE })
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
