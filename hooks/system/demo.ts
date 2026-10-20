import type { Args, EngineInterface, On } from 'claude-code'

import { getFlags } from '../flags'

/** The showcase reply: every aid the mod draws, in one answer the model never writes. */
export const DEMO_TEXT = [
  '> [!FEITO] Esta é a demonstração do realce',
  '> Cada recurso tem a sua flag: `/realce` abre o painel, `/realce status` diz o que está ligado.',
  '',
  '**Marcas:** um **termo-chave** em magenta, ==o fato principal em marca-texto==, {+teste passou+} em verde, {-regressão-} em vermelho e {!precisa da sua decisão!} em amarelo.',
  '',
  '**Como o realce trata uma resposta:**',
  '',
  '```mermaid',
  'flowchart LR',
  '  R["Resposta do Claude"] --> P{"realce"}',
  '  P --> T["Texto: marcas, callouts, tabelas"]',
  '  P --> C["Código: highlight, copiar, dobrar"]',
  '  P --> F["Ferramentas: selo, diff, commits"]',
  '  P --> O["Orientação: avisos, linha do tempo"]',
  '  T --> V(["Tela legível num relance"])',
  '  C --> V',
  '  F --> V',
  '  O --> V',
  '```',
  '',
  '| Medida | Antes | Depois |',
  '|---|---|---|',
  '| Rolar, por tecla | 22 ms | 9 ms |',
  '| Hooks de desenho | 3,3 s | 1,0 s |',
  '',
  'Em prosa: o rolar caiu de 22 ms para 9 ms, e um build de 102761 ms ganha a leitura ao lado.',
  '',
  '**Código** com highlight e botão de copiar; o caminho `hooks/flags.ts:16` abre no editor:',
  '',
  '```ts',
  'export async function setFlag($: EngineInterface, id: FlagId, value: boolean): Promise<void> {',
  '  const stored = { ...(await load($)).stored, [id]: value }',
  "  await $.store.set('flags', stored)",
  "  $.ui.invalidate('ui.render')",
  '}',
  '```',
  '',
  '> [!DICA] Para ver o resto',
  '> `/realce painel` mostra a sessão; `/realce foco` esconde as ferramentas; `/realce print` salva esta resposta como imagem.',
].join('\n')

export const DEMO_PROMPT = 'Demonstração do realce'

// Armed by the command, spent by the next step of the main loop: that step is answered here, with no request.
let isArmed = false

async function submitDemo($: EngineInterface): Promise<void> {
  try {
    const result = await $.prompt.submit({ text: DEMO_PROMPT })
    if ('drop' in result && result.drop !== undefined) throw new Error(result.drop)
  } catch (error) {
    // Armed with no prompt on its way, the demo would answer the person's next real prompt.
    isArmed = false
    $.ui.log(`realce: demo não enviada (${error instanceof Error ? error.message : String(error)})`)
  }
}

/** `/realce demo`: a turn whose answer is the showcase, at no model cost. */
export async function demoCommand($: EngineInterface): Promise<void> {
  isArmed = true
  // A command's dispatch holds the turn a submit would wait on: the prompt goes once the command has answered.
  $.clock.after(0, () => void submitDemo($))
}

/** Once per machine, in the first interactive session after the install: where to start. */
export async function welcomeHint($: EngineInterface, e: Args<'session.start'>): Promise<void> {
  if (!e.isInteractive || !(await getFlags($)).demo) return
  if ((await $.store.get('demoHintShown')) === true) return
  await $.store.set('demoHintShown', true)
  $.ui.toast('realce instalado: /realce demo mostra o que ele faz.')
}

export function registerDemo(on: On): void {
  on('turn.step', async function* ($, e, next) {
    // Only a turn's first step: a prompt that joined a running turn must not cut that turn's work short.
    if (!isArmed || e.agentId !== undefined || e.index !== 0) return yield* next(e)
    isArmed = false
    yield { kind: 'text' as const, index: 0, text: DEMO_TEXT }
    yield { kind: 'stop' as const, stopReason: 'end_turn' as const, usage: null }
    return { turnId: e.turnId, index: e.index, answer: DEMO_TEXT, toolUses: [], stopReason: 'end_turn' as const, usage: null }
  })
}
