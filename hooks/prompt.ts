import type { EngineInterface, On, PromptComposeSection } from 'claude-code'

import { findMermaid } from './env'
import { getFlags, type Flags } from './flags'
import { ensureLanguage, pick, type Text } from './i18n'
import { logLine, redraw } from './io'
import { errorText } from './safe'

export const SECTION_ID = 'realce:reading-aids'

// What the last system prompt render decided, for `/realce status`. Kept in the module, not the store: a store
// write on every request would redraw every drawing that reads the store.
type LastCompose = { at: string; surfaces: readonly string[]; traits: readonly string[]; isAdded: boolean }
let lastCompose: LastCompose | undefined

export const lastComposed = (): LastCompose | undefined => lastCompose

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
    // A teammate writes to its lead, not to the person reading the screen: no marks for it.
    const isTaught = e.surfaces.includes('terminal') && !e.traits.includes('bare') && !e.traits.includes('teammate')
    // The session's first compose runs before session.start has recorded the env, and that prompt is the one the
    // session keeps: ask for mmdc directly, or no session is ever taught diagrams. A refused `which` is logged by
    // session.start (the same promise) and takes only the diagrams with it, not the marks.
    const hasMermaid = isTaught && (await findMermaid($).then(m => m !== null, () => false))
    // The same goes for the language: the tags and phrases taught are the person's. A setting that cannot be read
    // is said, and the section goes out in the language in force.
    if (isTaught) await ensureLanguage($).catch(error => logLine($, `realce: language not read (${errorText(error)})`))
    const section = isTaught ? buildSection(await getFlags($), hasMermaid) : null
    // A /context measure sends nothing: it is not the last request /realce status speaks of.
    if (!e.traits.includes('analysis')) lastCompose = { at: new Date(await $.clock.now()).toISOString(), surfaces: e.surfaces, traits: e.traits, isAdded: section !== null }
    return section === null ? composed : { sections: [...composed.sections, section] }
  })
}
