import type { Ref } from 'vue'
import { reactive, watch } from 'vue'

import type {
  PrivateMessageApiResponse,
  PrivateMessagesData,
  PrivateMessageTransportErrorKind,
} from '~/background/privateMessage/types'

import type { DisplayPrivateMessage } from './privateMessage'
import {
  comparePrivateMessageSeqno,
  getLatestPrivateMessageSeqno,
  getOldestPrivateMessageSeqno,
  mergePrivateMessages,
  transformPrivateMessages,
} from './privateMessage'

interface FetchPrivateMessagesOptions {
  endSeqno?: string
  size?: number
  talkerId: string
}

interface AckPrivateMessagesOptions {
  ackSeqno: string
  csrf: string
  talkerId: string
}

export interface PrivateConversationState {
  talkerId: string
  items: DisplayPrivateMessage[]
  loadingInitial: boolean
  loadingOlder: boolean
  refreshing: boolean
  loaded: boolean
  noMore: boolean
  paginationStalled: boolean
  errorKind: PrivateMessageTransportErrorKind | null
  failedOperation: 'initial' | 'refresh' | 'load-older' | null
  generation: number
  newestSeqno: string
  oldestSeqno: string
  historyBoundarySeqno: string
  historyMinSeqno: string
  serverMaxSeqno: string
  stalledEndSeqno: string
  stalledRetryAttempted: boolean
  lastAckSeqno: string
  lastUnreadAckSeqno: string
  scrollTop: number
  atLatest: boolean
  newMessagesAvailable: boolean
  loadedAt: number
  lastAccessedAt: number
}

export interface PrivateMessagesDependencies {
  fetchMessages: (options: FetchPrivateMessagesOptions) => Promise<unknown>
  ackSession: (options: AckPrivateMessagesOptions) => Promise<unknown>
  getCsrf: () => string
  getMaxCachedConversations?: () => number
  getMaxMessagesPerConversation?: () => number
  markSessionRead: (talkerId: string, ackSeqno: string) => void
  syncUnread: () => Promise<void>
  now?: () => number
}

export interface PrivateAckEligibility {
  atLatest: boolean
  canAck: boolean
  pageActive: boolean
  sessionMaxSeqno: string
  unreadCount: number
  visible: boolean
}

export interface PrivateMessagesController {
  states: Map<string, PrivateConversationState>
  getState: (talkerId: string) => PrivateConversationState
  loadInitial: (talkerId: string, lastAckSeqno?: string) => Promise<void>
  loadOlder: (talkerId: string) => Promise<void>
  retryLoadOlder: (talkerId: string) => Promise<void>
  refreshLatest: (talkerId: string) => Promise<void>
  updateViewport: (talkerId: string, viewport: { atLatest: boolean, scrollTop: number }) => void
  acknowledgeIfEligible: (talkerId: string, eligibility: PrivateAckEligibility) => Promise<boolean>
  enforceCacheLimits: () => void
  invalidateConversation: (talkerId: string) => void
  invalidatePendingRequests: () => void
  release: () => void
  dispose: () => void
}

function asResponse(value: unknown): PrivateMessageApiResponse<unknown> | null {
  if (!value || typeof value !== 'object')
    return null
  const response = value as Partial<PrivateMessageApiResponse<unknown>>
  return typeof response.code === 'number' ? response as PrivateMessageApiResponse<unknown> : null
}

function extractMessages(response: unknown): PrivateMessagesData | null {
  const parsed = asResponse(response)
  if (!parsed || parsed.code !== 0 || !parsed.data || typeof parsed.data !== 'object')
    return null
  const data = parsed.data as Partial<PrivateMessagesData>
  return Array.isArray(data.messages) && Array.isArray(data.e_infos)
    ? data as PrivateMessagesData
    : null
}

function resolveErrorKind(response: unknown): PrivateMessageTransportErrorKind {
  const parsed = asResponse(response)
  return parsed?.bewlyError?.kind ?? (parsed ? 'api-error' : 'invalid-response')
}

