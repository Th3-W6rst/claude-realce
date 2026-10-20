import type { RenderElement } from 'claude-code'

import { renderCodeBlock } from '../code/codeBlock'
import { READING_WIDTH } from '../layout'
import { BLOCK, CALLOUT, PROSE, type Paint, type ProseKind } from '../palette'
import { headingKind, itemMark, type Block } from './blocks'
import type { RenderCtx } from './ctx'
import { inlineOptsOf, plainText, spansOf, toPlainMarkdown, type Span } from './inline'
import { renderTable } from './table'
import { tr } from '../i18n'

// With enfase off these draw as the engine draws `**x**`: the one place this mod uses bold.
const MARKS: ReadonlySet<ProseKind> = new Set(['label', 'strong', 'highlight', 'good', 'bad', 'warn'])

/** A span's paint in `prose`, the screen's and the print's alike. */
export function spanPaint(kinds: readonly ProseKind[], prose: Readonly<Record<ProseKind, Paint>>, isEnfase: boolean): Paint & { bold?: boolean } {
  if (isEnfase) return Object.assign({}, ...kinds.map(k => prose[k]))
  // A path keeps its link (caminhos) but not its color.
  return Object.assign({}, ...kinds.filter(k => k !== 'path').map(k => (MARKS.has(k) ? { bold: true } : prose[k])))
}

// From this many lines a reply gets its own copy button: shorter ones are easy to select.
const COPY_REPLY_LINES = 15

/** One reply block's markdown as a tree of colored rows. */
export function renderReply(ctx: RenderCtx, blocks: readonly Block[]): RenderElement {
  const { Box, Button } = ctx.t
  const isLong = ctx.flags.copiar && ctx.text.split('\n').length >= COPY_REPLY_LINES
  // Prose reads best in a column; code, tables and diagrams keep the whole width.
  const column = ctx.flags.coluna ? { width: Math.max(1, Math.min(READING_WIDTH, ctx.columns - 2)) } : {}
  const proseWidth = ctx.flags.coluna ? Math.min(READING_WIDTH, ctx.columns - 2) : ctx.columns - 2
  let codeIndex = 0
  let tableIndex = 0
  return (
    <Box flexDirection="column">
      {blocks.map((block, n) => (
        <Box
          key={`block-${n}`}
          flexDirection="column"
          marginTop={block.hasGapBefore || (ctx.flags.respiro && breathes(blocks[n - 1], block, proseWidth)) ? 1 : 0}
          {...(block.type === 'code' || block.type === 'table' ? {} : column)}
        >
          {renderBlock(ctx, block, block.type === 'code' ? codeIndex++ : -1, block.type === 'table' ? tableIndex++ : -1)}
        </Box>
      ))}
      {isLong && (
        <Box marginTop={1}>
          <Button plain key="copy-reply" dimColor onPress={() => ctx.onCopy(toPlainMarkdown(ctx.text))}>
            {tr('Copy reply', 'Copiar resposta')}
          </Button>
        </Box>
      )}
    </Box>
  )
}

// A blank line between list items when either wraps, but never between an item and the sub-items it opens.
function breathes(previous: Block | undefined, block: Block, width: number): boolean {
  if (previous?.type !== 'item' || block.type !== 'item' || block.depth > previous.depth) return false
  return wraps(previous, width) || wraps(block, width)
}

function wraps(item: Extract<Block, { type: 'item' }>, width: number): boolean {
  const room = width - item.depth * 2 - item.marker.length - 1
  return item.lines.length > 1 || plainText(spansOf(item.lines[0] ?? '', true, { deltas: false })).length > room
}

function renderBlock(ctx: RenderCtx, block: Block, codeIndex: number, tableIndex: number): RenderElement {
  const { Box, Text, Markdown } = ctx.t
  switch (block.type) {
    case 'paragraph':
      return block.indent === undefined ? <Text>{lines(ctx, block.lines)}</Text> : (
        <Box marginLeft={block.indent}>
          <Text>{lines(ctx, block.lines)}</Text>
        </Box>
      )
    case 'heading':
      return <Text {...BLOCK[headingKind(block.level)]}>{drawSpans(ctx, spansOf(block.text, false, inlineOptsOf(ctx.flags)))}</Text>
    case 'item': {
      const { mark, kind } = itemMark(block)
      const paint = BLOCK[kind]
      return (
        <Box flexDirection="row" marginLeft={block.depth * 2}>
          <Box width={mark.length + 1} flexShrink={0}>
            <Text {...paint}>{mark}</Text>
          </Box>
          <Box flexGrow={1} flexShrink={1}>
            <Text>{lines(ctx, block.lines)}</Text>
          </Box>
        </Box>
      )
    }
    case 'quote':
      return quote(ctx, block.lines)
    case 'callout': {
      if (!ctx.flags.callouts) return quote(ctx, block.raw)
      const { color, title } = CALLOUT[block.kind]
      const own = plainText(spansOf(block.title, false, { deltas: false }))
      return (
        <Box flexDirection="column" borderStyle="round" borderColor={color} paddingX={1}>
          <Text color={color}>{own === '' ? title : `${title} · ${own}`}</Text>
          {block.lines.length > 0 && <Text>{lines(ctx, block.lines)}</Text>}
        </Box>
      )
    }
    case 'code':
      return renderCodeBlock(ctx, block, codeIndex)
    case 'table':
      // With tabelas off the engine lays the table out; the typed emphasis becomes bold there.
      return ctx.flags.tabelas ? renderTable(ctx, block.text, `table-${tableIndex}`) : <Markdown text={toPlainMarkdown(block.text)} />
    case 'rule':
      return <Text {...BLOCK.rule}>{'─'.repeat(Math.max(3, Math.min(ctx.columns - 4, 72)))}</Text>
  }
}

function quote(ctx: RenderCtx, source: string[]): RenderElement {
  const { Box, Text } = ctx.t
  return (
    <Box flexDirection="row">
      <Box width={2} flexShrink={0}>
        <Text {...BLOCK.quoteBar}>{source.map(() => '▎').join('\n')}</Text>
      </Box>
      <Box flexGrow={1} flexShrink={1}>
        <Text italic>{lines(ctx, source)}</Text>
      </Box>
    </Box>
  )
}

function lines(ctx: RenderCtx, source: string[]) {
  const opts = inlineOptsOf(ctx.flags)
  return source.flatMap((line, n) => [...(n > 0 ? ['\n'] : []), ...drawSpans(ctx, spansOf(line, true, opts))])
}

/** Painted runs of one line, a path or URL wrapped in its link. */
export function drawSpans(ctx: RenderCtx, list: readonly Span[]) {
  const { Text, Link } = ctx.t
  return list.map(span => {
    const paint = spanPaint(span.kinds, PROSE, ctx.flags.enfase)
    const href = span.href ?? (span.kinds.includes('path') ? ctx.hrefForPath(span.text) : null)
    const isPlain = Object.keys(paint).length === 0
    if (isPlain && (href === null || href === undefined)) return span.text
    const styled = <Text {...paint}>{span.text}</Text>
    return href === null || href === undefined ? styled : <Link href={href}>{styled}</Link>
  })
}
