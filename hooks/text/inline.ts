import type { Flags } from '../flags'
import { humanizeAmount } from '../format'
import { languageVersion } from '../i18n'
import { memo } from '../memo'
import type { ProseKind } from '../palette'
import { closesFence, openFence, type Fence } from './blocks'
import { parseNumber, scanDeltas } from './deltas'

// One run of text and the kinds painting it, outermost first: the renderer
// merges their paints in order, so an inner kind overrides an outer one.
export type Span = { text: string; kinds: ProseKind[]; href?: string }

/** `enfase` off: no guesses but paths and links, no labels; `deltas` off: no delta spans; `numeros` on: human readings. */
export type InlineOpts = { enfase?: boolean; deltas?: boolean; numeros?: boolean }

/** The options a reply's prose is parsed with, from the flags in force: the screen's and the print's alike. */
export const inlineOptsOf = (flags: Flags): InlineOpts => ({ enfase: flags.enfase, deltas: flags.deltas, numeros: flags.numeros })

/** What a run of spans shows, its marks gone. */
export const plainText = (spans: readonly Span[]): string => spans.map(s => s.text).join('')

// `L`/`N` boundaries instead of \b, which treats "ã" or "é" as a word break.
const B = '(?<![\\p{L}\\p{N}_])'
const E = '(?![\\p{L}\\p{N}_])'

const MARKUP = new RegExp(
  [
    '(?<code>(?<ticks>`+)(?<codeBody>[^`]|[^`][\\s\\S]*?[^`])\\k<ticks>(?!`))',
    '(?<link>\\[(?<linkText>[^\\]\\n]+)\\]\\((?<linkHref>[^)\\s]+)\\))',
    '(?<url>https?:\\/\\/[^\\s<>()]+[^\\s<>().,;:!?\'"])',
    '(?<strong>\\*\\*(?=\\S)(?<strongBody>.+?)(?<=\\S)\\*\\*)',
    `(?<strongU>${B}__(?=\\S)(?<strongUBody>.+?)(?<=\\S)__${E})`,
    '(?<highlight>==(?=\\S)(?<highlightBody>.+?)(?<=\\S)==)',
    '(?<good>\\{\\+(?<goodBody>.+?)\\+\\})',
    '(?<bad>\\{-(?<badBody>.+?)-\\})',
    '(?<warn>\\{!(?<warnBody>.+?)!\\})',
    '(?<strike>~~(?=\\S)(?<strikeBody>.+?)(?<=\\S)~~)',
    '(?<italic>(?<![\\p{L}\\p{N}*\\\\])\\*(?=[^\\s*])(?<italicBody>[^*\\n]+?)(?<=[^\\s*])\\*(?![\\p{L}\\p{N}*]))',
    `(?<italicU>${B}_(?=[^\\s_])(?<italicUBody>[^_\\n]+?)(?<=[^\\s_])_${E})`,
  ].join('|'),
  'gu',
)

const PATH_EXT =
  'tsx?|jsx?|mjs|cjs|mts|cts|py|ipynb|rb|go|rs|swift|kt|java|c|h|cc|cpp|hpp|cs|m|mm|sh|zsh|bash|fish|md|mdx|json|jsonl|ya?ml|toml|ini|cfg|conf|sql|html?|css|scss|lock|txt|log|env|xml|plist|csv|pdf|png|jpe?g|svg'
const PATH =
  // a path that is obviously one (rooted, or with an extension), so "e/ou" stays prose
  `(?:~|\\.{1,2})?\\/?(?:[\\w@.+-]+\\/)*[\\w@+-][\\w@.+-]*\\.(?:${PATH_EXT})(?::\\d+(?::\\d+)?)?${E}` +
  `|(?:~|\\.{1,2})?\\/(?:[\\w@.+-]+\\/)*[\\w@.+-]*[\\p{L}][\\w@.+-]*\\/?` +
  `|[\\w@.+-]*\\p{L}[\\w@.+-]*(?:\\/[\\w@.+-]*\\p{L}[\\w@.+-]*){2,}\\/?`

