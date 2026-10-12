import type { Ref } from 'vue'
import { getCurrentScope, onScopeDispose, reactive, watch } from 'vue'

import type { PrivateMessageTransportErrorKind } from '~/background/privateMessage/types'

import type { PrivateRecipientSource, TransientPrivateRecipient } from './privateRecipientSearch'
import {
  buildFollowingRecipientSearchParams,
  buildGlobalRecipientSearchParams,
  canSearchPrivateRecipients,
  mergePrivateRecipientResults,
  normalizePrivateRecipientQuery,
  parseFollowingRecipientSearch,
  parseGlobalRecipientSearch,
} from './privateRecipientSearch'
import { PRIVATE_SEARCH_REQUEST_INTERVAL_MS } from './privateSearchPolicy'

export const PRIVATE_RECIPIENT_SEARCH_CACHE_TTL_MS = 300_000
export const PRIVATE_RECIPIENT_SEARCH_CACHE_LIMIT = 20
export const PRIVATE_RECIPIENT_SEARCH_MAX_PAGES = 3

interface FollowingSearchParams {
  vmid: string
  name: string
  pn: number
  ps: number
}

interface GlobalSearchParams {
  keyword: string
  page: number
  pagesize: number
}

export interface PrivateRecipientSearchDependencies {
  fetchFollowing: (params: FollowingSearchParams) => Promise<unknown>
  fetchGlobal: (params: GlobalSearchParams) => Promise<unknown>
  now?: () => number
}

export interface PrivateRecipientSearchGroup {
  items: TransientPrivateRecipient[]
  page: number
  hasMore: boolean
  errorKind: PrivateMessageTransportErrorKind | null
  loaded: boolean
}

export interface PrivateRecipientSearchState extends PrivateRecipientSearchGroup {
  query: string
  source: PrivateRecipientSource | null
  loading: boolean
  searching: boolean
  complete: boolean
  groups: Record<PrivateRecipientSource, PrivateRecipientSearchGroup>
}

export interface PrivateRecipientSearchController {
  state: PrivateRecipientSearchState
  setQuery: (query: string) => void
  searchFollowing: () => Promise<void>
  searchGlobal: () => Promise<void>
  searchAll: () => Promise<void>
  pause: () => void
  resume: () => Promise<void>
  loadMore: (source?: PrivateRecipientSource) => Promise<void>
  reset: () => void
  cacheSize: () => number
}

interface CachedRecipientSearch {
  items: TransientPrivateRecipient[]
  page: number
  hasMore: boolean
  updatedAt: number
}

interface ActiveRecipientSearch {
  generation: number
  mid: string
  query: string
  source: PrivateRecipientSource
  loadMore: boolean
}

function resolveErrorKind(value: unknown): PrivateMessageTransportErrorKind {
  if (value && typeof value === 'object' && 'bewlyError' in value) {
    const kind = (value as { bewlyError?: { kind?: unknown } }).bewlyError?.kind
    if (typeof kind === 'string')
      return kind as PrivateMessageTransportErrorKind
  }
  return value && typeof value === 'object' && 'code' in value ? 'api-error' : 'invalid-response'
}

