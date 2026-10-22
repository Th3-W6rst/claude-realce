import { atom, read } from 'claude-code'
import type { On } from 'claude-code'

import type { Seal, TurnStats } from '../../types'
import { flagsVersion, getFlags } from '../flags'
import { memo, trimOldest } from '../memo'
import { failedCount, formatClock, formatDuration, plural } from '../format'
import { tr } from '../i18n'
import { SCREEN } from '../palette'
import { timed } from '../perf'
import { cachedEnv } from '../env'

const TURNS = atom({ plugin: 'realce', key: 'turns' } as const, {})

type Span = { text: string; color: string }

// The transcript leaves a cell on each side of a row; a rule that fills the viewport would wrap.
const ruleWidth = (columns: number | undefined) => Math.max(10, (columns ?? 80) - 2)

export function testsLabel(stats: TurnStats): Span | null {
  const tests = stats.tests
  if (tests === null) return null
  if (tests.failed === 0) return { text: tr('✔ tests', '✔ testes'), color: SCREEN.ok }
  return { text: `✖ ${failedCount(tests.failed, tests.unit)}`, color: SCREEN.bad }
}

export function sealLabel(seal: Seal | null | undefined): Span | null {
  if (seal === 'proved') return { text: tr('✔ proved', '✔ provado'), color: SCREEN.ok }
  if (seal === 'failing') return { text: tr('✖ claimed with tests failing', '✖ afirmou com testes falhando'), color: SCREEN.bad }
  if (seal === 'unproved') return { text: tr('⚠ no proof', '⚠ sem prova'), color: SCREEN.warn }
  return null
}

// `drop`: which goes first when the rule is too narrow (lowest first); a label without one always stays.
// `short`: what a kept label says when even the kept ones do not fit.
type Label = Span & { drop?: number; short?: string }

/** The labels as a rule filling `width`: '── a · b ───'; null when even the kept ones do not fit. */
function fillRule(labels: readonly Label[], width: number): Span[] | null {
  const length = (ls: readonly Label[]) => 4 + ls.reduce((n, l) => n + [...l.text].length, 0) + 3 * (ls.length - 1) + 2
  let shown = [...labels]
  // What does not fit drops by rank: the counts, then the clock, then the tests; the duration and the seal stay.
  while (length(shown) > width) {
    const droppable = shown.filter(l => l.drop !== undefined)
    if (droppable.length === 0) {
      // The verdict outlives its wording: a long seal takes its short form before the rule gives up.
      const long = shown.find(l => l.short !== undefined && l.text !== l.short)
      if (long === undefined) return null
      shown = shown.map(l => (l === long ? { ...l, text: l.short! } : l))
      continue
    }
    const first = droppable.reduce((a, b) => (b.drop! < a.drop! ? b : a))
    shown = shown.filter(l => l !== first)
  }
  const spans: Span[] = [{ text: '── ', color: SCREEN.rule }]
  shown.forEach((label, i) => {
    if (i > 0) spans.push({ text: ' · ', color: SCREEN.dim })
    spans.push({ text: label.text, color: label.color })
  })
  const used = spans.reduce((n, s) => n + [...s.text].length, 0)
  spans.push({ text: ` ${'─'.repeat(Math.max(0, width - used - 1))}`, color: SCREEN.rule })
  return spans
}

/**
 * The turn's closing rule as colored runs, '── 15:41 · 6m 25s · 14 ferramentas · 3 arquivos · ✔ testes ──' filled with
 * '─' to the width: what does not fit drops, the duration and the seal stay.
 */
export function ruleSpans(stats: TurnStats | null, durationMs: number, width: number, tzOffsetMinutes: number | null): Span[] {
  const labels: Label[] = []
  if (stats !== null && tzOffsetMinutes !== null) labels.push({ text: formatClock(stats.endedAt, tzOffsetMinutes), color: SCREEN.dim, drop: 3 })
  labels.push({ text: formatDuration(durationMs), color: SCREEN.dim })
  if (stats !== null) {
    const seal = sealLabel(stats.seal)
    if (seal !== null) labels.push({ ...seal, ...(stats.seal === 'failing' ? { short: tr('✖ failing', '✖ falhando') } : {}) })
    // A count of nothing says nothing: a turn that only answered draws its time alone.
    if (stats.tools > 0) labels.push({ text: plural(stats.tools, tr('tool', 'ferramenta'), tr('tools', 'ferramentas')), color: SCREEN.dim, drop: 2 })
    if (stats.files > 0) labels.push({ text: plural(stats.files, tr('file', 'arquivo'), tr('files', 'arquivos')), color: SCREEN.dim, drop: 1 })
    const tests = testsLabel(stats)
    if (tests !== null) labels.push({ ...tests, drop: 4 })
  }
  return fillRule(labels, width) ?? [{ text: '─'.repeat(width), color: SCREEN.rule }]
}

/** With separador off, the seal alone: '── ✔ provado ───'. */
function sealOnlySpans(seal: Span, width: number): Span[] {
  return fillRule([seal], width) ?? [{ text: '─'.repeat(width), color: SCREEN.rule }]
}

// Stats by durationMs, read from the state once per load and kept here after: every closing rule drawn again (a scroll
// passes many) needs no trip to the engine. A turn that ends adds its own and redraws the screen (rememberTurn).
const known = new Map<string, TurnStats>()
// As many as the state keeps (screen/events.ts).
const MAX_KNOWN = 300
let isLoaded = false

/** A finished turn's stats by its duration, the key TurnDuration and turn.complete share. */
export const turnStatsFor = (durationMs: number): TurnStats | null => known.get(String(durationMs)) ?? null

export function rememberTurn(key: string, stats: TurnStats): void {
  known.set(key, stats)
  trimOldest(known, MAX_KNOWN)
}

export function registerTurns(on: On): void {
  on('ui.render', { component: 'TurnDuration' }, async ($, e, next) => timed('TurnDuration', async () => {
    const flags = await getFlags($)
    // ctrl+o shows the engine's line whole; a line waiting on background agents says so in the engine's words.
    if ((!flags.separador && !flags.selo) || e.surface !== 'terminal' || e.props.isExpanded === true || e.props.waitingFor !== undefined) return next(e)
    if (!isLoaded) {
      for (const [key, stats] of Object.entries(await read($, TURNS))) if (!known.has(key)) known.set(key, stats)
      isLoaded = true
    }
    const key = String(e.props.durationMs)
    const stats = known.get(key) ?? null
    // With separador off only a seal draws a rule; anything else is the engine's line.
    const seal = flags.selo ? sealLabel(stats?.seal) : null
    if (!flags.separador && seal === null) return next(e)
    const shown = flags.selo || stats === null ? stats : { ...stats, seal: null }
    const env = cachedEnv()
    const columns = e.viewport?.columns
    return memo('TurnDuration', `${e.requestId}|${key}|${stats !== null}|${columns}|${env?.tzOffsetMinutes}|${flagsVersion()}`, () => {
      const width = ruleWidth(columns)
      const spans = flags.separador ? ruleSpans(shown, e.props.durationMs, width, env?.tzOffsetMinutes ?? null) : sealOnlySpans(seal!, width)
      const { Box, Text } = $.ui.resolve(e)
      return (
        <Box key="realce-turn">
          <Text wrap="truncate-end">{spans.map(s => <Text color={s.color}>{s.text}</Text>)}</Text>
        </Box>
      )
    })
  }))
}
