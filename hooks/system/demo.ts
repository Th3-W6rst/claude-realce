import type { Args, EngineInterface } from 'claude-code'

import { getFlags } from '../flags'
import { pick, tr, type Text } from '../i18n'
import { detach, logLine, storeGet, storeSet, submitPrompt, toast } from '../io'
import { errorText } from '../safe'

/** The showcase reply in each language: every aid the mod draws, in one answer the model never writes. */
export const DEMO_TEXTS: Text = {
  en: [
    "> [!DONE] This is realce's demo",
    '> Every feature has its own flag: `/realce` opens the pane, `/realce status` says what is on.',
    '',
    '**Marks:** a **key term** in magenta, ==the main fact highlighted==, {+test passed+} in green, {-regression-} in red, and what asks for you in yellow, like {!approve the deploy (example)!}, which also goes up to the band above the prompt.',
    '',
    '**How realce treats a reply:**',
    '',
    '```mermaid',
    'flowchart LR',
    '  R["Claude\'s reply"] --> P{"realce"}',
    '  P --> T["Text: marks, callouts, tables"]',
    '  P --> C["Code: highlight, copy, fold"]',
    '  P --> F["Tools: seal, diff, commits"]',
    '  P --> O["Guidance: notices, timeline"]',
    '  T --> V(["A screen read at a glance"])',
    '  C --> V',
    '  F --> V',
    '  O --> V',
    '```',
    '',
    '| Measure | Before | After |',
    '|---|---|---|',
    '| Scroll, per key | 22 ms | 9 ms |',
    '| Drawing hooks | 3.3 s | 1.0 s |',
    '',
    'In prose: scrolling went from 22 ms to 9 ms, and a 102761 ms build gets its reading beside it.',
    '',
    '**Code** with highlighting and a copy button; the path `hooks/flags.ts:16` opens in the editor:',
    '',
    '```ts',
    'export async function setFlag($: EngineInterface, id: FlagId, value: boolean): Promise<void> {',
    '  const stored = { ...(await load($)).stored, [id]: value }',
    "  await $.store.set('flags', stored)",
    "  $.ui.invalidate('ui.render')",
    '}',
    '```',
    '',
    '> [!TIP] To see the rest',
    '> `/realce pane` shows the session; `/realce focus` hides the tools; `/realce print` saves this reply as a picture.',
  ].join('\n'),
  pt: [
    '> [!FEITO] Esta é a demonstração do realce',
    '> Cada recurso tem a sua flag: `/realce` abre o painel, `/realce status` diz o que está ligado.',
    '',
    '**Marcas:** um **termo-chave** em magenta, ==o fato principal em marca-texto==, {+teste passou+} em verde, {-regressão-} em vermelho e o que pede você em amarelo, como {!aprovar o deploy (exemplo)!}, que também sobe para a faixa acima do prompt.',
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
].join('\n'),
}

const DEMO_PROMPT: Text = { en: 'realce demo', pt: 'Demonstração do realce' }

// Armed by the command, spent by the next step of the main loop: that step is answered here, with no request.
let isArmed = false

async function submitDemo($: EngineInterface): Promise<void> {
  try {
    const result = await submitPrompt($, { text: pick(DEMO_PROMPT) })
    if ('drop' in result && result.drop !== undefined) throw new Error(result.drop)
  } catch (error) {
    // Armed with no prompt on its way, the demo would answer the person's next real prompt.
    isArmed = false
    logLine($, `realce: demo not sent (${errorText(error)})`)
  }
}

/** `/realce demo`: a turn whose answer is the showcase, at no model cost. */
export async function demoCommand($: EngineInterface): Promise<void> {
  isArmed = true
  // A command's dispatch holds the turn a submit would wait on: the prompt goes once the command has answered.
  detach($, () => void submitDemo($))
}

/** Once per machine, in the first interactive session after the install: where to start. */
export async function welcomeHint($: EngineInterface, e: Args<'session.start'>): Promise<void> {
  if (!e.isInteractive || !(await getFlags($)).demo) return
  if ((await storeGet($, 'demoHintShown')) === true) return
  await storeSet($, 'demoHintShown', true)
  toast($, tr('realce installed: /realce demo shows what it does; /realce help lists the commands.', 'realce instalado: /realce demo mostra o que ele faz; /realce ajuda lista os comandos.'))
}

/** The showcase, once, when the command armed it: the turn's first step (hooks/events.ts) answers with it. */
export function takeDemo(): string | null {
  if (!isArmed) return null
  isArmed = false
  return pick(DEMO_TEXTS)
}
