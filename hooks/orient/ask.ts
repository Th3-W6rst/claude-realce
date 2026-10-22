import { atom, read, update } from 'claude-code'
import type { Args, EngineInterface, ModelForkResult, ModelUsage, On, ResultOf } from 'claude-code'

import type { AskMode, ChatEntry } from '../../types'
import { pick, tr, type Text } from '../i18n'
import { detach, exec, fork, listAgents, spawn } from '../io'
import { errorText } from '../safe'

const CHAT = atom({ plugin: 'realce', key: 'chat' } as const, [])

const MAX_ENTRIES = 20
// The pane's own last exchanges ride along with a question, so "and the second one?" has something to point at.
const CONTEXT_EXCHANGES = 3
const MAX_QUESTION = 4000
const DESCRIPTION_CHARS = 40

// A fork answers over the session's own transcript, tools included: unframed, it takes the question as the next step
// of the task and reaches for a tool it is denied (measured 21-10).
const SESSION_FRAME: Text = {
  en: 'This is a side question from a pane beside the session, not a step of the task: do not continue the task and do not call any tool. Answer in English, briefly (at most 8 short lines), in markdown.',
  pt: 'Esta é uma pergunta lateral de um painel ao lado da sessão, não um passo da tarefa: não continue a tarefa e não chame ferramenta. Responda em português, curto (no máximo 8 linhas curtas), em markdown.',
}
const TOOLS_FRAME: Text = {
  en: 'A question from the realce pane about the current project. Read what you need and answer in English, briefly (at most 10 short lines), in markdown.',
  pt: 'Uma pergunta do painel do realce sobre o projeto atual. Leia o que precisar e responda em português, curto (no máximo 10 linhas curtas), em markdown.',
}
// Tools mode runs the plugin's own agent, `agents/reader.md`, whose only tool is Read: the engine refuses any other
// call in every permission mode, where a prompt, an agent's permission mode or the plugin's own hooks (skipped for the
// calls of an agent it started) do not hold under bypassPermissions (measured 22-10). With no shell to list the
// project, the agent gets its files in the prompt.
const READER = 'realce:reader'
const MAX_FILES = 400

// A fork in the middle of a turn answers about the turn's next step, slowly and uncached: a question waits for the end.
let isMainTurnRunning = false
let isFlushing = false
let counter = 0
/** Whether a subagent is one the pane started: its entry carries its id, across a reload too. */
export async function isPanelAgent($: EngineInterface, agentId: string): Promise<boolean> {
  return (await read($, CHAT)).some(c => c.agentId === agentId)
}

/** Fresh tokens of a call: what it read uncached, wrote to the cache and generated; the cache's reads cost little. */
const freshTokens = (u: ModelUsage) => u.input_tokens + (u.cache_creation_input_tokens ?? 0) + u.output_tokens

function failureText(reply: Exclude<ModelForkResult, { isAnswered: true }>): string {
  if (reply.reason === 'nothing-to-fork') return tr('Nothing to ask about yet: wait for the first turn to end.', 'Nada para consultar ainda: espere o primeiro turno terminar.')
  if (reply.reason === 'api-error') return tr(`API error (${reply.status ?? 'no answer'}: ${reply.error}).`, `Erro da API (${reply.status ?? 'sem resposta'}: ${reply.error}).`)
  if (reply.reason === 'empty-reply') return tr('The model answered nothing.', 'O modelo não respondeu nada.')
  return tr('Cut short.', 'Interrompida.')
}

/** What the fork reads after the transcript: the frame, the pane's last exchanges and the question. */
export function sessionPrompt(history: readonly ChatEntry[], question: string): string {
  const earlier = history.map(c => tr(`Earlier in the pane — Q: ${c.question}\nA: ${c.text}`, `Antes no painel — P: ${c.question}\nR: ${c.text}`))
  return [pick(SESSION_FRAME), ...earlier, tr(`Question: ${question}`, `Pergunta: ${question}`)].join('\n\n')
}

const isWaiting = (c: ChatEntry) => c.status === 'queued' || c.status === 'pending'

/** Past 20 entries the oldest answered ones go: one still waiting keeps its place, or its answer would land nowhere. */
function keepNewest(chat: ChatEntry[]): ChatEntry[] {
  let excess = chat.length - MAX_ENTRIES
  if (excess <= 0) return chat
  const kept = chat.filter(c => isWaiting(c) || excess-- <= 0)
  return kept.slice(-MAX_ENTRIES)
}

