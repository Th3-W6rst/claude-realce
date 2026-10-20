import { atom, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import { pick, tr, type Text } from '../i18n'
import { openSessionPane } from './paneToggle'

const EXPLAIN = atom({ plugin: 'realce', key: 'explain' } as const, null)

const MAX_CHARS = 4000
// The explanation comes in the interface's language.
const SYSTEM: Text = {
  en: 'Explain in plain English, in at most 4 sentences, for someone who is not a specialist.',
  pt: 'Explique em português simples, em até 4 frases, para quem não é especialista.',
}

async function runExplain($: EngineInterface, excerpt: string): Promise<void> {
  let next: { status: 'ready' | 'failed'; text: string }
  try {
    const reply = await $.model.complete({ model: 'haiku', system: pick(SYSTEM), prompt: excerpt, maxTokens: 400, timeoutMs: 30_000 })
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

/**
 * `/realce explica [texto]`: the text given, or else the selection, explained in the session pane by a fast model,
 * off the command. The text works where nothing can be selected (outside fullscreen).
 */
export async function explainCommand($: EngineInterface, given = ''): Promise<string> {
  const text = given.trim() !== '' ? given.trim() : ((await $.ui.selection())?.text.trim() ?? '')
  if (text === '') {
    return tr(
      'Select some text in the conversation (in fullscreen) or write what to explain: /realce explain <text>.',
      'Selecione um trecho da conversa (em tela cheia) ou escreva o que explicar: /realce explica <texto>.',
    )
  }
  const excerpt = [...text].slice(0, MAX_CHARS).join('')
  await update($, EXPLAIN, () => ({ excerpt, status: 'pending' as const, text: '' }))
  await openSessionPane($)
  $.clock.after(0, () => void runExplain($, excerpt))
  return tr('Explaining in the pane.', 'Explicando no painel.')
}
