import type { MaybeRefOrGetter } from 'vue'
import { computed, reactive, ref, toValue, watch } from 'vue'

import type { NotificationPageParams } from '../notificationFeedParsing'
import {
  buildNextPageParams,
  parseNotificationPage,
} from '../notificationFeedParsing'
import type { RefreshNotificationFeedOptions } from '../notificationFeedPolicy'
import {
  applyNotificationFirstPage,
  createReadCommitId,
  evaluatePaginationProgress,
  normalizeUnreadCount,
  shouldRefreshFeed,
} from '../notificationFeedPolicy'
import type { NativeNotificationSection } from '../notificationSections'
import type {
  FirstPageApplyMode,
  NotificationFailedOperation,
  NotificationFeedState,
  NotificationReadCandidate,
} from './notificationFeedState'

export type { NotificationPageParams } from '../notificationFeedParsing'
export type { RefreshNotificationFeedOptions } from '../notificationFeedPolicy'
export type {
  NotificationErrorKind,
  NotificationFailedOperation,
  NotificationFeedState,
  NotificationReadCandidate,
} from './notificationFeedState'

export interface LoadNotificationFirstPageOptions {
  applyMode?: FirstPageApplyMode
  failedOperation?: Exclude<NotificationFailedOperation, 'load-more' | null>
  now?: number
  unreadCount?: number
}

