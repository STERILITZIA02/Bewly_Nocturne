import type { InjectionKey, Ref, ShallowRef } from 'vue'
import { inject, nextTick, onActivated, onBeforeUnmount, onDeactivated, onMounted, provide, reactive, ref, shallowRef, toRaw } from 'vue'

import { estimateSnapshotEntries } from '~/utils/viewSnapshotBudget'

export type HomeTabSnapshot = Record<string, unknown>
/** Replaces a parked field with a cheaper value it can be rebuilt from. */
export type HomeTabSnapshotShrinker = (value: unknown) => unknown
// Eight tabs, two Following layouts and three recommendation modes fit without eviction.
const MAX_HOME_TAB_SNAPSHOTS = 12
/** Estimated parked entries (list items, measurements, states) across inactive tabs. */
const HOME_TAB_ENTRY_BUDGET = 6000

interface ParkedSnapshot {
  values: HomeTabSnapshot
  entries: number
  shrinkers: Map<string, HomeTabSnapshotShrinker>
  shrunk: boolean
}

/**
 * Exclusive transfer of data ownership: take removes the inactive snapshot. No
 * JSON copy or DOM is cached. Size is estimated once when a tab parks; under
 * pressure derivable fields shrink first (oldest tab first), then whole tabs go.
 */
export function createHomeTabCache(entryBudget = HOME_TAB_ENTRY_BUDGET) {
  const snapshots = new Map<string, ParkedSnapshot>()
  let generation = 0
  let parkedEntries = 0
  function remove(key: string) {
    const parked = snapshots.get(key)
    if (parked) {
      parkedEntries -= parked.entries
      snapshots.delete(key)
    }
    return parked
  }
  function shrinkOldest() {
    for (const parked of snapshots.values()) {
      if (parked.shrunk || !parked.shrinkers.size)
        continue
      parked.shrunk = true
      for (const [field, shrink] of parked.shrinkers) {
        if (Object.hasOwn(parked.values, field))
          parked.values[field] = shrink(parked.values[field])
      }
      const entries = estimateSnapshotEntries(parked.values)
      parkedEntries += entries - parked.entries
      parked.entries = entries
      return true
    }
    return false
  }
  return {
    get generation() { return generation },
    get parkedEntries() { return parkedEntries },
    take(key: string) {
      return remove(key)?.values
    },
    save(key: string, snapshot: HomeTabSnapshot, version: number, shrinkers = new Map<string, HomeTabSnapshotShrinker>()) {
      if (version !== generation)
        return
      remove(key)
      const entries = estimateSnapshotEntries(snapshot)
      snapshots.set(key, { values: snapshot, entries, shrinkers, shrunk: false })
      parkedEntries += entries
      while (snapshots.size > MAX_HOME_TAB_SNAPSHOTS)
        remove(snapshots.keys().next().value!)
      while (parkedEntries > entryBudget && snapshots.size > 0) {
        if (!shrinkOldest())
          remove(snapshots.keys().next().value!)
      }
    },
    clear() {
      generation++
      snapshots.clear()
      parkedEntries = 0
    },
  }
}

interface HomeTabCacheContext {
  cache: ReturnType<typeof createHomeTabCache>
  activeKey: () => string
  restoreScroll: () => boolean | void
  getContentScrollTop: () => number
}

const homeTabCacheKey: InjectionKey<HomeTabCacheContext> = Symbol('home-tab-data-cache')
const homeTabStateKey: InjectionKey<HomeTabState> = Symbol('home-tab-state')

export function provideHomeTabCache(activeKey: () => string, restoreScroll: () => boolean | void, getContentScrollTop: () => number) {
  const cache = createHomeTabCache()
  provide(homeTabCacheKey, { cache, activeKey, restoreScroll, getContentScrollTop })
  return cache
}

/** Only durable data is registered; loading, requests, timers, and element refs remain local. */
export function useHomeTabState() {
  const context = inject(homeTabCacheKey, undefined)
  const ownerKey = context?.activeKey() ?? ''
  const generation = context?.cache.generation ?? 0
  let snapshot = context?.cache.take(ownerKey)
  const fields = new Map<string, () => unknown>()
  const shrinkers = new Map<string, HomeTabSnapshotShrinker>()
  let disposed = false
  let active = true
  onActivated(() => {
    active = true
  })
  onDeactivated(() => {
    active = false
  })

  function read<T>(key: string, initial: T): T {
    return snapshot && Object.hasOwn(snapshot, key) ? snapshot[key] as T : initial
  }
  function take<T>(key: string, initial: T): T {
    const value = read(key, initial)
    if (snapshot)
      delete snapshot[key]
    return value
  }
  function capture(key: string, getValue: () => unknown, options?: { shrink?: HomeTabSnapshotShrinker }) {
    fields.set(key, getValue)
    if (options?.shrink)
      shrinkers.set(key, options.shrink)
    return () => {
      if (disposed || fields.get(key) !== getValue || (context && context.cache.generation !== generation))
        return
      const value = toRaw(getValue())
      fields.set(key, () => value)
    }
  }
  function isActiveTab() {
    return !context || (context.activeKey() === ownerKey && context.cache.generation === generation)
  }
  function isCurrent() {
    return !disposed && active && isActiveTab()
  }
  const state = {
    enabled: !!context,
    restored: !!snapshot,
    read,
    take,
    capture,
    isCurrent,
    isActiveTab,
    getContentScrollTop: () => context?.getContentScrollTop() ?? 0,
    ref<T>(key: string, initial: T): Ref<T> {
      const value = ref(take(key, initial)) as Ref<T>
      capture(key, () => value.value)
      return value
    },
    /**
     * For large display collections, raw read-only data and snapshots with an
     * immutable update contract: replace the root to publish a change.
     */
    shallowRef<T>(key: string, initial: T): ShallowRef<T> {
      const value = shallowRef(take(key, initial)) as ShallowRef<T>
      capture(key, () => value.value)
      return value
    },
    reactive<T extends object>(key: string, initial: T): T {
      const value = reactive(take(key, initial)) as T
      capture(key, () => value)
      return value
    },
    restoreScroll() {
      if (isCurrent())
        return context?.restoreScroll()
    },
  }
  provide(homeTabStateKey, state)
  // Descendants and mounted hooks finish restoring before dropping unused fields.
  onMounted(() => {
    void nextTick(() => {
      snapshot = undefined
    })
  })
  onBeforeUnmount(() => {
    disposed = true
    if (context && context.cache.generation === generation)
      context.cache.save(ownerKey, Object.fromEntries([...fields].map(([key, getValue]) => [key, toRaw(getValue())])), generation, shrinkers)
    fields.clear()
    shrinkers.clear()
    snapshot = undefined
  })
  return state
}

export type HomeTabState = ReturnType<typeof useHomeTabState>

export function useHomeTabViewState() {
  return inject(homeTabStateKey, undefined)
}
