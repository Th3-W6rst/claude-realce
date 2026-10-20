import { PALETTES, type Paint, type PaletteSet } from '../palettes'
import { parseBlocks, type Block } from '../text/blocks'
import { parseInline, type InlineOpts, type Span } from '../text/inline'
import { parseTable } from '../text/table'

export type Picture = { file: string; width: number; height: number }

const PAGE_WIDTH = 960
const LINE_PX = 22
const CHARS_PER_LINE = 100

/** A path as a file:// URL: spaces and the like percent-encoded, the slashes kept. */
export const fileUrl = (path: string) => `file://${encodeURI(path).replace(/[#?]/g, c => encodeURIComponent(c))}`

const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function css(p: Paint): string {
  const out: string[] = []
  if (p.color !== undefined) out.push(`color: ${p.color}`)
  if (p.backgroundColor !== undefined) out.push(`background: ${p.backgroundColor}`)
  if (p.italic === true) out.push('font-style: italic')
  const lines = [p.underline === true ? 'underline' : '', p.strikethrough === true ? 'line-through' : ''].filter(Boolean)
  if (lines.length > 0) out.push(`text-decoration: ${lines.join(' ')}`)
  if (p.dimColor === true) out.push('opacity: 0.6')
  return out.join('; ')
}

const styled = (tag: string, style: string, inner: string) => (style === '' ? `<${tag}>${inner}</${tag}>` : `<${tag} style="${style}">${inner}</${tag}>`)

function spansHtml(spans: readonly Span[], palette: PaletteSet): string {
  return spans
    .map(s => {
      const paint: Paint = Object.assign({}, ...s.kinds.map(k => palette.PROSE[k]))
      const style = css(paint)
      return style === '' ? escapeHtml(s.text) : `<span style="${style}">${escapeHtml(s.text)}</span>`
    })
    .join('')
}

// The reading aids the screen draws with, set once per page.
let pageOpts: InlineOpts = {}

const inline = (text: string, palette: PaletteSet, isLineStart = true) => spansHtml(parseInline(text, [], isLineStart, pageOpts), palette)

function blockHtml(b: Block, palette: PaletteSet, picture: (source: string) => Picture | null): string {
  if (b.type === 'paragraph') return `<p>${b.lines.map(l => inline(l, palette)).join('<br>')}</p>`
  if (b.type === 'heading') {
    const paint = palette.BLOCK[b.level === 1 ? 'heading1' : b.level === 2 ? 'heading2' : 'heading3']
    return styled(`h${Math.min(b.level, 3)}`, css(paint), inline(b.text, palette, false))
  }
  if (b.type === 'item') {
    const marker = b.check === null ? (b.isOrdered ? b.marker : '•') : b.check ? '☑' : '☐'
    const markerPaint = palette.BLOCK[b.isOrdered ? 'ordinal' : 'bullet']
    return `<div style="padding-left: ${b.depth * 1.5 + 1.5}em; text-indent: -1.5em">${styled('span', css(markerPaint), escapeHtml(marker))} ${b.lines.map(l => inline(l, palette)).join('<br>')}</div>`
  }
  if (b.type === 'quote') return `<blockquote style="border-left: 2px solid ${palette.SCREEN.dim}; margin: 0; padding-left: 1em">${b.lines.map(l => inline(l, palette)).join('<br>')}</blockquote>`
  if (b.type === 'callout') {
    const color = palette.CALLOUT[b.kind]
    const title = b.title === '' ? '' : `<div style="color: ${color}">${inline(b.title, palette, false)}</div>`
    return `<div style="border: 1px solid ${color}; border-radius: 6px; padding: 8px 12px; margin: 8px 0">${title}${b.lines.map(l => inline(l, palette)).join('<br>')}</div>`
  }
  if (b.type === 'code') {
    const pic = b.language.toLowerCase() === 'mermaid' ? picture(b.source) : null
    if (pic !== null) return `<img src="${escapeHtml(fileUrl(pic.file))}" style="width: ${Math.min(PAGE_WIDTH, pic.width / 2)}px" alt="Diagrama">`
    const back = palette.BG.code === undefined ? '' : `background: ${palette.BG.code}; `
    return `<pre style="${back}padding: 8px 12px; border-radius: 4px; white-space: pre-wrap">${escapeHtml(b.source)}</pre>`
  }
  if (b.type === 'table') {
    const t = parseTable(b.text)
    const head = t.header.map(h => styled('th', `${css(palette.TABLE.header)}; text-align: left; padding: 2px 12px 2px 0`, inline(h, palette, false))).join('')
    const rows = t.rows.map((r, i) => `<tr${i % 2 === 1 && palette.BG.zebra !== undefined ? ` style="background: ${palette.BG.zebra}"` : ''}>${r.map(c => `<td style="padding: 2px 12px 2px 0">${inline(c, palette, false)}</td>`).join('')}</tr>`).join('')
    return `<table style="border-collapse: collapse">${`<tr>${head}</tr>`}${rows}</table>`
  }
  return `<hr style="border: 0; border-top: 1px solid ${palette.SCREEN.rule}">`
}

