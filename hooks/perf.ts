import type { EngineInterface } from 'claude-code'
import { tr } from './i18n'
import { cachedEnv } from './env'
import { detach, every, logLine, runProcess, sessionId, writeFile } from './io'
import { errorText, failedRun } from './safe'

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

function perfSummary(): Record<string, { count: number; avgMs: number; p95Ms: number; maxMs: number }> {
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

// One file per session: several sessions running the mod never mix their numbers. Asked once per load.
let session: Promise<string> | null = null

async function writePerf($: EngineInterface): Promise<void> {
  const home = cachedEnv()?.home
  // Before the env is read there is nowhere to write: the numbers wait for the next tick.
  if (!isDirty || home === undefined || home === '') return
  isDirty = false
  session ??= sessionId($)
  const id = await session
  await writeFile($, `${home}/.cache/realce/perf-${id}.json`, JSON.stringify({ at: new Date(await $.clock.now()).toISOString(), session: id, draws: perfSummary() }, null, 2))
}

// A file per session piles up (dozens a day while developing): one a week has not touched goes when a session starts.
const KEEP_DAYS = 7

async function prunePerf($: EngineInterface): Promise<void> {
  const home = cachedEnv()?.home
  if (home === undefined || home === '') return
  const run = await runProcess($, ['find', `${home}/.cache/realce`, '-maxdepth', '1', '-name', 'perf-*.json', '-mtime', `+${KEEP_DAYS}`, '-delete'])
  // No folder yet (the first session writes it) is no failure.
  if (run.exitCode !== 0 && !/No such file/.test(run.stderr)) logLine($, `realce: old perf files not removed (${failedRun(run, 'find')})`)
}

export async function startPerfLog($: EngineInterface): Promise<void> {
  every($, 10_000, () => void writePerf($).catch(error => logLine($, `realce: perf file not written (${errorText(error)})`)))
  detach($, () => void prunePerf($).catch(error => logLine($, `realce: old perf files not removed (${errorText(error)})`)))
}
