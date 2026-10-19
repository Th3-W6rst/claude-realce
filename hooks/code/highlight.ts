import type { CodeKind } from '../palette'

export type Token = { text: string; kind?: CodeKind }

type Lang = {
  lineComments: string[]
  blockComments: [string, string][]
  quotes: string[]
  isTripleQuoted?: boolean
  keywords: Set<string>
  constants: Set<string>
  types?: Set<string>
  isCaseInsensitive?: boolean
  isShell?: boolean
  hasDecorators?: boolean
  // A string or bare word right before `:` is a key (JSON, YAML).
  hasKeys?: boolean
}

const set = (words: string) => new Set(words.split(/\s+/).filter(Boolean))

const JS: Lang = {
  lineComments: ['//'],
  blockComments: [['/*', '*/']],
  quotes: ['"', "'", '`'],
  hasDecorators: true,
  keywords: set(`break case catch class const continue debugger default delete do else export extends finally for
    function if import in instanceof let new return super switch this throw try typeof var void while with yield
    async await of from as type interface enum implements private protected public readonly static declare
    namespace module abstract satisfies keyof infer is get set`),
  constants: set('true false null undefined NaN Infinity'),
}

const PY: Lang = {
  lineComments: ['#'],
  blockComments: [],
  quotes: ['"', "'"],
  isTripleQuoted: true,
  hasDecorators: true,
  keywords: set(`and as assert async await break class continue def del elif else except finally for from global if
    import in is lambda nonlocal not or pass raise return try while with yield match case self cls`),
  constants: set('True False None'),
}

const SH: Lang = {
  lineComments: ['#'],
  blockComments: [],
  quotes: ['"', "'"],
  isShell: true,
  keywords: set(`if then else elif fi for in do done while until case esac function return local export readonly
    declare unset shift exit break continue source alias set`),
  constants: set('true false'),
}

const JSON_LANG: Lang = {
  lineComments: ['//'],
  blockComments: [['/*', '*/']],
  quotes: ['"'],
  hasKeys: true,
  keywords: set(''),
  constants: set('true false null'),
}

const YAML: Lang = {
  lineComments: ['#'],
  blockComments: [],
  quotes: ['"', "'"],
  hasKeys: true,
  keywords: set(''),
  constants: set('true false null yes no on off ~'),
}

const SWIFT: Lang = {
  lineComments: ['//'],
  blockComments: [['/*', '*/']],
  quotes: ['"'],
  hasDecorators: true,
  keywords: set(`associatedtype class deinit enum extension fileprivate func import init inout internal let open
    operator private precedencegroup protocol public rethrows static struct subscript typealias var break case catch
    continue default defer do else fallthrough for guard if in repeat return throw switch where while as is try
    await async throws some any self Self super mutating override final lazy weak unowned required convenience
    actor nonisolated isolated`),
  constants: set('true false nil'),
}

const SQL: Lang = {
  lineComments: ['--'],
  blockComments: [['/*', '*/']],
  quotes: ["'", '"'],
  isCaseInsensitive: true,
  keywords: set(`select from where and or not insert into values update set delete create table index view drop
    alter add column primary key foreign references join left right inner outer full on group by order having limit
    offset as distinct union all case when then else end is like in between exists returning with begin commit
    rollback transaction default unique check constraint if asc desc cascade pragma`),
  constants: set('true false null'),
  types: set('int integer text varchar char boolean bool date timestamp timestamptz serial numeric real bigint json jsonb uuid blob float double'),
}

const PLAIN: Lang = {
  lineComments: ['//', '#'],
  blockComments: [['/*', '*/']],
  quotes: ['"', "'", '`'],
  keywords: set(''),
  constants: set('true false null nil None'),
}

