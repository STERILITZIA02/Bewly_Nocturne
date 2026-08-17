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
  let disposed = false
  let eligible = false
  let generation = 0
  let activeMid = ''
  let timer: ReturnType<typeof setTimeout> | null = null
  let inFlight: Promise<void> | null = null
  let pendingLifecyclePoll = false
  let transientFailureCount = 0

  function clearTimer() {
    if (timer === null)
      return
    runtime.clearTimeout(timer)
    timer = null
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
      || disposed
      || requestGeneration !== generation
      || !context.isEligible()
    ) {
      return
    }
    timer = runtime.setTimeout(() => {
      timer = null
      void triggerNow()
    }, delay)
  }

  async function poll(requestGeneration: number): Promise<number | null> {
    const activeBefore = context.getActiveConversation()
    await context.refreshSessions()
    if (
      disposed
      || requestGeneration !== generation
      || !context.isEligible()
    ) {
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
        if (
          disposed
          || requestGeneration !== generation
          || !context.isEligible()
        ) {
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
    if (disposed || !context.isEligible())
      return Promise.resolve()
    clearTimer()
    if (inFlight)
      return inFlight

    const requestGeneration = generation
    const request = (async () => {
      const delay = await poll(requestGeneration)
      scheduleNext(delay, requestGeneration)
    })().finally(() => {
      if (inFlight === request) {
        inFlight = null
        if (pendingLifecyclePoll && !disposed && context.isEligible()) {
          pendingLifecyclePoll = false
          void triggerNow()
        }
      }
    })
    inFlight = request
    return request
  }

  function sync() {
    if (disposed)
      return
    const nextEligible = context.isEligible()
    const nextMid = context.getCurrentMid()
    const midChanged = nextMid !== activeMid

    if (!nextEligible) {
      if (eligible || timer !== null || inFlight) {
        generation++
        clearTimer()
        context.invalidatePendingRequests()
      }
      eligible = false
      pendingLifecyclePoll = false
      activeMid = nextMid
      return
    }

    if (midChanged) {
      generation++
      clearTimer()
      context.invalidatePendingRequests()
      activeMid = nextMid
    }
    if (!eligible || midChanged) {
      eligible = true
      if (inFlight)
        pendingLifecyclePoll = true
      else
        void triggerNow()
    }
  }

  function dispose() {
    if (disposed)
      return
    disposed = true
    eligible = false
    pendingLifecyclePoll = false
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
