// "de 87 para 106", "from 87 to 106" and "87 ms → 106 ms" gain their difference, "(+19)": a change read at a glance.

import { decimalMark } from '../format'
import { tr } from '../i18n'

/** `end`: just past the second number (and its unit); `arrow`: where the arrow is, for the arrow form. */
type Delta = { end: number; label: string; arrow?: { start: number; end: number } }

const UNIT = '%|p\\.p\\.|ms|min|GB|MB|KB|TB|kB|px|s|h|B|k|K|M'
const UNIT_RE = new RegExp(`^(?:${UNIT})$`, 'u')
// A sign or digit glued to a word or another number ("v1", "2.1.303", "x-3") is no number of its own.
const NUM = `(?<![\\p{L}\\p{N}_.,+\\-−])[+\\-−]?\\d+(?:[.,]\\d+)*(?:\\s?(?:${UNIT})(?![\\p{L}\\p{N}_]))?(?![\\p{L}\\p{N}_]|[.,]\\d)`
const DELTA = new RegExp(
  `(?<![\\p{L}\\p{N}_])[Dd]e\\s+(?<from1>${NUM})\\s+(?:para|a)\\s+(?<to1>${NUM})` +
    `|(?<![\\p{L}\\p{N}_])[Ff]rom\\s+(?<from3>${NUM})\\s+to\\s+(?<to3>${NUM})` +
    `|(?<from2>${NUM})\\s*(?<arrow>→|->)\\s*(?<to2>${NUM})`,
  'gu',
)

/**
 * A number as written: one dot or comma is the decimal mark, except before exactly
 * three digits, where it could be a thousands mark ("1.234"): that is no number.
 */
export function parseNumber(s: string): { value: number; decimals: number; unit: string } | null {
  const m = /^([+\-−]?)(\d+(?:[.,]\d+)*)\s?(.*)$/u.exec(s.trim())
  if (!m) return null
  const [, sign = '', digits = '', unit = ''] = m
  if (unit !== '' && !UNIT_RE.test(unit)) return null
  const parts = digits.split(/[.,]/)
  if (parts.length > 2) return null
  const [int = '', frac = ''] = parts
  if (frac.length === 3 && int !== '0') return null
  const value = Number(frac === '' ? int : `${int}.${frac}`) * (sign === '' || sign === '+' ? 1 : -1)
  return { value, decimals: frac.length, unit }
}

/** The deltas with where each match starts, for callers that must keep other spans whole. */
export function scanDeltas(text: string): (Delta & { start: number })[] {
  const out: (Delta & { start: number })[] = []
  for (const m of text.matchAll(DELTA)) {
    const g = m.groups ?? {}
    // An arrow between bare numbers maps an input to an output ("4 → 8"): only with a unit is it a change.
    if (g.arrow !== undefined && parseNumber(g.to2 ?? '')?.unit === '') continue
    const label = deltaLabel(g.from1 ?? g.from3 ?? g.from2 ?? '', g.to1 ?? g.to3 ?? g.to2 ?? '')
    if (label === null) continue
    const start = m.index ?? 0
    const end = start + m[0].length
    if (g.arrow === undefined) {
      out.push({ start, end, label })
    } else {
      const at = start + m[0].indexOf(g.arrow, (g.from2 ?? '').length)
      out.push({ start, end, label, arrow: { start: at, end: at + g.arrow.length } })
    }
  }
  return out
}

function deltaLabel(fromText: string, toText: string): string | null {
  const from = parseNumber(fromText)
  const to = parseNumber(toText)
  if (from === null || to === null) return null
  // "de 2 para 3 GB" shares the unit written once; a unit on the first alone, or two different ones, do not.
  if (from.unit !== '' && from.unit !== to.unit) return null
  const unit = to.unit
  const decimals = Math.max(from.decimals, to.decimals)
  const diff = to.value - from.value
  const size = Math.abs(diff).toFixed(decimals)
  if (Number(size) === 0) return null
  const suffix = unit === '%' ? tr(' pp', ' p.p.') : unit === '' ? '' : ` ${unit}`
  return `(${diff > 0 ? '+' : '−'}${size.replace('.', decimalMark())}${suffix})`
}
