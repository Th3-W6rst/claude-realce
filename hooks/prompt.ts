import { atom, read } from 'claude-code'
import type { EngineInterface, On, PromptComposeSection } from 'claude-code'

import { findMermaid } from './env'
import { FLAGS, getFlags, getStoredFlags, isMasterOn, type Flags } from './flags'
import { ensureLanguage, isPicked, lang, pick, tr, type Text } from './i18n'
import { lastNotifyFailure, lastNotifyWasBanner } from './orient/notify'
import { localVersion, updateStatus } from './system/update'
import { explanationsSent } from './screen/explainError'
import { currentTheme, type ThemeKind } from './theme'
import { perfLines } from './perf'
import { composePrompt, logLine, redraw } from './io'

const ENV = atom({ plugin: 'realce', key: 'env' } as const, null)

export const SECTION_ID = 'realce:reading-aids'

// What the last system prompt render decided, for `/realce status`. Kept in the module, not the store: a store
// write on every request would redraw every drawing that reads the store.
type LastCompose = { at: string; surfaces: readonly string[]; traits: readonly string[]; isAdded: boolean }
let lastCompose: LastCompose | undefined

// The section is English for the model; the words it is taught to write (callout tags, the change phrase) are the
// interface's, so they read right in the person's language.
const AIDS: readonly { flag: keyof Flags; needsMermaid?: true; text: string | Text }[] = [
  {
    flag: 'enfase',
    text: `- \`**Label:**\` opening a line or list item: a subtopic label.
- \`**term**\` mid-sentence: a key term.
- \`==…==\` around the one most important fact of the reply, at most two per reply: \`==the cache was never read==\`.
- \`{+…+}\` around a good outcome (tests pass, fixed, improved): \`{+all 342 tests pass+}\`.
- \`{-…-}\` around a bad outcome (a failure, a regression, a bug found): \`{-the build fails-}\`.
- \`{!…!}\` around what needs the person's attention or decision (pending, a GO, a risk): \`{!waiting for your GO!}\`.
A mark wraps the few words it colors, never a tag in front of a sentence; never nest them, never put them inside code spans or blocks.`,
  },
  {
    flag: 'callouts',
    text: {
      en: '- A quote opening with `[!DECISION]` (a decision only the person can make), `[!RISK]` (a risk or a regression), `[!DONE]` (a delivered result), `[!SUMMARY]` (the summary of a long reply, placed first), `[!NOTE]` or `[!TIP]` becomes a colored box; the rest of that first line is its title. At most two per reply.',
      pt: '- A quote opening with `[!DECISÃO]` (a decision only the person can make), `[!RISCO]` (a risk or a regression), `[!FEITO]` (a delivered result), `[!RESUMO]` (the summary of a long reply, placed first), `[!NOTA]` or `[!DICA]` becomes a colored box; the rest of that first line is its title. At most two per reply.',
    },
  },
  { flag: 'tabelas', text: '- Prefer a markdown table to compare three or more items across the same attributes.' },
  {
    flag: 'selo',
    text: '- The terminal seals each turn you end by saying the work is done, fixed or passing: ✔ when tests ran after your last edit and passed, ⚠ when none ran since it, ✖ when they failed. Run the tests before you claim it.',
  },
  {
    flag: 'deltas',
    text: {
      en: '- Write a change as `from X to Y`, or `X ms → Y ms` with a unit, both numbers in the same unit; the terminal adds the difference. An arrow between bare numbers stays a mapping (input → output) and gets none.',
      pt: '- Write a change as `de X para Y`, or `X ms → Y ms` with a unit, both numbers in the same unit; the terminal adds the difference. An arrow between bare numbers stays a mapping (input → output) and gets none.',
    },
  },
  {
    flag: 'diagramas',
    needsMermaid: true,
    text: '- When a flow, an architecture or a sequence is clearer as a picture, draw a ```mermaid block (flowchart or sequenceDiagram, up to ~15 nodes); the terminal shows it as an image.',
  },
]

