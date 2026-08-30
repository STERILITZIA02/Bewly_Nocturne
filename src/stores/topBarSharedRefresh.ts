export const SHARED_REFRESH_RETRY_DELAY_MS = 250

export type SharedRefreshEndpointName
  = | 'getUnreadMsg'
    | 'getUnreadDm'
    | 'getTopBarNewMomentsCount'
    | 'getWatchLaterCount'
    | 'getWatchLaterMembership'
    | 'getWatchLaterList'
    | 'refreshVipRewardStatus'

export type SharedRefreshFailureKind
  = | 'network'
    | 'api-error'
    | 'invalid-response'
    | 'account-changed'
    | 'unknown'

export interface SharedRefreshDiagnostic {
  endpointName: SharedRefreshEndpointName
  errorKind: Exclude<SharedRefreshFailureKind, 'account-changed'>
}

type SharedRefreshOperationResult = true | SharedRefreshFailureKind

interface SharedRefreshRequestDependencies {
  isTerminalError: (error: unknown) => boolean
  report: (diagnostic: SharedRefreshDiagnostic) => void
  wait: (delay: number) => Promise<void>
}

interface SharedRefreshLeaseCallbacks {
  refresh: () => Promise<boolean>
  isCurrent: () => boolean
  release: () => Promise<void>
  publish: () => Promise<void>
}

function isTransientNetworkError(error: unknown): boolean {
  if (error instanceof TypeError)
    return true
  if (!error || typeof error !== 'object')
    return false

  const candidate = error as { code?: unknown, message?: unknown, originalError?: unknown }
  if (candidate.code === -1)
    return true
  const message = [candidate.message, candidate.originalError]
    .filter(value => typeof value === 'string')
    .join(' ')
    .toLowerCase()
  return message.includes('failed to fetch')
    || message.includes('networkerror')
    || message.includes('network request failed')
}

export function formatSharedRefreshDiagnostic(diagnostic: SharedRefreshDiagnostic): string {
  return `[TopBar] Shared refresh skipped: ${diagnostic.endpointName} (${diagnostic.errorKind})`
}

export function reportSharedRefreshFailure(diagnostic: SharedRefreshDiagnostic) {
  if (import.meta.env?.DEV)
    console.debug(formatSharedRefreshDiagnostic(diagnostic))
}

export async function runSharedRefreshRequest(
  endpointName: SharedRefreshEndpointName,
  operation: () => Promise<SharedRefreshOperationResult>,
  dependencies: Partial<SharedRefreshRequestDependencies> = {},
): Promise<boolean> {
  const report = dependencies.report ?? reportSharedRefreshFailure
  const wait = dependencies.wait ?? (delay => new Promise(resolve => setTimeout(resolve, delay)))
  const isTerminalError = dependencies.isTerminalError ?? (() => false)

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await operation()
      if (result === true)
        return true
      if (result === 'network' && attempt === 0) {
        await wait(SHARED_REFRESH_RETRY_DELAY_MS)
        continue
      }
      if (result !== 'account-changed')
        report({ endpointName, errorKind: result })
      return false
    }
    catch (error) {
      if (isTerminalError(error))
        throw error

      const errorKind = isTransientNetworkError(error) ? 'network' : 'unknown'
      if (errorKind === 'network' && attempt === 0) {
        await wait(SHARED_REFRESH_RETRY_DELAY_MS)
        continue
      }

      report({ endpointName, errorKind })
      return false
    }
  }

  return false
}

export async function settleSharedRefreshTasks(
  tasks: ReadonlyArray<() => Promise<boolean>>,
  isTerminalError: (error: unknown) => boolean = () => false,
): Promise<boolean> {
  const results = await Promise.allSettled(tasks.map(task => task()))
  const terminalFailure = results.find(
    result => result.status === 'rejected' && isTerminalError(result.reason),
  )
  if (terminalFailure?.status === 'rejected')
    throw terminalFailure.reason

  return results.every(result => result.status === 'fulfilled' && result.value)
}

export async function completeSharedRefreshLease(
  callbacks: SharedRefreshLeaseCallbacks,
): Promise<boolean> {
  let leaseSettled = false
  const release = async () => {
    if (leaseSettled)
      return
    leaseSettled = true
    await callbacks.release()
  }

  try {
    const refreshed = await callbacks.refresh()
    if (!refreshed || !callbacks.isCurrent()) {
      await release()
      return false
    }

    await callbacks.publish()
    leaseSettled = true
    return true
  }
  catch (error) {
    await release()
    throw error
  }
}
