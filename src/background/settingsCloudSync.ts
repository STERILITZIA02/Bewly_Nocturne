import browser from 'webextension-polyfill'

import { onMessage } from '~/utils/messaging'
import type {
  SettingsCloudSyncAvailability,
  SettingsCloudSyncEnableRequest,
  SettingsCloudSyncEnableResponse,
  SettingsCloudSyncEntry,
  SettingsCloudSyncMode,
} from '~/utils/settingsCloudSyncProtocol'
import {
  classifySettingsCloudSyncSnapshot,
  compareSettingsCloudSyncVersions,
  createSettingsCloudSyncKey,
  DEFAULT_SETTINGS_CLOUD_SYNC_STATUS,
  estimateSettingsCloudSyncItemBytes,
  getSettingsCloudSyncRetryDelay,
  isSettingsCloudSyncEnabled,
  normalizeSettingsCloudSyncEntry,
  normalizeSettingsCloudSyncMode,
  parseSettingsCloudSyncKey,
  SETTINGS_CLOUD_SYNC_AVAILABILITY_MESSAGE,
  SETTINGS_CLOUD_SYNC_ENABLE_MESSAGE,
  SETTINGS_CLOUD_SYNC_ENABLED_KEY,
  SETTINGS_CLOUD_SYNC_ITEM_BYTES_LIMIT,
  SETTINGS_CLOUD_SYNC_STATUS_KEY,
  SETTINGS_CLOUD_SYNC_TOTAL_BYTES_LIMIT,
} from '~/utils/settingsCloudSyncProtocol'
import { normalizeSettingsStorageWriteMeta, SETTINGS_STORAGE_META_KEY } from '~/utils/settingsStorageProtocol'

import {
  applySettingsCloudSyncChanges,
  collectSettingsCloudSyncEntries,
  reconcileSettingsCloudSyncSnapshot,
} from './settingsStorageCoordinator'

const CLOUD_UPLOAD_DELAY = 1_500
const CLOUD_SYNC_ITEM_COUNT_LIMIT = 480

let initialized = false
let enabled = false
let ready = false
let generation = 0
let preferenceGeneration = 0
let restartAfterInitialization = false
type SettingsCloudSyncStartResult = 'ready' | 'incompatible' | 'conflict' | 'failed'

let initializationPromise: Promise<SettingsCloudSyncStartResult> | undefined
let initializationToken: symbol | undefined
let messageEnableInProgressCount = 0
let enableIntentGeneration = 0
let enableRequestGeneration = -1
let enableRequestPromise: Promise<SettingsCloudSyncEnableResponse> | undefined
let preferenceReadRetryTimer: ReturnType<typeof setTimeout> | undefined
let preferenceReadRetryAttempt = 0
let preferenceReadInProgress = false
let preferenceReadSucceeded = false
let flushInProgress = false
let flushTimer: ReturnType<typeof setTimeout> | undefined
let retryTimer: ReturnType<typeof setTimeout> | undefined
let retryAttempt = 0
let knownCloudItems: Record<string, unknown> = {}
const pendingUploads = new Map<string, SettingsCloudSyncEntry>()
const blockedUploads = new Map<string, { entry: SettingsCloudSyncEntry, reason: 'oversized' | 'quota' }>()
const uploadStates = new Map<string, 'pending' | 'blockedByQuota' | 'failed' | 'synced'>()
const pendingInitializationFields = new Set<string>()
const incompatibleFieldGenerations = new Map<string, number>()
const incompatibleFields = new Set<string>()
let lastError = ''
let remoteChangeQueue = Promise.resolve()

function logCloudSyncError(message: string, error?: unknown) {
  if (error == null)
    console.warn(`[Bewly Nocturne] ${message}`)
  else
    console.error(`[Bewly Nocturne] ${message}`, error)
}

function parseCloudEntries(items: Record<string, unknown>) {
  const entries: Record<string, SettingsCloudSyncEntry> = {}
  for (const [key, value] of Object.entries(items)) {
    const field = parseSettingsCloudSyncKey(key)
    const entry = normalizeSettingsCloudSyncEntry(value)
    if (field && entry)
      entries[field] = entry
  }
  return entries
}

