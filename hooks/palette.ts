// The palette in force. Every drawing reads these objects when it draws; a theme change swaps their contents in
// place (applyPalette), so no importer holds a stale color. A module-level table never copies a color out of them:
// it names a tone and looks it up while drawing.

import { pick, type Text } from './i18n'
import { DARK, type CalloutKind, type PaletteSet } from './palettes'

export type { BlockKind, CalloutKind, CodeKind, Paint, ProseKind, ScreenTone } from './palettes'

export const PROSE: PaletteSet['PROSE'] = { ...DARK.PROSE }
export const BLOCK: PaletteSet['BLOCK'] = { ...DARK.BLOCK }
export const CODE: PaletteSet['CODE'] = { ...DARK.CODE }
export const SCREEN: PaletteSet['SCREEN'] = { ...DARK.SCREEN }
export const BG: PaletteSet['BG'] = { ...DARK.BG }
export const TABLE: PaletteSet['TABLE'] = { ...DARK.TABLE }
export const MERMAID: { config: PaletteSet['MERMAID'] } = { config: DARK.MERMAID }

const CALLOUT_TITLES: Record<CalloutKind, Text> = {
  decision: { en: 'Decision', pt: 'Decisão' },
  risk: { en: 'Risk', pt: 'Risco' },
  done: { en: 'Done', pt: 'Feito' },
  summary: { en: 'Summary', pt: 'Resumo' },
  note: { en: 'Note', pt: 'Nota' },
  tip: { en: 'Tip', pt: 'Dica' },
}

// The title is read when drawn: it speaks the language in force, the color is the theme's.
const callout = (kind: CalloutKind, color: string) => ({
  color,
  get title() {
    return pick(CALLOUT_TITLES[kind])
  },
})

export const CALLOUT: Record<CalloutKind, { color: string; readonly title: string }> = Object.fromEntries(
  (Object.keys(CALLOUT_TITLES) as CalloutKind[]).map(k => [k, callout(k, DARK.CALLOUT[k])]),
) as Record<CalloutKind, { color: string; readonly title: string }>

/** Paints with `set` from the next drawing on. */
export function applyPalette(set: PaletteSet): void {
  Object.assign(PROSE, set.PROSE)
  Object.assign(BLOCK, set.BLOCK)
  Object.assign(CODE, set.CODE)
  Object.assign(SCREEN, set.SCREEN)
  Object.assign(BG, set.BG)
  Object.assign(TABLE, set.TABLE)
  MERMAID.config = set.MERMAID
  for (const k of Object.keys(CALLOUT) as CalloutKind[]) CALLOUT[k] = callout(k, set.CALLOUT[k])
}

export const READING_WIDTH = 100
export const FOLD_AT = 25
export const FOLD_SHOW = 8

// A terminal cell's width over its height in the user's font (Monaspace Neon 17): images keep their shape with it.
export const CELL_ASPECT = 0.47
// Diagrams render at scale 2, and a column is about 10 logical pixels wide.
export const DIAGRAM_SCALE = 2
export const CELL_PX = 10
