import type { MasonryWindowSnapshot } from '~/utils/momentColumnIndex'
import type { PaginationState } from '~/utils/paginationState'

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

export type NotificationReadCommit
  = | { phase: 'idle' }
    | { phase: 'uncommitted' | 'committed' | 'reconciled', id: string }

export interface NotificationFeedState extends PaginationState {
  items: DisplayNotification[]
  masonrySnapshot?: MasonryWindowSnapshot
  cursorId: string
  cursorTime: number
  loading: boolean
  loadingMore: boolean
  loaded: boolean
  errorKind: NotificationErrorKind | null
  failedOperation: NotificationFailedOperation
  failedFirstPageApplyMode: FirstPageApplyMode | null
  hasLoadedMore: boolean
  generation: number
  scrollTop: number
  loadedAt: number
  unreadCountAtFetch: number
  lastObservedUnreadCount: number
  firstPageRequestSerial: number
  readCommit: NotificationReadCommit
  readonly currentReadCommitId: string
  readonly serverReadCommitted: boolean
  readonly badgeReconciled: boolean
}

export interface NotificationReadCandidate {
  readCommitId: string
  mid: string
  section: NativeNotificationSection
  generation: number
  serverReadCommitted: true
}

export type NotificationFeedStates = Record<NativeNotificationSection, NotificationFeedState>
