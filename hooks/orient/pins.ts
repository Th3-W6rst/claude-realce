import { atom, update } from 'claude-code'
import type { Args, EngineInterface, ResultOf } from 'claude-code'

import type { Pin } from '../../types'
import { tr } from '../i18n'

const PINS = atom({ plugin: 'realce', key: 'pins' } as const, [])

const MAX_PINS = 20
const PREVIEW_CHARS = 60

// The newest text the model wrote: what `/realce fixar` pins without a selection. A turn's last text row is its
// answer; the ones before it are the steps on the way.
let lastReply: { requestId: string; preview: string } | null = null

const preview = (text: string) => {
  const line = text.trim().split('\n')[0]!.trim()
  return [...line].length <= PREVIEW_CHARS ? line : `${[...line].slice(0, PREVIEW_CHARS - 1).join('')}…`
}

/** Pins `pin`, or unpins it when it is pinned; past twenty, the oldest goes. */
export function togglePin(pins: readonly Pin[], pin: Pin): Pin[] {
  if (pins.some(p => p.requestId === pin.requestId)) return pins.filter(p => p.requestId !== pin.requestId)
  return [...pins, pin].slice(-MAX_PINS)
}

/** Each stored text row the model wrote in the main conversation. */
export async function notePinnable($: EngineInterface, e: Args<'session.append'>, stored: ResultOf['session.append']): Promise<void> {
  if (stored.deny !== undefined || e.agentId !== undefined || stored.message.type !== 'assistant') return
  const text = stored.message.content.flatMap(b => (b.type === 'text' && typeof b.text === 'string' ? [b.text] : [])).join('\n')
  if (text.trim() !== '') lastReply = { requestId: stored.uuid, preview: preview(text) }
}

/** `/realce pin` (`fixar`): the reply the selection lies in, or the newest one, pinned or unpinned in the session pane. */
export async function pinCommand($: EngineInterface): Promise<string> {
  const selection = await $.ui.selection()
  const target =
    selection?.requestId !== undefined ? { requestId: selection.requestId, preview: preview(selection.text) } : lastReply
  if (target === null) return tr('No reply to pin yet.', 'Nenhuma resposta para fixar ainda.')
  const at = await $.clock.now()
  let isPinned = false
  await update($, PINS, pins => {
    const next = togglePin(pins, { ...target, at })
    isPinned = next.some(p => p.requestId === target.requestId)
    return next
  })
  return isPinned ? tr('Reply pinned.', 'Resposta fixada.') : tr('Reply unpinned.', 'Resposta desafixada.')
}