interface NotificationFeedOptions {
  fetchPage: (params?: NotificationPageParams) => Promise<unknown>
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
    loadedAt: 0,
    unreadCountAtFetch: 0,
    lastObservedUnreadCount: 0,
    noMore: false,
    errorKind: null,
    failedOperation: null,
    failedFirstPageApplyMode: null,
    hasLoadedMore: false,
    paginationStalled: false,
    generation: 0,
    scrollTop: 0,
    firstPageRequestSerial: 0,
    currentReadCommitId: '',
    serverReadCommitted: false,
    badgeReconciled: false,
  })

  let initialRequest: Promise<void> | null = null
  let loadMoreRequest: Promise<void> | null = null
  function resetForAccount(nextMid: string) {
    state.generation++
    accountMid.value = nextMid
    state.items.splice(0)
    state.cursorId = ''
    state.cursorTime = 0
    state.loading = false
    state.loadingMore = false
    state.loaded = false
    state.loadedAt = 0
    state.unreadCountAtFetch = 0
    state.lastObservedUnreadCount = 0
    state.noMore = false
    state.errorKind = null
    state.failedOperation = null
    state.failedFirstPageApplyMode = null
    state.hasLoadedMore = false
    state.paginationStalled = false
    state.scrollTop = 0
    state.firstPageRequestSerial = 0
    state.currentReadCommitId = ''
    state.serverReadCommitted = false
    state.badgeReconciled = false
    readCandidate.value = null
    initialRequest = null
    loadMoreRequest = null
  }

  function isCurrentRequest(requestGeneration: number, requestMid: string): boolean {
    return requestGeneration === state.generation && requestMid === accountMid.value
  }

  function isCurrentPageRequest(requestGeneration: number, requestMid: string, requestSerial: number): boolean {
    return isCurrentRequest(requestGeneration, requestMid) && requestSerial === state.firstPageRequestSerial
  }

  async function requestInitialPage(
    requestGeneration: number,
    requestMid: string,
    requestSerial: number,
    unreadCount: number,
    loadedAt: number,
    applyMode: FirstPageApplyMode,
    failedOperation: Exclude<NotificationFailedOperation, 'load-more' | null>,
    preserveLoadMoreError: boolean,
  ) {
    try {
      const result = parseNotificationPage(section, await fetchPage())
      if (!isCurrentPageRequest(requestGeneration, requestMid, requestSerial))
        return

      if (!result.page) {
        state.errorKind = result.errorKind ?? 'invalid-response'
        state.failedOperation = failedOperation
        state.failedFirstPageApplyMode = applyMode
        return
      }

      const applied = applyNotificationFirstPage(state, result.page, applyMode)
      state.items.splice(0, state.items.length, ...applied.items)
      state.cursorId = applied.cursorId
      state.cursorTime = applied.cursorTime
      state.noMore = applied.noMore
      state.hasLoadedMore = applied.hasLoadedMore
      state.paginationStalled = applied.paginationStalled
      state.loaded = true
      state.loadedAt = loadedAt
      state.unreadCountAtFetch = unreadCount
      if (!preserveLoadMoreError) {
        state.errorKind = null
        state.failedOperation = null
        state.failedFirstPageApplyMode = null
      }
      const serverReadCommitted = result.page.serverReadCommitted ?? true
      state.serverReadCommitted = serverReadCommitted
      // Reply, At, and Like commit read in their successful first-page GET.
      // System's adapter publishes its first page only after update_cursor.
      readCandidate.value = serverReadCommitted
        ? {
            readCommitId: state.currentReadCommitId,
            mid: requestMid,
            section,
            generation: requestGeneration,
            serverReadCommitted: true,
          }
        : null
    }
    catch {
      if (isCurrentPageRequest(requestGeneration, requestMid, requestSerial)) {
        state.errorKind = 'network'
        state.failedOperation = failedOperation
        state.failedFirstPageApplyMode = applyMode
      }
    }
    finally {
      if (isCurrentPageRequest(requestGeneration, requestMid, requestSerial))
        state.loading = false
    }
  }

  function loadInitial(options: LoadNotificationFirstPageOptions = {}): Promise<void> {
    if (initialRequest)
      return initialRequest
    if (!accountMid.value) {
      state.errorKind = 'login-required'
      state.failedOperation = options.failedOperation ?? 'initial'
      state.failedFirstPageApplyMode = options.applyMode ?? 'replace'
      return Promise.resolve()
    }

    const requestGeneration = state.generation
    const requestMid = accountMid.value
    const requestSerial = ++state.firstPageRequestSerial
    const unreadCount = normalizeUnreadCount(options.unreadCount ?? state.lastObservedUnreadCount)
    const loadedAt = options.now ?? Date.now()
    const applyMode = options.applyMode ?? 'replace'
    const failedOperation = options.failedOperation ?? 'initial'
    const preserveLoadMoreError = applyMode === 'merge-head' && state.failedOperation === 'load-more'
    state.loading = true
    state.loadingMore = false
    if (!preserveLoadMoreError) {
      state.errorKind = null
      state.failedOperation = null
      state.failedFirstPageApplyMode = null
    }
    state.currentReadCommitId = createReadCommitId(section, requestMid, requestGeneration, requestSerial)
    state.serverReadCommitted = false
    state.badgeReconciled = false
    readCandidate.value = null
    loadMoreRequest = null
    const request = requestInitialPage(
      requestGeneration,
      requestMid,
      requestSerial,
      unreadCount,
      loadedAt,
      applyMode,
      failedOperation,
      preserveLoadMoreError,
    ).finally(() => {
      if (initialRequest === request)
        initialRequest = null
    })
    initialRequest = request
    return request
  }

  async function requestNextPage(requestGeneration: number, requestMid: string, requestSerial: number) {
    const cursorId = state.cursorId
    const cursorTime = state.cursorTime
    try {
      const result = parseNotificationPage(
        section,
        await fetchPage(buildNextPageParams(section, cursorId, cursorTime)),
      )
      if (!isCurrentPageRequest(requestGeneration, requestMid, requestSerial))
        return

      if (!result.page) {
        state.errorKind = result.errorKind ?? 'invalid-response'
        state.failedOperation = 'load-more'
        return
      }

      const existingIds = new Set(state.items.map(item => item.id))
      const newItems = result.page.items.filter((item) => {
        if (existingIds.has(item.id))
          return false
        existingIds.add(item.id)
        return true
      })
      const progress = evaluatePaginationProgress({
        previousCursorId: cursorId,
        previousCursorTime: cursorTime,
        nextCursorId: result.page.cursorId,
        nextCursorTime: result.page.cursorTime,
        newUniqueItemCount: newItems.length,
        noMore: result.page.noMore,
      })
      if (progress.stalled) {
        state.paginationStalled = true
        state.errorKind = 'invalid-response'
        state.failedOperation = 'load-more'
        return
      }

      state.items.push(...newItems)
      state.cursorId = result.page.cursorId
      state.cursorTime = result.page.cursorTime
      state.errorKind = null
      state.failedOperation = null
      state.failedFirstPageApplyMode = null
      state.noMore = result.page.noMore
      state.hasLoadedMore = true
      state.paginationStalled = false
    }
    catch {
      if (isCurrentPageRequest(requestGeneration, requestMid, requestSerial)) {
        state.errorKind = 'network'
        state.failedOperation = 'load-more'
      }
    }
    finally {
      if (isCurrentPageRequest(requestGeneration, requestMid, requestSerial))
        state.loadingMore = false
    }
  }

  function loadMore(): Promise<void> {
    if (loadMoreRequest)
      return loadMoreRequest
    if (
      !state.loaded
      || state.loading
      || state.noMore
      || state.paginationStalled
      || state.errorKind !== null
      || !state.cursorId
    ) {
      return Promise.resolve()
    }

    const requestGeneration = state.generation
    const requestMid = accountMid.value
    const requestSerial = state.firstPageRequestSerial
    state.loadingMore = true
    const request = requestNextPage(requestGeneration, requestMid, requestSerial)
    loadMoreRequest = request
    return request.finally(() => {
      if (loadMoreRequest === request)
        loadMoreRequest = null
    })
  }

  function refresh(unreadCount = state.lastObservedUnreadCount): Promise<void> {
    return loadInitial({
      applyMode: 'replace',
      failedOperation: 'refresh',
      unreadCount,
    })
  }

  function refreshIfStale(options: RefreshNotificationFeedOptions): Promise<void> {
    const unreadCount = normalizeUnreadCount(options.unreadCount)
    const now = options.now ?? Date.now()
    const shouldRefresh = shouldRefreshFeed(state, { ...options, now, unreadCount })
    state.lastObservedUnreadCount = unreadCount

    const applyMode: FirstPageApplyMode = state.loaded && options.reason !== 'manual'
      ? 'merge-head'
      : 'replace'
    const failedOperation: Exclude<NotificationFailedOperation, 'load-more' | null>
      = state.loaded || options.reason === 'manual' ? 'refresh' : 'initial'

    return shouldRefresh
      ? loadInitial({ applyMode, failedOperation, now, unreadCount })
      : Promise.resolve()
  }

  function retryFailedOperation(unreadCount = state.lastObservedUnreadCount): Promise<void> {
    if (state.failedOperation === 'initial') {
      return loadInitial({
        applyMode: 'replace',
        failedOperation: 'initial',
        unreadCount,
      })
    }
    if (state.failedOperation === 'refresh') {
      return loadInitial({
        applyMode: state.failedFirstPageApplyMode ?? 'merge-head',
        failedOperation: 'refresh',
        unreadCount,
      })
    }
    if (state.failedOperation === 'load-more') {
      state.paginationStalled = false
      state.errorKind = null
      state.failedOperation = null
      return loadMore()
    }
    return Promise.resolve()
  }

  function ensureLoaded(unreadCount = state.lastObservedUnreadCount): Promise<void> {
    return refreshIfStale({
      reason: 'activate',
      unreadCount,
    })
  }

  function isReadCandidateCurrent(candidate: NotificationReadCandidate): boolean {
    return readCandidate.value?.readCommitId === candidate.readCommitId
      && state.currentReadCommitId === candidate.readCommitId
      && state.serverReadCommitted
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

    state.badgeReconciled = true
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
    refreshIfStale,
    retryFailedOperation,
  }
}
