import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { diffLines } from '../hooks/screen/diff'
import { wordDiff } from '../hooks/screen/wordDiff'

const changed = (pieces: readonly { text: string; isChanged: boolean }[]) => pieces.filter(p => p.isChanged).map(p => p.text)

// Stands for the engine's own drawing of the result beneath the plugin.
function engineResult(on: On): void {
  on('ui.render', { component: 'ToolResult' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
}

const editOutput = (lines: readonly string[], newStart = 12) => ({
  filePath: '/a/b/x.ts',
  oldString: 'x',
  newString: 'y',
  originalFile: '',
  structuredPatch: [{ oldStart: newStart - 2, oldLines: lines.length, newStart, newLines: lines.length, lines }],
  userModified: false,
  replaceAll: false,
})

function mountResult($: Engine, tool: string, output: unknown, isErrored = false, id = 'toolu_1') {
  return $.ui.mount({
    plugin: 'realce',
    surface: 'terminal',
    component: 'ToolResult',
    requestId: id,
    props: { tool_use_id: id, tool, output, isErrored },
    viewport: { columns: 100, rows: 40 },
  })
}

describe('word diff', () => {
  test('only the words that changed are marked', () => {
    const d = wordDiff('const a = 1', 'const a = 2')
    expect(d).not.toBeNull()
    expect(changed(d!.removed)).toEqual(['1'])
    expect(changed(d!.added)).toEqual(['2'])
  })

  test('a very long line is not diffed word by word', () => {
    expect(wordDiff('x'.repeat(600), 'y'.repeat(600))).toBeNull()
  })
})

describe('diff lines', () => {
  test('a hunk becomes numbered lines with its removed and added pair', () => {
    const lines = diffLines([{ oldStart: 10, oldLines: 3, newStart: 12, newLines: 3, lines: [' a', '-b', '+c', ' d'] }])
    expect(lines.map(l => l.kind)).toEqual(['hunk', 'ctx', 'del', 'add', 'ctx'])
    expect(lines[0]!.text).toBe('@@ linha 12')
    expect(lines.map(l => l.lineNo)).toEqual([null, 12, null, 13, 14])
    expect(lines[2]!.pair).toBe('c')
    expect(lines[3]!.pair).toBe('b')
  })
})

describe('readable diff', () => {
  test('an Edit result draws the readable diff', async ($, on) => {
    mock.store(on)
    engineResult(on)
    const ui = await mountResult($, 'Edit', editOutput([' const a = 0', '-const b = 1', '+const b = 2']))
    expect(await ui.find({ text: '@@ linha 12' })).toBeDefined()
    const word = (await ui.findAll({ type: 'Text', text: '2' })).find(el => el.text === '2')
    expect(word?.props.backgroundColor).toBe('diffAddedWord')
    // On the theme's word background the theme's own text color reads; the line's green on green would not.
    expect(word?.props.color).toBe('text')
    expect(await ui.find({ text: 'engine' })).toBeUndefined()
  })

  test('a 40-line diff folds and opens', async ($, on) => {
    mock.store(on)
    engineResult(on)
    const ui = await mountResult($, 'Edit', editOutput(Array.from({ length: 40 }, (_, i) => `+linha ${i}`)))
    expect(await ui.find({ text: 'linha 7' })).toBeDefined()
    expect(await ui.find({ text: 'linha 8' })).toBeUndefined()
    expect(await ui.find({ key: 'diff-fold' })).toBeDefined()
    expect((await ui.find({ key: 'diff-fold' }))?.text).toBe('▸ Mostrar mais (32 linhas)')
    await ui.press({ key: 'diff-fold' })
    expect(await ui.find({ text: 'linha 39' })).toBeDefined()
  })

  test('a 2000-line diff draws folded and fast', async ($, on) => {
    mock.store(on)
    engineResult(on)
    const lines = Array.from({ length: 2000 }, (_, i) => (i % 2 === 0 ? `-velho ${i} com várias palavras aqui` : `+novo ${i} com várias palavras ali`))
    // The kit's mount has its own cost: the diff's is what a 2000-line patch takes over a one-line one.
    const t0 = performance.now()
    await mountResult($, 'Edit', editOutput(['-a', '+b']), false, 'toolu_small')
    const small = performance.now() - t0
    const t1 = performance.now()
    const ui = await mountResult($, 'Edit', editOutput(lines))
    const big = performance.now() - t1
    expect(big - small).toBeLessThan(50)
    expect(await ui.find({ key: 'diff-fold' })).toBeDefined()
  })

  test('an open 2000-line diff shows its first 400 lines and says how many more', async ($, on) => {
    mock.store(on)
    engineResult(on)
    const ui = await mountResult($, 'Edit', editOutput(Array.from({ length: 2000 }, (_, i) => `+linha ${i}`)))
    await ui.press({ key: 'diff-fold' })
    expect(await ui.find({ text: 'linha 399' })).toBeDefined()
    expect(await ui.find({ text: 'linha 400' })).toBeUndefined()
    expect(await ui.find({ text: '… e mais 1600 linhas: abra o arquivo para ver tudo' })).toBeDefined()
    expect((await ui.find({ key: 'diff-fold' }))?.text).toBe('▾ Recolher')
  })

  test('a new file shows its head and its size', async ($, on) => {
    mock.store(on)
    engineResult(on)
    const content = Array.from({ length: 30 }, (_, i) => `linha ${i}`).join('\n')
    const ui = await mountResult($, 'Write', { type: 'create', filePath: '/a/b/novo.ts', content, structuredPatch: [] })
    expect(await ui.find({ text: 'linha 7' })).toBeDefined()
    expect(await ui.find({ text: 'linha 8' })).toBeUndefined()
    expect(await ui.find({ text: '30 linhas no arquivo novo' })).toBeDefined()
  })

  test("diff off or an errored result is the engine's", async ($, on) => {
    mock.store(on, { flags: { diff: false } })
    engineResult(on)
    expect(await (await mountResult($, 'Edit', editOutput(['+a']))).find({ text: 'engine' })).toBeDefined()
  })

  test("an errored result is the engine's", async ($, on) => {
    mock.store(on)
    engineResult(on)
    expect(await (await mountResult($, 'Edit', 'File has not been read yet', true)).find({ text: 'engine' })).toBeDefined()
  })
})
