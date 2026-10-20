import { isMermaid } from '../code/diagram'
import { fileUrl } from '../code/links'
import { tr } from '../i18n'
import { PALETTES, type Paint, type PaletteSet } from '../paletteSets'
import { closesFence, headingKind, itemMark, openFence, parseBlocks, type Block, type Fence } from '../text/blocks'
import { parseInline, type InlineOpts, type Span } from '../text/inline'
import { spanPaint } from '../text/render'
import { parseTable } from '../text/table'

export type Picture = { file: string; width: number; height: number }

const PAGE_WIDTH = 960
const LINE_PX = 22
const CHARS_PER_LINE = 100

/** The headless browser's arguments for a screenshot of `page`: `/realce print`'s and the README's pictures. */
export const shotArgs = (chrome: string, png: string, height: number, page: string): string[] =>
  [chrome, '--headless', '--disable-gpu', '--hide-scrollbars', `--screenshot=${png}`, `--window-size=1000,${height}`, fileUrl(page)]

const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function css(p: Paint & { bold?: boolean }): string {
  const out: string[] = []
  if (p.bold === true) out.push('font-weight: bold')
  if (p.color !== undefined) out.push(`color: ${p.color}`)
  if (p.backgroundColor !== undefined) out.push(`background: ${p.backgroundColor}`)
  if (p.italic === true) out.push('font-style: italic')
  const lines = [p.underline === true ? 'underline' : '', p.strikethrough === true ? 'line-through' : ''].filter(Boolean)
  if (lines.length > 0) out.push(`text-decoration: ${lines.join(' ')}`)
  if (p.dimColor === true) out.push('opacity: 0.6')
  return out.join('; ')
}

const styled = (tag: string, style: string, inner: string) => (style === '' ? `<${tag}>${inner}</${tag}>` : `<${tag} style="${style}">${inner}</${tag}>`)

/** The page's palette and the reading aids the screen draws with. */
type Page = { palette: PaletteSet; opts: InlineOpts }

function spansHtml(spans: readonly Span[], page: Page): string {
  return spans
    .map(s => {
      const style = css(spanPaint(s.kinds, page.palette.PROSE, page.opts.enfase !== false))
      return style === '' ? escapeHtml(s.text) : `<span style="${style}">${escapeHtml(s.text)}</span>`
    })
    .join('')
}

const inline = (text: string, page: Page, isLineStart = true) => spansHtml(parseInline(text, [], isLineStart, page.opts), page)

function blockHtml(b: Block, page: Page, picture: (source: string) => Picture | null): string {
  const { palette } = page
  const lines = (source: readonly string[]) => source.map(l => inline(l, page)).join('<br>')
  if (b.type === 'paragraph') return `<p>${lines(b.lines)}</p>`
  if (b.type === 'heading') return styled(`h${Math.min(b.level, 3)}`, css(palette.BLOCK[headingKind(b.level)]), inline(b.text, page, false))
  if (b.type === 'item') {
    const { mark, kind } = itemMark(b)
    return `<div style="padding-left: ${b.depth * 1.5 + 1.5}em; text-indent: -1.5em">${styled('span', css(palette.BLOCK[kind]), escapeHtml(mark))} ${lines(b.lines)}</div>`
  }
  if (b.type === 'quote') return `<blockquote style="border-left: 2px solid ${palette.SCREEN.dim}; margin: 0; padding-left: 1em">${lines(b.lines)}</blockquote>`
  if (b.type === 'callout') {
    const color = palette.CALLOUT[b.kind]
    const title = b.title === '' ? '' : `<div style="color: ${color}">${inline(b.title, page, false)}</div>`
    return `<div style="border: 1px solid ${color}; border-radius: 6px; padding: 8px 12px; margin: 8px 0">${title}${lines(b.lines)}</div>`
  }
  if (b.type === 'code') {
    const pic = isMermaid(b.language) ? picture(b.source) : null
    if (pic !== null) return `<img src="${escapeHtml(fileUrl(pic.file))}" style="width: ${Math.min(PAGE_WIDTH, pic.width / 2)}px" alt="${escapeHtml(tr('Diagram', 'Diagrama'))}">`
    const back = palette.BG.code === undefined ? '' : `background: ${palette.BG.code}; `
    return `<pre style="${back}padding: 8px 12px; border-radius: 4px; white-space: pre-wrap">${escapeHtml(b.source)}</pre>`
  }
  if (b.type === 'table') {
    const t = parseTable(b.text)
    const head = t.header.map(h => styled('th', `${css(palette.TABLE.header)}; text-align: left; padding: 2px 12px 2px 0`, inline(h, page, false))).join('')
    const rows = t.rows.map((r, i) => `<tr${i % 2 === 1 && palette.BG.zebra !== undefined ? ` style="background: ${palette.BG.zebra}"` : ''}>${r.map(c => `<td style="padding: 2px 12px 2px 0">${inline(c, page, false)}</td>`).join('')}</tr>`).join('')
    return `<table style="border-collapse: collapse">${`<tr>${head}</tr>`}${rows}</table>`
  }
  return `<hr style="border: 0; border-top: 1px solid ${palette.SCREEN.rule}">`
}

/** The reply as a standalone page in `palette`: what /realce print shoots. */
export function replyHtml(text: string, themePalette: PaletteSet, picture: (source: string) => Picture | null, opts: InlineOpts): string {
  // An ANSI palette names the theme's keys, which only the terminal resolves: a page takes the hex palette of the
  // same lightness.
  const isKeyed = !(themePalette.PROSE.good.color ?? '#').startsWith('#')
  const palette = isKeyed ? PALETTES[themePalette.BG.page === '#FFFFFF' ? 'light' : 'dark'] : themePalette
  const back = palette.BG.page
  const ink = String(palette.MERMAID.themeVariables.textColor)
  const body = parseBlocks(text)
    .map(b => blockHtml(b, { palette, opts }, picture))
    .join('\n')
  return `<!doctype html><html><head><meta charset="utf-8"><style>html, body { margin: 0; background: ${back}; } body { color: ${ink}; font: 15px/${LINE_PX}px Menlo, monospace; width: ${PAGE_WIDTH}px; padding: 20px; } p { margin: 0 0 10px; } h1, h2, h3 { font-size: 15px; font-weight: normal; margin: 14px 0 6px; }</style></head><body style="background: ${back}">\n${body}\n</body></html>`
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
  let fence: { open: Fence; lines: string[] } | null = null
  for (const line of text.split('\n')) {
    if (fence === null) {
      const open = openFence(line)
      if (open === null) rows += rowsOf(line)
      else fence = { open, lines: [line] }
      continue
    }
    fence.lines.push(line)
    if (!closesFence(line, fence.open)) continue
    if (!(isMermaid(fence.open.language) && isPictured(fence.lines.slice(1, -1).join('\n')))) rows += fence.lines.reduce((n, l) => n + rowsOf(l), 0)
    fence = null
  }
  if (fence !== null) rows += fence.lines.reduce((n, l) => n + rowsOf(l), 0)
  const images = pictures.reduce((n, p) => {
    const width = Math.min(PAGE_WIDTH, p.width / 2)
    return n + (p.height / p.width) * width
  }, 0)
  return Math.max(200, Math.ceil(rows * LINE_PX + images + 80))
}
