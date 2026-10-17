import type { InjectionKey, Ref } from 'vue'
import { inject, onBeforeUnmount, onScopeDispose, provide, ref, toRaw, watch } from 'vue'

type Snapshot = Record<string, unknown>
interface PageViewCache {
  generation: number
  snapshots: Map<string, Snapshot>
  scroll: Map<string, number>
}
const cacheKey: InjectionKey<PageViewCache> = Symbol('page-view-state')

/** App-owned memory only. No DOM, request owners, credentials or message bodies. */
export function providePageViewState(account: () => string) {
  const cache: PageViewCache = { generation: 0, snapshots: new Map(), scroll: new Map() }
  const clear = () => {
    cache.generation++
    cache.snapshots.clear()
    cache.scroll.clear()
  }
  watch(account, clear, { flush: 'sync' })
  onScopeDispose(clear)
  provide(cacheKey, cache)
  return cache
}

function retain(value: unknown): unknown {
  const raw = toRaw(value)
  // Snapshot containers, not the whole data graph. A departing owner can clear
  // its array/Set without mutating the parked state; records remain shared.
  if (Array.isArray(raw))
    return raw.slice()
  if (raw instanceof Set)
    return new Set(raw)
  if (raw instanceof Map)
    return new Map(raw)
  if (raw && typeof raw === 'object')
    return { ...raw }
  return raw
}

export function usePageViewState(key: string) {
  const cache = inject(cacheKey, null)
  const generation = cache?.generation
  const snapshot = cache?.snapshots.get(key)
  cache?.snapshots.delete(key)
  const fields = new Map<string, () => unknown>()
  onBeforeUnmount(() => {
    if (!cache || generation !== cache.generation)
      return
    cache.snapshots.set(key, Object.fromEntries([...fields].map(([name, read]) => [name, retain(read())])))
    while (cache.snapshots.size > 24)
      cache.snapshots.delete(cache.snapshots.keys().next().value!)
    fields.clear()
  })
  return {
    restored: !!snapshot,
    read<T>(name: string, fallback: T): T {
      return snapshot && Object.hasOwn(snapshot, name) ? snapshot[name] as T : fallback
    },
    capture(name: string, read: () => unknown) { fields.set(name, read) },
    ref<T>(name: string, fallback: T): Ref<T> {
      const value = ref(snapshot && Object.hasOwn(snapshot, name) ? snapshot[name] : fallback) as Ref<T>
      fields.set(name, () => value.value)
      return value
    },
  }
}

export function usePageScrollPositions(prefix = '') {
  const positions = inject(cacheKey, null)?.scroll ?? new Map<string, number>()
  return {
    get: (key: string) => positions.get(`${prefix}${key}`),
    set(key: string, top: number) {
      if (Number.isFinite(top))
        positions.set(`${prefix}${key}`, Math.max(0, top))
      while (positions.size > 64)
        positions.delete(positions.keys().next().value!)
    },
    clear() {
      for (const key of positions.keys()) {
        if (key.startsWith(prefix))
          positions.delete(key)
      }
    },
  }
}