export function usePrivateRecipientSearch(
  currentMid: Ref<string>,
  dependencies: PrivateRecipientSearchDependencies,
): PrivateRecipientSearchController {
  const emptyGroup = (): PrivateRecipientSearchGroup => ({ items: [], page: 0, hasMore: false, errorKind: null, loaded: false })
  const groups = reactive({ following: emptyGroup(), global: emptyGroup() })
  const state: PrivateRecipientSearchState = reactive<PrivateRecipientSearchState>({
    query: '',
    source: null,
    loading: false,
    searching: false,
    complete: false,
    groups,
    // Existing source-specific callers still read the active group; the UI renders both groups.
    get items() { return state.source ? groups[state.source].items : [] },
    get page() { return state.source ? groups[state.source].page : 0 },
    get hasMore() { return state.source ? groups[state.source].hasMore : false },
    get errorKind() { return state.source ? groups[state.source].errorKind : null },
    get loaded() { return state.source ? groups[state.source].loaded : false },
  })
  const cache = new Map<string, CachedRecipientSearch>()
  const cacheQueryOrder: string[] = []
  const now = dependencies.now ?? Date.now
  let generation = 0
  let request: Promise<void> | null = null
  let activeRequest: ActiveRecipientSearch | null = null
  let pipeline: { generation: number, promise: Promise<void> } | null = null
  let disposed = false
  let enabled = true
  let pacingTimer: ReturnType<typeof setTimeout> | undefined
  let releasePacing: (() => void) | undefined

  function cancelPacing() {
    clearTimeout(pacingTimer)
    releasePacing?.()
    releasePacing = undefined
  }

  function resetVisibleState() {
    state.source = null
    state.loading = false
    state.searching = false
    state.complete = false
    Object.assign(groups.following, emptyGroup())
    Object.assign(groups.global, emptyGroup())
    cancelPacing()
  }

  function reset() {
    generation++
    state.query = ''
    resetVisibleState()
    cache.clear()
    cacheQueryOrder.length = 0
  }

  function setQuery(query: string) {
    const normalized = normalizePrivateRecipientQuery(query)
    if (normalized === state.query)
      return
    generation++
    state.query = normalized
    resetVisibleState()
  }

  function pause() {
    if (!enabled)
      return
    enabled = false
    generation++
    cancelPacing()
    state.loading = false
    state.searching = false
    syncVisibilityHandler()
  }
  function resume() {
    enabled = true
    syncVisibilityHandler()
    if (state.complete && !groups.following.errorKind && !groups.global.errorKind)
      return Promise.resolve()
    return searchAll()
  }

  function getCacheKey(source: PrivateRecipientSource, query: string) {
    return `${currentMid.value}:${source}:${query.toLocaleLowerCase()}`
  }

  function getQueryCacheKey(query: string) {
    return `${currentMid.value}:${query.toLocaleLowerCase()}`
  }

  function readCache(source: PrivateRecipientSource, query: string): CachedRecipientSearch | null {
    const key = getCacheKey(source, query)
    const cached = cache.get(key)
    if (!cached)
      return null
    if (now() - cached.updatedAt >= PRIVATE_RECIPIENT_SEARCH_CACHE_TTL_MS) {
      cache.delete(key)
      return null
    }
    cache.delete(key)
    cache.set(key, cached)
    return cached
  }

  function writeCache(source: PrivateRecipientSource, query: string) {
    const group = groups[source]
    const key = getCacheKey(source, query)
    const queryKey = getQueryCacheKey(query)
    cache.delete(key)
    cache.set(key, {
      items: [...group.items],
      page: group.page,
      hasMore: group.hasMore,
      updatedAt: now(),
    })
    const queryIndex = cacheQueryOrder.indexOf(queryKey)
    if (queryIndex >= 0)
      cacheQueryOrder.splice(queryIndex, 1)
    cacheQueryOrder.push(queryKey)
    while (cacheQueryOrder.length > PRIVATE_RECIPIENT_SEARCH_CACHE_LIMIT) {
      const evictedQuery = cacheQueryOrder.shift()
      if (!evictedQuery)
        break
      const separatorIndex = evictedQuery.indexOf(':')
      const mid = evictedQuery.slice(0, separatorIndex)
      const normalizedQuery = evictedQuery.slice(separatorIndex + 1)
      cache.delete(`${mid}:following:${normalizedQuery}`)
      cache.delete(`${mid}:global:${normalizedQuery}`)
    }
  }

  function applyCached(source: PrivateRecipientSource, cached: CachedRecipientSearch) {
    state.source = source
    Object.assign(groups[source], { items: [...cached.items], page: cached.page, hasMore: cached.hasMore, errorKind: null, loaded: true })
  }

  function search(source: PrivateRecipientSource, loadMore: boolean): Promise<void> {
    const query = state.query
    const mid = currentMid.value
    const queuedGeneration = generation
    if (disposed || !enabled || !mid || !canSearchPrivateRecipients(query))
      return Promise.resolve()

    if (request) {
      if (
        activeRequest?.mid === mid
        && activeRequest.generation === generation
        && activeRequest.query === query
        && activeRequest.source === source
        && activeRequest.loadMore === loadMore
      ) {
        return request
      }
      return request.then(() => {
        if (disposed || queuedGeneration !== generation || mid !== currentMid.value || query !== state.query)
          return
        return search(source, loadMore)
      })
    }

    if (!loadMore) {
      const cached = readCache(source, query)
      if (cached) {
        applyCached(source, cached)
        return Promise.resolve()
      }
    }

    const group = groups[source]
    const page = loadMore ? group.page + 1 : 1
    if (source === 'global' && page > PRIVATE_RECIPIENT_SEARCH_MAX_PAGES)
      return Promise.resolve()
    const requestGeneration = generation
    const task = (async () => {
      state.loading = true
      state.source = source
      group.errorKind = null
      try {
        const response = source === 'following'
          ? await dependencies.fetchFollowing(buildFollowingRecipientSearchParams(mid, query, page))
          : await dependencies.fetchGlobal(buildGlobalRecipientSearchParams(query, page))
        const parsed = source === 'following'
          ? parseFollowingRecipientSearch(response, page)
          : parseGlobalRecipientSearch(response, page)
        if (!parsed)
          throw response
        if (
          requestGeneration !== generation
          || mid !== currentMid.value
          || query !== state.query
        ) {
          return
        }
        const previousCount = group.items.length
        group.items = loadMore
          ? mergePrivateRecipientResults(group.items, parsed.items, source === 'following' ? Infinity : 30)
          : parsed.items.slice(0, source === 'following' ? undefined : 30)
        if (loadMore && group.items.length === previousCount && parsed.hasMore) {
          group.hasMore = false
          group.errorKind = 'invalid-response'
          return
        }
        group.page = page
        group.hasMore = parsed.hasMore
          && (source === 'following' || (page < PRIVATE_RECIPIENT_SEARCH_MAX_PAGES && group.items.length < 30))
          && (!loadMore || group.items.length > previousCount)
        group.errorKind = null
        group.loaded = true
        writeCache(source, query)
      }
      catch (error) {
        if (requestGeneration === generation && mid === currentMid.value)
          group.errorKind = resolveErrorKind(error)
      }
      finally {
        if (requestGeneration === generation && mid === currentMid.value)
          state.loading = false
      }
    })().finally(() => {
      if (request === task) {
        request = null
        activeRequest = null
      }
    })
    activeRequest = { generation, mid, query, source, loadMore }
    request = task
    return task
  }

  function searchFollowing() {
    return search('following', false)
  }

  function searchGlobal() {
    return search('global', false)
  }

  function loadMore(source = state.source ?? undefined) {
    if (!source || !groups[source].hasMore || state.loading || state.searching)
      return Promise.resolve()
    return search(source, true)
  }

  function searchAll(): Promise<void> {
    if (pipeline?.generation === generation)
      return pipeline.promise
    const epoch = generation
    const account = currentMid.value
    const current = () => !disposed && enabled && generation === epoch && currentMid.value === account
      && (typeof document === 'undefined' || !document.hidden)
    if (!account || !state.query || !current())
      return Promise.resolve()
    state.searching = true
    state.complete = false
    const task = (async () => {
      try {
        await search('following', Boolean(groups.following.loaded && groups.following.errorKind))
        while (current() && groups.following.hasMore && !groups.following.errorKind) {
          await new Promise<void>((resolve) => {
            releasePacing = resolve
            pacingTimer = setTimeout(() => {
              releasePacing = undefined
              resolve()
            }, PRIVATE_SEARCH_REQUEST_INTERVAL_MS)
          })
          if (current())
            await search('following', true)
        }
        if (!current())
          return
        // A following-service failure must not hide usable global results.
        await search('global', Boolean(groups.global.loaded && groups.global.errorKind))
        if (current())
          state.complete = true
      }
      finally {
        if (generation === epoch)
          state.searching = false
      }
    })().finally(() => {
      if (pipeline?.promise === task)
        pipeline = null
    })
    pipeline = { generation: epoch, promise: task }
    return task
  }

  function handleVisibility() {
    if (document.hidden) {
      generation++
      cancelPacing()
      state.loading = false
      state.searching = false
    }
    else if (enabled && state.query && !state.complete) {
      void searchAll()
    }
  }

  function syncVisibilityHandler() {
    if (typeof document === 'undefined')
      return
    document.removeEventListener('visibilitychange', handleVisibility)
    if (enabled && state.query)
      document.addEventListener('visibilitychange', handleVisibility)
  }

  watch(currentMid, reset, { flush: 'sync' })
  if (getCurrentScope()) {
    watch(() => state.query, syncVisibilityHandler, { flush: 'sync' })
    onScopeDispose(() => {
      disposed = true
      reset()
      document.removeEventListener('visibilitychange', handleVisibility)
    })
  }

  return {
    state,
    setQuery,
    searchFollowing,
    searchGlobal,
    searchAll,
    pause,
    resume,
    loadMore,
    reset,
    cacheSize: () => cache.size,
  }
}
