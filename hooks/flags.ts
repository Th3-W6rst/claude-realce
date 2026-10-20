import type { EngineInterface } from 'claude-code'

import { languageVersion, setLanguage, tr, type Lang, type Text } from './i18n'
import { redraw, storeDelete, storeGet, storeSet } from './io'

export type FlagId =
  | 'enfase' | 'coluna' | 'callouts' | 'tabelas' | 'deltas' | 'respiro'
  | 'highlight' | 'copiar' | 'dobrar' | 'caminhos' | 'diagramas'
  | 'ferramentas' | 'placar' | 'separador' | 'agentes'
  | 'pendencias' | 'plano' | 'painel' | 'spinner'
  | 'numeros' | 'selo' | 'diff' | 'erros' | 'commits' | 'foco'
  | 'avisos' | 'som' | 'limite' | 'ausencia' | 'linha' | 'perguntas' | 'fixar' | 'explica'
  | 'tema' | 'print' | 'demo' | 'atualizacao' | 'resumo'

export type FlagGroup = 'text' | 'code' | 'tools' | 'guide' | 'system'

// `id` is the key the store keeps (the first words were Portuguese and stay, so nobody's choices are lost); `alias` is
// its English name. Commands take either.
export type FlagSpec = { id: FlagId; alias: string; group: FlagGroup; label: Text; description: Text; isDefaultOn: boolean }

export type Flags = Readonly<Record<FlagId, boolean>>

