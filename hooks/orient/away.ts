import { atom, read, update } from 'claude-code'
import type { Args, EngineInterface, On } from 'claude-code'

import type { AwaySummary, TurnStats } from '../../types'
import { getFlags } from '../flags'
import { plural, scoreText } from '../format'
import { sealLabel, turnStatsFor } from '../screen/turns'
import { tr } from '../i18n'

const AWAY = atom({ plugin: 'realce', key: 'away' } as const, null)
const PENDING = atom({ plugin: 'realce', key: 'pending' } as const, null)

const AWAY_MS = 10 * 60_000

// Kept in the module: a keystroke must cost nothing until a turn has ended since the person's last input.
let lastInputAt: number | null = null
let endedSince: TurnStats[] = []
// A keystroke while no turn has ended yet: the person was there, at a time not worth a clock read per key.
let hasTypedSince = false

/** What happened while the person was away: null below ten minutes, or when no turn ended meanwhile. */
export function awaySummary(now: number, lastInput: number, ended: readonly TurnStats[], pending: number): AwaySummary | null {
  if (now - lastInput < AWAY_MS || ended.length === 0) return null
  const tests = [...ended].reverse().find(t => t.tests !== null)?.tests ?? null
  return {
    minutes: Math.round((now - lastInput) / 60_000),
    turns: ended.length,
    files: ended.reduce((n, t) => n + t.files, 0),
    tests,
    seal: ended[ended.length - 1]!.seal ?? null,
    pending,
  }
}

/** '↺ While you were away (32 min): 2 turns · 5 files · ✔ 159 tests · 1 decision waiting' (or in Portuguese). */
export function awayText(s: AwaySummary): string {
  const parts = [plural(s.turns, tr('turn', 'turno'), tr('turns', 'turnos'))]
  if (s.files > 0) parts.push(plural(s.files, tr('file', 'arquivo'), tr('files', 'arquivos')))
  if (s.tests !== null) parts.push(scoreText(s.tests))
  const seal = sealLabel(s.seal)
  if (seal !== null) parts.push(seal.text)
  if (s.pending > 0) parts.push(plural(s.pending, tr('decision waiting', 'decisão esperando'), tr('decisions waiting', 'decisões esperando')))
  return tr(`↺ While you were away (${s.minutes} min): ${parts.join(' · ')}`, `↺ Enquanto você estava fora (${s.minutes} min): ${parts.join(' · ')}`)
}

export async function hideAway($: EngineInterface): Promise<void> {
  await update($, AWAY, () => null)
}

/** The person's own prompt: their input now, and what the band said about their absence is answered. */
export async function noteInput($: EngineInterface, e: Args<'prompt.submit'>): Promise<void> {
  if (e.isMeta === true) return
  lastInputAt = await $.clock.now()
  endedSince = []
  hasTypedSince = false
  if ((await read($, AWAY)) !== null) await hideAway($)
}

/** After screen's turn.complete has recorded the turn's stats. */
export async function noteTurnEnd($: EngineInterface, e: Args<'turn.complete'>): Promise<void> {
  if (e.agentId !== undefined || lastInputAt === null) return
  if (hasTypedSince) {
    // Typed while it ran: around when it ended, so its end is the last sign of them.
    hasTypedSince = false
    lastInputAt = await $.clock.now()
    return
  }
  endedSince.push(turnStatsFor(e.durationMs) ?? { endedAt: await $.clock.now(), tools: 0, files: 0, tests: null, seal: null })
}

/** The first keystroke after a turn ended: back after ten minutes or more, the band says what happened. */
async function noteKeystroke($: EngineInterface): Promise<void> {
  if (endedSince.length === 0 || lastInputAt === null) {
    hasTypedSince = true
    return
  }
  const now = await $.clock.now()
  const ended = endedSince
  const since = lastInputAt
  endedSince = []
  lastInputAt = now
  if (!(await getFlags($)).ausencia) return
  const summary = awaySummary(now, since, ended, (await read($, PENDING))?.items.length ?? 0)
  if (summary !== null) await update($, AWAY, () => summary)
}

export function registerAway(on: On): void {
  on('prompt.edit', async ($, e, next) => {
    const box = await next(e)
    await noteKeystroke($)
    return box
  })
}
