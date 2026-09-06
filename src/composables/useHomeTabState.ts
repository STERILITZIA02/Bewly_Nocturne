import type { InjectionKey, Ref } from 'vue'
import { inject, onActivated, onBeforeUnmount, onDeactivated, provide, reactive, ref, toRaw } from 'vue'

export type HomeTabSnapshot = Record<string, unknown>
// Eight tabs, two Following layouts and three recommendation modes fit without eviction.
const MAX_HOME_TAB_SNAPSHOTS = 12

/** Exclusive transfer of data ownership: take removes the inactive snapshot. No JSON copy or DOM is cached. */
export function createHomeTabCache() {
  const snapshots = new Map<string, HomeTabSnapshot>()
  let generation = 0
  return {
    get generation() { return generation },
    take(key: string) {
      const snapshot = snapshots.get(key)
      snapshots.delete(key)
      return snapshot
    },
    save(key: string, snapshot: HomeTabSnapshot, version: number) {
      if (version !== generation)
        return
      snapshots.delete(key)
      snapshots.set(key, snapshot)
      while (snapshots.size > MAX_HOME_TAB_SNAPSHOTS)
        snapshots.delete(snapshots.keys().next().value!)
    },
    clear() {
      generation++
      snapshots.clear()
    },
  }
}

interface HomeTabCacheContext {
  cache: ReturnType<typeof createHomeTabCache>
  activeKey: () => string
  restoreScroll: () => void
}

const homeTabCacheKey: InjectionKey<HomeTabCacheContext> = Symbol('home-tab-data-cache')
const homeTabStateKey: InjectionKey<HomeTabState> = Symbol('home-tab-state')

export function provideHomeTabCache(activeKey: () => string, restoreScroll: () => void) {
  const cache = createHomeTabCache()
  provide(homeTabCacheKey, { cache, activeKey, restoreScroll })
  return cache
}

/** Only durable data is registered; loading, requests, timers, and element refs remain local. */
export function useHomeTabState() {
  const context = inject(homeTabCacheKey, undefined)
  const ownerKey = context?.activeKey() ?? ''
  const generation = context?.cache.generation ?? 0
  const snapshot = context?.cache.take(ownerKey)
  const fields = new Map<string, () => unknown>()
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
  function capture(key: string, getValue: () => unknown) {
    fields.set(key, getValue)
    return () => {
      if (disposed || fields.get(key) !== getValue)
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
    take<T>(key: string, initial: T): T {
      const value = read(key, initial)
      if (snapshot)
        delete snapshot[key]
      return value
    },
    capture,
    isCurrent,
    isActiveTab,
    ref<T>(key: string, initial: T): Ref<T> {
      const value = ref(read(key, initial)) as Ref<T>
      capture(key, () => value.value)
      return value
    },
    reactive<T extends object>(key: string, initial: T): T {
      const value = reactive(read(key, initial)) as T
      capture(key, () => value)
      return value
    },
    restoreScroll() {
      if (isCurrent())
        context?.restoreScroll()
    },
  }
  provide(homeTabStateKey, state)
  onBeforeUnmount(() => {
    disposed = true
    if (context)
      context.cache.save(ownerKey, Object.fromEntries([...fields].map(([key, getValue]) => [key, toRaw(getValue())])), generation)
    fields.clear()
  })
  return state
}

export type HomeTabState = ReturnType<typeof useHomeTabState>

export function useHomeTabViewState() {
  return inject(homeTabStateKey, undefined)
}
