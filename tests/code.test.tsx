import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On, ProcessRunResult } from 'claude-code'

import { hashSource, imageCells, pngSize } from '../hooks/code/diagram'
import { highlight } from '../hooks/code/highlight'
import { pathHref } from '../hooks/code/links'
import { MERMAID as MERMAID_PALETTE } from '../hooks/palette'
import { PT } from './lang'

describe('code', () => {
  const kinds = (src: string, lang: string) => highlight(src, lang).flat().filter(t => t.kind).map(t => [t.text, t.kind])

  test('typescript', () => {
    const k = kinds('const x: Foo = load("a") // hi', 'ts')
    expect(k).toContainEqual(['const', 'keyword'])
    expect(k).toContainEqual(['Foo', 'type'])
    expect(k).toContainEqual(['load', 'function'])
    expect(k).toContainEqual(['"a"', 'string'])
    expect(k).toContainEqual(['// hi', 'comment'])
  })

  test('shell', () => {
    const k = kinds('git log --oneline | grep "$USER" # x', 'sh')
    expect(k).toContainEqual(['git', 'function'])
    expect(k).toContainEqual(['--oneline', 'flag'])
    expect(k).toContainEqual(['grep', 'function'])
    expect(k).toContainEqual(['# x', 'comment'])
  })

  test('json keys, python strings, diff lines', () => {
    expect(kinds('{"a": true}', 'json')).toContainEqual(['"a"', 'key'])
    expect(kinds('def f():\n    """doc\n    more"""', 'py')).toContainEqual(['"""doc', 'string'])
    expect(kinds('@@ -1 +1 @@\n-a\n+b', 'diff').map(t => t[1])).toEqual(['hunk', 'removed', 'added'])
  })
})

describe('links', () => {
  const env = { cwd: '/a/b', home: '/Users/u' }

  test('relative paths open in the editor at the line', () => {
    expect(pathHref('hooks/x.ts:12', { ...env, editor: 'cursor' })).toBe('cursor://file/a/b/hooks/x.ts:12')
  })

  test('columns, home, parent folders and other editors', () => {
    expect(pathHref('src/x.ts:12:4', { ...env, editor: 'vscode' })).toBe('vscode://file/a/b/src/x.ts:12:4')
    expect(pathHref('~/m/x.md', { ...env, editor: 'file' })).toBe('file:///Users/u/m/x.md')
    expect(pathHref('/abs/x.ts', { ...env, editor: 'zed' })).toBe('zed://file/abs/x.ts')
    expect(pathHref('../c/./d.ts', { ...env, editor: 'cursor' })).toBe('cursor://file/a/c/d.ts')
    expect(pathHref('docs/ação 1.md', { ...env, editor: 'file' })).toBe('file:///a/b/docs/a%C3%A7%C3%A3o%201.md')
  })

  test('a path in a reply is a link to the editor', async ($, on) => {
    mock.store(on, PT)
    const session = sessionWorld(on, {})
    await startSession($)
    const ui = await mountReply($, 'Mudei hooks/x.ts:12 hoje.')
    expect(session.runs).toEqual([])
    expect((await ui.find({ type: 'Link' }))?.props).toMatchObject({ href: 'cursor://file/a/b/hooks/x.ts:12' })
  })

  test('caminhos off draws no link', async ($, on) => {
    mock.store(on, { ...PT, flags: { caminhos: false } })
    sessionWorld(on, {})
    await startSession($)
    const ui = await mountReply($, 'Mudei hooks/x.ts:12 hoje.')
    expect(await ui.find({ type: 'Link' })).toBeUndefined()
  })

  test('a # or ? in a path stays part of it, in an editor link as in a file one', () => {
    expect(pathHref('C# notas/a?.ts:3', { ...env, editor: 'cursor' })).toBe('cursor://file/a/b/C%23%20notas/a%3F.ts:3')
    expect(pathHref('C# notas/a?.ts', { ...env, editor: 'file' })).toBe('file:///a/b/C%23%20notas/a%3F.ts')
  })
})

const numbered = (count: number) => Array.from({ length: count }, (_, n) => `const line${n + 1} = ${n + 1}`).join('\n')

