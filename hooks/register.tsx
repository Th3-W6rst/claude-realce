import type { Register } from 'claude-code'

import { registerCode } from './code/register'
import { registerCommands } from './commands'
import { registerEvents } from './events'
import { registerFlagsPane } from './orient/flagsPane'
import { registerPaneToggle } from './orient/paneToggle'
import { registerOrient } from './orient/register'
import { registerPrompt } from './prompt'
import { registerScreen } from './screen/register'
import { registerText } from './text/register'

// Shared events are hooked once in events.ts; each area hooks its own drawings. Every feature asks its flag first.
export const register: Register = on => {
  registerEvents(on)
  registerCommands(on)
  registerPrompt(on)
  registerFlagsPane(on)
  registerPaneToggle(on)
  registerText(on)
  registerCode(on)
  registerScreen(on)
  registerOrient(on)
}
