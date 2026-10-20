import { tr } from './i18n'

// The sizes the drawings keep to, apart from their colors (palette.ts).

export const READING_WIDTH = 100
export const FOLD_AT = 25
export const FOLD_SHOW = 8

// A terminal cell's width over its height in the user's font (Monaspace Neon 17): images keep their shape with it.
export const CELL_ASPECT = 0.47
// Diagrams render at scale 2, and a column is about 10 logical pixels wide.
export const DIAGRAM_SCALE = 2
export const CELL_PX = 10

/** A fold's button, the same on code blocks and diffs: what it hides while folded, the way back while open. */
export const foldLabel = (isOpen: boolean, hidden: number): string =>
  isOpen ? tr('▾ Fold', '▾ Recolher') : tr(`▸ Show ${hidden} more lines`, `▸ Mostrar mais ${hidden} linhas`)