/** The system prompt section that teaches the reading aids switched on, or null with none of them on. */
export function buildSection(flags: Flags, hasMermaid: boolean): PromptComposeSection | null {
  const aids = AIDS.filter(a => flags[a.flag] && (a.needsMermaid !== true || hasMermaid))
  if (aids.length === 0) return null
  return {
    id: SECTION_ID,
    scope: 'session',
    text: [
      '# Reading aids (realce)',
      'The person reads your replies in a terminal that draws these marks. Use them only in prose addressed to the person, never in files, code, commit messages, PR text or tool inputs.',
      ...aids.map(a => (typeof a.text === 'string' ? a.text : pick(a.text))),
      'Leave most lines unmarked: marks guide the eye only while they are rare.',
    ].join('\n'),
  }
}

/**
 * Asks the engine to re-read its cached prompt sections, so a flag change can reach the next request. A session
 * the mod was hot-loaded into keeps the main loop's prompt as rendered at its start (seen 19-10): there the aids
 * reach the model from the next session on.
 */
export function refreshPromptSection($: EngineInterface): void {
  redraw($, 'prompt.section')
}

export function registerPrompt(on: On): void {
  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    // Marks only pay off where this mod draws them: the terminal.
    const isTaught = e.surfaces.includes('terminal') && !e.traits.includes('bare')
    // The session's first compose runs before session.start has recorded the env, and that prompt is the one the
    // session keeps: ask for mmdc directly, or no session is ever taught diagrams. A refused `which` is logged by
    // session.start (the same promise) and takes only the diagrams with it, not the marks.
    const hasMermaid = isTaught && (await findMermaid($).then(m => m !== null, () => false))
    // The same goes for the language: the tags and phrases taught are the person's. A setting that cannot be read
    // is said, and the section goes out in the language in force.
    if (isTaught) await ensureLanguage($).catch(error => logLine($, `realce: language not read (${error instanceof Error ? error.message : String(error)})`))
    const section = isTaught ? buildSection(await getFlags($), hasMermaid) : null
    lastCompose = { at: new Date(await $.clock.now()).toISOString(), surfaces: e.surfaces, traits: e.traits, isAdded: section !== null }
    return section === null ? composed : { sections: [...composed.sections, section] }
  })
}

const THEME_NAMES: Record<ThemeKind, Text> = {
  dark: { en: 'dark', pt: 'escuro' },
  light: { en: 'light', pt: 'claro' },
  'dark-cb': { en: 'dark for color blindness', pt: 'escuro para daltônicos' },
  'light-cb': { en: 'light for color blindness', pt: 'claro para daltônicos' },
  'dark-ansi': { en: 'dark ANSI', pt: 'ANSI escuro' },
  'light-ansi': { en: 'light ANSI', pt: 'ANSI claro' },
}

export async function status($: EngineInterface, isFullscreen?: boolean): Promise<string> {
  const last = lastCompose
  const stored = await getStoredFlags($)
  const off = FLAGS.filter(f => !stored[f.id]).map(f => pick(f.label))
  const env = await read($, ENV)
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
    ...(sent.sent === 0 ? [] : [tr(`Errors the Haiku explained this session: ${sent.sent} of ${sent.max}.`, `Erros explicados pelo Haiku nesta sessão: ${sent.sent} de ${sent.max}.`)]),
    ...(isFullscreen === undefined
      ? []
      : [
          isFullscreen
            ? tr('Fullscreen: yes.', 'Tela cheia: sim.')
            : tr(
                'Fullscreen: no. Scrolling from the timeline and the pinned replies, and selecting for /realce explain, need "tui": "fullscreen" in settings.json.',
                'Tela cheia: não. Rolar pela linha do tempo e pelas fixadas, e selecionar para o /realce explica, pedem "tui": "fullscreen" no settings.json.',
              ),
        ]),
    ...(failure === null ? [] : [tr(`Last notice not sent: ${failure}.`, `Último aviso não enviado: ${failure}.`)]),
    ...(lastNotifyWasBanner() ? [tr("Last notice: handed to macOS (the terminal gives Claude Code no channel).", 'Último aviso: entregue ao macOS (o terminal não dá canal ao Claude Code).')] : []),
    ...(updateStatus() === null ? [] : [updateStatus()!]),
    ...perfLines(),
  ].join('\n')
}
