import type { MaybeRef, Ref, WatchOptions } from 'vue'
import { getCurrentScope, isProxy, onScopeDispose, ref, shallowRef, toRaw, toValue, watch } from 'vue'
import browser from 'webextension-polyfill'

import { shouldWriteStorageDefault } from '~/utils/storageInitialization'

type Awaitable<T> = T | Promise<T>
type SerializerType = 'any' | 'boolean' | 'date' | 'map' | 'number' | 'object' | 'set' | 'string'
type StorageFlush = NonNullable<WatchOptions['flush']>

export type StorageEventFilter = (invoke: () => void | Promise<void>) => void | Promise<void>

export interface StorageSerializer<T> {
  read: (raw: string) => Awaitable<T>
  write: (value: T) => Awaitable<string>
}

export interface StorageLocalRuntime {
  clearTimeout: (timer: ReturnType<typeof setTimeout>) => void
  get: (key: string) => Promise<Record<string, unknown>>
  remove: (key: string) => Promise<void>
  set: (items: Record<string, unknown>) => Promise<void>
  setTimeout: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>
  sleep: (delay: number) => Promise<void>
  subscribe: (
    listener: (changes: Record<string, browser.Storage.StorageChange>, areaName: string) => void,
  ) => () => void
}

export interface UseStorageLocalOptions<T> {
  deep?: boolean
  eventFilter?: StorageEventFilter
  flush?: StorageFlush
  listenToStorageChanges?: boolean
  mergeDefaults?: boolean | ((storedValue: T, defaults: T) => T)
  onError?: (error: unknown) => void
  onReady?: (value: T) => void
  runtime?: StorageLocalRuntime
  serializer?: StorageSerializer<T>
  shallow?: boolean
  writeDefaults?: boolean
}

export type StorageRef<T> = Omit<Ref<T>, 'value'> & {
  get value(): T
  set value(value: T | null | undefined)
}

const storageSerializers: Record<SerializerType, StorageSerializer<any>> = {
  boolean: {
    read: raw => raw === 'true',
    write: value => String(value),
  },
  object: {
    read: raw => JSON.parse(raw),
    write: value => JSON.stringify(value),
  },
  number: {
    read: raw => Number.parseFloat(raw),
    write: value => String(value),
  },
  any: {
    read: raw => raw,
    write: value => String(value),
  },
  string: {
    read: raw => raw,
    write: value => String(value),
  },
  map: {
    read: raw => new Map(JSON.parse(raw)),
    write: value => JSON.stringify(Array.from(value.entries())),
  },
  set: {
    read: raw => new Set(JSON.parse(raw)),
    write: value => JSON.stringify(Array.from(value)),
  },
  date: {
    read: raw => new Date(raw),
    write: value => value.toISOString(),
  },
}

function guessSerializerType(value: unknown): SerializerType {
  if (value == null)
    return 'any'

  if (value instanceof Set)
    return 'set'

  if (value instanceof Map)
    return 'map'

  if (value instanceof Date)
    return 'date'

  if (typeof value === 'boolean')
    return 'boolean'

  if (typeof value === 'string')
    return 'string'

  if (typeof value === 'object')
    return 'object'

  if (!Number.isNaN(value))
    return 'number'

  return 'any'
}

function cloneValue<T>(value: T): T {
  if (typeof value !== 'object' || value == null)
    return value

  const normalizedValue = isProxy(value) ? toRaw(value) : value

  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(normalizedValue)
    }
    catch {
      // Fall through to JSON cloning for reactive proxies and other non-cloneable values.
    }
  }

  try {
    return JSON.parse(JSON.stringify(normalizedValue)) as T
  }
  catch {
    return normalizedValue
  }
}

function isObjectLike(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value != null && !Array.isArray(value)
}

function createInitialValue<T>(value: MaybeRef<T>): T {
  return cloneValue(toValue(value))
}

