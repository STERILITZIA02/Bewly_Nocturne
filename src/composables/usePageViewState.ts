import type { InjectionKey, Ref, ShallowRef } from 'vue'
import { inject, onBeforeUnmount, onScopeDispose, provide, ref, shallowRef, toRaw, watch } from 'vue'

import { estimateSnapshotEntries } from '~/utils/viewSnapshotBudget'

type Snapshot = Record<string, unknown>
interface PageViewCache {
  generation: number
  snapshots: Map<string, Snapshot>
  /** Estimated entries per parked view, maintained on park/take/evict. */
  sizes: Map<string, number>
  parkedEntries: number
  scroll: Map<string, number>
}
const MAX_PAGE_VIEW_SNAPSHOTS = 24
/** Parked list items and states across inactive pages; whole views evict oldest first. */
const PAGE_VIEW_ENTRY_BUDGET = 8000
const cacheKey: InjectionKey<PageViewCache> = Symbol('page-view-state')

/** App-owned memory only. No DOM, request owners, credentials or message bodies. */
export function providePageViewState(account: () => string) {
  const cache: PageViewCache = { generation: 0, snapshots: new Map(), sizes: new Map(), parkedEntries: 0, scroll: new Map() }
  const clear = () => {
    cache.generation++
    cache.snapshots.clear()
    cache.sizes.clear()
    cache.parkedEntries = 0
    cache.scroll.clear()
  }
  watch(account, clear, { flush: 'sync' })
  onScopeDispose(clear)
  provide(cacheKey, cache)
  return cache
}

function dropSnapshot(cache: PageViewCache, key: string) {
  cache.parkedEntries -= cache.sizes.get(key) ?? 0
  cache.sizes.delete(key)
  cache.snapshots.delete(key)
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
  if (cache)
    dropSnapshot(cache, key)
  const fields = new Map<string, () => unknown>()
  onBeforeUnmount(() => {
    if (!cache || generation !== cache.generation)
      return
    dropSnapshot(cache, key)
    const parked = Object.fromEntries([...fields].map(([name, read]) => [name, retain(read())]))
    const entries = estimateSnapshotEntries(parked)
    cache.snapshots.set(key, parked)
    cache.sizes.set(key, entries)
    cache.parkedEntries += entries
    // Only complete views are evicted: a list, its cursor and anchors stay paired.
    while (cache.snapshots.size > MAX_PAGE_VIEW_SNAPSHOTS || (cache.parkedEntries > PAGE_VIEW_ENTRY_BUDGET && cache.snapshots.size > 1))
      dropSnapshot(cache, cache.snapshots.keys().next().value!)
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
    /** Large display lists and raw data with an immutable or owner-local update contract. */
    shallowRef<T>(name: string, fallback: T): ShallowRef<T> {
      const value = shallowRef(snapshot && Object.hasOwn(snapshot, name) ? snapshot[name] : fallback) as ShallowRef<T>
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