function getKnownCloudEntry(field: string) {
  return normalizeSettingsCloudSyncEntry(knownCloudItems[createSettingsCloudSyncKey(field)]) ?? undefined
}

function isKnownCloudEntryUnreadable(field: string) {
  const key = createSettingsCloudSyncKey(field)
  return Object.prototype.hasOwnProperty.call(knownCloudItems, key)
    && normalizeSettingsCloudSyncEntry(knownCloudItems[key]) == null
}

function clearFlushTimer() {
  if (flushTimer != null)
    clearTimeout(flushTimer)
  flushTimer = undefined
}

function clearRetryTimer() {
  if (retryTimer != null)
    clearTimeout(retryTimer)
  retryTimer = undefined
}

function formatError(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

let cloudSyncStatusWriteVersion = 0
let cloudSyncStatusWriteQueue: Promise<void> = Promise.resolve()

function publishCloudSyncStatus() {
  const counts = {
    ...DEFAULT_SETTINGS_CLOUD_SYNC_STATUS,
    lastError,
  }
  for (const state of uploadStates.values()) {
    if (state === 'pending')
      counts.pendingCount++
    else if (state === 'blockedByQuota')
      counts.blockedByQuotaCount++
    else if (state === 'failed')
      counts.failedCount++
    else
      counts.syncedCount++
  }
  const writeVersion = ++cloudSyncStatusWriteVersion
  cloudSyncStatusWriteQueue = cloudSyncStatusWriteQueue
    .then(async () => {
      if (writeVersion !== cloudSyncStatusWriteVersion)
        return
      await browser.storage.local.set({ [SETTINGS_CLOUD_SYNC_STATUS_KEY]: counts })
    })
    .catch(error => logCloudSyncError('Failed to publish settings cloud sync status:', error))
}

function setUploadState(field: string, state: 'pending' | 'blockedByQuota' | 'failed' | 'synced') {
  uploadStates.set(field, state)
}

function consumePendingUpload(field: string, entry: SettingsCloudSyncEntry) {
  const pending = pendingUploads.get(field)
  if (pending && compareSettingsCloudSyncVersions(pending.version, entry.version) <= 0)
    pendingUploads.delete(field)
}

function blockUpload(field: string, entry: SettingsCloudSyncEntry, reason: 'oversized' | 'quota') {
  consumePendingUpload(field, entry)
  blockedUploads.set(field, { entry, reason })
  setUploadState(field, reason === 'quota' ? 'blockedByQuota' : 'failed')
}

function scheduleFlush(delay = CLOUD_UPLOAD_DELAY) {
  if (pendingUploads.size === 0 || flushTimer != null || retryTimer != null || flushInProgress)
    return

  flushTimer = setTimeout(() => {
    flushTimer = undefined
    void flushUploads()
  }, delay)
}

function scheduleRetry() {
  if (retryTimer != null || !enabled || !ready || pendingUploads.size === 0)
    return

  retryTimer = setTimeout(() => {
    retryTimer = undefined
    void flushUploads()
  }, getSettingsCloudSyncRetryDelay(retryAttempt++))
}

function scheduleInitializationRetry(delay?: number) {
  if (retryTimer != null || !enabled || ready)
    return

  retryTimer = setTimeout(() => {
    retryTimer = undefined
    void startCloudSync(true)
  }, delay ?? getSettingsCloudSyncRetryDelay(retryAttempt++))
}

function scheduleRuntimeRecovery(error: unknown, fields: string[] = []) {
  fields.forEach(field => pendingInitializationFields.add(field))
  lastError = error instanceof Error ? error.message : String(error)
  ready = false
  generation++
  publishCloudSyncStatus()
  clearRetryTimer()
  scheduleInitializationRetry()
}

function requeueQuotaBlockedUploads() {
  for (const [field, blocked] of blockedUploads) {
    if (blocked.reason !== 'quota')
      continue
    blockedUploads.delete(field)
    pendingUploads.set(field, blocked.entry)
    setUploadState(field, 'pending')
  }
  publishCloudSyncStatus()
  scheduleFlush()
}

function queueUploads(uploads: Record<string, SettingsCloudSyncEntry>) {
  if (!enabled)
    return

  for (const [field, entry] of Object.entries(uploads)) {
    if (isKnownCloudEntryUnreadable(field)) {
      setUploadState(field, 'failed')
      lastError = `Cloud setting "${field}" was written by an incompatible version.`
      continue
    }

    const cloudEntry = getKnownCloudEntry(field)
    if (cloudEntry && compareSettingsCloudSyncVersions(entry.version, cloudEntry.version) <= 0) {
      setUploadState(field, 'synced')
      continue
    }

    const pending = pendingUploads.get(field)
    if (!pending || compareSettingsCloudSyncVersions(pending.version, entry.version) <= 0) {
      blockedUploads.delete(field)
      pendingUploads.set(field, entry)
      setUploadState(field, 'pending')
    }
  }

  publishCloudSyncStatus()
  scheduleFlush()
}

function safeEstimateItemBytes(key: string, value: unknown) {
  try {
    return estimateSettingsCloudSyncItemBytes(key, value)
  }
  catch {
    return Number.POSITIVE_INFINITY
  }
}

function estimateKnownCloudBytes() {
  return Object.entries(knownCloudItems).reduce(
    (total, [key, value]) => total + safeEstimateItemBytes(key, value),
    0,
  )
}

function prepareUploadBatch(entries: Array<[string, SettingsCloudSyncEntry]>) {
  const items: Record<string, SettingsCloudSyncEntry> = {}
  let totalBytes = estimateKnownCloudBytes()
  let itemCount = Object.keys(knownCloudItems).length

  for (const [field, entry] of entries.sort(([left], [right]) => left.localeCompare(right))) {
    const key = createSettingsCloudSyncKey(field)
    if (isKnownCloudEntryUnreadable(field)) {
      consumePendingUpload(field, entry)
      setUploadState(field, 'failed')
      lastError = `Cloud setting "${field}" was written by an incompatible version.`
      continue
    }

    const cloudEntry = getKnownCloudEntry(field)
    if (cloudEntry && compareSettingsCloudSyncVersions(entry.version, cloudEntry.version) <= 0) {
      consumePendingUpload(field, entry)
      blockedUploads.delete(field)
      setUploadState(field, 'synced')
      continue
    }

    const nextBytes = safeEstimateItemBytes(key, entry)
    if (nextBytes > SETTINGS_CLOUD_SYNC_ITEM_BYTES_LIMIT) {
      blockUpload(field, entry, 'oversized')
      logCloudSyncError(`Skipped oversized cloud setting "${field}".`)
      continue
    }

    const previousExists = Object.prototype.hasOwnProperty.call(knownCloudItems, key)
    const previousBytes = previousExists
      ? safeEstimateItemBytes(key, knownCloudItems[key])
      : 0
    const nextTotalBytes = totalBytes - previousBytes + nextBytes
    const nextItemCount = itemCount + (previousExists ? 0 : 1)
    if (
      nextTotalBytes > SETTINGS_CLOUD_SYNC_TOTAL_BYTES_LIMIT
      || nextItemCount > CLOUD_SYNC_ITEM_COUNT_LIMIT
    ) {
      blockUpload(field, entry, 'quota')
      logCloudSyncError(`Skipped cloud setting "${field}" because the sync quota is full.`)
      continue
    }

    items[key] = entry
    totalBytes = nextTotalBytes
    itemCount = nextItemCount
  }

  publishCloudSyncStatus()
  return items
}

async function restoreUnreadableCloudItems(items: Record<string, SettingsCloudSyncEntry>) {
  const restorations: Record<string, unknown> = {}
  for (const key of Object.keys(items)) {
    if (
      Object.prototype.hasOwnProperty.call(knownCloudItems, key)
      && normalizeSettingsCloudSyncEntry(knownCloudItems[key]) == null
    ) {
      restorations[key] = knownCloudItems[key]
    }
  }
  if (Object.keys(restorations).length > 0)
    await browser.storage.sync.set(restorations)
  return new Set(Object.keys(restorations))
}

async function flushUploads() {
  if (!enabled || !ready || flushInProgress || pendingUploads.size === 0)
    return

  flushInProgress = true
  const flushGeneration = generation
  const batchEntries = [...pendingUploads.entries()]
  const batchIncompatibleGenerations = new Map(
    batchEntries.map(([field]) => [field, incompatibleFieldGenerations.get(field) ?? 0]),
  )
  try {
    const stored = await browser.storage.local.get(SETTINGS_CLOUD_SYNC_ENABLED_KEY)
    if (
      flushGeneration !== generation
      || !isSettingsCloudSyncEnabled(stored[SETTINGS_CLOUD_SYNC_ENABLED_KEY])
    ) {
      return
    }

    const items = prepareUploadBatch(batchEntries)
    if (Object.keys(items).length === 0)
      return

    await browser.storage.sync.set(items)
    const restoredKeys = await restoreUnreadableCloudItems(items)
    if (flushGeneration !== generation)
      return

    for (const [field, entry] of batchEntries) {
      const key = createSettingsCloudSyncKey(field)
      if (!Object.prototype.hasOwnProperty.call(items, key) || restoredKeys.has(key))
        continue
      if (
        (incompatibleFieldGenerations.get(field) ?? 0) !== batchIncompatibleGenerations.get(field)
        || isKnownCloudEntryUnreadable(field)
      ) {
        pendingUploads.delete(field)
        setUploadState(field, 'failed')
        continue
      }
      const cloudEntry = getKnownCloudEntry(field)
      if (!cloudEntry || compareSettingsCloudSyncVersions(cloudEntry.version, entry.version) <= 0)
        knownCloudItems[key] = entry
      consumePendingUpload(field, entry)
      blockedUploads.delete(field)
      setUploadState(field, pendingUploads.has(field) ? 'pending' : 'synced')
    }
    retryAttempt = 0
    clearRetryTimer()
    if (![...uploadStates.values()].includes('failed'))
      lastError = ''
    publishCloudSyncStatus()
  }
  catch (error) {
    if (flushGeneration !== generation)
      return
    for (const [field, entry] of batchEntries) {
      if (pendingUploads.get(field) === entry)
        setUploadState(field, 'failed')
    }
    lastError = formatError(error)
    publishCloudSyncStatus()
    logCloudSyncError('Failed to upload settings to browser sync storage:', error)
    scheduleRetry()
  }
  finally {
    flushInProgress = false
    if (enabled && ready && pendingUploads.size > 0 && retryTimer == null)
      scheduleFlush()
  }
}

function startCloudSync(
  isRetry = false,
  mode: SettingsCloudSyncMode = 'auto',
  retryOnFailure = true,
  expectedState?: SettingsCloudSyncEnableRequest['expectedState'],
): Promise<SettingsCloudSyncStartResult> {
  enabled = true
  ready = false
  if (initializationPromise) {
    restartAfterInitialization = true
    return initializationPromise
  }

  const runToken = Symbol('cloud-sync-initialization')
  initializationToken = runToken
  const startGeneration = ++generation
  restartAfterInitialization = false
  if (!isRetry) {
    clearFlushTimer()
    clearRetryTimer()
    pendingUploads.clear()
    blockedUploads.clear()
    uploadStates.clear()
    pendingInitializationFields.clear()
    incompatibleFieldGenerations.clear()
    incompatibleFields.clear()
    lastError = ''
    retryAttempt = 0
    publishCloudSyncStatus()
  }

  const run = (async (): Promise<SettingsCloudSyncStartResult> => {
    try {
      while (true) {
        restartAfterInitialization = false
        const cloudItems = await browser.storage.sync.get(null)
        if (!enabled || startGeneration !== generation)
          return 'failed'

        const availability = classifySettingsCloudSyncSnapshot(cloudItems)
        if (availability.state === 'incompatible') {
          knownCloudItems = cloudItems
          lastError = 'Cloud settings were written by an incompatible extension version.'
          publishCloudSyncStatus()
          return 'incompatible'
        }
        if (expectedState && availability.state !== expectedState)
          return 'conflict'

        const result = await reconcileSettingsCloudSyncSnapshot(
          parseCloudEntries(cloudItems),
          mode,
          [...pendingInitializationFields],
        )
        if (!enabled || startGeneration !== generation)
          return 'failed'

        knownCloudItems = cloudItems
        retryAttempt = 0
        clearRetryTimer()
        lastError = ''
        const initializationUploads = new Map(Object.entries(result.uploads))
        while (pendingInitializationFields.size > 0) {
          const initializationFields = [...pendingInitializationFields]
          pendingInitializationFields.clear()
          const currentEntries = await collectSettingsCloudSyncEntries(initializationFields)
          if (!enabled || startGeneration !== generation)
            return 'failed'
          Object.entries(currentEntries).forEach(([field, entry]) => {
            initializationUploads.set(field, entry)
          })
        }
        ready = true
        queueUploads(Object.fromEntries(initializationUploads))

        if (!restartAfterInitialization)
          return 'ready'
        ready = false
      }
    }
    catch (error) {
      if (!enabled || startGeneration !== generation)
        return 'failed'
      logCloudSyncError('Failed to initialize settings cloud sync:', error)
      lastError = formatError(error)
      publishCloudSyncStatus()
      if (retryOnFailure)
        scheduleInitializationRetry()
      return 'failed'
    }
    finally {
      if (initializationToken === runToken) {
        initializationToken = undefined
        initializationPromise = undefined
      }
    }
  })()
  initializationPromise = run
  return run
}

function stopCloudSync() {
  enabled = false
  ready = false
  generation++
  restartAfterInitialization = false
  initializationToken = undefined
  initializationPromise = undefined
  clearFlushTimer()
  clearRetryTimer()
  pendingUploads.clear()
  blockedUploads.clear()
  uploadStates.clear()
  pendingInitializationFields.clear()
  incompatibleFieldGenerations.clear()
  incompatibleFields.clear()
  lastError = ''
  retryAttempt = 0
  knownCloudItems = {}
  publishCloudSyncStatus()
}

function updateCloudSyncPreference(value: unknown) {
  if (isSettingsCloudSyncEnabled(value)) {
    if (!enabled && messageEnableInProgressCount === 0)
      void startCloudSync()
  }
  else if (enabled) {
    stopCloudSync()
  }
}

function handleLocalChanges(
  changes: Record<string, browser.Storage.StorageChange>,
  areaName: string,
) {
  if (areaName !== 'local')
    return

  const preferenceChange = changes[SETTINGS_CLOUD_SYNC_ENABLED_KEY]
  if (preferenceChange) {
    preferenceGeneration++
    if (!isSettingsCloudSyncEnabled(preferenceChange.newValue))
      enableIntentGeneration++
    updateCloudSyncPreference(preferenceChange.newValue)
  }
  if (!enabled)
    return

  const metaChange = changes[SETTINGS_STORAGE_META_KEY]
  if (!metaChange)
    return

  const previousMeta = normalizeSettingsStorageWriteMeta(metaChange.oldValue)
  const nextMeta = normalizeSettingsStorageWriteMeta(metaChange.newValue)
  if (!nextMeta.cloudSyncInitialized) {
    // A standalone metadata reset must bootstrap again. A full local clear has
    // already disabled sync above because it removes the preference as well.
    void startCloudSync()
    return
  }

  const changedFields = new Set([
    ...Object.keys(previousMeta.fieldVersions),
    ...Object.keys(nextMeta.fieldVersions),
  ])
  const fields = [...changedFields].filter(field =>
    compareSettingsCloudSyncVersions(
      previousMeta.fieldVersions[field],
      nextMeta.fieldVersions[field],
    ) !== 0,
  )
  if (fields.length === 0)
    return
  if (!ready) {
    fields.forEach(field => pendingInitializationFields.add(field))
    return
  }

  const localGeneration = generation
  void collectSettingsCloudSyncEntries(fields).then((entries) => {
    if (enabled && ready && localGeneration === generation)
      queueUploads(entries)
  }).catch((error) => {
    logCloudSyncError('Failed to collect local settings for cloud sync:', error)
    if (enabled && localGeneration === generation)
      scheduleRuntimeRecovery(error, fields)
  })
}

function handleSyncChanges(
  changes: Record<string, browser.Storage.StorageChange>,
  areaName: string,
) {
  if (areaName !== 'sync' || !enabled)
    return

  const remoteChanges: Record<string, SettingsCloudSyncEntry | null> = {}
  let hasIncompatibleChange = false
  let resolvedIncompatibleChange = false
  for (const [key, change] of Object.entries(changes)) {
    if (change.newValue == null)
      Reflect.deleteProperty(knownCloudItems, key)
    else
      knownCloudItems[key] = change.newValue

    const field = parseSettingsCloudSyncKey(key)
    if (!field)
      continue

    if (change.newValue == null) {
      remoteChanges[field] = null
      if (incompatibleFields.delete(field)) {
        uploadStates.delete(field)
        resolvedIncompatibleChange = true
      }
      continue
    }

    const entry = normalizeSettingsCloudSyncEntry(change.newValue)
    if (entry) {
      remoteChanges[field] = entry
      if (incompatibleFields.delete(field)) {
        uploadStates.delete(field)
        resolvedIncompatibleChange = true
      }
      continue
    }

    hasIncompatibleChange = true
    incompatibleFields.add(field)
    incompatibleFieldGenerations.set(field, (incompatibleFieldGenerations.get(field) ?? 0) + 1)
    pendingUploads.delete(field)
    blockedUploads.delete(field)
    setUploadState(field, 'failed')
    lastError = `Cloud setting "${field}" was written by an incompatible version.`
  }

  if (
    resolvedIncompatibleChange
    && incompatibleFields.size === 0
    && lastError.includes('incompatible')
  ) {
    lastError = ''
  }
  if (hasIncompatibleChange || resolvedIncompatibleChange) {
    publishCloudSyncStatus()
    if (hasIncompatibleChange && initializationPromise)
      restartAfterInitialization = true
  }
  if (Object.keys(remoteChanges).length === 0)
    return

  if (!ready) {
    if (initializationPromise) {
      restartAfterInitialization = true
    }
    else {
      clearRetryTimer()
      scheduleInitializationRetry(0)
    }
    return
  }

  const remoteGeneration = generation
  remoteChangeQueue = remoteChangeQueue.then(async () => {
    if (!enabled || !ready || remoteGeneration !== generation)
      return
    const result = await applySettingsCloudSyncChanges(remoteChanges)
    if (enabled && ready && remoteGeneration === generation)
      queueUploads(result.uploads)
  }).catch((error) => {
    logCloudSyncError('Failed to apply remote settings changes:', error)
    if (enabled && remoteGeneration === generation)
      scheduleRuntimeRecovery(error)
  })
}

async function readSettingsCloudSyncAvailability(): Promise<SettingsCloudSyncAvailability> {
  const cloudItems = await browser.storage.sync.get(null)
  return classifySettingsCloudSyncSnapshot(cloudItems)
}

async function performEnableSettingsCloudSync(
  value: unknown,
  requestGeneration: number,
): Promise<SettingsCloudSyncEnableResponse> {
  const request = value as Partial<SettingsCloudSyncEnableRequest> | undefined
  const mode = normalizeSettingsCloudSyncMode(request?.mode)
  const expectedState = request?.expectedState
  if (
    (expectedState !== 'empty' && expectedState !== 'compatible')
    || (mode === 'auto' && expectedState !== 'empty')
    || (mode !== 'auto' && expectedState !== 'compatible')
  ) {
    return { ok: false, reason: 'conflict' }
  }

  const isStale = () => requestGeneration !== enableIntentGeneration
  const rollBackCurrentRequest = async () => {
    if (enableRequestGeneration !== requestGeneration)
      return
    stopCloudSync()
    await browser.storage.local.set({ [SETTINGS_CLOUD_SYNC_ENABLED_KEY]: false }).catch(rollbackError => (
      logCloudSyncError('Failed to roll back settings cloud sync preference:', rollbackError)
    ))
  }

  messageEnableInProgressCount++
  try {
    const availability = await readSettingsCloudSyncAvailability()
    if (isStale()) {
      await rollBackCurrentRequest()
      return { ok: false, reason: 'conflict' }
    }
    if (availability.state === 'incompatible')
      return { ok: false, reason: 'incompatible' }
    if (availability.state !== expectedState)
      return { ok: false, reason: 'conflict' }

    await browser.storage.local.set({ [SETTINGS_CLOUD_SYNC_ENABLED_KEY]: true })
    if (isStale()) {
      await rollBackCurrentRequest()
      return { ok: false, reason: 'conflict' }
    }

    const result = await startCloudSync(false, mode, false, expectedState)
    if (isStale()) {
      await rollBackCurrentRequest()
      return { ok: false, reason: 'conflict' }
    }
    if (result === 'ready')
      return { ok: true }

    await rollBackCurrentRequest()
    return {
      ok: false,
      reason: result === 'incompatible'
        ? 'incompatible'
        : result === 'conflict'
          ? 'conflict'
          : 'initialization-failed',
    }
  }
  catch (error) {
    await rollBackCurrentRequest()
    logCloudSyncError('Failed to enable settings cloud sync:', error)
    return { ok: false, reason: 'initialization-failed' }
  }
  finally {
    messageEnableInProgressCount = Math.max(0, messageEnableInProgressCount - 1)
  }
}

function handleEnableSettingsCloudSync(value: unknown): Promise<SettingsCloudSyncEnableResponse> {
  const requestGeneration = enableIntentGeneration
  if (enableRequestPromise && enableRequestGeneration === requestGeneration)
    return enableRequestPromise

  enableRequestGeneration = requestGeneration
  const run = performEnableSettingsCloudSync(value, requestGeneration).finally(() => {
    if (enableRequestPromise === run) {
      enableRequestPromise = undefined
      enableRequestGeneration = -1
    }
  })
  enableRequestPromise = run
  return run
}

function retryInitializationOnBrowserActivity() {
  if (enabled && ready && [...blockedUploads.values()].some(item => item.reason === 'quota'))
    requeueQuotaBlockedUploads()
  if (!preferenceReadSucceeded && !preferenceReadInProgress)
    void readInitialCloudSyncPreference()
  if (enabled && !ready && !initializationPromise) {
    clearRetryTimer()
    scheduleInitializationRetry(0)
  }
}

async function readInitialCloudSyncPreference() {
  if (preferenceReadInProgress)
    return
  preferenceReadInProgress = true
  const readGeneration = preferenceGeneration
  try {
    const stored = await browser.storage.local.get(SETTINGS_CLOUD_SYNC_ENABLED_KEY)
    if (readGeneration === preferenceGeneration)
      updateCloudSyncPreference(stored[SETTINGS_CLOUD_SYNC_ENABLED_KEY])
    preferenceReadSucceeded = true
    preferenceReadRetryAttempt = 0
  }
  catch (error) {
    logCloudSyncError('Failed to read settings cloud sync preference:', error)
    preferenceReadRetryAttempt++
    const delay = getSettingsCloudSyncRetryDelay(preferenceReadRetryAttempt - 1)
    if (preferenceReadRetryTimer)
      clearTimeout(preferenceReadRetryTimer)
    preferenceReadRetryTimer = setTimeout(() => {
      preferenceReadRetryTimer = undefined
      void readInitialCloudSyncPreference()
    }, delay)
  }
  finally {
    preferenceReadInProgress = false
  }
}

export function setupSettingsCloudSync() {
  if (initialized)
    return

  initialized = true
  browser.storage.onChanged.addListener(handleLocalChanges)
  browser.storage.onChanged.addListener(handleSyncChanges)
  browser.tabs.onActivated.addListener(retryInitializationOnBrowserActivity)
  browser.windows.onFocusChanged.addListener(retryInitializationOnBrowserActivity)
  onMessage(SETTINGS_CLOUD_SYNC_AVAILABILITY_MESSAGE, () => readSettingsCloudSyncAvailability())
  onMessage(SETTINGS_CLOUD_SYNC_ENABLE_MESSAGE, value => handleEnableSettingsCloudSync(value))

  void readInitialCloudSyncPreference()
}
