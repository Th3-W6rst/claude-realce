import { atom, read, update } from 'claude-code'
import type { Args, EngineInterface, On, RenderPropsOf } from 'claude-code'

import type { Activity, RunningCall } from '../../types'
import { getFlags, isMasterOn } from '../flags'
import { timed } from '../perf'
import { formatSeconds } from './score'
import { asRecord, EDIT_TOOLS, editedPath, shellCommands, str } from './toolInfo'

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

// Wrappers that run the command after them: `npx jest`, `uv run pytest`, `timeout 60 go test`, `sudo pytest`.
const WRAPPERS: ReadonlySet<string> = new Set(['npx', 'bunx', 'time', 'env', 'nice', 'command', 'exec', 'sudo'])
const WRAPPER_PAIRS: ReadonlySet<string> = new Set(['bundle exec', 'uv run', 'poetry run', 'pipenv run', 'pdm run', 'hatch run'])
// Runners whose very name is a test run.
const RUNNERS: ReadonlySet<string> = new Set(['pytest', 'jest', 'vitest', 'mocha', 'rspec', 'phpunit', 'tox', 'nox', 'ctest', 'ava', 'unittest'])
const ASKS_ONLY: ReadonlySet<string> = new Set(['--version', '-V', '--help', '-h'])
// Package managers: `npm test`, `yarn test:unit`, `pnpm --filter web test`, `npm exec jest`, `bun run vitest`.
const PACKAGE_MANAGERS: ReadonlySet<string> = new Set(['npm', 'yarn', 'pnpm', 'bun'])
// Tools whose test run is a subcommand: `cargo test`, `make -C app check`.
const SUBCOMMANDS: Readonly<Record<string, readonly string[]>> = {
  cargo: ['test', 'nextest'], go: ['test'], deno: ['test'], mix: ['test'], swift: ['test'], dotnet: ['test'], rake: ['test', 'spec'],
  rails: ['test'], gradle: ['test'], gradlew: ['test'], mvn: ['test', 'verify'], mvnw: ['test', 'verify'], make: ['test', 'check'],
  playwright: ['test'],
}
// Options that take the next word as their value: `npm --prefix app test`, `make -C app test`.
const VALUE_OPTIONS: ReadonlySet<string> = new Set(['--prefix', '-w', '--workspace', '--filter', '-F', '-C', '--dir', '--cwd'])

const baseName = (path: string): string => path.split('/').pop() ?? path

/** A command's words past its env assignments and wrappers, the program by its file name (`./gradlew` → `gradlew`). */
function programWords(command: readonly string[]): string[] {
  const words = [...command]
  let isAfterWrapper = false
  while (words.length > 0) {
    // An assignment's value may hold a path (`PYTHONPATH=./src`): it is read before the program's file name.
    const raw = words[0]!
    const first = baseName(raw)
    const second = words[1] ?? ''
    if (/^\w+=/.test(raw) || (isAfterWrapper && first.startsWith('-'))) words.shift()
    else if (WRAPPERS.has(first)) {
      words.shift()
      isAfterWrapper = true
    } else if (first === 'timeout') words.splice(0, /^\d/.test(second) ? 2 : 1)
    else if (WRAPPER_PAIRS.has(`${first} ${second}`)) words.splice(0, 2)
    else if (/^python[\d.]*$/.test(first) && second === '-m') words.splice(0, 2)
    else break
  }
  if (words[0] !== undefined) words[0] = baseName(words[0])
  return words
}

/** The words that are not options nor option values: what a tool's subcommand is read from. */
function bareWords(args: readonly string[]): string[] {
  const out: string[] = []
  for (let i = 0; i < args.length; i++) {
    if (VALUE_OPTIONS.has(args[i]!)) i++
    else if (!args[i]!.startsWith('-')) out.push(args[i]!)
  }
  return out
}

function isTestRun(command: readonly string[]): boolean {
  const [program = '', ...rest] = programWords(command)
  if (RUNNERS.has(program)) return !rest.some(w => ASKS_ONLY.has(w))
  const [first = '', second = '', third = ''] = bareWords(rest)
  if (PACKAGE_MANAGERS.has(program)) {
    const script = ['run', 'exec', 'x'].includes(first) ? second : first === 'workspace' ? third : first
    return /^test($|[:\-_.])/.test(script) || (script === 't' && program !== 'yarn') || RUNNERS.has(script)
  }
  if (program === 'node') return rest.includes('--test')
  if (program === 'xcodebuild') return rest.some(w => w === 'test' || w === 'test-without-building')
  if (program === 'claude') return first === 'plugin' && second === 'test'
  return SUBCOMMANDS[program]?.includes(first) ?? false
}

/** Whether a shell command runs a test suite, in any of its `&&`, `;`, `|` or line parts. */
export function isTestCommand(command: string): boolean {
  return shellCommands(command).some(isTestRun)
}