export function hasPrivateMessagePageProgress(
  previousOldestSeqno: string,
  previousKeys: ReadonlySet<string>,
  incoming: DisplayPrivateMessage[],
): boolean {
  if (incoming.some(item => !previousKeys.has(item.msgKey)))
    return true
  const nextOldestSeqno = getOldestPrivateMessageSeqno(incoming)
  return Boolean(
    nextOldestSeqno
    && previousOldestSeqno
    && comparePrivateMessageSeqno(nextOldestSeqno, previousOldestSeqno) < 0,
  )
}

const UINT64_MAX_DECIMAL = '18446744073709551615'

export function isUsablePrivateMessageHistoryFloor(value: string): boolean {
  return /^\d+$/.test(value)
    && value !== '0'
    && value !== UINT64_MAX_DECIMAL
}

function hasReachedPrivateMessageHistoryFloor(oldestSeqno: string, minSeqno: string): boolean {
  return Boolean(
    oldestSeqno
    && isUsablePrivateMessageHistoryFloor(minSeqno)
    && comparePrivateMessageSeqno(oldestSeqno, minSeqno) <= 0,
  )
}

export function trimPrivateConversationMessages(
  items: DisplayPrivateMessage[],
  maxMessages: number,
): DisplayPrivateMessage[] {
  const limit = Math.max(1, Math.trunc(maxMessages))
  return items.length > limit ? items.slice(-limit) : items
}

function createConversationState(talkerId: string, now: number): PrivateConversationState {
  return reactive({
    talkerId,
    items: [],
    loadingInitial: false,
    loadingOlder: false,
    refreshing: false,
    loaded: false,
    noMore: false,
    paginationStalled: false,
    errorKind: null,
    failedOperation: null,
    generation: 0,
    newestSeqno: '',
    oldestSeqno: '',
    historyBoundarySeqno: '',
    historyMinSeqno: '',
    serverMaxSeqno: '',
    stalledEndSeqno: '',
    stalledRetryAttempted: false,
    lastAckSeqno: '0',
    lastUnreadAckSeqno: '',
    scrollTop: 0,
    atLatest: true,
    newMessagesAvailable: false,
    loadedAt: 0,
    lastAccessedAt: now,
  })
}

