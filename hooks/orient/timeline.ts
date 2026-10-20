import { atom, read, update } from 'claude-code'
import type { Args, EngineInterface, ResultOf } from 'claude-code'

import type { TimelineRow } from '../../types'
import { formatClock, formatDuration } from '../format'
import { sealLabel, turnStatsFor } from '../screen/turns'

const TIMELINE = atom({ plugin: 'realce', key: 'timeline' } as const, [])

const MAX_KEPT = 50
const PROMPT_CHARS = 60

const cut = (text: string, max: number) => ([...text].length <= max ? text : `${[...text].slice(0, max - 1).join('')}…`)

/** '20:41 · 12s · Renomeia o parâmetro b · ✔ provado': the parts the row has. */
export function timelineText(row: TimelineRow, tzOffsetMinutes: number | undefined): string {
  const parts: string[] = []
  if (tzOffsetMinutes !== undefined) parts.push(formatClock(row.at, tzOffsetMinutes))
  if (row.durationMs !== null) parts.push(formatDuration(row.durationMs))
  parts.push(row.prompt)
  const seal = sealLabel(row.seal)
  if (seal !== null) parts.push(seal.text)
  return parts.join(' · ')
}

/** A prompt the person typed, once stored: its row, under the id the transcript scrolls to. */
// How the engine frames a plugin's prompt for the model: "The <name> plugin sent a message:\n<text>\n\n<a note>".
const PLUGIN_FRAME = /^The (\S+) plugin sent a message:\s*\n(.*)/

/** A prompt's first line as the person reads it: a plugin's own words under its name, not the frame. */
export function promptLine(text: string): string {
  const framed = PLUGIN_FRAME.exec(text)
  return framed === null ? text.split('\n')[0]!.trim() : `${framed[1]}: ${framed[2]!.trim()}`
}

export async function recordPrompt($: EngineInterface, e: Args<'session.append'>, stored: ResultOf['session.append']): Promise<void> {
  if (stored.deny !== undefined || e.agentId !== undefined || e.door !== 'prompt') return
  const message = stored.message
  if (message.type !== 'user' || message.isMeta === true) return
  const text = message.content.flatMap(b => (b.type === 'text' && typeof b.text === 'string' ? [b.text] : [])).join(' ').trim()
  if (text === '') return
  // A prompt typed over a running turn joins it: that turn keeps one row, the first prompt's.
  const rows = await read($, TIMELINE)
  if (rows.length > 0 && rows[rows.length - 1]!.durationMs === null) return
  const row: TimelineRow = { requestId: stored.uuid, at: await $.clock.now(), prompt: cut(promptLine(text), PROMPT_CHARS), durationMs: null, seal: null, tests: null }
  await update($, TIMELINE, all => [...all, row].slice(-MAX_KEPT))
}

/** The main loop's turn ended: its row gets the duration and the verdict. */
export async function completeTimeline($: EngineInterface, e: Args<'turn.complete'>): Promise<void> {
  if (e.agentId !== undefined) return
  const rows = await read($, TIMELINE)
  const last = rows[rows.length - 1]
  if (last === undefined || last.durationMs !== null) return
  const stats = turnStatsFor(e.durationMs)
  await update($, TIMELINE, all => all.map(r => (r === all[all.length - 1] ? { ...r, durationMs: e.durationMs, seal: stats?.seal ?? null, tests: stats?.tests ?? null } : r)))
}

/** What the person reads when the transcript would not move: the common case in words, any other as the engine said. */
export function scrollRefusal(deny: string): string {
  return /person-initiated|none scrolls/.test(deny) ? 'A linha do tempo rola só em tela cheia.' : `Não deu para rolar: ${deny}.`
}

/** From a press in the pane: the transcript moves to the row, or the person is told why it cannot. */
export async function scrollToRow($: EngineInterface, requestId: string): Promise<void> {
  const result = await $.ui.scroll({ to: { requestId } })
  if (result.deny !== undefined) $.ui.toast(scrollRefusal(result.deny))
}
