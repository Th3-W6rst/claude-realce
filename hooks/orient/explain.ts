import { atom, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import { openSessionPane } from './paneToggle'

const EXPLAIN = atom({ plugin: 'realce', key: 'explain' } as const, null)

const MAX_CHARS = 4000
const SYSTEM = 'Explique em português simples, em até 4 frases, para quem não é especialista.'

async function runExplain($: EngineInterface, excerpt: string): Promise<void> {
  let next: { status: 'ready' | 'failed'; text: string }
  try {
    const reply = await $.model.complete({ model: 'haiku', system: SYSTEM, prompt: excerpt, maxTokens: 400, timeoutMs: 30_000 })
    next = reply.isAnswered ? { status: 'ready', text: reply.text.trim() } : { status: 'failed', text: reply.reason }
  } catch (error) {
    next = { status: 'failed', text: error instanceof Error ? error.message : String(error) }
  }
  // A newer request owns the panel: an older answer arriving late is dropped.
  await update($, EXPLAIN, panel => (panel === null || panel.excerpt !== excerpt ? panel : { ...panel, ...next }))
}

export async function closeExplanation($: EngineInterface): Promise<void> {
  await update($, EXPLAIN, () => null)
}

/** `/realce explica`: the selected text explained in the session pane, by a fast model, off the command. */
export async function explainCommand($: EngineInterface): Promise<string> {
  const selection = await $.ui.selection()
  const text = selection?.text.trim() ?? ''
  if (text === '') return 'Selecione um trecho da conversa (em tela cheia) e rode de novo.'
  const excerpt = [...text].slice(0, MAX_CHARS).join('')
  await update($, EXPLAIN, () => ({ excerpt, status: 'pending' as const, text: '' }))
  await openSessionPane($)
  $.clock.after(0, () => void runExplain($, excerpt))
  return 'Explicando no painel.'
}
