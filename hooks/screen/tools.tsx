import type { Elements, On, RenderElement } from 'claude-code'

import { highlight } from '../code/highlight'
import { cachedEnv } from '../env'
import { flagsVersion, getFlags } from '../flags'
import { memo } from '../memo'
import { CODE, SCREEN, type ScreenTone } from '../palette'
import type { Explanation, TestScore } from '../../types'
import { CARD_TONE, cardText, commitCards, type CommitCard } from './commit'
import { isAnswerExit, rememberAnswer, wasAnswer } from './explainError'
import { commitFor, explanationFor } from './notes'
import { formatScore, parseTestSummary } from './score'
import { asRecord, bashText, EDIT_TOOLS, editCounts, editedPath, shortPath, str } from './toolInfo'
import { timed } from '../perf'

type T = Pick<Elements['terminal'], 'Box' | 'Text'>

export type ToolKind = 'read' | 'edit' | 'run' | 'agent' | 'web' | 'plan' | 'mcp'

export type ToolSummary = { kind: ToolKind; icon: string; verb: string; target: string; added?: number; removed?: number; isNew?: boolean }

const READ_VERBS: Record<string, string> = { Read: 'Leu', NotebookRead: 'Leu', Grep: 'Buscou', Glob: 'Procurou', LS: 'Listou' }

const TASK_STATUS: Record<string, string> = { pending: 'pendente', in_progress: 'em andamento', completed: 'concluída', deleted: 'removida' }

/** A tool call as one row of its kind; null for a tool this mod leaves to the engine. */
export function summarizeTool(tool: string, input: unknown, cwd: string | null, output?: unknown): ToolSummary | null {
  const inp = asRecord(input)
  const path = (key: string) => shortPath(str(inp[key]) ?? '', cwd)
  if (tool in READ_VERBS) {
    const target = tool === 'Grep' || tool === 'Glob' ? str(inp.pattern) ?? '' : path(tool === 'NotebookRead' ? 'notebook_path' : tool === 'LS' ? 'path' : 'file_path')
    return { kind: 'read', icon: '◇', verb: READ_VERBS[tool]!, target }
  }
  if (EDIT_TOOLS.has(tool)) {
    const { added, removed, isNew } = editCounts(tool, input, output)
    return { kind: 'edit', icon: '✎', verb: tool === 'Write' ? 'Escreveu' : 'Editou', target: shortPath(editedPath(input) ?? '', cwd), added, removed, isNew }
  }
  if (tool === 'Bash') return { kind: 'run', icon: '▶', verb: '', target: str(inp.command) ?? '' }
  if (tool === 'BashOutput') return { kind: 'run', icon: '▶', verb: 'Saída de', target: str(inp.bash_id) ?? '' }
  if (tool === 'KillShell') return { kind: 'run', icon: '▶', verb: 'Encerrou', target: str(inp.shell_id) ?? '' }
  if (tool === 'Agent' || tool === 'Task') {
    const type = str(inp.subagent_type)
    return { kind: 'agent', icon: '◆', verb: type ? `Agente ${type}:` : 'Agente:', target: str(inp.description) ?? '' }
  }
  if (tool === 'WebSearch') return { kind: 'web', icon: '◎', verb: 'Buscou:', target: str(inp.query) ?? '' }
  if (tool === 'WebFetch') return { kind: 'web', icon: '◎', verb: 'Abriu:', target: str(inp.url) ?? '' }
  if (tool === 'TodoWrite') {
    const todos = Array.isArray(inp.todos) ? inp.todos.map(asRecord) : []
    return { kind: 'plan', icon: '☰', verb: 'Plano:', target: `${todos.filter(t => t.status === 'completed').length}/${todos.length}` }
  }
  if (tool === 'TaskCreate') return { kind: 'plan', icon: '☰', verb: 'Plano:', target: `+ ${str(inp.subject) ?? ''}` }
  if (tool === 'TaskUpdate') {
    const status = str(inp.status)
    return { kind: 'plan', icon: '☰', verb: 'Plano:', target: `#${str(inp.taskId) ?? '?'} ${status !== null ? (TASK_STATUS[status] ?? status) : 'atualizada'}` }
  }
  if (tool === 'TaskList') return { kind: 'plan', icon: '☰', verb: 'Plano:', target: 'lista' }
  if (tool === 'TaskGet') return { kind: 'plan', icon: '☰', verb: 'Plano:', target: `#${str(inp.taskId) ?? '?'}` }
  const mcp = /^mcp__(.+?)__(.+)$/.exec(tool)
  if (mcp !== null) return { kind: 'mcp', icon: '⬡', verb: '', target: `${mcp[1]} · ${mcp[2]}` }
  return null
}

