import type { MaybeRefOrGetter } from 'vue'
import { computed, reactive, ref, toValue, watch } from 'vue'

import type { NotificationApiResponse } from '~/background/notificationJson'

import type { DisplayNotification } from '../notification'
import {
  asNotificationRecord,
  toNotificationIdentifier,
  transformAtNotification,
  transformLikeNotification,
  transformReplyNotification,
} from '../notification'
import type { NativeNotificationSection } from '../notificationSections'

export type NotificationErrorKind
  = | 'login-required'
    | 'risk-control'
    | 'network'
    | 'invalid-response'
    | 'api-error'

export interface NotificationFeedState {
  items: DisplayNotification[]
  cursorId: string
  cursorTime: number
  loading: boolean
  loadingMore: boolean
  loaded: boolean
  noMore: boolean
  errorKind: NotificationErrorKind | null
  generation: number
  scrollTop: number
  lastReadMarker: string
}

export interface NotificationReadCandidate {
  marker: string
  mid: string
  section: NativeNotificationSection
  generation: number
  serverReadCommitted: true
}

export interface NotificationPageParams {
  id?: string
  reply_time?: number
  at_time?: number
  like_time?: number
}

interface NotificationPageResult {
  items: DisplayNotification[]
  cursorId: string
  cursorTime: number
  noMore: boolean
}

interface NotificationFeedOptions {
  fetchPage: (params?: NotificationPageParams) => Promise<unknown>
}

function classifyApiError(response: NotificationApiResponse): NotificationErrorKind | null {
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

function dedupeNotifications(items: DisplayNotification[]): DisplayNotification[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (seen.has(item.id))
      return false
    seen.add(item.id)
    return true
  })
}

function parseReplyPage(data: Record<string, unknown>): NotificationPageResult | null {
  const cursor = asNotificationRecord(data.cursor)
  const rawItems = data.items
  if (!cursor || (rawItems !== undefined && rawItems !== null && !Array.isArray(rawItems)))
    return null

  const lastViewAt = typeof data.last_view_at === 'number' && Number.isFinite(data.last_view_at)
    ? data.last_view_at
    : 0
  const items = dedupeNotifications((Array.isArray(rawItems) ? rawItems : [])
    .map(transformReplyNotification)
    .filter((item): item is DisplayNotification => item !== null)
    .map(item => ({
      ...item,
      unread: item.timestamp > lastViewAt,
    })))

  return parseCursorResult(cursor, items)
}

function parseAtPage(data: Record<string, unknown>): NotificationPageResult | null {
  const cursor = asNotificationRecord(data.cursor)
  const rawItems = data.items
  if (!cursor || (rawItems !== undefined && rawItems !== null && !Array.isArray(rawItems)))
    return null

  const lastViewAt = typeof data.last_view_at === 'number' && Number.isFinite(data.last_view_at)
    ? data.last_view_at
    : 0
  const items = dedupeNotifications((Array.isArray(rawItems) ? rawItems : [])
    .map(transformAtNotification)
    .filter((item): item is DisplayNotification => item !== null)
    .map(item => ({
      ...item,
      unread: item.timestamp > lastViewAt,
    })))

  return parseCursorResult(cursor, items)
}

function parseCursorResult(
  cursor: Record<string, unknown>,
  items: DisplayNotification[],
): NotificationPageResult | null {
  const cursorTime = typeof cursor.time === 'number' && Number.isFinite(cursor.time)
    ? cursor.time
    : 0
  const cursorId = toNotificationIdentifier(cursor.id)
  const noMore = cursor.is_end === true || cursor.is_end === 1
  if (!noMore && (!cursorId || cursorTime <= 0))
    return null

  return { items, cursorId, cursorTime, noMore }
}

function mergeLikeItems(
  latestItems: DisplayNotification[],
  totalItems: DisplayNotification[],
): DisplayNotification[] {
  const totalById = new Map(totalItems.map(item => [item.id, item]))
  const consumed = new Set<string>()
  const mergedLatest = latestItems.map((latestItem) => {
    consumed.add(latestItem.id)
    const totalItem = totalById.get(latestItem.id)
    return totalItem
      ? { ...latestItem, ...totalItem, unread: latestItem.unread }
      : latestItem
  })

  return dedupeNotifications([
    ...mergedLatest,
    ...totalItems.filter(item => !consumed.has(item.id)),
  ])
}