export const FLAGS: readonly FlagSpec[] = [
  { id: 'enfase', alias: 'emphasis', group: 'text', label: { en: 'Colored emphasis', pt: 'Ênfase colorida' }, description: { en: 'Claude\'s marks and automatic colors for numbers, paths and status', pt: 'Marcas do Claude e cores automáticas para números, caminhos e status' }, isDefaultOn: true },
  { id: 'coluna', alias: 'column', group: 'text', label: { en: 'Reading column', pt: 'Coluna de leitura' }, description: { en: 'Prose kept to 100 columns', pt: 'Prosa limitada a 100 colunas' }, isDefaultOn: true },
  { id: 'callouts', alias: 'callouts', group: 'text', label: { en: 'Callouts', pt: 'Callouts' }, description: { en: 'Boxes for decision, risk, done, summary, note and tip', pt: 'Caixas para decisão, risco, feito, resumo, nota e dica' }, isDefaultOn: true },
  { id: 'tabelas', alias: 'tables', group: 'text', label: { en: 'Colored tables', pt: 'Tabelas coloridas' }, description: { en: 'Highlighted header, striped rows, numbers on the right', pt: 'Cabeçalho em destaque, linhas alternadas, números à direita' }, isDefaultOn: true },
  { id: 'deltas', alias: 'deltas', group: 'text', label: { en: 'Automatic deltas', pt: 'Deltas automáticos' }, description: { en: '"from 87 to 106" gets (+19)', pt: '"de 87 para 106" ganha (+19)' }, isDefaultOn: true },
  { id: 'respiro', alias: 'spacing', group: 'text', label: { en: 'Room between items', pt: 'Respiro entre itens' }, description: { en: 'A blank line between list items that wrap', pt: 'Linha em branco entre itens de lista que quebram linha' }, isDefaultOn: true },
  { id: 'numeros', alias: 'numbers', group: 'text', label: { en: 'Human numbers', pt: 'Números humanos' }, description: { en: '"102761 ms" gets "(1m 42s)" beside it', pt: '"102761 ms" ganha "(1m 42s)" ao lado' }, isDefaultOn: true },
  { id: 'highlight', alias: 'highlight', group: 'code', label: { en: 'Own highlighter', pt: 'Highlighter próprio' }, description: { en: 'Neon colors for ts, py, sh, json, yaml, swift, sql and diff', pt: 'Cores neon em ts, py, sh, json, yaml, swift, sql e diff' }, isDefaultOn: true },
  { id: 'copiar', alias: 'copy', group: 'code', label: { en: 'One-click copy', pt: 'Copiar com um clique' }, description: { en: 'A copy button on every code block and on long replies', pt: 'Botão copiar em cada bloco de código e nas respostas longas' }, isDefaultOn: true },
  { id: 'dobrar', alias: 'fold', group: 'code', label: { en: 'Fold what is long', pt: 'Dobrar o que é longo' }, description: { en: 'Blocks over 25 lines start folded', pt: 'Blocos com mais de 25 linhas aparecem dobrados' }, isDefaultOn: true },
  { id: 'caminhos', alias: 'paths', group: 'code', label: { en: 'Clickable paths', pt: 'Caminhos clicáveis' }, description: { en: 'Paths open in the editor, at the line', pt: 'Caminhos abrem no editor, na linha' }, isDefaultOn: true },
  { id: 'diagramas', alias: 'diagrams', group: 'code', label: { en: 'Diagrams', pt: 'Diagramas' }, description: { en: 'Mermaid blocks become pictures', pt: 'Blocos mermaid viram imagem' }, isDefaultOn: true },
  { id: 'ferramentas', alias: 'tools', group: 'tools', label: { en: 'Tools by kind', pt: 'Ferramentas por categoria' }, description: { en: 'An icon and a color per kind; reads dimmed', pt: 'Ícone e cor por tipo; leituras esmaecidas' }, isDefaultOn: true },
  { id: 'placar', alias: 'score', group: 'tools', label: { en: 'Test score', pt: 'Placar de testes' }, description: { en: 'The test summary above the Bash output', pt: 'Resumo dos testes acima da saída do Bash' }, isDefaultOn: true },
  { id: 'separador', alias: 'rule', group: 'tools', label: { en: 'Turn rule', pt: 'Separador de turno' }, description: { en: 'A rule with the turn\'s time, duration and numbers', pt: 'Régua com hora, duração e números do turno' }, isDefaultOn: true },
  { id: 'agentes', alias: 'agents', group: 'tools', label: { en: 'Agent cards', pt: 'Cartões de agente' }, description: { en: 'A background agent ends in a compact card', pt: 'Agente em segundo plano termina num cartão compacto' }, isDefaultOn: true },
  { id: 'selo', alias: 'seal', group: 'tools', label: { en: 'Proof seal', pt: 'Selo de prova' }, description: { en: 'The turn\'s rule says whether what Claude claimed was tested', pt: 'A régua do turno diz se o que o Claude afirmou foi testado' }, isDefaultOn: true },
  { id: 'diff', alias: 'diff', group: 'tools', label: { en: 'Readable diff', pt: 'Diff legível' }, description: { en: 'Edits with word highlights and line numbers', pt: 'Edições com destaque por palavra e números de linha' }, isDefaultOn: true },
  { id: 'erros', alias: 'errors', group: 'tools', label: { en: 'Explained errors', pt: 'Erro explicado' }, description: { en: 'A failed command gets one sentence saying why (Haiku)', pt: 'Comando que falhou ganha uma frase dizendo por quê (Haiku)' }, isDefaultOn: false },
  { id: 'commits', alias: 'commits', group: 'tools', label: { en: 'Commit cards', pt: 'Cartão de commit' }, description: { en: 'Commit, push and PR become a one-line card', pt: 'Commit, push e PR viram um cartão de uma linha' }, isDefaultOn: true },
  { id: 'foco', alias: 'focus', group: 'tools', label: { en: 'Focus mode', pt: 'Modo foco' }, description: { en: 'Hides the tools that finished without error', pt: 'Esconde as ferramentas concluídas sem erro' }, isDefaultOn: false },
  { id: 'pendencias', alias: 'pending', group: 'guide', label: { en: 'Needs you', pt: 'Precisa de você' }, description: { en: 'A band above the prompt with what asks for your decision', pt: 'Faixa acima do prompt com o que pede sua decisão' }, isDefaultOn: false },
  { id: 'plano', alias: 'plan', group: 'guide', label: { en: 'Plan progress', pt: 'Progresso do plano' }, description: { en: 'A bar with the tasks while Claude works', pt: 'Barra com as tarefas enquanto o Claude trabalha' }, isDefaultOn: true },
  { id: 'painel', alias: 'pane', group: 'guide', label: { en: 'Pane at start', pt: 'Painel ao iniciar' }, description: { en: 'Opens the session\'s side pane by itself', pt: 'Abre o painel lateral da sessão sozinho' }, isDefaultOn: true },
  { id: 'spinner', alias: 'spinner', group: 'guide', label: { en: 'Spinner that says what runs', pt: 'Spinner que diz o que roda' }, description: { en: '"Thinking", "Writing" and what runs now ("Running the tests", "Editing x.ts")', pt: '"Pensando", "Escrevendo" e o que roda agora ("Rodando os testes", "Editando x.ts")' }, isDefaultOn: true },
  { id: 'avisos', alias: 'notify', group: 'guide', label: { en: 'Notify when done', pt: 'Aviso quando termina' }, description: { en: 'A macOS notification at the end of a long turn or on a question', pt: 'Notificação do macOS no fim de um turno longo ou numa pergunta' }, isDefaultOn: true },
  { id: 'som', alias: 'sound', group: 'guide', label: { en: 'Notification sound', pt: 'Som nos avisos' }, description: { en: 'A short sound with the notification', pt: 'Um som curto junto da notificação' }, isDefaultOn: false },
  { id: 'ausencia', alias: 'away', group: 'guide', label: { en: 'While you were away', pt: 'Enquanto você estava fora' }, description: { en: 'What happened, once you start typing again', pt: 'Resumo do que aconteceu quando você volta a digitar' }, isDefaultOn: true },
  { id: 'linha', alias: 'timeline', group: 'guide', label: { en: 'Timeline', pt: 'Linha do tempo' }, description: { en: 'The turns in the pane, a click scrolls to each', pt: 'Os turnos no painel, com clique para rolar até cada um' }, isDefaultOn: true },
  { id: 'perguntas', alias: 'questions', group: 'guide', label: { en: 'Question header', pt: 'Cabeçalho de pergunta' }, description: { en: 'A colored line above Claude\'s questions', pt: 'Uma linha colorida acima das perguntas do Claude' }, isDefaultOn: true },
  { id: 'fixar', alias: 'pin', group: 'guide', label: { en: 'Pin replies', pt: 'Fixar respostas' }, description: { en: '/realce pin keeps a reply in the pane', pt: '/realce fixar guarda uma resposta no painel' }, isDefaultOn: true },
  { id: 'explica', alias: 'explain', group: 'guide', label: { en: 'Explain this', pt: 'Explica isso' }, description: { en: '/realce explain explains the selected text (Haiku)', pt: '/realce explica explica o trecho selecionado (Haiku)' }, isDefaultOn: true },
  { id: 'tema', alias: 'theme', group: 'system', label: { en: 'Follow the theme', pt: 'Segue o tema' }, description: { en: 'Colors for light backgrounds, color blindness and ANSI, from Claude Code\'s theme', pt: 'Cores para fundo claro, daltônicos e ANSI, pelo tema do Claude Code' }, isDefaultOn: true },
  { id: 'print', alias: 'print', group: 'system', label: { en: 'Pretty print', pt: 'Print bonito' }, description: { en: '/realce print saves the last reply as a picture', pt: '/realce print salva a última resposta como imagem' }, isDefaultOn: true },
  { id: 'demo', alias: 'demo', group: 'system', label: { en: 'Demo', pt: 'Demonstração' }, description: { en: '/realce demo shows everything the mod does', pt: '/realce demo mostra tudo o que o mod faz' }, isDefaultOn: true },
  { id: 'atualizacao', alias: 'updates', group: 'system', label: { en: 'Update notice', pt: 'Aviso de atualização' }, description: { en: 'Says when a new version is out on GitHub', pt: 'Avisa quando sair versão nova no GitHub' }, isDefaultOn: true },
  { id: 'resumo', alias: 'summary', group: 'system', label: { en: 'Session summary', pt: 'Resumo da sessão' }, description: { en: '/realce summary copies a summary of the session in markdown', pt: '/realce resumo copia um resumo da sessão em markdown' }, isDefaultOn: true },
  // Added after the 36 keys were given out: last in the table, so no earlier flag's key moves.
  { id: 'limite', alias: 'limits', group: 'guide', label: { en: 'Usage and limits', pt: 'Uso e limites' }, description: { en: 'Usage in the pane; a band when a limit or the context nears its end', pt: 'Uso no painel; faixa quando um limite ou o contexto se aproxima do fim' }, isDefaultOn: true },
]

