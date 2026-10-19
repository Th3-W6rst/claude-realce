import type { RenderElement } from 'claude-code'

import { BLOCK, CODE, CODE_BACKGROUND, FOLD_AT, FOLD_SHOW, PROSE } from '../palette'
import type { Block } from '../text/blocks'
import type { RenderCtx } from '../text/ctx'
import { hashSource, imageCells, isMermaid } from './diagram'
import { highlight, isKnownLanguage } from './highlight'

export type CodeBlock = Extract<Block, { type: 'code' }>

/** A fenced block of a reply; `index` is its place among the reply's code blocks. */
export function renderCodeBlock(ctx: RenderCtx, block: CodeBlock, index: number): RenderElement {
  if (ctx.flags.diagramas && ctx.env !== null && ctx.env.mmdc !== null && isMermaid(block.language)) return renderDiagram(ctx, block, index)
  return renderCode(ctx, block, index)
}

/** A mermaid block: the picture once mmdc made it, else the code and where the picture stands. */
function renderDiagram(ctx: RenderCtx, block: CodeBlock, index: number): RenderElement {
  const { Box, Text, Image } = ctx.t
  const diagram = ctx.diagrams[hashSource(block.source)]
  if (diagram?.status === 'ready') {
    const { columns, rows } = imageCells(diagram, Math.max(1, ctx.columns - 2))
    return <Image source={{ file: diagram.file, format: 'png' }} alt="Diagrama" columns={columns} rows={rows} />
  }
  // No entry: the reply came before this session (or its load), when nothing marked it to render.
  const note =
    diagram === undefined ? <Text {...BLOCK.codeLabel}>O diagrama aparece quando a resposta terminar</Text>
    : diagram.status === 'rendering' ? <Text {...BLOCK.codeLabel}>Gerando diagrama…</Text>
    : <Text {...PROSE.statusBad}>Diagrama inválido: {diagram.error}</Text>
  return (
    <Box flexDirection="column">
      {renderCode(ctx, block, index)}
      {note}
    </Box>
  )
}

function renderCode(ctx: RenderCtx, block: CodeBlock, index: number): RenderElement {
  const { Box, Text, Button, Code } = ctx.t
  const lines = block.source.split('\n')
  const isLong = ctx.flags.dobrar && lines.length > FOLD_AT
  const isOpen = ctx.openFolds.has(index)
  // Only the shown lines are highlighted: a 2000-line block folded costs eight.
  const shown = isLong && !isOpen ? lines.slice(0, FOLD_SHOW).join('\n') : block.source
  const label = block.language === '' ? null : <Text {...BLOCK.codeLabel}>{block.language}</Text>
  const copy = ctx.flags.copiar ? (
    <Button plain key={`copy-${index}`} dimColor onPress={() => ctx.onCopy(block.source)}>
      Copiar
    </Button>
  ) : null
  const fold = isLong ? (
    <Button plain key={`fold-${index}`} dimColor onPress={() => ctx.onFold(index, !isOpen)}>
      {isOpen ? '▾ Recolher' : `▸ Mostrar mais ${lines.length - FOLD_SHOW} linhas`}
    </Button>
  ) : null
  const header =
    label !== null || copy !== null ? (
      <Box flexDirection="row">
        {label}
        <Box flexGrow={1} />
        {copy}
      </Box>
    ) : null

  // A language this mod has no grammar for keeps the engine's highlighter, as does the whole block with highlight off.
  if (!ctx.flags.highlight || (block.language !== '' && !isKnownLanguage(block.language))) {
    const code = block.language === '' ? <Code source={shown} /> : <Code source={shown} language={block.language} />
    if (copy === null && fold === null) return code
    return (
      <Box flexDirection="column">
        {header}
        {code}
        {fold}
      </Box>
    )
  }
  return (
    <Box flexDirection="column" backgroundColor={CODE_BACKGROUND} paddingX={1}>
      {header}
      {highlight(shown, block.language).map(line => (
        <Text>
          {line.length === 0 ? ' ' : line.map(tok => (tok.kind === undefined ? tok.text : <Text {...CODE[tok.kind]}>{tok.text}</Text>))}
        </Text>
      ))}
      {fold}
    </Box>
  )
}
