// Every palette the mod paints with, one per class of the person's Claude Code theme. The dark one is the neon the
// mod was made in; the others are built from a short list of roles, so each kind keeps its meaning in every theme.
// Colors only, never bold: Ghostty's `bold-color` repaints bold runs in one fixed red.

export type Paint = { color?: string; backgroundColor?: string; italic?: boolean; underline?: boolean; strikethrough?: boolean; dimColor?: boolean }

export type ThemeKind = 'dark' | 'light' | 'dark-cb' | 'light-cb' | 'dark-ansi' | 'light-ansi'

export type CalloutKind = 'decision' | 'risk' | 'done' | 'summary' | 'note' | 'tip'

const DARK_PROSE = {
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
  aside: { color: '#6E6A86' },
} satisfies Record<string, Paint>

export type ProseKind = keyof typeof DARK_PROSE

const DARK_BLOCK = {
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

export type BlockKind = keyof typeof DARK_BLOCK

const DARK_CODE = {
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

export type CodeKind = keyof typeof DARK_CODE

const DARK_SCREEN = {
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
}

export type ScreenTone = keyof typeof DARK_SCREEN

export type MermaidConfig = { theme: 'base'; themeVariables: Record<string, string | boolean> }

export type PaletteSet = {
  PROSE: Record<ProseKind, Paint>
  BLOCK: Record<BlockKind, Paint>
  CODE: Record<CodeKind, Paint>
  SCREEN: Record<ScreenTone, string>
  /** Backgrounds: none on an ANSI theme, where the terminal's own background shows. */
  BG: { code: string | undefined; zebra: string | undefined; page: string }
  CALLOUT: Record<CalloutKind, string>
  TABLE: { header: Paint }
  MERMAID: MermaidConfig
}

const mermaid = (v: { dark: boolean; bg: string; box: string; cluster: string; text: string; border: string; line: string; noteBg: string; noteBorder: string; rule: string }): MermaidConfig => ({
  theme: 'base',
  themeVariables: {
    darkMode: v.dark,
    background: v.bg,
    fontFamily: 'Menlo, monospace',
    fontSize: '15px',
    primaryColor: v.box,
    primaryTextColor: v.text,
    primaryBorderColor: v.border,
    secondaryColor: v.cluster,
    tertiaryColor: v.cluster,
    lineColor: v.line,
    textColor: v.text,
    mainBkg: v.box,
    nodeBorder: v.border,
    clusterBkg: v.cluster,
    clusterBorder: v.rule,
    edgeLabelBackground: v.bg,
    actorBkg: v.box,
    actorBorder: v.border,
    actorTextColor: v.text,
    signalColor: v.line,
    signalTextColor: v.text,
    noteBkgColor: v.noteBg,
    noteTextColor: v.text,
    noteBorderColor: v.noteBorder,
  },
})

const DARK_MERMAID = mermaid({ dark: true, bg: '#111111', box: '#16161E', cluster: '#1B1B26', text: '#E3C7C1', border: '#24D3E0', line: '#E06AA0', noteBg: '#3D0A12', noteBorder: '#FF5C63', rule: '#4D1A24' })

export const DARK: PaletteSet = {
  PROSE: DARK_PROSE,
  BLOCK: DARK_BLOCK,
  CODE: DARK_CODE,
  SCREEN: DARK_SCREEN,
  BG: { code: '#16161E', zebra: '#16161E', page: '#111111' },
  CALLOUT: { decision: '#E3BC46', risk: '#FF5C63', done: '#00FF41', summary: '#24D3E0', note: '#5AA6DE', tip: '#E06AA0' },
  TABLE: { header: { color: '#24D3E0', underline: true } },
  MERMAID: DARK_MERMAID,
}

/** What a palette is built from: each role one color (undefined: the terminal's own). */
type Roles = {
  good: string; goodSoft: string; bad: string; badBg: string | undefined; warn: string; label: string; strong: string
  hlFg: string; hlBg: string; code: string; codeBg: string | undefined; link: string; number: string; quote: string
  decorator: string; property: string; punct: string; italic: string | undefined; dim: string; rule: string
  zebra: string | undefined; page: string; mermaid: MermaidConfig
}

const color = (c: string | undefined): Paint => (c === undefined ? {} : { color: c })
const back = (c: string | undefined): Paint => (c === undefined ? {} : { backgroundColor: c })

function fromRoles(r: Roles): PaletteSet {
  return {
    PROSE: {
      label: color(r.label),
      strong: color(r.strong),
      highlight: { color: r.hlFg, backgroundColor: r.hlBg },
      good: color(r.good),
      bad: { ...color(r.bad), ...back(r.badBg) },
      warn: color(r.warn),
      code: { ...color(r.code), ...back(r.codeBg) },
      path: { ...color(r.link), underline: true },
      number: color(r.number),
      quote: color(r.quote),
      link: { ...color(r.link), underline: true },
      italic: { italic: true, ...color(r.italic) },
      strike: { strikethrough: true, dimColor: true },
      statusGood: color(r.goodSoft),
      statusBad: color(r.bad),
      statusWarn: color(r.warn),
      delta: color(r.code),
      aside: color(r.dim),
    },
    BLOCK: {
      heading1: { ...color(r.code), underline: true },
      heading2: color(r.strong),
      heading3: color(r.warn),
      bullet: color(r.code),
      ordinal: color(r.number),
      checkDone: color(r.good),
      checkOpen: color(r.dim),
      quoteBar: color(r.dim),
      rule: color(r.rule),
      codeLabel: { ...color(r.dim), italic: true },
    },
    CODE: {
      keyword: color(r.strong),
      string: color(r.goodSoft),
      number: color(r.number),
      constant: color(r.number),
      comment: { ...color(r.dim), italic: true },
      function: color(r.code),
      type: color(r.warn),
      property: color(r.property),
      operator: color(r.bad),
      punctuation: color(r.punct),
      decorator: color(r.decorator),
      variable: color(r.number),
      flag: color(r.warn),
      key: color(r.code),
      added: color(r.good),
      removed: color(r.bad),
      hunk: color(r.code),
      meta: color(r.dim),
    },
    SCREEN: { dim: r.dim, rule: r.rule, ok: r.good, bad: r.bad, warn: r.warn, edit: r.warn, run: r.code, agent: r.strong, web: r.link, plan: r.code, mcp: r.decorator },
    BG: { code: r.codeBg, zebra: r.zebra, page: r.page },
    CALLOUT: { decision: r.warn, risk: r.bad, done: r.good, summary: r.code, note: r.link, tip: r.strong },
    TABLE: { header: { ...color(r.code), underline: true } },
    MERMAID: r.mermaid,
  }
}

const LIGHT_MERMAID = mermaid({ dark: false, bg: '#FFFFFF', box: '#F4F5F8', cluster: '#F2F3F7', text: '#1A1A1A', border: '#00707A', line: '#A3246B', noteBg: '#FDE2E4', noteBorder: '#B3121B', rule: '#E3C8CC' })

const DARK_ROLES: Roles = {
  good: '#00FF41', goodSoft: '#5BD98C', bad: '#FF5C63', badBg: '#3D0A12', warn: '#E3BC46', label: '#FF3D45', strong: '#E06AA0',
  hlFg: '#111111', hlBg: '#E3BC46', code: '#24D3E0', codeBg: '#1B1B26', link: '#5AA6DE', number: '#FF9E3D', quote: '#C3A6FF',
  decorator: '#B48EFF', property: '#9CDCFE', punct: '#8A8A9A', italic: '#D8C0BA', dim: '#6E6A86', rule: '#4D1A24',
  zebra: '#16161E', page: '#111111', mermaid: DARK_MERMAID,
}

const LIGHT_ROLES: Roles = {
  good: '#0A7D32', goodSoft: '#1E8A4C', bad: '#B3121B', badBg: '#FDE2E4', warn: '#9A6700', label: '#C4141C', strong: '#A3246B',
  hlFg: '#111111', hlBg: '#FFE066', code: '#00707A', codeBg: '#F4F5F8', link: '#1F5FA8', number: '#B35300', quote: '#6B3FC4',
  decorator: '#6B3FC4', property: '#1F5FA8', punct: '#6B6880', italic: '#5A4A45', dim: '#6B6880', rule: '#E3C8CC',
  zebra: '#F2F3F7', page: '#FFFFFF', mermaid: LIGHT_MERMAID,
}

// Okabe–Ito: blue for what worked and orange for what failed read apart under every common color blindness.
const DARK_CB_ROLES: Roles = { ...DARK_ROLES, good: '#56B4E9', goodSoft: '#56B4E9', bad: '#E69F00', badBg: '#3A2A05', warn: '#F0E442' }
const LIGHT_CB_ROLES: Roles = { ...LIGHT_ROLES, good: '#0072B2', goodSoft: '#0072B2', bad: '#D55E00', badBg: '#FCE6D9' }

// The engine's theme keys: under an ANSI theme they are the terminal's own sixteen colors, made for its background
// (a color name like 'green' is a fixed shade, not the terminal's). One table serves light and dark.
const ansiRoles = (mermaidConfig: MermaidConfig, page: string): Roles => ({
  good: 'success', goodSoft: 'success', bad: 'error', badBg: undefined, warn: 'warning', label: 'error', strong: 'permission',
  hlFg: 'inverseText', hlBg: 'warning', code: 'suggestion', codeBg: undefined, link: 'ide', number: 'claude', quote: 'merged',
  decorator: 'merged', property: 'ide', punct: 'inactive', italic: undefined, dim: 'inactive', rule: 'subtle',
  zebra: undefined, page, mermaid: mermaidConfig,
})

export const PALETTES: Record<ThemeKind, PaletteSet> = {
  dark: DARK,
  light: fromRoles(LIGHT_ROLES),
  'dark-cb': fromRoles(DARK_CB_ROLES),
  'light-cb': fromRoles(LIGHT_CB_ROLES),
  'dark-ansi': fromRoles(ansiRoles(DARK_MERMAID, '#111111')),
  'light-ansi': fromRoles(ansiRoles(LIGHT_MERMAID, '#FFFFFF')),
}
