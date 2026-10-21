import type { EngineInterface, On } from 'claude-code'

import { featureOff, flagName, flagOf, FLAGS, flagSpec, getFlags, getStoredFlags, isFlagId, pickLanguage, setFlag, setMaster, type FlagId } from './flags'
import { isPicked, pick, tr, type Lang } from './i18n'
import { explainCommand } from './orient/explain'
import { ask } from './orient/ask'
import { showAgentTab } from './orient/pane/tab'
import { pinCommand } from './orient/pins'
import { demoCommand } from './system/demo'
import { lastReply, printCommand } from './system/print'
import { applyFlag, openFlagsPane } from './orient/flagsPane'
import { retitleSessionPane, toggleSessionPane } from './orient/paneToggle'
import { statusCommand } from './system/status'
import { toPlainMarkdown } from './text/inline'
import { cachedEnv, sessionOffset } from './env'
import { summaryCommand } from './system/summary'
import { doctorCommand } from './system/doctor'
import { copyText, registerCommand } from './io'

const usage = () =>
  tr(
    '[help|doctor|on|off|status|pane|ask|copy|summary|focus|explain|pin|print|demo|language|<feature> on|off]',
    '[ajuda|diagnostico|on|off|status|painel|pergunta|copiar|resumo|foco|explica|fixar|print|demo|idioma|<recurso> on|off]',
  )

// Every command answers to its English and its Portuguese name; the help shows the one of the language in force.
// The commands named after a flag (copy, summary, pane, focus, explain, pin) take the flag table's names.
const COMMAND_WORDS: Readonly<Record<string, string>> = { help: 'ajuda', doctor: 'diagnostico', language: 'idioma', ask: 'pergunta' }

/** A command word or a flag name as the dispatcher knows it: Portuguese, the store's ids. */
const canonical = (word: string): string => (Object.hasOwn(COMMAND_WORDS, word) ? COMMAND_WORDS[word]! : (flagOf(word)?.id ?? word))

const help = () =>
  tr(
    [
      'realce commands:',
      '/realce — flags pane (a letter or digit toggles, Tab and Enter too, Esc closes)',
      '/realce on | off — turns everything on or off, keeping each feature’s choice',
      '/realce <feature> on | off — turns one feature on or off',
      '/realce pane — opens or closes the session pane',
      "/realce ask [question] — asks the pane's agent about the session; alone, opens it to type",
      "/realce copy — copies Claude's last reply",
      '/realce summary — shows and copies a summary of the session in markdown',
      '/realce focus — hides the tools that finished without error',
      '/realce explain [text] — explains the given text in the pane, or the selected text',
      '/realce pin — pins the selected reply, or the last one',
      '/realce print — saves the last reply as a picture on the Desktop',
      '/realce demo — shows everything the mod does, without calling the model',
      '/realce status — what is off, theme, fullscreen, notifications and performance',
      '/realce doctor — checks what this machine gives realce and what to install',
      "/realce language en | pt | auto — the interface's language; auto follows Claude Code",
    ].join('\n'),
    [
      'Comandos do realce:',
      '/realce — painel de flags (letra ou número alterna, Tab e Enter também, Esc fecha)',
      '/realce on | off — liga ou desliga tudo, sem perder a escolha de cada recurso',
      '/realce <recurso> on | off — liga ou desliga um recurso',
      '/realce painel — abre ou fecha o painel da sessão',
      '/realce pergunta [pergunta] — pergunta ao agente do painel sobre a sessão; sozinho, abre para digitar',
      '/realce copiar — copia a última resposta do Claude',
      '/realce resumo — mostra e copia um resumo da sessão em markdown',
      '/realce foco — esconde as ferramentas concluídas sem erro',
      '/realce explica [texto] — explica no painel o texto dado, ou o trecho selecionado',
      '/realce fixar — fixa a resposta selecionada, ou a última',
      '/realce print — salva a última resposta como imagem no Desktop',
      '/realce demo — mostra tudo o que o mod faz, sem chamar o modelo',
      '/realce status — o que está desligado, tema, tela cheia, avisos e desempenho',
      '/realce diagnostico — confere o que esta máquina dá ao realce e o que falta instalar',
      '/realce idioma en | pt | auto — o idioma da interface; auto segue o Claude Code',
    ].join('\n'),
  )

/** `/realce copiar`: the last reply on the clipboard, its typed marks as plain markdown. */
async function copyLastReply($: EngineInterface): Promise<string> {
  const reply = await lastReply($)
  if (reply === undefined) return tr('No reply to copy yet.', 'Nenhuma resposta para copiar ainda.')
  const copied = await copyText($, { text: toPlainMarkdown(reply.text) })
  return copied.isCopied ? tr('Last reply copied.', 'Última resposta copiada.') : tr(`Could not copy: ${copied.reason}.`, `Não deu para copiar: ${copied.reason}.`)
}

/** `/realce pergunta [texto]`: the question to the pane's agent, over the session; alone, the field to type it in. */
async function askCommand($: EngineInterface, question: string): Promise<string> {
  await showAgentTab($, question === '')
  if (question === '') return tr('Type the question in the pane.', 'Escreva a pergunta no painel.')
  await ask($, question, 'session')
  return tr('Asking in the pane.', 'Perguntando no painel.')
}

