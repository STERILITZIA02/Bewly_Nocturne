import type { Ref } from 'vue'
import { computed, onBeforeUnmount, ref } from 'vue'

import api from '~/utils/api'
import { getCSRF } from '~/utils/main'

import { ensureBilibiliApiSuccess } from '../notificationApi'
import { createConversationKey, markConversationRead, mergeUniqueConversations, transformConversation, transformConversationPage } from '../notificationTransforms'
import type { DisplayConversation } from '../types'

const ACTIVE_SESSION_SYNC_INTERVAL_MS = 15_000
const SESSION_TYPES = ['1', '2', '3', '5'] as const
const SUPPORT_GROUP_AVATAR = 'https://s1.hdslb.com/bfs/seed/jinkela/short/message/img/mygroup.png'

type SessionType = typeof SESSION_TYPES[number]

interface SessionStreamState {
  nextTimestamp: string
  hasMore: boolean
}

function createSessionStreamStates(): Record<SessionType, SessionStreamState> {
  return {
    1: { nextTimestamp: '', hasMore: true },
    2: { nextTimestamp: '', hasMore: true },
    3: { nextTimestamp: '', hasMore: true },
    5: { nextTimestamp: '', hasMore: true },
  }
}

function sessionRequestParams(sessionType: SessionType, endTimestamp?: string) {
  const isPrimary = sessionType === '1'
  return {
    session_type: Number(sessionType),
    size: sessionType === '3' ? 1 : 20,
    group_fold: 1,
    unfollow_fold: isPrimary ? 0 : 1,
    sort_rule: isPrimary ? 2 : 1,
    end_ts: endTimestamp || undefined,
  }
}

export type ConversationFilter = 'all' | 'unread' | 'followed' | 'unfollowed' | 'system' | 'pinned'

