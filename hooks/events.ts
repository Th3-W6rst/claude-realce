import type { EngineInterface, On } from 'claude-code'

import { codeAppend, codePromptSubmit, codeSessionStart, codeToolCall, codeTurnComplete, queueTranscriptDiagrams } from './code/events'
import { registerRealceCommand } from './commands'
import { recordEnv } from './env'
import { startPerfLog } from './perf'
import { refreshPromptSection } from './prompt'
import { orientAppend, orientPromptSubmit, orientSessionStart, orientToolCall, orientTurnComplete } from './orient/events'
import { screenAppend, screenPromptSubmit, screenSessionStart, screenToolCall, screenTurnComplete } from './screen/events'
import { clearRunning, spinnerToolEnd, spinnerToolStart } from './screen/spinner'
import { welcomeHint } from './system/demo'
import { checkUpdate } from './system/update'
import { refreshLanguage } from './i18n'
import { retitleSessionPane } from './orient/paneToggle'
import { refreshTheme } from './theme'
import { logLine } from './io'

// The engine takes one hook per event without a matcher in a module, and follows $ only into declared
// functions: each shared event is hooked once here and calls every area's handler by name.

/** One area failing must not cost the others, nor the event itself: the failure is reported, never swallowed. */
async function guard($: EngineInterface, event: string, run: () => Promise<void>): Promise<void> {
  try {
    await run()
  } catch (error) {
    logLine($, `realce: ${event} failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}

export function registerEvents(on: On): void {
  on('session.start', async ($, e, next) => {
    // First: every drawing after this one paints in the person's theme.
    await guard($, 'session.start (theme)', () => refreshTheme($))
    // Before the command registers: its description speaks the language.
    await guard($, 'session.start (language)', async () => void (await refreshLanguage($)))
    await guard($, 'session.start (env)', () => recordEnv($, e))
    await guard($, 'session.start (command)', () => registerRealceCommand($))
    await guard($, 'session.start (prompt)', async () => refreshPromptSection($))
    await guard($, 'session.start (perf)', () => startPerfLog($))
    await guard($, 'session.start (code)', () => codeSessionStart($, e))
    await guard($, 'session.start (screen)', () => screenSessionStart($, e))
    await guard($, 'session.start (spinner)', () => clearRunning($))
    await guard($, 'session.start (guide)', () => orientSessionStart($, e))
    await guard($, 'session.start (welcome)', () => welcomeHint($, e))
    await guard($, 'session.start (updates)', () => checkUpdate($, e))
    return next(e)
  })

  // The theme picked in /config (or by a plugin): repaint, and draw the transcript's diagrams in it.
  on('config.set', { key: 'theme' }, async ($, e, next) => {
    const result = await next(e)
    if (result.deny === undefined && typeof result.value === 'string') {
      const value = result.value
      await guard($, 'config.set (theme)', () => refreshTheme($, value))
      await guard($, 'config.set (diagrams)', () => queueTranscriptDiagrams($))
    }
    return result
  })

  on('config.set', { key: 'language' }, async ($, e, next) => {
    const result = await next(e)
    if (result.deny === undefined) {
      const value = result.value
      await guard($, 'config.set (language)', async () => {
        if (!(await refreshLanguage($, value))) return
        await registerRealceCommand($)
        await retitleSessionPane($)
      })
    }
    return result
  })

  on('prompt.submit', async ($, e, next) => {
    await guard($, 'prompt.submit (code)', () => codePromptSubmit($, e))
    await guard($, 'prompt.submit (screen)', () => screenPromptSubmit($, e))
    await guard($, 'prompt.submit (guide)', () => orientPromptSubmit($, e))
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    await guard($, 'tool.call (spinner)', () => spinnerToolStart($, e))
    let result: Awaited<ReturnType<typeof next>>
    try {
      result = await next(e)
    } finally {
      await guard($, 'tool.call (spinner)', () => spinnerToolEnd($, e))
    }
    await guard($, 'tool.call (code)', () => codeToolCall($, e, result))
    await guard($, 'tool.call (screen)', () => screenToolCall($, e, result))
    await guard($, 'tool.call (guide)', () => orientToolCall($, e, result))
    return result
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    await guard($, 'turn.complete (code)', () => codeTurnComplete($, e))
    await guard($, 'turn.complete (screen)', () => screenTurnComplete($, e))
    await guard($, 'turn.complete (spinner)', () => clearRunning($, e.agentId))
    await guard($, 'turn.complete (guide)', () => orientTurnComplete($, e))
    return result
  })

  on('session.append', async ($, e, next) => {
    const stored = await next(e)
    await guard($, 'session.append (code)', () => codeAppend($, e, stored))
    await guard($, 'session.append (screen)', () => screenAppend($, e, stored))
    await guard($, 'session.append (guide)', () => orientAppend($, e, stored))
    return stored
  })
}
