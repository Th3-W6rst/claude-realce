import { atom, read } from 'claude-code'
import type { EngineInterface, On, PromptComposeSection } from 'claude-code'

import { FLAGS, getFlags, getStoredFlags, isMasterOn, type Flags } from './flags'
import { perfLines } from './perf'

const ENV = atom({ plugin: 'realce', key: 'env' } as const, null)

export const SECTION_ID = 'realce:reading-aids'

// What the last system prompt render decided, for `/realce status`. Kept in the module, not the store: a store
// write on every request would redraw every drawing that reads the store.
type LastCompose = { at: string; surfaces: readonly string[]; traits: readonly string[]; isAdded: boolean }
let lastCompose: LastCompose | undefined

const AIDS: readonly { flag: keyof Flags; needsMermaid?: true; text: string }[] = [
  {
    flag: 'enfase',
    text: `- \`**Label:**\` opening a line or list item: a subtopic label.
- \`**term**\` mid-sentence: a key term.
- \`==fact==\`: the one most important fact of the reply; at most two per reply.
- \`{+good+}\`: a good outcome (tests pass, fixed, improved).
- \`{-bad-}\`: a bad outcome (a failure, a regression, a bug found).
- \`{!attention!}\`: what needs the person's attention or decision (pending, a GO, a risk).
Marks span a few words; never nest them, never put them inside code spans or blocks.`,
  },
  {
    flag: 'callouts',
    text: "- A quote opening with `[!DECISÃO]` (a decision only the person can make), `[!RISCO]` (a risk or a regression), `[!FEITO]` (a delivered result), `[!RESUMO]` (the summary of a long reply, placed first), `[!NOTA]` or `[!DICA]` becomes a colored box; the rest of that first line is its title. At most two per reply.",
  },
  { flag: 'tabelas', text: '- Prefer a markdown table to compare three or more items across the same attributes.' },
  { flag: 'deltas', text: '- Write a change as `de X para Y` or `X → Y`, both numbers in the same unit; the terminal adds the difference.' },
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
      ...aids.map(a => a.text),
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
  $.ui.invalidate('prompt.section')
}

export function registerPrompt(on: On): void {
  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    // Marks only pay off where this mod draws them: the terminal.
    const isTaught = e.surfaces.includes('terminal') && !e.traits.includes('bare')
    const section = isTaught ? buildSection(await getFlags($), ((await read($, ENV))?.mmdc ?? null) !== null) : null
    lastCompose = { at: new Date(await $.clock.now()).toISOString(), surfaces: e.surfaces, traits: e.traits, isAdded: section !== null }
    return section === null ? composed : { sections: [...composed.sections, section] }
  })
}

export async function status($: EngineInterface): Promise<string> {
  const last = lastCompose
  const stored = await getStoredFlags($)
  const off = FLAGS.filter(f => !stored[f.id]).map(f => f.label)
  const env = await read($, ENV)
  const { sections } = await $.prompt.compose()
  return [
    `Realce ${(await isMasterOn($)) ? 'ligado' : 'desligado'}.`,
    `Recursos desligados: ${off.length === 0 ? 'nenhum' : off.join(', ')}.`,
    `System prompt montado agora: ${sections.some(s => s.id === SECTION_ID) ? 'leva' : 'não leva'} a seção de leitura.`,
    last === undefined
      ? 'Nenhum request montou o system prompt desde que o mod carregou.'
      : `Último request (${last.at}): seção ${last.isAdded ? 'incluída' : 'omitida'}; superfícies [${last.surfaces.join(', ')}], traits [${last.traits.join(', ')}].`,
    env === null
      ? 'Ambiente da sessão: ainda não lido.'
      : `Editor dos links: ${env.editor}. Diagramas: ${env.mmdc === null ? 'mmdc não encontrado' : `mmdc em ${env.mmdc}`}.`,
    ...perfLines(),
  ].join('\n')
}
