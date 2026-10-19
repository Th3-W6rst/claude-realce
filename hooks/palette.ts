// Neon palette. Colors only, never bold: Ghostty's `bold-color` repaints bold runs
// in one fixed red, which would flatten every kind into the same color.

export type Paint = { color?: string; backgroundColor?: string; italic?: boolean; underline?: boolean; strikethrough?: boolean; dimColor?: boolean }

export const PROSE = {
  label: { color: '#FF3D45' },
  strong: { color: '#E06AA0' },
  highlight: { color: '#111111', backgroundColor: '#E3BC46' },
  good: { color: '#00FF41' },
  bad: { color: '#FF5C63', backgroundColor: '#3D0A12' },
  warn: { color: '#E3BC46' },
  code: { color: '#24D3E0', backgroundColor: '#1B1B26' },
  path: { color: '#5AA6DE', underline: true },
  number: { color: '#FF9E3D' },
  quote: { color: '#C3A6FF' },
  link: { color: '#5AA6DE', underline: true },
  italic: { italic: true, color: '#D8C0BA' },
  strike: { strikethrough: true, dimColor: true },
  statusGood: { color: '#5BD98C' },
  statusBad: { color: '#FF5C63' },
  statusWarn: { color: '#E3BC46' },
  delta: { color: '#24D3E0' },
} satisfies Record<string, Paint>

export type ProseKind = keyof typeof PROSE

export const BLOCK = {
  heading1: { color: '#24D3E0', underline: true },
  heading2: { color: '#E06AA0' },
  heading3: { color: '#E3BC46' },
  bullet: { color: '#24D3E0' },
  ordinal: { color: '#FF9E3D' },
  checkDone: { color: '#00FF41' },
  checkOpen: { color: '#6E6A86' },
  quoteBar: { color: '#6E6A86' },
  rule: { color: '#4D1A24' },
  codeLabel: { color: '#6E6A86', italic: true },
} satisfies Record<string, Paint>

export const CODE_BACKGROUND = '#16161E'

export const CODE = {
  keyword: { color: '#E06AA0' },
  string: { color: '#5BD98C' },
  number: { color: '#FF9E3D' },
  constant: { color: '#FF9E3D' },
  comment: { color: '#6E6A86', italic: true },
  function: { color: '#24D3E0' },
  type: { color: '#E3BC46' },
  property: { color: '#9CDCFE' },
  operator: { color: '#FF5C63' },
  punctuation: { color: '#8A8A9A' },
  decorator: { color: '#B48EFF' },
  variable: { color: '#FF9E3D' },
  flag: { color: '#E3BC46' },
  key: { color: '#24D3E0' },
  added: { color: '#00FF41' },
  removed: { color: '#FF5C63' },
  hunk: { color: '#24D3E0' },
  meta: { color: '#6E6A86' },
} satisfies Record<string, Paint>

export type CodeKind = keyof typeof CODE

export const READING_WIDTH = 100
export const FOLD_AT = 25
export const FOLD_SHOW = 8

// A terminal cell's width over its height in the user's font (Monaspace Neon 17): images keep their shape with it.
export const CELL_ASPECT = 0.47
// Diagrams render at scale 2, and a column is about 10 logical pixels wide.
export const DIAGRAM_SCALE = 2
export const CELL_PX = 10

export type CalloutKind = 'decision' | 'risk' | 'done' | 'summary' | 'note' | 'tip'

export const CALLOUT: Record<CalloutKind, { color: string; title: string }> = {
  decision: { color: '#E3BC46', title: 'Decisão' },
  risk: { color: '#FF5C63', title: 'Risco' },
  done: { color: '#00FF41', title: 'Feito' },
  summary: { color: '#24D3E0', title: 'Resumo' },
  note: { color: '#5AA6DE', title: 'Nota' },
  tip: { color: '#E06AA0', title: 'Dica' },
}

export const TABLE = { header: { color: '#24D3E0', underline: true }, zebra: '#16161E' } satisfies { header: Paint; zebra: string }

// The transcript chrome: tool rows, turn rules, cards, bands and panes.
export const SCREEN = {
  dim: '#6E6A86',
  rule: '#4D1A24',
  ok: '#00FF41',
  bad: '#FF5C63',
  warn: '#E3BC46',
  edit: '#E3BC46',
  run: '#24D3E0',
  agent: '#E06AA0',
  web: '#5AA6DE',
  plan: '#24D3E0',
  mcp: '#B48EFF',
} as const

// Mermaid's `base` theme in the same palette, so a diagram reads as part of the reply.
export const MERMAID_CONFIG = {
  theme: 'base',
  themeVariables: {
    darkMode: true,
    background: '#111111',
    fontFamily: 'Menlo, monospace',
    fontSize: '15px',
    primaryColor: '#16161E',
    primaryTextColor: '#E3C7C1',
    primaryBorderColor: '#24D3E0',
    secondaryColor: '#1B1B26',
    tertiaryColor: '#1B1B26',
    lineColor: '#E06AA0',
    textColor: '#E3C7C1',
    mainBkg: '#16161E',
    nodeBorder: '#24D3E0',
    clusterBkg: '#1B1B26',
    clusterBorder: '#4D1A24',
    edgeLabelBackground: '#111111',
    actorBkg: '#16161E',
    actorBorder: '#24D3E0',
    actorTextColor: '#E3C7C1',
    signalColor: '#E06AA0',
    signalTextColor: '#E3C7C1',
    noteBkgColor: '#3D0A12',
    noteTextColor: '#E3C7C1',
    noteBorderColor: '#FF5C63',
  },
} as const
