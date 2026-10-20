import type { On } from 'claude-code'

import { getFlags } from '../flags'
import { plural } from '../format'
import { SCREEN } from '../palette'
import { timed } from '../perf'
import { asRecord, str } from '../screen/toolInfo'
import { tr } from '../i18n'

const RECOMMENDED = /\s*\((?:Recomendad[oa]|Recommended)\)\s*$/i

/** '◆ Claude needs you · 2 questions · recommended: Public' (or in Portuguese): the line above the engine's dialog. */
export function questionHeader(questions: readonly unknown[]): string {
  const parts = [tr('◆ Claude needs you', '◆ O Claude precisa de você'), plural(questions.length, tr('question', 'pergunta'), tr('questions', 'perguntas'))]
  const labels = questions.flatMap(q => (Array.isArray(asRecord(q).options) ? (asRecord(q).options as unknown[]) : [])).map(o => str(asRecord(o).label) ?? '')
  const recommended = labels.find(l => RECOMMENDED.test(l))
  if (recommended !== undefined) parts.push(`${tr('recommended', 'recomendada')}: ${recommended.replace(RECOMMENDED, '')}`)
  return parts.join(' · ')
}

export function registerQuestion(on: On): void {
  // The dialog is the engine's: a tree holds its node once, nothing below it. The mod adds one line above.
  on('ui.render', { component: 'AskUserQuestion' }, async ($, e, next) => timed('AskUserQuestion', async () => {
    const node = await next(e)
    if (e.surface !== 'terminal' || !(await getFlags($)).perguntas) return node
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        <Text color={SCREEN.warn} wrap="truncate-end">
          {questionHeader(e.props.questions)}
        </Text>
        {node}
      </Box>
    )
  }))
}
