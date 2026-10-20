import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { isAnswerStyle } from '../hooks/screen/explainError'
import { activityOf, runningWord, SPINNER_WORDS, testKey, translateSpinnerMessage } from '../hooks/screen/spinner'
import { shellCommands } from '../hooks/screen/toolInfo'
import { BASH_OK, inSubagent, isTestRun } from './world'
import { PT } from './lang'

describe('spinner', () => {
  const spinner = async ($: Engine, on: On, props: { mode: 'thinking' | 'tool-use'; message: string | null }) => {
    let seen = { word: '', message: null as string | null }
    on('ui.render', { component: 'Spinner' }, ($, e) => {
      seen = { word: e.props.word, message: e.props.message }
      const { Text } = $.ui.resolve(e)
      return <Text>engine</Text>
    })
    await $.ui.mount({ plugin: 'realce', surface: 'terminal', component: 'Spinner', props: { word: 'Sauteing', suffix: '…', ...props } })
    return seen
  }

  test('the spinner word follows the mode in Portuguese', async ($, on) => {
    mock.store(on, PT)
    expect(await spinner($, on, { mode: 'thinking', message: null })).toEqual({ word: 'Pensando', message: null })
    expect(SPINNER_WORDS['tool-use']).toEqual({ en: 'Running', pt: 'Executando' })
  })

  test('known messages are translated, others kept', async ($, on) => {
    expect(translateSpinnerMessage('Waiting for 1 background agent to finish')).toBe('Esperando 1 agente em segundo plano')
    expect(translateSpinnerMessage('Waiting for 3 background agents to finish…')).toBe('Esperando 3 agentes em segundo plano…')
    expect(translateSpinnerMessage('Compacting conversation')).toBe('Compactando a conversa')
    expect(translateSpinnerMessage('Doing something else')).toBe('Doing something else')
    mock.store(on, PT)
    expect((await spinner($, on, { mode: 'tool-use', message: 'Compacting conversation' })).message).toBe('Compactando a conversa')
  })

  test('spinner off keeps the engine word', async ($, on) => {
    mock.store(on, { ...PT, flags: { spinner: false } })
    expect((await spinner($, on, { mode: 'thinking', message: null })).word).toBe('Sauteing')
  })

  test('a command splits into what runs, quotes kept whole', () => {
    expect(shellCommands('cd app && npm test')).toEqual([['cd', 'app'], ['npm', 'test']])
    expect(shellCommands('git commit -m "fix; a && b" | cat\nls -la')).toEqual([['git', 'commit', '-m', 'fix; a && b'], ['cat'], ['ls', '-la']])
    expect(shellCommands("(cd x; echo 'it''s') & wait")).toEqual([['cd', 'x'], ['echo', 'its'], ['wait']])
    expect(shellCommands('echo a\\;b ""')).toEqual([['echo', 'a;b', '']])
    expect(isAnswerStyle('grep -q x f && echo ok')).toBe(true)
    expect(isAnswerStyle('command -v mmdc')).toBe(true)
    expect(isAnswerStyle('echo "a; grep x"')).toBe(false)
    expect(isAnswerStyle('cat x')).toBe(false)
    // From the review: a chain whose exit 1 may come from a real failure is no answer.
    expect(isAnswerStyle('npm run build && grep -q ok dist/out')).toBe(false)
    expect(isAnswerStyle('grep -q x f || { echo missing; exit 1; }')).toBe(false)
    expect(isAnswerStyle('cd app && grep -q x f')).toBe(false)
  })

  test('heredoc bodies and comments are not commands', () => {
    expect(shellCommands('cat > a.md <<EOF\ntest coverage is low\nnpm test\nEOF\nls')).toEqual([['cat', '>', 'a.md'], ['ls']])
    expect(shellCommands("cat <<-'END'\n\tnpm test\n\tEND\necho fim")).toEqual([['cat'], ['echo', 'fim']])
    expect(shellCommands('cat <<< "npm test"')).toEqual([['cat', '<<<', 'npm test']])
    expect(shellCommands('grep -q x f 2>&1')).toEqual([['grep', '-q', 'x', 'f', '2>&1']])
    expect(shellCommands('npm test &> log.txt; echo $?')).toEqual([['npm', 'test', '&>', 'log.txt'], ['echo', '$?']])
    expect(shellCommands('make 2>&1 |& tee out')).toEqual([['make', '2>&1'], ['tee', 'out']])
    expect(isAnswerStyle('grep -q x f 2>&1')).toBe(true)
    expect(shellCommands("# don't do this\nnpm test")).toEqual([['npm', 'test']])
    expect(shellCommands('echo a#b # comment')).toEqual([['echo', 'a#b']])
    expect(isTestRun("# don't do this\nnpm test")).toBe(true)
    expect(isTestRun('cat > notes.md <<EOF\nnpm test\nEOF')).toBe(false)
    expect(isTestRun('PYTHONPATH=./src pytest -q')).toBe(true)
  })

  test('a test command is told apart from any other', () => {
    for (const command of [
      'npm test', 'npm run test:unit', 'yarn test', 'pnpm t', 'bun test', 'pytest -q tests/', 'python3 -m pytest', 'python -m unittest',
      'cargo test', 'cargo nextest run', 'go test ./...', 'deno test -A', 'node --test', 'npx vitest run', 'CI=1 npx jest',
      'bundle exec rspec', 'uv run pytest', 'timeout 60 pytest', './gradlew test', 'mvn verify', 'make check', 'swift test',
      'xcodebuild -scheme App test', 'claude plugin test .', 'cd app && npm test', 'tsc -p . && claude plugin test .',
      './node_modules/.bin/jest', 'dotnet test', 'mix test',
      // From the review: interpreters by path, flags before the subcommand, runners through a package manager.
      '.venv/bin/python -m pytest', 'npm --prefix app test', 'npm -w pkg test', 'pnpm --filter web test', 'pnpm -C app test',
      'yarn workspace web test', 'yarn test:unit', 'make -C app test', 'npx --yes vitest run', 'npm exec jest', 'yarn jest',
      'pnpm vitest run', 'bun run vitest', 'sudo pytest', '(cd app && npm test)', 'cd app\nnpm test',
    ]) expect([command, isTestRun(command)]).toEqual([command, true])
    for (const command of [
      'npm install', 'npm run build', 'cat test.txt', 'ls tests', 'grep -rn test src', 'echo npm test', 'git commit -m "test"',
      'make', 'cargo build', 'go vet ./...', 'node index.js', 'claude plugin validate .', 'python3 script.py',
      'pytest --version', 'jest --help', 'git commit -m "fix; pytest now passes"', 'echo "a && npm test"',
    ]) expect([command, isTestRun(command)]).toEqual([command, false])
  })

  test('each call is named by what it does', () => {
    expect(activityOf({ tool: 'Read', file_path: '/a/b/render.tsx' })).toEqual({ activity: 'read', target: 'render.tsx' })
    expect(activityOf({ tool: 'Edit', file_path: '/a/b/x.ts', old_string: 'a', new_string: 'b' })).toEqual({ activity: 'edit', target: 'x.ts' })
    expect(activityOf({ tool: 'Bash', command: 'pytest -q' })).toEqual({ activity: 'test', target: null })
    expect(activityOf({ tool: 'Bash', command: 'git add -A && git commit -m "x"' })).toEqual({ activity: 'commit', target: null })
    expect(activityOf({ tool: 'Bash', command: 'git push origin master' })).toEqual({ activity: 'push', target: null })
    expect(activityOf({ tool: 'Bash', command: 'git add -A\ngit commit -m "fix; pytest now passes"' })).toEqual({ activity: 'commit', target: null })
    expect(activityOf({ tool: 'Bash', command: 'ls -la' })).toEqual({ activity: 'other', target: null })
    expect(activityOf({ tool: 'Grep', pattern: 'registerSpinner' })).toEqual({ activity: 'search', target: '“registerSpinner”' })
    expect(activityOf({ tool: 'WebFetch', url: 'https://docs.example.com/a/b', prompt: 'x' })).toEqual({ activity: 'web', target: 'docs.example.com' })
    expect(activityOf({ tool: 'Agent', description: 'Revisar o diff', prompt: 'x' })).toEqual({ activity: 'agent', target: 'Revisar o diff' })
    expect(activityOf({ tool: 'Read', file_path: `/a/${'x'.repeat(60)}.ts` }).target).toBe(`${'x'.repeat(31)}…`)
    // Cut by characters, never inside an emoji's surrogate pair.
    // Cut by the cells the terminal draws: an emoji takes two.
    expect(activityOf({ tool: 'Read', file_path: `/a/${'🙂'.repeat(40)}.ts` }).target).toBe(`${'🙂'.repeat(15)}…`)
    expect(activityOf({ tool: 'Skill', skill: 'superpowers:brainstorming' })).toEqual({ activity: 'skill', target: 'superpowers:brainstorming' })
    expect(activityOf({ tool: 'TodoWrite', todos: [] })).toEqual({ activity: 'plan', target: null })
    expect(activityOf({ tool: 'TaskUpdate', taskId: '7' })).toEqual({ activity: 'plan', target: null })
    expect(activityOf({ tool: 'mcp__rea__open_binary', path: '/x' })).toEqual({ activity: 'other', target: 'rea: open_binary' })
  })

  test('the word says what runs now, one call or several', () => {
    expect(runningWord([])).toBeNull()
    expect(runningWord([{ activity: 'test', target: null }])).toBe('Rodando os testes')
    expect(runningWord([{ activity: 'edit', target: 'x.ts' }])).toBe('Editando x.ts')
    expect(runningWord([{ activity: 'agent', target: 'Revisar o diff' }])).toBe('Delegando: Revisar o diff')
    expect(runningWord([{ activity: 'read', target: 'a.ts' }, { activity: 'read', target: 'b.ts' }, { activity: 'read', target: 'c.ts' }])).toBe('Lendo 3 arquivos')
    expect(runningWord([{ activity: 'agent', target: 'a' }, { activity: 'agent', target: 'b' }])).toBe('Delegando a 2 agentes')
    expect(runningWord([{ activity: 'read', target: 'a.ts' }, { activity: 'search', target: '“x”' }])).toBe('Lendo e buscando')
    expect(runningWord([{ activity: 'read', target: 'a.ts' }, { activity: 'read', target: 'b.ts' }, { activity: 'test', target: null }])).toBe('Lendo e rodando os testes')
    expect(runningWord([{ activity: 'read', target: 'a' }, { activity: 'search', target: 'b' }, { activity: 'web', target: 'c' }])).toBe('Executando 3 ferramentas')
    expect(runningWord([{ activity: 'other', target: null }])).toBe('Executando')
    expect(runningWord([{ activity: 'skill', target: 'superpowers:brainstorming' }])).toBe('Carregando a skill superpowers:brainstorming')
    expect(runningWord([{ activity: 'plan', target: null }])).toBe('Atualizando o plano')
    expect(runningWord([{ activity: 'other', target: 'rea: open_binary' }])).toBe('Executando rea: open_binary')
  })

  test('while a call runs the spinner names it, and goes back after', async ($, on) => {
    mock.store(on, PT)
    let release = () => {}
    const held = new Promise<void>(resolve => (release = resolve))
    on('tool.call', async () => {
      await held
      return { result: BASH_OK('===== 12 passed in 0.50s =====') }
    })
    let word = ''
    on('ui.render', { component: 'Spinner' }, ($, e) => {
      word = e.props.word
      const { Text } = $.ui.resolve(e)
      return <Text>engine</Text>
    })
    const spinning = { word: 'Sauteing', suffix: '…', mode: 'tool-use' as const, message: null }
    const ui = await $.ui.mount({ plugin: 'realce', surface: 'terminal', component: 'Spinner', props: spinning })
    expect(word).toBe('Executando')
    const call = $.tool.call({ tool: 'Bash', command: 'npm test' })
    await ui.redraw(spinning)
    expect(word).toBe('Rodando os testes')
    release()
    await call
    await ui.redraw(spinning)
    expect(word).toBe('Executando')
  })

  test('the same tests make the same key, whatever wraps or redirects them', () => {
    for (const command of ['npm test', 'npm test > out.log', 'npm test >out.log 2>&1', 'npm test 2>/dev/null', 'npm test < /dev/null', 'timeout 120 npm test', 'CI=1 npm test', 'cd app && npm test | tail -3'])
      expect([command, testKey(command)]).toEqual([command, 'npm test'])
    expect(testKey('pytest -q tests/other')).toBe('pytest -q tests/other')
    expect(testKey('ls')).toBeNull()
  })

  test('a test run says how long the same command took last time', async ($, on) => {
    mock.store(on, PT)
    mock.clock(on)
    // The first call settles at once; each later one waits for its own release.
    let calls = 0
    const releases: (() => void)[] = []
    on('tool.call', async () => {
      if (calls++ > 0) await new Promise<void>(resolve => releases.push(resolve))
      return { result: BASH_OK('===== 12 passed in 6.20s =====') }
    })
    const release = () => releases.shift()?.()
    let word = ''
    on('ui.render', { component: 'Spinner' }, ($, e) => {
      word = e.props.word
      const { Text } = $.ui.resolve(e)
      return <Text>engine</Text>
    })
    const spinning = { word: 'Sauteing', suffix: '…', mode: 'tool-use' as const, message: null }
    const ui = await $.ui.mount({ plugin: 'realce', surface: 'terminal', component: 'Spinner', props: spinning })
    await $.tool.call({ tool: 'Bash', command: 'pytest -q' })
    const again = $.tool.call({ tool: 'Bash', command: 'pytest -q' })
    await ui.redraw(spinning)
    expect(word).toBe('Rodando os testes (última: 6,2s)')
    release()
    await again
    // The same run behind another output filter is the same run.
    const filtered = $.tool.call({ tool: 'Bash', command: 'cd . && pytest -q 2>&1 | tail -3' })
    await ui.redraw(spinning)
    expect(word).toBe('Rodando os testes (última: 6,2s)')
    release()
    await filtered
    const other = $.tool.call({ tool: 'Bash', command: 'pytest -q tests/other' })
    await ui.redraw(spinning)
    expect(word).toBe('Rodando os testes')
    release()
    await other
  })

  test('a call whose end never came is dropped when the turn ends', async ($, on) => {
    // A reload cancels the old module's pending work: its finally never runs, and the entry would outlive the turn.
    mock.store(on, PT)
    on('tool.call', () => new Promise(() => {}))
    on('turn.complete', () => ({ text: '' }))
    let word = ''
    on('ui.render', { component: 'Spinner' }, ($, e) => {
      word = e.props.word
      const { Text } = $.ui.resolve(e)
      return <Text>engine</Text>
    })
    const spinning = { word: 'Sauteing', suffix: '…', mode: 'tool-use' as const, message: null }
    const ui = await $.ui.mount({ plugin: 'realce', surface: 'terminal', component: 'Spinner', props: spinning })
    void $.tool.call({ tool: 'Read', file_path: '/a/b/x.ts' })
    await ui.redraw(spinning)
    expect(word).toBe('Lendo x.ts')
    await $.turn.complete({ answer: 'ok', isAborted: false, turnId: 't1', reason: 'answer', durationMs: 1_000 })
    await ui.redraw(spinning)
    expect(word).toBe('Executando')
  })

  test('a subagent\'s call leaves the spinner word alone', async ($, on) => {
    mock.store(on, PT)
    let release = () => {}
    const held = new Promise<void>(resolve => (release = resolve))
    on('tool.call', async () => {
      await held
      return { result: BASH_OK('ok') }
    })
    let word = ''
    on('ui.render', { component: 'Spinner' }, ($, e) => {
      word = e.props.word
      const { Text } = $.ui.resolve(e)
      return <Text>engine</Text>
    })
    const spinning = { word: 'Sauteing', suffix: '…', mode: 'tool-use' as const, message: null }
    const ui = await $.ui.mount({ plugin: 'realce', surface: 'terminal', component: 'Spinner', props: spinning })
    const call = $.tool.call(inSubagent({ tool: 'Bash', command: 'npm test' }))
    await ui.redraw(spinning)
    expect(word).toBe('Executando')
    release()
    await call
  })
})
