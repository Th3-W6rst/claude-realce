import { describe, expect, mock, test, type Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { calloutKind, parseBlocks } from '../hooks/text/blocks'
import { parseNumber, scanDeltas } from '../hooks/text/deltas'
import { humanizeAmount } from '../hooks/format'
import { parseInline, toPlainMarkdown } from '../hooks/text/inline'
import { cellWidth } from '../hooks/fit'
import { fitColumns, isNumericColumn, parseTable } from '../hooks/text/table'
import { PT } from './lang'

const kindsOf = (line: string) => parseInline(line).map(s => [s.text, s.kinds.join('+')])

/** The deltas a text holds, without where each starts. */
const findDeltas = (text: string) => scanDeltas(text).map(({ start: _, ...d }) => d)

describe('inline', () => {
  test('a leading bold is a label and takes its colon', () => {
    expect(kindsOf('**O conserto:** agora confere')[0]).toEqual(['O conserto:', 'label'])
    expect(kindsOf('**Conferência**: medi de novo')).toEqual([['Conferência:', 'label'], [' medi de novo', '']])
  })

  test('a bold mid-sentence is a key term, not a label', () => {
    expect(kindsOf('te peço **um GO** só')).toContainEqual(['um GO', 'strong'])
  })

  test('typed emphasis paints by kind', () => {
    const k = kindsOf('testes {+passam+}, {-dois quebraram-}, {!falta o GO!} e ==106 de 106==')
    expect(k).toContainEqual(['passam', 'good'])
    expect(k).toContainEqual(['dois quebraram', 'bad'])
    expect(k).toContainEqual(['falta o GO', 'warn'])
    expect(k).toContainEqual(['106 de 106', 'highlight'])
  })

  test('bare prose gets numbers, paths, quotes and status words', () => {
    const k = kindsOf('de 87 para 106 em src/app/main.ts:12, "42 - CAIXA" passam e falta o GO')
    expect(k).toContainEqual(['87', 'number'])
    expect(k).toContainEqual(['src/app/main.ts:12', 'path'])
    expect(k).toContainEqual(['"42 - CAIXA"', 'quote'])
    expect(k).toContainEqual(['passam', 'statusGood'])
    expect(k).toContainEqual(['falta', 'statusWarn'])
    expect(k).toContainEqual(['GO', 'statusWarn'])
  })

  test('prose that only looks like code stays plain', () => {
    const k = kindsOf('ele e/ou ela usam go e Opus')
    expect(k).toEqual([['ele e/ou ela usam go e Opus', '']])
  })

  test('dates and accented words keep their boundaries', () => {
    expect(kindsOf('Relatório 02-2024')).toContainEqual(['02-2024', 'number'])
    expect(kindsOf('regressão')).toEqual([['regressão', 'statusBad']])
    expect(kindsOf('regressãozinha')).toEqual([['regressãozinha', '']])
  })

  test('inline code is cyan, and a path inside it is a path too', () => {
    expect(kindsOf('rode `npm test`')).toContainEqual(['npm test', 'code'])
    expect(kindsOf('em `hooks/inline.ts`')).toContainEqual(['hooks/inline.ts', 'code+path'])
  })

  test('marks inside code are left alone', () => {
    expect(kindsOf('`{+x+}`')).toEqual([['{+x+}', 'code']])
    expect(toPlainMarkdown('a {+b+} `{-c-}`\n```\n==d==\n```')).toBe('a **b** `{-c-}`\n```\n==d==\n```')
  })
})

describe('blocks', () => {
  test('lists, nesting, tasks, fences and tables', () => {
    const blocks = parseBlocks(
      ['Intro', '', '- um', '  - dois', '- [x] três', '1. quatro', '', '```ts', 'const a = 1', '```', '| a | b |', '|---|---|', '| 1 | 2 |'].join('\n'),
    )
    expect(blocks.map(b => b.type)).toEqual(['paragraph', 'item', 'item', 'item', 'item', 'code', 'table'])
    expect(blocks[2]).toMatchObject({ depth: 1 })
    expect(blocks[3]).toMatchObject({ check: true, lines: ['três'] })
    expect(blocks[4]).toMatchObject({ isOrdered: true, marker: '1.' })
    expect(blocks[5]).toMatchObject({ language: 'ts', source: 'const a = 1' })
  })

  test('an item takes its wrapped lines; an unclosed fence runs to the end', () => {
    expect(parseBlocks('- a\n  b\nc')[0]).toMatchObject({ lines: ['a', 'b', 'c'] })
    expect(parseBlocks('```py\nx = 1')[0]).toMatchObject({ type: 'code', source: 'x = 1' })
  })
})

const REPLY = '**O conserto:** agora {+passa+}.\n\n```ts\nconst a = 1\n```'

describe('reply', () => {
  test('the terminal draws the reply colored by kind', async ($, on) => {
    mock.store(on, PT)
    const ui = await $.ui.mount({ plugin: 'realce', surface: 'terminal', component: 'AssistantMessage', props: { text: REPLY, isFirstOfReply: true } })
    // `find` matches by inclusion, outermost first: the span is the Text holding exactly that run.
    const paintOf = async (text: string) => (await ui.findAll({ type: 'Text', text })).find(el => el.text === text)?.props
    expect(await paintOf('O conserto:')).toMatchObject({ color: '#FF3D45' })
    expect(await paintOf('passa')).toMatchObject({ color: '#00FF41' })
    expect(await paintOf('const')).toMatchObject({ color: '#E06AA0' })
  })

  test('other surfaces get the marks as plain bold', async ($, on) => {
    mock.store(on, PT)
    let drawn = ''
    // Stands for the engine's own drawing, which reads the text the plugin handed down.
    on('ui.render', { component: 'AssistantMessage' }, ($, e) => {
      drawn = e.props.text
      const { Text } = $.ui.resolve(e)
      return <Text>{e.props.text}</Text>
    })
    await $.ui.mount({ plugin: 'realce', surface: 'desktop', component: 'AssistantMessage', props: { text: REPLY, isFirstOfReply: true } })
    expect(drawn).toBe('**O conserto:** agora **passa**.\n\n```ts\nconst a = 1\n```')
  })

})

type Mount = { text: string; columns?: number; flags?: Record<string, boolean>; master?: boolean }

// Draws one reply through the mod on the terminal, the engine's own drawing beneath it.
async function draw($: Engine, on: On, m: Mount) {
  mock.store(on, { ...PT, ...(m.flags ? { flags: m.flags } : {}), ...(m.master === undefined ? {} : { master: m.master }) })
  on('ui.render', { component: 'AssistantMessage' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  return $.ui.mount({
    plugin: 'realce',
    surface: 'terminal',
    component: 'AssistantMessage',
    props: { text: m.text, isFirstOfReply: true },
    viewport: { columns: m.columns ?? 140, rows: 40 },
  })
}

type Ui = Awaited<ReturnType<typeof draw>>
const exactly = async (ui: Ui, text: string) => (await ui.findAll({ type: 'Text', text })).filter(el => el.text === text)
const boxes = async (ui: Ui) => ui.findAll({ type: 'Box' })

describe('callouts', () => {
  test('a callout keeps its kind and title', () => {
    expect(parseBlocks('> [!DECISÃO] Subir os consertos?\n> Falta o GO.')[0]).toMatchObject({
      type: 'callout',
      kind: 'decision',
      title: 'Subir os consertos?',
      lines: ['Falta o GO.'],
      raw: ['[!DECISÃO] Subir os consertos?', 'Falta o GO.'],
    })
    expect(parseBlocks('> [!tip]\n> Use o painel.')[0]).toMatchObject({ type: 'callout', kind: 'tip', title: '', lines: ['Use o painel.'] })
  })

  test('tags take Portuguese and English, with or without accents, in any case', () => {
    const cases: [string, string][] = [
      ['DECISÃO', 'decision'], ['decisao', 'decision'], ['Decision', 'decision'],
      ['RISCO', 'risk'], ['risk', 'risk'], ['WARNING', 'risk'], ['caution', 'risk'],
      ['FEITO', 'done'], ['done', 'done'], ['SUCCESS', 'done'],
      ['RESUMO', 'summary'], ['summary', 'summary'], ['TLDR', 'summary'],
      ['NOTA', 'note'], ['note', 'note'], ['INFO', 'note'],
      ['DICA', 'tip'], ['tip', 'tip'],
    ]
    for (const [tag, kind] of cases) expect(calloutKind(tag)).toBe(kind)
    expect(calloutKind('FOO')).toBe(null)
  })

  test('unknown or unfinished tags stay quotes', () => {
    expect(parseBlocks('> [!FOO] x')[0]).toMatchObject({ type: 'quote', lines: ['[!FOO] x'] })
    expect(parseBlocks('> [!DECIS')[0]).toMatchObject({ type: 'quote', lines: ['[!DECIS'] })
    expect(parseBlocks('> [!')[0]).toMatchObject({ type: 'quote' })
  })

  test('a callout draws a round box in its color', async ($, on) => {
    const ui = await draw($, on, { text: '> [!DECISÃO] Subir os consertos?\n> Falta o **GO**.' })
    const box = (await boxes(ui)).find(b => b.props.borderStyle === 'round')
    expect(box?.props).toMatchObject({ borderStyle: 'round', borderColor: '#E3BC46', paddingX: 1 })
    expect((await exactly(ui, 'Decisão · Subir os consertos?'))[0]?.props).toMatchObject({ color: '#E3BC46' })
    expect((await exactly(ui, 'GO'))[0]?.props).toMatchObject({ color: '#E06AA0' })
  })

  test('a callout with no title shows its kind alone', async ($, on) => {
    const ui = await draw($, on, { text: '> [!risk]\n> Pode quebrar.' })
    expect((await exactly(ui, 'Risco'))[0]?.props).toMatchObject({ color: '#FF5C63' })
  })

  test('callouts off draw the original lines as a quote', async ($, on) => {
    const ui = await draw($, on, { text: '> [!DECISÃO] Subir os consertos?\n> Falta o GO.', flags: { callouts: false } })
    expect((await boxes(ui)).some(b => b.props.borderStyle === 'round')).toBe(false)
    expect((await ui.find({ type: 'Text', text: '[!DECISÃO] Subir os consertos?' }))).toBeDefined()
  })
})

const MIXED = 'Um parágrafo.\n\n```ts\nconst a = 1\n```\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n- item\n\n> citação\n\n---'

describe('reading column', () => {
  test('prose takes the reading width, code and tables the whole width', async ($, on) => {
    const ui = await draw($, on, { text: MIXED })
    const widths = await Promise.all([0, 1, 2, 3, 4, 5].map(async n => (await ui.find({ key: `block-${n}` }))?.props.width))
    expect(widths).toEqual([100, undefined, undefined, 100, 100, 100])
  })

  test('a narrow terminal narrows the column', async ($, on) => {
    const ui = await draw($, on, { text: MIXED, columns: 60 })
    expect((await ui.find({ key: 'block-0' }))?.props.width).toBe(58)
  })

  test('coluna off gives no width', async ($, on) => {
    const ui = await draw($, on, { text: MIXED, flags: { coluna: false } })
    expect((await ui.find({ key: 'block-0' }))?.props.width).toBeUndefined()
  })
})

const TABLE_TEXT = '| Item | Total | Status |\n|---|---|---|\n| Alpha | 426 | {+ok+} |\n| Beta | 12,5% | — |\n| Gama | 3 GB | `x` |'

describe('tables', () => {
  test('cell widths count wide glyphs twice', () => {
    expect(cellWidth('✅')).toBe(2)
    expect(cellWidth('ação')).toBe(4)
    expect(cellWidth('漢字')).toBe(4)
    expect(cellWidth('é')).toBe(1)
    expect(cellWidth('⚠️')).toBe(2)
    expect(cellWidth('✔')).toBe(1)
  })

  test('columns shrink widest first and never below min', () => {
    const w = fitColumns([10, 40, 30], 50, 2, 4)
    expect(w.reduce((a, b) => a + b, 0) + 4).toBeLessThanOrEqual(50)
    expect(w[0]).toBe(10)
    expect(fitColumns([10, 20], 40, 2, 4)).toEqual([10, 20])
    expect(fitColumns([30, 30, 30], 10, 2, 4)).toEqual([4, 4, 4])
    expect(fitColumns([2, 30], 10, 2, 4)).toEqual([2, 6])
  })

  test('a mostly numeric column is numeric', () => {
    expect(isNumericColumn(['426', '12,5%', '—', '3 GB'])).toBe(true)
    expect(isNumericColumn(['Alpha', 'Beta', '3'])).toBe(false)
    expect(isNumericColumn(['—', '-'])).toBe(false)
    expect(isNumericColumn(['+19', '−3', '1.234', 'R$ 10'])).toBe(true)
  })

  test('a table parses header, rows, alignment, escaped pipes and ragged rows', () => {
    expect(parseTable('| a | b | c |\n|:--|--:|:-:|\n| `x|y` | 2 |\n| p \\| q | 1 | 2 | 3 |')).toEqual({
      header: ['a', 'b', 'c'],
      align: ['left', 'right', 'center'],
      rows: [['`x|y`', '2', ''], ['p | q', '1', '2']],
    })
  })

  test('a table draws colored header, zebra rows and right-aligned numbers', async ($, on) => {
    const ui = await draw($, on, { text: TABLE_TEXT })
    expect((await exactly(ui, 'Item'))[0]?.props).toMatchObject({ color: '#24D3E0', underline: true })
    const rows = await Promise.all([0, 1, 2].map(n => ui.find({ key: `table-0-row-${n}` })))
    expect(rows.map(r => r?.props.backgroundColor)).toEqual([undefined, '#16161E', undefined])
    const cells = (await boxes(ui)).filter(b => b.text === '426' || b.text === 'Alpha' || b.text === 'Total')
    expect(cells.find(b => b.text === '426')?.props.justifyContent).toBe('flex-end')
    expect(cells.find(b => b.text === 'Total')?.props.justifyContent).toBe('flex-end')
    expect(cells.find(b => b.text === 'Alpha')?.props.justifyContent).toBeUndefined()
    expect((await exactly(ui, 'ok')).at(-1)?.props).toMatchObject({ color: '#00FF41' })
  })

  test('a narrow terminal keeps the table inside it', async ($, on) => {
    const wide = `| Coluna | Descrição |\n|---|---|\n| um | ${'palavra '.repeat(20).trim()} |`
    const ui = await draw($, on, { text: wide, columns: 50 })
    const row = await ui.find({ key: 'table-0-row-0' })
    expect(row?.props.width).toBeLessThanOrEqual(48)
    const cells = (await boxes(ui)).filter(b => typeof b.props.width === 'number' && b.props.marginRight !== undefined)
    expect(cells.length).toBeGreaterThan(0)
  })

  test('a header with no rule line is a paragraph', () => {
    expect(parseBlocks('| a | b |\nx').map(b => b.type)).toEqual(['paragraph'])
    expect(parseBlocks('| a | b |\n|---|-').map(b => b.type)).toEqual(['paragraph'])
  })

  test('tabelas off draws the engine Markdown', async ($, on) => {
    const ui = await draw($, on, { text: TABLE_TEXT, flags: { tabelas: false } })
    const md = await ui.find({ type: 'Markdown' })
    expect(md?.props.text).toBe(TABLE_TEXT.replace('{+ok+}', '**ok**'))
    expect(await ui.find({ key: 'table-0-row-0' })).toBeUndefined()
  })
})

describe('deltas', () => {
  test('de X para Y gains its difference', () => {
    expect(findDeltas('de 87 para 106 itens')).toEqual([{ end: 14, label: '(+19)' }])
    expect(findDeltas('De 87 a 106')).toEqual([{ end: 11, label: '(+19)' }])
  })

  test('falls, arrows and decimals', () => {
    expect(findDeltas('de 106 para 87')[0]?.label).toBe('(−19)')
    expect(findDeltas('87 ms → 106 ms')[0]).toEqual({ end: 14, label: '(+19 ms)', arrow: { start: 6, end: 7 } })
    expect(findDeltas('87 -> 106 ms')[0]).toMatchObject({ end: 12, label: '(+19 ms)', arrow: { start: 3, end: 5 } })
    expect(findDeltas('de 1,5 para 2')[0]?.label).toBe('(+0,5)')
    expect(findDeltas('de 1.5 para 2.25')[0]?.label).toBe('(+0,75)')
    expect(findDeltas('de 10% para 12,5%')[0]).toEqual({ end: 17, label: '(+2,5 p.p.)' })
    expect(findDeltas('de 2 GB para 3 GB')[0]?.label).toBe('(+1 GB)')
    expect(findDeltas('de 2 para 3 GB')[0]?.label).toBe('(+1 GB)')
    expect(findDeltas('de −3 para 5')[0]?.label).toBe('(+8)')
  })

  test('what only looks like a change has no delta', () => {
    for (const text of ['de 2 GB para 3 MB', 'de 1.234 para 1.300', 'de 87 para', 'versão 2.1.303 → 2.1.304', 'de 5 para 5', 'de 10% para 12', 'de 87 para 106x2', 'v1 → v2', 'de 3 maçãs para 5'])
      expect(findDeltas(text)).toEqual([])
    // An arrow between bare numbers maps an input to an output (seen live: "testa 4 → 8 (+4), -3 → -6 (−3)").
    for (const text of ['testa 4 → 8, -3 → -6 e 0 → 0', '87 → 106', 'f(2) -> 4'])
      expect([text, findDeltas(text)]).toEqual([text, []])
  })

  test('numbers parse with one decimal mark and never an ambiguous thousand', () => {
    expect(parseNumber('12,5%')).toEqual({ value: 12.5, decimals: 1, unit: '%' })
    expect(parseNumber('−3')).toEqual({ value: -3, decimals: 0, unit: '' })
    expect(parseNumber('3 GB')).toEqual({ value: 3, decimals: 0, unit: 'GB' })
    expect(parseNumber('1.234')).toBe(null)
    expect(parseNumber('1,234')).toBe(null)
    expect(parseNumber('2.1.303')).toBe(null)
    expect(parseNumber('abc')).toBe(null)
  })

  test('the delta is a span of its own', () => {
    expect(kindsOf('de 87 para 106')).toContainEqual([' (+19)', 'delta'])
    expect(kindsOf('de 87 para 106')).toContainEqual(['106', 'number'])
    expect(kindsOf('87 ms → 106 ms')).toContainEqual(['→', 'delta'])
    expect(kindsOf('de **87** para **106**').map(k => k[1])).not.toContain('delta')
  })

  test('a quote or a URL is never cut by a delta', () => {
    expect(kindsOf('ele disse "de 1 para 2" ontem')).toContainEqual(['"de 1 para 2"', 'quote'])
    expect(kindsOf('veja https://x.com/a/87→106 agora')).toContainEqual(['https://x.com/a/87→106', 'link'])
  })

  test('a long table draws every row', async ($, on) => {
    const rows = Array.from({ length: 200 }, (_, i) => `| item ${i} | ${i * 3} | de ${i} para ${i + 1} |`)
    const ui = await draw($, on, { text: ['| Nome | Valor | Mudança |', '|---|---|---|', ...rows].join('\n'), columns: 80 })
    expect((await ui.find({ key: 'table-0-row-199' }))?.props.backgroundColor).toBe('#16161E')
  })

  test('deltas off add nothing', async ($, on) => {
    expect(parseInline('de 87 para 106', [], true, { deltas: false }).map(s => s.text).join('')).toBe('de 87 para 106')
    const ui = await draw($, on, { text: 'de 87 para 106', flags: { deltas: false } })
    expect(await exactly(ui, ' (+19)')).toEqual([])
  })

  test('the delta draws cyan', async ($, on) => {
    const ui = await draw($, on, { text: 'de 87 para 106' })
    expect((await exactly(ui, ' (+19)'))[0]?.props).toMatchObject({ color: '#24D3E0' })
  })
})

describe('enfase off', () => {
  test('marks draw as plain bold, with no guesses and no labels', async ($, on) => {
    const ui = await draw($, on, { text: '**O conserto:** {+passa+} em 87 casos, {!falta o GO!} e ==x==', flags: { enfase: false } })
    for (const text of ['O conserto:', 'passa', 'falta o GO', 'x']) {
      const props = (await exactly(ui, text))[0]?.props
      expect(props?.bold).toBe(true)
      expect(props?.color).toBeUndefined()
    }
    expect(await exactly(ui, '87')).toEqual([])
    expect(await exactly(ui, 'GO')).toEqual([])
  })

  test('code spans keep their paint', async ($, on) => {
    const ui = await draw($, on, { text: 'rode `npm test`', flags: { enfase: false } })
    expect((await exactly(ui, 'npm test'))[0]?.props).toMatchObject({ color: '#24D3E0' })
  })
})

describe('streaming', () => {
  const FULL = [
    '## Título', '', 'de 87 para 106 e 87 ms → 106 ms.', '', '> [!DECISÃO] Subir?', '> Falta o {!GO!}.', '',
    '| a | b |', '|---|--:|', '| `x|y` | 12,5% |', '', '- [x] feito', '  - sub', '', '```ts', 'const a = 1', '```',
  ].join('\n')

  test('every prefix of a reply parses without throwing', () => {
    for (let n = 0; n <= FULL.length; n++) {
      const blocks = parseBlocks(FULL.slice(0, n))
      for (const b of blocks) {
        if (b.type === 'table') parseTable(b.text)
        const lines = b.type === 'paragraph' || b.type === 'item' || b.type === 'quote' || b.type === 'callout' ? b.lines : b.type === 'heading' ? [b.text] : []
        for (const l of lines) {
          parseInline(l)
          findDeltas(l)
        }
      }
    }
  })

  test('half a table and half a callout still draw', async ($, on) => {
    const ui = await draw($, on, { text: '> [!DECIS\n\n| a | b |\n|---|---|\n| 1 |\n| 2 | 3' })
    expect(await ui.find({ type: 'Text', text: '[!DECIS' })).toBeDefined()
    // A row with fewer cells is padded; one not closed yet is still prose.
    expect((await ui.find({ key: 'table-0-row-0' }))?.text.trim()).toBe('1')
    expect(await ui.find({ key: 'table-0-row-1' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: '| 2 | 3' })).toBeDefined()
  })
})

describe('breathing room', () => {
  const LONG = 'um item que fala bastante coisa e por isso quebra linha no terminal, passando com folga das cem colunas da coluna de leitura'
  const mountList = async ($: Engine, text: string) =>
    $.ui.mount({ plugin: 'realce', surface: 'terminal', component: 'AssistantMessage', props: { text, isFirstOfReply: true }, viewport: { columns: 118, rows: 40 } })

  test('an indented paragraph after a blank line continues its list item', () => {
    const blocks = parseBlocks('4. Próximo turno:\n   - régua\n\n   A régua deste turno sai sem números.\n5. Desligue uma flag.')
    expect(blocks.map(b => b.type)).toEqual(['item', 'item', 'paragraph', 'item'])
    expect(blocks[2]).toMatchObject({ indent: 4, hasGapBefore: true })
    expect(blocks[3]).toMatchObject({ depth: 0, marker: '5.' })
    expect(parseBlocks('- a\n\nTexto solto.')[1]).not.toHaveProperty('indent')
  })

  test('long items get a blank line between them, short ones stay compact', async ($, on) => {
    mock.store(on, PT)
    const ui = await mountList($, `- curto\n- outro curto\n- ${LONG}\n- curto de novo`)
    const gap = async (n: number) => (await ui.find({ key: `block-${n}` }))?.props.marginTop
    expect([await gap(1), await gap(2), await gap(3)]).toEqual([0, 1, 1])
  })

  test('an item never breathes before the sub-items it opens', async ($, on) => {
    mock.store(on, PT)
    const ui = await mountList($, `- ${LONG}\n  - sub-item`)
    expect((await ui.find({ key: 'block-1' }))?.props.marginTop).toBe(0)
  })

  test('respiro off keeps lists compact', async ($, on) => {
    mock.store(on, { ...PT, flags: { respiro: false } })
    const ui = await mountList($, `- ${LONG}\n- ${LONG}`)
    expect((await ui.find({ key: 'block-1' }))?.props.marginTop).toBe(0)
  })
})

describe('human numbers', () => {
  test('a raw amount gets its human reading', () => {
    expect(humanizeAmount(102_761, 'ms')).toBe('1m 42s')
    expect(humanizeAmount(12_000, 'ms')).toBe('12s')
    expect(humanizeAmount(850, 'ms')).toBeNull()
    expect(humanizeAmount(9_999, 'ms')).toBeNull()
    expect(humanizeAmount(95, 's')).toBe('1m 35s')
    expect(humanizeAmount(45, 's')).toBeNull()
    expect(humanizeAmount(15_360, 'bytes')).toBe('15 KB')
    expect(humanizeAmount(1_572_864, 'B')).toBe('1,5 MB')
    expect(humanizeAmount(73_201, 'tokens')).toBe('73,2 mil')
    expect(humanizeAmount(1_250_000, 'tokens')).toBe('1,3 mi')
    expect(humanizeAmount(9_999, 'tokens')).toBeNull()
  })

  test('the reading rides beside the number, after its unit', () => {
    const spans = parseInline('levou 102761 ms no total', [], true, { numeros: true })
    const at = spans.findIndex(s => s.kinds.includes('aside'))
    expect(spans[at]?.text).toBe(' (1m 42s)')
    expect(spans.slice(0, at).map(s => s.text).join('')).toBe('levou 102761 ms')
    expect(spans.map(s => s.text).join('')).toBe('levou 102761 ms (1m 42s) no total')
    expect(parseInline('gastou 73201 tokens', [], true, { numeros: true }).some(s => s.text === ' (73,2 mil)')).toBe(true)
    expect(parseInline('levou 102761ms', [], true, { numeros: true }).some(s => s.text === ' (1m 42s)')).toBe(true)
  })

  test('a unit written before the number reads too', () => {
    const text = (t: string) => parseInline(t, [], true, { numeros: true }).map(s => s.text).join('')
    expect(text('tokens: 73201 no total')).toBe('tokens: 73201 (73,2 mil) no total')
    expect(text('nem dado de tokens (73201).')).toBe('nem dado de tokens (73201) (73,2 mil).')
    expect(text('duração em ms: 102761')).toBe('duração em ms: 102761 (1m 42s)')
    expect(text('são 73201 linhas')).toBe('são 73201 linhas')
  })

  test('an epoch in ms is no duration', () => {
    expect(parseInline('ms 1700000000000', [], true, { numeros: true }).some(s => s.kinds.includes('aside'))).toBe(false)
    expect(parseInline('levou 1700000000000 ms', [], true, { numeros: true }).some(s => s.kinds.includes('aside'))).toBe(false)
  })

  test('a number that already says its reading gets no second one', () => {
    expect(parseInline('levou 102761 ms (1m 42s)', [], true, { numeros: true }).some(s => s.kinds.includes('aside'))).toBe(false)
  })

  test('numeros off, or a number in code, is left alone', () => {
    expect(parseInline('levou 102761 ms', [], true, { numeros: false }).some(s => s.kinds.includes('aside'))).toBe(false)
    expect(parseInline('`102761 ms`', [], true, { numeros: true }).some(s => s.kinds.includes('aside'))).toBe(false)
  })
})