/** The reply as a standalone page in `palette`: what /realce print shoots. */
export function replyHtml(text: string, themePalette: PaletteSet, picture: (source: string) => Picture | null, opts: InlineOpts = {}): string {
  pageOpts = opts
  // An ANSI palette names the theme's keys, which only the terminal resolves: a page takes the hex palette of the
  // same lightness.
  const isKeyed = !(themePalette.PROSE.good.color ?? '#').startsWith('#')
  const palette = isKeyed ? PALETTES[themePalette.BG.page === '#FFFFFF' ? 'light' : 'dark'] : themePalette
  const page = palette.BG.page
  const ink = String(palette.MERMAID.themeVariables.textColor)
  const body = parseBlocks(text)
    .map(b => blockHtml(b, palette, picture))
    .join('\n')
  return `<!doctype html><html><head><meta charset="utf-8"><style>html, body { margin: 0; background: ${page}; } body { color: ${ink}; font: 15px/${LINE_PX}px Menlo, monospace; width: ${PAGE_WIDTH}px; padding: 20px; } p { margin: 0 0 10px; } h1, h2, h3 { font-size: 15px; font-weight: normal; margin: 14px 0 6px; }</style></head><body style="background: ${page}">\n${body}\n</body></html>`
}

/** The page's height in pixels, for the screenshot's window: rows of text plus the pictures at their drawn size. */
export function estimateHeight(
  text: string,
  pictures: readonly { width: number; height: number }[],
  isPictured: (source: string) => boolean = () => pictures.length > 0,
): number {
  // A mermaid block drawn as its picture takes the picture's height, not its source's rows; one still drawn as code
  // keeps them.
  const rowsOf = (line: string) => Math.max(1, Math.ceil([...line].length / CHARS_PER_LINE))
  let rows = 0
  let fence: { isMermaid: boolean; lines: string[] } | null = null
  for (const line of text.split('\n')) {
    const mark = /^\s*```\s*(\S*)/.exec(line)
    if (fence === null && mark !== null) {
      fence = { isMermaid: mark[1]!.toLowerCase() === 'mermaid', lines: [line] }
    } else if (fence !== null && mark !== null && mark[1] === '') {
      fence.lines.push(line)
      if (!(fence.isMermaid && isPictured(fence.lines.slice(1, -1).join('\n')))) rows += fence.lines.reduce((n, l) => n + rowsOf(l), 0)
      fence = null
    } else if (fence !== null) fence.lines.push(line)
    else rows += rowsOf(line)
  }
  if (fence !== null) rows += fence.lines.reduce((n, l) => n + rowsOf(l), 0)
  const images = pictures.reduce((n, p) => {
    const width = Math.min(PAGE_WIDTH, p.width / 2)
    return n + (p.height / p.width) * width
  }, 0)
  return Math.max(200, Math.ceil(rows * LINE_PX + images + 80))
}
