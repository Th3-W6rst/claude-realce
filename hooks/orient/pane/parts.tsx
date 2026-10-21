import type { Elements, RenderElement } from 'claude-code'

import type { AgentRow, AskMode, ChatEntry, Failure, FileTouch, PendingItems, Pin, PlanItem, SessionEnv, TimelineRow, UsageReading } from '../../../types'
import type { Flags } from '../../flags'
import { segmentRow, type Segment } from '../../fit'
import { SCREEN } from '../../palette'

// The pieces every tab of the session pane draws with.

// Every surface draws these; a field to type in only some (`Input` absent elsewhere).
export type UI = Pick<Elements['terminal'], 'Box' | 'Text' | 'Button' | 'Link' | 'Markdown'> & Partial<Pick<Elements['terminal'], 'Input'>>

/** What the pane read for one drawing: each tab draws from it, none reads the state itself. */
export type PaneData = {
  flags: Flags
  env: SessionEnv | null
  pending: PendingItems | null
  plan: PlanItem[]
  files: FileTouch[]
  failures: Failure[]
  agents: AgentRow[]
  timeline: TimelineRow[]
  pins: Pin[]
  usage: UsageReading | null
  chat: ChatEntry[]
  mode: AskMode
  isFocused: boolean
}

const BAR_CELLS = 10

/** '▰▰▰▱▱▱▱▱▱▱': the filled share in `color`, the rest dim. */
export function bar(fraction: number, color: string, cells = BAR_CELLS): Segment[] {
  const filled = Math.max(0, Math.min(cells, Math.round(fraction * cells)))
  return [
    { text: '▰'.repeat(filled), color },
    { text: '▱'.repeat(cells - filled), color: SCREEN.dim },
  ]
}

/** A section's title in the plan's color, with what follows it on the row (a count, a bar). */
export function heading(t: UI, title: string, cols: number, after: readonly Segment[] = []): RenderElement {
  return segmentRow(t, [{ text: title, color: SCREEN.plan }, ...after], cols)
}

/** One section: a column with a blank row under it. */
export function section(t: UI, children: RenderElement[]): RenderElement {
  const { Box } = t
  return (
    <Box flexDirection="column" marginBottom={1}>
      {children}
    </Box>
  )
}

export const added = (files: readonly FileTouch[]) => files.reduce((sum, f) => sum + f.added, 0)
export const removed = (files: readonly FileTouch[]) => files.reduce((sum, f) => sum + f.removed, 0)