const LANGS: Record<string, Lang | 'diff'> = {
  ts: JS, typescript: JS, tsx: JS, js: JS, javascript: JS, jsx: JS, mjs: JS, cjs: JS, mts: JS, cts: JS,
  py: PY, python: PY, python3: PY,
  sh: SH, bash: SH, zsh: SH, shell: SH, console: SH, shellscript: SH, fish: SH,
  json: JSON_LANG, jsonc: JSON_LANG, json5: JSON_LANG, jsonl: JSON_LANG,
  yaml: YAML, yml: YAML,
  swift: SWIFT,
  sql: SQL, sqlite: SQL, postgres: SQL, postgresql: SQL,
  diff: 'diff', patch: 'diff',
  '': PLAIN, text: PLAIN, txt: PLAIN, plaintext: PLAIN,
}

/** Whether this mod highlights the fence's language itself (else the engine's Code does). */
export const isKnownLanguage = (language: string) => language.toLowerCase() in LANGS

/** The source cut into lines of colored tokens. */
export function highlight(source: string, language: string): Token[][] {
  const lang = LANGS[language.toLowerCase()] ?? PLAIN
  if (lang === 'diff') return source.split('\n').map(diffLine)
  return toLines(lex(source, lang))
}

function diffLine(line: string): Token[] {
  if (/^(\+\+\+|---)( |$)/.test(line) || /^(diff |index )/.test(line)) return [{ text: line, kind: 'meta' }]
  if (line.startsWith('@@')) return [{ text: line, kind: 'hunk' }]
  if (line.startsWith('+')) return [{ text: line, kind: 'added' }]
  if (line.startsWith('-')) return [{ text: line, kind: 'removed' }]
  return [{ text: line }]
}

const IDENT = /[A-Za-z_\p{L}][\w\p{L}]*/uy
const SH_WORD = /[A-Za-z_][\w.\/-]*/y
const NUMBER = /(?:0[xX][\da-fA-F_]+|0[bB][01_]+|\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][+-]?\d+)?)[a-zA-Z]*/y
const OPERATOR = /[+\-*/%=<>!&|^~?:]+/y
const PUNCT = /[{}()[\];,.]/y