export function usePrivateMessages(
  currentMid: Ref<string>,
  activeTalkerId: Ref<string>,
  dependencies: PrivateMessagesDependencies,
): PrivateMessagesController {
  const states = reactive(new Map<string, PrivateConversationState>())
  const firstPageRequests = new Map<string, Promise<void>>()
  const olderRequests = new Map<string, Promise<void>>()
  const ackRequests = new Map<string, Promise<boolean>>()
  const now = dependencies.now ?? Date.now
  let accountGeneration = 0
  let lifecycleGeneration = 0
  let disposed = false

  function maxCachedConversations(): number {
    return Math.max(1, Math.trunc(dependencies.getMaxCachedConversations?.() ?? 8))
  }

  function maxMessagesPerConversation(): number {
    return Math.max(1, Math.trunc(dependencies.getMaxMessagesPerConversation?.() ?? 200))
  }

  function invalidateState(state: PrivateConversationState) {
    state.generation++
    state.loadingInitial = false
    state.loadingOlder = false
    state.refreshing = false
    state.loaded = false
    state.noMore = false
    state.paginationStalled = false
    state.errorKind = null
    state.failedOperation = null
    state.items = []
    state.newestSeqno = ''
    state.oldestSeqno = ''
    state.historyBoundarySeqno = ''
    state.historyMinSeqno = ''
    state.serverMaxSeqno = ''
    state.stalledEndSeqno = ''
    state.stalledRetryAttempted = false
    state.lastUnreadAckSeqno = ''
    firstPageRequests.delete(state.talkerId)
    olderRequests.delete(state.talkerId)
  }

  function enforceCacheLimits(protectedTalkerIds: ReadonlySet<string> = new Set()) {
    const messageLimit = maxMessagesPerConversation()
    for (const state of states.values()) {
      if (!state.historyBoundarySeqno)
        state.historyBoundarySeqno = getOldestPrivateMessageSeqno(state.items)
      state.items = trimPrivateConversationMessages(state.items, messageLimit)
      updateBoundaries(state)
    }

    const conversationLimit = maxCachedConversations()
    while (states.size > conversationLimit) {
      const candidate = [...states.values()]
        .filter(state => (
          state.talkerId !== activeTalkerId.value
          && !protectedTalkerIds.has(state.talkerId)
          && !ackRequests.has(state.talkerId)
        ))
        .sort((left, right) => left.lastAccessedAt - right.lastAccessedAt)[0]
      if (!candidate)
        break
      invalidateState(candidate)
      states.delete(candidate.talkerId)
    }
  }

  function getState(talkerId: string): PrivateConversationState {
    let state = states.get(talkerId)
    if (!state) {
      state = createConversationState(talkerId, now())
      states.set(talkerId, state)
    }
    state.lastAccessedAt = now()
    enforceCacheLimits(new Set([talkerId]))
    return state
  }

  function isCurrentRequest(
    mid: string,
    requestAccountGeneration: number,
    requestLifecycleGeneration: number,
    state: PrivateConversationState,
    conversationGeneration: number,
  ): boolean {
    return !disposed
      && mid === currentMid.value
      && requestAccountGeneration === accountGeneration
      && requestLifecycleGeneration === lifecycleGeneration
      && conversationGeneration === state.generation
      && states.get(state.talkerId) === state
  }

  function isCurrentAccountState(
    mid: string,
    requestAccountGeneration: number,
    requestLifecycleGeneration: number,
    state: PrivateConversationState,
  ): boolean {
    return !disposed
      && mid === currentMid.value
      && requestAccountGeneration === accountGeneration
      && requestLifecycleGeneration === lifecycleGeneration
      && states.get(state.talkerId) === state
  }

  function updateBoundaries(state: PrivateConversationState) {
    state.oldestSeqno = getOldestPrivateMessageSeqno(state.items)
    state.newestSeqno = getLatestPrivateMessageSeqno(state.items)
  }

  function applyLastAckSeqno(state: PrivateConversationState, lastAckSeqno?: string) {
    if (lastAckSeqno && comparePrivateMessageSeqno(lastAckSeqno, state.lastAckSeqno) > 0)
      state.lastAckSeqno = lastAckSeqno
  }

  function normalizeAckSeqno(value: string): string {
    if (!/^\d+$/.test(value))
      return ''
    const normalized = value.replace(/^0+(?=\d)/, '')
    return normalized === '0' ? '' : normalized
  }

  function maxAckSeqno(values: string[]): string {
    return values
      .map(normalizeAckSeqno)
      .filter(Boolean)
      .reduce((maximum, value) => (
        !maximum || comparePrivateMessageSeqno(value, maximum) > 0 ? value : maximum
      ), '')
  }

  function requestFirstPage(
    talkerId: string,
    mode: 'replace' | 'merge',
    lastAckSeqno?: string,
  ): Promise<void> {
    const activeRequest = firstPageRequests.get(talkerId)
    if (activeRequest)
      return activeRequest

    const mid = currentMid.value
    if (!mid || disposed)
      return Promise.resolve()

    const state = getState(talkerId)
    applyLastAckSeqno(state, lastAckSeqno)
    const requestAccountGeneration = accountGeneration
    const requestLifecycleGeneration = lifecycleGeneration
    const conversationGeneration = state.generation
    const failedOperation = mode === 'replace' && !state.loaded ? 'initial' : 'refresh'
    const request = (async () => {
      state.loadingInitial = mode === 'replace' && !state.loaded
      state.refreshing = mode === 'merge' || state.loaded
      state.errorKind = null
      state.failedOperation = null
      try {
        const response = await dependencies.fetchMessages({ talkerId })
        const data = extractMessages(response)
        if (!data)
          throw resolveErrorKind(response)
        if (!isCurrentRequest(mid, requestAccountGeneration, requestLifecycleGeneration, state, conversationGeneration))
          return

        const incoming = transformPrivateMessages(data.messages, data.e_infos, mid)
        const previousKeys = new Set(state.items.map(item => item.msgKey))
        const hasNewItems = incoming.some(item => !previousKeys.has(item.msgKey))
        const mergedItems = mode === 'replace'
          ? incoming
          : mergePrivateMessages(state.items, incoming)
        const oldestIncomingSeqno = getOldestPrivateMessageSeqno(incoming)
        if (mode === 'replace' || !state.historyBoundarySeqno)
          state.historyBoundarySeqno = oldestIncomingSeqno
        if (mode === 'replace') {
          state.historyMinSeqno = data.min_seqno
          state.serverMaxSeqno = data.max_seqno
          state.noMore = data.has_more === 0
            || hasReachedPrivateMessageHistoryFloor(oldestIncomingSeqno, data.min_seqno)
          state.paginationStalled = false
          state.stalledEndSeqno = ''
          state.stalledRetryAttempted = false
        }
        else {
          if (data.min_seqno)
            state.historyMinSeqno = data.min_seqno
          if (data.max_seqno)
            state.serverMaxSeqno = data.max_seqno
        }
        state.items = trimPrivateConversationMessages(mergedItems, maxMessagesPerConversation())
        state.loaded = true
        state.loadedAt = now()
        state.lastAccessedAt = state.loadedAt
        updateBoundaries(state)
        state.errorKind = null
        state.failedOperation = null
        if (mode === 'merge' && !state.atLatest && hasNewItems)
          state.newMessagesAvailable = true
        else if (state.atLatest)
          state.newMessagesAvailable = false
      }
      catch (error) {
        if (!isCurrentRequest(mid, requestAccountGeneration, requestLifecycleGeneration, state, conversationGeneration))
          return
        state.errorKind = typeof error === 'string'
          ? error as PrivateMessageTransportErrorKind
          : 'invalid-response'
        state.failedOperation = failedOperation
      }
      finally {
        if (isCurrentRequest(mid, requestAccountGeneration, requestLifecycleGeneration, state, conversationGeneration)) {
          state.loadingInitial = false
          state.refreshing = false
        }
      }
    })().finally(() => {
      if (firstPageRequests.get(talkerId) === request)
        firstPageRequests.delete(talkerId)
    })

    firstPageRequests.set(talkerId, request)
    return request
  }

  function loadInitial(talkerId: string, lastAckSeqno?: string): Promise<void> {
    const state = getState(talkerId)
    applyLastAckSeqno(state, lastAckSeqno)
    return state.loaded ? Promise.resolve() : requestFirstPage(talkerId, 'replace', lastAckSeqno)
  }

  function requestOlder(talkerId: string, explicitRetry: boolean): Promise<void> {
    const activeRequest = olderRequests.get(talkerId)
    if (activeRequest)
      return activeRequest

    const mid = currentMid.value
    const state = getState(talkerId)
    const retryingStall = explicitRetry && state.paginationStalled
    if (retryingStall && state.stalledRetryAttempted)
      return Promise.resolve()
    const endSeqno = (retryingStall ? state.stalledEndSeqno : '')
      || state.historyBoundarySeqno
      || state.oldestSeqno
      || getOldestPrivateMessageSeqno(state.items)
    if (
      !mid
      || disposed
      || !state.loaded
      || state.noMore
      || (state.paginationStalled && !explicitRetry)
      || !endSeqno
    ) {
      return Promise.resolve()
    }

    const pageSize = retryingStall ? 100 : 20
    if (retryingStall) {
      state.paginationStalled = false
      state.stalledRetryAttempted = true
    }

    const requestAccountGeneration = accountGeneration
    const requestLifecycleGeneration = lifecycleGeneration
    const conversationGeneration = state.generation
    const previousKeys = new Set(state.items.map(item => item.msgKey))
    const request = (async () => {
      state.loadingOlder = true
      state.errorKind = null
      state.failedOperation = null
      try {
        const response = await dependencies.fetchMessages({ talkerId, endSeqno, size: pageSize })
        const data = extractMessages(response)
        if (!data)
          throw resolveErrorKind(response)
        if (!isCurrentRequest(mid, requestAccountGeneration, requestLifecycleGeneration, state, conversationGeneration))
          return

        const incoming = transformPrivateMessages(data.messages, data.e_infos, mid)
        const madeProgress = hasPrivateMessagePageProgress(endSeqno, previousKeys, incoming)
        const nextHistoryBoundary = getOldestPrivateMessageSeqno(incoming)
        if (data.min_seqno)
          state.historyMinSeqno = data.min_seqno
        if (data.max_seqno)
          state.serverMaxSeqno = data.max_seqno
        if (nextHistoryBoundary && comparePrivateMessageSeqno(nextHistoryBoundary, endSeqno) < 0)
          state.historyBoundarySeqno = nextHistoryBoundary
        state.items = trimPrivateConversationMessages(
          mergePrivateMessages(state.items, incoming),
          maxMessagesPerConversation(),
        )
        updateBoundaries(state)
        const reachedFloor = hasReachedPrivateMessageHistoryFloor(
          nextHistoryBoundary,
          state.historyMinSeqno,
        )
        state.noMore = data.has_more === 0 || reachedFloor
        state.paginationStalled = !state.noMore && !madeProgress
        state.errorKind = state.paginationStalled ? 'invalid-response' : null
        state.failedOperation = state.paginationStalled ? 'load-older' : null
        if (state.paginationStalled) {
          state.stalledEndSeqno = endSeqno
        }
        else {
          state.stalledEndSeqno = ''
          state.stalledRetryAttempted = false
        }
        state.lastAccessedAt = now()
      }
      catch (error) {
        if (!isCurrentRequest(mid, requestAccountGeneration, requestLifecycleGeneration, state, conversationGeneration))
          return
        if (retryingStall)
          state.paginationStalled = true
        state.errorKind = typeof error === 'string'
          ? error as PrivateMessageTransportErrorKind
          : 'invalid-response'
        state.failedOperation = 'load-older'
      }
      finally {
        if (isCurrentRequest(mid, requestAccountGeneration, requestLifecycleGeneration, state, conversationGeneration))
          state.loadingOlder = false
      }
    })().finally(() => {
      if (olderRequests.get(talkerId) === request)
        olderRequests.delete(talkerId)
    })

    olderRequests.set(talkerId, request)
    return request
  }

  function loadOlder(talkerId: string): Promise<void> {
    return requestOlder(talkerId, false)
  }

  function retryLoadOlder(talkerId: string): Promise<void> {
    return requestOlder(talkerId, true)
  }

  function refreshLatest(talkerId: string): Promise<void> {
    const state = getState(talkerId)
    return requestFirstPage(talkerId, state.loaded ? 'merge' : 'replace')
  }

  function updateViewport(
    talkerId: string,
    viewport: { atLatest: boolean, scrollTop: number },
  ) {
    const state = states.get(talkerId)
    if (!state)
      return
    state.atLatest = viewport.atLatest
    state.scrollTop = Math.max(0, viewport.scrollTop)
    state.lastAccessedAt = now()
    if (viewport.atLatest)
      state.newMessagesAvailable = false
  }

  function acknowledgeIfEligible(
    talkerId: string,
    eligibility: PrivateAckEligibility,
  ): Promise<boolean> {
    const activeRequest = ackRequests.get(talkerId)
    if (activeRequest)
      return activeRequest

    const mid = currentMid.value
    const state = states.get(talkerId)
    if (!state)
      return Promise.resolve(false)
    const latestLoadedSeqno = state.newestSeqno || getLatestPrivateMessageSeqno(state.items)
    const authoritativeMaxSeqno = maxAckSeqno([
      eligibility.sessionMaxSeqno,
      state.serverMaxSeqno,
    ])
    const hasAuthoritativeUnread = eligibility.unreadCount > 0 && Boolean(authoritativeMaxSeqno)
    const ackSeqno = hasAuthoritativeUnread
      ? maxAckSeqno([latestLoadedSeqno, authoritativeMaxSeqno])
      : normalizeAckSeqno(latestLoadedSeqno)
    const advancesAckBoundary = Boolean(
      ackSeqno
      && comparePrivateMessageSeqno(ackSeqno, state.lastAckSeqno) > 0,
    )
    const reconcilesStaleUnread = Boolean(
      hasAuthoritativeUnread
      && ackSeqno
      && comparePrivateMessageSeqno(ackSeqno, state.lastAckSeqno) >= 0
      && comparePrivateMessageSeqno(ackSeqno, state.lastUnreadAckSeqno) > 0,
    )
    if (
      !mid
      || disposed
      || !eligibility.canAck
      || !state.loaded
      || state.failedOperation === 'refresh'
      || activeTalkerId.value !== talkerId
      || !eligibility.pageActive
      || !eligibility.visible
      || !eligibility.atLatest
      || (!advancesAckBoundary && !reconcilesStaleUnread)
    ) {
      return Promise.resolve(false)
    }

    const csrf = dependencies.getCsrf().trim()
    if (!csrf)
      return Promise.resolve(false)

    const requestAccountGeneration = accountGeneration
    const requestLifecycleGeneration = lifecycleGeneration
    const request = (async () => {
      const response = asResponse(await dependencies.ackSession({
        talkerId,
        ackSeqno,
        csrf,
      }))
      if (
        response?.code !== 0
        || !isCurrentAccountState(mid, requestAccountGeneration, requestLifecycleGeneration, state)
      ) {
        return false
      }

      if (comparePrivateMessageSeqno(ackSeqno, state.lastAckSeqno) > 0)
        state.lastAckSeqno = ackSeqno
      if (hasAuthoritativeUnread)
        state.lastUnreadAckSeqno = ackSeqno
      dependencies.markSessionRead(talkerId, ackSeqno)
      await dependencies.syncUnread().catch(() => {})
      return true
    })().catch(() => false).finally(() => {
      if (ackRequests.get(talkerId) === request)
        ackRequests.delete(talkerId)
      enforceCacheLimits()
    })

    ackRequests.set(talkerId, request)
    return request
  }

  function invalidateConversation(talkerId: string) {
    const state = states.get(talkerId)
    if (!state)
      return
    invalidateState(state)
    state.historyBoundarySeqno = ''
  }

  function invalidatePendingRequests() {
    lifecycleGeneration++
    for (const state of states.values()) {
      state.loadingInitial = false
      state.loadingOlder = false
      state.refreshing = false
    }
  }

  function release() {
    accountGeneration++
    lifecycleGeneration++
    for (const state of states.values())
      invalidateState(state)
    states.clear()
    firstPageRequests.clear()
    olderRequests.clear()
    ackRequests.clear()
  }

  watch(currentMid, () => {
    release()
  }, { flush: 'sync' })

  function dispose() {
    if (disposed)
      return
    disposed = true
    release()
  }

  return {
    states,
    getState,
    loadInitial,
    loadOlder,
    retryLoadOlder,
    refreshLatest,
    updateViewport,
    acknowledgeIfEligible,
    enforceCacheLimits,
    invalidateConversation,
    invalidatePendingRequests,
    release,
    dispose,
  }
}
