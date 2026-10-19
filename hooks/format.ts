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

export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** A number in PT-BR spelling: comma decimals, as many as asked. */
export const formatDecimal = (value: number, decimals: number) => value.toFixed(decimals).replace('.', ',')

/** `date +%z` ("-0300") as minutes east of UTC (-180). */
export function parseTzOffset(text: string): number {
  const m = /^([+-])(\d{2})(\d{2})$/.exec(text.trim())
  if (m === null) throw new Error(`realce: unexpected \`date +%z\` output "${text.trim()}"`)
  return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]))
}
