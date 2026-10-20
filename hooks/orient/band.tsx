import { atom, read, update } from 'claude-code'
import type { EngineInterface, On, RenderElement, RenderInputOf, RenderNode, RenderSurface } from 'claude-code'

import { getFlags } from '../flags'
import { SCREEN } from '../palette'
import { fitSegments, wrapLines, type Segment } from './fit'
import { awayText, hideAway } from './away'
import { hideLimit, limitText } from './limits'
import { cachedEnv } from '../env'
import { planBar, planProgress, type PlanProgress } from './plan'
import { timed } from '../perf'
import { tr } from '../i18n'

const PENDING = atom({ plugin: 'realce', key: 'pending' } as const, null)
const PLAN = atom({ plugin: 'realce', key: 'plan' } as const, [])
const AWAY = atom({ plugin: 'realce', key: 'away' } as const, null)
const LIMIT = atom({ plugin: 'realce', key: 'limit' } as const, null)

// `[ Ocultar ]` and the cell between it and the text.
const HIDE_CELLS = 12

type BandInput = RenderInputOf<'AbovePrompt', RenderSurface>

export async function hidePending($: EngineInterface): Promise<void> {
  await update($, PENDING, () => null)
}

/** The plan row in its colors: the word and the bar in the plan's, what runs now plain. */
function planSegments(p: PlanProgress): Segment[] {
  const bar = planBar(p.filled)
  const segments: Segment[] = [
    { text: tr('Plan', 'Plano'), color: SCREEN.plan },
    { text: ' ' },
    { text: bar.filled, color: SCREEN.plan },
    { text: bar.empty, color: SCREEN.dim },
    { text: ` ${p.done}/${p.total}` },
  ]
  if (p.now !== null) segments.push({ text: tr(' · Now:', ' · Agora:'), color: SCREEN.dim }, { text: ` ${p.now}` })
  return segments
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

/** The band's most pressing notice in at most `rows` rows (what needs you, a limit, the away summary, the plan), or null. */
async function noticeOf($: EngineInterface, e: BandInput, rows: number): Promise<RenderElement | null> {
  const { isWorking, bodyColumns } = e.props
  const flags = await getFlags($)
  const { Box, Text, Button } = $.ui.resolve(e)
  // The band's sources in one round trip: each read is a trip to the engine, and the band draws on every turn.
  const [pending, limit, away, plan] = await Promise.all([
    flags.pendencias && !isWorking ? read($, PENDING) : Promise.resolve(null),
    flags.limite ? read($, LIMIT) : Promise.resolve(null),
    flags.ausencia ? read($, AWAY) : Promise.resolve(null),
    flags.plano ? read($, PLAN) : Promise.resolve(null),
  ])
  if (pending !== null && pending.items.length > 0 && bodyColumns > HIDE_CELLS) {
    const lines = wrapLines(`⚠ ${tr('Needs you', 'Precisa de você')}: ${pending.items.join(' · ')}`, bodyColumns - HIDE_CELLS, rows)
    return (
      <Box flexDirection="row" width={bodyColumns}>
        <Box width={bodyColumns - HIDE_CELLS}>
          <Text color={SCREEN.warn}>{lines.join('\n')}</Text>
        </Box>
        <Box marginLeft={1}>
          <Button key="hide-pending" onPress={() => void hidePending($)}>
            {tr('Hide', 'Ocultar')}
          </Button>
        </Box>
      </Box>
    )
  }
  const progress = plan === null ? null : planProgress(plan)
  // While Claude works, the plan is what moves: the limit waits for the turn to end.
  if (limit !== null && bodyColumns > HIDE_CELLS && !(isWorking && progress !== null)) {
    const text = limitText(limit, cachedEnv()?.tzOffsetMinutes, await $.clock.now())
    return (
      <Box flexDirection="row" width={bodyColumns}>
        <Box width={bodyColumns - HIDE_CELLS}>
          <Text color={SCREEN.warn} wrap="truncate-end">
            {text}
          </Text>
        </Box>
        <Box marginLeft={1}>
          <Button key="hide-limit" onPress={() => void hideLimit($, limit)}>
            {tr('Hide', 'Ocultar')}
          </Button>
        </Box>
      </Box>
    )
  }
  if (away !== null && bodyColumns > HIDE_CELLS) {
    return (
      <Box flexDirection="row" width={bodyColumns}>
        <Box width={bodyColumns - HIDE_CELLS}>
          <Text color={SCREEN.plan} wrap="truncate-end">
            {awayText(away)}
          </Text>
        </Box>
        <Box marginLeft={1}>
          <Button key="hide-away" onPress={() => void hideAway($)}>
            {tr('Hide', 'Ocultar')}
          </Button>
        </Box>
      </Box>
    )
  }
  if (progress === null) return null
  return (
    <Text wrap="truncate-end">
      {fitSegments(planSegments(progress), bodyColumns).map(s => (s.color === undefined ? s.text : <Text color={s.color}>{s.text}</Text>))}
    </Text>
  )
}

export function registerBand(on: On): void {
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => timed('AbovePrompt', async () => {
    const { hasSurvey, maxRows } = e.props
    if (hasSurvey || maxRows < 1) return next(e)
    const flags = await getFlags($)
    if (!flags.pendencias && !flags.plano && !flags.ausencia && !flags.limite) return next(e)
    // The band is shared: what the engine or another mod draws beneath stays, under the notice, which takes the rows
    // left free (one at least; past the budget the band scrolls).
    const below = await next(e)
    const notice = await noticeOf($, e, Math.max(1, maxRows - rowsOf(below)))
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
