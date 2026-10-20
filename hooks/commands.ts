import type { EngineInterface, On } from 'claude-code'

import { featureOff, FLAGS, flagSpec, getFlags, getStoredFlags, isFlagId, setFlag, setMaster } from './flags'
import { explainCommand } from './orient/explain'
import { pinCommand } from './orient/pins'
import { demoCommand } from './system/demo'
import { printCommand } from './system/print'
import { openFlagsPane } from './orient/flagsPane'
import { toggleSessionPane } from './orient/paneToggle'
import { status } from './prompt'
import { refreshTheme } from './theme'

const USAGE = '[on|off|status|painel|foco|explica|fixar|print|demo|<recurso> on|off]'

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
    if (words.length === 1 && first === 'foco') {
      const isOn = !(await getStoredFlags($)).foco
      await setFlag($, 'foco', isOn)
      return { text: isOn ? 'Modo foco ligado.' : 'Modo foco desligado.' }
    }
    if (words.length === 1 && first === 'explica') return { text: (await getFlags($)).explica ? await explainCommand($) : featureOff('explica') }
    if (words.length === 1 && first === 'demo') {
      if (!(await getFlags($)).demo) return { text: featureOff('demo') }
      await demoCommand($)
      return {}
    }
    if (words.length === 1 && first === 'print') return { text: (await getFlags($)).print ? await printCommand($) : featureOff('print') }
    if (words.length === 1 && first === 'fixar') return { text: (await getFlags($)).fixar ? await pinCommand($) : featureOff('fixar') }
    if (words.length === 2 && isFlagId(first) && (second === 'on' || second === 'off')) {
      await setFlag($, first, second === 'on')
      if (first === 'tema') await refreshTheme($)
      return { text: `${second === 'on' ? 'Ligado' : 'Desligado'}: ${flagSpec(first).label}.` }
    }
    return { text: `Uso: /realce ${USAGE} (recebi "${e.args.trim()}"). Recursos: ${FLAGS.map(f => f.id).join(', ')}.` }
  })
}
