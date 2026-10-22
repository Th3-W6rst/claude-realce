import { read, update } from 'claude-code'
import type { Elements, EngineInterface, On, RenderElement } from 'claude-code'

import { flagsVersion, getFlags } from '../flags'
import { plural } from '../format'
import { languageVersion, tr } from '../i18n'
import { memo } from '../memo'
import { FOLD_AT, FOLD_SHOW, foldLabel } from '../layout'
import { CODE, SCREEN } from '../palette'
import { timed } from '../perf'
import { currentTheme } from '../theme'
import { asRecord, str } from '../safe'
import { wordDiff, type DiffPiece } from './wordDiff'

const FOLDS = { plugin: 'realce', key: 'folds' } as const

type T = Pick<Elements['terminal'], 'Box' | 'Text' | 'Button'>

/** One drawn row of a patch; `pair` is the text of the line it replaced or was replaced by, for the word diff. */
type DiffLine = { kind: 'add' | 'del' | 'ctx' | 'hunk'; text: string; lineNo: number | null; pair?: string }

/** A stored `structuredPatch` as rows: a header per hunk, then its lines numbered in the new file. */
export function diffLines(structuredPatch: unknown): DiffLine[] {
  const out: DiffLine[] = []
  for (const hunk of Array.isArray(structuredPatch) ? structuredPatch.map(asRecord) : []) {
    let lineNo = typeof hunk.newStart === 'number' ? hunk.newStart : 1
    out.push({ kind: 'hunk', text: tr(`@@ line ${lineNo}`, `@@ linha ${lineNo}`), lineNo: null })
    const lines = Array.isArray(hunk.lines) ? hunk.lines.filter((l): l is string => typeof l === 'string') : []
    let dels: DiffLine[] = []
    let adds: DiffLine[] = []
    // A run of removed lines then a run of added ones: the i-th of each are one line edited.
    const pairRuns = () => {
      for (let i = 0; i < Math.min(dels.length, adds.length); i++) {
        dels[i]!.pair = adds[i]!.text
        adds[i]!.pair = dels[i]!.text
      }
      dels = []
      adds = []
    }
    for (const line of lines) {
      const sign = line[0]
      const text = line.slice(1)
      if (sign === '\\') continue
      if (sign === '-') {
        if (adds.length > 0) pairRuns()
        const row: DiffLine = { kind: 'del', text, lineNo: null }
        dels.push(row)
        out.push(row)
      } else if (sign === '+') {
        const row: DiffLine = { kind: 'add', text, lineNo: lineNo++ }
        adds.push(row)
        out.push(row)
      } else {
        pairRuns()
        out.push({ kind: 'ctx', text, lineNo: lineNo++ })
      }
    }
    pairRuns()
  }
  return out
}

const gutter = (lineNo: number | null) => (lineNo === null ? '    ' : String(lineNo).padStart(4))

function pieceRuns(t: T, pieces: readonly DiffPiece[], color: string | undefined, word: 'diffAddedWord' | 'diffRemovedWord'): RenderElement[] {
  const { Text } = t
  // An ANSI theme has no word background of its own: the changed words are underlined there.
  const isAnsi = currentTheme().endsWith('ansi')
  return pieces.map(p =>
    // On the theme's word background its own text color reads in both light and dark; the line's color may not.
    !p.isChanged ? (p.text as unknown as RenderElement) : isAnsi ? <Text color={color} underline>{p.text}</Text> : <Text color="text" backgroundColor={word}>{p.text}</Text>,
  )
}

/** The line's changed words: each edited pair is diffed once, for both its rows, and kept while a scroll redraws it. */
function linePieces(line: DiffLine): DiffPiece[] | null {
  if (line.pair === undefined) return null
  const [before, after] = line.kind === 'add' ? [line.pair, line.text] : [line.text, line.pair]
  const diff = memo('wordDiff', JSON.stringify([before, after]), () => wordDiff(before, after), 5000)
  return (line.kind === 'add' ? diff?.added : diff?.removed) ?? null
}

function lineRow(t: T, line: DiffLine, words: DiffPiece[] | null): RenderElement {
  const { Text } = t
  if (line.kind === 'hunk') return <Text color={SCREEN.dim}>{line.text}</Text>
  if (line.kind === 'ctx') return <Text color={SCREEN.dim} wrap="truncate-end">{`${gutter(line.lineNo)}   ${line.text}`}</Text>
  const isAdd = line.kind === 'add'
  const color = (isAdd ? CODE.added : CODE.removed).color
  return (
    <Text color={color} wrap="truncate-end">
      {`${gutter(line.lineNo)} ${isAdd ? '+' : '-'} `}
      {words === null ? line.text : pieceRuns(t, words, color, isAdd ? 'diffAddedWord' : 'diffRemovedWord')}
    </Text>
  )
}

