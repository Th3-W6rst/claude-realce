import type { EngineInterface, On } from 'claude-code'

import { FLAG_GROUPS, FLAGS, getStoredFlags, GROUP_LABELS, isMasterOn, setFlag, setMaster, type FlagId } from '../flags'
import { pick, tr } from '../i18n'
import { refreshTheme } from '../theme'
import { SCREEN } from '../palette'
import { timed } from '../perf'
import { cellWidth, fitEnd } from '../fit'
import { openPane } from '../io'

const FLAGS_PANE = 'realce-flags'

// One key per flag, in the table's order: a press of it toggles that flag while the pane holds the keys. The
// engine takes one lowercase letter or one digit: 36 keys; a flag past them is reached with Tab and Enter.
const HOTKEYS = 'abcdefghijklmnopqrstuvwxyz0123456789'

/** A flag set from the pane or a command: the theme is read once per change of it, so turning tema over repaints now. */
export async function applyFlag($: EngineInterface, id: FlagId, value: boolean): Promise<void> {
  await setFlag($, id, value)
  if (id === 'tema') await refreshTheme($)
}

export async function openFlagsPane($: EngineInterface): Promise<void> {
  await openPane($, { id: FLAGS_PANE, title: 'Realce', focus: true, closeOnEscape: true })
}

export function registerFlagsPane(on: On): void {
  on('ui.render', { component: 'Pane', requestId: FLAGS_PANE }, async ($, e) => timed('Pane:flags', async () => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const flags = await getStoredFlags($)
    const isOn = await isMasterOn($)
    // One row per flag: the key's "a: " takes three cells, the description is cut to what is left.
    const cells = Math.max(10, e.props.bodyColumns - 3)
    return (
      <Box flexDirection="column">
        <Button plain key="master" onPress={() => setMaster($, !isOn)}>
          {`${isOn ? '[x]' : '[ ]'} ${tr('Realce on', 'Realce ligado')}`}
        </Button>
        {!isOn && <Text color={SCREEN.warn}>{tr('Realce is off: /realce on turns it on.', 'Realce desligado: /realce on liga.')}</Text>}
        {FLAG_GROUPS.map(group => (
          <Box flexDirection="column" marginTop={1}>
            <Text color={SCREEN.plan}>{pick(GROUP_LABELS[group])}</Text>
            {FLAGS.filter(f => f.group === group).map(f => {
              const at = FLAGS.indexOf(f)
              const label = `${flags[f.id] ? '[x] ' : '[ ] '}${pick(f.label)}`
              return (
                <Button
                  key={`flag-${f.id}`}
                  plain
                  {...(HOTKEYS[at] === undefined ? {} : { hotkey: HOTKEYS[at] })}
                  {...(at === 0 ? { autoFocus: true as const } : {})}
                  onPress={() => applyFlag($, f.id, !flags[f.id])}
                >
                  {fitEnd(label, cells)}
                  {cellWidth(label) + 3 < cells && <Text dimColor>{fitEnd(` · ${pick(f.description)}`, cells - cellWidth(label))}</Text>}
                </Button>
              )
            })}
          </Box>
        ))}
        <Box marginTop={1}>
          <Text dimColor>{tr('A letter or digit toggles · Tab and Enter too · Esc closes', 'Letra ou número alterna · Tab e Enter também · Esc fecha')}</Text>
        </Box>
      </Box>
    )
  }))
}