describe('copy and fold', () => {
  test('a long reply can be copied whole, its marks as plain markdown', async ($, on) => {
    mock.store(on, PT)
    const copied: string[] = []
    on('ui.copy', ($, e) => {
      copied.push(e.text)
      return { value: { isCopied: true as const } }
    })
    on('ui.toast', () => ({ value: undefined }))
    const text = ['Um {+bom+} resultado.', ...Array.from({ length: 16 }, (_, i) => `- item ${i}`)].join('\n')
    const ui = await mountReply($, text)
    expect((await ui.find({ key: 'copy-reply' }))?.text).toBe('Copiar resposta')
    await ui.press({ key: 'copy-reply' })
    expect(copied[0]).toBe(['Um **bom** resultado.', ...Array.from({ length: 16 }, (_, i) => `- item ${i}`)].join('\n'))
    expect(await (await mountReply($, 'curta', 120, 'r2')).find({ key: 'copy-reply' })).toBeUndefined()
  })

  test('copy puts the block source on the clipboard', async ($, on) => {
    mock.store(on, PT)
    const copied: string[] = []
    const toasts: string[] = []
    on('ui.copy', ($, e) => {
      copied.push(e.text)
      return { value: { isCopied: true as const } }
    })
    on('ui.toast', ($, e) => {
      toasts.push(e.text)
      return { value: undefined }
    })
    const ui = await mountReply($, '```ts\nconst a = 1\n```\n\n```sh\nls -la\n```')
    expect((await ui.find({ key: 'copy-0' }))?.text).toBe('Copiar')
    await ui.press({ key: 'copy-1' })
    expect(copied).toEqual(['ls -la'])
    expect(toasts).toEqual(['Copiado.'])
  })

  test('the header names the language beside the copy button', async ($, on) => {
    mock.store(on, PT)
    const ui = await mountReply($, '```ts\nconst a = 1\n```')
    const label = (await ui.findAll({ type: 'Text', text: 'ts' })).find(el => el.text === 'ts')
    expect(label?.props).toMatchObject({ color: '#6E6A86' })
    expect(await ui.find({ key: 'fold-0' })).toBeUndefined()
  })

  test('a 40-line block shows 8 lines and opens', async ($, on) => {
    mock.store(on, PT)
    const ui = await mountReply($, '```ts\n' + numbered(40) + '\n```')
    expect((await ui.find({ key: 'fold-0' }))?.text).toBe('▸ Mostrar mais 32 linhas')
    expect(await ui.find({ text: 'line8' })).toBeDefined()
    expect(await ui.find({ text: 'line9' })).toBeUndefined()
    await ui.press({ key: 'fold-0' })
    expect((await ui.find({ key: 'fold-0' }))?.text).toBe('▾ Recolher')
    expect(await ui.find({ text: 'line40' })).toBeDefined()
    await ui.press({ key: 'fold-0' })
    expect(await ui.find({ text: 'line9' })).toBeUndefined()
  })

  test('a 25-line block stays whole', async ($, on) => {
    mock.store(on, PT)
    const ui = await mountReply($, '```ts\n' + numbered(25) + '\n```')
    expect(await ui.find({ key: 'fold-0' })).toBeUndefined()
    expect(await ui.find({ text: 'line25' })).toBeDefined()
  })

  test('a 2000-line block draws folded and fast', async ($, on) => {
    mock.store(on, PT)
    // The kit's mount has its own cost, which a loaded machine stretches: the block's is the long one over a short one.
    const t0 = performance.now()
    await $.ui.mount({ plugin: 'realce', surface: 'terminal', component: 'AssistantMessage', requestId: 'short', props: { text: '```ts\n' + numbered(30) + '\n```', isFirstOfReply: true }, viewport: { columns: 120, rows: 40 } })
    const short = performance.now() - t0
    const started = performance.now()
    const ui = await mountReply($, '```ts\n' + numbered(2000) + '\n```')
    const took = performance.now() - started - short
    expect((await ui.find({ key: 'fold-0' }))?.text).toBe('▸ Mostrar mais 1992 linhas')
    expect(await ui.find({ text: 'line9 ' })).toBeUndefined()
    expect(took).toBeLessThan(100)
  })

  test('the engine highlighter keeps the header and the fold', async ($, on) => {
    mock.store(on, { ...PT, flags: { highlight: false } })
    const ui = await mountReply($, '```ts\n' + numbered(30) + '\n```')
    const code = await ui.find({ type: 'Code' })
    expect(code?.props).toMatchObject({ language: 'ts', source: numbered(8) })
    expect(await ui.find({ key: 'copy-0' })).toBeDefined()
    await ui.press({ key: 'fold-0' })
    expect((await ui.find({ type: 'Code' }))?.props).toMatchObject({ source: numbered(30) })
  })

  test('a language without a grammar folds through the engine highlighter', async ($, on) => {
    mock.store(on, PT)
    const ui = await mountReply($, '```elixir\n' + numbered(30) + '\n```')
    expect((await ui.find({ type: 'Code' }))?.props).toMatchObject({ language: 'elixir', source: numbered(8) })
    expect((await ui.find({ key: 'fold-0' }))?.text).toBe('▸ Mostrar mais 22 linhas')
  })

  test('copiar and dobrar off draw no controls', async ($, on) => {
    mock.store(on, { ...PT, flags: { copiar: false, dobrar: false } })
    const ui = await mountReply($, '```ts\n' + numbered(40) + '\n```')
    expect(await ui.findAll({ type: 'Button' })).toEqual([])
    expect(await ui.find({ text: 'line40' })).toBeDefined()
  })

  test('with every code aid off the block is the engine Code alone', async ($, on) => {
    mock.store(on, { ...PT, flags: { copiar: false, dobrar: false, highlight: false } })
    const ui = await mountReply($, '```\n' + numbered(40) + '\n```')
    const code = await ui.find({ type: 'Code' })
    expect(code?.props).toEqual({ source: numbered(40) })
    expect(await ui.findAll({ type: 'Button' })).toEqual([])
  })
})

