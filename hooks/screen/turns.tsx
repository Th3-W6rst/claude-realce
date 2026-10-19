import { atom, read } from 'claude-code'
import type { Elements, On, RenderElement } from 'claude-code'

import type { TurnStats } from '../../types'
import { flagsVersion, getFlags } from '../flags'
import { memo } from '../memo'
import { formatClock, formatDuration, plural } from '../format'
import { SCREEN } from '../palette'
import { timed } from '../perf'
import { cachedEnv } from '../env'

const TURNS = atom({ plugin: 'realce', key: 'turns' } as const, {})

type T = Pick<Elements['terminal'], 'Box' | 'Text'>

type Span = { text: string; color: string }

// The transcript leaves a cell on each side of a row; a rule that fills the viewport would wrap.
export const ruleWidth = (columns: number | undefined) => Math.max(10, (columns ?? 80) - 2)

function testsLabel(stats: TurnStats): Span | null {
  const tests = stats.tests
  if (tests === null) return null
  if (tests.failed === 0) return { text: '✔ testes', color: SCREEN.ok }
  const noun = tests.unit === 'pacotes' ? ['pacote falhou', 'pacotes falharam'] : ['teste falhou', 'testes falharam']
  return { text: `✖ ${plural(tests.failed, noun[0]!, noun[1]!)}`, color: SCREEN.bad }
}

/** The turn's closing rule as colored runs: what does not fit the width drops from the end, the duration stays. */
function ruleSpans(stats: TurnStats | null, durationMs: number, width: number, tzOffsetMinutes: number | null): Span[] {
  const labels: Span[] = []
  if (stats !== null && tzOffsetMinutes !== null) labels.push({ text: formatClock(stats.endedAt, tzOffsetMinutes), color: SCREEN.dim })
  labels.push({ text: formatDuration(durationMs), color: SCREEN.dim })
  const durationAt = labels.length - 1
  if (stats !== null) {
    labels.push({ text: plural(stats.tools, 'ferramenta', 'ferramentas'), color: SCREEN.dim })
    labels.push({ text: plural(stats.files, 'arquivo', 'arquivos'), color: SCREEN.dim })
    const tests = testsLabel(stats)
    if (tests !== null) labels.push(tests)
  }
  const length = (ls: Span[]) => 4 + ls.reduce((n, l) => n + l.text.length, 0) + 3 * (ls.length - 1) + 2
  let shown = labels
  while (shown.length > 1 && length(shown) > width) shown = shown.length - 1 > durationAt ? shown.slice(0, -1) : shown.slice(1)
  if (length(shown) > width) return [{ text: '─'.repeat(width), color: SCREEN.rule }]
  const spans: Span[] = [{ text: '── ', color: SCREEN.rule }]
  shown.forEach((label, i) => {
    if (i > 0) spans.push({ text: ' · ', color: SCREEN.dim })
    spans.push(label)
  })
  const used = spans.reduce((n, s) => n + s.text.length, 0)
  spans.push({ text: ` ${'─'.repeat(width - used - 1)}`, color: SCREEN.rule })
  return spans
}

/** '── 15:41 · 6m 25s · 14 ferramentas · 3 arquivos · ✔ testes ──', filled with '─' to the width. */
export function turnRule(stats: TurnStats | null, durationMs: number, width: number, tzOffsetMinutes: number | null): string {
  return ruleSpans(stats, durationMs, width, tzOffsetMinutes).map(s => s.text).join('')
}

/** The thin rule above the person's prompt, with the time it was sent ('HH:MM') when known. */

// Stats by durationMs, read from the state once per load and kept here after: every closing rule drawn again (a scroll
// passes many) needs no trip to the engine. A turn that ends adds its own and redraws the screen (rememberTurn).
const known = new Map<string, TurnStats>()
let isLoaded = false

export function rememberTurn(key: string, stats: TurnStats): void {
  known.set(key, stats)
}

export function registerTurns(on: On): void {
  on('ui.render', { component: 'TurnDuration' }, async ($, e, next) => timed('TurnDuration', async () => {
    const flags = await getFlags($)
    if (!flags.separador || e.surface !== 'terminal') return next(e)
    if (!isLoaded) {
      for (const [key, stats] of Object.entries(await read($, TURNS))) if (!known.has(key)) known.set(key, stats)
      isLoaded = true
    }
    const key = String(e.props.durationMs)
    const stats = known.get(key) ?? null
    const env = cachedEnv()
    const columns = e.viewport?.columns
    return memo('TurnDuration', `${e.requestId}|${key}|${stats !== null}|${columns}|${env?.tzOffsetMinutes}|${flagsVersion()}`, () => {
      const spans = ruleSpans(stats, e.props.durationMs, ruleWidth(columns), env?.tzOffsetMinutes ?? null)
      const { Box, Text } = $.ui.resolve(e)
      return (
        <Box key="realce-turn">
          <Text wrap="truncate-end">{spans.map(s => <Text color={s.color}>{s.text}</Text>)}</Text>
        </Box>
      )
    })
  }))
}
