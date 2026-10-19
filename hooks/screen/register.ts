import type { On } from 'claude-code'

import { registerSpinner } from './spinner'
import { registerTools } from './tools'
import { registerTurns } from './turns'
import { registerUserMessage } from './userMessage'

/** The screen area's hooks with a matcher (drawings, its own events); shared events go through screen/events.ts. */
export function registerScreen(on: On): void {
  registerTools(on)
  registerTurns(on)
  registerUserMessage(on)
  registerSpinner(on)
}
