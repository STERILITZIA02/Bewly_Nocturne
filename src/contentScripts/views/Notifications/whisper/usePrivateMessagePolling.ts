import { onBeforeUnmount, watchEffect } from 'vue'

import type { PrivateMessageTransportErrorKind } from '~/background/privateMessage/types'

export const PRIVATE_MESSAGE_POLL_INTERVAL_MS = 20_000
export const PRIVATE_MESSAGE_DETAIL_FALLBACK_MS = 60_000
export const PRIVATE_MESSAGE_POLL_MAX_BACKOFF_MS = 120_000

interface ActivePrivateConversation {
  canReadNative: boolean
  maxSeqno: string
  talkerId: string
}

interface PrivateConversationPollingStatus {
  errorKind: PrivateMessageTransportErrorKind | null
  failedOperation: string | null
  loading: boolean
  loadedAt: number
}

export interface PrivateMessagePollingContext {
  getActiveConversation: () => ActivePrivateConversation | null
  getConversationStatus: (talkerId: string) => PrivateConversationPollingStatus
  getCurrentMid: () => string
  getSessionRefreshError: () => PrivateMessageTransportErrorKind | null
  invalidatePendingRequests: () => void
  isEligible: () => boolean
  refreshConversation: (talkerId: string) => Promise<void>
  refreshSessions: () => Promise<void>
}

interface PrivateMessagePollingRuntime {
  clearTimeout: (timer: ReturnType<typeof setTimeout>) => void
  now: () => number
  setTimeout: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>
}

interface PrivateMessageTimerHost {
  clearTimeout: (timer: ReturnType<typeof setTimeout>) => void
  setTimeout: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>
}

export interface PrivateMessagePollingCoordinator {
  dispose: () => void
  sync: () => void
  triggerNow: () => Promise<void>
}

export function createPrivateMessagePollingRuntime(
  timerHost: PrivateMessageTimerHost = globalThis,
): PrivateMessagePollingRuntime {
  return {
    clearTimeout: timer => timerHost.clearTimeout(timer),
    now: () => Date.now(),
    setTimeout: (callback, delay) => timerHost.setTimeout(callback, delay),
  }
}

const DEFAULT_POLLING_RUNTIME = createPrivateMessagePollingRuntime()

function compareUnsignedDecimal(left: string, right: string): number {
  const normalizedLeft = /^\d+$/.test(left) ? left.replace(/^0+(?=\d)/, '') : ''
  const normalizedRight = /^\d+$/.test(right) ? right.replace(/^0+(?=\d)/, '') : ''
  if (!normalizedLeft || !normalizedRight)
    return normalizedLeft.localeCompare(normalizedRight)
  if (normalizedLeft.length !== normalizedRight.length)
    return normalizedLeft.length - normalizedRight.length
  return normalizedLeft.localeCompare(normalizedRight)
}

function hasMaxSeqnoAdvanced(before: string, after: string): boolean {
  return Boolean(after) && (!before || compareUnsignedDecimal(after, before) > 0)
}

function isBackoffError(kind: PrivateMessageTransportErrorKind | null): boolean {
  return kind === 'network'
    || kind === 'server-error'
    || kind === 'wbi-unavailable'
}

