import type { On } from 'claude-code'

import { registerReader } from './ask'
import { registerAway } from './away'
import { registerBand } from './band'
import { registerFlagsPane } from './flagsPane'
import { registerLimits } from './limits'
import { registerNotify } from './notify'
import { registerPaneToggle } from './paneToggle'
import { registerQuestion } from './question'
import { registerSessionPane } from './pane'

/** The orient area's hooks with a matcher (drawings, its own events); shared events go through orient/events.ts. */
export function registerOrient(on: On): void {
  registerBand(on)
  registerSessionPane(on)
  registerNotify(on)
  registerAway(on)
  registerQuestion(on)
  registerLimits(on)
  registerFlagsPane(on)
  registerPaneToggle(on)
  registerReader(on)
}