function lex(src: string, lang: Lang): Token[] {
  const out: Token[] = []
  const push = (text: string, kind?: CodeKind) => {
    const last = out[out.length - 1]
    if (last && last.kind === kind) last.text += text
    else out.push(kind === undefined ? { text } : { text, kind })
  }
  // Shell: the first word of a command is the command, colored as a call.
  let isCommandPosition = true
  let i = 0
  const at = (re: RegExp) => {
    re.lastIndex = i
    return re.exec(src)?.[0]
  }
  const prevSignificant = () => {
    for (let j = out.length - 1; j >= 0; j--) {
      const t = out[j]!.text.trimEnd()
      if (t !== '') return t[t.length - 1]
    }
    return undefined
  }

  while (i < src.length) {
    const c = src[i]!
    if (c === ' ' || c === '\t' || c === '\n') {
      if (c === '\n' && lang.isShell) isCommandPosition = true
      push(c)
      i++
      continue
    }

    const lineComment = lang.lineComments.find(p => src.startsWith(p, i))
    // `#` opens a comment only at a word's start (shell `$#`, `a#b`, URLs' `#frag` stay code).
    if (lineComment !== undefined && (lineComment !== '#' || i === 0 || /\s/.test(src[i - 1]!))) {
      const end = src.indexOf('\n', i)
      push(src.slice(i, end === -1 ? src.length : end), 'comment')
      i = end === -1 ? src.length : end
      continue
    }
    const block = lang.blockComments.find(([open]) => src.startsWith(open, i))
    if (block !== undefined) {
      const end = src.indexOf(block[1], i + block[0].length)
      const stop = end === -1 ? src.length : end + block[1].length
      push(src.slice(i, stop), 'comment')
      i = stop
      continue
    }

    if (lang.quotes.includes(c)) {
      const triple = lang.isTripleQuoted && src.startsWith(c.repeat(3), i) ? c.repeat(3) : null
      const close = triple ?? c
      // Shell single quotes and backtick templates may run across lines; other strings stop at the line's end.
      const isMultiline = triple !== null || c === '`' || lang.isShell
      let j = i + close.length
      while (j < src.length && !src.startsWith(close, j)) {
        if (src[j] === '\\' && !(lang.isShell && c === "'")) j++
        else if (src[j] === '\n' && !isMultiline) break
        j++
      }
      const stop = Math.min(src.length, src.startsWith(close, j) ? j + close.length : j)
      const text = src.slice(i, stop)
      i = stop
      push(text, lang.hasKeys && /^\s*:/.test(src.slice(i)) ? 'key' : 'string')
      if (lang.isShell) isCommandPosition = false
      continue
    }

    if (lang.isShell && c === '$') {
      const v = /\$(?:\{[^}\n]*\}|\(|[A-Za-z_]\w*|[0-9#?@*!$-])/y
      v.lastIndex = i
      const m = v.exec(src)?.[0]
      if (m !== undefined) {
        push(m, m === '$(' ? 'operator' : 'variable')
        i += m.length
        if (m === '$(') isCommandPosition = true
        continue
      }
    }
    if (lang.isShell && c === '-' && (i === 0 || /\s/.test(src[i - 1]!)) && /[-A-Za-z]/.test(src[i + 1] ?? '')) {
      const m = /--?[\w-]+(?:=\S*)?/y
      m.lastIndex = i
      const flag = m.exec(src)?.[0] ?? c
      push(flag, 'flag')
      i += flag.length
      continue
    }

    if (lang.hasDecorators && c === '@') {
      const word = at(/@[A-Za-z_][\w.]*/y)
      if (word !== undefined) {
        push(word, 'decorator')
        i += word.length
        continue
      }
    }

    if (/\d/.test(c) && !/[\w$]/.test(src[i - 1] ?? '')) {
      const num = at(NUMBER)!
      push(num, 'number')
      i += num.length
      continue
    }

    const word = at(lang.isShell ? SH_WORD : IDENT)
    if (word !== undefined) {
      const key = lang.isCaseInsensitive ? word.toLowerCase() : word
      const rest = src.slice(i + word.length)
      let kind: CodeKind | undefined
      if (lang.hasKeys && /^\s*:(\s|$)/.test(rest)) kind = 'key'
      else if (lang.keywords.has(key)) kind = 'keyword'
      else if (lang.constants.has(key)) kind = 'constant'
      else if (lang.types?.has(key)) kind = 'type'
      else if (lang.isShell) kind = isCommandPosition ? 'function' : undefined
      else if (/^\s*\(/.test(rest) || (lang === JS && /^\s*`/.test(rest))) kind = 'function'
      else if (prevSignificant() === '.') kind = 'property'
      else if (/^[A-Z]/.test(word) && lang !== SQL) kind = 'type'
      push(word, kind)
      i += word.length
      if (lang.isShell) isCommandPosition = kind === 'keyword' && /^(then|do|else|elif|if|while|until|function)$/.test(word)
      continue
    }

    const op = at(OPERATOR)
    if (op !== undefined) {
      push(op, 'operator')
      i += op.length
      if (lang.isShell && /^(\||\|\||&&|;|&)$/.test(op)) isCommandPosition = true
      continue
    }
    const punct = at(PUNCT)
    if (punct !== undefined) {
      push(punct, 'punctuation')
      i += 1
      if (lang.isShell && (punct === ';' || punct === '(')) isCommandPosition = true
      continue
    }
    push(c)
    i++
  }
  return out
}

function toLines(tokens: Token[]): Token[][] {
  const lines: Token[][] = [[]]
  for (const t of tokens) {
    const parts = t.text.split('\n')
    parts.forEach((part, n) => {
      if (n > 0) lines.push([])
      if (part !== '') lines[lines.length - 1]!.push(t.kind === undefined ? { text: part } : { text: part, kind: t.kind })
    })
  }
  return lines
}
