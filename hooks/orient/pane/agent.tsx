import { atom, update } from 'claude-code'
import type { EngineInterface, RenderElement } from 'claude-code'

import type { AskMode, ChatEntry } from '../../../types'
import { cellWidth, fitEnd, segmentRow, type Segment } from '../../fit'
import { formatClock, formatDecimal, formatTokens } from '../../format'
import { tr } from '../../i18n'
import { copyText, fill, submit, toast } from '../../io'
import { SCREEN } from '../../palette'
import { shortPath } from '../../screen/toolInfo'
import { ask, clearChat } from '../ask'
import type { PaneData, UI } from './parts'

const ASK_MODE = atom({ plugin: 'realce', key: 'askMode' } as const, 'session')

const SHOWN = 5
const REVIEW_FILES = 12

// What the person typed and has not sent: the field keeps it across redraws, and a send empties it.
let draft = ''

type Quick = { key: string; label: string; question: string; mode: AskMode }

/** The ready-made questions, the ones the session has material for. */
export function quickQuestions(d: PaneData): Quick[] {
  const quick: Quick[] = [
    { key: 'quick-summary', label: tr('Sum up', 'Resumir'), question: tr('Sum up what has been done in this session so far, in at most 5 short points.', 'Resuma o que foi feito nesta sessão até agora, em até 5 tópicos curtos.'), mode: 'session' },
    { key: 'quick-next', label: tr('Next step', 'Próximo passo'), question: tr('What is the most useful next step now, and why? Be brief.', 'Qual é o próximo passo mais útil agora, e por quê? Seja breve.'), mode: 'session' },
  ]
  const failure = d.failures.at(-1)
  if (failure !== undefined) {
    // Described, not ordered: an imperative ("Fix…") pushes the fork to take up the task.
    const command = failure.command.split('\n')[0] ?? ''
    quick.push({ key: 'quick-failure', label: tr('Last failure', 'Última falha'), question: tr(`Explain this failure and how to solve it: the command \`${command}\` failed with ${failure.line}`, `Explique esta falha e como resolver: o comando \`${command}\` falhou com ${failure.line}`), mode: 'session' })
  }
  if (d.files.length > 0) {
    const paths = d.files.slice(-REVIEW_FILES).map(f => shortPath(f.path, d.env?.cwd ?? null)).join(', ')
    quick.push({ key: 'quick-review', label: tr('Review files', 'Revisar arquivos'), question: tr(`Review the files changed in this session (${paths}) and point out concrete problems, in at most 6 points.`, `Revise os arquivos mexidos nesta sessão (${paths}) e aponte problemas concretos, em até 6 tópicos.`), mode: 'tools' })
  }
  return quick
}

export async function setAskMode($: EngineInterface, mode: AskMode): Promise<void> {
  await update($, ASK_MODE, current => (current === mode ? current : mode))
}

async function sendDraft($: EngineInterface, text: string, mode: AskMode): Promise<void> {
  if (text.trim() === '') return
  draft = ''
  await ask($, text, mode)
}

async function toChat($: EngineInterface, text: string): Promise<void> {
  const filled = await fill($, { text, mode: 'append' })
  if (!filled.isFilled) toast($, tr('The prompt box is not there to take it.', 'A caixa do prompt não está lá para receber.'))
}

async function copyAnswer($: EngineInterface, text: string): Promise<void> {
  const copied = await copyText($, { text })
  toast($, copied.isCopied ? tr('Answer copied.', 'Resposta copiada.') : tr(`Could not copy: ${copied.reason}.`, `Não deu para copiar: ${copied.reason}.`))
}

const MODE_LABEL: Record<ChatEntry['mode'], () => string> = {
  session: () => tr('Session', 'Sessão'),
  tools: () => tr('Tools', 'Ferramentas'),
  explain: () => tr('Explain', 'Explica'),
}

/** '17:20 · 2,1 s · 64 tokens · Session': what is known of how the answer came. */
export function entryFooter(c: ChatEntry, tzOffsetMinutes: number | undefined): string {
  const parts: string[] = []
  if (tzOffsetMinutes !== undefined) parts.push(formatClock(c.at, tzOffsetMinutes))
  if (c.ms !== undefined) parts.push(`${formatDecimal(c.ms / 1000, 1)} s`)
  if (c.tokens !== undefined) parts.push(formatTokens(c.tokens))
  parts.push(MODE_LABEL[c.mode]())
  return parts.join(' · ')
}

function statusLine(c: ChatEntry): Segment | null {
  if (c.status === 'queued') return { text: tr('Queued: answers when the turn ends.', 'Na fila: responde quando o turno terminar.'), color: SCREEN.warn }
  if (c.status === 'pending') return { text: c.mode === 'tools' ? tr('The agent is looking…', 'O agente está olhando…') : c.mode === 'explain' ? tr('Explaining…', 'Explicando…') : tr('Thinking…', 'Pensando…'), color: SCREEN.dim }
  if (c.status === 'failed') return { text: tr(`No answer: ${c.text}`, `Sem resposta: ${c.text}`), color: SCREEN.bad }
  return null
}