const GOOD_WORDS = [
  'passa', 'passam', 'passou', 'passaram', 'passando', 'ok', 'corrigido', 'corrigida', 'corrigidos', 'corrigidas',
  'resolvido', 'resolvida', 'resolvidos', 'resolvidas', 'funciona', 'funcionam', 'funcionou', 'sucesso', 'verde',
  'pronto', 'pronta', 'prontos', 'prontas', 'concluído', 'concluída', 'concluídos', 'concluídas', 'melhorou',
  'fixed', 'pass', 'passes', 'passed', 'passing', 'works', 'working', 'resolved', 'solved', 'success', 'green', 'done',
  'completed', 'ready', 'improved', '✅', '✓', '✔',
]
const BAD_WORDS = [
  'falha', 'falhas', 'falham', 'falhou', 'falharam', 'falhando', 'erro', 'erros', 'errado', 'errada', 'errados',
  'erradas', 'quebrou', 'quebrado', 'quebrada', 'quebraram', 'piorou', 'piora', 'pioraram', 'bug', 'bugs',
  'regressão', 'regressões', 'crash', 'travou', 'vermelho', 'failed', 'failing', 'fails', 'error', 'errors',
  'fail', 'broken', 'broke', 'breaks', 'crashed', 'crashes', 'wrong', 'regression', 'regressed', '❌', '✗', '✘',
]
const WARN_WORDS = [
  'falta', 'faltam', 'faltando', 'pendente', 'pendentes', 'atenção', 'cuidado', 'risco', 'riscos', 'bloqueado',
  'bloqueada', 'bloqueados', 'bloqueadas', 'aguardando', 'warning', 'pending', 'blocked', 'risk', 'risks', 'missing',
  'waiting', 'caution', '⚠️', '⚠',
]
// Case-sensitive: "GO" is the person's go-ahead, "go" is a language.
const WARN_EXACT: ReadonlySet<string> = new Set(['GO', 'TODO', 'FIXME', 'WIP'])

// A status word is one word token looked up here: three lists of a hundred words tried at every character cost
// a reply twice the parse.
const STATUS_WORDS: ReadonlyMap<string, ProseKind> = new Map([
  ...GOOD_WORDS.map(w => [w, 'statusGood'] as const),
  ...BAD_WORDS.map(w => [w, 'statusBad'] as const),
  ...WARN_WORDS.map(w => [w, 'statusWarn'] as const),
])

const wordKind = (word: string): ProseKind | undefined => (WARN_EXACT.has(word) ? 'statusWarn' : STATUS_WORDS.get(word.toLowerCase()))

// Status words ignore case (`i`, which also reads "6M" and "1H" as numbers); GO and TODO keep it, in wordKind.
const HEURISTICS = new RegExp(
  [
    `(?<url>https?:\\/\\/[^\\s<>()]+[^\\s<>().,;:!?'"])`,
    '(?<quote>"[^"\\n]{1,160}"|“[^”\\n]{1,160}”)',
    `(?<path>(?<![\\p{L}\\p{N}_\\/.@-])(?:${PATH}))`,
    `(?<number>(?<![\\p{L}\\p{N}_.,:\\/-])(?:\\d{1,2}[-\\/]\\d{4}|\\d{1,2}[-\\/]\\d{1,2}(?:[-\\/]\\d{2,4})?|\\d+(?:[.,:]\\d+)*(?:%|k|K|M|B|ms|s|min|h|x|GB|MB|KB|px)?)${E})`,
    `(?<word>${B}(?:\\p{L}[\\p{L}\\p{N}_]*|[✅✓✔❌✗✘]|⚠️?)${E})`,
  ].join('|'),
  'giu',
)

const QUOTED = /"[^"\n]{1,160}"|“[^”\n]{1,160}”/gu

const LOOKS_LIKE_PATH = new RegExp(`^(?:${PATH})$`, 'u')

