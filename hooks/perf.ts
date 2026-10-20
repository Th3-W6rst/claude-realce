import type { EngineInterface } from 'claude-code'
import { tr } from './i18n'

// How long each drawing hook takes and how often it runs, kept in the module (a reload starts it over):
// `/realce status` shows it and ~/.cache/realce/perf-<session>.json keeps the last 10 seconds' picture.

type Stat = { count: number; recent: number[] }

const stats = new Map<string, Stat>()
let isDirty = false

export async function timed<T>(component: string, run: () => Promise<T>): Promise<T> {
  const startedAt = Date.now()
  try {
    return await run()
  } finally {
    const stat = stats.get(component) ?? { count: 0, recent: [] }
    stat.count += 1
    stat.recent.push(Date.now() - startedAt)
    if (stat.recent.length > 500) stat.recent.shift()
    stats.set(component, stat)
    isDirty = true
  }
}

export function perfSummary(): Record<string, { count: number; avgMs: number; p95Ms: number; maxMs: number }> {
  return Object.fromEntries(
    [...stats].map(([component, { count, recent }]) => {
      const sorted = [...recent].sort((a, b) => a - b)
      const avg = sorted.reduce((sum, ms) => sum + ms, 0) / Math.max(1, sorted.length)
      return [component, { count, avgMs: Math.round(avg * 10) / 10, p95Ms: sorted[Math.floor(sorted.length * 0.95)] ?? 0, maxMs: sorted.at(-1) ?? 0 }]
    }),
  )
}

export function perfLines(): string[] {
  const summary = Object.entries(perfSummary()).sort(([, a], [, b]) => b.count * b.avgMs - a.count * a.avgMs)
  if (summary.length === 0) return [tr('Drawings: none measured since the mod loaded.', 'Desenhos: nenhum medido desde que o mod carregou.')]
  return [tr('Drawings (times · mean · p95 · max):', 'Desenhos (vezes · média · p95 · máx):'), ...summary.map(([c, s]) => `  ${c}: ${s.count} · ${s.avgMs} ms · ${s.p95Ms} ms · ${s.maxMs} ms`)]
}

async function writePerf($: EngineInterface): Promise<void> {
  if (!isDirty) return
  isDirty = false
  const home = (await $.env.get('HOME')) ?? ''
  // One file per session: several sessions running the mod never mix their numbers.
  const session = await $.session.id()
  await $.fs.write(`${home}/.cache/realce/perf-${session}.json`, JSON.stringify({ at: new Date(await $.clock.now()).toISOString(), session, draws: perfSummary() }, null, 2))
}

export async function startPerfLog($: EngineInterface): Promise<void> {
  $.clock.every(10_000, () => void writePerf($))
}
