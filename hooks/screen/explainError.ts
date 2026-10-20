import type { EngineInterface } from 'claude-code'

import { getFlags } from '../flags'
import { pick, tr, type Text } from '../i18n'
import { setExplanation } from './notes'
import { failureLine, shellCommands } from './toolInfo'
import { asRecord, errorText } from '../safe'
import { complete, detach } from '../io'
import { fitEnd } from '../fit'
import { trimOldest } from '../memo'

// The model's time is the person's: at most this many per load, never the same failure twice.
const MAX_PER_LOAD = 20
const OUTPUT_LINES = 40
// About two lines under the command: the model does not always keep to one short sentence.
const MAX_CHARS = 200

// Who reads it did not run it: the coding assistant did, so the sentence is about the command, never "you". The
// sentence comes in the interface's language.
const SYSTEM: Text = {
  en: 'A coding assistant ran this command, and it failed. Explain to whoever is watching, in ONE sentence of at most 25 words, in plain English, why it failed and what to do next. Speak of the command, never "you". No markdown, no backticks, no preamble.',
  pt: 'Um assistente de código rodou este comando, e ele falhou. Explique a quem acompanha, em UMA frase de no máximo 25 palavras, em português simples, por que falhou e o que fazer a seguir. Fale do comando, nunca "você". Sem markdown, sem crases, sem rodeios.',
}

// For these an exit code of 1 is an answer (no match, false, a difference), not a failure worth a sentence.
const ANSWER_COMMANDS: ReadonlySet<string> = new Set(['grep', 'rg', 'test', '[', 'diff', 'cmp', 'which'])

const seen = new Set<string>()
let sent = 0

/** For /realce status: how many failures went to the model in this load, of how many it may send. */
export const explanationsSent = () => ({ sent, max: MAX_PER_LOAD })

const errorKey = (command: string, line: string) => `${command}\n${line}`

// Commands that do not fail on their own: beside an answer they leave the exit status the answer's.
const QUIET_COMMANDS: ReadonlySet<string> = new Set(['echo', 'printf', 'true', ':', 'head', 'tail', 'wc', 'sort', 'uniq', 'cut', 'tr'])

const isAnswerCommand = ([first = '', second]: readonly string[]) => ANSWER_COMMANDS.has(first) || (first === 'command' && second === '-v')

/**
 * Whether the command's failure can only be an answer (`grep x f`, `test -f a && echo sim`, `command -v`): one of its
 * parts asks, and every other one cannot fail. `npm run build && grep -q ok` exiting 1 may be the build.
 */
export function isAnswerStyle(command: string): boolean {
  const parts = shellCommands(command)
  return parts.some(isAnswerCommand) && parts.every(part => isAnswerCommand(part) || QUIET_COMMANDS.has(part[0] ?? ''))
}

/**
 * A failure that is an answer: an answer-style command that exited 1 (no match, false, a difference). Exit 2 is
 * their real error (`grep x sumiu.txt`), and output with no exit code (a timeout, a refusal) is no answer either.
 */
export function isAnswerExit(command: string, output: string): boolean {
  const code = /^Exit code (\d+)/m.exec(output)?.[1]
  return code === '1' && isAnswerStyle(command)
}

// The calls of this load whose failure was an answer, for the result rows that carry no command to tell.
const answered = new Set<string>()
const MAX_ANSWERED = 500

export function rememberAnswer(toolUseId: string): void {
  answered.add(toolUseId)
  trimOldest(answered, MAX_ANSWERED)
}

export const wasAnswer = (toolUseId: string): boolean => answered.has(toolUseId)

/** What the model reads: the command and the end of its output. */
function explainPrompt(command: string, output: string): string {
  const tail = output.trimEnd().split('\n').slice(-OUTPUT_LINES).join('\n')
  return tr(`Command:\n${command}\n\nOutput (end):\n${tail}`, `Comando:\n${command}\n\nSaída (fim):\n${tail}`)
}

/** One short answer from the fast model, in the interface's language, or why there is none. */
export async function askHaiku($: EngineInterface, system: Text, prompt: string, maxTokens: number, timeoutMs: number): Promise<{ text: string } | { reason: string }> {
  try {
    const reply = await complete($, { model: 'haiku', system: pick(system), prompt, maxTokens, timeoutMs })
    return reply.isAnswered ? { text: reply.text.trim() } : { reason: reply.reason }
  } catch (error) {
    return { reason: errorText(error) }
  }
}

async function runExplain($: EngineInterface, toolUseId: string, command: string, output: string): Promise<void> {
  const answer = await askHaiku($, SYSTEM, explainPrompt(command, output), 200, 20_000)
  await setExplanation($, toolUseId, 'text' in answer ? { status: 'ready', text: fitEnd(answer.text.replace(/\s+/g, ' '), MAX_CHARS) } : { status: 'failed', reason: answer.reason })
}

/**
 * A failed Bash call of the main loop gets one sentence from the model, off the call's dispatch. Not for a failure
 * that is an answer, one with nothing printed, a run cut short or sent to the background.
 */
export async function maybeExplain($: EngineInterface, toolUseId: string, command: string, output: string, result: unknown): Promise<void> {
  if (!(await getFlags($)).erros) return
  const record = asRecord(result)
  if (record.interrupted === true || typeof record.backgroundTaskId === 'string') return
  const line = failureLine(output)
  if (line === '' || isAnswerExit(command, output)) return
  const key = errorKey(command, line)
  if (seen.has(key) || sent >= MAX_PER_LOAD) return
  seen.add(key)
  sent += 1
  await setExplanation($, toolUseId, { status: 'pending' })
  // A model call takes seconds: the tool call's dispatch never waits on it.
  detach($, () => void runExplain($, toolUseId, command, output))
}
