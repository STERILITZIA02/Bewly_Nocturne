import type { MaybeRefOrGetter } from 'vue'
import { computed, reactive, ref, toValue, watch } from 'vue'

import type { ReplyNotificationApiResponse } from '~/background/notificationJson'

import type { DisplayReplyNotification } from '../replyNotification'
import { transformReplyNotification } from '../replyNotification'

export type ReplyFeedErrorKind
  = | 'login-required'
    | 'risk-control'
    | 'network'
    | 'invalid-response'
    | 'api-error'

export interface ReplyFeedState {
  items: DisplayReplyNotification[]
  cursorId: string
  cursorTime: number
  loading: boolean
  loadingMore: boolean
  loaded: boolean
  noMore: boolean
  errorKind: ReplyFeedErrorKind | null
  generation: number
  scrollTop: number
  lastReadMarker: string
}

export interface ReplyReadCandidate {
  marker: string
  mid: string
  generation: number
}

interface ReplyPageParams {
  id?: string
  reply_time?: number
}

interface ReplyPageResult {
  items: DisplayReplyNotification[]
  cursorId: string
  cursorTime: number
  noMore: boolean
}

interface ReplyFeedOptions {
  fetchPage: (params?: ReplyPageParams) => Promise<unknown>
}

type UnknownRecord = Record<string, unknown>

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === 'object' ? value as UnknownRecord : null
}

function toStringIdentifier(value: unknown): string {
  if (typeof value === 'string')
    return value
  if (typeof value === 'number' && Number.isFinite(value))
    return String(value)
  return ''
}

function classifyApiError(response: ReplyNotificationApiResponse): ReplyFeedErrorKind | null {
  if (response.bewlyError)
    return response.bewlyError.kind
  if (response.code === 0)
    return null
  if (response.code === -101)
    return 'login-required'
  if (response.code === -412 || response.code === -403)
    return 'risk-control'
  return 'api-error'
}

function dedupeReplyNotifications(items: DisplayReplyNotification[]): DisplayReplyNotification[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (seen.has(item.id))
      return false
    seen.add(item.id)
    return true
  })
}

function parseReplyPage(value: unknown): { page?: ReplyPageResult, errorKind?: ReplyFeedErrorKind } {
  const response = asRecord(value) as ReplyNotificationApiResponse | null
  if (!response || typeof response.code !== 'number')
    return { errorKind: 'invalid-response' }

  const apiError = classifyApiError(response)
  if (apiError)
    return { errorKind: apiError }

  const data = asRecord(response.data)
  const cursor = asRecord(data?.cursor)
  const rawItems = data?.items
  if (!data || !cursor || (rawItems !== undefined && rawItems !== null && !Array.isArray(rawItems)))
    return { errorKind: 'invalid-response' }

  const lastViewAt = typeof data.last_view_at === 'number' && Number.isFinite(data.last_view_at)
    ? data.last_view_at
    : 0
  const items = dedupeReplyNotifications((Array.isArray(rawItems) ? rawItems : [])
    .map(transformReplyNotification)
    .filter((item): item is DisplayReplyNotification => item !== null)
    .map(item => ({
      ...item,
      unread: item.timestamp > lastViewAt,
    })))

  const cursorTime = typeof cursor.time === 'number' && Number.isFinite(cursor.time)
    ? cursor.time
    : 0
  const cursorId = toStringIdentifier(cursor.id)
  const noMore = cursor.is_end === true || cursor.is_end === 1
  if (!noMore && (!cursorId || cursorTime <= 0))
    return { errorKind: 'invalid-response' }

  return {
    page: {
      items,
      cursorId,
      cursorTime,
      noMore,
    },
  }
}

