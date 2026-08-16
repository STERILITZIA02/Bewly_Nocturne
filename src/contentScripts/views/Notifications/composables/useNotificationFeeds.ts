import type { ComputedRef, MaybeRefOrGetter } from 'vue'
import { computed, toValue } from 'vue'

import type { NativeNotificationSection } from '../notificationSections'
import type { NotificationFeedStates } from './notificationFeedState'
import type {
  LoadNotificationFirstPageOptions,
  NotificationPageParams,
  NotificationReadCandidate,
  RefreshNotificationFeedOptions,
} from './useNotificationFeed'
import { useNotificationFeed } from './useNotificationFeed'

export interface NotificationFeedsOptions {
  fetchPage: (
    section: NativeNotificationSection,
    params?: NotificationPageParams,
  ) => Promise<unknown>
}

export interface NotificationFeedsController {
  accountMid: ComputedRef<string>
  states: NotificationFeedStates
  confirmReadCandidate: (section: NativeNotificationSection, candidate: NotificationReadCandidate) => boolean
  ensureLoaded: (section: NativeNotificationSection, unreadCount?: number) => Promise<void>
  getReadCandidate: (section: NativeNotificationSection) => NotificationReadCandidate | null
  isReadCandidateCurrent: (section: NativeNotificationSection, candidate: NotificationReadCandidate) => boolean
  loadInitial: (
    section: NativeNotificationSection,
    options?: LoadNotificationFirstPageOptions,
  ) => Promise<void>
  loadMore: (section: NativeNotificationSection) => Promise<void>
  markCandidateReadLocally: (section: NativeNotificationSection, candidate: NotificationReadCandidate) => boolean
  refresh: (section: NativeNotificationSection, unreadCount?: number) => Promise<void>
  refreshIfStale: (
    section: NativeNotificationSection,
    options: RefreshNotificationFeedOptions,
  ) => Promise<void>
  retryFailedOperation: (section: NativeNotificationSection, unreadCount?: number) => Promise<void>
}

export function useNotificationFeeds(
  mid: MaybeRefOrGetter<string>,
  options: NotificationFeedsOptions,
): NotificationFeedsController {
  const accountMid = computed(() => toValue(mid))
  const feeds = {
    reply: useNotificationFeed(accountMid, 'reply', {
      fetchPage: params => options.fetchPage('reply', params),
    }),
    at: useNotificationFeed(accountMid, 'at', {
      fetchPage: params => options.fetchPage('at', params),
    }),
    love: useNotificationFeed(accountMid, 'love', {
      fetchPage: params => options.fetchPage('love', params),
    }),
    system: useNotificationFeed(accountMid, 'system', {
      fetchPage: params => options.fetchPage('system', params),
    }),
  }
  const states: NotificationFeedStates = {
    reply: feeds.reply.state,
    at: feeds.at.state,
    love: feeds.love.state,
    system: feeds.system.state,
  }

  return {
    accountMid,
    states,
    confirmReadCandidate: (section, candidate) => feeds[section].confirmReadCandidate(candidate),
    ensureLoaded: (section, unreadCount) => feeds[section].ensureLoaded(unreadCount),
    getReadCandidate: section => feeds[section].readCandidate.value,
    isReadCandidateCurrent: (section, candidate) => feeds[section].isReadCandidateCurrent(candidate),
    loadInitial: (section, loadOptions) => feeds[section].loadInitial(loadOptions),
    loadMore: section => feeds[section].loadMore(),
    markCandidateReadLocally: (section, candidate) => feeds[section].markCandidateReadLocally(candidate),
    refresh: (section, unreadCount) => feeds[section].refresh(unreadCount),
    refreshIfStale: (section, refreshOptions) => feeds[section].refreshIfStale(refreshOptions),
    retryFailedOperation: (section, unreadCount) => feeds[section].retryFailedOperation(unreadCount),
  }
}
