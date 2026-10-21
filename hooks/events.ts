import type { On } from 'claude-code'

import { codeAppend, codeSessionStart, queueTranscriptDiagrams } from './code/events'
import { registerRealceCommand } from './commands'
import { recordEnv } from './env'
import { startPerfLog } from './perf'
import { refreshPromptSection } from './prompt'
import { orientAppend, orientPromptSubmit, orientSessionStart, orientToolCall, orientTurnComplete, orientTurnStep } from './orient/events'
import { screenPromptSubmit, screenSessionStart, screenToolCall, screenTurnComplete, screenTurnStart } from './screen/events'
import { clearRunning, spinnerToolEnd, spinnerToolStart } from './screen/spinner'
import { takeDemo, welcomeHint } from './system/demo'
import { checkUpdate } from './system/update'
import { refreshLanguage } from './i18n'
import { retitleSessionPane } from './orient/paneToggle'
import { askPromptSubmit, askTurnEnd } from './orient/ask'
import { refreshTheme } from './theme'
import { guard } from './safe'

// The engine takes one hook per event without a matcher in a module, and follows $ only into declared
// functions: each shared event is hooked once here and calls, by name, the handler of every area that listens.

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
    await guard($, 'prompt.submit (screen)', () => screenPromptSubmit($, e))
    await guard($, 'prompt.submit (guide)', () => orientPromptSubmit($, e))
    const result = await next(e)
    askPromptSubmit(e, result)
    return result
  })

  on('tool.call', async ($, e, next) => {
    await guard($, 'tool.call (spinner)', () => spinnerToolStart($, e))
    let result: Awaited<ReturnType<typeof next>>
    try {
      result = await next(e)
    } finally {
      await guard($, 'tool.call (spinner)', () => spinnerToolEnd($, e))
    }
    await guard($, 'tool.call (screen)', () => screenToolCall($, e, result))
    await guard($, 'tool.call (guide)', () => orientToolCall($, e, result))
    return result
  })

  on('turn.complete', async ($, e, next) => {
    let result: Awaited<ReturnType<typeof next>>
    try {
      result = await next(e)
    } finally {
      askTurnEnd(e)
    }
    await guard($, 'turn.complete (screen)', () => screenTurnComplete($, e))
    await guard($, 'turn.complete (spinner)', () => clearRunning($, e.agentId))
    await guard($, 'turn.complete (guide)', () => orientTurnComplete($, e))
    return result
  })

  on('session.append', async ($, e, next) => {
    const stored = await next(e)
    await guard($, 'session.append (code)', () => codeAppend($, e, stored))
    await guard($, 'session.append (guide)', () => orientAppend($, e, stored))
    return stored
  })

  // A main turn's first step: its stats open if no prompt.submit did, then the demo, when armed, answers it.
  on('turn.step', async function* ($, e, next) {
    await guard($, 'turn.step (screen)', () => screenTurnStart($, e))
    orientTurnStep(e)
    // Only a turn's first step: a prompt that joined a running turn must not cut that turn's work short.
    const text = e.agentId === undefined && e.index === 0 ? takeDemo() : null
    if (text === null) return yield* next(e)
    yield { kind: 'text' as const, index: 0, text }
    yield { kind: 'stop' as const, stopReason: 'end_turn' as const, usage: null }
    return { turnId: e.turnId, index: e.index, answer: text, toolUses: [], stopReason: 'end_turn' as const, usage: null }
  })
}
