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
import { toPlainMarkdown } from './text/inline'
import { cachedEnv, sessionOffset } from './env'
import { reportCommand } from './orient/report'

const USAGE = '[ajuda|on|off|status|painel|copiar|resumo|foco|explica|fixar|print|demo|<recurso> on|off]'

const HELP = [
  'Comandos do realce:',
  '/realce — painel de flags (letra ou número alterna, Tab e Enter também, Esc fecha)',
  '/realce on | off — liga ou desliga tudo, sem perder a escolha de cada recurso',
  '/realce <recurso> on | off — liga ou desliga um recurso',
  '/realce painel — abre ou fecha o painel da sessão',
  '/realce copiar — copia a última resposta do Claude',
  '/realce resumo — mostra e copia um resumo da sessão em markdown',
  '/realce foco — esconde as ferramentas concluídas sem erro',
  '/realce explica — explica no painel o trecho selecionado',
  '/realce fixar — fixa a resposta selecionada, ou a última',
  '/realce print — salva a última resposta como imagem no Desktop',
  '/realce demo — mostra tudo o que o mod faz, sem chamar o modelo',
  '/realce status — o que está desligado, tema, tela cheia, avisos e desempenho',
].join('\n')

/** `/realce copiar`: the last reply on the clipboard, its typed marks as plain markdown. */
async function copyLastReply($: EngineInterface): Promise<string> {
  const reply = [...(await $.session.messages())].reverse().find(m => m.role === 'assistant' && m.text.trim() !== '')
  if (reply === undefined) return 'Nenhuma resposta para copiar ainda.'
  const copied = await $.ui.copy({ text: toPlainMarkdown(reply.text) })
  return copied.isCopied ? 'Última resposta copiada.' : `Não deu para copiar: ${copied.reason}.`
}

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
    if (words.length === 1 && first === 'ajuda') return { text: HELP }
    if (words.length === 1 && first === 'copiar') return { text: await copyLastReply($) }
    if (words.length === 1 && first === 'resumo') {
      return { text: (await getFlags($)).resumo ? await reportCommand($, cachedEnv()?.cwd ?? (await $.session.cwd()), await sessionOffset($)) : featureOff('resumo') }
    }
    if (words.length === 1 && first === 'status') return { text: await status($, e.presentation.isFullscreen) }
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
