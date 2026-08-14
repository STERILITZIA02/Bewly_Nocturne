import type { Ref } from 'vue'
import { reactive, ref, watch } from 'vue'

import type {
  PrivateMessageApiResponse,
  PrivateMessageTransportErrorKind,
  PrivateSession,
  PrivateSessionsData,
} from '~/background/privateMessage/types'

import type { DisplayPrivateSession } from './privateSession'
import {
  collectPrivateSessionUids,
  isNativePrivateSession,
  mergePrivateSessions,
  transformPrivateSessions,
} from './privateSession'

export type PrivateSessionsApplyMode = 'replace' | 'merge'

export interface PrivateSessionsState {
  items: DisplayPrivateSession[]
  loading: boolean
  refreshing: boolean
  loaded: boolean
  errorKind: PrivateMessageTransportErrorKind | null
  generation: number
  lastObservedUnreadCount: number
}

export interface PrivateSessionsDependencies {
  fetchSessions: () => Promise<unknown>
  fetchUserCards: (uids: string[]) => Promise<unknown>
}

export interface PrivateSessionsController {
  state: PrivateSessionsState
  selectedTalkerId: Ref<string>
  loadInitial: () => Promise<void>
  refresh: (mode?: PrivateSessionsApplyMode) => Promise<void>
  observeUnreadCount: (unreadCount: number) => Promise<void>
  selectSession: (session: DisplayPrivateSession) => void
  markSessionRead: (talkerId: string, ackSeqno: string) => void
  markSessionSent: (talkerId: string, summary: string, timestamp: number) => void
}

function asResponse(value: unknown): PrivateMessageApiResponse<unknown> | null {
  if (!value || typeof value !== 'object')
    return null
  const response = value as Partial<PrivateMessageApiResponse<unknown>>
  return typeof response.code === 'number' ? response as PrivateMessageApiResponse<unknown> : null
}

function extractSessions(response: unknown): PrivateSession[] | null {
  const parsed = asResponse(response)
  if (!parsed || parsed.code !== 0 || !parsed.data || typeof parsed.data !== 'object')
    return null
  const sessionList = (parsed.data as Partial<PrivateSessionsData>).session_list
  return Array.isArray(sessionList) ? sessionList : null
}

function resolveErrorKind(response: unknown): PrivateMessageTransportErrorKind {
  const parsed = asResponse(response)
  return parsed?.bewlyError?.kind ?? (parsed ? 'api-error' : 'invalid-response')
}

function isSuccessfulCardsResponse(response: unknown): boolean {
  return asResponse(response)?.code === 0
}

function createState(): PrivateSessionsState {
  return reactive({
    items: [],
    loading: false,
    refreshing: false,
    loaded: false,
    errorKind: null,
    generation: 0,
    lastObservedUnreadCount: -1,
  })
}

export function usePrivateSessions(
  currentMid: Ref<string>,
  dependencies: PrivateSessionsDependencies,
): PrivateSessionsController {
  const state = createState()
  const selectedTalkerId = ref('')
  let activeRequest: Promise<void> | null = null

  function resetForAccount() {
    state.generation++
    state.items = []
    state.loading = false
    state.refreshing = false
    state.loaded = false
    state.errorKind = null
    state.lastObservedUnreadCount = -1
    selectedTalkerId.value = ''
    activeRequest = null
  }

  async function requestSessions(mode: PrivateSessionsApplyMode): Promise<void> {
    if (activeRequest)
      return activeRequest

    const mid = currentMid.value
    if (!mid)
      return

    const generation = state.generation
    const request = (async () => {
      state.loading = !state.loaded
      state.refreshing = state.loaded
      state.errorKind = null
      try {
        const sessionsResponse = await dependencies.fetchSessions()
        const sessions = extractSessions(sessionsResponse)
        if (!sessions)
          throw resolveErrorKind(sessionsResponse)

        const uids = collectPrivateSessionUids(sessions)
        const cardsResponse = uids.length > 0
          ? await dependencies.fetchUserCards(uids)
          : { code: 0, data: [] }
        if (!isSuccessfulCardsResponse(cardsResponse))
          throw resolveErrorKind(cardsResponse)

        if (generation !== state.generation || mid !== currentMid.value)
          return

        const incoming = transformPrivateSessions(sessions, cardsResponse)
        state.items = mode === 'merge'
          ? mergePrivateSessions(state.items, incoming)
          : incoming
        state.loaded = true
        state.errorKind = null

        if (
          selectedTalkerId.value
          && !state.items.some(item => item.talkerId === selectedTalkerId.value)
        ) {
          selectedTalkerId.value = ''
        }
      }
      catch (error) {
        if (generation !== state.generation || mid !== currentMid.value)
          return
        state.errorKind = typeof error === 'string'
          ? error as PrivateMessageTransportErrorKind
          : 'invalid-response'
      }
      finally {
        if (generation === state.generation && mid === currentMid.value) {
          state.loading = false
          state.refreshing = false
        }
      }
    })().finally(() => {
      if (activeRequest === request)
        activeRequest = null
    })

    activeRequest = request
    return request
  }

  function loadInitial(): Promise<void> {
    if (state.loaded)
      return Promise.resolve()
    return requestSessions('replace')
  }

  function refresh(mode: PrivateSessionsApplyMode = 'replace'): Promise<void> {
    return requestSessions(mode)
  }

  function observeUnreadCount(unreadCount: number): Promise<void> {
    const normalizedUnreadCount = Number.isFinite(unreadCount)
      ? Math.max(0, Math.trunc(unreadCount))
      : 0
    const previousUnreadCount = state.lastObservedUnreadCount
    state.lastObservedUnreadCount = normalizedUnreadCount

    if (!state.loaded)
      return loadInitial()
    if (previousUnreadCount >= 0 && previousUnreadCount !== normalizedUnreadCount)
      return refresh('merge')
    return Promise.resolve()
  }

  function selectSession(session: DisplayPrivateSession) {
    if (isNativePrivateSession(session))
      selectedTalkerId.value = session.talkerId
  }

  function markSessionRead(talkerId: string, ackSeqno: string) {
    const session = state.items.find(item => item.talkerId === talkerId)
    if (!session)
      return
    session.unreadCount = 0
    session.ackSeqno = ackSeqno
    session.original = {
      ...session.original,
      unread_count: 0,
      ack_seqno: ackSeqno,
    }
  }

  function markSessionSent(talkerId: string, summary: string, timestamp: number) {
    const session = state.items.find(item => item.talkerId === talkerId)
    if (!session)
      return
    const timestampMicroseconds = timestamp * 1_000_000
    session.summary = summary
    session.timestamp = timestampMicroseconds
    session.original = {
      ...session.original,
      session_ts: timestampMicroseconds,
    }
  }

  watch(currentMid, resetForAccount, { flush: 'sync' })

  return {
    state,
    selectedTalkerId,
    loadInitial,
    refresh,
    observeUnreadCount,
    selectSession,
    markSessionRead,
    markSessionSent,
  }
}
