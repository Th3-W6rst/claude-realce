import type { EngineInterface } from 'claude-code'

export type FlagId =
  | 'enfase' | 'coluna' | 'callouts' | 'tabelas' | 'deltas' | 'respiro'
  | 'highlight' | 'copiar' | 'dobrar' | 'caminhos' | 'diagramas'
  | 'ferramentas' | 'placar' | 'separador' | 'agentes'
  | 'pendencias' | 'plano' | 'painel' | 'spinner'

export type FlagGroup = 'Texto' | 'Código' | 'Ferramentas' | 'Orientação'

export type FlagSpec = { id: FlagId; group: FlagGroup; label: string; description: string; isDefaultOn: boolean }

export type Flags = Readonly<Record<FlagId, boolean>>

export const FLAGS: readonly FlagSpec[] = [
  { id: 'enfase', group: 'Texto', label: 'Ênfase colorida', description: 'Marcas do Claude e cores automáticas para números, caminhos e status', isDefaultOn: true },
  { id: 'coluna', group: 'Texto', label: 'Coluna de leitura', description: 'Prosa limitada a 100 colunas', isDefaultOn: true },
  { id: 'callouts', group: 'Texto', label: 'Callouts', description: 'Caixas para decisão, risco, feito, resumo, nota e dica', isDefaultOn: true },
  { id: 'tabelas', group: 'Texto', label: 'Tabelas coloridas', description: 'Cabeçalho em destaque, linhas alternadas, números à direita', isDefaultOn: true },
  { id: 'deltas', group: 'Texto', label: 'Deltas automáticos', description: '"de 87 para 106" ganha (+19)', isDefaultOn: true },
  { id: 'respiro', group: 'Texto', label: 'Respiro entre itens', description: 'Linha em branco entre itens de lista que quebram linha', isDefaultOn: true },
  { id: 'highlight', group: 'Código', label: 'Highlighter próprio', description: 'Cores neon em ts, py, sh, json, yaml, swift, sql e diff', isDefaultOn: true },
  { id: 'copiar', group: 'Código', label: 'Copiar com um clique', description: 'Botão copiar em cada bloco de código', isDefaultOn: true },
  { id: 'dobrar', group: 'Código', label: 'Dobrar o que é longo', description: 'Blocos com mais de 25 linhas aparecem dobrados', isDefaultOn: true },
  { id: 'caminhos', group: 'Código', label: 'Caminhos clicáveis', description: 'Caminhos abrem no editor, na linha', isDefaultOn: true },
  { id: 'diagramas', group: 'Código', label: 'Diagramas', description: 'Blocos mermaid viram imagem', isDefaultOn: true },
  { id: 'ferramentas', group: 'Ferramentas', label: 'Ferramentas por categoria', description: 'Ícone e cor por tipo; leituras esmaecidas', isDefaultOn: true },
  { id: 'placar', group: 'Ferramentas', label: 'Placar de testes', description: 'Resumo dos testes acima da saída do Bash', isDefaultOn: true },
  { id: 'separador', group: 'Ferramentas', label: 'Separador de turno', description: 'Régua com hora, duração e números do turno', isDefaultOn: true },
  { id: 'agentes', group: 'Ferramentas', label: 'Cartões de agente', description: 'Agente em segundo plano termina num cartão compacto', isDefaultOn: true },
  { id: 'pendencias', group: 'Orientação', label: 'Precisa de você', description: 'Faixa acima do prompt com o que pede sua decisão', isDefaultOn: true },
  { id: 'plano', group: 'Orientação', label: 'Progresso do plano', description: 'Barra com as tarefas enquanto o Claude trabalha', isDefaultOn: true },
  { id: 'painel', group: 'Orientação', label: 'Painel ao iniciar', description: 'Abre o painel lateral da sessão sozinho', isDefaultOn: true },
  { id: 'spinner', group: 'Orientação', label: 'Spinner em português', description: '"Pensando", "Escrevendo", "Executando"', isDefaultOn: true },
]

export const FLAG_GROUPS: readonly FlagGroup[] = ['Texto', 'Código', 'Ferramentas', 'Orientação']

export const isFlagId = (id: string): id is FlagId => FLAGS.some(f => f.id === id)

export const flagSpec = (id: FlagId): FlagSpec => FLAGS.find(f => f.id === id)!

// Read from the store once per load and kept here: only this module changes them, and each change redraws the
// screen itself. A store read in every drawing made each hooked row a reader of the store, redrawn on every write.
let snapshot: { stored: Flags; isMasterOn: boolean } | null = null
let version = 0

/** Changes whenever a flag does: part of every memoized drawing's key. */
export const flagsVersion = () => version

const parseStored = (stored: unknown): Flags => {
  const set = typeof stored === 'object' && stored !== null ? (stored as Record<string, unknown>) : {}
  return Object.fromEntries(FLAGS.map(f => [f.id, typeof set[f.id] === 'boolean' ? set[f.id] : f.isDefaultOn])) as Record<FlagId, boolean>
}

async function load($: EngineInterface): Promise<{ stored: Flags; isMasterOn: boolean }> {
  if (snapshot === null) {
    const [stored, master] = await Promise.all([$.store.get('flags'), $.store.get('master')])
    snapshot = { stored: parseStored(stored), isMasterOn: (master ?? true) === true }
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
  const stored = { ...current.stored, [id]: value }
  snapshot = { ...current, stored }
  version += 1
  await $.store.set('flags', stored)
  // A flag changes drawings all over the transcript, not only the ones that read it, and the aids the model is taught.
  $.ui.invalidate('ui.render')
  $.ui.invalidate('prompt.section')
}

export async function isMasterOn($: EngineInterface): Promise<boolean> {
  return (await load($)).isMasterOn
}

export async function setMaster($: EngineInterface, value: boolean): Promise<void> {
  snapshot = { ...(await load($)), isMasterOn: value }
  version += 1
  await $.store.set('master', value)
  $.ui.invalidate('ui.render')
  $.ui.invalidate('prompt.section')
}
