import type { Ref } from 'vue'
import { reactive } from 'vue'

import api from '~/utils/api'
import { getCSRF } from '~/utils/main'

import { ensureBilibiliApiSuccess } from '../notificationApi'
import { dedupeBy, transformNotificationFeedPage } from '../notificationTransforms'
import type { DisplayNotification, NotificationFeedSection } from '../types'

interface FeedState {
  items: DisplayNotification[]
  cursorId: string
  cursorTime: number
  noMore: boolean
  loading: boolean
  loaded: boolean
  error: string
  generation: number
}

function createFeedState(): FeedState {
  return {
    items: [],
    cursorId: '',
    cursorTime: 0,
    noMore: false,
    loading: false,
    loaded: false,
    error: '',
    generation: 0,
  }
}

const FEED_SECTIONS: NotificationFeedSection[] = ['reply', 'at', 'love', 'system']

function sortSystemNotifications(items: DisplayNotification[]) {
  return [...items].sort((left, right) => {
    if (left.cursor.length !== right.cursor.length)
      return right.cursor.length - left.cursor.length
    return right.cursor.localeCompare(left.cursor)
  })
}

export function useNotificationFeed(accountId: Ref<string | null>) {
  const states = reactive<Record<NotificationFeedSection, FeedState>>({
    reply: createFeedState(),
    at: createFeedState(),
    love: createFeedState(),
    system: createFeedState(),
  })
  function resetAll() {
    FEED_SECTIONS.forEach((section) => {
      const state = states[section]
      state.generation += 1
      Object.assign(state, createFeedState(), { generation: state.generation })
    })
  }

  function isCurrent(section: NotificationFeedSection, generation: number, account: string) {
    return states[section].generation === generation && accountId.value === account
  }

  async function requestFeed(section: NotificationFeedSection, reset: boolean) {
    const state = states[section]
    const account = accountId.value
    if (!account || state.loading || (!reset && state.noMore))
      return

    if (reset) {
      state.generation += 1
    }

    const generation = state.generation
    state.loading = true
    state.error = ''
    try {
      if (section === 'system') {
        const responses = reset
          ? await Promise.all([
              api.notification.getUnifiedSystemNotifications({ page_size: 10 }),
              api.notification.getUserSystemNotifications({ page_size: 20 }),
            ])
          : [await api.notification.getSystemNotificationList({
              cursor: state.cursorId,
              data_type: 1,
            })]

        if (!isCurrent(section, generation, account))
          return

        const pages = responses.map((response) => {
          ensureBilibiliApiSuccess(response)
          return transformNotificationFeedPage(response, section)
        })
        const received = pages.flatMap(page => page.items)
        state.items = sortSystemNotifications(
          dedupeBy(reset ? received : [...state.items, ...received], item => item.id),
        )
        const lastPage = pages.at(-1)
        state.cursorId = state.items.at(-1)?.cursor || lastPage?.cursor.id || state.cursorId
        state.cursorTime = lastPage?.cursor.time || state.cursorTime
        state.noMore = reset
          ? !received.length
          : !received.length || Boolean(lastPage?.cursor.isEnd)
      }
      else {
        const cursorParams = !reset && state.cursorId
          ? section === 'reply'
            ? { id: state.cursorId, reply_time: state.cursorTime }
            : section === 'at'
              ? { id: state.cursorId, at_time: state.cursorTime }
              : { id: state.cursorId, like_time: state.cursorTime }
          : {}
        const response = section === 'reply'
          ? await api.notification.getReplyNotifications(cursorParams)
          : section === 'at'
            ? await api.notification.getAtNotifications(cursorParams)
            : await api.notification.getLikeNotifications(cursorParams)

        if (!isCurrent(section, generation, account))
          return
        ensureBilibiliApiSuccess(response)
        const page = transformNotificationFeedPage(response, section)
        state.items = dedupeBy(reset ? page.items : [...state.items, ...page.items], item => item.id)
        state.cursorId = page.cursor.id
        state.cursorTime = page.cursor.time
        state.noMore = page.cursor.isEnd || (!page.items.length && !page.cursor.id)
      }
      state.loaded = true
    }
    catch (error) {
      if (isCurrent(section, generation, account))
        state.error = error instanceof Error ? error.message : String(error)
    }
    finally {
      if (isCurrent(section, generation, account))
        state.loading = false
    }
  }

  async function refresh(section: NotificationFeedSection) {
    await requestFeed(section, true)
  }

  async function loadMore(section: NotificationFeedSection) {
    await requestFeed(section, false)
  }

  async function deleteNotification(section: NotificationFeedSection, item: DisplayNotification) {
    const account = accountId.value
    const requestGeneration = states[section].generation
    if (!account)
      return
    const response = await api.notification.deleteNotification({
      tp: section === 'reply' ? 1 : section === 'at' ? 2 : 0,
      id: item.id,
      csrf: getCSRF(),
    })
    ensureBilibiliApiSuccess(response)
    if (!isCurrent(section, requestGeneration, account))
      return
    states[section].items = states[section].items.filter(candidate => candidate.id !== item.id)
  }

  async function toggleReplyLike(item: DisplayNotification) {
    const account = accountId.value
    const requestGeneration = states[item.section].generation
    if (!account)
      return
    const response = item.isDanmu
      ? await api.notification.directMessageNotificationLike({
          oid: item.subjectId,
          dmid: item.sourceId,
          op: item.liked ? 2 : 1,
          csrf: getCSRF(),
        })
      : await api.notification.replyNotificationLike({
          oid: item.subjectId,
          type: item.businessType,
          rpid: item.sourceId,
          action: item.liked ? 0 : 1,
          csrf: getCSRF(),
        })
    ensureBilibiliApiSuccess(response)
    if (isCurrent(item.section, requestGeneration, account))
      item.liked = !item.liked
  }

  async function replyToNotification(item: DisplayNotification, message: string) {
    const account = accountId.value
    if (!account)
      return
    const response = item.isDanmu
      ? await api.notification.replyDirectMessageNotification({
          oid: item.subjectId,
          aid: item.danmuAid,
          progress: item.danmuProgress,
          msg: message,
          rnd: Number(Math.random().toString().slice(8)),
          csrf: getCSRF(),
        })
      : await api.notification.replyNotification({
          oid: item.subjectId,
          type: item.businessType,
          root: item.rootId,
          parent: item.parentId,
          message,
          csrf: getCSRF(),
        })
    ensureBilibiliApiSuccess(response)
  }

  async function markSystemRead() {
    const first = states.system.items[0]
    const account = accountId.value
    const requestGeneration = states.system.generation
    if (!account || !first?.cursor)
      return
    const response = await api.notification.updateSystemNotificationCursor({
      cursor: first.cursor,
      has_up: 0,
    })
    ensureBilibiliApiSuccess(response)
    if (!isCurrent('system', requestGeneration, account))
      return
    states.system.items.forEach(item => item.unread = false)
  }

  return {
    states,
    resetAll,
    refresh,
    loadMore,
    deleteNotification,
    toggleReplyLike,
    replyToNotification,
    markSystemRead,
  }
}