function parseLikePage(data: Record<string, unknown>): NotificationPageResult | null {
  const latest = asNotificationRecord(data.latest)
  const total = asNotificationRecord(data.total)
  const cursor = asNotificationRecord(total?.cursor)
  const rawLatestItems = latest?.items
  const rawTotalItems = total?.items
  if (
    !total
    || !cursor
    || (rawLatestItems !== undefined && rawLatestItems !== null && !Array.isArray(rawLatestItems))
    || (rawTotalItems !== undefined && rawTotalItems !== null && !Array.isArray(rawTotalItems))
  ) {
    return null
  }

  const lastViewAt = typeof latest?.last_view_at === 'number' && Number.isFinite(latest.last_view_at)
    ? latest.last_view_at
    : 0
  const latestItems = dedupeNotifications((Array.isArray(rawLatestItems) ? rawLatestItems : [])
    .map(transformLikeNotification)
    .filter((item): item is DisplayNotification => item !== null)
    .map(item => ({
      ...item,
      unread: lastViewAt === 0 || item.timestamp > lastViewAt,
    })))
  const totalItems = dedupeNotifications((Array.isArray(rawTotalItems) ? rawTotalItems : [])
    .map(transformLikeNotification)
    .filter((item): item is DisplayNotification => item !== null)
    .map(item => ({ ...item, unread: false })))

  return parseCursorResult(cursor, mergeLikeItems(latestItems, totalItems))
}

function parseNotificationPage(
  section: NativeNotificationSection,
  value: unknown,
): { page?: NotificationPageResult, errorKind?: NotificationErrorKind } {
  const response = asNotificationRecord(value) as NotificationApiResponse | null
  if (!response || typeof response.code !== 'number')
    return { errorKind: 'invalid-response' }

  const apiError = classifyApiError(response)
  if (apiError)
    return { errorKind: apiError }

  const data = asNotificationRecord(response.data)
  if (!data)
    return { errorKind: 'invalid-response' }

  const page = section === 'reply'
    ? parseReplyPage(data)
    : section === 'at'
      ? parseAtPage(data)
      : parseLikePage(data)
  return page ? { page } : { errorKind: 'invalid-response' }
}

function buildNextPageParams(
  section: NativeNotificationSection,
  cursorId: string,
  cursorTime: number,
): NotificationPageParams {
  if (section === 'reply')
    return { id: cursorId, reply_time: cursorTime }
  if (section === 'at')
    return { id: cursorId, at_time: cursorTime }
  return { id: cursorId, like_time: cursorTime }
}

export function useNotificationFeed(
  mid: MaybeRefOrGetter<string>,
  section: NativeNotificationSection,
  options: NotificationFeedOptions,
) {
  const fetchPage = options.fetchPage
  const resolvedMid = computed(() => toValue(mid))
  const accountMid = ref(resolvedMid.value)
  const readCandidate = ref<NotificationReadCandidate | null>(null)
  const state = reactive<NotificationFeedState>({
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
      const result = parseNotificationPage(section, await fetchPage())
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
      // The verified message-pc contract commits category read in the
      // successful first-page GET for Reply, At, and Like.
      readCandidate.value = {
        marker: [
          section,
          result.page.cursorId,
          result.page.cursorTime,
          result.page.items[0]?.id ?? 'empty',
          result.page.items.length,
        ].join(':'),
        mid: requestMid,
        section,
        generation: requestGeneration,
        serverReadCommitted: true,
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
      const result = parseNotificationPage(
        section,
        await fetchPage(buildNextPageParams(section, cursorId, cursorTime)),
      )
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

  function isReadCandidateCurrent(candidate: NotificationReadCandidate): boolean {
    return readCandidate.value?.marker === candidate.marker
      && candidate.serverReadCommitted
      && candidate.mid === accountMid.value
      && candidate.section === section
      && candidate.generation === state.generation
  }

  function markCandidateReadLocally(candidate: NotificationReadCandidate): boolean {
    if (!isReadCandidateCurrent(candidate))
      return false

    state.items.forEach((item) => {
      item.unread = false
    })
    return true
  }

  function confirmReadCandidate(candidate: NotificationReadCandidate): boolean {
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
