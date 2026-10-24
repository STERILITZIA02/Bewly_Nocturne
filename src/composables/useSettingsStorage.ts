import type { MaybeRef, Ref } from 'vue'
import { getCurrentScope, isProxy, onScopeDispose, readonly, ref, toRaw, toValue, watch } from 'vue'
import browser from 'webextension-polyfill'

import type { StorageRef } from '~/composables/useStorageLocal'
import { waitForDelay, waitWithSignal, withRequestDeadline } from '~/utils/abort'
import { isExtensionContextInvalidatedError, sendMessage } from '~/utils/messaging'
import type { SettingsStoragePatch, SettingsStoragePatchRequest, SettingsStoragePatchResponse } from '~/utils/settingsStorageProtocol'
import {
  applySettingsStoragePatch,
  createEmptySettingsStoragePatch,
  createTopLevelSettingsStoragePatch,
  isSettingsStoragePatchEmpty,
  mergeSettingsStoragePatches,
  normalizeSettingsStorageWriteMeta,
  parseStoredSettings,
  SETTINGS_STORAGE_IMPORT_MESSAGE,
  SETTINGS_STORAGE_KEY,
  SETTINGS_STORAGE_META_KEY,
  SETTINGS_STORAGE_PATCH_MESSAGE,
  SETTINGS_STORAGE_READ_MESSAGE,
  settingsValuesEqual,
} from '~/utils/settingsStorageProtocol'

export type SettingsStorageInitializationState = 'degraded' | 'invalidated' | 'loaded' | 'loading'

interface UseSettingsStorageOptions<T> {
  normalize?: (value: T) => void
  onError?: (error: unknown) => void
  onLoaded?: (value: T) => void
  onReady?: (value: T) => void
}

export interface SettingsStorageRef<T extends object> extends StorageRef<T> {
  flush: () => Promise<void>
  import: (values: Partial<T>) => Promise<void>
  initializationState: Readonly<Ref<SettingsStorageInitializationState>>
  displayReady: Readonly<Ref<boolean>>
}

interface SettingsStorageFlushWaiter {
  reject: (error: unknown) => void
  resolve: () => void
}

const MAX_MESSAGE_ATTEMPTS = 5
const INITIAL_READ_FALLBACK_DELAY = 1_500
const RECOVERY_READ_DELAYS = [2_000, 5_000, 15_000] as const

class StaleStorageGenerationError extends Error {}

function cloneValue<T>(value: T): T {
  if (typeof value !== 'object' || value == null)
    return value

  const normalizedValue = isProxy(value) ? toRaw(value) : value
  try {
    return structuredClone(normalizedValue)
  }
  catch {
    return JSON.parse(JSON.stringify(normalizedValue)) as T
  }
}

function asRecord(value: object): Record<string, unknown> {
  return value as Record<string, unknown>
}

/** Reconcile JSON settings in place so unchanged subtrees keep their consumers. */
function reconcileSettingsValue(current: unknown, next: unknown): unknown {
  if (Object.is(current, next))
    return current
  if (!current || !next || typeof current !== 'object' || typeof next !== 'object'
    || Array.isArray(current) !== Array.isArray(next)) {
    return cloneValue(next)
  }
  const target = asRecord(current)
  const source = asRecord(next)
  for (const key of Object.keys(target)) {
    if (!Object.hasOwn(source, key))
      Reflect.deleteProperty(target, key)
  }
  for (const key of Object.keys(source)) {
    if (['__proto__', 'constructor', 'prototype'].includes(key))
      continue
    const value = reconcileSettingsValue(target[key], source[key])
    if (!Object.is(value, target[key]))
      target[key] = value
  }
  if (Array.isArray(current) && Array.isArray(next) && current.length !== next.length)
    current.length = next.length
  return current
}

/**
 * Runs `normalize` on a private working copy and records which top-level
 * fields it read, wrote or removed. Enumerating every field marks the run as
 * depending on everything.
 */
function runRecordedNormalize<T>(working: Record<string, unknown>, normalize: (value: T) => void) {
  const touched = new Set<string>()
  let enumerated = false
  const record = (key: string | symbol) => {
    if (typeof key === 'string')
      touched.add(key)
  }
  normalize(new Proxy(working, {
    get(target, key, receiver) {
      record(key)
      return Reflect.get(target, key, receiver)
    },
    set(target, key, value, receiver) {
      record(key)
      return Reflect.set(target, key, value, receiver)
    },
    has(target, key) {
      record(key)
      return Reflect.has(target, key)
    },
    deleteProperty(target, key) {
      record(key)
      return Reflect.deleteProperty(target, key)
    },
    getOwnPropertyDescriptor(target, key) {
      record(key)
      return Reflect.getOwnPropertyDescriptor(target, key)
    },
    ownKeys: (target) => {
      enumerated = true
      return Reflect.ownKeys(target)
    },
  }) as T)
  return enumerated ? undefined : touched
}