// A folded group's words per tool: verb, one, many.
const GROUP_WORDS: Record<string, readonly [string, string, string]> = {
  Read: ['leu', 'arquivo', 'arquivos'],
  NotebookRead: ['leu', 'arquivo', 'arquivos'],
  Grep: ['buscou', 'vez', 'vezes'],
  Glob: ['procurou', 'padrão', 'padrões'],
  LS: ['listou', 'pasta', 'pastas'],
  Bash: ['rodou', 'comando', 'comandos'],
}
const OTHER_WORDS = ['usou', 'outra ferramenta', 'outras ferramentas'] as const

/** 'Leu 6 arquivos · buscou 3 vezes': what a folded group did, in the order it did it. */
export function summarizeGroup(calls: readonly { tool: string; input: unknown }[]): string {
  const counts = new Map<readonly [string, string, string], number>()
  for (const call of calls) {
    const words = GROUP_WORDS[call.tool] ?? OTHER_WORDS
    // Read and NotebookRead share one count.
    const key = [...counts.keys()].find(k => k[0] === words[0] && k[1] === words[1]) ?? words
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const text = [...counts].map(([[verb, one, many], n]) => `${verb} ${n} ${n === 1 ? one : many}`).join(' · ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

const DRAWN_TOOLS = [
  'Read', 'NotebookRead', 'Grep', 'Glob', 'LS', 'Edit', 'MultiEdit', 'Write', 'NotebookEdit', 'Bash', 'BashOutput', 'KillShell',
  'Agent', 'Task', 'WebSearch', 'WebFetch', 'TodoWrite', 'TaskCreate', 'TaskUpdate', 'TaskList', 'TaskGet', /^mcp__.+__.+$/,
]

const KIND_TONE: Record<ToolKind, ScreenTone> = { read: 'dim', edit: 'edit', run: 'run', agent: 'agent', web: 'web', plan: 'plan', mcp: 'mcp' }

type RowState = { isRunning: boolean; isErrored: boolean; isInterrupted: boolean; isAnswer?: boolean }

/**
 * Still running: no result yet. The engine keeps isRunning true on a call that resolved with files changed (seen with a
 * pytest that wrote caches), while `output` is the stored result "once the call has resolved", by its contract.
 */
export const isStillRunning = (call: { isRunning: boolean; output?: unknown }): boolean => call.isRunning && call.output === undefined

type CallState = { tool_use_id?: string; tool: string; input: unknown; isErrored: boolean; output?: unknown }

/**
 * An errored call whose exit is an answer (`grep` with no match, `test -f` false): it ran fine and said no. Told by
 * what tool.call saw; a call from before this load by the text it left, and one with no text (a folded group's) stays
 * the engine's error.
 */
export function isAnswered(call: CallState): boolean {
  if (!call.isErrored || call.tool !== 'Bash') return false
  if (call.tool_use_id !== undefined && wasAnswer(call.tool_use_id)) return true
  const isAnswer = typeof call.output === 'string' && isAnswerExit(str(asRecord(call.input).command) ?? '', call.output)
  // Told by its text: kept, so its result row (which carries no command) is told the same.
  if (isAnswer && call.tool_use_id !== undefined) rememberAnswer(call.tool_use_id)
  return isAnswer
}

const hasFailed = (call: CallState): boolean => call.isErrored && !isAnswered(call)

function shellLine(t: T, line: string): RenderElement[] {
  const { Text } = t
  return (highlight(line, 'sh')[0] ?? []).map(tok => (tok.kind ? <Text {...CODE[tok.kind]}>{tok.text}</Text> : tok.text) as RenderElement)
}

/** A git command as its cards, one line each, in place of the command. */
function cardRows(t: T, cards: readonly CommitCard[]): RenderElement {
  const { Box, Text } = t
  return (
    <Box key="realce-tool" flexDirection="column">
      {cards.map(card => (
        <Text color={SCREEN[CARD_TONE[card.kind]]} wrap="truncate-end">
          {cardText(card)}
        </Text>
      ))}
    </Box>
  )
}

/** The sentence under a failed command: while the model writes it, then it or why there is none. */
function whyLine(t: T, why: Explanation): RenderElement {
  const { Box, Text } = t
  // The box holds the indent, so a long sentence wraps under itself and not at the left edge.
  return (
    <Box key="realce-why" paddingLeft={2}>
      {why.status === 'pending' ? (
        <Text color={SCREEN.dim}>↳ Explicando…</Text>
      ) : why.status === 'failed' ? (
        <Text color={SCREEN.dim} wrap="truncate-end">{`↳ Sem explicação: ${why.reason}`}</Text>
      ) : (
        <Text color={SCREEN.warn}>{`↳ Por quê: ${why.text}`}</Text>
      )}
    </Box>
  )
}

function toolRow(t: T, s: ToolSummary, state: RowState, score: TestScore | null = null, why: Explanation | null = null): RenderElement {
  const { Box, Text } = t
  const icon = state.isRunning ? '◌' : state.isErrored ? '✖' : s.icon
  const head = s.verb === '' ? `${icon} ` : `${icon} ${s.verb} `
  const tail = state.isInterrupted ? <Text color={SCREEN.dim}> · interrompida</Text> : state.isAnswer ? <Text color={SCREEN.dim}> · sem resultado</Text> : null
  if (s.kind === 'run') {
    const lines = s.target.split('\n')
    const more = lines.length > 2 ? ' …' : ''
    return (
      <Box key="realce-tool" flexDirection="column">
        {lines.slice(0, 2).map((line, i) =>
          state.isErrored ? (
            <Text color={SCREEN.bad} wrap="truncate-end">{`${i === 0 ? head : '  '}${line}${i === 1 ? more : ''}`}</Text>
          ) : (
            <Text wrap="truncate-end">
              <Text color={SCREEN.run}>{i === 0 ? head : '  '}</Text>
              {shellLine(t, line)}
              {i === 1 && more}
              {i === Math.min(lines.length, 2) - 1 && tail}
            </Text>
          ),
        )}
        {why !== null && whyLine(t, why)}
        {score !== null && (
          <Box key="realce-score">
            <Text color={score.failed === 0 ? SCREEN.ok : SCREEN.bad} wrap="truncate-end">{`  ${formatScore(score)}`}</Text>
          </Box>
        )}
      </Box>
    )
  }
  if (state.isErrored) {
    return (
      <Box key="realce-tool">
        <Text color={SCREEN.bad} wrap="truncate-end">{`${head}${s.target}`}</Text>
      </Box>
    )
  }
  if (s.kind === 'edit') {
    const hasCounts = (s.added ?? 0) > 0 || (s.removed ?? 0) > 0 || s.isNew === true
    return (
      <Box key="realce-tool">
        <Text wrap="truncate-end">
          <Text color={SCREEN.edit}>{head}</Text>
          {s.target}
          {hasCounts && '  '}
          {hasCounts && <Text color={SCREEN.ok}>{`+${s.added ?? 0}`}</Text>}
          {hasCounts && (s.isNew ? <Text color={SCREEN.dim}> (novo)</Text> : ' ')}
          {hasCounts && !s.isNew && <Text color={SCREEN.bad}>{`−${s.removed ?? 0}`}</Text>}
          {tail}
        </Text>
      </Box>
    )
  }
  return (
    <Box key="realce-tool">
      <Text color={SCREEN[KIND_TONE[s.kind]]} wrap="truncate-end">
        {`${head}${s.target}`}
        {tail}
      </Text>
    </Box>
  )
}

const isDrawnTool = (tool: string) => DRAWN_TOOLS.some(t => (typeof t === 'string' ? t === tool : t.test(tool)))

/** What focus mode leaves of a finished, unfailed row: nothing. */
function hiddenRow(t: Pick<Elements['terminal'], 'Box'>): RenderElement {
  const { Box } = t
  return <Box key="realce-hidden" />
}

export function registerTools(on: On): void {
  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => timed('ToolUse', async () => {
    const flags = await getFlags($)
    if (e.surface !== 'terminal') return next(e)
    const { isInterrupted, output } = e.props
    const isRunning = isStillRunning(e.props)
    const isAnswer = isAnswered(e.props)
    const isErrored = hasFailed(e.props)
    // Focus mode hides what finished well, whatever the tool; running and failed calls stay in sight.
    if (flags.foco && !isRunning && !isErrored && !isInterrupted) return hiddenRow($.ui.resolve(e))
    // Only the tools summarizeTool draws: any other call stays the engine's.
    if (!flags.ferramentas || !isDrawnTool(e.props.tool)) return next(e)
    const cwd = cachedEnv()?.cwd ?? null
    // Only a failed command reads the explanations, so only those rows redraw when one arrives.
    const why: Explanation | null = flags.erros && isErrored && e.props.tool === 'Bash' ? explanationFor(e.props.tool_use_id) : null
    // A row changes only with its call's state: everything else is the same call drawn again.
    const key = `${e.requestId}|${isRunning}|${isErrored}|${isAnswer}|${isInterrupted}|${output === undefined}|${flagsVersion()}|${cwd}|${why === null ? '' : JSON.stringify(why)}`
    const row = memo('ToolUse', key, () => {
      // An errored call's output is the error text the model read, not the tool's result.
      const summary = summarizeTool(e.props.tool, e.props.input, cwd, e.props.isErrored ? undefined : output)
      const cards = flags.commits && e.props.tool === 'Bash' && !e.props.isErrored && output !== undefined ? commitCards(output) : []
      if (cards.length > 0) return cardRows($.ui.resolve(e), cards)
      // The test score rides the command's own row: a result hook cost a trip to the engine for every result drawn.
      const score = flags.placar && e.props.tool === 'Bash' && output !== undefined ? parseTestSummary(bashText(output)) : null
      return summary === null ? null : toolRow($.ui.resolve(e), summary, { isRunning, isErrored, isInterrupted, isAnswer }, score, why)
    })
    return row ?? next(e)
  }))

  on('ui.render', { component: 'ToolGroup' }, async ($, e, next) => timed('ToolGroup', async () => {
    const flags = await getFlags($)
    if (e.surface !== 'terminal') return next(e)
    const calls = e.props.calls
    if (flags.foco && !calls.some(c => isStillRunning(c) || hasFailed(c))) return hiddenRow($.ui.resolve(e))
    if (!flags.ferramentas || e.props.isExpanded) return next(e)
    const cards = flags.commits ? calls.flatMap(c => (c.tool_use_id === undefined ? [] : [commitFor(c.tool_use_id)].filter((x): x is string => x !== null))) : []
    // The folded group is what the screen shows: a failed command's sentence rides under it, the first one's.
    const failed = flags.erros ? calls.filter(c => hasFailed(c) && c.tool === 'Bash' && c.tool_use_id !== undefined) : []
    const why = failed.map(c => explanationFor(c.tool_use_id!)).find(w => w !== null) ?? null
    const key = `${e.requestId}|${flagsVersion()}|${calls.map(c => `${c.tool}${+isStillRunning(c)}${+hasFailed(c)}`).join(',')}|${cards.join(',')}|${why === null ? '' : JSON.stringify(why)}`
    return memo('ToolGroup', key, () => {
      const t = $.ui.resolve(e)
      const { Box, Text } = t
      const errored = calls.filter(hasFailed).length
      const icon = calls.some(isStillRunning) ? '◌' : '◇'
      return (
        <Box key="realce-group" flexDirection="column">
          <Text color={SCREEN.dim} wrap="truncate-end">
            {`${icon} ${summarizeGroup(calls)}`}
            {cards.length > 0 && <Text color={SCREEN.ok}>{` · ${cards.join(' · ')}`}</Text>}
            {errored > 0 && <Text color={SCREEN.bad}>{` · ${errored} com erro`}</Text>}
          </Text>
          {why !== null && whyLine(t, why)}
        </Box>
      )
    })
  }))

  // The result under a row focus mode hid goes with it; the edit tools' results are the diff's own hook.
  on('ui.render', { component: 'ToolResult' }, async ($, e, next) => {
    const flags = await getFlags($)
    // An answered call (a grep with no match) finished well: its result goes with its row.
    if (!flags.foco || e.surface !== 'terminal' || (e.props.isErrored && !wasAnswer(e.props.tool_use_id))) return next(e)
    return hiddenRow($.ui.resolve(e))
  })
}