/** Changes one entry; one the history already dropped stays dropped. */
export async function settleEntry($: EngineInterface, id: string, change: Partial<ChatEntry>): Promise<void> {
  await update($, CHAT, chat => (chat.some(c => c.id === id) ? chat.map(c => (c.id === id ? { ...c, ...change } : c)) : chat))
}

/** A new entry at the end of the history, the oldest past 20 dropped; resolves it. */
export async function addEntry($: EngineInterface, mode: ChatEntry['mode'], question: string, status: ChatEntry['status']): Promise<ChatEntry> {
  const at = await $.clock.now()
  const entry: ChatEntry = { id: `${at}-${counter++}`, mode, question: [...question].slice(0, MAX_QUESTION).join(''), status, text: '', at }
  await update($, CHAT, chat => keepNewest([...chat, entry]))
  return entry
}

async function answerFromSession($: EngineInterface, entry: ChatEntry): Promise<void> {
  const history = (await read($, CHAT)).filter(c => c.status === 'ready' && c.mode !== 'explain' && c.id !== entry.id).slice(-CONTEXT_EXCHANGES)
  const startedAt = await $.clock.now()
  let reply: ModelForkResult
  try {
    reply = await fork($, { prompt: sessionPrompt(history, entry.question) })
  } catch (error) {
    await settleEntry($, entry.id, { status: 'failed', text: errorText(error) })
    return
  }
  const ms = (await $.clock.now()) - startedAt
  if (reply.isAnswered) await settleEntry($, entry.id, { status: 'ready', text: reply.text.trim(), ms, tokens: freshTokens(reply.usage) })
  else await settleEntry($, entry.id, { status: 'failed', text: failureText(reply), ms })
}

/** The project's files as git sees them, the first 400, for an agent that can only read; null where git lists none. */
async function projectFiles($: EngineInterface): Promise<string | null> {
  const run = await exec($, ['git', 'ls-files', '--cached', '--others', '--exclude-standard'], { timeoutMs: 5000 }).catch(() => null)
  if (run === null || run.exitCode !== 0) return null
  const files = run.stdout.split('\n').filter(line => line !== '')
  const more = files.length - MAX_FILES
  return [...files.slice(0, MAX_FILES), ...(more > 0 ? [tr(`… and ${more} more`, `… e mais ${more}`)] : [])].join('\n')
}

/** What the reader gets: the frame, the project's files when git lists them, and the question. */
export function toolsPrompt(files: string | null, question: string): string {
  const listing = files === null ? tr('No file list: git does not list this folder.', 'Sem lista de arquivos: o git não lista esta pasta.') : tr(`The project's files:\n${files}`, `Os arquivos do projeto:\n${files}`)
  return [pick(TOOLS_FRAME), listing, tr(`Question: ${question}`, `Pergunta: ${question}`)].join('\n\n')
}

async function answerWithTools($: EngineInterface, entry: ChatEntry): Promise<void> {
  const short = [...entry.question.replace(/\s+/g, ' ')].slice(0, DESCRIPTION_CHARS).join('')
  try {
    const prompt = toolsPrompt(await projectFiles($), entry.question)
    const started = await spawn($, { prompt, description: `Realce: ${short}`, subagentType: READER })
    if ('deny' in started && started.deny !== undefined) {
      await settleEntry($, entry.id, { status: 'failed', text: tr(`Refused: ${started.deny}`, `Recusado: ${started.deny}`) })
      return
    }
    if (!('agentId' in started) || started.agentId === undefined) {
      await settleEntry($, entry.id, { status: 'failed', text: tr('No agent started.', 'Nenhum agente começou.') })
      return
    }
    await settleEntry($, entry.id, { agentId: started.agentId })
  } catch (error) {
    await settleEntry($, entry.id, { status: 'failed', text: errorText(error) })
  }
}

/** The reader is the pane's alone: the model's own list of agent types leaves it out. */
export function registerReader(on: On): void {
  on('agent.offer', { agent: READER }, () => ({ isOffered: false }))
}

/** Answers the queued questions one by one, while no main turn runs. */
async function flushQueue($: EngineInterface): Promise<void> {
  if (isFlushing) return
  isFlushing = true
  try {
    for (;;) {
      if (isMainTurnRunning) return
      const next = (await read($, CHAT)).find(c => c.status === 'queued')
      if (next === undefined) return
      await settleEntry($, next.id, { status: 'pending' })
      await answerFromSession($, next)
    }
  } finally {
    isFlushing = false
  }
}

