import type { ComputedRef, Ref } from 'vue'
import { computed, reactive, ref, watch } from 'vue'

import type {
  PrivateMessageApiResponse,
  PrivateMessageTransportErrorKind,
  PrivateSession,
  PrivateSessionsData,
} from '~/background/privateMessage/types'

import { comparePrivateMessageSeqno } from './privateMessage'
import type { DisplayPrivateSession, PrivateUserCard } from './privateSession'
import {
  appendPrivateSessions,
  collectPrivateSessionUids,
  extractPrivateUserCards,
  getPrivateSessionTimeBounds,
  isNativePrivateSession,
  mergePrivateSessions,
  transformPrivateSessions,
} from './privateSession'

export type PrivateSessionsFailedOperation = 'initial' | 'refresh' | 'incremental' | 'load-more' | null

export const PRIVATE_SESSION_CARD_BATCH_SIZE = 30
export const PRIVATE_USER_CARD_CACHE_TTL_MS = 600_000
export const PRIVATE_SESSION_VISIBILITY_STALE_TIME_MS = 60_000
export const PRIVATE_SESSION_ACTIVATE_STALE_TIME_MS = 300_000

export interface PrivateSessionsState {
  items: DisplayPrivateSession[]
  loading: boolean
  refreshing: boolean
  loadingMore: boolean
  loaded: boolean
  noMore: boolean
  paginationStalled: boolean
  errorKind: PrivateMessageTransportErrorKind | null
  failedOperation: PrivateSessionsFailedOperation
  generation: number
  lastObservedUnreadCount: number
  oldestSessionTs: number
  newestSessionTs: number
  loadedPageCount: number
  loadedAt: number
  scrollTop: number
}

export interface PrivateSessionsDependencies {
  fetchSessions: () => Promise<unknown>
  fetchOlderSessions: (endTs: number) => Promise<unknown>
  fetchNewSessions: (beginTs: number) => Promise<unknown>
  fetchUserCards: (uids: string[]) => Promise<unknown>
  getFallbackName?: (talkerId: string) => string
  now?: () => number
}

export interface PrivateSessionsController {
  state: PrivateSessionsState
  selectedSessionKey: Ref<string>
  selectedTalkerId: ComputedRef<string>
  loadInitial: () => Promise<void>
  loadMore: (options?: { retry?: boolean }) => Promise<void>
  refresh: () => Promise<void>
  refreshNew: () => Promise<void>
  invalidatePendingRequests: () => void
  refreshIfStale: () => Promise<void>
  activate: (unreadCount: number) => Promise<void>
  retryFailed: () => Promise<void>
  observeUnreadCount: (unreadCount: number) => Promise<void>
  updateScrollTop: (scrollTop: number) => void
  selectSession: (session: DisplayPrivateSession) => void
  clearSelectedSession: () => void
  markSessionRead: (talkerId: string, ackSeqno: string) => void
  markSessionSent: (talkerId: string, summary: string, timestamp: number) => void
}

interface ExtractedSessions {
  hasMore: number
  sessions: PrivateSession[]
}

interface CachedPrivateUserCard extends PrivateUserCard {
  updatedAt: number
}

function asResponse(value: unknown): PrivateMessageApiResponse<unknown> | null {
  if (!value || typeof value !== 'object')
    return null
  const response = value as Partial<PrivateMessageApiResponse<unknown>>
  return typeof response.code === 'number' ? response as PrivateMessageApiResponse<unknown> : null
}

function extractSessions(response: unknown): ExtractedSessions | null {
  const parsed = asResponse(response)
  if (!parsed || parsed.code !== 0 || !parsed.data || typeof parsed.data !== 'object')
    return null
  const data = parsed.data as Partial<PrivateSessionsData>
  if (!Array.isArray(data.session_list))
    return null
  return {
    sessions: data.session_list,
    hasMore: typeof data.has_more === 'number' && Number.isFinite(data.has_more)
      ? data.has_more
      : 0,
  }
}