// Past this an open diff would outgrow what the engine draws for one row (20 000 nodes): the rest is the file's.
const MAX_OPEN = 400

/** The first `count` lines of content and the hunk headers among them. */
function firstRows(lines: readonly DiffLine[], count: number): DiffLine[] {
  const out: DiffLine[] = []
  let content = 0
  for (const line of lines) {
    if (line.kind !== 'hunk' && content === count) break
    out.push(line)
    if (line.kind !== 'hunk') content++
  }
  return out
}

function patchTree(t: T, lines: readonly DiffLine[], isLong: boolean, isOpen: boolean, onFold: () => void): RenderElement {
  const { Box, Text, Button } = t
  const content = lines.filter(l => l.kind !== 'hunk').length
  const shown = isLong && !isOpen ? firstRows(lines, FOLD_SHOW) : firstRows(lines, MAX_OPEN)
  const hidden = content - shown.filter(l => l.kind !== 'hunk').length
  return (
    <Box key="realce-diff" flexDirection="column">
      {shown.map(line => lineRow(t, line, linePieces(line)))}
      {(!isLong || isOpen) && hidden > 0 && <Text color={SCREEN.dim}>{tr(`… and ${hidden} more lines: open the file to see them all`, `… e mais ${hidden} linhas: abra o arquivo para ver tudo`)}</Text>}
      {isLong && (
        <Button plain key="diff-fold" dimColor onPress={onFold}>
          {foldLabel(isOpen, content - FOLD_SHOW)}
        </Button>
      )}
    </Box>
  )
}

function newFileTree(t: T, content: string): RenderElement {
  const { Box, Text } = t
  const lines = content.replace(/\n$/, '').split('\n')
  return (
    <Box key="realce-diff" flexDirection="column">
      {lines.slice(0, FOLD_SHOW).map((text, i) => (
        <Text color={CODE.added.color} wrap="truncate-end">{`${gutter(i + 1)} + ${text}`}</Text>
      ))}
      <Text color={SCREEN.dim}>{tr(`${plural(lines.length, 'line', 'lines')} in the new file`, `${plural(lines.length, 'linha', 'linhas')} no arquivo novo`)}</Text>
    </Box>
  )
}

async function setFold($: EngineInterface, id: string, isOpen: boolean): Promise<void> {
  await update($, { ...FOLDS, id }, () => isOpen)
}

export function registerDiff(on: On): void {
  on('ui.render', { component: 'ToolResult', props: { tool: ['Edit', 'Write', 'NotebookEdit'] } }, async ($, e, next) => timed('ToolResult:diff', async () => {
    const flags = await getFlags($)
    if (e.surface === 'terminal' && flags.foco && !e.props.isErrored && e.props.isExpanded !== true) {
      const { Box } = $.ui.resolve(e)
      return <Box key="realce-hidden" />
    }
    if (!flags.diff || e.surface !== 'terminal' || e.props.isErrored) return next(e)
    const out = asRecord(e.props.output)
    const id = `diff:${e.props.tool_use_id}`
    if (e.props.tool === 'Write' && out.type === 'create') {
      const content = str(out.content)
      if (content === null) return next(e)
      return memo('ToolResult:new', `${id}|${flagsVersion()}`, () => newFileTree($.ui.resolve(e), content))
    }
    if (!Array.isArray(out.structuredPatch) || out.structuredPatch.length === 0) return next(e)
    // The hunk headers speak the language: a change of it parses the rows again.
    const lines = memo('diffLines', `${id}|${languageVersion()}`, () => diffLines(out.structuredPatch), 500)
    // ctrl+o shows every line: a long diff folds only in the compact view.
    const isLong = flags.dobrar && e.props.isExpanded !== true && lines.filter(l => l.kind !== 'hunk').length > FOLD_AT
    const isOpen = isLong && (await read($, { ...FOLDS, id })) === true
    // The tree holds the fold's handler: rebuilt per draw, from rows that are memoized.
    return patchTree($.ui.resolve(e), lines, isLong, isOpen, () => void setFold($, id, !isOpen))
  }))
}