async function deserializeStoredValue<T>(rawValue: unknown, serializer: StorageSerializer<T>): Promise<T> {
  if (typeof rawValue === 'string')
    return await serializer.read(rawValue)

  return rawValue as T
}

function mergeStoredValue<T>(storedValue: T, defaults: T, mergeDefaults: UseStorageLocalOptions<T>['mergeDefaults']): T {
  if (!mergeDefaults)
    return storedValue

  if (typeof mergeDefaults === 'function')
    return mergeDefaults(storedValue, defaults)

  if (isObjectLike(storedValue) && isObjectLike(defaults))
    return { ...defaults, ...storedValue } as T

  return storedValue
}

function createStorageRef<T>(value: T, useShallow: boolean): StorageRef<T> {
  return (useShallow ? shallowRef(value) : ref(value)) as StorageRef<T>
}

const defaultStorageLocalRuntime: StorageLocalRuntime = {
  clearTimeout: timer => clearTimeout(timer),
  get: key => browser.storage.local.get(key),
  remove: key => browser.storage.local.remove(key),
  set: items => browser.storage.local.set(items),
  setTimeout: (callback, delay) => setTimeout(callback, delay),
  sleep: delay => new Promise(resolve => setTimeout(resolve, delay)),
  subscribe: (listener) => {
    browser.storage.onChanged.addListener(listener)
    return () => browser.storage.onChanged.removeListener(listener)
  },
}

function runWithFilter(
  eventFilter: StorageEventFilter | undefined,
  invoke: () => void | Promise<void>,
  onError: (error: unknown) => void,
) {
  try {
    void Promise.resolve(eventFilter ? eventFilter(invoke) : invoke()).catch(onError)
  }
  catch (error) {
    onError(error)
  }
}

