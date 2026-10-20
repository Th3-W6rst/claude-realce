import { atom, read, update } from 'claude-code'
import type { EngineInterface, On } from 'claude-code'

import { getFlags } from '../flags'
import { SCREEN } from '../palette'
import { fitSegments, wrapLines, type Segment } from './fit'
import { awayText, hideAway } from './away'
import { planBar, planProgress, type PlanProgress } from './plan'
import { timed } from '../perf'

const PENDING = atom({ plugin: 'realce', key: 'pending' } as const, null)
const PLAN = atom({ plugin: 'realce', key: 'plan' } as const, [])
const AWAY = atom({ plugin: 'realce', key: 'away' } as const, null)

// `[ Ocultar ]` and the cell between it and the text.
const HIDE_CELLS = 12

export async function hidePending($: EngineInterface): Promise<void> {
  await update($, PENDING, () => null)
}

/** The plan row in its colors: the word and the bar in the plan's, what runs now plain. */
function planSegments(p: PlanProgress): Segment[] {
  const bar = planBar(p.filled)
  const segments: Segment[] = [
    { text: 'Plano', color: SCREEN.plan },
    { text: ' ' },
    { text: bar.filled, color: SCREEN.plan },
    { text: bar.empty, color: SCREEN.dim },
    { text: ` ${p.done}/${p.total}` },
  ]
  if (p.now !== null) segments.push({ text: ' · Agora:', color: SCREEN.dim }, { text: ` ${p.now}` })
  return segments
}

export function registerBand(on: On): void {
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => timed('AbovePrompt', async () => {
    const { hasSurvey, isWorking, maxRows, bodyColumns } = e.props
    if (hasSurvey || maxRows < 1) return next(e)
    const flags = await getFlags($)
    if (!flags.pendencias && !flags.plano && !flags.ausencia) return next(e)
    const { Box, Text, Button } = $.ui.resolve(e)
    const pending = flags.pendencias && !isWorking ? await read($, PENDING) : null
    if (pending !== null && pending.items.length > 0 && bodyColumns > HIDE_CELLS) {
      const lines = wrapLines(`⚠ Precisa de você: ${pending.items.join(' · ')}`, bodyColumns - HIDE_CELLS, maxRows)
      return (
        <Box flexDirection="row" width={bodyColumns}>
          <Box width={bodyColumns - HIDE_CELLS}>
            <Text color={SCREEN.warn}>{lines.join('\n')}</Text>
          </Box>
          <Box marginLeft={1}>
            <Button key="hide-pending" onPress={() => void hidePending($)}>
              Ocultar
            </Button>
          </Box>
        </Box>
      )
    }
    const away = flags.ausencia ? await read($, AWAY) : null
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
              Ocultar
            </Button>
          </Box>
        </Box>
      )
    }
    const progress = flags.plano ? planProgress(await read($, PLAN)) : null
    if (progress === null) return next(e)
    return (
      <Text wrap="truncate-end">
        {fitSegments(planSegments(progress), bodyColumns).map(s => (s.color === undefined ? s.text : <Text color={s.color}>{s.text}</Text>))}
      </Text>
    )
  }))
}