/**
 * A question to the pane's agent: over the session's own transcript (`session`, a fork, no tools), or by a subagent
 * that may read the project (`tools`). Answered off the caller's dispatch; a session question waits for a running
 * main turn to end.
 */
export async function ask($: EngineInterface, question: string, mode: AskMode): Promise<void> {
  const text = question.trim()
  if (text === '') return
  const waits = mode === 'session' && isMainTurnRunning
  const entry = await addEntry($, mode, text, waits ? 'queued' : 'pending')
  if (waits) return
  detach($, () => void (mode === 'session' ? answerFromSession($, entry) : answerWithTools($, entry)))
}

export async function clearChat($: EngineInterface): Promise<void> {
  // An answer still on its way finds its entry gone: settleEntry leaves it out, and a queued one is never asked.
  await update($, CHAT, chat => (chat.length === 0 ? chat : []))
}

/**
 * At each load: a fork or a Haiku call the old load was waiting on died with it, and so may a subagent's end; queued
 * questions go on. A turn still running shows at its next step and holds them again.
 */
export async function askSessionStart($: EngineInterface): Promise<void> {
  isMainTurnRunning = false
  const chat = await read($, CHAT)
  const waitingAgents = chat.filter(c => c.status === 'pending' && c.agentId !== undefined)
  const running = waitingAgents.length === 0 ? new Set<string>() : new Set((await listAgents($)).filter(a => a.status === 'running' || a.status === 'pending' || a.status === 'waiting').map(a => a.id))
  const lost = (c: ChatEntry) => c.status === 'pending' && (c.agentId === undefined || !running.has(c.agentId))
  if (chat.some(lost)) {
    const cut = tr('Cut short by a reload.', 'Interrompida por um recarregamento.')
    const gone = tr('The agent is no longer running.', 'O agente não está mais rodando.')
    await update($, CHAT, entries => entries.map(c => (lost(c) ? { ...c, status: 'failed' as const, text: c.agentId === undefined ? cut : gone } : c)))
  }
  if (chat.some(c => c.status === 'queued')) detach($, () => void flushQueue($))
}

/** Any step of the main loop's turn (the first, or the next one after a reload): questions wait for its end. */
export function askTurnStep(e: Args<'turn.step'>): void {
  if (e.agentId === undefined) isMainTurnRunning = true
}

/**
 * A prompt the session took starts a turn before its first step: a question asked in between waits too. Not a slash
 * command (most ask no model; one that does shows at its first step), nor a prompt a hook dropped.
 */
export function askPromptSubmit(e: Args<'prompt.submit'>, result: ResultOf['prompt.submit']): void {
  if (e.isMeta !== true && e.command === undefined && result.drop === undefined) isMainTurnRunning = true
}

/** The main turn is over, however it ended (a hook beneath that failed too): nothing holds the questions. */
export function askTurnEnd(e: Args<'turn.complete'>): void {
  if (e.agentId === undefined) isMainTurnRunning = false
}

/** A main turn ended: the queue goes. A subagent the pane started ended: its answer lands in its entry. */
export async function askTurnComplete($: EngineInterface, e: Args<'turn.complete'>): Promise<void> {
  if (e.agentId === undefined) {
    detach($, () => void flushQueue($))
    return
  }
  const agentId = e.agentId
  const chat = await read($, CHAT)
  const entry = chat.find(c => c.agentId === agentId && c.status === 'pending')
  if (entry === undefined) return
  const ms = (await $.clock.now()) - entry.at
  const answer = e.answer.trim()
  if (e.isAborted) await settleEntry($, entry.id, { status: 'failed', text: tr('The agent was stopped.', 'O agente foi interrompido.'), ms })
  else if (e.reason === 'refusal') await settleEntry($, entry.id, { status: 'failed', text: tr(`The agent refused: ${e.refusal.explanation ?? e.refusal.category ?? '?'}`, `O agente recusou: ${e.refusal.explanation ?? e.refusal.category ?? '?'}`), ms })
  else if (e.reason === 'error') await settleEntry($, entry.id, { status: 'failed', text: tr('The agent stopped on an error.', 'O agente parou num erro.'), ms })
  else await settleEntry($, entry.id, answer === '' ? { status: 'failed', text: tr('The agent answered nothing.', 'O agente não respondeu nada.'), ms } : { status: 'ready', text: answer, ms })
}
