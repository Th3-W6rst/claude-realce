import { mock } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { AgentInfo, On, RenderPropsOf } from 'claude-code'

import { planProgress, planSegments } from '../hooks/orient/plan'
import { testKey } from '../hooks/screen/spinner'
import { ruleSpans } from '../hooks/screen/turns'
import type { PlanItem } from '../types'

// The world beneath the plugin that several test files stand up: engine stand-ins, fixtures and readers.

/** `/realce` typed in the composer of a fullscreen terminal: spread with the `args` each test types. */
export const RUN = { command: 'realce', origin: { kind: 'composer' as const }, presentation: { isFullscreen: true, columns: 120 } }

// Stands for the engine's own drawing of a component beneath the plugin.
export function engineRow(on: On, component: 'ToolUse' | 'ToolGroup' | 'ToolResult' | 'TurnDuration' | 'UserMessage' | 'Spinner' | 'AbovePrompt'): void {
  on('ui.render', { component: component as 'ToolUse' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
}

// Raises session.start with the world beneath it, so `env` holds the session's offset (-03:00).
export async function startSession($: Engine, on: On): Promise<void> {
  mock.env(on, { HOME: '/Users/u' })
  on('fs.exists', () => ({ value: false }))
  on('process.run', ($, e) => ({
    value: { exitCode: e.argv[0] === 'date' ? 0 : 1, stdout: e.argv[0] === 'date' ? '-0300\n' : '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
  }))
  on('config.list', () => ({ value: [] }))
  on('session.start', () => ({ cwd: '/a/b' }))
  await $.session.start({ cwd: '/a/b', surface: 'terminal', isInteractive: true })
}

export const isTestRun = (command: string) => testKey(command) !== null
export const rule = (...args: Parameters<typeof ruleSpans>) => ruleSpans(...args).map(s => s.text).join('')

export const BASH_OK = (stdout: string) => ({ stdout, stderr: '', interrupted: false })
export const EDIT_RESULT = {
  filePath: '/a/b/x.ts',
  oldString: 'a',
  newString: 'a\nb\nc',
  originalFile: 'a\n',
  structuredPatch: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 3, lines: [' a', '+b', '+c'] }],
  userModified: false,
  replaceAll: false,
}

// The world beneath the session's events: tools answer, prompts enter, turns end.
export function engineEvents(on: On): void {
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('tool.call', ($, e) => {
    if (e.tool === 'Edit') return { result: EDIT_RESULT }
    if (e.tool === 'Bash' && e.command === 'npm test') {
      return { isError: true as const, result: 'Exit code 1\nFAIL src/a.test.ts\nTests:       2 failed, 424 passed, 426 total', text: 'Exit code 1\nFAIL src/a.test.ts\nTests:       2 failed, 424 passed, 426 total' }
    }
    return { result: BASH_OK('===== 12 passed in 0.50s =====') }
  })
  on('turn.complete', () => ({ text: '' }))
}

export const TURN = { answer: 'feito', isAborted: false, turnId: 't1', reason: 'answer' as const }

export const drawnText = async (ui: { findAll: (q: { key?: string; type?: string }) => Promise<{ text: string }[]> }, key: string) =>
  (await ui.findAll({ key }))[0]?.text

export const PASSED = { runner: 'pytest', passed: 12, failed: 0, skipped: 0, unit: 'tests' as const }
export const FAILED = { ...PASSED, passed: 10, failed: 2 }

export const GIT_STDOUT = '[main 9cd805a] realce 0.3.0: tudo\n 8 files changed, 120 insertions(+), 3 deletions(-)\n'

export const USAGE = { input_tokens: 120, output_tokens: 14, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }

// A subagent's call: the kit's typing leaves agentId to the engine, which stamps it on a subagent's loop.
export const inSubagent = <C extends object>(call: C): C => ({ ...call, agentId: 'sub1' })

// What the plugin wrote to its session state, last value per key, as the kit beneath stores it.
export function watchState(on: On): Record<string, unknown> {
  const written: Record<string, unknown> = {}
  on('state.set', ($, e, next) => {
    written[e.key] = e.value
    return next(e)
  })
  return written
}

/** The band's plan row as text, or null while nothing is open. */
export const planRow = (plan: readonly PlanItem[]) => {
  const p = planProgress(plan)
  return p === null ? null : planSegments(p).map(s => s.text).join('')
}

export const BAND: RenderPropsOf['AbovePrompt'] = {
  hasSurvey: false,
  isWorking: false,
  maxRows: 6,
  bodyColumns: 100,
  scroll: { offset: 0, bodyRows: 6 },
  view: {},
}
export const PANE: RenderPropsOf['Pane'] = {
  title: 'Sessão',
  isFocused: false,
  bodyColumns: 80,
  placement: 'dock',
  scroll: { offset: 0, bodyRows: 40 },
  view: {},
}
export const ANSWER = 'Falta {!o GO para subir!}.\n> [!DECISÃO] Instalar o realce?\n> Copia para ~/mods.'
export const TODOS = [
  { content: 'Escrever testes', status: 'in_progress' as const, activeForm: 'Escrevendo testes' },
  { content: 'Implementar', status: 'pending' as const, activeForm: 'Implementando' },
]
export const TODOS_DONE = TODOS.map(t => ({ ...t, status: 'completed' as const }))

// Stands for the engine beneath the plugin: its band, its tools, its turn ends and its prompts.
export function engine(on: On): void {
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  on('tool.call', () => ({ result: {} }))
  on('turn.complete', () => ({ text: '' }))
  on('prompt.submit', ($, e) => ({ text: e.text }))
}

// What session.start reaches beneath the plugin; every pane opened and every line logged is kept to assert on.
export function startStandIns(on: On, agents: () => AgentInfo[] = () => []): { opened: string[]; logs: string[] } {
  const opened: string[] = []
  const logs: string[] = []
  on('ui.log', ($, e) => {
    logs.push(e.text)
    return { value: undefined }
  })
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  mock.env(on, { HOME: '/Users/u' })
  on('fs.exists', () => ({ value: false }))
  on('process.run', ($, e) => ({
    value: { exitCode: 0, stdout: e.argv[0] === 'date' ? '-0300\n' : '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
  }))
  on('agent.list', () => ({ value: agents() }))
  on('ui.open', ($, e) => {
    opened.push(e.id)
    return { value: { isPlaced: true as const } }
  })
  on('config.list', () => ({ value: [] }))
  on('session.start', () => ({ cwd: '/a/b' }))
  return { opened, logs }
}

export const finish = ($: Engine, answer: string, agentId?: string) =>
  $.turn.complete({ answer, durationMs: 1000, isAborted: false, turnId: 't1', reason: 'answer', ...(agentId ? { agentId } : {}) })

export const mountBand = ($: Engine, props: Partial<RenderPropsOf['AbovePrompt']> = {}) =>
  $.ui.mount({ plugin: 'realce', surface: 'terminal', component: 'AbovePrompt', props: { ...BAND, ...props } })

export const mountPane = ($: Engine) =>
  $.ui.mount({ plugin: 'realce', surface: 'terminal', component: 'Pane', requestId: 'realce-sessao', props: PANE })
