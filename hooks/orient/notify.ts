import type { Args, EngineInterface, On } from 'claude-code'

import type { TurnStats } from '../../types'
import { getFlags } from '../flags'
import { formatDuration } from '../format'
import { sealLabel, testsLabel, turnStatsFor } from '../screen/turns'
import { asRecord, str } from '../screen/toolInfo'

// Past this the person has likely looked away: the engine says nothing about the window's focus.
const LONG_MS = 60_000

const SOUNDS = { done: '/System/Library/Sounds/Glass.aiff', question: '/System/Library/Sounds/Ping.aiff' } as const

let turnStartedAt: number | null = null
let lastFailure: string | null = null

export const lastNotifyFailure = () => lastFailure

/** '6m 25s · ✔ testes · ✔ provado': what the finished turn did, the parts it has. */
export function finishText(durationMs: number, stats: TurnStats | null): string {
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
    const run = await $.process.run(['afplay', file])
    if (run.exitCode !== 0) $.ui.log(`realce: som não tocou (${run.stderr.trim() || `afplay saiu com ${run.exitCode}`})`)
  } catch (error) {
    $.ui.log(`realce: som não tocou (${error instanceof Error ? error.message : String(error)})`)
  }
}

async function send($: EngineInterface, text: string, title: string, sound: string): Promise<void> {
  const result = await $.ui.notify(text, { title })
  lastFailure = result.isSent ? null : result.reason
  // afplay lasts as long as the sound: off the event's dispatch.
  if ((await getFlags($)).som) $.clock.after(0, () => void playSound($, sound))
}

/** After screen's turn.complete has recorded the turn's stats. */
export async function notifyFinish($: EngineInterface, e: Args<'turn.complete'>): Promise<void> {
  if (e.agentId !== undefined || e.isAborted || e.durationMs < LONG_MS) return
  if (!(await getFlags($)).avisos) return
  await send($, finishText(e.durationMs, turnStatsFor(e.durationMs)), 'Claude terminou', SOUNDS.done)
}

export function registerNotify(on: On): void {
  // The question is up while next(e) runs: the notice goes before it.
  on('tool.call', { tool: 'AskUserQuestion' }, async ($, e, next) => {
    if (e.agentId === undefined && turnStartedAt !== null && (await getFlags($)).avisos && (await $.clock.now()) - turnStartedAt >= LONG_MS) {
      const first = asRecord(Array.isArray(e.questions) ? e.questions[0] : undefined)
      await send($, str(first.question) ?? 'O Claude tem uma pergunta.', 'Claude precisa de você', SOUNDS.question)
    }
    return next(e)
  })
}