export function usePrivateSessions(accountId: Ref<string | null>) {
  const items = ref<DisplayConversation[]>([])
  const loading = ref(false)
  const loaded = ref(false)
  const noMore = ref(false)
  const error = ref('')
  const search = ref('')
  const filter = ref<ConversationFilter>('all')
  const generation = ref(0)
  const streamStates = createSessionStreamStates()
  const identityCache = new Map<string, { name: string, face: string }>()
  let syncTimer: ReturnType<typeof setTimeout> | undefined
  let syncEnabled = false

  const filteredItems = computed(() => {
    const query = search.value.trim().toLocaleLowerCase()
    return items.value.filter((item) => {
      if (query && !`${item.name}\n${item.lastMessage}`.toLocaleLowerCase().includes(query))
        return false
      if (filter.value === 'unread')
        return item.unreadCount > 0
      if (filter.value === 'followed')
        return item.isFollowed
      if (filter.value === 'unfollowed')
        return !item.isFollowed && !item.isSystem
      if (filter.value === 'system')
        return item.isSystem
      if (filter.value === 'pinned')
        return item.isPinned
      return true
    })
  })

  function isCurrent(requestGeneration: number, account: string) {
    return generation.value === requestGeneration && accountId.value === account
  }

  function stopSync() {
    syncEnabled = false
    if (syncTimer !== undefined)
      clearTimeout(syncTimer)
    syncTimer = undefined
  }

  function reset() {
    generation.value += 1
    stopSync()
    items.value = []
    loading.value = false
    loaded.value = false
    noMore.value = false
    error.value = ''
    identityCache.clear()
    SESSION_TYPES.forEach((sessionType) => {
      streamStates[sessionType] = { nextTimestamp: '', hasMore: true }
    })
  }

  function updateNoMore() {
    noMore.value = SESSION_TYPES.every(sessionType => !streamStates[sessionType].hasMore)
  }

  async function enrichConversations(
    conversations: DisplayConversation[],
    requestGeneration: number,
    account: string,
  ): Promise<boolean> {
    conversations.forEach((item) => {
      const identity = identityCache.get(item.talkerId)
      if (!identity)
        return
      if (!item.name)
        item.name = identity.name
      if (!item.avatar)
        item.avatar = identity.face
    })
    const userIds = [...new Set(conversations
      .filter(item => item.sourceSessionType === '1' && (!item.name || !item.avatar))
      .map(item => item.talkerId)
      .filter(Boolean))]
    const supportGroups = conversations.filter(item => item.isSupportGroup)
    supportGroups.forEach((item) => {
      item.avatar = SUPPORT_GROUP_AVATAR
    })

    const [userCardsResult, supportGroupUnreadResult] = await Promise.allSettled([
      userIds.length
        ? api.user.getUserCards({ uids: userIds.join(',') })
        : Promise.resolve(null),
      supportGroups.length
        ? api.notification.getSupportGroupUnread()
        : Promise.resolve(null),
    ])
    if (!isCurrent(requestGeneration, account))
      return false

    if (userCardsResult.status === 'fulfilled' && userCardsResult.value) {
      const response = userCardsResult.value
      if (response.code === 0 && response.data && typeof response.data === 'object') {
        const cards = response.data as Record<string, { name?: unknown, face?: unknown }>
        conversations.forEach((item) => {
          const card = cards[item.talkerId]
          if (!card)
            return
          if (typeof card.name === 'string' && card.name)
            item.name = card.name
          if (typeof card.face === 'string' && card.face)
            item.avatar = card.face
          if (item.name || item.avatar)
            identityCache.set(item.talkerId, { name: item.name, face: item.avatar })
        })
      }
    }

    if (supportGroupUnreadResult.status === 'fulfilled' && supportGroupUnreadResult.value?.code === 0) {
      const unreadCount = Number(supportGroupUnreadResult.value.data?.unread_count)
      if (Number.isFinite(unreadCount)) {
        supportGroups.forEach((item) => {
          item.unreadCount = Math.max(0, unreadCount)
        })
      }
    }
    return true
  }

  async function requestSessions(resetList: boolean) {
    const account = accountId.value
    if (!account || loading.value || (!resetList && noMore.value))
      return
    if (resetList) {
      generation.value += 1
      SESSION_TYPES.forEach((sessionType) => {
        streamStates[sessionType] = { nextTimestamp: '', hasMore: true }
      })
    }
    const requestGeneration = generation.value
    const requestedTypes = SESSION_TYPES.filter(sessionType => resetList || streamStates[sessionType].hasMore)
    if (!requestedTypes.length) {
      noMore.value = true
      return
    }
    loading.value = true
    error.value = ''
    try {
      const results = await Promise.allSettled(requestedTypes.map(async (sessionType) => {
        const response = await api.notification.getSessions(sessionRequestParams(
          sessionType,
          resetList ? undefined : streamStates[sessionType].nextTimestamp,
        ))
        ensureBilibiliApiSuccess(response)
        return { sessionType, page: transformConversationPage(response) }
      }))
      if (!isCurrent(requestGeneration, account))
        return
      const successful = results.flatMap(result => result.status === 'fulfilled' ? [result.value] : [])
      const primaryResult = results[requestedTypes.indexOf('1')]
      if (resetList && (!primaryResult || primaryResult.status === 'rejected'))
        throw primaryResult?.status === 'rejected' ? primaryResult.reason : new Error('Failed to load conversations')
      if (!successful.length) {
        const failed = results.find(result => result.status === 'rejected')
        throw failed?.status === 'rejected' ? failed.reason : new Error('Failed to load conversations')
      }

      const received = successful.flatMap(result => result.page.items)
      if (!await enrichConversations(received, requestGeneration, account))
        return
      successful.forEach(({ sessionType, page }) => {
        streamStates[sessionType] = {
          nextTimestamp: page.nextTimestamp,
          hasMore: page.hasMore && Boolean(page.nextTimestamp),
        }
      })
      items.value = mergeUniqueConversations(resetList ? [] : items.value, received)
      updateNoMore()
      loaded.value = true
    }
    catch (caught) {
      if (isCurrent(requestGeneration, account))
        error.value = caught instanceof Error ? caught.message : String(caught)
    }
    finally {
      if (isCurrent(requestGeneration, account))
        loading.value = false
    }
  }

  async function refresh() {
    await requestSessions(true)
  }

  async function loadMore() {
    await requestSessions(false)
  }

  async function syncNewSessions() {
    const account = accountId.value
    const requestGeneration = generation.value
    if (!account || document.hidden || loading.value)
      return
    try {
      const results = await Promise.allSettled(SESSION_TYPES.map(async (sessionType) => {
        const latestSessionTimestamp = [...items.value]
          .filter(item => item.sourceSessionType === sessionType && item.sessionTimestamp)
          .sort((left, right) => right.timestamp - left.timestamp)[0]
          ?.sessionTimestamp || '0'
        const response = await api.notification.getNewSessions({
          session_type: Number(sessionType),
          group_fold: 1,
          unfollow_fold: sessionType === '1' ? 0 : 1,
          sort_rule: 1,
          begin_ts: latestSessionTimestamp,
        })
        ensureBilibiliApiSuccess(response)
        return transformConversationPage(response).items
      }))
      if (!isCurrent(requestGeneration, account))
        return
      const received = results.flatMap(result => result.status === 'fulfilled' ? result.value : [])
      if (!await enrichConversations(received, requestGeneration, account))
        return
      if (received.length)
        items.value = mergeUniqueConversations(items.value, received)
    }
    catch {
      // Incremental sync must not replace an otherwise usable session list with an error state.
    }
  }

  function scheduleSync() {
    if (!syncEnabled)
      return
    if (syncTimer !== undefined)
      clearTimeout(syncTimer)
    syncTimer = setTimeout(async () => {
      await syncNewSessions()
      if (syncEnabled && accountId.value)
        scheduleSync()
    }, ACTIVE_SESSION_SYNC_INTERVAL_MS)
  }

  function startSync() {
    syncEnabled = true
    scheduleSync()
  }

  async function setPinned(item: DisplayConversation, pinned: boolean) {
    const account = accountId.value
    const requestGeneration = generation.value
    if (!account)
      return
    const response = await api.notification.setSessionTop({
      talker_id: item.talkerId,
      session_type: item.sessionType,
      op_type: pinned ? 1 : 0,
      csrf: getCSRF(),
    })
    ensureBilibiliApiSuccess(response)
    if (!isCurrent(requestGeneration, account))
      return
    item.isPinned = pinned
    items.value = mergeUniqueConversations([], items.value)
  }

  async function remove(item: DisplayConversation) {
    const account = accountId.value
    const requestGeneration = generation.value
    if (!account)
      return
    const response = await api.notification.removeSession({
      talker_id: item.talkerId,
      session_type: item.sessionType,
      csrf: getCSRF(),
    })
    ensureBilibiliApiSuccess(response)
    if (!isCurrent(requestGeneration, account))
      return
    items.value = items.value.filter(candidate => candidate.key !== item.key)
  }

  async function setMuted(item: DisplayConversation, account: string, muted: boolean) {
    const requestGeneration = generation.value
    if (accountId.value !== account)
      return
    const targetField = item.sessionType === '2'
      ? { dnd_group_id: item.talkerId }
      : { dnd_uid: item.talkerId }
    const response = await api.notification.setSessionDoNotDisturb({
      uid: account,
      setting: muted ? 1 : 0,
      ...targetField,
      csrf: getCSRF(),
    })
    ensureBilibiliApiSuccess(response)
    if (!isCurrent(requestGeneration, account))
      return
    item.isMuted = muted
  }

  async function markRead(item: DisplayConversation, ackSeqno = item.maxSeqno) {
    const account = accountId.value
    const requestGeneration = generation.value
    if (!account || !ackSeqno)
      return
    const response = await api.notification.updateSessionAck({
      talker_id: item.talkerId,
      session_type: item.sessionType,
      ack_seqno: ackSeqno,
      csrf: getCSRF(),
    })
    ensureBilibiliApiSuccess(response)
    if (!isCurrent(requestGeneration, account))
      return
    markReadLocally(item.key)
  }

  async function openConversation(talkerId: string, sessionType = '1'): Promise<DisplayConversation> {
    const account = accountId.value
    const requestGeneration = generation.value
    if (!account)
      throw new Error('Login required')
    const response = await api.notification.getSessionDetail({
      talker_id: talkerId,
      session_type: sessionType,
    })
    const success = ensureBilibiliApiSuccess<Record<string, unknown>>(response)
    const rawSession = success.data?.session_info ?? success.data?.session ?? success.data
    const item = transformConversation(rawSession)
    const conversation: DisplayConversation = item.talkerId
      ? item
      : {
          key: createConversationKey(sessionType, talkerId),
          talkerId,
          sessionType,
          sourceSessionType: sessionType,
          sessionTimestamp: '',
          name: '',
          avatar: '',
          lastMessage: '',
          lastMessageKind: 'unknown',
          timestamp: 0,
          unreadCount: 0,
          maxSeqno: '',
          canalToken: '',
          isPinned: false,
          isMuted: false,
          isFollowed: false,
          isIntercepted: false,
          isTrusted: false,
          isSystem: ['3', '5'].includes(sessionType),
          isSupportGroup: false,
        }
    await enrichConversations([conversation], requestGeneration, account)
    if (!isCurrent(requestGeneration, account))
      throw new Error('Account changed')
    if (isCurrent(requestGeneration, account))
      upsertConversation(conversation)
    return conversation
  }

  function upsertConversation(item: DisplayConversation) {
    items.value = mergeUniqueConversations(items.value, [item])
  }

  function markReadLocally(key: string) {
    return markConversationRead(items.value, key)
  }

  onBeforeUnmount(stopSync)

  return {
    items,
    filteredItems,
    loading,
    loaded,
    noMore,
    error,
    search,
    filter,
    reset,
    refresh,
    loadMore,
    startSync,
    stopSync,
    setPinned,
    setMuted,
    remove,
    markRead,
    markReadLocally,
    openConversation,
    upsertConversation,
  }
}
