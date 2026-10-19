import type { Elements } from 'claude-code'

import type { Diagram, SessionEnv } from '../../types'
import type { Flags } from '../flags'

export type Table = Pick<Elements['terminal'], 'Box' | 'Text' | 'Button' | 'Link' | 'Code' | 'Markdown' | 'Image'>

/** Everything a reply's drawing reads, gathered by the AssistantMessage hook: the drawing itself stays pure. */
export type RenderCtx = {
  t: Table
  flags: Flags
  columns: number
  requestId: string
  // Code blocks by their index among the reply's code blocks.
  openFolds: ReadonlySet<number>
  diagrams: Readonly<Record<string, Diagram>>
  env: SessionEnv | null
  // A link for a path span, or null when caminhos is off or the session env is unknown.
  hrefForPath: (path: string) => string | null
  onCopy: (source: string) => void
  onFold: (index: number, isOpen: boolean) => void
}
