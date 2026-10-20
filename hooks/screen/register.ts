import type { On } from 'claude-code'

import { registerAgentCard } from './agentCard'
import { registerDiff } from './diff'
import { registerSpinner } from './spinner'
import { registerTools } from './tools'
import { registerTurns } from './turns'

/** The screen area's hooks with a matcher (drawings, its own events); shared events go through screen/events.ts. */
export function registerScreen(on: On): void {
  registerTools(on)
  registerDiff(on)
  registerTurns(on)
  registerAgentCard(on)
  registerSpinner(on)
}
