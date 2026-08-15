import type {
  FirstPageApplyMode,
  NotificationFeedState,
  NotificationReadCandidate,
} from './composables/notificationFeedState'
import type { DisplayNotification } from './notification'
import type { NotificationPageResult } from './notificationFeedParsing'
import type { NativeNotificationSection } from './notificationSections'
import {
  NOTIFICATION_ACTIVATE_STALE_TIME_MS,
  NOTIFICATION_VISIBILITY_STALE_TIME_MS,
} from './notificationTimings'

export type NotificationAccountState = 'logged-out' | 'profile-pending' | 'ready'

export interface RefreshNotificationFeedOptions {
  force?: boolean
  now?: number
  reason: 'activate' | 'unread-change' | 'visibility' | 'manual'
  unreadCount: number
}

type NotificationFeedFreshnessState = Pick<
  NotificationFeedState,
  'loaded' | 'loadedAt' | 'unreadCountAtFetch' | 'lastObservedUnreadCount'
>

type NotificationFirstPageState = Pick<
  NotificationFeedState,
  'items' | 'cursorId' | 'cursorTime' | 'noMore' | 'hasLoadedMore' | 'paginationStalled'
>

export interface NotificationPaginationProgressInput {
  previousCursorId: string
  previousCursorTime: number
  nextCursorId: string
  nextCursorTime: number
  newUniqueItemCount: number
  noMore: boolean
}

export interface NotificationPaginationProgress {
  madeProgress: boolean
  stalled: boolean
}

export interface NotificationBadgePolicyInput {
  active: boolean
  visible: boolean
  accountMid: string
  currentSection: NativeNotificationSection
  currentGeneration: number
  currentReadCommitId: string
  badgeReconciled: boolean
  candidate: NotificationReadCandidate | null
}

export function normalizeUnreadCount(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0
}

export function createReadCommitId(
  section: NativeNotificationSection,
  mid: string,
  generation: number,
  firstPageRequestSerial: number,
): string {
  return [section, mid, generation, firstPageRequestSerial].join(':')
}

export function resolveNotificationAccountState(
  isLoggedIn: boolean,
  mid: string,
): NotificationAccountState {
  if (!isLoggedIn)
    return 'logged-out'
  return mid ? 'ready' : 'profile-pending'
}

export function mergeNotificationHead(
  currentItems: DisplayNotification[],
  firstPageItems: DisplayNotification[],
): DisplayNotification[] {
  const firstPageIds = new Set(firstPageItems.map(item => item.id))
  return [
    ...firstPageItems,
    ...currentItems.filter(item => !firstPageIds.has(item.id)),
  ]
}

export function applyNotificationFirstPage(
  current: NotificationFirstPageState,
  page: NotificationPageResult,
  mode: FirstPageApplyMode,
): NotificationFirstPageState {
  if (mode === 'replace') {
    return {
      items: [...page.items],
      cursorId: page.cursorId,
      cursorTime: page.cursorTime,
      noMore: page.noMore,
      hasLoadedMore: false,
      paginationStalled: false,
    }
  }

  return {
    items: mergeNotificationHead(current.items, page.items),
    cursorId: current.hasLoadedMore ? current.cursorId : page.cursorId,
    cursorTime: current.hasLoadedMore ? current.cursorTime : page.cursorTime,
    noMore: current.hasLoadedMore ? current.noMore : page.noMore,
    hasLoadedMore: current.hasLoadedMore,
    paginationStalled: current.hasLoadedMore ? current.paginationStalled : false,
  }
}

export function evaluatePaginationProgress(
  input: NotificationPaginationProgressInput,
): NotificationPaginationProgress {
  const madeProgress = input.newUniqueItemCount > 0
    || input.nextCursorId !== input.previousCursorId
    || input.nextCursorTime !== input.previousCursorTime
  return {
    madeProgress,
    stalled: !input.noMore && !madeProgress,
  }
}

export function shouldRefreshFeed(
  state: NotificationFeedFreshnessState,
  options: RefreshNotificationFeedOptions,
): boolean {
  const unreadCount = normalizeUnreadCount(options.unreadCount)
  const now = options.now ?? Date.now()
  return Boolean(
    options.force
    || !state.loaded
    || (unreadCount > 0 && unreadCount !== state.unreadCountAtFetch)
    || (state.lastObservedUnreadCount === 0 && unreadCount > 0)
    || (
      (options.reason === 'visibility' || options.reason === 'activate')
      && state.loadedAt > 0
      && now - state.loadedAt >= (
        options.reason === 'visibility'
          ? NOTIFICATION_VISIBILITY_STALE_TIME_MS
          : NOTIFICATION_ACTIVATE_STALE_TIME_MS
      )
    ),
  )
}

export function shouldReconcileUnreadBadge(input: NotificationBadgePolicyInput): boolean {
  const { candidate } = input
  return Boolean(
    candidate
    && input.active
    && input.visible
    && candidate.serverReadCommitted
    && candidate.mid === input.accountMid
    && candidate.section === input.currentSection
    && candidate.generation === input.currentGeneration
    && candidate.readCommitId === input.currentReadCommitId
    && !input.badgeReconciled,
  )
}
