import { atom, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { PaneTab } from '../../../types'
import { openSessionPane } from '../paneToggle'

const TAB = atom({ plugin: 'realce', key: 'tab' } as const, 'overview')

export async function setTab($: EngineInterface, tab: PaneTab): Promise<void> {
  await update($, TAB, current => (current === tab ? current : tab))
}

/** The session pane open on its Agent tab; `focus` hands it the keyboard, for a question typed next. */
export async function showAgentTab($: EngineInterface, focus = false): Promise<void> {
  await setTab($, 'agent')
  await openSessionPane($, focus)
}
