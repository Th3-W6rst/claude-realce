import type { EngineInterface, On } from 'claude-code'

import { FLAG_GROUPS, FLAGS, getStoredFlags, isMasterOn, setFlag, type FlagId } from '../flags'
import { refreshTheme } from '../theme'
import { timed } from '../perf'

export const FLAGS_PANE = 'realce-flags'

// One key per flag, in the table's order: a press of it toggles that flag while the pane holds the keys. The
// engine takes one lowercase letter or one digit: 36 keys, one for each flag.
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
    return (
      <Box flexDirection="column">
        {!isOn && <Text color="#E3BC46">Realce desligado: /realce on liga.</Text>}
        {FLAG_GROUPS.map(group => (
          <Box flexDirection="column" marginTop={1}>
            <Text color="#24D3E0">{group}</Text>
            {FLAGS.filter(f => f.group === group).map(f => (
              <Button
                key={`flag-${f.id}`}
                plain
                hotkey={HOTKEYS[FLAGS.indexOf(f)]}
                {...(FLAGS.indexOf(f) === 0 ? { autoFocus: true as const } : {})}
                onPress={() => toggleFlag($, f.id, !flags[f.id])}
              >
                {flags[f.id] ? '[x] ' : '[ ] '}
                {f.label}
                <Text dimColor> · {f.description}</Text>
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
