import type { EngineInterface, On } from 'claude-code'

import { codeAppend, codePromptSubmit, codeSessionStart, codeToolCall, codeTurnComplete, queueTranscriptDiagrams } from './code/events'
import { registerRealceCommand } from './commands'
import { recordEnv } from './env'
import { startPerfLog } from './perf'
import { refreshPromptSection } from './prompt'
import { orientAppend, orientPromptSubmit, orientSessionStart, orientToolCall, orientTurnComplete } from './orient/events'
import { screenAppend, screenPromptSubmit, screenSessionStart, screenToolCall, screenTurnComplete } from './screen/events'
import { welcomeHint } from './system/demo'
import { checkUpdate } from './system/update'
import { refreshTheme } from './theme'

// The engine takes one hook per event without a matcher in a module, and follows $ only into declared
// functions: each shared event is hooked once here and calls every area's handler by name.

/** One area failing must not cost the others, nor the event itself: the failure is reported, never swallowed. */
async function guard($: EngineInterface, event: string, run: () => Promise<void>): Promise<void> {
  try {
    await run()
  } catch (error) {
    $.ui.log(`realce: ${event} falhou: ${error instanceof Error ? error.message : String(error)}`)
  }
}

export function registerEvents(on: On): void {
  on('session.start', async ($, e, next) => {
    // First: every drawing after this one paints in the person's theme.
    await guard($, 'session.start (tema)', () => refreshTheme($))
    await guard($, 'session.start (ambiente)', () => recordEnv($, e))
    await guard($, 'session.start (comando)', () => registerRealceCommand($))
    await guard($, 'session.start (prompt)', async () => refreshPromptSection($))
    await guard($, 'session.start (medição)', () => startPerfLog($))
    await guard($, 'session.start (código)', () => codeSessionStart($, e))
    await guard($, 'session.start (tela)', () => screenSessionStart($, e))
    await guard($, 'session.start (orientação)', () => orientSessionStart($, e))
    await guard($, 'session.start (boas-vindas)', () => welcomeHint($, e))
    await guard($, 'session.start (atualização)', () => checkUpdate($, e))
    return next(e)
  })

  // The theme picked in /config (or by a plugin): repaint, and draw the transcript's diagrams in it.
  on('config.set', { key: 'theme' }, async ($, e, next) => {
    const result = await next(e)
    if (result.deny === undefined && typeof result.value === 'string') {
      const value = result.value
      await guard($, 'config.set (tema)', () => refreshTheme($, value))
      await guard($, 'config.set (diagramas)', () => queueTranscriptDiagrams($))
    }
    return result
  })

  on('prompt.submit', async ($, e, next) => {
    await guard($, 'prompt.submit (código)', () => codePromptSubmit($, e))
    await guard($, 'prompt.submit (tela)', () => screenPromptSubmit($, e))
    await guard($, 'prompt.submit (orientação)', () => orientPromptSubmit($, e))
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const result = await next(e)
    await guard($, 'tool.call (código)', () => codeToolCall($, e, result))
    await guard($, 'tool.call (tela)', () => screenToolCall($, e, result))
    await guard($, 'tool.call (orientação)', () => orientToolCall($, e, result))
    return result
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    await guard($, 'turn.complete (código)', () => codeTurnComplete($, e))
    await guard($, 'turn.complete (tela)', () => screenTurnComplete($, e))
    await guard($, 'turn.complete (orientação)', () => orientTurnComplete($, e))
    return result
  })

  on('session.append', async ($, e, next) => {
    const stored = await next(e)
    await guard($, 'session.append (código)', () => codeAppend($, e, stored))
    await guard($, 'session.append (tela)', () => screenAppend($, e, stored))
    await guard($, 'session.append (orientação)', () => orientAppend($, e, stored))
    return stored
  })
}
