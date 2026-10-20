import type { EngineInterface } from 'claude-code'

import { getFlags } from '../flags'
import { setExplanation } from './notes'
import { asRecord, failureLine, shellCommands } from './toolInfo'

// The model's time is the person's: at most this many per load, never the same failure twice.
const MAX_PER_LOAD = 20
const OUTPUT_LINES = 40
// About two lines under the command: the model does not always keep to one short sentence.
const MAX_CHARS = 200

// Who reads it did not run it: the coding assistant did, so the sentence is about the command, never "you".
const SYSTEM =
  'Um assistente de código rodou este comando, e ele falhou. Explique a quem acompanha, em UMA frase de no máximo 25 palavras, em português simples, por que falhou e o que fazer a seguir. Fale do comando, nunca "você". Sem markdown, sem crases, sem rodeios.'

// For these an exit code of 1 is an answer (no match, false, a difference), not a failure worth a sentence.
const ANSWER_COMMANDS: ReadonlySet<string> = new Set(['grep', 'rg', 'test', '[', 'diff', 'cmp', 'which'])

const seen = new Set<string>()
let sent = 0

/** For /realce status: how many failures went to the model in this load, of how many it may send. */
export const explanationsSent = () => ({ sent, max: MAX_PER_LOAD })

export const errorKey = (command: string, line: string) => `${command}\n${line}`

/** Whether any part of the command is one whose failure is an answer (`grep x f`, `test -f a && …`, `command -v`). */
export function isAnswerStyle(command: string): boolean {
  return shellCommands(command).some(([first = '', second]) => ANSWER_COMMANDS.has(first) || (first === 'command' && second === '-v'))
}

/** What the model reads: the command and the end of its output. */
export function explainPrompt(command: string, output: string): string {
  const tail = output.trimEnd().split('\n').slice(-OUTPUT_LINES).join('\n')
  return `Comando:\n${command}\n\nSaída (fim):\n${tail}`
}

const cut = (text: string) => ([...text].length <= MAX_CHARS ? text : `${[...text].slice(0, MAX_CHARS - 1).join('').trimEnd()}…`)

async function runExplain($: EngineInterface, toolUseId: string, command: string, output: string): Promise<void> {
  try {
    const reply = await $.model.complete({ model: 'haiku', system: SYSTEM, prompt: explainPrompt(command, output), maxTokens: 200, timeoutMs: 20_000 })
    await setExplanation($, toolUseId, reply.isAnswered ? { status: 'ready', text: cut(reply.text.trim().replace(/\s+/g, ' ')) } : { status: 'failed', reason: reply.reason })
  } catch (error) {
    await setExplanation($, toolUseId, { status: 'failed', reason: error instanceof Error ? error.message : String(error) })
  }
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
  if (line === '' || isAnswerStyle(command)) return
  const key = errorKey(command, line)
  if (seen.has(key) || sent >= MAX_PER_LOAD) return
  seen.add(key)
  sent += 1
  await setExplanation($, toolUseId, { status: 'pending' })
  // A model call takes seconds: the tool call's dispatch never waits on it.
  $.clock.after(0, () => void runExplain($, toolUseId, command, output))
}
