// The engine asks for the same drawing again and again (a scroll redraws every row it passes): a row is built once
// per state and handed back after. Plain data only: a tree holding handlers is never kept.

const caches = new Map<string, Map<string, unknown>>()

export function memo<T>(scope: string, key: string, build: () => T, limit = 3000): T {
  let cache = caches.get(scope)
  if (cache === undefined) {
    cache = new Map()
    caches.set(scope, cache)
  }
  if (cache.has(key)) return cache.get(key) as T
  const value = build()
  cache.set(key, value)
  // Oldest first out: a Map iterates in insertion order.
  if (cache.size > limit) cache.delete(cache.keys().next().value as string)
  return value
}
