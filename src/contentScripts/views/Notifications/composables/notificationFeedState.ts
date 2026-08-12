import type { DisplayNotification } from '../notification'
import type { NativeNotificationSection } from '../notificationSections'

export type NotificationErrorKind
  = | 'login-required'
    | 'risk-control'
    | 'server-error'
    | 'network'
    | 'invalid-response'
    | 'api-error'

export type NotificationFailedOperation
  = | 'initial'
    | 'refresh'
    | 'load-more'
    | null

export type FirstPageApplyMode = 'replace' | 'merge-head'

export interface NotificationFeedState {
  items: DisplayNotification[]
  cursorId: string
  cursorTime: number
  loading: boolean
  loadingMore: boolean
  loaded: boolean
  noMore: boolean
  errorKind: NotificationErrorKind | null
  failedOperation: NotificationFailedOperation
  failedFirstPageApplyMode: FirstPageApplyMode | null
  hasLoadedMore: boolean
  paginationStalled: boolean
  generation: number
  scrollTop: number
  loadedAt: number
  unreadCountAtFetch: number
  lastObservedUnreadCount: number
  firstPageRequestSerial: number
  currentReadCommitId: string
  serverReadCommitted: boolean
  badgeReconciled: boolean
}

export interface NotificationReadCandidate {
  readCommitId: string
  mid: string
  section: NativeNotificationSection
  generation: number
  serverReadCommitted: true
}

export type NotificationFeedStates = Record<NativeNotificationSection, NotificationFeedState>
