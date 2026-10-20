import { describe, expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { languageOf, setLanguage, tr } from '../hooks/i18n'
import { formatScore } from '../hooks/screen/score'
import { cardText } from '../hooks/screen/commit'
import { runningWord } from '../hooks/screen/spinner'
import { summarizeGroup } from '../hooks/screen/tools'
import { formatDayMonth, humanizeAmount } from '../hooks/format'
import { scanDeltas } from '../hooks/text/deltas'
import { awayText } from '../hooks/orient/away'
import { limitText, usageLine } from '../hooks/orient/limits'
import { questionHeader } from '../hooks/orient/question'
import { summaryText } from '../hooks/system/summary'
import { planProgress, planSegments } from '../hooks/orient/plan'
import { buildSection } from '../hooks/prompt'
import { FLAGS, type Flags } from '../hooks/flags'
import { DEMO_TEXTS } from '../hooks/system/demo'
import { extractPending } from '../hooks/orient/pending'
import { engineRow, RUN } from './world'
import { OPT_IN } from './lang'

const ENGINE = { plugin: 'engine', tier: 'core' as const }
const languageRow = (value: string) => ({ key: 'language', label: 'Language', kind: 'text' as const, value, provider: ENGINE, isLocked: false })

/** The machine beneath the plugin, its Claude Code set to `language` (none: the row is absent). */
function world(on: On, language: string | null) {
  const invalidated: string[] = []
  mock.env(on, { HOME: '/Users/u' })
  on('config.list', () => ({ value: language === null ? [] : [languageRow(language)] }))
  on('fs.exists', () => ({ value: false }))
  on('fs.read', ($, e) => ({ deny: `ENOENT: ${e.path}` }))
  on('process.run', ($, e) => ({ value: { exitCode: e.argv[0] === 'date' ? 0 : 1, stdout: e.argv[0] === 'date' ? '-0300\n' : '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('session.messages', () => ({ value: [] }))
  on('ui.invalidate', ($, e) => {
    invalidated.push(e.event)
    return { value: undefined }
  })
  const titles: string[] = []
  on('ui.open', ($, e) => {
    titles.push(e.title ?? '')
    return { value: { isPlaced: true as const } }
  })
  const toasts: string[] = []
  on('ui.toast', ($, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('prompt.compose', () => ({ sections: [] }))
  on('session.start', () => ({ cwd: '/a/b' }))
  on('config.set', ($, e) => ({ value: e.value }) as never)
  return { invalidated, toasts, titles }
}

/** What the plugin writes to its store under `language`; before mock.store, whose hooks answer. */
function watchLanguage(on: On) {
  const writes: unknown[] = []
  on('store.set', { key: 'language' }, ($, e, next) => {
    writes.push(e.value)
    return next(e)
  })
  return writes
}

// The plugin runs in its own worker: what it speaks is seen in its answers, not in this file's copy of the module.
const answer = async ($: { command: { run: (e: typeof RUN & { args: string }) => Promise<{ text?: string }> } }, args: string) =>
  (await $.command.run({ ...RUN, args })).text ?? ''

/** Runs `check` with this file's copy of the module in English, and leaves it in Portuguese, as the other files expect. */
function english(check: () => void): void {
  setLanguage('en')
  try {
    check()
  } finally {
    setLanguage('pt')
  }
}

const EN = { language: 'en' } as const

describe('interface language', () => {
  test("Claude Code's language names Portuguese in its own ways; anything else is English", () => {
    for (const value of ['Brazilian Portuguese', 'Portuguese', 'português', 'pt-BR', 'pt']) expect([value, languageOf(value)]).toEqual([value, 'pt'])
    for (const value of ['English', 'Japanese', '', undefined, 3]) expect([value, languageOf(value)]).toEqual([value, 'en'])
  })

  test('tr speaks the language in force', () => {
    setLanguage('pt')
    expect(tr('Thinking', 'Pensando')).toBe('Pensando')
    english(() => expect(tr('Thinking', 'Pensando')).toBe('Thinking'))
  })

  test("a session follows Claude Code's language", async ($, on) => {
    mock.store(on)
    mock.clock(on)
    world(on, 'Brazilian Portuguese')
    await $.session.start({ cwd: '/a/b', surface: 'terminal', isInteractive: true })
    expect(await answer($, 'idioma auto')).toBe('Idioma da interface: o do Claude Code (português).')
  })

  test('with no language set, the interface is English', async ($, on) => {
    mock.store(on)
    mock.clock(on)
    world(on, null)
    await $.session.start({ cwd: '/a/b', surface: 'terminal', isInteractive: true })
    expect(await answer($, 'language auto')).toBe("Interface language: Claude Code's (English).")
  })

  test('/realce language picks one, kept in the store, and auto follows Claude Code again', async ($, on) => {
    const writes = watchLanguage(on)
    mock.store(on)
    mock.clock(on)
    world(on, 'Brazilian Portuguese')
    await $.session.start({ cwd: '/a/b', surface: 'terminal', isInteractive: true })
    expect(await answer($, 'language en')).toBe('Interface language: English. /realce language auto follows Claude Code again.')
    expect(await answer($, 'language xx')).toBe('Usage: /realce language en|pt|auto (got "xx").')
    expect(await answer($, 'idioma auto')).toBe('Idioma da interface: o do Claude Code (português).')
    // Auto is kept as null: the plugin reads anything but en or pt as following Claude Code.
    expect(writes).toEqual(['en', null])
  })

  test('a language may be named in full, in either language, accents or not', async ($, on) => {
    mock.store(on)
    mock.clock(on)
    world(on, null)
    await $.session.start({ cwd: '/a/b', surface: 'terminal', isInteractive: true })
    expect(await answer($, 'language português')).toBe('Idioma da interface: português. /realce idioma auto volta a seguir o Claude Code.')
    expect(await answer($, 'idioma english')).toBe('Interface language: English. /realce language auto follows Claude Code again.')
    expect(await answer($, 'language portugues')).toMatch(/^Idioma da interface: português/)
    expect(await answer($, 'language ingles')).toMatch(/^Interface language: English/)
  })

  test('a language picked before is read back with the flags', async ($, on) => {
    mock.store(on, { language: 'en' })
    mock.clock(on)
    world(on, 'Brazilian Portuguese')
    await $.session.start({ cwd: '/a/b', surface: 'terminal', isInteractive: true })
    expect(await answer($, 'language zz')).toBe('Usage: /realce language en|pt|auto (got "zz").')
  })

  test('a language changed in /config redraws the screen in it', async ($, on) => {
    mock.store(on)
    mock.clock(on)
    const { invalidated } = world(on, 'English')
    await $.session.start({ cwd: '/a/b', surface: 'terminal', isInteractive: true })
    expect(await answer($, 'language zz')).toBe('Usage: /realce language en|pt|auto (got "zz").')
    await $.config.set({ key: 'language', value: 'Brazilian Portuguese', previous: 'English', provider: ENGINE, origin: { kind: 'composer' } })
    expect(invalidated).toContain('ui.render')
    expect(await answer($, 'idioma zz')).toBe('Uso: /realce idioma en|pt|auto (recebi "zz").')
  })

  test('commands answer to their English and Portuguese names, in the language in force', async ($, on) => {
    mock.store(on, { language: 'en' })
    mock.clock(on)
    world(on, null)
    expect(await answer($, 'help')).toContain('/realce pane — opens or closes the session pane')
    expect(await answer($, 'ajuda')).toContain('/realce summary — shows and copies')
    expect(await answer($, 'column off')).toBe('Off: Reading column.')
    expect(await answer($, 'coluna on')).toBe('On: Reading column.')
    expect(await answer($, 'focus')).toBe('Focus mode on.')
    expect(await answer($, 'foco')).toBe('Focus mode off.')
    expect(await answer($, 'summary off')).toBe('Off: Session summary.')
    expect(await answer($, 'summary')).toBe('Feature off: Session summary. /realce summary on turns it on.')
    expect(await answer($, 'xyz')).toMatch(/^Usage: \/realce \[help\|doctor\|.*\(got "xyz"\)\. Features: emphasis, column, /)
  })

  test('the flags pane speaks the language in force', async ($, on) => {
    mock.store(on, { language: 'en' })
    mock.clock(on)
    world(on, null)
    const ui = await $.ui.mount({ plugin: 'realce', surface: 'terminal', component: 'Pane', requestId: 'realce-flags', props: { title: 'x', isFocused: true, bodyColumns: 100, placement: 'dock', scroll: { offset: 0, bodyRows: 80 }, view: {} } })
    const texts = [...(await ui.findAll({ type: 'Text' })), ...(await ui.findAll({ type: 'Button' }))].map(t => t.text).join('\n')
    expect(texts).toContain('Guidance')
    expect(texts).toContain('[x] Colored emphasis')
    expect(texts).toContain('A letter or digit toggles')
  })

  test('scores, counts, dates and numbers read in English', () => {
    english(() => {
      expect(formatScore({ runner: 'pytest', passed: 426, failed: 2, skipped: 3, seconds: 12.3, unit: 'tests' })).toBe('✔ 426 passed · ✖ 2 failed · ⏭ 3 skipped · ⏱ 12.3s')
      expect(formatScore({ runner: 'go', passed: 1, failed: 0, skipped: 0, seconds: 2.5, unit: 'packages' })).toBe('✔ 1 package passed · ✖ 0 packages failed · ⏱ 2.5s')
      expect(humanizeAmount(73_201, 'tokens')).toBe('73.2k')
      expect(humanizeAmount(5_242_880, 'bytes')).toBe('5.0 MB')
      expect(formatDayMonth(Date.UTC(2026, 9, 21, 15), -180)).toBe('Oct 21')
    })
  })

  test('the spinner, the folded group and the commit card speak English', () => {
    english(() => {
      expect(runningWord([{ activity: 'test', target: 'last: 6.2s' }])).toBe('Running the tests (last: 6.2s)')
      expect(runningWord([{ activity: 'read', target: 'a.ts' }, { activity: 'search', target: '“x”' }])).toBe('Reading and searching')
      expect(runningWord([{ activity: 'agent', target: 'Review the diff' }])).toBe('Delegating: Review the diff')
      expect(summarizeGroup([{ tool: 'Read', input: {} }, { tool: 'Read', input: {} }, { tool: 'Grep', input: {} }, { tool: 'Bash', input: {} }])).toBe('Read 2 files · searched 1 time · ran 1 command')
      expect(cardText({ kind: 'commit', verb: 'commit', sha: '9cd805a', branch: 'main', message: 'x', stat: { files: 8, added: 120, removed: 3 } })).toBe('● commit 9cd805a · main · x · 8 files +120 −3')
      expect(cardText({ kind: 'pr', number: 12, action: 'created', url: null })).toBe('⇡ PR #12 created')
    })
  })

  test('the spinner word, the tool row and the turn rule draw in English', async ($, on) => {
    mock.store(on, EN)
    mock.clock(on)
    engineRow(on, 'ToolUse')
    engineRow(on, 'TurnDuration')
    on('prompt.submit', ($, e) => ({ text: e.text }))
    on('tool.call', () => ({ result: { stdout: '===== 2 passed in 0.50s =====', stderr: '', interrupted: false } }))
    on('turn.complete', () => ({ text: '' }))
    let word = ''
    on('ui.render', { component: 'Spinner' }, ($, e) => {
      word = e.props.word
      const { Text } = $.ui.resolve(e)
      return <Text>engine</Text>
    })
    await $.ui.mount({ plugin: 'realce', surface: 'terminal', component: 'Spinner', props: { word: 'Sauteing', suffix: '…', mode: 'thinking', message: null } })
    expect(word).toBe('Thinking')
    const edit = await $.ui.mount({ plugin: 'realce', surface: 'terminal', component: 'ToolUse', props: { tool_use_id: 'e1', tool: 'Edit', input: { file_path: '/a/b/x.ts', old_string: 'a', new_string: 'a\nb\nc' }, isRunning: false, isErrored: false, isInterrupted: false } })
    expect((await edit.find({ key: 'realce-tool' }))?.text).toBe('✎ Edited /a/b/x.ts  +3 −1')
    await $.prompt.submit({ text: 'hi', origin: { kind: 'composer' }, wait: false })
    await $.tool.call({ tool: 'Bash', command: 'pytest -q' })
    await $.tool.call({ tool: 'Read', file_path: '/a/b/x.ts' })
    await $.turn.complete({ answer: 'All done and the tests pass.', isAborted: false, turnId: 't1', reason: 'answer', durationMs: 4_000 })
    const rule = await $.ui.mount({ plugin: 'realce', surface: 'terminal', component: 'TurnDuration', props: { word: 'Baked', durationMs: 4_000 }, viewport: { columns: 100, rows: 40 } })
    expect((await rule.find({ key: 'realce-turn' }))?.text).toContain('4s · ✔ proved · 2 tools · ✔ tests')
  })

  test("the Haiku is asked in the interface's language", async ($, on) => {
    mock.store(on, { ...EN, flags: OPT_IN })
    const clock = mock.clock(on)
    const asked: { system?: unknown; prompt: unknown }[] = []
    on('model.complete', ($, e) => {
      asked.push(e as never)
      return { value: { isAnswered: true, text: 'The file is missing.', usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } } } as never
    })
    on('tool.call', () => ({ isError: true as const, result: 'Exit code 1\ncat: x: No such file', text: 'Exit code 1\ncat: x: No such file' }))
    engineRow(on, 'ToolUse')
    await $.tool.call({ tool: 'Bash', command: 'cat x', tool_use_id: 'w1' })
    await clock.settle()
    expect(String(asked[0]?.system)).toContain('in plain English')
    expect(String(asked[0]?.prompt)).toMatch(/^Command:\ncat x\n\nOutput \(end\):/)
    const row = await $.ui.mount({ plugin: 'realce', surface: 'terminal', component: 'ToolUse', requestId: 'w1', props: { tool_use_id: 'w1', tool: 'Bash', input: { command: 'cat x' }, isRunning: false, isErrored: true, isInterrupted: false, output: 'Exit code 1' } })
    expect((await row.find({ key: 'realce-why' }))?.text).toBe('↳ Why: The file is missing.')
  })

  test('"from X to Y" gains its difference in both languages, written in the language in force', () => {
    english(() => {
      expect(scanDeltas('the build went from 22 ms to 9 ms')[0]?.label).toBe('(−13 ms)')
      expect(scanDeltas('from 1.5 to 2.25')[0]?.label).toBe('(+0.75)')
      expect(scanDeltas('de 10% para 12,5%')[0]?.label).toBe('(+2.5 pp)')
    })
    expect(scanDeltas('de 1,5 para 2,25')[0]?.label).toBe('(+0,75)')
    expect(scanDeltas('from 87 to 106')[0]?.label).toBe('(+19)')
  })

  test('a reply draws its callouts, copy and fold in English', async ($, on) => {
    mock.store(on, EN)
    mock.clock(on)
    on('ui.render', { component: 'AssistantMessage' }, ($, e) => {
      const { Text } = $.ui.resolve(e)
      return <Text>engine</Text>
    })
    const code = Array.from({ length: 40 }, (_, i) => `const a${i} = ${i}`).join('\n')
    const text = ['> [!DECISION] Ship it?', '> Yes or no.', '', '> [!RISCO] Também em português', '', '```ts', code, '```', ...Array.from({ length: 12 }, (_, i) => `line ${i}`)].join('\n')
    const ui = await $.ui.mount({ plugin: 'realce', surface: 'terminal', component: 'AssistantMessage', props: { text, isFirstOfReply: true }, viewport: { columns: 120, rows: 40 } })
    const all = [...(await ui.findAll({ type: 'Text' })), ...(await ui.findAll({ type: 'Button' }))].map(t => t.text)
    expect(all).toContain('Decision · Ship it?')
    expect(all).toContain('Risk · Também em português')
    expect(all).toContain('Copy')
    expect(all).toContain('▸ Show 32 more lines')
    expect(all).toContain('Copy reply')
  })

  test('the guidance speaks English: away, limits, usage, question, plan and the summary', () => {
    english(() => {
      expect(awayText({ minutes: 32, turns: 2, files: 5, tests: { runner: 'pytest', passed: 159, failed: 0, skipped: 0, unit: 'tests' }, seal: 'proved', pending: 1 })).toBe(
        '↺ While you were away (32 min): 2 turns · 5 files · ✔ 159 tests · ✔ proved · 1 decision waiting',
      )
      const now = Date.UTC(2026, 9, 20, 12)
      expect(limitText({ kind: 'rate', window: 'five_hour', percent: 86, resetsAt: now + 3_600_000 }, -180, now)).toBe('⚠ 5 h limit at 86% · resets at 10:00')
      expect(limitText({ kind: 'rate', window: 'seven_day', percent: 91, resetsAt: now + 3 * 86_400_000 }, -180, now)).toBe('⚠ 7 days limit at 91% · resets Oct 23 at 09:00')
      expect(limitText({ kind: 'context', window: 'context', percent: 92, resetsAt: null }, -180, now)).toBe('⚠ Context at 92%: a /compact before anything big')
      expect(usageLine({ context: 30, windows: [{ window: 'five_hour', percent: 46 }, { window: 'seven_day', percent: 12 }] }).map(s => s.text).join('')).toBe('Context 30% · 5 h 46% · 7 days 12%')
      expect(questionHeader([{ question: 'q', options: [{ label: 'MIT (Recommended)' }, { label: 'Apache' }] }])).toBe('◆ Claude needs you · 1 question · recommended: MIT')
      expect(planSegments(planProgress([{ text: 'Write tests', status: 'in_progress', activeForm: 'Writing tests' }, { text: 'Ship', status: 'pending' }])!).map(s => s.text).join('')).toBe('Plan ▱▱▱▱▱▱▱▱▱▱ 0/2 · Now: Writing tests')
      const report = summaryText({
        timeline: [{ requestId: 'u1', at: Date.UTC(2026, 9, 19, 23, 41), prompt: 'Rename b', durationMs: 12_000, seal: 'proved', tests: { runner: 'pytest', passed: 12, failed: 0, skipped: 0, unit: 'tests' } }],
        files: [{ path: '/a/b/calc.py', added: 3, removed: 1, edits: 2, at: 1 }],
        commits: [],
        failures: [{ command: 'npm test', line: '2 failing', at: 3 }],
        cwd: '/a/b',
        tzOffsetMinutes: -180,
        lastWhy: 'Two tests fail.',
      })
      expect(report).toBe(
        [
          '## Session summary (20:41–20:41)',
          '',
          '- **Turns:** 1 (✔ 1 proved)',
          '  - 20:41 · 12s · Rename b · ✔ proved',
          '- **Tests:** last score ✔ 12 tests',
          '- **Files:** 1 (+3 −1)',
          '  - `calc.py` +3 −1',
          '- **Failures:** 1 (last: `npm test` → 2 failing)',
          '  - Why: Two tests fail.',
        ].join('\n'),
      )
    })
  })

  test('the session pane speaks English', async ($, on) => {
    mock.store(on, EN)
    mock.clock(on)
    on('tool.call', { tool: 'Bash' }, () => ({ isError: true as const, result: 'Exit code 1\nnope', text: 'Exit code 1\nnope' }))
    world(on, null)
    on('model.complete', () => ({ deny: 'offline' }) as never)
    await $.tool.call({ tool: 'Bash', command: 'cat x', tool_use_id: 'f1' })
    const ui = await $.ui.mount({ plugin: 'realce', surface: 'terminal', component: 'Pane', requestId: 'realce-sessao', props: { title: 'x', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} } })
    const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
    expect(texts).toContain('Failures (1)')
  })

  test("the model is taught the tags and the change phrase of the person's language", () => {
    const all = Object.fromEntries(FLAGS.map(f => [f.id, true])) as Record<keyof Flags, boolean>
    english(() => {
      const text = buildSection(all, true)?.text ?? ''
      expect(text).toContain('`[!DECISION]`')
      expect(text).toContain('`from X to Y`')
      expect(text).not.toContain('DECISÃO')
    })
    expect(buildSection(all, true)?.text).toContain('`[!DECISÃO]`')
  })

  test('the English demo shows every aid and asks only an example of you', () => {
    const text = DEMO_TEXTS.en
    for (const piece of ['{+', '{-', '{!', '==', '> [!DONE]', '> [!TIP]', '```mermaid', '```ts', '| ', 'from 22 ms to 9 ms']) expect(text).toContain(piece)
    expect(extractPending(text)).toEqual(['approve the deploy (example)'])
  })

  test('status, check-up, the demo and the welcome speak English', async ($, on) => {
    mock.store(on, EN)
    const clock = mock.clock(on)
    on('session.version', () => ({ value: { version: '2.1.304' } }) as never)
    on('prompt.submit', ($, e) => ({ text: e.text }))
    const { toasts } = world(on, null)
    await $.session.start({ cwd: '/a/b', surface: 'terminal', isInteractive: true })
    expect(toasts).toContain('realce installed: /realce demo shows what it does; /realce help lists the commands.')
    const status = await answer($, 'status')
    expect(status).toMatch(/^Realce on\.\nLanguage: English \(picked; \/realce language auto follows Claude Code\)\.\nFeatures off: Explained errors, Focus mode, Needs you, Notification sound\./)
    expect(status).toContain('Colors: dark theme.')
    expect(await answer($, 'doctor')).toMatch(/^realce check-up:\n✔ Claude Code 2\.1\.304\n/)
    await answer($, 'demo')
    await clock.settle()
    const stream = $.turn.step({ turnId: 'd1', index: 0, model: 'm', messageCount: 1 })
    let said = ''
    for (let step = await stream.next(); step.done !== true; step = await stream.next()) if (step.value.kind === 'text') said += step.value.text
    expect(said).toBe(DEMO_TEXTS.en)
  })

  test("the first system prompt, built before session.start, already speaks the person's language", async ($, on) => {
    // From the review: the session keeps its first prompt, composed before the language was read.
    mock.store(on)
    mock.clock(on)
    world(on, 'Brazilian Portuguese')
    const composed = await $.prompt.compose({ model: 'm', promptModel: 'm', surfaces: ['terminal'], tools: [], outputStyle: null, traits: [] })
    const text = composed.sections.find(x => x.id === 'realce:reading-aids')?.text ?? ''
    expect(text).toContain('`[!DECISÃO]`')
    expect(text).toContain('`de X para Y`')
  })

  test('a language word that is no language is refused, inherited names too', async ($, on) => {
    mock.store(on, EN)
    mock.clock(on)
    world(on, null)
    expect(await answer($, 'language __proto__')).toBe('Usage: /realce language en|pt|auto (got "__proto__").')
    expect(await answer($, 'language constructor')).toBe('Usage: /realce language en|pt|auto (got "constructor").')
    expect(await answer($, 'help')).toContain('/realce pane — opens or closes the session pane')
    expect(await answer($, 'constructor')).toMatch(/^Usage: \/realce /)
  })

  test('/realce language alone says the language in force, where it comes from, and the choices', async ($, on) => {
    mock.store(on)
    mock.clock(on)
    world(on, 'Brazilian Portuguese')
    await $.session.start({ cwd: '/a/b', surface: 'terminal', isInteractive: true })
    expect(await answer($, 'idioma')).toBe('Idioma da interface: português (o do Claude Code). /realce idioma en|pt|auto muda.')
    await answer($, 'language en')
    expect(await answer($, 'language')).toBe('Interface language: English (picked). /realce language en|pt|auto changes it.')
    expect(await answer($, 'status')).toContain('Language: English (picked; /realce language auto follows Claude Code).')
    await answer($, 'language auto')
    expect(await answer($, 'status')).toContain("Idioma: português (o do Claude Code).")
  })

  test('pt_BR and pt-PT name Portuguese', () => {
    expect(languageOf('pt_BR')).toBe('pt')
    expect(languageOf('pt-PT')).toBe('pt')
    expect(languageOf('ptolemaic')).toBe('en')
  })

  test('limits keep their source, so their words follow the language and a hidden one stays hidden across a switch', async ($, on) => {
    english(() => {
      expect(limitText({ kind: 'rate', window: 'seven_day', percent: 91, resetsAt: null }, -180, 0)).toBe('⚠ 7 days limit at 91%')
    })
    expect(limitText({ kind: 'rate', window: 'seven_day', percent: 91, resetsAt: null }, -180, 0)).toBe('⚠ Limite de 7 dias em 91%')
    mock.store(on, EN)
    mock.clock(on)
    world(on, null)
    engineRow(on, 'AbovePrompt')
    on('session.measure', ($, e) => ({ changed: e.changed }))
    const measure = (percent: number) => ({ context: { window: 1_000_000, tokens: 300_000, percent: 30 }, rateLimits: [{ kind: 'seven_day', percentUsed: percent }], changed: ['rateLimits' as const] })
    await $.session.measure(measure(86))
    const band = await $.ui.mount({ plugin: 'realce', surface: 'terminal', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 6, bodyColumns: 100, scroll: { offset: 0, bodyRows: 6 }, view: {} } })
    expect(await band.find({ text: '⚠ 7 days limit at 86%' })).toBeDefined()
    await band.press({ key: 'hide-limit' })
    await answer($, 'language pt')
    await $.session.measure(measure(87))
    expect(await band.find({ text: /Limite de 7 dias/ })).toBeUndefined()
  })

  test("commit cards are kept as data, so a folded group's card speaks the language in force", async ($, on) => {
    mock.store(on, EN)
    mock.clock(on)
    on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout: 'Fast-forward\n', stderr: '', interrupted: false, gitOperation: { branch: { ref: 'feat/x', action: 'merged' } } } }) as never)
    world(on, null)
    on('ui.render', { component: 'ToolGroup' }, ($, e) => {
      const { Text } = $.ui.resolve(e)
      return <Text>engine</Text>
    })
    await $.tool.call({ tool: 'Bash', command: 'git merge feat/x', tool_use_id: 'g1' })
    const calls = [{ tool_use_id: 'g1', tool: 'Bash', input: { command: 'git merge feat/x' }, isRunning: false, isErrored: false, isInterrupted: false }]
    const group = await $.ui.mount({ plugin: 'realce', surface: 'terminal', component: 'ToolGroup', props: { calls, isActive: false, isExpanded: false } })
    const before = (await group.find({ key: 'realce-group' }))?.text ?? ''
    await answer($, 'language pt')
    await group.redraw({ calls, isActive: false, isExpanded: true })
    await group.redraw({ calls, isActive: false, isExpanded: false })
    const after = (await group.find({ key: 'realce-group' }))?.text ?? ''
    expect([before.includes('⎇ merged feat/x'), after.includes('⎇ mesclou feat/x')]).toEqual([true, true])
  })

  test('an explanation the reload cut short says so in the language in force', async ($, on) => {
    mock.store(on, { ...EN, flags: OPT_IN })
    mock.clock(on)
    on('tool.call', { tool: 'Bash' }, () => ({ isError: true as const, result: 'Exit code 1\ncat: x: No such file', text: 'Exit code 1\ncat: x: No such file' }))
    on('model.complete', () => ({ value: { isAnswered: true, text: 'x', usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } } }) as never)
    world(on, null)
    on('ui.render', { component: 'ToolUse' }, ($, e) => {
      const { Text } = $.ui.resolve(e)
      return <Text>engine</Text>
    })
    // The sentence is still on its way when the session starts again: the load marks it cut short.
    await $.tool.call({ tool: 'Bash', command: 'cat x', tool_use_id: 'b1' })
    await $.session.start({ cwd: '/a/b', surface: 'terminal', isInteractive: true })
    const props = { tool_use_id: 'b1', tool: 'Bash', input: { command: 'cat x' }, isRunning: false, isErrored: true, isInterrupted: false, output: 'Exit code 1' }
    const row = await $.ui.mount({ plugin: 'realce', surface: 'terminal', component: 'ToolUse', requestId: 'b1', props })
    expect((await row.find({ key: 'realce-why' }))?.text).toBe('↳ No explanation: cut short when the mod reloaded')
    await answer($, 'language pt')
    await row.redraw(props)
    expect((await row.find({ key: 'realce-why' }))?.text).toBe('↳ Sem explicação: interrompida ao recarregar o mod')
  })

  test('the open session pane is retitled when the language changes', async ($, on) => {
    mock.store(on, EN)
    mock.clock(on)
    const { titles } = world(on, null)
    await answer($, 'pane')
    await answer($, 'language pt')
    expect(titles).toEqual(['Session', 'Sessão'])
  })
})
