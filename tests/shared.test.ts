import { describe, expect, test } from 'claude-code/testing'

import { cellWidth, fitEnd, fitSegments, fitStart, wrapLines } from '../hooks/fit'
import { failedCount, formatClock, formatDuration, formatStamp, parseTzOffset, plural, scoreText } from '../hooks/format'
import { keepNewest, memo, memoLatest, trimOldest } from '../hooks/memo'
import { closesFence, openFence, parseBlocks } from '../hooks/text/blocks'
import { toPlainMarkdown } from '../hooks/text/inline'
import './lang'

describe('cutting to cells', () => {
  test('a cut counts the cells the terminal draws: CJK and emoji take two', () => {
    expect(cellWidth('漢字')).toBe(4)
    expect(fitEnd('漢字漢字漢字', 7)).toBe('漢字漢…')
    expect(fitEnd('abcdef', 4)).toBe('abc…')
    expect(fitEnd('abc', 3)).toBe('abc')
    expect(fitEnd('abc', 0)).toBe('')
  })

  test('the part kept before the mark loses its trailing space', () => {
    expect(fitEnd('Prosa limita a coluna', 7)).toBe('Prosa…')
  })

  test('a path cut at the start keeps its file name, in cells', () => {
    expect(fitStart('/a/b/c/notas.ts', 10)).toBe('…/notas.ts')
    expect(fitStart('/漢字/漢字/x.ts', 9)).toBe('…字/x.ts')
  })

  test('colored parts stop at the first one cut, even when a wide sign left a cell over', () => {
    const parts = fitSegments([{ text: 'ab' }, { text: '漢字', color: 'red' }, { text: 'cd' }], 5)
    expect(parts).toEqual([{ text: 'ab' }, { text: '漢', color: 'red' }, { text: '…', color: 'red' }])
  })

  test('wrapped lines hold their cells, and a sign wider than the row still moves on', () => {
    expect(wrapLines('漢字 漢字漢字', 4, 3)).toEqual(['漢字', '漢字', '漢字'])
    expect(wrapLines('漢', 1, 2)).toEqual(['漢'])
    expect(wrapLines('um dois três quatro', 9, 2)).toEqual(['um dois', 'três…'])
  })
})

describe('code fences', () => {
  test('a fence closes only on its own mark, at least as long, alone on its line', () => {
    const fence = openFence('````md')!
    expect(fence).toEqual({ char: '`', length: 4, language: 'md' })
    expect(closesFence('```', fence)).toBe(false)
    expect(closesFence('~~~~', fence)).toBe(false)
    expect(closesFence('````js', fence)).toBe(false)
    expect(closesFence('  `````  ', fence)).toBe(true)
    expect(openFence('texto')).toBeNull()
  })

  test('a fence inside a longer one stays code', () => {
    const blocks = parseBlocks('````md\n```ts\nx\n```\n~~~\n````\nfim')
    expect(blocks[0]).toMatchObject({ type: 'code', language: 'md', source: '```ts\nx\n```\n~~~' })
    expect(blocks[1]).toMatchObject({ type: 'paragraph', lines: ['fim'] })
  })

  test('plain markdown leaves the marks inside any fence as written', () => {
    expect(toPlainMarkdown('```\n~~~\n{+a+}\n```\n{+b+}')).toBe('```\n~~~\n{+a+}\n```\n**b**')
    expect(toPlainMarkdown('```\n```js\n{+a+}\n```')).toBe('```\n```js\n{+a+}\n```')
  })
})

describe('memo', () => {
  test('a hit moves to the back: what is drawn again outlives what was drawn once', () => {
    let builds = 0
    const build = () => ++builds
    memo('t-lru', 'a', build, 2)
    memo('t-lru', 'b', build, 2)
    memo('t-lru', 'a', build, 2)
    memo('t-lru', 'c', build, 2)
    expect(memo('t-lru', 'a', build, 2)).toBe(1)
    expect(memo('t-lru', 'b', build, 2)).toBe(4)
  })

  test('one entry per id, built again when its input changes', () => {
    let builds = 0
    expect(memoLatest('t-latest', 'r1', 'a', () => ++builds)).toBe(1)
    expect(memoLatest('t-latest', 'r1', 'a', () => ++builds)).toBe(1)
    expect(memoLatest('t-latest', 'r1', 'ab', () => ++builds)).toBe(2)
    expect(memoLatest('t-latest', 'r2', 'ab', () => ++builds)).toBe(3)
  })

  test('the oldest go past the limit, by time when one is given', () => {
    const items = new Set([1, 2, 3, 4])
    trimOldest(items, 2)
    expect([...items]).toEqual([3, 4])
    expect(keepNewest({ a: 3, b: 1, c: 2 }, 2)).toEqual({ b: 1, c: 2 })
    expect(keepNewest({ a: 3, b: 1, c: 2 }, 2, v => v)).toEqual({ c: 2, a: 3 })
  })
})

describe('format', () => {
  test('durations as the engine spells them', () => {
    expect(formatDuration(12_000)).toBe('12s')
    expect(formatDuration(385_600)).toBe('6m 25s')
    expect(formatDuration(3_720_000)).toBe('1h 2m')
  })

  test('clocks at the session offset', () => {
    expect(formatClock(Date.UTC(2026, 9, 19, 18, 41), -180)).toBe('15:41')
    expect(parseTzOffset('-0300\n')).toBe(-180)
    expect(parseTzOffset('+0530')).toBe(330)
  })

  test('plurals', () => {
    expect(plural(1, 'arquivo', 'arquivos')).toBe('1 arquivo')
    expect(plural(3, 'arquivo', 'arquivos')).toBe('3 arquivos')
  })

  test('a score says its unit, failing or passing', () => {
    expect(scoreText({ runner: 'go', passed: 3, failed: 2, skipped: 0, unit: 'packages' })).toBe('✖ 2 pacotes falharam')
    expect(scoreText({ runner: 'pytest', passed: 1, failed: 0, skipped: 0, unit: 'tests' })).toBe('✔ 1 teste')
    expect(failedCount(1, 'tests')).toBe('1 teste falhou')
  })

  test("a file stamp is the session's wall clock", () => {
    expect(formatStamp(Date.UTC(2026, 9, 20, 2, 5), -180)).toBe('19-10_23-05')
  })
})
