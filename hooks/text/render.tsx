import type { RenderElement } from 'claude-code'

import { renderCodeBlock } from '../code/codeBlock'
import { BLOCK, CALLOUT, PROSE, READING_WIDTH, type Paint, type ProseKind } from '../palette'
import type { Block } from './blocks'
import type { RenderCtx } from './ctx'
import { parseInline, plainText, toPlainMarkdown, type InlineOpts, type Span } from './inline'
import { parseTable, renderTable } from './table'

// With enfase off these draw as the engine draws `**x**`: the one place this mod uses bold.
const MARKS: ReadonlySet<ProseKind> = new Set(['label', 'strong', 'highlight', 'good', 'bad', 'warn'])

function paintOf(ctx: RenderCtx, span: Span): Paint & { bold?: boolean } {
  if (ctx.flags.enfase) return Object.assign({}, ...span.kinds.map(k => PROSE[k]))
  // A path keeps its link (caminhos) but not its color.
  return Object.assign({}, ...span.kinds.filter(k => k !== 'path').map(k => (MARKS.has(k) ? { bold: true } : PROSE[k])))
}

export const inlineOpts = (ctx: RenderCtx): InlineOpts => ({ enfase: ctx.flags.enfase, deltas: ctx.flags.deltas, numeros: ctx.flags.numeros })

/** One reply block's markdown as a tree of colored rows. */
export function renderReply(ctx: RenderCtx, blocks: readonly Block[]): RenderElement {
  const { Box } = ctx.t
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
  return item.lines.length > 1 || plainText(parseInline(item.lines[0] ?? '', [], true, { deltas: false })).length > room
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
    case 'heading': {
      const paint = block.level === 1 ? BLOCK.heading1 : block.level === 2 ? BLOCK.heading2 : BLOCK.heading3
      return <Text {...paint}>{drawSpans(ctx, parseInline(block.text, [], false, inlineOpts(ctx)))}</Text>
    }
    case 'item': {
      const mark = block.check !== null ? (block.check ? '☑' : '☐') : block.isOrdered ? block.marker : depthBullet(block.depth)
      const paint = block.check !== null ? (block.check ? BLOCK.checkDone : BLOCK.checkOpen) : block.isOrdered ? BLOCK.ordinal : BLOCK.bullet
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
      const own = plainText(parseInline(block.title, [], false, { deltas: false }))
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
      return ctx.flags.tabelas ? renderTable(ctx, parseTable(block.text), `table-${tableIndex}`) : <Markdown text={toPlainMarkdown(block.text)} />
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

const depthBullet = (depth: number) => ['•', '◦', '▪'][depth % 3]!

function lines(ctx: RenderCtx, source: string[]) {
  const opts = inlineOpts(ctx)
  return source.flatMap((line, n) => [...(n > 0 ? ['\n'] : []), ...drawSpans(ctx, parseInline(line, [], true, opts))])
}

/** Painted runs of one line, a path or URL wrapped in its link. */
export function drawSpans(ctx: RenderCtx, list: readonly Span[]) {
  const { Text, Link } = ctx.t
  return list.map(span => {
    const paint = paintOf(ctx, span)
    const href = span.href ?? (span.kinds.includes('path') ? ctx.hrefForPath(span.text) : null)
    const isPlain = Object.keys(paint).length === 0
    if (isPlain && (href === null || href === undefined)) return span.text
    const styled = <Text {...paint}>{span.text}</Text>
    return href === null || href === undefined ? styled : <Link href={href}>{styled}</Link>
  })
}