function resolveErrorKind(response: unknown): PrivateMessageTransportErrorKind {
  const parsed = asResponse(response)
  return parsed?.bewlyError?.kind ?? (parsed ? 'api-error' : 'invalid-response')
}

function chunkPrivateSessionUids(uids: string[]): string[][] {
  const chunks: string[][] = []
  for (let index = 0; index < uids.length; index += PRIVATE_SESSION_CARD_BATCH_SIZE)
    chunks.push(uids.slice(index, index + PRIVATE_SESSION_CARD_BATCH_SIZE))
  return chunks
}

function normalizeUnreadCount(unreadCount: number): number {
  return Number.isFinite(unreadCount)
    ? Math.max(0, Math.trunc(unreadCount))
    : 0
}

function createState(): PrivateSessionsState {
  return reactive({
    items: [],
    loading: false,
    refreshing: false,
    loadingMore: false,
    loaded: false,
    noMore: false,
    paginationStalled: false,
    errorKind: null,
    failedOperation: null,
    generation: 0,
    lastObservedUnreadCount: -1,
    oldestSessionTs: 0,
    newestSessionTs: 0,
    loadedPageCount: 0,
    loadedAt: 0,
    scrollTop: 0,
  })
}

export function usePrivateSessions(
  currentMid: Ref<string>,
  dependencies: PrivateSessionsDependencies,
): PrivateSessionsController {
  const state = createState()
  const selectedSessionKey = ref('')
  const selectedTalkerId = computed(() => (
    state.items.find(item => item.key === selectedSessionKey.value)?.talkerId ?? ''
  ))
  const userCardCache = new Map<string, CachedPrivateUserCard>()
  const confirmedAckSeqnos = new Map<string, string>()
  const now = dependencies.now ?? Date.now
  let firstPageRequest: Promise<void> | null = null
  let olderSessionsRequest: Promise<void> | null = null
  let newSessionsRequest: Promise<void> | null = null
  let contentGeneration = 0
  let incrementalGeneration = 0

  function isCurrentRequest(
    mid: string,
    generation: number,
    expectedContentGeneration: number,
  ): boolean {
    return generation === state.generation
      && mid === currentMid.value
      && expectedContentGeneration === contentGeneration
  }

  function clearFailure(operation: Exclude<PrivateSessionsFailedOperation, null>) {
    if (state.failedOperation !== operation)
      return
    state.errorKind = null
    state.failedOperation = null
  }

  function recordFailure(
    operation: Exclude<PrivateSessionsFailedOperation, null>,
    response: unknown,
  ) {
    state.errorKind = resolveErrorKind(response)
    state.failedOperation = operation
  }

  function updateBounds() {
    const bounds = getPrivateSessionTimeBounds(state.items)
    state.oldestSessionTs = bounds.oldestSessionTs
    state.newestSessionTs = bounds.newestSessionTs
  }

  function resetForAccount() {
    state.generation++
    state.items = []
    state.loading = false
    state.refreshing = false
    state.loadingMore = false
    state.loaded = false
    state.noMore = false
    state.paginationStalled = false
    state.errorKind = null
    state.failedOperation = null
    state.lastObservedUnreadCount = -1
    state.oldestSessionTs = 0
    state.newestSessionTs = 0
    state.loadedPageCount = 0
    state.loadedAt = 0
    state.scrollTop = 0
    selectedSessionKey.value = ''
    userCardCache.clear()
    confirmedAckSeqnos.clear()
    contentGeneration++
    incrementalGeneration++
    firstPageRequest = null
    olderSessionsRequest = null
    newSessionsRequest = null
  }

  function preserveConfirmedReadState(items: DisplayPrivateSession[]): DisplayPrivateSession[] {
    return items.map((item) => {
      const confirmedAckSeqno = confirmedAckSeqnos.get(item.key)
      if (!confirmedAckSeqno || !item.maxSeqno)
        return item
      if (comparePrivateMessageSeqno(item.maxSeqno, confirmedAckSeqno) > 0) {
        confirmedAckSeqnos.delete(item.key)
        return item
      }
      if (item.unreadCount === 0 && comparePrivateMessageSeqno(item.ackSeqno, confirmedAckSeqno) >= 0)
        return item
      return {
        ...item,
        unreadCount: 0,
        ackSeqno: confirmedAckSeqno,
        original: {
          ...item.original,
          unread_count: 0,
          ack_seqno: confirmedAckSeqno,
        },
      }
    })
  }

  async function enrichSessions(
    sessions: PrivateSession[],
    mid: string,
    generation: number,
    requestContentGeneration: number,
  ): Promise<DisplayPrivateSession[]> {
    const requestedAt = now()
    const uids = collectPrivateSessionUids(sessions)
    const missingUids = uids.filter((uid) => {
      const cached = userCardCache.get(uid)
      return !cached || requestedAt - cached.updatedAt >= PRIVATE_USER_CARD_CACHE_TTL_MS
    })
    const chunks = chunkPrivateSessionUids(missingUids)
    const cardResults = await Promise.allSettled(
      chunks.map(chunk => dependencies.fetchUserCards(chunk)),
    )

    if (!isCurrentRequest(mid, generation, requestContentGeneration))
      return []

    for (const [index, result] of cardResults.entries()) {
      if (result.status !== 'fulfilled' || asResponse(result.value)?.code !== 0)
        continue
      const cards = new Map(extractPrivateUserCards(result.value).map(card => [card.mid, card]))
      for (const uid of chunks[index] ?? []) {
        const card = cards.get(uid)
        userCardCache.set(uid, {
          mid: uid,
          name: card?.name ?? '',
          avatar: card?.avatar ?? '',
          updatedAt: requestedAt,
        })
      }
    }

    const cachedCardsResponse = {
      code: 0,
      data: uids.flatMap((uid) => {
        const card = userCardCache.get(uid)
        return card
          ? [{ mid: card.mid, name: card.name, face: card.avatar }]
          : []
      }),
    }
    return transformPrivateSessions(
      sessions,
      cachedCardsResponse,
      dependencies.getFallbackName,
    )
  }

  async function requestFirstPage(operation: 'initial' | 'refresh'): Promise<void> {
    if (firstPageRequest)
      return firstPageRequest

    const mid = currentMid.value
    if (!mid)
      return
    const generation = state.generation
    const requestContentGeneration = ++contentGeneration
    state.loadingMore = false
    olderSessionsRequest = null
    newSessionsRequest = null
    clearFailure(operation)

    const request = (async () => {
      state.loading = !state.loaded
      state.refreshing = state.loaded
      try {
        const response = await dependencies.fetchSessions()
        const page = extractSessions(response)
        if (!page)
          throw response
        if (!isCurrentRequest(mid, generation, requestContentGeneration))
          return
        const incoming = preserveConfirmedReadState(await enrichSessions(
          page.sessions,
          mid,
          generation,
          requestContentGeneration,
        ))
        if (!isCurrentRequest(mid, generation, requestContentGeneration))
          return

        state.items = incoming
        state.loaded = true
        state.noMore = page.hasMore === 0
        state.paginationStalled = false
        state.loadedPageCount = 1
        state.loadedAt = now()
        updateBounds()
        state.errorKind = null
        state.failedOperation = null

        if (
          selectedSessionKey.value
          && !state.items.some(item => item.key === selectedSessionKey.value)
        ) {
          selectedSessionKey.value = ''
        }
      }
      catch (response) {
        if (isCurrentRequest(mid, generation, requestContentGeneration))
          recordFailure(operation, response)
      }
      finally {
        if (isCurrentRequest(mid, generation, requestContentGeneration)) {
          state.loading = false
          state.refreshing = false
        }
      }
    })().finally(() => {
      if (firstPageRequest === request)
        firstPageRequest = null
    })

    firstPageRequest = request
    return request
  }

  function loadInitial(): Promise<void> {
    if (state.loaded)
      return Promise.resolve()
    return requestFirstPage('initial')
  }

  async function refreshNew(): Promise<void> {
    if (!state.loaded)
      return loadInitial()
    if (firstPageRequest)
      return firstPageRequest
    if (newSessionsRequest)
      return newSessionsRequest
    if (state.newestSessionTs <= 0)
      return requestFirstPage('refresh')

    const mid = currentMid.value
    if (!mid)
      return
    const generation = state.generation
    const requestContentGeneration = contentGeneration
    const requestIncrementalGeneration = incrementalGeneration
    const beginTs = state.newestSessionTs
    clearFailure('incremental')

    const request = (async () => {
      state.refreshing = true
      try {
        const response = await dependencies.fetchNewSessions(beginTs)
        const page = extractSessions(response)
        if (!page)
          throw response
        if (
          requestIncrementalGeneration !== incrementalGeneration
          || !isCurrentRequest(mid, generation, requestContentGeneration)
        ) {
          return
        }
        const incoming = preserveConfirmedReadState(await enrichSessions(
          page.sessions,
          mid,
          generation,
          requestContentGeneration,
        ))
        if (
          requestIncrementalGeneration !== incrementalGeneration
          || !isCurrentRequest(mid, generation, requestContentGeneration)
        ) {
          return
        }

        state.items = mergePrivateSessions(state.items, incoming)
        state.loadedAt = now()
        updateBounds()
        clearFailure('incremental')
      }
      catch (response) {
        if (
          requestIncrementalGeneration === incrementalGeneration
          && isCurrentRequest(mid, generation, requestContentGeneration)
        ) {
          recordFailure('incremental', response)
        }
      }
      finally {
        if (
          requestIncrementalGeneration === incrementalGeneration
          && isCurrentRequest(mid, generation, requestContentGeneration)
        ) {
          state.refreshing = false
        }
      }
    })().finally(() => {
      if (newSessionsRequest === request)
        newSessionsRequest = null
    })

    newSessionsRequest = request
    return request
  }

  async function loadMore(options: { retry?: boolean } = {}): Promise<void> {
    if (firstPageRequest)
      return firstPageRequest
    if (!state.loaded || state.noMore || olderSessionsRequest)
      return olderSessionsRequest ?? Promise.resolve()
    if (state.paginationStalled && !options.retry)
      return
    if (state.oldestSessionTs <= 0) {
      state.noMore = true
      return
    }

    const mid = currentMid.value
    if (!mid)
      return
    const generation = state.generation
    const requestContentGeneration = contentGeneration
    const endTs = state.oldestSessionTs
    state.paginationStalled = false
    clearFailure('load-more')

    const request = (async () => {
      state.loadingMore = true
      try {
        const response = await dependencies.fetchOlderSessions(endTs)
        const page = extractSessions(response)
        if (!page)
          throw response
        if (!isCurrentRequest(mid, generation, requestContentGeneration))
          return
        const incoming = preserveConfirmedReadState(await enrichSessions(
          page.sessions,
          mid,
          generation,
          requestContentGeneration,
        ))
        if (!isCurrentRequest(mid, generation, requestContentGeneration))
          return

        const existingKeys = new Set(state.items.map(item => item.key))
        const newItemCount = incoming.filter(item => !existingKeys.has(item.key)).length
        const incomingOldest = getPrivateSessionTimeBounds(incoming).oldestSessionTs
        const madeProgress = newItemCount > 0 || (incomingOldest > 0 && incomingOldest < endTs)

        state.items = appendPrivateSessions(state.items, incoming)
        if (page.hasMore !== 0 && !madeProgress) {
          state.paginationStalled = true
          state.errorKind = 'invalid-response'
          state.failedOperation = 'load-more'
          return
        }

        state.noMore = page.hasMore === 0
        state.loadedPageCount++
        updateBounds()
        clearFailure('load-more')
      }
      catch (response) {
        if (isCurrentRequest(mid, generation, requestContentGeneration))
          recordFailure('load-more', response)
      }
      finally {
        if (isCurrentRequest(mid, generation, requestContentGeneration))
          state.loadingMore = false
      }
    })().finally(() => {
      if (olderSessionsRequest === request)
        olderSessionsRequest = null
    })

    olderSessionsRequest = request
    return request
  }

  function refresh(): Promise<void> {
    return requestFirstPage('refresh')
  }

  function invalidatePendingRequests() {
    contentGeneration++
    incrementalGeneration++
    state.loading = false
    state.refreshing = false
    state.loadingMore = false
    firstPageRequest = null
    olderSessionsRequest = null
    newSessionsRequest = null
  }

  function refreshIfStale(): Promise<void> {
    if (
      !state.loaded
      || state.loadedAt <= 0
      || now() - state.loadedAt >= PRIVATE_SESSION_VISIBILITY_STALE_TIME_MS
    ) {
      return refreshNew()
    }
    return Promise.resolve()
  }

  function activate(unreadCount: number): Promise<void> {
    const normalizedUnreadCount = normalizeUnreadCount(unreadCount)
    const previousUnreadCount = state.lastObservedUnreadCount
    state.lastObservedUnreadCount = normalizedUnreadCount

    if (!state.loaded)
      return loadInitial()
    if (previousUnreadCount >= 0 && previousUnreadCount !== normalizedUnreadCount)
      return refreshNew()
    if (
      state.loadedAt <= 0
      || now() - state.loadedAt >= PRIVATE_SESSION_ACTIVATE_STALE_TIME_MS
    ) {
      return refreshNew()
    }
    return Promise.resolve()
  }

  function observeUnreadCount(unreadCount: number): Promise<void> {
    const normalizedUnreadCount = normalizeUnreadCount(unreadCount)
    const previousUnreadCount = state.lastObservedUnreadCount
    state.lastObservedUnreadCount = normalizedUnreadCount

    if (!state.loaded)
      return loadInitial()
    if (previousUnreadCount >= 0 && previousUnreadCount !== normalizedUnreadCount)
      return refreshNew()
    return Promise.resolve()
  }

  function retryFailed(): Promise<void> {
    if (state.failedOperation === 'load-more')
      return loadMore({ retry: true })
    if (state.failedOperation === 'incremental')
      return refreshNew()
    if (state.failedOperation === 'refresh')
      return requestFirstPage('refresh')
    return loadInitial()
  }

  function selectSession(session: DisplayPrivateSession) {
    if (isNativePrivateSession(session))
      selectedSessionKey.value = session.key
  }

  function updateScrollTop(scrollTop: number) {
    state.scrollTop = Number.isFinite(scrollTop) ? Math.max(0, scrollTop) : 0
  }

  function clearSelectedSession() {
    selectedSessionKey.value = ''
  }

  function markSessionRead(talkerId: string, ackSeqno: string) {
    const session = state.items.find(item => item.key === `1:${talkerId}`)
    if (!session)
      return
    const previousAckSeqno = confirmedAckSeqnos.get(session.key)
    if (!previousAckSeqno || comparePrivateMessageSeqno(ackSeqno, previousAckSeqno) > 0)
      confirmedAckSeqnos.set(session.key, ackSeqno)
    session.unreadCount = 0
    session.ackSeqno = ackSeqno
    session.original = {
      ...session.original,
      unread_count: 0,
      ack_seqno: ackSeqno,
    }
  }

  function markSessionSent(talkerId: string, summary: string, timestamp: number) {
    const session = state.items.find(item => item.key === `1:${talkerId}`)
    if (!session)
      return
    const timestampMicroseconds = timestamp * 1_000_000
    session.summary = summary
    session.timestamp = timestampMicroseconds
    session.original = {
      ...session.original,
      session_ts: timestampMicroseconds,
    }
    updateBounds()
  }

  watch(currentMid, resetForAccount, { flush: 'sync' })

  return {
    state,
    selectedSessionKey,
    selectedTalkerId,
    loadInitial,
    loadMore,
    refresh,
    refreshNew,
    invalidatePendingRequests,
    refreshIfStale,
    activate,
    retryFailed,
    observeUnreadCount,
    updateScrollTop,
    selectSession,
    clearSelectedSession,
    markSessionRead,
    markSessionSent,
  }
}
