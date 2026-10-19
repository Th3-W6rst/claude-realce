import type { On } from 'claude-code'

import { registerBand } from './band'
import { registerSessionPane } from './sessionPane'

/** The orient area's hooks with a matcher (drawings, its own events); shared events go through orient/events.ts. */
export function registerOrient(on: On): void {
  registerBand(on)
  registerSessionPane(on)
}
