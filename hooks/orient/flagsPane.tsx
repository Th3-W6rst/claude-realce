import type { EngineInterface, On } from 'claude-code'

import { FLAG_GROUPS, FLAGS, getStoredFlags, isMasterOn, setFlag, setMaster, type FlagId } from '../flags'
import { refreshTheme } from '../theme'
import { SCREEN } from '../palette'
import { timed } from '../perf'
import { fitEnd } from './fit'

export const FLAGS_PANE = 'realce-flags'

// One key per flag, in the table's order: a press of it toggles that flag while the pane holds the keys. The
// engine takes one lowercase letter or one digit: 36 keys; a flag past them is reached with Tab and Enter.
const HOTKEYS = 'abcdefghijklmnopqrstuvwxyz0123456789'

async function toggleFlag($: EngineInterface, id: FlagId, value: boolean): Promise<void> {
  await setFlag($, id, value)
  // The theme is read once per change of it: turning tema over repaints now.
  if (id === 'tema') await refreshTheme($)
}

export async function openFlagsPane($: EngineInterface): Promise<void> {
  await $.ui.open({ id: FLAGS_PANE, title: 'Realce', focus: true, closeOnEscape: true })
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
          {isOn ? '[x] Realce ligado' : '[ ] Realce ligado'}
        </Button>
        {!isOn && <Text color={SCREEN.warn}>Realce desligado: /realce on liga.</Text>}
        {FLAG_GROUPS.map(group => (
          <Box flexDirection="column" marginTop={1}>
            <Text color={SCREEN.plan}>{group}</Text>
            {FLAGS.filter(f => f.group === group).map(f => (
              <Button
                key={`flag-${f.id}`}
                plain
                {...(HOTKEYS[FLAGS.indexOf(f)] === undefined ? {} : { hotkey: HOTKEYS[FLAGS.indexOf(f)] })}
                {...(FLAGS.indexOf(f) === 0 ? { autoFocus: true as const } : {})}
                onPress={() => toggleFlag($, f.id, !flags[f.id])}
              >
                {fitEnd(`${flags[f.id] ? '[x] ' : '[ ] '}${f.label}`, cells)}
                {[...`${flags[f.id] ? '[x] ' : '[ ] '}${f.label}`].length + 3 < cells && (
                  <Text dimColor>{fitEnd(` · ${f.description}`, cells - [...`${flags[f.id] ? '[x] ' : '[ ] '}${f.label}`].length)}</Text>
                )}
              </Button>
            ))}
          </Box>
        ))}
        <Box marginTop={1}>
          <Text dimColor>Letra ou número alterna · Tab e Enter também · Esc fecha</Text>
        </Box>
      </Box>
    )
  }))
}