export function useReplyNotifications(
  mid: MaybeRefOrGetter<string>,
  options: ReplyFeedOptions,
) {
  const fetchPage = options.fetchPage
  const resolvedMid = computed(() => toValue(mid))
  const accountMid = ref(resolvedMid.value)
  const readCandidate = ref<ReplyReadCandidate | null>(null)
  const state = reactive<ReplyFeedState>({
    items: [],
    cursorId: '',
    cursorTime: 0,
    loading: false,
    loadingMore: false,
    loaded: false,
    noMore: false,
    errorKind: null,
    generation: 0,
    scrollTop: 0,
    lastReadMarker: '',
  })

  let initialRequest: Promise<void> | null = null
  let loadMoreRequest: Promise<void> | null = null

  function resetForAccount(nextMid: string, preserveReadMarker = false) {
    const lastReadMarker = state.lastReadMarker
    state.generation++
    accountMid.value = nextMid
    state.items.splice(0)
    state.cursorId = ''
    state.cursorTime = 0
    state.loading = false
    state.loadingMore = false
    state.loaded = false
    state.noMore = false
    state.errorKind = null
    state.scrollTop = 0
    state.lastReadMarker = preserveReadMarker ? lastReadMarker : ''
    readCandidate.value = null
    initialRequest = null
    loadMoreRequest = null
  }

  function isCurrentRequest(requestGeneration: number, requestMid: string): boolean {
    return requestGeneration === state.generation && requestMid === accountMid.value
  }

  async function requestInitialPage(requestGeneration: number, requestMid: string) {
    try {
      const result = parseReplyPage(await fetchPage())
      if (!isCurrentRequest(requestGeneration, requestMid))
        return

      if (!result.page) {
        state.errorKind = result.errorKind ?? 'invalid-response'
        return
      }

      state.items.splice(0, state.items.length, ...result.page.items)
      state.cursorId = result.page.cursorId
      state.cursorTime = result.page.cursorTime
      state.loaded = true
      state.errorKind = null
      state.noMore = result.page.noMore
      readCandidate.value = {
        marker: [
          result.page.cursorId,
          result.page.cursorTime,
          result.page.items[0]?.id ?? 'empty',
          result.page.items.length,
        ].join(':'),
        mid: requestMid,
        generation: requestGeneration,
      }
    }
    catch {
      if (isCurrentRequest(requestGeneration, requestMid))
        state.errorKind = 'network'
    }
    finally {
      if (isCurrentRequest(requestGeneration, requestMid))
        state.loading = false
    }
  }

  function loadInitial(): Promise<void> {
    if (initialRequest)
      return initialRequest
    if (!accountMid.value) {
      state.errorKind = 'login-required'
      return Promise.resolve()
    }

    const requestGeneration = state.generation
    const requestMid = accountMid.value
    state.loading = true
    state.errorKind = null
    const request = requestInitialPage(requestGeneration, requestMid)
    initialRequest = request
    return request.finally(() => {
      if (initialRequest === request)
        initialRequest = null
    })
  }

  async function requestNextPage(requestGeneration: number, requestMid: string) {
    const cursorId = state.cursorId
    const cursorTime = state.cursorTime
    try {
      const result = parseReplyPage(await fetchPage({
        id: cursorId,
        reply_time: cursorTime,
      }))
      if (!isCurrentRequest(requestGeneration, requestMid))
        return

      if (!result.page) {
        state.errorKind = result.errorKind ?? 'invalid-response'
        return
      }

      const existingIds = new Set(state.items.map(item => item.id))
      const newItems = result.page.items.filter((item) => {
        if (existingIds.has(item.id))
          return false
        existingIds.add(item.id)
        return true
      })
      state.items.push(...newItems)
      state.cursorId = result.page.cursorId
      state.cursorTime = result.page.cursorTime
      state.errorKind = null
      state.noMore = result.page.noMore
    }
    catch {
      if (isCurrentRequest(requestGeneration, requestMid))
        state.errorKind = 'network'
    }
    finally {
      if (isCurrentRequest(requestGeneration, requestMid))
        state.loadingMore = false
    }
  }

  function loadMore(): Promise<void> {
    if (loadMoreRequest)
      return loadMoreRequest
    if (!state.loaded || state.loading || state.noMore || !state.cursorId)
      return Promise.resolve()

    const requestGeneration = state.generation
    const requestMid = accountMid.value
    state.loadingMore = true
    state.errorKind = null
    const request = requestNextPage(requestGeneration, requestMid)
    loadMoreRequest = request
    return request.finally(() => {
      if (loadMoreRequest === request)
        loadMoreRequest = null
    })
  }

  function refresh(): Promise<void> {
    const nextMid = resolvedMid.value
    resetForAccount(nextMid, nextMid === accountMid.value)
    return loadInitial()
  }

  function ensureLoaded(): Promise<void> {
    return state.loaded ? Promise.resolve() : loadInitial()
  }

  function isReadCandidateCurrent(candidate: ReplyReadCandidate): boolean {
    return readCandidate.value?.marker === candidate.marker
      && candidate.mid === accountMid.value
      && candidate.generation === state.generation
  }

  function markCandidateReadLocally(candidate: ReplyReadCandidate): boolean {
    if (!isReadCandidateCurrent(candidate))
      return false

    state.items.forEach((item) => {
      item.unread = false
    })
    return true
  }

  function confirmReadCandidate(candidate: ReplyReadCandidate): boolean {
    if (!isReadCandidateCurrent(candidate))
      return false

    state.lastReadMarker = candidate.marker
    return true
  }

  watch(resolvedMid, nextMid => resetForAccount(nextMid))

  return {
    accountMid,
    readCandidate,
    state,
    confirmReadCandidate,
    ensureLoaded,
    isReadCandidateCurrent,
    loadInitial,
    loadMore,
    markCandidateReadLocally,
    refresh,
  }
}