export function useStorageLocal<T>(key: string, initialValue: MaybeRef<T>, options?: UseStorageLocalOptions<T>): StorageRef<T> {
  const {
    flush = 'pre',
    deep = true,
    listenToStorageChanges = true,
    writeDefaults = true,
    mergeDefaults = false,
    shallow = false,
    eventFilter,
    onError = (error: unknown) => {
      console.error(error)
    },
    onReady,
    runtime = defaultStorageLocalRuntime,
    serializer: customSerializer,
  } = options ?? {}

  const ownerScope = getCurrentScope()
  const initial = createInitialValue(initialValue)
  const serializer = (customSerializer ?? storageSerializers[guessSerializerType(initial)]) as StorageSerializer<T>
  const data = createStorageRef(createInitialValue(initialValue), shallow)

  let ready = false
  let initialReadSucceeded = false
  let dirtyBeforeReady = false
  let hasStoredValue = false
  let dataRevision = 0
  let suppressedWriteRevision: number | null = null
  let assigningFromStorage = false
  let storageChangeGeneration = 0
  let syncStarted = false
  let degraded = false
  let hasDegradedEdits = false
  let disposed = false
  let recoveryTimer: ReturnType<typeof setTimeout> | undefined
  let stopSyncWatch: (() => void) | undefined
  let removeStorageListener: (() => void) | undefined
  const pendingOwnStorageChanges: unknown[] = []

  const normalizePendingStorageValue = (value: unknown) => value ?? null

  const enqueuePendingOwnStorageChange = (value: unknown) => {
    pendingOwnStorageChanges.push(normalizePendingStorageValue(value))
    if (pendingOwnStorageChanges.length > 20)
      pendingOwnStorageChanges.shift()
  }

  const consumePendingOwnStorageChange = (value: unknown) => {
    const normalizedValue = normalizePendingStorageValue(value)
    const index = pendingOwnStorageChanges.findIndex(pendingValue => Object.is(pendingValue, normalizedValue))
    if (index === -1)
      return false

    pendingOwnStorageChanges.splice(index, 1)
    return true
  }

  const isOwnerActive = () => !disposed && (!ownerScope || ownerScope.active)

  const stopDirtyWatch = watch(
    data,
    () => {
      dataRevision++
      if (!ready && !assigningFromStorage)
        dirtyBeforeReady = true
    },
    { deep, flush: 'sync' },
  )

  const assignStorageValue = (nextValue: T) => {
    if (!isOwnerActive())
      return
    if (Object.is(data.value, nextValue)) {
      suppressedWriteRevision = null
      return
    }
    const expectedRevision = dataRevision + 1
    suppressedWriteRevision = expectedRevision
    assigningFromStorage = true
    try {
      data.value = nextValue
      if (dataRevision < expectedRevision)
        suppressedWriteRevision = null
    }
    finally {
      assigningFromStorage = false
    }
  }

  const persistValue = async () => {
    if (!isOwnerActive())
      return
    const snapshot = cloneValue(data.value)
    if (snapshot == null) {
      enqueuePendingOwnStorageChange(null)
      try {
        await runtime.remove(key)
        if (!isOwnerActive())
          consumePendingOwnStorageChange(null)
      }
      catch (error) {
        consumePendingOwnStorageChange(null)
        throw error
      }
    }
    else {
      const serializedValue = await serializer.write(snapshot)
      if (!isOwnerActive())
        return
      enqueuePendingOwnStorageChange(serializedValue)
      try {
        await runtime.set({ [key]: serializedValue })
        if (!isOwnerActive())
          consumePendingOwnStorageChange(serializedValue)
      }
      catch (error) {
        consumePendingOwnStorageChange(serializedValue)
        throw error
      }
    }
  }

  const clearRecoveryTimer = () => {
    if (recoveryTimer != null)
      runtime.clearTimeout(recoveryTimer)
    recoveryTimer = undefined
  }

  const startSync = () => {
    if (syncStarted || !isOwnerActive())
      return

    let registered = false
    const register = () => {
      if (!isOwnerActive())
        return

      stopSyncWatch = watch(
        data,
        () => {
          if (!ready || !isOwnerActive())
            return

          const revision = dataRevision
          if (suppressedWriteRevision === revision) {
            suppressedWriteRevision = null
            return
          }
          suppressedWriteRevision = null

          if (degraded)
            hasDegradedEdits = true

          runWithFilter(eventFilter, persistValue, (error) => {
            if (isOwnerActive())
              onError(error)
          })
        },
        { flush, deep },
      )

      if (listenToStorageChanges) {
        const onChanged = async (changes: Record<string, browser.Storage.StorageChange>, areaName: string) => {
          if (!isOwnerActive() || areaName !== 'local' || !(key in changes))
            return

          const change = changes[key]
          const generation = ++storageChangeGeneration

          try {
            if (consumePendingOwnStorageChange(change.newValue))
              return

            const nextValue = change.newValue == null
              ? createInitialValue(initialValue) as T
              : cloneValue(mergeStoredValue(
                  await deserializeStoredValue(change.newValue, serializer),
                  createInitialValue(initialValue),
                  mergeDefaults,
                ))
            if (!isOwnerActive() || generation !== storageChangeGeneration)
              return
            assignStorageValue(nextValue)
            initialReadSucceeded = true
            degraded = false
            hasDegradedEdits = false
            clearRecoveryTimer()
          }
          catch (error) {
            suppressedWriteRevision = null
            if (isOwnerActive())
              onError(error)
          }
        }

        removeStorageListener = runtime.subscribe(onChanged)
      }
      registered = true
    }

    if (ownerScope)
      ownerScope.run(register)
    else
      register()
    syncStarted = registered
  }

  const scheduleRecoveryRead = () => {
    if (!isOwnerActive() || !degraded || recoveryTimer != null)
      return

    recoveryTimer = runtime.setTimeout(async () => {
      recoveryTimer = undefined
      if (!isOwnerActive())
        return
      const recoveryRevision = dataRevision
      const recoveryStorageGeneration = storageChangeGeneration
      try {
        const result = await runtime.get(key)
        if (!isOwnerActive())
          return
        if (recoveryStorageGeneration !== storageChangeGeneration) {
          scheduleRecoveryRead()
          return
        }

        const rawStoredValue = result[key]
        hasStoredValue = rawStoredValue != null
        if (hasDegradedEdits || recoveryRevision !== dataRevision) {
          const persistedRevision = dataRevision
          await persistValue()
          if (!isOwnerActive())
            return
          hasDegradedEdits = dataRevision !== persistedRevision
        }
        else {
          const nextValue = rawStoredValue == null
            ? cloneValue(initial)
            : cloneValue(mergeStoredValue(
                await deserializeStoredValue(rawStoredValue, serializer),
                cloneValue(initial),
                mergeDefaults,
              ))
          if (!isOwnerActive())
            return
          if (recoveryStorageGeneration !== storageChangeGeneration
            || recoveryRevision !== dataRevision) {
            scheduleRecoveryRead()
            return
          }
          assignStorageValue(nextValue)
          if (rawStoredValue == null && writeDefaults && data.value != null) {
            await persistValue()
            if (!isOwnerActive())
              return
          }
        }
        initialReadSucceeded = true
        degraded = false
      }
      catch (error) {
        if (!isOwnerActive())
          return
        suppressedWriteRevision = null
        onError(error)
        scheduleRecoveryRead()
      }
    }, 15_000)
  }

  const dispose = () => {
    if (disposed)
      return
    disposed = true
    storageChangeGeneration++
    clearRecoveryTimer()
    stopDirtyWatch?.()
    stopSyncWatch?.()
    removeStorageListener?.()
  }
  if (ownerScope)
    onScopeDispose(dispose)

  void (async () => {
    let result: Record<string, unknown> | undefined
    let lastReadError: unknown
    for (let attempt = 0; attempt < 3; attempt++) {
      if (!isOwnerActive())
        return
      try {
        result = await runtime.get(key)
        if (!isOwnerActive())
          return
        initialReadSucceeded = true
        break
      }
      catch (error) {
        if (!isOwnerActive())
          return
        lastReadError = error
        if (attempt < 2) {
          await runtime.sleep(100 * 2 ** attempt)
          if (!isOwnerActive())
            return
        }
      }
    }

    try {
      if (!initialReadSucceeded) {
        onError(lastReadError)
        degraded = true
      }
      else {
        const rawStoredValue = result![key]
        hasStoredValue = rawStoredValue != null

        if (rawStoredValue == null) {
          if (!dirtyBeforeReady)
            assignStorageValue(cloneValue(initial))
        }
        else if (!dirtyBeforeReady) {
          const storedValue = await deserializeStoredValue(rawStoredValue, serializer)
          if (!isOwnerActive())
            return
          if (!dirtyBeforeReady) {
            assignStorageValue(cloneValue(mergeStoredValue(
              storedValue,
              cloneValue(initial),
              mergeDefaults,
            )))
          }
        }
      }
    }
    catch (error) {
      if (!isOwnerActive())
        return
      onError(error)
      initialReadSucceeded = false
      degraded = true
    }

    if (!isOwnerActive())
      return
    ready = true
    startSync()
    if (!isOwnerActive())
      return

    if (!initialReadSucceeded) {
      hasDegradedEdits = dirtyBeforeReady
      onReady?.(data.value)
      if (!isOwnerActive())
        return
      if (dirtyBeforeReady) {
        try {
          await persistValue()
          if (!isOwnerActive())
            return
        }
        catch (error) {
          if (!isOwnerActive())
            return
          onError(error)
        }
      }
      scheduleRecoveryRead()
      return
    }

    try {
      if (shouldWriteStorageDefault(initialReadSucceeded, hasStoredValue, dirtyBeforeReady, writeDefaults, data.value != null)) {
        await persistValue()
        if (!isOwnerActive())
          return
      }
    }
    catch (error) {
      if (!isOwnerActive())
        return
      onError(error)
    }

    if (isOwnerActive())
      onReady?.(data.value)
  })()

  return data
}
