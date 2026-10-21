import type { Args, EngineInterface, On } from 'claude-code'

import type { TurnStats } from '../../types'
import { getFlags } from '../flags'
import { formatDuration } from '../format'
import { tr } from '../i18n'
import { sealLabel, testsLabel, turnStatsFor } from '../screen/turns'
import { asRecord, errorText, failedRun, guard, str } from '../safe'
import { detach, exec, logLine, notify } from '../io'

// Past this the person has likely looked away: the engine says nothing about the window's focus.
const LONG_MS = 60_000

const SOUNDS = { done: '/System/Library/Sounds/Glass.aiff', question: '/System/Library/Sounds/Ping.aiff' } as const

let turnStartedAt: number | null = null
let lastFailure: string | null = null
let wasBanner = false

export const lastNotifyFailure = () => lastFailure

/** True when the last notice went out as the macOS banner, the terminal giving Claude Code no channel. */
export const lastNotifyWasBanner = () => wasBanner

/** '6m 25s · ✔ tests · ✔ proved': what the finished turn did, the parts it has. */
function finishText(durationMs: number, stats: TurnStats | null): string {
  const parts = [formatDuration(durationMs)]
  if (stats !== null) {
    const tests = testsLabel(stats)
    if (tests !== null) parts.push(tests.text)
    const seal = sealLabel(stats.seal)
    if (seal !== null) parts.push(seal.text)
  }
  return parts.join(' · ')
}

/** A main-loop prompt starts the clock a question is measured against. */
export async function noteTurnStart($: EngineInterface, e: Args<'prompt.submit'>): Promise<void> {
  if (e.turnId !== undefined || e.isMeta === true) return
  turnStartedAt = await $.clock.now()
}

async function playSound($: EngineInterface, file: string): Promise<void> {
  try {
    const run = await exec($, ['afplay', file])
    if (run.exitCode !== 0) logLine($, `realce: the sound did not play (${failedRun(run, 'afplay')})`)
  } catch (error) {
    logLine($, `realce: the sound did not play (${errorText(error)})`)
  }
}

/** The system's own banner, text and title as arguments (no AppleScript quoting); the reason when it fails. */
async function systemBanner($: EngineInterface, text: string, title: string): Promise<string | null> {
  try {
    // `--` ends osascript's options: a text that starts with a dash is still the text.
    const run = await exec(
      $,
      ['osascript', '-e', 'on run argv', '-e', 'display notification (item 1 of argv) with title (item 2 of argv)', '-e', 'end run', '--', text, title],
      { timeoutMs: 5000 },
    )
    return run.exitCode === 0 ? null : run.stderr.trim() || tr(`osascript exited with ${run.exitCode}`, `osascript saiu com ${run.exitCode}`)
  } catch (error) {
    return errorText(error)
  }
}

async function bannerInstead($: EngineInterface, text: string, title: string, reason: string): Promise<void> {
  const failed = await systemBanner($, text, title)
  wasBanner = failed === null
  lastFailure = failed === null ? null : tr(`${reason}; macOS banner: ${failed}`, `${reason}; banner do macOS: ${failed}`)
}

async function send($: EngineInterface, text: string, title: string, sound: string): Promise<void> {
  const result = await notify($, text, { title })
  wasBanner = false
  lastFailure = result.isSent ? null : result.reason
  // A terminal that gives Claude Code no channel (tmux, Terminal.app) still has the system's banner. A notice the
  // person turned off ('disabled') or a hook refused stays unsent.
  // Off the dispatch: a question's dialog never waits on osascript.
  if (!result.isSent && result.reason.startsWith('no-channel')) detach($, () => void bannerInstead($, text, title, result.reason))
  // afplay lasts as long as the sound: off the event's dispatch.
  if ((await getFlags($)).som) detach($, () => void playSound($, sound))
}

/** After screen's turn.complete has recorded the turn's stats. */
export async function notifyFinish($: EngineInterface, e: Args<'turn.complete'>): Promise<void> {
  if (e.agentId !== undefined || e.isAborted || e.durationMs < LONG_MS) return
  if (!(await getFlags($)).avisos) return
  await send($, finishText(e.durationMs, turnStatsFor(e.durationMs)), tr('Claude is done', 'Claude terminou'), SOUNDS.done)
}

export function registerNotify(on: On): void {
  // The question is up while next(e) runs: the notice goes before it.
  on('tool.call', { tool: 'AskUserQuestion' }, async ($, e, next) => {
    // The question is the person's: a notice that failed is said, and the dialog opens all the same.
    await guard($, 'the question notice', async () => {
      if (e.agentId === undefined && turnStartedAt !== null && (await getFlags($)).avisos && (await $.clock.now()) - turnStartedAt >= LONG_MS) {
        const first = asRecord(Array.isArray(e.questions) ? e.questions[0] : undefined)
        await send($, str(first.question) ?? tr('Claude has a question.', 'O Claude tem uma pergunta.'), tr('Claude needs you', 'Claude precisa de você'), SOUNDS.question)
      }
    })
    return next(e)
  })
}
