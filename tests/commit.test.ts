import { describe, expect, mock, test } from 'claude-code/testing'

import { cardText, commitCards } from '../hooks/screen/commit'
import { GIT_STDOUT, drawnText, engineRow } from './world'
import { PT } from './lang'

describe('commit card', () => {
  test('a commit, a push, a PR and a merge read as one line each', () => {
    const commit = commitCards({ stdout: GIT_STDOUT, stderr: '', gitOperation: { commit: { sha: '9cd805a1b2c3', kind: 'committed', branch: 'main' } } })
    expect(commit.map(cardText)).toEqual(['● commit 9cd805a · main · realce 0.3.0: tudo · 8 arquivos +120 −3'])
    const both = commitCards({ stdout: GIT_STDOUT, stderr: '', gitOperation: { commit: { sha: '9cd805a1b2c3', kind: 'amended' }, push: { branch: 'main' } } })
    expect(both.map(cardText)).toEqual(['● amend 9cd805a · main · realce 0.3.0: tudo · 8 arquivos +120 −3', '↑ push main'])
    expect(commitCards({ stdout: '', gitOperation: { pr: { number: 12, url: 'https://github.com/o/r/pull/12', action: 'created' } } }).map(cardText)).toEqual(['⇡ PR #12 criado · https://github.com/o/r/pull/12'])
    expect(commitCards({ stdout: '', gitOperation: { branch: { ref: 'feat/x', action: 'merged' } } }).map(cardText)).toEqual(['⎇ mesclou feat/x'])
    expect(commitCards({ stdout: 'ok' })).toEqual([])
  })

  const gitRow = (output: unknown, columns = 100) => ({
    plugin: 'realce' as const,
    surface: 'terminal' as const,
    component: 'ToolUse' as const,
    props: { tool_use_id: 'g1', tool: 'Bash', input: { command: 'git commit -m "realce 0.3.0: tudo"' }, isRunning: false, isErrored: false, isInterrupted: false, output },
    viewport: { columns, rows: 40 },
  })
  const OUTPUT = { stdout: GIT_STDOUT, stderr: '', interrupted: false, gitOperation: { commit: { sha: '9cd805a1b2c3', kind: 'committed', branch: 'main' } } }

  test('a Bash row with a git operation draws the card', async ($, on) => {
    mock.store(on, PT)
    engineRow(on, 'ToolUse')
    const ui = await $.ui.mount(gitRow(OUTPUT))
    expect(await drawnText(ui, 'realce-tool')).toBe('● commit 9cd805a · main · realce 0.3.0: tudo · 8 arquivos +120 −3')
  })

  test('without a git operation, or with commits off, the command row', async ($, on) => {
    mock.store(on, { ...PT, flags: { commits: false } })
    engineRow(on, 'ToolUse')
    expect(await drawnText(await $.ui.mount(gitRow(OUTPUT)), 'realce-tool')).toMatch(/^▶ git commit/)
  })

  test('a folded group names the commit it holds', async ($, on) => {
    mock.store(on, PT)
    mock.clock(on)
    engineRow(on, 'ToolGroup')
    on('tool.call', { tool: 'Bash' }, () => ({ result: OUTPUT }))
    await $.tool.call({ tool: 'Bash', command: 'git commit -m x', tool_use_id: 'g1' })
    const calls = [
      { tool_use_id: 'p1', tool: 'Bash', input: { command: 'pytest' }, isRunning: false, isErrored: false, isInterrupted: false },
      { tool_use_id: 'g1', tool: 'Bash', input: { command: 'git commit -m x' }, isRunning: false, isErrored: false, isInterrupted: false },
    ]
    const ui = await $.ui.mount({ plugin: 'realce', surface: 'terminal', component: 'ToolGroup', props: { calls, isActive: false, isExpanded: false, isCallsOnly: true } })
    expect(await drawnText(ui, 'realce-group')).toBe('◇ Rodou 2 comandos · ● commit 9cd805a')
  })

  test('a group draw reads no state once the cards are known', async ($, on) => {
    mock.store(on, PT)
    mock.clock(on)
    engineRow(on, 'ToolGroup')
    let reads = 0
    on('state.get', ($, e, next) => {
      if ((e as { key?: string }).key === 'commits' || (e as { key?: string }).key === 'explanations') reads++
      return next(e)
    })
    on('tool.call', { tool: 'Bash' }, () => ({ result: OUTPUT }))
    await $.tool.call({ tool: 'Bash', command: 'git commit -m x', tool_use_id: 'g1' })
    const calls = [{ tool_use_id: 'g1', tool: 'Bash', input: { command: 'git commit -m x' }, isRunning: false, isErrored: false, isInterrupted: false }]
    const ui = await $.ui.mount({ plugin: 'realce', surface: 'terminal', component: 'ToolGroup', props: { calls, isActive: false, isExpanded: false, isCallsOnly: true } })
    const before = reads
    for (let i = 0; i < 3; i++) await ui.redraw({ calls, isActive: false, isExpanded: false, isCallsOnly: true })
    expect(reads - before).toBe(0)
    expect(await drawnText(ui, 'realce-group')).toBe('◇ Rodou 1 comando · ● commit 9cd805a')
  })

  test('the card fits 40 columns on one line', async ($, on) => {
    mock.store(on, PT)
    engineRow(on, 'ToolUse')
    const ui = await $.ui.mount(gitRow(OUTPUT, 40))
    const card = (await ui.findAll({ type: 'Text' })).find(t => t.text.startsWith('● commit'))
    expect(card?.props.wrap).toBe('truncate-end')
  })
})
