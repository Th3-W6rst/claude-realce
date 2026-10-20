// The engine asks for the same drawing again and again (a scroll redraws every row it passes): a row is built once
// per state and handed back after. Plain data only: a tree holding handlers is never kept.

const caches = new Map<string, Map<string, unknown>>()

function scopeOf(scope: string): Map<string, unknown> {
  let cache = caches.get(scope)
  if (cache === undefined) {
    cache = new Map()
    caches.set(scope, cache)
  }
  return cache
}

/** Past `max` entries the oldest go: a Map iterates in insertion order. */
export function trimOldest(items: Map<unknown, unknown> | Set<unknown>, max: number): void {
  for (const key of items.keys()) {
    if (items.size <= max) return
    items.delete(key)
  }
}

export function memo<T>(scope: string, key: string, build: () => T, limit = 3000): T {
  const cache = scopeOf(scope)
  if (cache.has(key)) {
    const value = cache.get(key) as T
    // A hit moves to the back: what is drawn again and again outlives what was drawn once.
    cache.delete(key)
    cache.set(key, value)
    return value
  }
  const value = build()
  cache.set(key, value)
  trimOldest(cache, limit)
  return value
}

/**
 * One entry per `id`, rebuilt when its `input` changes: a reply that streams keeps one parse, not one per prefix it
 * passed through.
 */
export function memoLatest<T>(scope: string, id: string, input: string, build: () => T, limit = 1000): T {
  const cache = scopeOf(scope)
  const kept = cache.get(id) as { input: string; value: T } | undefined
  if (kept !== undefined && kept.input === input) {
    cache.delete(id)
    cache.set(id, kept)
    return kept.value
  }
  const value = build()
  cache.delete(id)
  cache.set(id, { input, value })
  trimOldest(cache, limit)
  return value
}

/** The newest `max` entries of a record: by the time each holds, or in the order they came. */
export function keepNewest<V>(record: Record<string, V>, max: number, timeOf?: (v: V) => number): Record<string, V> {
  const entries = Object.entries(record)
  if (entries.length <= max) return record
  if (timeOf !== undefined) entries.sort((a, b) => timeOf(a[1]) - timeOf(b[1]))
  return Object.fromEntries(entries.slice(-max))
}