// How long each test command took when it last printed its time, for the next run of the same command.
const lastTestSeconds = new Map<string, number>()
const MAX_REMEMBERED = 50

// Redirections say where the output goes, not which run it is: an operator alone takes the next word as its target
// (`> out.log`, `< /dev/null`), one glued to it carries it (`>out.log`, `2>/dev/null`, `2>&1`).
const REDIRECT_ALONE = /^(\d*|&)[<>]+$/
const REDIRECT_GLUED = /^(\d*|&)[<>]+\S+$/

/** The run a command makes, for its time: its test command alone, past wrappers and env, without redirections. */
export function testKey(command: string): string | null {
  const run = shellCommands(command).find(isTestRun)
  if (run === undefined) return null
  const words = programWords(run)
  const kept: string[] = []
  for (let i = 0; i < words.length; i++) {
    if (REDIRECT_ALONE.test(words[i]!)) i++
    else if (!REDIRECT_GLUED.test(words[i]!)) kept.push(words[i]!)
  }
  return kept.join(' ')
}

/** A test run settled with its time: the next run of the same tests says it. */
export function rememberTestTime(command: string, seconds: number): void {
  const key = testKey(command)
  if (key === null) return
  lastTestSeconds.delete(key)
  lastTestSeconds.set(key, seconds)
  if (lastTestSeconds.size > MAX_REMEMBERED) lastTestSeconds.delete(lastTestSeconds.keys().next().value!)
}

const TARGET_CHARS = 32
function cut(text: string): string {
  const chars = [...text]
  return chars.length > TARGET_CHARS ? `${chars.slice(0, TARGET_CHARS - 1).join('')}…` : text
}

function hostOf(url: string): string {
  const m = /^\w+:\/\/([^/?#]+)/.exec(url)
  return m?.[1] ?? url
}

function bashActivity(command: string): Activity {
  for (const words of shellCommands(command)) {
    if (isTestRun(words)) return 'test'
    const [program, ...rest] = programWords(words)
    const sub = bareWords(rest)[0]
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
  if (call.tool === 'Bash') {
    const command = str(input.command) ?? ''
    const activity = bashActivity(command)
    const key = activity === 'test' ? testKey(command) : null
    const last = key === null ? undefined : lastTestSeconds.get(key)
    return { activity, target: last === undefined ? null : `última: ${formatSeconds(last)}` }
  }
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
  if (call.tool === 'Skill') {
    const skill = str(input.skill)
    return { activity: 'skill', target: skill === null ? null : cut(skill) }
  }
  if (PLAN_TOOLS.has(call.tool)) return { activity: 'plan', target: null }
  // An MCP tool by its server and name: `mcp__rea__open_binary` → `rea: open_binary`.
  const mcp = /^mcp__(.+?)__(.+)$/.exec(call.tool)
  return { activity: 'other', target: mcp === null ? null : cut(`${mcp[1]}: ${mcp[2]}`) }
}

const PLAN_TOOLS: ReadonlySet<string> = new Set(['TodoWrite', 'TaskCreate', 'TaskUpdate'])

const DOING: Record<Activity, string> = {
  read: 'Lendo', edit: 'Editando', search: 'Buscando', web: 'Pesquisando', agent: 'Delegando', skill: 'Carregando a skill',
  plan: 'Atualizando o plano', test: 'Rodando os testes', commit: 'Fazendo o commit', push: 'Fazendo o push', other: 'Executando',
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
  const kinds = [...new Set(calls.map(c => c.activity))]
  // Two kinds at once read as one phrase ("Lendo e buscando"); more is a count.
  if (kinds.length === 2) return `${DOING[kinds[0]!]} e ${DOING[kinds[1]!].charAt(0).toLowerCase()}${DOING[kinds[1]!].slice(1)}`
  if (kinds.length > 2) return `Executando ${calls.length} ferramentas`
  if (calls.length > 1) return MANY[first.activity]?.(calls.length) ?? DOING[first.activity]
  if (first.target === null) return DOING[first.activity]
  // A task is a phrase of its own ("Revisar o diff"), not an object of the verb; a test run's is its last time.
  if (first.activity === 'agent') return `Delegando: ${first.target}`
  if (first.activity === 'test') return `${DOING.test} (${first.target})`
  return `${DOING[first.activity]} ${first.target}`
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

/**
 * At a main turn's end, and at a (re)load, nothing of the main loop runs: a reload cancels the old module's pending
 * work, whose finally never comes, and its entry would name a call long gone.
 */
export async function clearRunning($: EngineInterface, agentId?: string): Promise<void> {
  if (agentId !== undefined || Object.keys(await read($, RUNNING)).length === 0) return
  await update($, RUNNING, () => ({}))
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