// A whole 1×1 PNG, and the first 33 bytes of a 720×724 one (signature and IHDR are all pngSize reads).
const ONE_PIXEL_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII='
const FLOWCHART_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAtAAAALUCAYAAAAixgWK'

const MMDC = '/opt/homebrew/bin/mmdc'
const DIR = '/Users/u/.cache/realce/diagrams'
const MERMAID = 'graph TD\n  A-->B'
const DIAGRAM_REPLY = `Fluxo:\n\n\`\`\`mermaid\n${MERMAID}\n\`\`\``

type World = { mmdc?: string | null; mmdcResult?: Partial<ProcessRunResult>; mmdcThrows?: string; existing?: readonly string[]; png?: string; transcript?: readonly string[] }

/** Stands for the machine beneath the plugin: Cursor installed, a UTC−3 clock, mmdc where `which` finds it. */
function sessionWorld(on: On, world: World) {
  const runs: string[][] = []
  const writes: Record<string, string> = {}
  const reads: string[] = []
  const logs: string[] = []
  const mmdc = world.mmdc === undefined ? MMDC : world.mmdc
  mock.env(on, { HOME: '/Users/u' })
  on('fs.exists', ($, e) => ({ value: e.path === '/Applications/Cursor.app' || (world.existing ?? []).includes(e.path) }))
  on('fs.write', ($, e) => {
    writes[e.path] = e.text
    return { value: undefined }
  })
  on('fs.read', ($, e) => {
    reads.push(e.path)
    return { value: { base64: world.png ?? FLOWCHART_PNG } }
  })
  on('process.run', ($, e) => {
    const done = { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false }
    if (e.argv[0] === 'date') return { value: { ...done, stdout: '-0300\n' } }
    if (e.argv[0] === 'which') return { value: mmdc === null ? { ...done, exitCode: 1 } : { ...done, stdout: `${mmdc}\n` } }
    // The session start's sweep of old perf files.
    if (e.argv[0] === 'find') return { value: done }
    runs.push([...e.argv])
    if (world.mmdcThrows !== undefined) return { deny: world.mmdcThrows }
    return { value: { ...done, ...world.mmdcResult } }
  })
  // The replies already in the transcript when the session starts, as $.session.messages() answers them.
  on('session.messages', () => ({ value: (world.transcript ?? []).map(text => ({ role: 'assistant' as const, text, toolUses: [] })) }))
  on('ui.invalidate', () => ({ value: undefined }))
  // The session pane opens at start by default.
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('config.list', () => ({ value: [] }))
  on('session.start', () => ({ cwd: '/a/b' }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('ui.log', ($, e) => {
    logs.push(e.text)
    return { value: undefined }
  })
  return { runs, writes, reads, logs }
}

async function startSession($: Engine): Promise<void> {
  await $.session.start({ cwd: '/a/b', surface: 'terminal', isInteractive: true })
}

async function appendReply($: Engine, text: string, type: 'assistant' | 'user' = 'assistant'): Promise<void> {
  await $.session.append({
    message: { type, role: type, content: [{ type: 'text', text }] },
    door: type === 'assistant' ? 'response' : 'prompt',
    origin: type === 'assistant' ? { kind: 'model', model: 'm' } : { kind: 'composer' },
    uuid: `row-${text.length}`,
  })
}

async function mountReply($: Engine, text: string, columns = 120, requestId?: string) {
  return $.ui.mount({ plugin: 'realce', surface: 'terminal', component: 'AssistantMessage', ...(requestId === undefined ? {} : { requestId }), props: { text, isFirstOfReply: true }, viewport: { columns, rows: 40 } })
}

describe('diagram sizes', () => {
  test('the PNG header gives the size', () => {
    expect(pngSize(ONE_PIXEL_PNG)).toEqual({ width: 1, height: 1 })
    expect(pngSize(FLOWCHART_PNG)).toEqual({ width: 720, height: 724 })
    expect(pngSize('R0lGODlhAQABAAAAACw=')).toBeNull()
    expect(pngSize('')).toBeNull()
  })

  test('cells keep the picture proportion', () => {
    expect(imageCells({ width: 720, height: 724 }, 116)).toEqual({ columns: 36, rows: 17 })
    expect(imageCells({ width: 1600, height: 800 }, 116)).toEqual({ columns: 80, rows: 19 })
    expect(imageCells({ width: 4000, height: 1000 }, 50)).toEqual({ columns: 50, rows: 6 })
    expect(imageCells({ width: 400, height: 2000 }, 116)).toEqual({ columns: 17, rows: 40 })
    expect(imageCells({ width: 3000, height: 10 }, 116)).toEqual({ columns: 100, rows: 1 })
  })

  test('a source hashes to a stable name', () => {
    expect(hashSource(MERMAID)).toBe(hashSource(MERMAID))
    expect(hashSource(MERMAID)).toMatch(/^[0-9a-f]{8}-16$/)
    expect(hashSource(MERMAID)).not.toBe(hashSource('graph TD\n  A-->C'))
  })
})

describe('diagram generation', () => {
  test('generation writes, runs mmdc and reads the size', async ($, on) => {
    mock.store(on, PT)
    const clock = mock.clock(on)
    const world = sessionWorld(on, {})
    const hash = hashSource(MERMAID)
    await startSession($)
    await appendReply($, DIAGRAM_REPLY)
    await clock.settle()
    expect(world.writes[`${DIR}/${hash}.mmd`]).toBe(MERMAID)
    expect(JSON.parse(world.writes[`${DIR}/mermaid-dark.json`] ?? '')).toEqual(MERMAID_PALETTE.config)
    expect(world.runs).toEqual([
      [MMDC, '-i', `${DIR}/${hash}.mmd`, '-o', `${DIR}/${hash}.png`, '-c', `${DIR}/mermaid-dark.json`, '-b', '#111111', '-s', '2', '-q'],
    ])
    // The update check reads plugin.json at start too; the diagram reads only its picture.
    expect(world.reads.filter(r => r.startsWith(DIR))).toEqual([`${DIR}/${hash}.png`])
  })

  test('an existing picture is ready without running mmdc', async ($, on) => {
    mock.store(on, PT)
    const clock = mock.clock(on)
    const world = sessionWorld(on, { existing: [`${DIR}/${hashSource(MERMAID)}.png`] })
    await startSession($)
    await appendReply($, DIAGRAM_REPLY)
    await clock.settle()
    expect(world.runs).toEqual([])
    expect((await (await mountReply($, DIAGRAM_REPLY)).find({ type: 'Image' }))?.props).toMatchObject({ columns: 36, rows: 17 })
  })

  test('a picture that is no PNG is failed', async ($, on) => {
    mock.store(on, PT)
    const clock = mock.clock(on)
    sessionWorld(on, { png: 'R0lGODlhAQABAAAAACw=' })
    await startSession($)
    await appendReply($, DIAGRAM_REPLY)
    await clock.settle()
    expect(await (await mountReply($, DIAGRAM_REPLY)).find({ text: 'Diagrama inválido: O mmdc não gerou um PNG legível.' })).toBeDefined()
  })

  test('mmdc that cannot start is failed with the reason', async ($, on) => {
    mock.store(on, PT)
    const clock = mock.clock(on)
    sessionWorld(on, { mmdcThrows: 'spawn mmdc ENOENT' })
    await startSession($)
    await appendReply($, DIAGRAM_REPLY)
    await clock.settle()
    expect(await (await mountReply($, DIAGRAM_REPLY)).find({ text: /^Diagrama inválido: .*spawn mmdc ENOENT/ })).toBeDefined()
  })
})

describe('diagram drawing', () => {
  test('an appended reply renders its diagram', async ($, on) => {
    mock.store(on, PT)
    const clock = mock.clock(on)
    const world = sessionWorld(on, {})
    await startSession($)
    await appendReply($, DIAGRAM_REPLY)
    const ui = await mountReply($, DIAGRAM_REPLY)
    // The append only marks it; mmdc runs once the dispatch is done.
    expect(world.runs).toEqual([])
    expect(await ui.find({ text: 'Gerando diagrama…' })).toBeDefined()
    expect(await ui.find({ type: 'Code' })).toBeDefined()
    await clock.settle()
    expect(world.runs).toHaveLength(1)
    const image = await ui.find({ type: 'Image' })
    expect(image?.props).toMatchObject({ source: { file: `${DIR}/${hashSource(MERMAID)}.png`, format: 'png' }, alt: 'Diagrama', columns: 36, rows: 17 })
    expect(await ui.find({ type: 'Code' })).toBeUndefined()
    // The same diagram again is not run twice.
    await appendReply($, DIAGRAM_REPLY + '\n')
    await clock.settle()
    expect(world.runs).toHaveLength(1)
    expect(world.logs).toEqual([])
    // A narrow pane takes the picture down with it, in proportion.
    expect((await (await mountReply($, DIAGRAM_REPLY, 30)).find({ type: 'Image' }))?.props).toMatchObject({ columns: 28, rows: 13 })
  })

  test('a rejected diagram shows its code and the error', async ($, on) => {
    mock.store(on, PT)
    const clock = mock.clock(on)
    sessionWorld(on, { mmdcResult: { exitCode: 1, stderr: '\nError: Parse error on line 2:\ngraph TD  A-->\n    at #evaluate (file:///x.js:1:1)\n' } })
    await startSession($)
    await appendReply($, DIAGRAM_REPLY)
    await clock.settle()
    const ui = await mountReply($, DIAGRAM_REPLY)
    expect(await ui.find({ text: 'Diagrama inválido: Parse error on line 2:' })).toBeDefined()
    expect((await ui.find({ type: 'Code' }))?.props).toMatchObject({ source: MERMAID, language: 'mermaid' })
  })

  test('a reply still being written shows its code until it is stored', async ($, on) => {
    mock.store(on, PT)
    sessionWorld(on, {})
    await startSession($)
    const ui = await mountReply($, DIAGRAM_REPLY)
    expect(await ui.find({ text: 'O diagrama aparece quando a resposta terminar' })).toBeDefined()
    expect(await ui.find({ type: 'Code' })).toBeDefined()
  })

  test('a reply already in the transcript gets its diagram when the session starts', async ($, on) => {
    mock.store(on, PT)
    const clock = mock.clock(on)
    const world = sessionWorld(on, { transcript: ['Sem diagrama.', DIAGRAM_REPLY] })
    await startSession($)
    await clock.settle()
    expect(world.runs).toHaveLength(1)
    expect((await (await mountReply($, DIAGRAM_REPLY)).find({ type: 'Image' }))?.props).toMatchObject({ alt: 'Diagrama' })
  })

  test('user rows are not diagrams', async ($, on) => {
    mock.store(on, PT)
    const clock = mock.clock(on)
    const world = sessionWorld(on, {})
    await startSession($)
    await appendReply($, DIAGRAM_REPLY, 'user')
    await clock.settle()
    expect(world.runs).toEqual([])
  })

  test('diagramas off draws the code block and generates nothing', async ($, on) => {
    mock.store(on, { ...PT, flags: { diagramas: false } })
    const clock = mock.clock(on)
    const world = sessionWorld(on, {})
    await startSession($)
    await appendReply($, DIAGRAM_REPLY)
    await clock.settle()
    const ui = await mountReply($, DIAGRAM_REPLY)
    expect(world.runs).toEqual([])
    expect(await ui.find({ type: 'Code' })).toBeDefined()
    expect(await ui.find({ text: /Diagrama/ })).toBeUndefined()
  })

  test('without mmdc the block is plain code', async ($, on) => {
    mock.store(on, PT)
    const clock = mock.clock(on)
    const world = sessionWorld(on, { mmdc: null })
    await startSession($)
    await appendReply($, DIAGRAM_REPLY)
    await clock.settle()
    const ui = await mountReply($, DIAGRAM_REPLY)
    expect(world.runs).toEqual([])
    expect(await ui.find({ text: /Diagrama/ })).toBeUndefined()
  })
})