export const FLAG_GROUPS: readonly FlagGroup[] = ['text', 'code', 'tools', 'guide', 'system']

export const GROUP_LABELS: Readonly<Record<FlagGroup, Text>> = {
  text: { en: 'Text', pt: 'Texto' },
  code: { en: 'Code', pt: 'Código' },
  tools: { en: 'Tools', pt: 'Ferramentas' },
  guide: { en: 'Guidance', pt: 'Orientação' },
  system: { en: 'System', pt: 'Sistema' },
}

export const isFlagId = (id: string): id is FlagId => FLAGS.some(f => f.id === id)

/** A flag by its id or its English name. */
export const flagOf = (word: string): FlagSpec | undefined => FLAGS.find(f => f.id === word || f.alias === word)

/** The name a command takes for the flag, in the language in force. */
export const flagName = (f: FlagSpec): string => tr(f.alias, f.id)

export const flagSpec = (id: FlagId): FlagSpec => FLAGS.find(f => f.id === id)!

/** What a feature's command answers while its flag is off. */
export function featureOff(id: FlagId): string {
  const f = flagSpec(id)
  return tr(`Feature off: ${f.label.en}. /realce ${f.alias} on turns it on.`, `Recurso desligado: ${f.label.pt}. /realce ${f.id} on liga.`)
}

