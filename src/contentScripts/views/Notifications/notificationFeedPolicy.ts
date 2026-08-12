import type {
  NotificationFeedState,
  NotificationReadCandidate,
} from './composables/notificationFeedState'
import type { NativeNotificationSection } from './notificationSections'
import { NOTIFICATION_STALE_TIME_MS } from './notificationTimings'

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
      options.reason === 'visibility'
      && state.loadedAt > 0
      && now - state.loadedAt >= NOTIFICATION_STALE_TIME_MS
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
