import type { On, RenderPropsOf } from 'claude-code'

import { getFlags } from '../flags'
import { timed } from '../perf'

export const SPINNER_WORDS: Record<RenderPropsOf['Spinner']['mode'], string> = {
  requesting: 'Conectando',
  responding: 'Escrevendo',
  thinking: 'Pensando',
  'tool-input': 'Preparando',
  'tool-use': 'Executando',
}

// The engine's own spinner messages this mod knows; any other passes as the engine wrote it.
const MESSAGES: readonly [RegExp, (m: RegExpExecArray) => string][] = [
  [/^Waiting for (\d+) background agents? to finish(.*)$/s, m => `Esperando ${m[1]} ${m[1] === '1' ? 'agente' : 'agentes'} em segundo plano${m[2]}`],
  [/^Compacting conversation(.*)$/s, m => `Compactando a conversa${m[1]}`],
]

export function translateSpinnerMessage(message: string): string {
  for (const [re, say] of MESSAGES) {
    const m = re.exec(message)
    if (m !== null) return say(m)
  }
  return message
}

export function registerSpinner(on: On): void {
  on('ui.render', { component: 'Spinner' }, async ($, e, next) => timed('Spinner', async () => {
    const flags = await getFlags($)
    // The desktop's word names the step it runs ("Creating notes.md"): only the terminal's is a random gerund.
    if (!flags.spinner || e.surface !== 'terminal') return next(e)
    const message = e.props.message === null ? null : translateSpinnerMessage(e.props.message)
    return next({ ...e, props: { ...e.props, word: SPINNER_WORDS[e.props.mode], message } })
  }))
}