// Read from the store once per load and kept here: only this module changes them, and each change redraws the
// screen itself. A store read in every drawing made each hooked row a reader of the store, redrawn on every write.
let snapshot: { stored: Flags; isMasterOn: boolean } | null = null
let version = 0

/** Changes whenever a flag or the language does: part of every memoized drawing's key. */
export const flagsVersion = () => version + languageVersion()

/** For a change that repaints without a flag changing (the theme). */
export function bumpVersion(): void {
  version += 1
}

const parseStored = (stored: unknown): Flags => {
  const set = typeof stored === 'object' && stored !== null ? (stored as Record<string, unknown>) : {}
  return Object.fromEntries(FLAGS.map(f => [f.id, typeof set[f.id] === 'boolean' ? set[f.id] : f.isDefaultOn])) as Record<FlagId, boolean>
}

async function load($: EngineInterface): Promise<{ stored: Flags; isMasterOn: boolean }> {
  if (snapshot === null) {
    const [stored, master, language] = await Promise.all([storeGet($, 'flags'), storeGet($, 'master'), storeGet($, 'language')])
    snapshot = { stored: parseStored(stored), isMasterOn: (master ?? true) === true }
    // The language the person picked with /realce language rides the same read; none means Claude Code's.
    setLanguage(language === 'en' || language === 'pt' ? language : null)
  }
  return snapshot
}

/** The flags as set, master switch aside: what the flags pane shows. */
export async function getStoredFlags($: EngineInterface): Promise<Flags> {
  return (await load($)).stored
}

/** The flags in force: with the master switch off, every one is off. */
export async function getFlags($: EngineInterface): Promise<Flags> {
  const { stored, isMasterOn } = await load($)
  if (isMasterOn) return stored
  return Object.fromEntries(FLAGS.map(f => [f.id, false])) as Record<FlagId, boolean>
}

export async function setFlag($: EngineInterface, id: FlagId, value: boolean): Promise<void> {
  const current = await load($)
  // From what the store holds now, not this session's copy: another session's change since this one loaded stays.
  const stored = { ...parseStored(await storeGet($, 'flags')), [id]: value }
  snapshot = { ...current, stored }
  version += 1
  await storeSet($, 'flags', stored)
  // A flag changes drawings all over the transcript, not only the ones that read it, and the aids the model is taught.
  redraw($, 'ui.render')
  redraw($, 'prompt.section')
}

export async function isMasterOn($: EngineInterface): Promise<boolean> {
  return (await load($)).isMasterOn
}

export async function setMaster($: EngineInterface, value: boolean): Promise<void> {
  snapshot = { ...(await load($)), isMasterOn: value }
  version += 1
  await storeSet($, 'master', value)
  redraw($, 'ui.render')
  redraw($, 'prompt.section')
}

/** `/realce language`: the person's pick kept in the store, or none to follow Claude Code's language again. */
export async function pickLanguage($: EngineInterface, next: Lang | null): Promise<void> {
  await load($)
  if (next === null) await storeDelete($, 'language')
  else await storeSet($, 'language', next)
  if (!setLanguage(next)) return
  redraw($, 'ui.render')
  redraw($, 'prompt.section')
}
