// Every palette the mod paints with, one per class of the person's Claude Code theme, each built from a short list of
// roles so every kind keeps its meaning in every theme. The dark one is the neon the mod was made in.
// Colors only, never bold: Ghostty's `bold-color` repaints bold runs in one fixed red.

export type Paint = { color?: string; backgroundColor?: string; italic?: boolean; underline?: boolean; strikethrough?: boolean; dimColor?: boolean }

export type ThemeKind = 'dark' | 'light' | 'dark-cb' | 'light-cb' | 'dark-ansi' | 'light-ansi'

export type CalloutKind = 'decision' | 'risk' | 'done' | 'summary' | 'note' | 'tip'

export type ProseKind =
  | 'label' | 'strong' | 'highlight' | 'good' | 'bad' | 'warn' | 'code' | 'path' | 'number' | 'quote' | 'link' | 'italic'
  | 'strike' | 'statusGood' | 'statusBad' | 'statusWarn' | 'delta' | 'aside'

export type BlockKind = 'heading1' | 'heading2' | 'heading3' | 'bullet' | 'ordinal' | 'checkDone' | 'checkOpen' | 'quoteBar' | 'rule' | 'codeLabel'

export type CodeKind =
  | 'keyword' | 'string' | 'number' | 'constant' | 'comment' | 'function' | 'type' | 'property' | 'operator' | 'punctuation'
  | 'decorator' | 'variable' | 'flag' | 'key' | 'added' | 'removed' | 'hunk' | 'meta'

export type ScreenTone = 'dim' | 'rule' | 'ok' | 'bad' | 'warn' | 'edit' | 'run' | 'agent' | 'web' | 'plan' | 'mcp'

type MermaidConfig = { theme: 'base'; themeVariables: Record<string, string | boolean> }

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

/**
 * What a palette is built from: each role one color (undefined: the terminal's own). `codeBg` is inline code's,
 * `blockBg` a code block's.
 */
type Roles = {
  good: string; goodSoft: string; bad: string; badBg: string | undefined; warn: string; label: string; strong: string
  hlFg: string; hlBg: string; code: string; codeBg: string | undefined; blockBg: string | undefined; link: string; number: string; quote: string
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
    BG: { code: r.blockBg, zebra: r.zebra, page: r.page },
    CALLOUT: { decision: r.warn, risk: r.bad, done: r.good, summary: r.code, note: r.link, tip: r.strong },
    TABLE: { header: { ...color(r.code), underline: true } },
    MERMAID: r.mermaid,
  }
}

const LIGHT_MERMAID = mermaid({ dark: false, bg: '#FFFFFF', box: '#F4F5F8', cluster: '#F2F3F7', text: '#1A1A1A', border: '#00707A', line: '#A3246B', noteBg: '#FDE2E4', noteBorder: '#B3121B', rule: '#E3C8CC' })

const DARK_ROLES: Roles = {
  good: '#00FF41', goodSoft: '#5BD98C', bad: '#FF5C63', badBg: '#3D0A12', warn: '#E3BC46', label: '#FF3D45', strong: '#E06AA0',
  hlFg: '#111111', hlBg: '#E3BC46', code: '#24D3E0', codeBg: '#1B1B26', blockBg: '#16161E', link: '#5AA6DE', number: '#FF9E3D', quote: '#C3A6FF',
  decorator: '#B48EFF', property: '#9CDCFE', punct: '#8A8A9A', italic: '#D8C0BA', dim: '#6E6A86', rule: '#4D1A24',
  zebra: '#16161E', page: '#111111', mermaid: DARK_MERMAID,
}

const LIGHT_ROLES: Roles = {
  good: '#0A7D32', goodSoft: '#1E8A4C', bad: '#B3121B', badBg: '#FDE2E4', warn: '#9A6700', label: '#C4141C', strong: '#A3246B',
  hlFg: '#111111', hlBg: '#FFE066', code: '#00707A', codeBg: '#F4F5F8', blockBg: '#F4F5F8', link: '#1F5FA8', number: '#B35300', quote: '#6B3FC4',
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
  hlFg: 'inverseText', hlBg: 'warning', code: 'suggestion', codeBg: undefined, blockBg: undefined, link: 'ide', number: 'claude', quote: 'merged',
  decorator: 'merged', property: 'ide', punct: 'inactive', italic: undefined, dim: 'inactive', rule: 'subtle',
  zebra: undefined, page, mermaid: mermaidConfig,
})

export const DARK: PaletteSet = fromRoles(DARK_ROLES)

export const PALETTES: Record<ThemeKind, PaletteSet> = {
  dark: DARK,
  light: fromRoles(LIGHT_ROLES),
  'dark-cb': fromRoles(DARK_CB_ROLES),
  'light-cb': fromRoles(LIGHT_CB_ROLES),
  'dark-ansi': fromRoles(ansiRoles(DARK_MERMAID, '#111111')),
  'light-ansi': fromRoles(ansiRoles(LIGHT_MERMAID, '#FFFFFF')),
}