const UNIT_AFTER = /^ ?(ms|s|bytes|B|tokens)(?![\p{L}\p{N}_])/u
// The unit named just before ("tokens: 73201", "em ms: 102761", "tokens (73201)"): the reading follows the number,
// past a closing parenthesis.
const UNIT_BEFORE = /(?<![\p{L}\p{N}_])(ms|bytes|tokens)\s*[:=]?\s*(\(?)$/u

/** The reading of a number and its unit: after it ("102761 ms"), glued to it ("102761ms") or just before it. */
function humanReading(number: string, after: string, before: string): { label: string; unitText: string } | null {
  const glued = /^(\d+)(ms|s)$/.exec(number)
  const unitAfter = glued === null ? UNIT_AFTER.exec(after) : null
  const unitBefore = glued === null && unitAfter === null ? UNIT_BEFORE.exec(before) : null
  const unit = glued?.[2] ?? unitAfter?.[1] ?? unitBefore?.[1]
  if (unit === undefined) return null
  const parsed = parseNumber(glued?.[1] ?? number)
  if (parsed === null || parsed.unit !== '') return null
  const label = humanizeAmount(parsed.value, unit)
  if (label === null) return null
  const unitText = unitAfter?.[0] ?? (unitBefore?.[2] === '(' && after.startsWith(')') ? ')' : '')
  // Already read for the person ("102761 ms (1m 42s)"): no second reading.
  return after.slice(unitText.length).startsWith(` (${label}`) ? null : { label, unitText }
}

// Bare prose with its deltas cut out, each a span of its own after the second number.
function prose(text: string, outer: ProseKind[], opts: InlineOpts): Span[] {
  if (outer.length > 0 || opts.deltas === false) return heuristics(text, outer, opts)
  const spans: Span[] = []
  let at = 0
  // A quotation is cited as written: a delta inside it would cut its color in two.
  const quotes = [...text.matchAll(QUOTED)].map(m => [m.index ?? 0, (m.index ?? 0) + m[0].length] as const)
  for (const d of scanDeltas(text)) {
    if (quotes.some(([from, to]) => d.start < to && d.end > from)) continue
    if (d.arrow !== undefined) {
      spans.push(...heuristics(text.slice(at, d.arrow.start), outer, opts), { text: text.slice(d.arrow.start, d.arrow.end), kinds: ['delta'] })
      at = d.arrow.end
    }
    spans.push(...heuristics(text.slice(at, d.end), outer, opts), { text: ` ${d.label}`, kinds: ['delta'] })
    at = d.end
  }
  spans.push(...heuristics(text.slice(at), outer, opts))
  return spans
}

function heuristics(text: string, outer: ProseKind[], opts: InlineOpts): Span[] {
  if (text === '') return []
  // Only bare prose gets the guesses: inside a marked span the writer already chose the color.
  if (outer.length > 0) return [{ text, kinds: outer }]
  const spans: Span[] = []
  let at = 0
  for (const m of text.matchAll(HEURISTICS)) {
    const g = m.groups ?? {}
    const kind: ProseKind | undefined = g.url ? 'link' : g.quote ? 'quote' : g.path ? 'path' : g.number ? 'number' : g.word ? wordKind(g.word) : undefined
    if (kind === undefined) continue
    // With enfase off only what a link needs is found; the rest is the engine's plain text.
    if (opts.enfase === false && kind !== 'link' && kind !== 'path') continue
    const start = m.index ?? 0
    // A human reading already took the text up to `at` (a unit after its number).
    if (start < at) continue
    if (start > at) spans.push({ text: text.slice(at, start), kinds: [] })
    spans.push(kind === 'link' ? { text: m[0], kinds: [kind], href: m[0] } : { text: m[0], kinds: [kind] })
    at = start + m[0].length
    if (kind === 'number' && opts.numeros === true) {
      const reading = humanReading(m[0], text.slice(at), text.slice(Math.max(0, start - 24), start))
      if (reading !== null) {
        if (reading.unitText !== '') spans.push({ text: reading.unitText, kinds: [] })
        spans.push({ text: ` (${reading.label})`, kinds: ['aside'] })
        at += reading.unitText.length
      }
    }
  }
  if (at < text.length) spans.push({ text: text.slice(at), kinds: [] })
  return spans
}

/**
 * Splits one line of prose into painted spans: the markdown and the typed
 * emphasis the writer marked, then guesses (numbers, paths, status words) on
 * the bare text between. `isLineStart` makes a leading `**x**` a label.
 */
export function parseInline(text: string, outer: ProseKind[] = [], isLineStart = true, opts: InlineOpts = {}): Span[] {
  const spans: Span[] = []
  let at = 0
  const re = new RegExp(MARKUP.source, MARKUP.flags)
  for (const m of text.matchAll(re)) {
    const g = m.groups ?? {}
    const start = m.index ?? 0
    spans.push(...prose(text.slice(at, start), outer, opts))
    at = start + m[0].length
    if (g.code !== undefined) {
      const body = g.codeBody ?? ''
      // A one-space pad either side is markdown's way to start or end on a backtick.
      const inner = /^ .* $/s.test(body) && body.trim() !== '' ? body.slice(1, -1) : body
      spans.push({ text: inner, kinds: [...outer, 'code', ...(LOOKS_LIKE_PATH.test(inner) ? (['path'] as const) : [])] })
    } else if (g.link !== undefined) {
      spans.push(...parseInline(g.linkText ?? '', [...outer, 'link'], false, opts).map(s => ({ ...s, href: g.linkHref })))
    } else if (g.url !== undefined) {
      spans.push({ text: g.url, kinds: [...outer, 'link'], href: g.url })
    } else {
      const [kind, body] = pick(g)
      const isLabel = kind === 'strong' && isLineStart && start === 0 && outer.length === 0 && opts.enfase !== false
      spans.push(...parseInline(body, [...outer, isLabel ? 'label' : kind], false, opts))
      // "**Label**:" reads as one label; the colon joins it.
      if (isLabel && text[at] === ':') {
        spans.push({ text: ':', kinds: ['label'] })
        at += 1
      }
    }
  }
  spans.push(...prose(text.slice(at), outer, opts))
  return merge(spans)
}

/**
 * A line's spans, parsed once per text, options and language: a reply draws every line again on each scroll and each
 * streamed delta. The spans are plain data, shared: callers read them, never change them.
 */
export function spansOf(line: string, isLineStart: boolean, opts: InlineOpts): Span[] {
  const key = `${languageVersion()}|${+isLineStart}${+(opts.enfase !== false)}${+(opts.deltas !== false)}${+(opts.numeros === true)}|${line}`
  return memo('spans', key, () => parseInline(line, [], isLineStart, opts), 20_000)
}

function pick(g: Record<string, string | undefined>): [ProseKind, string] {
  if (g.strong !== undefined) return ['strong', g.strongBody ?? '']
  if (g.strongU !== undefined) return ['strong', g.strongUBody ?? '']
  if (g.highlight !== undefined) return ['highlight', g.highlightBody ?? '']
  if (g.good !== undefined) return ['good', g.goodBody ?? '']
  if (g.bad !== undefined) return ['bad', g.badBody ?? '']
  if (g.warn !== undefined) return ['warn', g.warnBody ?? '']
  if (g.strike !== undefined) return ['strike', g.strikeBody ?? '']
  if (g.italic !== undefined) return ['italic', g.italicBody ?? '']
  if (g.italicU !== undefined) return ['italic', g.italicUBody ?? '']
  throw new Error('realce: a markup match named no group')
}

function merge(spans: Span[]): Span[] {
  const out: Span[] = []
  for (const s of spans) {
    if (s.text === '') continue
    const last = out[out.length - 1]
    if (last && last.href === s.href && last.kinds.join() === s.kinds.join()) last.text += s.text
    else out.push({ ...s, kinds: [...s.kinds] })
  }
  return out
}

/**
 * The typed emphasis as plain markdown (`**x**`), for every place this mod
 * does not draw itself: other surfaces, tables, summaries. Code is left alone.
 */
export function toPlainMarkdown(text: string): string {
  const out: string[] = []
  let fence: Fence | null = null
  for (const line of text.split('\n')) {
    if (fence !== null) {
      if (closesFence(line, fence)) fence = null
      out.push(line)
      continue
    }
    fence = openFence(line)
    if (fence !== null) {
      out.push(line)
      continue
    }
    out.push(
      line
        .split(/(`+[^`]*`+)/)
        .map(part =>
          part.startsWith('`')
            ? part
            : part
                .replace(/==(?=\S)(.+?)(?<=\S)==/g, '**$1**')
                .replace(/\{\+(.+?)\+\}/g, '**$1**')
                .replace(/\{-(.+?)-\}/g, '**$1**')
                .replace(/\{!(.+?)!\}/g, '**$1**'),
        )
        .join(''),
    )
  }
  return out.join('\n')
}
