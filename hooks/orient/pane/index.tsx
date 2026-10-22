import { atom, read } from 'claude-code'
import type { EngineInterface, On, RenderElement } from 'claude-code'

import type { PaneTab, Pin, TimelineRow, UsageReading } from '../../../types'
import { cachedEnv } from '../../env'
import { fitEnd } from '../../fit'
import { getFlags, isMasterOn } from '../../flags'
import { tr } from '../../i18n'
import { SCREEN } from '../../palette'
import { timed } from '../../perf'
import type { SESSION_PANE } from '../paneToggle'
import { agentTab } from './agent'
import { filesTab } from './files'
import { overviewTab } from './overview'
import type { PaneData, UI } from './parts'
import { setTab } from './tab'
import { turnsTab } from './turns'

const TAB = atom({ plugin: 'realce', key: 'tab' } as const, 'overview')
const ASK_MODE = atom({ plugin: 'realce', key: 'askMode' } as const, 'session')
const CHAT = atom({ plugin: 'realce', key: 'chat' } as const, [])
const PENDING = atom({ plugin: 'realce', key: 'pending' } as const, null)
const PLAN = atom({ plugin: 'realce', key: 'plan' } as const, [])
const FILES = atom({ plugin: 'realce', key: 'files' } as const, [])
const FAILURES = atom({ plugin: 'realce', key: 'failures' } as const, [])
const AGENTS = atom({ plugin: 'realce', key: 'agents' } as const, [])
const TIMELINE = atom({ plugin: 'realce', key: 'timeline' } as const, [])
const PINS = atom({ plugin: 'realce', key: 'pins' } as const, [])
const USAGE = atom({ plugin: 'realce', key: 'usage' } as const, null)

// A literal, so the module scan can name the pane's matcher; the type ties it to the toggle's id.
const PANE_ID: typeof SESSION_PANE = 'realce-sessao'

type TabSpec = { id: PaneTab; hotkey: string; label: () => string; count: (d: PaneData) => number }

// Each tab keeps its digit whether or not the others show: the key a person learned stays theirs.
const TABS: readonly TabSpec[] = [
  { id: 'overview', hotkey: '1', label: () => tr('Overview', 'Visão'), count: () => 0 },
  { id: 'agent', hotkey: '2', label: () => tr('Agent', 'Agente'), count: d => d.chat.length },
  { id: 'files', hotkey: '3', label: () => tr('Files', 'Arquivos'), count: d => d.files.length },
  { id: 'turns', hotkey: '4', label: () => tr('Turns', 'Turnos'), count: d => (d.flags.linha ? d.timeline.length : 0) + (d.flags.fixar ? d.pins.length : 0) },
]

/** The tabs this session shows: Agent with its flag or a history to read; Turns with the timeline or pins. */
export function visibleTabs(d: Pick<PaneData, 'flags' | 'chat'>): PaneTab[] {
  return TABS.filter(tab => (tab.id === 'agent' ? d.flags.agente || d.chat.length > 0 : tab.id === 'turns' ? d.flags.linha || d.flags.fixar : true)).map(tab => tab.id)
}

function tabBar($: EngineInterface, t: UI, d: PaneData, tabs: readonly PaneTab[], active: PaneTab, cols: number): RenderElement {
  const { Box, Text, Button } = t
  const specs = TABS.filter(tab => tabs.includes(tab.id))
  const withCount = (s: TabSpec) => (s.count(d) > 0 ? `${s.label()} ${s.count(d)}` : s.label())
  // '1: ' before each label, two cells between tabs: the counts go first when the row runs out.
  const width = (label: (s: TabSpec) => string) => specs.reduce((sum, s) => sum + 3 + label(s).length + 2, 0)
  // Past even the bare labels, the active tab keeps its name and the others their digit.
  const label = width(withCount) <= cols ? withCount : width(s => s.label()) <= cols ? (s: TabSpec) => s.label() : (s: TabSpec) => (s.id === active ? s.label() : '·')
  return (
    <Box flexDirection="row" width={cols}>
      {specs.map(s => (
        <Box marginRight={2}>
          <Button plain key={`tab-${s.id}`} hotkey={s.hotkey} {...(s.id === active ? {} : { dimColor: true })} onPress={() => void setTab($, s.id)}>
            {s.id === active ? <Text color={SCREEN.plan}>{fitEnd(label(s), cols)}</Text> : fitEnd(label(s), cols)}
          </Button>
        </Box>
      ))}
    </Box>
  )
}

export function registerSessionPane(on: On): void {
  on('ui.render', { component: 'Pane', requestId: PANE_ID }, async ($, e) => timed('Pane:sessao', async () => {
    const t = $.ui.resolve(e)
    const { Box } = t
    const cols = e.props.bodyColumns
    const [flags, isOn] = await Promise.all([getFlags($), isMasterOn($)])
    // The env and the failures' sentences come from the module: each change of them redraws the screen.
    const env = cachedEnv()
    const [tab, mode, chat, pending, plan, files, failures, agents, timeline, pins, usage] = await Promise.all([
      read($, TAB),
      read($, ASK_MODE),
      read($, CHAT),
      read($, PENDING),
      read($, PLAN),
      read($, FILES),
      read($, FAILURES),
      read($, AGENTS),
      flags.linha ? read($, TIMELINE) : Promise.resolve([] as TimelineRow[]),
      flags.fixar ? read($, PINS) : Promise.resolve([] as Pin[]),
      flags.limite ? read($, USAGE) : Promise.resolve(null as UsageReading | null),
    ])
    const d: PaneData = { flags, isMasterOn: isOn, env, pending, plan, files, failures, agents, timeline, pins, usage, chat, mode, isFocused: e.props.isFocused }
    const tabs = visibleTabs(d)
    const active = tabs.includes(tab) ? tab : 'overview'
    const body = active === 'agent' ? agentTab($, t, d, cols) : active === 'files' ? filesTab(t, d, cols) : active === 'turns' ? turnsTab($, t, d, cols) : overviewTab($, t, d, cols)
    return (
      <Box flexDirection="column" width={cols}>
        {tabBar($, t, d, tabs, active, cols)}
        <Box flexDirection="column" marginTop={1} width={cols}>
          {body}
        </Box>
      </Box>
    )
  }))
}