function storedValueFingerprint(value: unknown) {
  if (value == null)
    return null

  return typeof value === 'string' ? value : JSON.stringify(value)
}

function isPatchResponse(value: unknown): value is SettingsStoragePatchResponse {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return false

  const response = value as Partial<SettingsStoragePatchResponse>
  return typeof response.accepted === 'boolean'
    && typeof response.epoch === 'string'
    && response.epoch.length > 0
    && Number.isSafeInteger(response.revision)
    && response.revision! >= 0
    && (response.storedValue === undefined || typeof response.storedValue === 'string')
}

function createClientId() {
  if (typeof crypto.randomUUID === 'function')
    return crypto.randomUUID()

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

/**
 * Settings-specific storage adapter. All writes are top-level patches serialized
 * by the background coordinator, so stale frames cannot overwrite the full object.
 */
export function useSettingsStorage<T extends object>(
  initialValue: MaybeRef<T>,
  options: UseSettingsStorageOptions<T> = {},
): SettingsStorageRef<T> {
  const defaults = cloneValue(toValue(initialValue))
  const data = ref(cloneValue(defaults)) as Omit<StorageRef<T>, 'initializationState'>
  const onError = options.onError ?? ((error: unknown) => console.error(error))

  let applyingCanonicalValue = false
  let canonicalValue = asRecord(cloneValue(defaults))
  let currentEpoch = ''
  const retiredEpochs = new Set<string>()
  let canonicalRevision = 0
  let canonicalFingerprint: string | null = null
  // Immutable per-field snapshots: unchanged fields keep their identity, and
  // no snapshot shares a mutable reference with the edited `data`.
  let observedValue = asRecord(cloneValue(data.value))
  /** Last full-normalize input/output and the fields it depended on. */
  let lastNormalizeInput: Record<string, unknown> | undefined
  let lastNormalized: Record<string, unknown> | undefined
  let normalizeDependencies: Set<string> | undefined
  let queuedPatch = createEmptySettingsStoragePatch()
  let inFlightPatch: SettingsStoragePatch | null = null
  let failedPatchRequest: SettingsStoragePatchRequest | null = null
  const clientId = createClientId()
  let nextOperationId = 1
  let ready = false
  let persistenceReady = false
  let disposed = false
  let contextInvalidated = false
  let importingOperation: number | null = null
  let storageGeneration = 0
  let readInFlightGeneration: number | null = null
  const initializationState = ref<SettingsStorageInitializationState>('loading')
  const displayReady = ref(false)
  let recoveryReadAttempt = 0
  let recoveryReadTimer: ReturnType<typeof setTimeout> | null = null
  const flushWaiters = new Set<SettingsStorageFlushWaiter>()

  /** Compares field by field; only changed fields are cloned into the next snapshot. */
  function captureLocalChanges() {
    if (disposed || contextInvalidated || applyingCanonicalValue)
      return
    const current = asRecord(toRaw(data.value))
    const patch = createEmptySettingsStoragePatch()
    let next: Record<string, unknown> | undefined
    for (const key of Object.keys(current)) {
      if (Object.hasOwn(observedValue, key) && settingsValuesEqual(current[key], observedValue[key]))
        continue
      next ??= { ...observedValue }
      next[key] = cloneValue(current[key])
      patch.set[key] = next[key]
    }
    for (const key of Object.keys(observedValue)) {
      if (Object.hasOwn(current, key))
        continue
      next ??= { ...observedValue }
      Reflect.deleteProperty(next, key)
      patch.remove.push(key)
    }
    if (!next)
      return
    observedValue = next
    queuedPatch = mergeSettingsStoragePatches(queuedPatch, patch)
  }

  /**
   * Normalize the rendered value. When every field that changed since the last
   * full run lies outside the fields that run depended on, its result still
   * holds: reuse it and take the changed fields unchanged. Canonical applies,
   * imports, resets and any change to a dependency run the full normalizer.
   */
  function normalizeRendered(input: Record<string, unknown>, full: boolean): { value: Record<string, unknown>, reused: boolean } {
    if (!options.normalize)
      return { value: input, reused: false }
    if (!full && lastNormalizeInput && lastNormalized && normalizeDependencies) {
      const changed = new Set<string>()
      for (const key of new Set([...Object.keys(input), ...Object.keys(lastNormalizeInput)])) {
        if (!Object.is(input[key], lastNormalizeInput[key]) || Object.hasOwn(input, key) !== Object.hasOwn(lastNormalizeInput, key))
          changed.add(key)
      }
      if ([...changed].every(key => !normalizeDependencies!.has(key))) {
        const normalized = { ...lastNormalized }
        for (const key of changed) {
          if (Object.hasOwn(input, key))
            normalized[key] = input[key]
          else
            Reflect.deleteProperty(normalized, key)
        }
        lastNormalizeInput = input
        lastNormalized = normalized
        return { value: normalized, reused: true }
      }
    }
    const working = asRecord(cloneValue(input))
    normalizeDependencies = runRecordedNormalize(working, options.normalize)
    lastNormalizeInput = input
    lastNormalized = working
    return { value: working, reused: false }
  }

  const storageIsIdle = () => ready
    && persistenceReady
    && !inFlightPatch
    && isSettingsStoragePatchEmpty(queuedPatch)

  const resolveFlushWaitersIfIdle = () => {
    if (!storageIsIdle())
      return

    flushWaiters.forEach(waiter => waiter.resolve())
    flushWaiters.clear()
  }

  const rejectFlushWaiters = (error: unknown) => {
    flushWaiters.forEach(waiter => waiter.reject(error))
    flushWaiters.clear()
  }

  /**
   * canonical → inFlight → queued, then normalize, then reconcile in place.
   * The overlay is built from immutable field snapshots (shallow copies), so
   * one working copy is the only deep clone; reconcile clones replaced branches.
   */
  const renderCanonicalValue = (fullNormalize = false) => {
    captureLocalChanges()
    let nextValue = canonicalValue
    if (inFlightPatch)
      nextValue = applySettingsStoragePatch(nextValue, inFlightPatch)
    nextValue = applySettingsStoragePatch(nextValue, queuedPatch)
    const { value: normalized, reused } = normalizeRendered(nextValue, fullNormalize)

    applyingCanonicalValue = true
    try {
      reconcileSettingsValue(data.value, normalized)
    }
    finally {
      applyingCanonicalValue = false
    }

    // `data` now equals `normalized`; its fields are the next observed snapshot.
    observedValue = normalized
    // A reused result derives nothing new: its derived fields were queued when computed.
    if (reused)
      return
    const derivedPatch = createTopLevelSettingsStoragePatch(nextValue, normalized)
    if (persistenceReady && !isSettingsStoragePatchEmpty(derivedPatch))
      queuedPatch = mergeSettingsStoragePatches(queuedPatch, derivedPatch)
  }

  const applyCanonicalValue = (storedValue: unknown, revision: number, force = false) => {
    const normalizedRevision = Number.isSafeInteger(revision) && revision >= 0 ? revision : 0
    const fingerprint = storedValueFingerprint(storedValue)
    if (!force && normalizedRevision < canonicalRevision)
      return false
    if (!force && normalizedRevision === canonicalRevision && fingerprint === canonicalFingerprint)
      return false

    canonicalRevision = normalizedRevision
    canonicalFingerprint = fingerprint
    const raw = parseStoredSettings(storedValue)
    // Defaults and parsed values are shared immutable field snapshots.
    canonicalValue = {
      ...asRecord(defaults),
      ...raw,
    }
    renderCanonicalValue(true)
    return true
  }

  const resetStorageGeneration = (epoch: string, renderDefaults = true) => {
    rejectFlushWaiters(new StaleStorageGenerationError('Settings storage authority changed'))
    if (currentEpoch && epoch !== currentEpoch)
      retiredEpochs.add(currentEpoch)
    storageGeneration++
    currentEpoch = epoch
    canonicalRevision = 0
    canonicalFingerprint = null
    canonicalValue = { ...asRecord(defaults) }
    queuedPatch = createEmptySettingsStoragePatch()
    inFlightPatch = null
    failedPatchRequest = null
    // Discard even edits that Vue has not delivered to the batched watcher yet.
    observedValue = asRecord(cloneValue(data.value))
    persistenceReady = false
    initializationState.value = 'loading'
    if (renderDefaults)
      renderCanonicalValue(true)
  }

  const sendWithRetry = async <R>(type: string, payload: unknown, generation: number): Promise<R> => {
    const run = async (signal?: AbortSignal): Promise<R> => {
      let lastError: unknown

      for (let attempt = 0; attempt < MAX_MESSAGE_ATTEMPTS; attempt++) {
        if (contextInvalidated || generation !== storageGeneration)
          throw new StaleStorageGenerationError()

        try {
          signal?.throwIfAborted()
          const response = await waitWithSignal(sendMessage(type, payload) as Promise<R>, signal)
          if (generation !== storageGeneration)
            throw new StaleStorageGenerationError()
          return response
        }
        catch (error) {
          signal?.throwIfAborted()
          if (error instanceof StaleStorageGenerationError)
            throw error

          lastError = error
          if (isExtensionContextInvalidatedError(error) || attempt === MAX_MESSAGE_ATTEMPTS - 1)
            break
          await waitForDelay(100 * 2 ** attempt, signal)
        }
      }

      throw lastError
    }
    return type === SETTINGS_STORAGE_READ_MESSAGE
      ? withRequestDeadline(run, {}, 10_000)
      : run()
  }

  const flushQueuedPatch = async () => {
    if (contextInvalidated) {
      return
    }

    if (!ready || !persistenceReady || (inFlightPatch && !failedPatchRequest)
      || (!failedPatchRequest && isSettingsStoragePatchEmpty(queuedPatch))) {
      resolveFlushWaitersIfIdle()
      return
    }

    const patch = failedPatchRequest?.patch ?? queuedPatch
    const generation = storageGeneration
    if (!failedPatchRequest)
      queuedPatch = createEmptySettingsStoragePatch()
    inFlightPatch = patch
    const request = failedPatchRequest ?? {
      clientId,
      epoch: currentEpoch,
      operationId: nextOperationId++,
      patch,
    }
    failedPatchRequest = null

    try {
      const response = await sendWithRetry<SettingsStoragePatchResponse>(SETTINGS_STORAGE_PATCH_MESSAGE, request, generation)
      if (!isPatchResponse(response))
        throw new TypeError('Invalid settings storage response')
      if (generation !== storageGeneration)
        return
      if (!response.accepted || response.epoch !== currentEpoch) {
        // Clear/import rotates the authority; never replay old-epoch edits.
        resetStorageGeneration(response.epoch, false)
        persistenceReady = true
        applyCanonicalValue(response.storedValue, response.revision, true)
        void flushQueuedPatch()
        resolveFlushWaitersIfIdle()
        return
      }

      inFlightPatch = null
      if (!applyCanonicalValue(response.storedValue, response.revision))
        renderCanonicalValue()
      void flushQueuedPatch()
      resolveFlushWaitersIfIdle()
    }
    catch (error) {
      if (error instanceof StaleStorageGenerationError || generation !== storageGeneration)
        return

      // Keep the original operation identity after an unknown acknowledgement.
      // Retrying it cannot overwrite a newer remote edit if it already committed.
      failedPatchRequest = request
      renderCanonicalValue()
      if (isExtensionContextInvalidatedError(error)) {
        invalidateContext(error)
        return
      }
      onError(error)
      rejectFlushWaiters(error)
    }
  }

  const flushPendingWrites = (): Promise<void> => {
    if (contextInvalidated)
      return Promise.reject(new Error('Settings storage was disposed before pending writes were flushed'))

    captureLocalChanges()
    if (!persistenceReady && readInFlightGeneration !== storageGeneration)
      void refreshCanonicalValue()
    void flushQueuedPatch()
    if (storageIsIdle())
      return Promise.resolve()

    return new Promise<void>((resolve, reject) => {
      flushWaiters.add({ resolve, reject })
    })
  }

  const stopWatch = watch(
    data,
    () => {
      if (disposed || contextInvalidated || applyingCanonicalValue)
        return
      captureLocalChanges()
      void flushQueuedPatch()
    },
    { deep: true, flush: 'pre' },
  )

  const markReady = () => {
    if (ready)
      return

    ready = true
    if (!disposed)
      options.onReady?.(data.value)
    void flushQueuedPatch()
  }

  function clearRecoveryReadTimer() {
    if (recoveryReadTimer != null)
      clearTimeout(recoveryReadTimer)
    recoveryReadTimer = null
  }

  function invalidateContext(error: unknown) {
    contextInvalidated = true
    failedPatchRequest = null
    disposed = true
    storageGeneration++
    initializationState.value = 'invalidated'
    stopWatch()
    clearRecoveryReadTimer()
    browser.storage.onChanged.removeListener(onStorageChanged)
    rejectFlushWaiters(error)
  }

  async function applyLocalSnapshot(generation: number) {
    if (ready || disposed || generation !== storageGeneration)
      return
    try {
      const stored = await withRequestDeadline(() => browser.storage.local.get([SETTINGS_STORAGE_KEY, SETTINGS_STORAGE_META_KEY]), {}, INITIAL_READ_FALLBACK_DELAY)
      if (ready || disposed || generation !== storageGeneration)
        return
      const meta = normalizeSettingsStorageWriteMeta(stored[SETTINGS_STORAGE_META_KEY])
      if (retiredEpochs.has(meta.epoch))
        return
      if (!currentEpoch || currentEpoch === meta.epoch) {
        currentEpoch = meta.epoch
        if (stored[SETTINGS_STORAGE_KEY] != null) {
          const raw = typeof stored[SETTINGS_STORAGE_KEY] === 'string' ? JSON.parse(stored[SETTINGS_STORAGE_KEY]) : stored[SETTINGS_STORAGE_KEY]
          if (!raw || typeof raw !== 'object' || Array.isArray(raw))
            throw new TypeError('Invalid local settings snapshot')
          applyCanonicalValue(stored[SETTINGS_STORAGE_KEY], meta.revision)
          displayReady.value = true
        }
      }
    }
    catch (error) {
      if (isExtensionContextInvalidatedError(error))
        invalidateContext(error)
      else if (!disposed && generation === storageGeneration)
        onError(error)
    }
    finally {
      if (!disposed && generation === storageGeneration && initializationState.value !== 'loaded') {
        // Local/default display is usable, but no patch can be sent until an
        // authoritative coordinator snapshot has established this epoch.
        initializationState.value = 'degraded'
        markReady()
      }
    }
  }

  function scheduleRecoveryRead() {
    if (disposed || initializationState.value === 'loaded' || recoveryReadTimer != null || recoveryReadAttempt >= RECOVERY_READ_DELAYS.length)
      return

    const delay = RECOVERY_READ_DELAYS[recoveryReadAttempt++]
    recoveryReadTimer = setTimeout(() => {
      recoveryReadTimer = null
      void refreshCanonicalValue()
    }, delay)
  }

  async function refreshCanonicalValue(markReadyWhenFinished = false) {
    const generation = storageGeneration
    if (readInFlightGeneration === generation)
      return

    readInFlightGeneration = generation
    const fallbackTimer = markReadyWhenFinished
      ? setTimeout(() => void applyLocalSnapshot(generation), INITIAL_READ_FALLBACK_DELAY)
      : undefined
    try {
      const response = await sendWithRetry<SettingsStoragePatchResponse>(SETTINGS_STORAGE_READ_MESSAGE, undefined, generation)
      if (!isPatchResponse(response))
        throw new TypeError('Invalid settings storage response')
      if (generation !== storageGeneration)
        return

      if (retiredEpochs.has(response.epoch))
        return

      const epochChanged = currentEpoch.length > 0 && response.epoch !== currentEpoch
      if (epochChanged)
        resetStorageGeneration(response.epoch, false)
      else
        currentEpoch = response.epoch

      persistenceReady = true
      recoveryReadAttempt = 0
      clearRecoveryReadTimer()
      applyCanonicalValue(response.storedValue, response.revision, epochChanged)
      const wasLoaded = initializationState.value === 'loaded'
      initializationState.value = 'loaded'
      displayReady.value = true
      if (!wasLoaded && !disposed)
        options.onLoaded?.(data.value)
      void flushQueuedPatch()
    }
    catch (error) {
      if (error instanceof StaleStorageGenerationError || generation !== storageGeneration)
        return

      initializationState.value = 'degraded'
      if (isExtensionContextInvalidatedError(error)) {
        invalidateContext(error)
      }
      else {
        onError(error)
        if (markReadyWhenFinished)
          await applyLocalSnapshot(generation)
        scheduleRecoveryRead()
      }
      rejectFlushWaiters(error)
    }
    finally {
      clearTimeout(fallbackTimer)
      if (readInFlightGeneration === generation)
        readInFlightGeneration = null
      if (markReadyWhenFinished && !contextInvalidated && generation === storageGeneration)
        markReady()
    }
  }

  function onStorageChanged(
    changes: Record<string, browser.Storage.StorageChange>,
    areaName: string,
  ) {
    if (contextInvalidated || areaName !== 'local')
      return

    const settingsChange = changes[SETTINGS_STORAGE_KEY]
    const metaChange = changes[SETTINGS_STORAGE_META_KEY]
    const metaWasRemoved = metaChange?.oldValue != null && metaChange.newValue == null
    if (metaWasRemoved) {
      importingOperation = null
      resetStorageGeneration('')
      void refreshCanonicalValue()
      return
    }

    const meta = metaChange ? normalizeSettingsStorageWriteMeta(metaChange.newValue) : null
    if (meta?.epoch && retiredEpochs.has(meta.epoch))
      return
    const epochChanged = Boolean(meta?.epoch && currentEpoch && meta.epoch !== currentEpoch)
    const ownImport = importingOperation != null && meta?.recentOperationIds.includes(`${clientId}:${importingOperation}`)
    if (epochChanged && ownImport) {
      retiredEpochs.add(currentEpoch)
      currentEpoch = meta!.epoch
      canonicalRevision = 0
      canonicalFingerprint = null
    }
    else if (epochChanged) {
      importingOperation = null
      resetStorageGeneration(meta!.epoch, !settingsChange)
    }
    else if (meta?.epoch && !currentEpoch) {
      currentEpoch = meta.epoch
    }

    if (!settingsChange) {
      if (meta?.epoch && (epochChanged || !canonicalFingerprint))
        void refreshCanonicalValue()
      return
    }

    if (!meta?.epoch) {
      persistenceReady = false
      void refreshCanonicalValue()
      return
    }

    persistenceReady = Boolean(currentEpoch && meta?.epoch)
    recoveryReadAttempt = 0
    clearRecoveryReadTimer()
    applyCanonicalValue(settingsChange.newValue, meta?.revision ?? canonicalRevision, epochChanged)
    const wasLoaded = initializationState.value === 'loaded'
    initializationState.value = 'loaded'
    displayReady.value = true
    if (!wasLoaded)
      options.onLoaded?.(data.value)
    void flushQueuedPatch()
  }

  async function importSettings(values: Partial<T>) {
    if (!persistenceReady || disposed || contextInvalidated)
      throw new Error('Settings authority is not ready')
    const operationId = nextOperationId++
    const previousCanonicalValue = canonicalValue
    resetStorageGeneration(currentEpoch, false)
    canonicalValue = previousCanonicalValue
    importingOperation = operationId
    persistenceReady = false
    const importPatch: SettingsStoragePatch = { set: cloneValue(values) as Record<string, unknown>, remove: [] }
    inFlightPatch = importPatch
    // Imported values may carry retired fields or cross-field state: full normalize.
    renderCanonicalValue(true)
    const generation = storageGeneration
    try {
      const response = await sendWithRetry<SettingsStoragePatchResponse>(SETTINGS_STORAGE_IMPORT_MESSAGE, {
        clientId,
        epoch: currentEpoch,
        operationId,
        patch: importPatch,
      }, generation)
      if (!isPatchResponse(response) || !response.accepted)
        throw new Error('Settings import was superseded')
      currentEpoch = response.epoch
      persistenceReady = true
      inFlightPatch = null
      applyCanonicalValue(response.storedValue, response.revision, true)
      void flushQueuedPatch()
    }
    catch (error) {
      if (isExtensionContextInvalidatedError(error)) {
        invalidateContext(error)
      }
      else if (generation === storageGeneration) {
        inFlightPatch = null
        void refreshCanonicalValue()
      }
      throw error
    }
    finally {
      if (importingOperation === operationId)
        importingOperation = null
    }
  }

  browser.storage.onChanged.addListener(onStorageChanged)
  if (getCurrentScope()) {
    onScopeDispose(() => {
      captureLocalChanges()
      disposed = true
      stopWatch()
      clearRecoveryReadTimer()
      browser.storage.onChanged.removeListener(onStorageChanged)
      // Ordinary scope teardown drains the captured edits; an invalid runtime
      // instead terminates immediately through invalidateContext.
      if (!contextInvalidated && !persistenceReady && (!isSettingsStoragePatchEmpty(queuedPatch) || inFlightPatch))
        void refreshCanonicalValue()
      void flushQueuedPatch()
    })
  }

  void refreshCanonicalValue(true)

  Object.defineProperties(data, {
    flush: {
      value: flushPendingWrites,
    },
    import: { value: importSettings },
    initializationState: {
      value: readonly(initializationState),
    },
    displayReady: { value: readonly(displayReady) },
  })

  return data as SettingsStorageRef<T>
}
