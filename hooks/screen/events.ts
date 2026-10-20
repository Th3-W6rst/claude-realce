import { atom, read, update } from 'claude-code'
import type { Args, EngineInterface, ResultOf } from 'claude-code'

import type { Failure, FileTouch, TurnStats } from '../../types'
import { getFlags, isMasterOn } from '../flags'
import { parseTestSummary } from './score'
import { commitCards, shortCardText } from './commit'
import { loadNotes, setCommit } from './notes'
import { isAnswerExit, maybeExplain, rememberAnswer } from './explainError'
import { sealOf } from './seal'
import { asRecord, bashText, EDIT_TOOLS, editCounts, editedPath, failureLine, hasBashEdits, str } from './toolInfo'
import { rememberTestTime } from './spinner'
import { rememberTurn } from './turns'

// The screen area's share of the session's shared events. hooks/events.ts calls each by name (the engine follows $
// only into declared functions), so these five names stay; a body left empty means the area does not listen.

const TURN = atom({ plugin: 'realce', key: 'turn' } as const, null)
const TURNS = atom({ plugin: 'realce', key: 'turns' } as const, {})
const FILES = atom({ plugin: 'realce', key: 'files' } as const, [])
const FAILURES = atom({ plugin: 'realce', key: 'failures' } as const, [])

const MAX_FILES = 50
const MAX_FAILURES = 20
// Rules and prompt times only matter for rows still in the transcript; older ones draw without them.
const MAX_KEPT = 300

/** The newest `max` entries of a record keyed by row, by the time each holds. */
function keepNewest<V>(record: Record<string, V>, max: number, timeOf: (v: V) => number): Record<string, V> {
  const entries = Object.entries(record)
  if (entries.length <= max) return record
  return Object.fromEntries(entries.sort((a, b) => timeOf(a[1]) - timeOf(b[1])).slice(-max))
}

export async function screenSessionStart($: EngineInterface, e: Args<'session.start'>): Promise<void> {
  await loadNotes($)
}

export async function screenPromptSubmit($: EngineInterface, e: Args<'prompt.submit'>): Promise<void> {
  // A prompt typed over a running turn joins it: that turn's stats go on.
  if (e.turnId === undefined) await openTurn($)
}

/** A main turn's first step: a turn no prompt.submit opened (the mod's own prompt skips its own hook) opens here. */
export async function screenTurnStart($: EngineInterface, e: Args<'turn.step'>): Promise<void> {
  if (e.agentId !== undefined || e.index !== 0 || (await read($, TURN)) !== null) return
  await openTurn($)
}

/** A main turn starts: its rule's stats count from here. */
export async function openTurn($: EngineInterface): Promise<void> {
  const flags = await getFlags($)
  if (!flags.separador && !flags.selo) return
  const startedAt = await $.clock.now()
  await update($, TURN, () => ({ startedAt, tools: 0, files: [], tests: null, hasEdits: false, testsSinceEdit: null }))
}

/** After the call settled; subagents' calls too (`e.agentId`), which only the proof seal weighs. */
export async function screenToolCall($: EngineInterface, e: Args<'tool.call'>, result: ResultOf['tool.call']): Promise<void> {
  if (result.deny !== undefined) return
  const isSubagent = e.agentId !== undefined
  const at = await $.clock.now()
  const isError = result.isError === true
  const path = EDIT_TOOLS.has(e.tool) && !isError ? editedPath(e) : null
  const output = e.tool === 'Bash' ? (str(result.text) ?? bashText(result.result)) : ''
  const tests = e.tool === 'Bash' ? parseTestSummary(output) : null
  if (tests?.seconds !== undefined && e.tool === 'Bash') rememberTestTime(e.command, tests.seconds)
  const isEdit = path !== null || (e.tool === 'Bash' && !isError && hasBashEdits(result.result))

  if ((await read($, TURN)) !== null) {
    await update($, TURN, turn =>
      turn === null
        ? null
        : {
            ...turn,
            ...(isSubagent
              ? {}
              : {
                  tools: turn.tools + 1,
                  files: path === null || turn.files.includes(path) ? turn.files : [...turn.files, path],
                  tests: tests ?? turn.tests,
                }),
            hasEdits: turn.hasEdits || isEdit,
            // An edit takes the proof back; tests the same command printed count after its edits (`fmt && test`).
            testsSinceEdit: tests ?? (isEdit ? null : turn.testsSinceEdit),
          },
    )
  }
  if (isSubagent) return
  if (e.tool === 'Bash' && !isError && (await getFlags($)).commits) {
    const cards = commitCards(result.result)
    if (cards.length > 0) await setCommit($, e.tool_use_id, cards.map(shortCardText).join(' · '))
  }

  // The session pane's lists follow the master switch alone: the pane opens by command whatever the flags.
  if (!(await isMasterOn($))) return
  if (path !== null) {
    const { added, removed } = editCounts(e.tool, e, result.result)
    await update($, FILES, files => {
      const prior = files.find(f => f.path === path)
      const touch: FileTouch = { path, added: (prior?.added ?? 0) + added, removed: (prior?.removed ?? 0) + removed, edits: (prior?.edits ?? 0) + 1, at }
      return [...files.filter(f => f.path !== path), touch].slice(-MAX_FILES)
    })
  }
  if (e.tool === 'Bash' && isError) {
    const command = (str(asRecord(e).command) ?? '').trim()
    await maybeExplain($, e.tool_use_id, command, output, result.result)
    // A grep with no match or a run the person cut short answered or stopped: neither failed.
    if (isAnswerExit(command, output)) return rememberAnswer(e.tool_use_id)
    if (asRecord(result.result).interrupted === true) return
    const failure: Failure = { command: command.slice(0, 300), line: failureLine(output), at, toolUseId: e.tool_use_id }
    await update($, FAILURES, failures => [...failures, failure].slice(-MAX_FAILURES))
  }
}

/** The main loop's turns and subagents' (`e.agentId`). */
export async function screenTurnComplete($: EngineInterface, e: Args<'turn.complete'>): Promise<void> {
  if (e.agentId !== undefined) return
  const turn = await read($, TURN)
  if (turn === null) return
  await update($, TURN, () => null)
  const flags = await getFlags($)
  if (!flags.separador && !flags.selo) return
  // TurnDuration carries no turn id: its durationMs is the key both sides share.
  const seal = flags.selo ? sealOf(turn, e.answer) : null
  const stats: TurnStats = { endedAt: await $.clock.now(), tools: turn.tools, files: turn.files.length, tests: turn.tests, seal }
  await update($, TURNS, turns => keepNewest({ ...turns, [String(e.durationMs)]: stats }, MAX_KEPT, s => s.endedAt))
  rememberTurn(String(e.durationMs), stats)
  // The closing rule reads its stats from the module, not the state: draw it (and the screen with it) once more.
  $.ui.invalidate('ui.render')
}

/** Once the row is stored. */
export async function screenAppend($: EngineInterface, e: Args<'session.append'>, stored: ResultOf['session.append']): Promise<void> {}