export async function registerRealceCommand($: EngineInterface): Promise<void> {
  await registerCommand($, {
    name: 'realce',
    description: tr("Turns realce's reading aids on and off", 'Liga e desliga os recursos de leitura do realce'),
    argumentHint: usage(),
  })
}

const LANGUAGE_WORDS: Readonly<Record<string, Lang | null>> = {
  en: 'en', english: 'en', ingles: 'en', inglês: 'en', pt: 'pt', portuguese: 'pt', portugues: 'pt', português: 'pt', auto: null,
}

/** The language in force and where it comes from, as `/realce language` alone says it. */
const languageNow = () =>
  tr(
    `Interface language: English (${isPicked() ? 'picked' : "Claude Code's"}). /realce language en|pt|auto changes it.`,
    `Idioma da interface: português (${isPicked() ? 'escolhido' : 'o do Claude Code'}). /realce idioma en|pt|auto muda.`,
  )

/** `/realce language en|pt|auto`: the answer comes in the language it leaves in force. */
async function languageCommand($: EngineInterface, word: string): Promise<string> {
  if (word === '') return languageNow()
  if (!Object.hasOwn(LANGUAGE_WORDS, word)) return tr(`Usage: /realce language en|pt|auto (got "${word}").`, `Uso: /realce idioma en|pt|auto (recebi "${word}").`)
  const next = LANGUAGE_WORDS[word]!
  await pickLanguage($, next)
  await registerRealceCommand($)
  await retitleSessionPane($)
  if (next === 'en') return 'Interface language: English. /realce language auto follows Claude Code again.'
  if (next === 'pt') return 'Idioma da interface: português. /realce idioma auto volta a seguir o Claude Code.'
  return tr("Interface language: Claude Code's (English).", 'Idioma da interface: o do Claude Code (português).')
}

/** A feature's command, or what it answers while the feature's flag is off. */
async function gated($: EngineInterface, id: FlagId, run: () => Promise<string>): Promise<string> {
  return (await getFlags($))[id] ? run() : featureOff(id)
}

export function registerCommands(on: On): void {
  on('command.run', { command: 'realce' }, async ($, e) => {
    // The flags' read also brings the language the person picked: every answer below speaks it.
    await getStoredFlags($)
    const words = e.args.trim().toLowerCase().split(/\s+/).filter(Boolean)
    const typed = words[0] ?? ''
    const first = canonical(typed)
    const second = words[1]
    if (words.length === 0) {
      await openFlagsPane($)
      return {}
    }
    if (words.length === 1 && (first === 'on' || first === 'off')) {
      await setMaster($, first === 'on')
      return { text: first === 'on' ? tr('Realce on.', 'Realce ligado.') : tr('Realce off.', 'Realce desligado.') }
    }
    if (words.length <= 2 && first === 'idioma') return { text: await languageCommand($, second ?? '') }
    if (words.length === 1 && first === 'ajuda') return { text: help() }
    if (words.length === 1 && first === 'diagnostico') return { text: await doctorCommand($, e.presentation.isFullscreen) }
    if (words.length === 1 && first === 'copiar') return { text: await copyLastReply($) }
    if (words.length === 1 && first === 'resumo') {
      return { text: await gated($, 'resumo', async () => summaryCommand($, cachedEnv()?.cwd ?? null, await sessionOffset($))) }
    }
    if (words.length === 1 && first === 'status') return { text: await statusCommand($, e.presentation.isFullscreen) }
    if (words.length === 1 && first === 'painel') {
      return { text: (await toggleSessionPane($)) ? tr('Session pane open.', 'Painel da sessão aberto.') : tr('Session pane closed.', 'Painel da sessão fechado.') }
    }
    if (words.length === 1 && first === 'foco') {
      const isOn = !(await getStoredFlags($)).foco
      await setFlag($, 'foco', isOn)
      return { text: isOn ? tr('Focus mode on.', 'Modo foco ligado.') : tr('Focus mode off.', 'Modo foco desligado.') }
    }
    if (first === 'explica' && (words.length === 1 || !(words.length === 2 && (second === 'on' || second === 'off')))) {
      // What follows the word keeps its case: it is the text to explain.
      const given = e.args.trim().slice(typed.length)
      return { text: await gated($, 'explica', () => explainCommand($, given)) }
    }
    if (first === 'pergunta') {
      const question = e.args.trim().slice(typed.length).trim()
      return { text: await gated($, 'agente', () => askCommand($, question)) }
    }
    if (words.length === 1 && first === 'demo') {
      if (!(await getFlags($)).demo) return { text: featureOff('demo') }
      await demoCommand($)
      return {}
    }
    if (words.length === 1 && first === 'print') return { text: await gated($, 'print', () => printCommand($)) }
    if (words.length === 1 && first === 'fixar') return { text: await gated($, 'fixar', () => pinCommand($)) }
    if (words.length === 2 && isFlagId(first) && (second === 'on' || second === 'off')) {
      await applyFlag($, first, second === 'on')
      const label = pick(flagSpec(first).label)
      return { text: second === 'on' ? tr(`On: ${label}.`, `Ligado: ${label}.`) : tr(`Off: ${label}.`, `Desligado: ${label}.`) }
    }
    const names = FLAGS.map(flagName).join(', ')
    return { text: tr(`Usage: /realce ${usage()} (got "${e.args.trim()}"). Features: ${names}.`, `Uso: /realce ${usage()} (recebi "${e.args.trim()}"). Recursos: ${names}.`) }
  })
}
