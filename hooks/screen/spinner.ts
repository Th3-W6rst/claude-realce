import { atom, read, update } from 'claude-code'
import type { Args, EngineInterface, On, RenderPropsOf } from 'claude-code'

import type { Activity, RunningCall } from '../../types'
import { getFlags, isMasterOn } from '../flags'
import { timed } from '../perf'
import { asRecord, EDIT_TOOLS, editedPath, str } from './toolInfo'

// The main loop's calls still running, by tool_use_id: the one row that reads it is the spinner.
const RUNNING = atom({ plugin: 'realce', key: 'running' } as const, {})

export const SPINNER_WORDS: Record<RenderPropsOf['Spinner']['mode'], string> = {
  requesting: 'Conectando',
  responding: 'Escrevendo',
  thinking: 'Pensando',
  'tool-input': 'Preparando',
  'tool-use': 'Executando',
}

// The engine's own spinner messages this mod knows; any other passes as the engine wrote it.
const MESSAGES: readonly [RegExp, (m: RegExpExecArray) => string][] = [
  [/^Waiting for (\d+) background agents? to finish(.*)$/s, m => `Esperando ${m[1]} ${m[1] === '1' ? 'agente' : 'agentes'} em segundo plano${m[2]}`],
  [/^Compacting conversation(.*)$/s, m => `Compactando a conversa${m[1]}`],
]

export function translateSpinnerMessage(message: string): string {
  for (const [re, say] of MESSAGES) {
    const m = re.exec(message)
    if (m !== null) return say(m)
  }
  return message
}

// Wrappers that run the command after them: `npx jest`, `uv run pytest`, `timeout 60 go test`.
const WRAPPERS: ReadonlySet<string> = new Set(['npx', 'bunx', 'time', 'env', 'nice', 'command', 'exec'])
const WRAPPER_PAIRS: ReadonlySet<string> = new Set(['bundle exec', 'uv run', 'poetry run', 'pipenv run', 'pdm run', 'hatch run', 'pnpm exec', 'yarn exec'])
// Runners whose very name is a test run.
const RUNNERS: ReadonlySet<string> = new Set(['pytest', 'jest', 'vitest', 'mocha', 'rspec', 'phpunit', 'tox', 'nox', 'ctest', 'ava', 'unittest'])
// Tools whose test run is a subcommand: `cargo test`, `make check`.
const SUBCOMMANDS: Readonly<Record<string, readonly string[]>> = {
  npm: ['test', 't'], yarn: ['test'], pnpm: ['test', 't'], bun: ['test'], cargo: ['test', 'nextest'], go: ['test'], deno: ['test'],
  mix: ['test'], swift: ['test'], dotnet: ['test'], rake: ['test', 'spec'], rails: ['test'], gradle: ['test'], gradlew: ['test'],
  mvn: ['test', 'verify'], mvnw: ['test', 'verify'], make: ['test', 'check'], playwright: ['test'],
}

/** A command's words past its env assignments and wrappers, the program by its file name (`./gradlew` → `gradlew`). */
function programWords(segment: string): string[] {
  const words = segment.trim().split(/\s+/).filter(w => w !== '')
  while (words.length > 0) {
    const [first = '', second = ''] = words
    if (/^\w+=/.test(first) || WRAPPERS.has(first)) words.shift()
    else if (first === 'timeout') words.splice(0, /^\d/.test(second) ? 2 : 1)
    else if (WRAPPER_PAIRS.has(`${first} ${second}`)) words.splice(0, 2)
    else if (/^python[\d.]*$/.test(first) && second === '-m') words.splice(0, 2)
    else break
  }
  if (words[0] !== undefined) words[0] = words[0].split('/').pop() ?? words[0]
  return words
}

const segments = (command: string): string[] => command.split(/&&|\|\||;|\|/)

function isTestSegment(segment: string): boolean {
  const [program = '', sub = '', third = ''] = programWords(segment)
  if (RUNNERS.has(program)) return true
  if (['npm', 'yarn', 'pnpm', 'bun'].includes(program) && sub === 'run' && third.startsWith('test')) return true
  if (program === 'node') return segment.split(/\s+/).includes('--test')
  if (program === 'xcodebuild') return segment.split(/\s+/).some(w => w === 'test' || w === 'test-without-building')
  if (program === 'claude') return sub === 'plugin' && third === 'test'
  return SUBCOMMANDS[program]?.includes(sub) ?? false
}

/** Whether a shell command runs a test suite, in any of its `&&`, `;` or `|` parts. */
export function isTestCommand(command: string): boolean {
  return segments(command).some(isTestSegment)
}

const TARGET_CHARS = 32
const cut = (text: string): string => (text.length > TARGET_CHARS ? `${text.slice(0, TARGET_CHARS - 1)}…` : text)
const baseName = (path: string): string => path.split('/').pop() ?? path