function entryView($: EngineInterface, t: UI, c: ChatEntry, d: PaneData, cols: number): RenderElement {
  const { Box, Text, Button, Markdown } = t
  const status = statusLine(c)
  const actions = [tr('To chat', 'Ao chat'), tr('Send', 'Enviar'), tr('Copy', 'Copiar')]
  // The footer takes what the three buttons and their two ' · ' leave, and one cell between.
  const footerCells = Math.max(1, cols - actions.reduce((sum, a) => sum + cellWidth(a), 0) - 2 * 3 - 1)
  return (
    <Box key={`entry-${c.id}`} flexDirection="column" marginBottom={1}>
      {segmentRow(t, [{ text: '› ', color: SCREEN.plan }, { text: c.question.replace(/\s+/g, ' '), color: SCREEN.dim }], cols)}
      {status !== null ? segmentRow(t, [status], cols) : <Markdown key={`answer-${c.id}`} text={c.text} />}
      {c.status === 'ready' && (
        <Box flexDirection="row" width={cols}>
          <Box flexGrow={1}>
            <Text dimColor wrap="truncate-end">
              {fitEnd(entryFooter(c, d.env?.tzOffsetMinutes), footerCells)}
            </Text>
          </Box>
          <Button plain key={`chat-${c.id}`} dimColor onPress={() => void toChat($, c.text)}>
            {actions[0]}
          </Button>
          <Text dimColor> · </Text>
          <Button plain key={`send-${c.id}`} dimColor onPress={() => void submit($, { text: c.text })}>
            {actions[1]}
          </Button>
          <Text dimColor> · </Text>
          <Button plain key={`copy-${c.id}`} dimColor onPress={() => void copyAnswer($, c.text)}>
            {actions[2]}
          </Button>
        </Box>
      )}
    </Box>
  )
}

/** The pane's agent: the last answers, the ready-made questions, the mode and the field to ask in. */
export function agentTab($: EngineInterface, t: UI, d: PaneData, cols: number): RenderElement {
  const { Box, Text, Button, Input } = t
  const shown = d.chat.slice(-SHOWN)
  const older = d.chat.length - shown.length
  const mode = d.mode
  const radio = (m: AskMode) => `${mode === m ? '●' : '○'} ${MODE_LABEL[m]()}`
  return (
    <Box flexDirection="column" width={cols}>
      {d.chat.length === 0 && d.flags.agente && (
        <Box marginBottom={1}>
          <Text dimColor>{tr('Ask about the session: what changed, why something failed, what comes next.', 'Pergunte sobre a sessão: o que mudou, por que algo falhou, o que vem depois.')}</Text>
        </Box>
      )}
      {older > 0 && <Text dimColor>{tr(`+${older} earlier`, `+${older} anteriores`)}</Text>}
      {shown.map(c => entryView($, t, c, d, cols))}
      {d.flags.agente ? (
        <Box flexDirection="column">
          <Box flexDirection="row" width={cols}>
            <Button plain key="mode-session" {...(mode === 'session' ? {} : { dimColor: true })} onPress={() => void setAskMode($, 'session')}>
              {radio('session')}
            </Button>
            <Text> </Text>
            <Button plain key="mode-tools" {...(mode === 'tools' ? {} : { dimColor: true })} onPress={() => void setAskMode($, 'tools')}>
              {radio('tools')}
            </Button>
            <Box flexGrow={1} />
            {/* Always drawn: a Button that vanishes under its own press takes the pane's focus with it, and the next
                keys land in the prompt box. */}
            <Button plain key="clear-chat" dimColor onPress={() => void clearChat($)}>
              {tr('Clear', 'Limpar')}
            </Button>
          </Box>
          <Box flexDirection="row" flexWrap="wrap" width={cols}>
            {quickQuestions(d).map(q => (
              <Box marginRight={2}>
                <Button plain key={q.key} dimColor onPress={() => void ask($, q.question, q.mode)}>
                  {`⚡ ${q.label}`}
                </Button>
              </Box>
            ))}
          </Box>
          {Input === undefined ? (
            <Text dimColor>{tr('Ask with /realce ask <question>.', 'Pergunte com /realce pergunta <pergunta>.')}</Text>
          ) : (
          <Input
            key="ask"
            value={draft}
            rows={2}
            autoFocus
            placeholder={mode === 'session' ? tr('Ask about the session…', 'Pergunte sobre a sessão…') : tr('Ask an agent that can read the project…', 'Pergunte a um agente que lê o projeto…')}
            submitLabel={tr('send', 'enviar')}
            onInput={value => {
              draft = value
            }}
            onSubmit={value => void sendDraft($, value, mode)}
          />
          )}
          {/* Digits type into the field while it holds the focus: the tabs' keys need it moved off. */}
          <Text dimColor>{d.isFocused ? tr('Tab leaves the field; then 1–4 switch tabs.', 'Tab sai do campo; aí 1–4 trocam de aba.') : tr('Click the pane to type.', 'Clique no painel para digitar.')}</Text>
        </Box>
      ) : (
        <Box flexDirection="row" width={cols}>
          <Box flexGrow={1}>
            <Text dimColor>{tr('Agent off: /realce agent on turns it on.', 'Agente desligado: /realce agente on liga.')}</Text>
          </Box>
          {/* The tab shows while a history is left (explain writes it too): Clear lets it go. */}
          <Button plain key="clear-chat" dimColor onPress={() => void clearChat($)}>
            {tr('Clear', 'Limpar')}
          </Button>
        </Box>
      )}
    </Box>
  )
}
