import type { EngineInterface, RenderElement } from 'claude-code'

import { fitEnd } from '../../fit'
import { formatClock } from '../../format'
import { tr } from '../../i18n'
import { scrollToRow, timelineText } from '../timeline'
import { heading, section, type PaneData, type UI } from './parts'

const MAX_TURNS = 20

/** The pinned replies, then the turns, the newest first; a press scrolls the transcript to each. */
export function turnsTab($: EngineInterface, t: UI, d: PaneData, cols: number): RenderElement {
  const { Box, Text, Button } = t
  const pins = d.flags.fixar ? d.pins : []
  const timeline = d.flags.linha ? d.timeline : []
  if (pins.length + timeline.length === 0) return <Text dimColor>{tr('No turn yet.', 'Nenhum turno ainda.')}</Text>
  const tz = d.env?.tzOffsetMinutes
  return (
    <Box flexDirection="column">
      {pins.length > 0 &&
        section(t, [
          heading(t, `${tr('Pinned', 'Fixadas')} (${pins.length})`, cols),
          ...[...pins].reverse().map(p => (
            <Button plain key={`pin-${p.requestId}`} dimColor onPress={() => void scrollToRow($, p.requestId)}>
              {fitEnd(tz === undefined ? p.preview : `${formatClock(p.at, tz)} · ${p.preview}`, cols)}
            </Button>
          )),
        ])}
      {timeline.length > 0 &&
        section(t, [
          heading(t, `${tr('Turns', 'Turnos')} (${timeline.length})`, cols),
          ...timeline
            .slice(-MAX_TURNS)
            .reverse()
            .map(r => (
              <Button plain key={`turn-${r.requestId}`} dimColor onPress={() => void scrollToRow($, r.requestId)}>
                {fitEnd(timelineText(r, tz), cols)}
              </Button>
            )),
        ])}
    </Box>
  )
}