export function createPrivateMessagePollingCoordinator(
  context: PrivateMessagePollingContext,
  runtime: PrivateMessagePollingRuntime = DEFAULT_POLLING_RUNTIME,
): PrivateMessagePollingCoordinator {
  let lifecycle: 'inactive' | 'active' | 'disposed' = 'inactive'
  let generation = 0
  let activeMid = ''
  let activity:
    | { phase: 'idle' }
    | { phase: 'waiting', timer: ReturnType<typeof setTimeout> }
    | { phase: 'polling', promise: Promise<void>, resume: boolean }
      = { phase: 'idle' }
  let transientFailureCount = 0

  function isCurrentPoll(expectedGeneration: number) {
    return lifecycle !== 'disposed' && generation === expectedGeneration && context.isEligible()
  }

  function clearTimer() {
    if (activity.phase !== 'waiting')
      return
    runtime.clearTimeout(activity.timer)
    activity = { phase: 'idle' }
  }

  function getRetryDelay(kind: PrivateMessageTransportErrorKind | null): number | null {
    if (kind === 'login-required')
      return null
    if (kind === 'risk-control') {
      transientFailureCount = Math.max(transientFailureCount, 4)
      return PRIVATE_MESSAGE_POLL_MAX_BACKOFF_MS
    }
    if (isBackoffError(kind)) {
      const delay = Math.min(
        PRIVATE_MESSAGE_POLL_INTERVAL_MS * 2 ** transientFailureCount,
        PRIVATE_MESSAGE_POLL_MAX_BACKOFF_MS,
      )
      transientFailureCount++
      return delay
    }
    transientFailureCount = 0
    return PRIVATE_MESSAGE_POLL_INTERVAL_MS
  }

  function scheduleNext(delay: number | null, requestGeneration: number) {
    clearTimer()
    if (
      delay === null
      || !isCurrentPoll(requestGeneration)
    ) {
      return
    }
    activity = {
      phase: 'waiting',
      timer: runtime.setTimeout(() => {
        activity = { phase: 'idle' }
        void triggerNow()
      }, delay),
    }
  }

  async function poll(requestGeneration: number): Promise<number | null> {
    const activeBefore = context.getActiveConversation()
    await context.refreshSessions()
    if (!isCurrentPoll(requestGeneration)) {
      return null
    }

    const sessionError = context.getSessionRefreshError()
    if (sessionError)
      return getRetryDelay(sessionError)

    const activeAfter = context.getActiveConversation()
    if (
      activeAfter?.canReadNative
      && activeAfter.talkerId
      && (!activeBefore || activeBefore.talkerId === activeAfter.talkerId)
    ) {
      const status = context.getConversationStatus(activeAfter.talkerId)
      const shouldRefreshDetail = hasMaxSeqnoAdvanced(
        activeBefore?.maxSeqno ?? '',
        activeAfter.maxSeqno,
      ) || (!status.loading && (
        status.loadedAt <= 0
        || runtime.now() - status.loadedAt >= PRIVATE_MESSAGE_DETAIL_FALLBACK_MS
      ))

      if (shouldRefreshDetail) {
        await context.refreshConversation(activeAfter.talkerId)
        if (!isCurrentPoll(requestGeneration)) {
          return null
        }
        const refreshedStatus = context.getConversationStatus(activeAfter.talkerId)
        const detailError = refreshedStatus.failedOperation === 'load-older'
          ? null
          : refreshedStatus.errorKind
        if (detailError)
          return getRetryDelay(detailError)
      }
    }

    transientFailureCount = 0
    return PRIVATE_MESSAGE_POLL_INTERVAL_MS
  }

  function triggerNow(): Promise<void> {
    if (lifecycle === 'disposed' || !context.isEligible())
      return Promise.resolve()
    clearTimer()
    if (activity.phase === 'polling')
      return activity.promise

    const requestGeneration = generation
    let nextDelay: number | null = null
    const request = (async () => {
      nextDelay = await poll(requestGeneration)
    })().finally(() => {
      if (activity.phase === 'polling' && activity.promise === request) {
        const resume = activity.resume
        activity = { phase: 'idle' }
        if (resume && lifecycle !== 'disposed' && context.isEligible())
          void triggerNow()
        else
          scheduleNext(nextDelay, requestGeneration)
      }
    })
    activity = { phase: 'polling', promise: request, resume: false }
    return request
  }

  function sync() {
    if (lifecycle === 'disposed')
      return
    const nextEligible = context.isEligible()
    const nextMid = context.getCurrentMid()
    const midChanged = nextMid !== activeMid

    if (!nextEligible) {
      if (lifecycle === 'active' || activity.phase !== 'idle') {
        generation++
        clearTimer()
        context.invalidatePendingRequests()
      }
      lifecycle = 'inactive'
      if (activity.phase === 'polling')
        activity.resume = false
      activeMid = nextMid
      return
    }

    if (midChanged) {
      generation++
      clearTimer()
      context.invalidatePendingRequests()
      activeMid = nextMid
    }
    if (lifecycle !== 'active' || midChanged) {
      lifecycle = 'active'
      if (activity.phase === 'polling')
        activity.resume = true
      else
        void triggerNow()
    }
  }

  function dispose() {
    if (lifecycle === 'disposed')
      return
    lifecycle = 'disposed'
    if (activity.phase === 'polling')
      activity.resume = false
    generation++
    clearTimer()
    context.invalidatePendingRequests()
  }

  return {
    dispose,
    sync,
    triggerNow,
  }
}

export interface PrivateMessagePollingLifecycleContext extends PrivateMessagePollingContext {
  shouldObserveVisibility: () => boolean
}

export function usePrivateMessagePolling(context: PrivateMessagePollingLifecycleContext) {
  const coordinator = createPrivateMessagePollingCoordinator(context)
  let visibilityListenerActive = false

  function handleVisibilityChange() {
    coordinator.sync()
  }

  function syncVisibilityListener(shouldListen: boolean) {
    if (shouldListen === visibilityListenerActive)
      return
    visibilityListenerActive = shouldListen
    if (shouldListen)
      document.addEventListener('visibilitychange', handleVisibilityChange)
    else
      document.removeEventListener('visibilitychange', handleVisibilityChange)
  }

  const stopLifecycleWatch = watchEffect(() => {
    syncVisibilityListener(context.shouldObserveVisibility())
    coordinator.sync()
  })

  onBeforeUnmount(() => {
    stopLifecycleWatch()
    syncVisibilityListener(false)
    coordinator.dispose()
  })

  return coordinator
}
