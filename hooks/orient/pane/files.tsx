import type { RenderElement } from 'claude-code'

import type { FileTouch } from '../../../types'
import { pathHref } from '../../code/links'
import { fitStart, segmentRow, type Segment } from '../../fit'
import { tr } from '../../i18n'
import { SCREEN } from '../../palette'
import { shortPath } from '../../screen/toolInfo'
import { added, heading, removed, type PaneData, type UI } from './parts'

export function fileSegments(f: FileTouch, cwd: string | null, cols: number): Segment[] {
  const counts = ` +${f.added} −${f.removed}`
  return [
    { text: fitStart(shortPath(f.path, cwd), Math.max(1, cols - counts.length)) },
    { text: ' ' },
    { text: `+${f.added}`, color: SCREEN.ok },
    { text: ' ' },
    { text: `−${f.removed}`, color: SCREEN.bad },
  ]
}

/** 'Files (7) · +120 −34' and each file, the newest first; a press opens it in the editor. */
export function filesTab(t: UI, d: PaneData, cols: number): RenderElement {
  const { Box, Text, Link } = t
  if (d.files.length === 0) return <Text dimColor>{tr('No file changed yet.', 'Nenhum arquivo mexido ainda.')}</Text>
  const env = d.env
  return (
    <Box flexDirection="column">
      {heading(t, `${tr('Files', 'Arquivos')} (${d.files.length})`, cols, [
        { text: ' · ', color: SCREEN.dim },
        { text: `+${added(d.files)}`, color: SCREEN.ok },
        { text: ' ' },
        { text: `−${removed(d.files)}`, color: SCREEN.bad },
      ])}
      {[...d.files].reverse().map(f => (d.flags.caminhos && env !== null ? <Link href={pathHref(f.path, env)}>{segmentRow(t, fileSegments(f, env.cwd, cols), cols)}</Link> : segmentRow(t, fileSegments(f, env?.cwd ?? null, cols), cols)))}
    </Box>
  )
}
