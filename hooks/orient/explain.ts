import type { EngineInterface } from 'claude-code'

import { tr, type Text } from '../i18n'
import { addEntry, settleEntry } from './ask'
import { showAgentTab } from './pane/tab'
import { detach, selected } from '../io'
import { askHaiku } from '../screen/explainError'

const MAX_CHARS = 4000
// The explanation comes in the interface's language.
const SYSTEM: Text = {
  en: 'Explain in plain English, in at most 4 sentences, for someone who is not a specialist.',
  pt: 'Explique em português simples, em até 4 frases, para quem não é especialista.',
}

async function runExplain($: EngineInterface, id: string, excerpt: string): Promise<void> {
  const startedAt = await $.clock.now()
  const answer = await askHaiku($, SYSTEM, excerpt, 400, 30_000)
  const ms = (await $.clock.now()) - startedAt
  await settleEntry($, id, 'text' in answer ? { status: 'ready', text: answer.text, ms } : { status: 'failed', text: answer.reason, ms })
}

/**
 * `/realce explica [texto]`: the text given, or else the selection, explained in the pane's Agent tab by a fast model,
 * off the command. The text works where nothing can be selected (outside fullscreen).
 */
export async function explainCommand($: EngineInterface, given: string): Promise<string> {
  const text = given.trim() !== '' ? given.trim() : ((await selected($))?.text.trim() ?? '')
  if (text === '') {
    return tr(
      'Select some text in the conversation (in fullscreen) or write what to explain: /realce explain <text>.',
      'Selecione um trecho da conversa (em tela cheia) ou escreva o que explicar: /realce explica <texto>.',
    )
  }
  const excerpt = [...text].slice(0, MAX_CHARS).join('')
  const entry = await addEntry($, 'explain', excerpt, 'pending')
  await showAgentTab($)
  detach($, () => void runExplain($, entry.id, excerpt))
  return tr('Explaining in the pane.', 'Explicando no painel.')
}
