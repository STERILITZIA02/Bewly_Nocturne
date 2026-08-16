import type { Ref } from 'vue'
import { reactive, watch } from 'vue'

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

export interface PrivateRecipientSearchState {
  query: string
  source: PrivateRecipientSource | null
  items: TransientPrivateRecipient[]
  loading: boolean
  page: number
  hasMore: boolean
  errorKind: PrivateMessageTransportErrorKind | null
}

export interface PrivateRecipientSearchController {
  state: PrivateRecipientSearchState
  setQuery: (query: string) => void
  searchFollowing: () => Promise<void>
  searchGlobal: () => Promise<void>
  loadMore: () => Promise<void>
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
  const state = reactive<PrivateRecipientSearchState>({
    query: '',
    source: null,
    items: [],
    loading: false,
    page: 0,
    hasMore: false,
    errorKind: null,
  })
  const cache = new Map<string, CachedRecipientSearch>()
  const cacheQueryOrder: string[] = []
  const now = dependencies.now ?? Date.now
  let generation = 0
  let request: Promise<void> | null = null
  let activeRequest: ActiveRecipientSearch | null = null

  function resetVisibleState() {
    state.source = null
    state.items = []
    state.loading = false
    state.page = 0
    state.hasMore = false
    state.errorKind = null
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
    const key = getCacheKey(source, query)
    const queryKey = getQueryCacheKey(query)
    cache.delete(key)
    cache.set(key, {
      items: [...state.items],
      page: state.page,
      hasMore: state.hasMore,
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
    state.items = [...cached.items]
    state.page = cached.page
    state.hasMore = cached.hasMore
    state.errorKind = null
  }

  function search(source: PrivateRecipientSource, loadMore: boolean): Promise<void> {
    const query = state.query
    const mid = currentMid.value
    if (!mid || !canSearchPrivateRecipients(query))
      return Promise.resolve()

    if (request) {
      if (
        activeRequest?.mid === mid
        && activeRequest.query === query
        && activeRequest.source === source
        && activeRequest.loadMore === loadMore
      ) {
        return request
      }
      return request.then(() => {
        if (mid !== currentMid.value || query !== state.query)
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

    const page = loadMore && state.source === source ? state.page + 1 : 1
    if (page > PRIVATE_RECIPIENT_SEARCH_MAX_PAGES)
      return Promise.resolve()
    const requestGeneration = generation
    const task = (async () => {
      state.loading = true
      state.errorKind = null
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
        state.source = source
        state.items = loadMore && state.source === source
          ? mergePrivateRecipientResults(state.items, parsed.items)
          : parsed.items.slice(0, 30)
        state.page = page
        state.hasMore = parsed.hasMore
          && page < PRIVATE_RECIPIENT_SEARCH_MAX_PAGES
          && state.items.length < 30
        state.errorKind = null
        writeCache(source, query)
      }
      catch (error) {
        if (requestGeneration === generation && mid === currentMid.value)
          state.errorKind = resolveErrorKind(error)
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
    activeRequest = { mid, query, source, loadMore }
    request = task
    return task
  }

  function searchFollowing() {
    return search('following', false)
  }

  function searchGlobal() {
    return search('global', false)
  }

  function loadMore() {
    if (!state.source || !state.hasMore || state.loading)
      return Promise.resolve()
    return search(state.source, true)
  }

  watch(currentMid, reset, { flush: 'sync' })

  return {
    state,
    setQuery,
    searchFollowing,
    searchGlobal,
    loadMore,
    reset,
    cacheSize: () => cache.size,
  }
}
