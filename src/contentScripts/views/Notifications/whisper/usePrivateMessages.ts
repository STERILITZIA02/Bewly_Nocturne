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
  lastAckSeqno: string
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
    lastAckSeqno: '0',
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
    state.failedOperation = null
    state.items = []
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
    state: PrivateConversationState,
    conversationGeneration: number,
  ): boolean {
    return !disposed
      && mid === currentMid.value
      && requestAccountGeneration === accountGeneration
      && conversationGeneration === state.generation
      && states.get(state.talkerId) === state
  }

  function isCurrentAccountState(
    mid: string,
    requestAccountGeneration: number,
    state: PrivateConversationState,
  ): boolean {
    return !disposed
      && mid === currentMid.value
      && requestAccountGeneration === accountGeneration
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
        if (!isCurrentRequest(mid, requestAccountGeneration, state, conversationGeneration))
          return

        const incoming = transformPrivateMessages(data.messages, data.e_infos, mid)
        const previousKeys = new Set(state.items.map(item => item.msgKey))
        const hasNewItems = incoming.some(item => !previousKeys.has(item.msgKey))
        const mergedItems = mode === 'replace'
          ? incoming
          : mergePrivateMessages(state.items, incoming)
        if (mode === 'replace' || !state.historyBoundarySeqno)
          state.historyBoundarySeqno = getOldestPrivateMessageSeqno(incoming)
        state.items = trimPrivateConversationMessages(mergedItems, maxMessagesPerConversation())
        state.loaded = true
        state.noMore = mode === 'replace' ? incoming.length === 0 : state.noMore
        state.paginationStalled = mode === 'replace' ? false : state.paginationStalled
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
        if (!isCurrentRequest(mid, requestAccountGeneration, state, conversationGeneration))
          return
        state.errorKind = typeof error === 'string'
          ? error as PrivateMessageTransportErrorKind
          : 'invalid-response'
        state.failedOperation = failedOperation
      }
      finally {
        if (isCurrentRequest(mid, requestAccountGeneration, state, conversationGeneration)) {
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
    if (explicitRetry)
      state.paginationStalled = false
    const endSeqno = state.historyBoundarySeqno
      || state.oldestSeqno
      || getOldestPrivateMessageSeqno(state.items)
    if (!mid || disposed || !state.loaded || state.noMore || state.paginationStalled || !endSeqno)
      return Promise.resolve()

    const requestAccountGeneration = accountGeneration
    const conversationGeneration = state.generation
    const previousKeys = new Set(state.items.map(item => item.msgKey))
    const request = (async () => {
      state.loadingOlder = true
      state.errorKind = null
      state.failedOperation = null
      try {
        const response = await dependencies.fetchMessages({ talkerId, endSeqno })
        const data = extractMessages(response)
        if (!data)
          throw resolveErrorKind(response)
        if (!isCurrentRequest(mid, requestAccountGeneration, state, conversationGeneration))
          return

        const incoming = transformPrivateMessages(data.messages, data.e_infos, mid)
        const madeProgress = hasPrivateMessagePageProgress(endSeqno, previousKeys, incoming)
        const nextHistoryBoundary = getOldestPrivateMessageSeqno(incoming)
        if (
          nextHistoryBoundary
          && (!state.historyBoundarySeqno
            || comparePrivateMessageSeqno(nextHistoryBoundary, state.historyBoundarySeqno) < 0)
        ) {
          state.historyBoundarySeqno = nextHistoryBoundary
        }
        state.items = trimPrivateConversationMessages(
          mergePrivateMessages(state.items, incoming),
          maxMessagesPerConversation(),
        )
        updateBoundaries(state)
        state.noMore = incoming.length === 0
        state.paginationStalled = !state.noMore && !madeProgress
        state.errorKind = state.paginationStalled ? 'invalid-response' : null
        state.failedOperation = state.paginationStalled ? 'load-older' : null
        state.lastAccessedAt = now()
      }
      catch (error) {
        if (!isCurrentRequest(mid, requestAccountGeneration, state, conversationGeneration))
          return
        state.errorKind = typeof error === 'string'
          ? error as PrivateMessageTransportErrorKind
          : 'invalid-response'
        state.failedOperation = 'load-older'
      }
      finally {
        if (isCurrentRequest(mid, requestAccountGeneration, state, conversationGeneration))
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
    const latestSeqno = state.newestSeqno || getLatestPrivateMessageSeqno(state.items)
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
      || !latestSeqno
      || comparePrivateMessageSeqno(latestSeqno, state.lastAckSeqno) <= 0
    ) {
      return Promise.resolve(false)
    }

    const csrf = dependencies.getCsrf().trim()
    if (!csrf)
      return Promise.resolve(false)

    const requestAccountGeneration = accountGeneration
    const request = (async () => {
      const response = asResponse(await dependencies.ackSession({
        talkerId,
        ackSeqno: latestSeqno,
        csrf,
      }))
      if (response?.code !== 0 || !isCurrentAccountState(mid, requestAccountGeneration, state))
        return false

      state.lastAckSeqno = latestSeqno
      dependencies.markSessionRead(talkerId, latestSeqno)
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

  function release() {
    accountGeneration++
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
    release,
    dispose,
  }
}
