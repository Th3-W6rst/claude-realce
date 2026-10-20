import { atom, read, update } from 'claude-code'
import type { Args, EngineInterface, ResultOf } from 'claude-code'

import type { SessionEnv } from '../../types'

import { getFlags } from '../flags'
import { diagramDir, findMermaid, storeDiagram, type Mermaid } from './diagram'
import { detach, transcript } from '../io'

const DIAGRAMS = atom({ plugin: 'realce', key: 'diagrams' } as const, {})
const ENV = atom({ plugin: 'realce', key: 'env' } as const, null)

// The code area's share of the session's shared events. hooks/events.ts calls each by name (the engine follows $
// only into declared functions), so these five names stay; a body left empty means the area does not listen.

/**
 * Replies already in the transcript get their diagrams too: those drawn before this load, and one a reload cut
 * short mid-render. A PNG already in the cache comes back without running mmdc.
 */
export async function codeSessionStart($: EngineInterface, e: Args<'session.start'>): Promise<void> {
  await queueTranscriptDiagrams($)
}

/** Every diagram in the transcript not yet drawn for the theme in force: at start, and after a theme change. */
export async function queueTranscriptDiagrams($: EngineInterface): Promise<void> {
  if (!(await getFlags($)).diagramas) return
  const env = await read($, ENV)
  if (env === null || env.mmdc === null) return
  const messages = await transcript($)
  const found = messages.flatMap(m => (m.role === 'assistant' ? findMermaid(m.text) : []))
  const known = await read($, DIAGRAMS)
  await queueDiagrams($, found.filter(m => known[m.hash] === undefined || known[m.hash]?.status === 'rendering'), env)
}

export async function codePromptSubmit($: EngineInterface, e: Args<'prompt.submit'>): Promise<void> {}

/** After the call settled; subagents' calls too (`e.agentId`). */
export async function codeToolCall($: EngineInterface, e: Args<'tool.call'>, result: ResultOf['tool.call']): Promise<void> {}

/** The main loop's turns and subagents' (`e.agentId`). */
export async function codeTurnComplete($: EngineInterface, e: Args<'turn.complete'>): Promise<void> {}

/** Once the row is stored: a reply's new mermaid blocks are marked and rendered off the dispatch. */
export async function codeAppend($: EngineInterface, e: Args<'session.append'>, stored: ResultOf['session.append']): Promise<void> {
  if (stored.deny !== undefined || stored.message.type !== 'assistant') return
  if (!(await getFlags($)).diagramas) return
  const env = await read($, ENV)
  if (env === null || env.mmdc === null) return
  const found = stored.message.content.flatMap(block => (block.type === 'text' && typeof block.text === 'string' ? findMermaid(block.text) : []))
  if (found.length === 0) return
  const known = await read($, DIAGRAMS)
  await queueDiagrams($, found.filter(m => known[m.hash] === undefined), env)
}

/** Marks each new diagram as rendering and runs mmdc off the dispatch, once per hash. */
async function queueDiagrams($: EngineInterface, found: readonly Mermaid[], env: SessionEnv): Promise<void> {
  const fresh = found.filter((m, i) => found.findIndex(o => o.hash === m.hash) === i)
  if (fresh.length === 0 || env.mmdc === null) return
  await update($, DIAGRAMS, all => ({ ...all, ...Object.fromEntries(fresh.map(m => [m.hash, { status: 'rendering' as const }])) }))
  const { mmdc } = env
  const dir = diagramDir(env.home)
  // mmdc takes seconds (a headless Chrome): the event's dispatch never waits on it.
  for (const m of fresh) detach($, () => void storeDiagram($, m.source, m.hash, mmdc, dir))
}
