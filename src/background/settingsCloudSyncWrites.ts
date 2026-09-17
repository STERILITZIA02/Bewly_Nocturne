import type { Storage } from 'webextension-polyfill'

import { SETTINGS_CLOUD_SYNC_STATUS_KEY } from '~/utils/settingsCloudSyncProtocol'

const WRITE_STATE_KEY = 'settingsCloudSyncWrites:v1'
// One cycle makes at most two calls (upload + a raced incompatible-entry restoration).
// Even continuously editing stays below Chrome's 120/minute and 1800/hour limits.
export const CLOUD_SYNC_WRITE_CYCLE_MS = 5_000
const QUOTA_WINDOW_PADDING_MS = 1_000

function quotaWindow(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  if (message.includes('MAX_WRITE_OPERATIONS_PER_HOUR'))
    return 60 * 60_000 + QUOTA_WINDOW_PADDING_MS
  if (message.includes('MAX_WRITE_OPERATIONS_PER_MINUTE'))
    return 60_000 + QUOTA_WINDOW_PADDING_MS
  return 0
}

/** Scheduling metadata only; values/versions remain owned by the settings coordinator. */
export function createSettingsCloudSyncWrites(storage: Pick<Storage.StorageArea, 'get' | 'set'>, now = Date.now) {
  let nextCycleAt = 0
  let blockedUntil = 0
  let loaded: Promise<void> | undefined
  const save = () => storage.set({ [WRITE_STATE_KEY]: { nextCycleAt, blockedUntil } })
  const load = () => loaded ??= (async () => {
    const stored = await storage.get([WRITE_STATE_KEY, SETTINGS_CLOUD_SYNC_STATUS_KEY])
    const state = stored[WRITE_STATE_KEY] as { nextCycleAt?: number, blockedUntil?: number } | undefined
    nextCycleAt = Number.isFinite(state?.nextCycleAt) ? state!.nextCycleAt! : 0
    blockedUntil = Number.isFinite(state?.blockedUntil) ? state!.blockedUntil! : 0
    // Existing installations may already have exhausted a quota before this limiter existed.
    const previousFailure = (stored[SETTINGS_CLOUD_SYNC_STATUS_KEY] as { lastError?: unknown } | undefined)?.lastError
    if (!state && typeof previousFailure === 'string' && quotaWindow(previousFailure)) {
      blockedUntil = now() + quotaWindow(previousFailure)
      await save()
    }
  })().catch((error) => {
    loaded = undefined
    throw error
  })
  return {
    load,
    delay: () => Math.max(0, nextCycleAt - now(), blockedUntil - now()),
    retryAt: () => blockedUntil > now() ? blockedUntil : 0,
    async reserveCycle() {
      await load()
      if (nextCycleAt > now() || blockedUntil > now())
        return false
      nextCycleAt = now() + CLOUD_SYNC_WRITE_CYCLE_MS
      await save()
      return true
    },
    async handleQuota(error: unknown) {
      const duration = quotaWindow(error)
      if (!duration)
        return false
      blockedUntil = Math.max(blockedUntil, now() + duration)
      await save()
      return true
    },
  }
}
