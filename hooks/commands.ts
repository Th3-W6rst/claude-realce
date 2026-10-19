import type { EngineInterface, On } from 'claude-code'

import { FLAGS, flagSpec, isFlagId, setFlag, setMaster } from './flags'
import { openFlagsPane } from './orient/flagsPane'
import { toggleSessionPane } from './orient/paneToggle'
import { status } from './prompt'

const USAGE = '[on|off|status|painel|<recurso> on|off]'

export async function registerRealceCommand($: EngineInterface): Promise<void> {
  await $.command.register({
    name: 'realce',
    description: 'Liga e desliga os recursos de leitura do realce',
    argumentHint: USAGE,
  })
}

export function registerCommands(on: On): void {
  on('command.run', { command: 'realce' }, async ($, e) => {
    const words = e.args.trim().toLowerCase().split(/\s+/).filter(Boolean)
    const [first = '', second] = words
    if (words.length === 0) {
      await openFlagsPane($)
      return {}
    }
    if (words.length === 1 && (first === 'on' || first === 'off')) {
      await setMaster($, first === 'on')
      return { text: first === 'on' ? 'Realce ligado.' : 'Realce desligado.' }
    }
    if (words.length === 1 && first === 'status') return { text: await status($) }
    if (words.length === 1 && first === 'painel') {
      return { text: (await toggleSessionPane($)) ? 'Painel da sessão aberto.' : 'Painel da sessão fechado.' }
    }
    if (words.length === 2 && isFlagId(first) && (second === 'on' || second === 'off')) {
      await setFlag($, first, second === 'on')
      return { text: `${second === 'on' ? 'Ligado' : 'Desligado'}: ${flagSpec(first).label}.` }
    }
    return { text: `Uso: /realce ${USAGE} (recebi "${e.args.trim()}"). Recursos: ${FLAGS.map(f => f.id).join(', ')}.` }
  })
}