function hostOf(url: string): string {
  const m = /^\w+:\/\/([^/?#]+)/.exec(url)
  return m?.[1] ?? url
}

function bashActivity(command: string): Activity {
  for (const segment of segments(command)) {
    if (isTestSegment(segment)) return 'test'
    const [program, sub] = programWords(segment)
    if (program === 'git' && sub === 'commit') return 'commit'
    if (program === 'git' && sub === 'push') return 'push'
  }
  return 'other'
}

/** What a call does, for the spinner: its kind and the file, search or task it names. */
export function activityOf(call: { tool: string } & Record<string, unknown>): Omit<RunningCall, 'id'> {
  const input = asRecord(call)
  const path = editedPath(input)
  if (call.tool === 'Read' && path !== null) return { activity: 'read', target: cut(baseName(path)) }
  if (EDIT_TOOLS.has(call.tool)) return { activity: 'edit', target: path === null ? null : cut(baseName(path)) }
  if (call.tool === 'Bash') return { activity: bashActivity(str(input.command) ?? ''), target: null }
  if (call.tool === 'Grep' || call.tool === 'Glob') {
    const pattern = str(input.pattern)
    return { activity: 'search', target: pattern === null ? null : `“${cut(pattern)}”` }
  }
  if (call.tool === 'WebFetch') return { activity: 'web', target: cut(hostOf(str(input.url) ?? '')) }
  if (call.tool === 'WebSearch') return { activity: 'web', target: `“${cut(str(input.query) ?? '')}”` }
  if (call.tool === 'Agent' || call.tool === 'Task') {
    const description = str(input.description)
    return { activity: 'agent', target: description === null ? null : cut(description) }
  }
  return { activity: 'other', target: null }
}

const DOING: Record<Activity, string> = {
  read: 'Lendo', edit: 'Editando', search: 'Buscando', web: 'Pesquisando', agent: 'Delegando',
  test: 'Rodando os testes', commit: 'Fazendo o commit', push: 'Fazendo o push', other: 'Executando',
}

// Several calls of one kind: the count says more than any one name.
const MANY: Partial<Record<Activity, (n: number) => string>> = {
  read: n => `Lendo ${n} arquivos`,
  edit: n => `Editando ${n} arquivos`,
  agent: n => `Delegando a ${n} agentes`,
}

/** The spinner's word for the calls running now; null when none is. */
export function runningWord(calls: readonly Omit<RunningCall, 'id'>[]): string | null {
  const [first] = calls
  if (first === undefined) return null
  if (calls.some(c => c.activity !== first.activity)) return `Executando ${calls.length} ferramentas`
  if (calls.length > 1) return MANY[first.activity]?.(calls.length) ?? DOING[first.activity]
  // Tests, a commit, a push: the tool row above already shows the command.
  const hasName = first.target !== null && !['test', 'commit', 'push', 'other'].includes(first.activity)
  if (!hasName) return DOING[first.activity]
  // A task is a phrase of its own ("Revisar o diff"), not an object of the verb.
  return first.activity === 'agent' ? `Delegando: ${first.target}` : `${DOING[first.activity]} ${first.target}`
}

/** Before a main-loop call runs: the spinner names it. Subagents' calls run under their own row. */
export async function spinnerToolStart($: EngineInterface, e: Args<'tool.call'>): Promise<void> {
  if (e.agentId !== undefined || !(await isMasterOn($)) || !(await getFlags($)).spinner) return
  const call: RunningCall = { id: e.tool_use_id, ...activityOf(e as { tool: string } & Record<string, unknown>) }
  await update($, RUNNING, running => ({ ...running, [call.id]: call }))
}

/** After it settled, failed or was interrupted. */
export async function spinnerToolEnd($: EngineInterface, e: Args<'tool.call'>): Promise<void> {
  // A call the start skipped (a subagent's, the flag off) leaves the state unwritten.
  if (e.agentId !== undefined || !(e.tool_use_id in (await read($, RUNNING)))) return
  await update($, RUNNING, running => {
    const { [e.tool_use_id]: _, ...rest } = running
    return rest
  })
}

export function registerSpinner(on: On): void {
  on('ui.render', { component: 'Spinner' }, async ($, e, next) => timed('Spinner', async () => {
    const flags = await getFlags($)
    // The desktop's word names the step it runs ("Creating notes.md"): only the terminal's is a random gerund.
    if (!flags.spinner || e.surface !== 'terminal') return next(e)
    const message = e.props.message === null ? null : translateSpinnerMessage(e.props.message)
    const running = e.props.mode === 'tool-use' ? runningWord(Object.values(await read($, RUNNING))) : null
    return next({ ...e, props: { ...e.props, word: running ?? SPINNER_WORDS[e.props.mode], message } })
  }))
}
