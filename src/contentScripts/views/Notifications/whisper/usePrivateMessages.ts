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
  loading: boolean
  loadingOlder: boolean
  refreshing: boolean
  loaded: boolean
  noMore: boolean
  errorKind: PrivateMessageTransportErrorKind | null
  failedOperation: 'initial' | 'refresh' | 'load-older' | null
  generation: number
  scrollTop: number
  atLatest: boolean
  newMessagesAvailable: boolean
  lastAckSeqno: string
}

export interface PrivateMessagesDependencies {
  fetchMessages: (options: FetchPrivateMessagesOptions) => Promise<unknown>
  ackSession: (options: AckPrivateMessagesOptions) => Promise<unknown>
  getCsrf: () => string
  markSessionRead: (talkerId: string, ackSeqno: string) => void
  syncUnread: () => Promise<void>
}

export interface PrivateAckEligibility {
  atLatest: boolean
  pageActive: boolean
  visible: boolean
}

export interface PrivateMessagesController {
  states: Map<string, PrivateConversationState>
  getState: (talkerId: string) => PrivateConversationState
  loadInitial: (talkerId: string, lastAckSeqno?: string) => Promise<void>
  loadOlder: (talkerId: string) => Promise<void>
  refreshLatest: (talkerId: string) => Promise<void>
  updateViewport: (talkerId: string, viewport: { atLatest: boolean, scrollTop: number }) => void
  acknowledgeIfEligible: (talkerId: string, eligibility: PrivateAckEligibility) => Promise<boolean>
  invalidateConversation: (talkerId: string) => void
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

function createConversationState(talkerId: string): PrivateConversationState {
  return reactive({
    talkerId,
    items: [],
    loading: false,
    loadingOlder: false,
    refreshing: false,
    loaded: false,
    noMore: false,
    errorKind: null,
    failedOperation: null,
    generation: 0,
    scrollTop: 0,
    atLatest: true,
    newMessagesAvailable: false,
    lastAckSeqno: '0',
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
  let accountGeneration = 0

  function getState(talkerId: string): PrivateConversationState {
    let state = states.get(talkerId)
    if (!state) {
      state = createConversationState(talkerId)
      states.set(talkerId, state)
    }
    return state
  }

  function isCurrentRequest(
    mid: string,
    requestAccountGeneration: number,
    state: PrivateConversationState,
    conversationGeneration: number,
  ): boolean {
    return (
      mid === currentMid.value
      && requestAccountGeneration === accountGeneration
      && conversationGeneration === state.generation
      && states.get(state.talkerId) === state
    )
  }

  function isCurrentAccountState(
    mid: string,
    requestAccountGeneration: number,
    state: PrivateConversationState,
  ): boolean {
    return (
      mid === currentMid.value
      && requestAccountGeneration === accountGeneration
      && states.get(state.talkerId) === state
    )
  }

  function applyLastAckSeqno(state: PrivateConversationState, lastAckSeqno?: string) {
    if (
      lastAckSeqno
      && comparePrivateMessageSeqno(lastAckSeqno, state.lastAckSeqno) > 0
    ) {
      state.lastAckSeqno = lastAckSeqno
    }
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
    if (!mid)
      return Promise.resolve()

    const state = getState(talkerId)
    applyLastAckSeqno(state, lastAckSeqno)
    const requestAccountGeneration = accountGeneration
    const conversationGeneration = state.generation
    const failedOperation = mode === 'replace' && !state.loaded ? 'initial' : 'refresh'
    const request = (async () => {
      state.loading = mode === 'replace' && !state.loaded
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
        state.items = mode === 'replace'
          ? incoming
          : mergePrivateMessages(state.items, incoming)
        state.loaded = true
        state.noMore = mode === 'replace' ? incoming.length === 0 : state.noMore
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
          state.loading = false
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
    return state.loaded
      ? Promise.resolve()
      : requestFirstPage(talkerId, 'replace', lastAckSeqno)
  }

  function loadOlder(talkerId: string): Promise<void> {
    const activeRequest = olderRequests.get(talkerId)
    if (activeRequest)
      return activeRequest

    const mid = currentMid.value
    const state = getState(talkerId)
    const endSeqno = getOldestPrivateMessageSeqno(state.items)
    if (!mid || !state.loaded || state.noMore || !endSeqno)
      return Promise.resolve()

    const requestAccountGeneration = accountGeneration
    const conversationGeneration = state.generation
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
        const merged = mergePrivateMessages(state.items, incoming)
        const nextOldestSeqno = getOldestPrivateMessageSeqno(merged)
        state.items = merged
        state.noMore = incoming.length === 0 || comparePrivateMessageSeqno(nextOldestSeqno, endSeqno) >= 0
        state.errorKind = null
        state.failedOperation = null
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

  function refreshLatest(talkerId: string): Promise<void> {
    const state = getState(talkerId)
    return state.loaded
      ? requestFirstPage(talkerId, 'merge')
      : requestFirstPage(talkerId, 'replace')
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
    const latestSeqno = getLatestPrivateMessageSeqno(state.items)
    if (
      !mid
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
      if (
        response?.code !== 0
        || !isCurrentAccountState(mid, requestAccountGeneration, state)
      ) {
        return false
      }

      state.lastAckSeqno = latestSeqno
      dependencies.markSessionRead(talkerId, latestSeqno)
      await dependencies.syncUnread().catch(() => {})
      return true
    })().catch(() => false).finally(() => {
      if (ackRequests.get(talkerId) === request)
        ackRequests.delete(talkerId)
    })

    ackRequests.set(talkerId, request)
    return request
  }

  function invalidateConversation(talkerId: string) {
    const state = states.get(talkerId)
    if (!state)
      return
    state.generation++
    state.loading = false
    state.loadingOlder = false
    state.refreshing = false
    state.failedOperation = null
    firstPageRequests.delete(talkerId)
    olderRequests.delete(talkerId)
  }

  watch(currentMid, () => {
    accountGeneration++
    states.clear()
    firstPageRequests.clear()
    olderRequests.clear()
    ackRequests.clear()
  }, { flush: 'sync' })

  watch(activeTalkerId, (nextTalkerId, previousTalkerId) => {
    if (previousTalkerId && previousTalkerId !== nextTalkerId)
      invalidateConversation(previousTalkerId)
  }, { flush: 'sync' })

  return {
    states,
    getState,
    loadInitial,
    loadOlder,
    refreshLatest,
    updateViewport,
    acknowledgeIfEligible,
    invalidateConversation,
  }
}
