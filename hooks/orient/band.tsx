import { atom, read, update } from 'claude-code'
import type { EngineInterface, On, RenderElement, RenderInputOf, RenderNode, RenderSurface } from 'claude-code'

import type { AwaySummary, LimitWarning, PlanItem } from '../../types'
import { getFlags, type Flags } from '../flags'
import { SCREEN } from '../palette'
import { segmentRow, wrapLines } from '../fit'
import { awayText, hideAway } from './away'
import { hideLimit, limitText } from './limits'
import { cachedEnv } from '../env'
import { planProgress, planSegments } from './plan'
import { timed } from '../perf'
import { tr } from '../i18n'

const PENDING = atom({ plugin: 'realce', key: 'pending' } as const, null)
const PLAN = atom({ plugin: 'realce', key: 'plan' } as const, [])
const AWAY = atom({ plugin: 'realce', key: 'away' } as const, null)
const LIMIT = atom({ plugin: 'realce', key: 'limit' } as const, null)

// `[ Ocultar ]` and the cell between it and the text.
const HIDE_CELLS = 12

type BandInput = RenderInputOf<'AbovePrompt', RenderSurface>

async function hidePending($: EngineInterface): Promise<void> {
  await update($, PENDING, () => null)
}

/** A tree's text, its strings in order. */
function textOf(node: RenderNode): string {
  if (typeof node === 'string') return node
  return 'children' in node && Array.isArray(node.children) ? (node.children as RenderNode[]).map(textOf).join('') : ''
}

/**
 * Rows a tree drawn beneath the band takes, read from its shape: a Text's lines, a column's sum, a row's tallest. The
 * engine's own node takes none: of its own the band holds only a survey, and the hook yields to a survey whole.
 */
export function rowsOf(node: RenderNode): number {
  if (typeof node === 'string') return node.split('\n').length
  if (node.type === 'engine') return 0
  if (node.type === 'Text') return textOf(node).split('\n').length
  if (node.type === 'Box') {
    const rows = ((node.children ?? []) as RenderNode[]).map(rowsOf)
    return node.props?.flexDirection === 'column' ? rows.reduce((a, b) => a + b, 0) : Math.max(0, ...rows)
  }
  return 1
}

type BandData = {
  pending: { items: string[] } | null
  limit: LimitWarning | null
  away: AwaySummary | null
  plan: readonly PlanItem[] | null
  now: number
}

/** What the band may say, in one round trip: each read is a trip to the engine, and the band draws on every turn. */
async function bandData($: EngineInterface, e: BandInput, flags: Flags): Promise<BandData> {
  const [pending, limit, away, plan] = await Promise.all([
    flags.pendencias && !e.props.isWorking ? read($, PENDING) : Promise.resolve(null),
    flags.limite ? read($, LIMIT) : Promise.resolve(null),
    flags.ausencia ? read($, AWAY) : Promise.resolve(null),
    flags.plano ? read($, PLAN) : Promise.resolve(null),
  ])
  // Only a limit's reset time reads the clock, and a limit is rare.
  return { pending, limit, away, plan, now: limit === null ? 0 : await $.clock.now() }
}

/** The band's most pressing notice in at most `rows` rows (what needs you, a limit, the away summary, the plan), or null. */
function noticeOf($: EngineInterface, e: BandInput, data: BandData, rows: number): RenderElement | null {
  const { bodyColumns, isWorking } = e.props
  const { Box, Text, Button } = $.ui.resolve(e)
  const { pending, limit, away, plan } = data
  // A notice beside its Hide button.
  const hideable = (body: RenderElement, key: string, onHide: () => void) => (
    <Box flexDirection="row" width={bodyColumns}>
      <Box width={bodyColumns - HIDE_CELLS}>{body}</Box>
      <Box marginLeft={1}>
        <Button key={key} onPress={onHide}>
          {tr('Hide', 'Ocultar')}
        </Button>
      </Box>
    </Box>
  )
  if (pending !== null && pending.items.length > 0 && bodyColumns > HIDE_CELLS) {
    const lines = wrapLines(`⚠ ${tr('Needs you', 'Precisa de você')}: ${pending.items.join(' · ')}`, bodyColumns - HIDE_CELLS, rows)
    return hideable(<Text color={SCREEN.warn}>{lines.join('\n')}</Text>, 'hide-pending', () => void hidePending($))
  }
  const progress = plan === null ? null : planProgress(plan)
  // While Claude works, the plan is what moves: the limit waits for the turn to end.
  if (limit !== null && bodyColumns > HIDE_CELLS && !(isWorking && progress !== null)) {
    const text = limitText(limit, cachedEnv()?.tzOffsetMinutes, data.now)
    return hideable(<Text color={SCREEN.warn} wrap="truncate-end">{text}</Text>, 'hide-limit', () => void hideLimit($, limit))
  }
  if (away !== null && bodyColumns > HIDE_CELLS) {
    return hideable(<Text color={SCREEN.plan} wrap="truncate-end">{awayText(away)}</Text>, 'hide-away', () => void hideAway($))
  }
  return progress === null ? null : segmentRow($.ui.resolve(e), planSegments(progress), bodyColumns)
}

export function registerBand(on: On): void {
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => timed('AbovePrompt', async () => {
    const { hasSurvey, maxRows } = e.props
    if (hasSurvey || maxRows < 1) return next(e)
    const flags = await getFlags($)
    if (!flags.pendencias && !flags.plano && !flags.ausencia && !flags.limite) return next(e)
    // The band is shared: what the engine or another mod draws beneath stays, under the notice, which takes the rows
    // left free (one at least; past the budget the band scrolls). Its own reads go while the rest draws.
    const [below, data] = await Promise.all([next(e), bandData($, e, flags)])
    const notice = noticeOf($, e, data, Math.max(1, maxRows - rowsOf(below)))
    if (notice === null) return below
    const { Box } = $.ui.resolve(e)
    // No width or height on this Box: the engine refuses its own node under a sized or placed one.
    return (
      <Box flexDirection="column">
        {notice}
        {below}
      </Box>
    )
  }))
}
