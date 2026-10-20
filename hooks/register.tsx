import type { Register } from 'claude-code'

import { registerCommands } from './commands'
import { registerEvents } from './events'
import { registerOrient } from './orient/register'
import { registerPrompt } from './prompt'
import { registerScreen } from './screen/register'
import { registerText } from './text/register'

// Shared events are hooked once in events.ts; each area hooks its own drawings. Every feature asks its flag first.
export const register: Register = on => {
  registerEvents(on)
  registerCommands(on)
  registerPrompt(on)
  registerText(on)
  registerScreen(on)
  registerOrient(on)
}
