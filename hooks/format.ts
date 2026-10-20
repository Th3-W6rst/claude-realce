// Shared wording of numbers, durations and times, as the engine's own lines spell them ("6m 25s").

const pad = (n: number) => String(n).padStart(2, '0')

export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

/** 'HH:MM' at the session's offset from UTC (the hooks environment's own clock may run in UTC). */
export function formatClock(epochMs: number, tzOffsetMinutes: number): string {
  const d = new Date(epochMs + tzOffsetMinutes * 60_000)
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
}

/** 'DD/MM' at the session's offset from UTC. */
export function formatDayMonth(epochMs: number, tzOffsetMinutes: number): string {
  const d = new Date(epochMs + tzOffsetMinutes * 60_000)
  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}`
}

export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** '1 teste', '159 testes', '1 pacote': a test score's count in its unit. */
export const testCount = (n: number, unit: 'testes' | 'pacotes') => plural(n, unit === 'pacotes' ? 'pacote' : 'teste', unit)

/** A number in PT-BR spelling: comma decimals, as many as asked. */
export const formatDecimal = (value: number, decimals: number) => value.toFixed(decimals).replace('.', ',')

/** `date +%z` ("-0300") as minutes east of UTC (-180). */
export function parseTzOffset(text: string): number {
  const m = /^([+-])(\d{2})(\d{2})$/.exec(text.trim())
  if (m === null) throw new Error(`realce: unexpected \`date +%z\` output "${text.trim()}"`)
  return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]))
}

/**
 * A raw amount as a person reads it, or null when the raw one already reads well: long durations, big sizes and
 * token counts. Shown beside the number, never in its place.
 */
export function humanizeAmount(value: number, unit: string): string | null {
  // Past a year it is a timestamp, not a duration.
  if (unit === 'ms') return value >= 10_000 && value < 31_536_000_000 ? formatDuration(value) : null
  if (unit === 's') return value >= 90 && value < 31_536_000 ? formatDuration(value * 1000) : null
  if (unit === 'bytes' || unit === 'B') {
    if (value < 10_000) return null
    if (value < 1024 ** 2) return `${Math.round(value / 1024)} KB`
    if (value < 1024 ** 3) return `${formatDecimal(value / 1024 ** 2, 1)} MB`
    return `${formatDecimal(value / 1024 ** 3, 1)} GB`
  }
  if (unit === 'tokens') {
    if (value < 10_000) return null
    return value < 1_000_000 ? `${formatDecimal(value / 1000, 1)} mil` : `${formatDecimal(value / 1_000_000, 1)} mi`
  }
  return null
}
