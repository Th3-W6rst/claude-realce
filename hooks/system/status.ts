import type { EngineInterface } from 'claude-code'

import { cachedEnv } from '../env'
import { FLAGS, getStoredFlags, isMasterOn } from '../flags'
import { isPicked, lang, pick, tr, type Text } from '../i18n'
import { composePrompt } from '../io'
import { lastNotifyFailure, lastNotifyWasBanner } from '../orient/notify'
import { perfLines } from '../perf'
import { lastComposed, SECTION_ID } from '../prompt'
import { explanationsSent } from '../screen/explainError'
import { currentTheme, type ThemeKind } from '../theme'
import { localVersion, updateStatus } from './update'

const THEME_NAMES: Record<ThemeKind, Text> = {
  dark: { en: 'dark', pt: 'escuro' },
  light: { en: 'light', pt: 'claro' },
  'dark-cb': { en: 'dark for color blindness', pt: 'escuro para daltônicos' },
  'light-cb': { en: 'light for color blindness', pt: 'claro para daltônicos' },
  'dark-ansi': { en: 'dark ANSI', pt: 'ANSI escuro' },
  'light-ansi': { en: 'light ANSI', pt: 'ANSI claro' },
}

/** `/realce status`: what is on, what the model is taught, the environment, and how the drawings perform. */
export async function statusCommand($: EngineInterface, isFullscreen: boolean): Promise<string> {
  const last = lastComposed()
  const stored = await getStoredFlags($)
  const off = FLAGS.filter(f => !stored[f.id]).map(f => pick(f.label))
  const env = cachedEnv()
  const { sections } = await composePrompt($)
  // Always said, for whoever reports a problem: the update line comes only on the day the check runs.
  const version = await localVersion($)
  const isTaught = sections.some(s => s.id === SECTION_ID)
  const sent = explanationsSent()
  const failure = lastNotifyFailure()
  const theme = pick(THEME_NAMES[currentTheme()])
  return [
    (await isMasterOn($)) ? tr('Realce on.', 'Realce ligado.') : tr('Realce off.', 'Realce desligado.'),
    ...(version === null ? [] : [tr(`Installed version: ${version}.`, `Versão instalada: ${version}.`)]),
    isPicked()
      ? tr(`Language: ${lang() === 'pt' ? 'Portuguese' : 'English'} (picked; /realce language auto follows Claude Code).`, `Idioma: ${lang() === 'pt' ? 'português' : 'inglês'} (escolhido; /realce idioma auto volta a seguir o Claude Code).`)
      : tr(`Language: ${lang() === 'pt' ? 'Portuguese' : 'English'} (Claude Code's).`, `Idioma: ${lang() === 'pt' ? 'português' : 'inglês'} (o do Claude Code).`),
    tr(`Features off: ${off.length === 0 ? 'none' : off.join(', ')}.`, `Recursos desligados: ${off.length === 0 ? 'nenhum' : off.join(', ')}.`),
    tr(
      `System prompt built now: ${isTaught ? 'carries' : 'leaves out'} the reading section.`,
      `System prompt montado agora: ${isTaught ? 'leva' : 'não leva'} a seção de leitura.`,
    ),
    last === undefined
      ? tr('No request has built the system prompt since the mod loaded.', 'Nenhum request montou o system prompt desde que o mod carregou.')
      : tr(
          `Last request (${last.at}): section ${last.isAdded ? 'added' : 'left out'}; surfaces [${last.surfaces.join(', ')}], traits [${last.traits.join(', ')}].`,
          `Último request (${last.at}): seção ${last.isAdded ? 'incluída' : 'omitida'}; superfícies [${last.surfaces.join(', ')}], traits [${last.traits.join(', ')}].`,
        ),
    env === null
      ? tr("Session environment: not read yet.", 'Ambiente da sessão: ainda não lido.')
      : tr(
          `Links open in: ${env.editor}. Diagrams: ${env.mmdc === null ? 'mmdc not found' : `mmdc at ${env.mmdc}`}.`,
          `Editor dos links: ${env.editor}. Diagramas: ${env.mmdc === null ? 'mmdc não encontrado' : `mmdc em ${env.mmdc}`}.`,
        ),
    tr(`Colors: ${theme} theme.`, `Cores: tema ${theme}.`),
    ...(sent.sent === 0 ? [] : [tr(`Errors the Haiku explained since the mod loaded: ${sent.sent} of ${sent.max}.`, `Erros explicados pelo Haiku desde que o mod carregou: ${sent.sent} de ${sent.max}.`)]),
    isFullscreen
      ? tr('Fullscreen: yes.', 'Tela cheia: sim.')
      : tr(
          'Fullscreen: no. Scrolling from the timeline and the pinned replies, and selecting for /realce explain, need "tui": "fullscreen" in settings.json.',
          'Tela cheia: não. Rolar pela linha do tempo e pelas fixadas, e selecionar para o /realce explica, pedem "tui": "fullscreen" no settings.json.',
        ),
    ...(failure === null ? [] : [tr(`Last notice not sent: ${failure}.`, `Último aviso não enviado: ${failure}.`)]),
    ...(lastNotifyWasBanner() ? [tr("Last notice: handed to macOS (the terminal gives Claude Code no channel).", 'Último aviso: entregue ao macOS (o terminal não dá canal ao Claude Code).')] : []),
    ...(updateStatus() === null ? [] : [updateStatus()!]),
    ...perfLines(),
  ].join('\n')
}
