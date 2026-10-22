import type Browser from 'webextension-polyfill'
import browser from 'webextension-polyfill'

import type {
  TopBarFavoritesChanged,
  TopBarRefreshClaim,
  TopBarSharedResource,
  TopBarSharedState,
  TopBarStateClaim,
  TopBarStateInvalidate,
  TopBarStatePublish,
  TopBarStateRelease,
} from '~/constants/topBarState'
import {
  TOP_BAR_RESOURCE_FIELDS,
  TOP_BAR_STATE_MESSAGE,
} from '~/constants/topBarState'
import { onMessage } from '~/utils/messaging'

import type { StateConsumerBrowser } from './stateConsumers'
import { createStateConsumerRegistry, getStateConsumerRegistry } from './stateConsumers'

interface TopBarStateEntry {
  snapshot?: Partial<TopBarSharedState>
  updatedAt: number
  refreshStartedAt: number
  refreshId: number
  version: number
  refreshVersion: number
  snapshotVersion?: number
}

export interface TopBarStateBrokerBrowser extends StateConsumerBrowser {
  extension?: Pick<Browser.Extension.Static, 'inIncognitoContext'>
  storage?: {
    session?: Pick<Browser.Storage.StorageArea, 'get' | 'set'>
  }
}

export interface TopBarStateBroker {
  claimRefresh: (
    data: TopBarStateClaim,
    sender?: Browser.Runtime.MessageSender,
  ) => Promise<TopBarRefreshClaim>
  publish: (
    data: TopBarStatePublish,
    sender?: Browser.Runtime.MessageSender,
  ) => Promise<void>
  releaseRefresh: (
    data: TopBarStateRelease,
    sender?: Browser.Runtime.MessageSender,
  ) => Promise<void>
  invalidate: (
    data: TopBarStateInvalidate,
    sender?: Browser.Runtime.MessageSender,
  ) => Promise<void>
  notifyFavoritesChanged: (
    data: TopBarFavoritesChanged,
    sender?: Browser.Runtime.MessageSender,
  ) => Promise<void>
}

const REFRESH_LEASE_TIMEOUT = 30_000
/** One session-storage record per context/account/resource: no write rewrites unrelated resources. */
const TOP_BAR_STATE_STORAGE_KEY = 'topBarStateBroker:v4'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isOptionalTimestamp(value: unknown): value is number | null | undefined {
  return value === undefined || value === null || (typeof value === 'number' && Number.isFinite(value))
}

function isTopBarSharedState(value: unknown): value is Partial<TopBarSharedState> {
  return isRecord(value)
    && (value.unReadMessage === undefined || isRecord(value.unReadMessage))
    && (value.unReadDm === undefined || isRecord(value.unReadDm))
    && (value.newMomentsCount === undefined || typeof value.newMomentsCount === 'number')
    && (value.hasBCoinToReceive === undefined || typeof value.hasBCoinToReceive === 'boolean')
    && (value.bCoinAlreadyReceived === undefined || typeof value.bCoinAlreadyReceived === 'boolean')
    && (value.vipExpAlreadyReceived === undefined || typeof value.vipExpAlreadyReceived === 'boolean')
    && isOptionalTimestamp(value.bCoinNextReceiveAt)
    && isOptionalTimestamp(value.vipExpNextReceiveAt)
}

function isTopBarStateEntry(value: unknown): value is TopBarStateEntry {
  return isRecord(value)
    && typeof value.updatedAt === 'number'
    && typeof value.refreshStartedAt === 'number'
    && typeof value.refreshId === 'number'
    && Number.isSafeInteger(value.version)
    && Number.isSafeInteger(value.refreshVersion)
    && (value.snapshot === undefined || isTopBarSharedState(value.snapshot))
}

function getBrowserContextKey(tab?: Browser.Tabs.Tab) {
  const privacyContext = tab?.incognito ? 'private' : 'normal'
  return `${privacyContext}:default`
}

function getStateKey(tab: Browser.Tabs.Tab | undefined, accountId: number, resource: TopBarSharedResource) {
  return `${getBrowserContextKey(tab)}:${accountId}:${resource}`
}

export function createTopBarStateBroker(
  extensionApi: TopBarStateBrokerBrowser = browser,
  consumers = createStateConsumerRegistry(extensionApi),
): TopBarStateBroker {
  const stateByContext = new Map<string, TopBarStateEntry>()
  const sessionStorage = extensionApi.storage?.session
  const storagePrefix = `${extensionApi.extension?.inIncognitoContext ? `${TOP_BAR_STATE_STORAGE_KEY}:private` : TOP_BAR_STATE_STORAGE_KEY}:`
  let stateLoadPromise: Promise<void> | undefined
  /** Leases and versions of one resource stay ordered; other resources never wait for it. */
  const operationQueues = new Map<string, Promise<void>>()

  function runExclusive<T>(key: string, operation: () => T | Promise<T>): Promise<T> {
    const previous = operationQueues.get(key) ?? Promise.resolve()
    const result = previous.then(operation, operation)
    const settled = result.then(() => undefined, () => undefined)
    operationQueues.set(key, settled)
    void settled.then(() => {
      if (operationQueues.get(key) === settled)
        operationQueues.delete(key)
    })
    return result
  }

  async function loadPersistedState(): Promise<void> {
    if (!sessionStorage)
      return

    try {
      const stored = await sessionStorage.get(null)
      for (const [storageKey, entry] of Object.entries(stored)) {
        if (storageKey.startsWith(storagePrefix) && isTopBarStateEntry(entry))
          stateByContext.set(storageKey.slice(storagePrefix.length), entry)
      }
    }
    catch {
      // 不支持会话存储时继续使用当前后台进程内的状态
    }
  }

  async function ensureStateLoaded(): Promise<void> {
    stateLoadPromise ??= loadPersistedState()
    await stateLoadPromise
  }

  /** A lease grant or version commit is persisted before its reply, for this record only. */
  async function persistEntry(key: string): Promise<void> {
    const entry = stateByContext.get(key)
    if (!sessionStorage || !entry)
      return

    try {
      await sessionStorage.set({ [`${storagePrefix}${key}`]: entry })
    }
    catch {
      // 写入失败不影响当前后台进程继续协调刷新
    }
  }

  function resolveKey(accountId: number, resource: TopBarSharedResource, sender?: Browser.Runtime.MessageSender) {
    if (!Number.isSafeInteger(accountId) || accountId <= 0 || !Object.hasOwn(TOP_BAR_RESOURCE_FIELDS, resource))
      throw new TypeError('Invalid TopBar resource')
    return getStateKey(sender?.tab, accountId, resource)
  }

  function getEntry(key: string) {
    let entry = stateByContext.get(key)

    if (!entry) {
      entry = {
        updatedAt: 0,
        refreshStartedAt: 0,
        refreshId: 0,
        version: 0,
        refreshVersion: 0,
      }
      stateByContext.set(key, entry)
    }

    return entry
  }

  // Only documents that claimed this topic and still show it receive changes;
  // a consumer already holding this resource revision is skipped.
  function deliverSnapshot(data: TopBarStatePublish, sender?: Browser.Runtime.MessageSender) {
    return consumers.deliver('topBar', { type: TOP_BAR_STATE_MESSAGE.UPDATED, data }, consumers.privacyOf(sender?.tab), {
      resource: `${data.accountId}:${data.resource}`,
      revision: `${data.version}:${data.refreshId}`,
    })
  }

  function deliverInvalidation(data: TopBarStateInvalidate, sender?: Browser.Runtime.MessageSender) {
    return consumers.deliver('topBar', { type: TOP_BAR_STATE_MESSAGE.INVALIDATED, data }, consumers.privacyOf(sender?.tab))
  }

  return {
    async claimRefresh({ accountId, maxAge, force = false, resource }, sender) {
      const key = resolveKey(accountId, resource, sender)
      // A claim is the document's current display demand for this topic.
      void consumers.touch('topBar', sender)
      return runExclusive(key, async () => {
        await ensureStateLoaded()

        const entry = getEntry(key)
        const now = Date.now()
        const snapshotFresh = entry.snapshot !== undefined && entry.snapshotVersion === entry.version && now - entry.updatedAt < maxAge
        const refreshInProgress = entry.refreshStartedAt > 0
          && now - entry.refreshStartedAt < REFRESH_LEASE_TIMEOUT
        // Force requests freshness, never permission to bypass a shared lease.
        const shouldRefresh = !refreshInProgress && (force || !snapshotFresh)

        if (shouldRefresh) {
          entry.refreshStartedAt = now
          entry.refreshId += 1
          entry.refreshVersion = entry.version
          await persistEntry(key)
        }

        return {
          shouldRefresh,
          snapshot: snapshotFresh ? entry.snapshot : undefined,
          version: entry.version,
          ...(shouldRefresh ? { refreshId: entry.refreshId } : {}),
        }
      })
    },

    async publish(data, sender) {
      const { accountId, snapshot, refreshId, resource, version } = data
      const key = resolveKey(accountId, resource, sender)
      const published = await runExclusive(key, async () => {
        await ensureStateLoaded()

        const entry = getEntry(key)
        if (entry.refreshId !== refreshId || !entry.refreshStartedAt || entry.refreshVersion !== version)
          return undefined

        entry.refreshStartedAt = 0
        if (entry.version !== version) {
          await persistEntry(key)
          return { invalidated: true, version: entry.version }
        }
        const fields = TOP_BAR_RESOURCE_FIELDS[resource]
        const selected = Object.fromEntries(fields.filter(field => field in snapshot).map(field => [field, snapshot[field]]))
        if (!isTopBarSharedState(selected) || fields.some(field => !field.endsWith('At') && !(field in selected))) {
          await persistEntry(key)
          return undefined
        }
        entry.snapshot = selected
        entry.snapshotVersion = version
        entry.updatedAt = Date.now()
        await persistEntry(key)
        return { invalidated: false, version, snapshot: selected }
      })

      if (published?.invalidated)
        await deliverInvalidation({ accountId, resource, version: published.version }, sender)
      else if (published?.snapshot)
        await deliverSnapshot({ ...data, snapshot: published.snapshot }, sender)
    },

    async releaseRefresh({ accountId, refreshId, resource }, sender) {
      const key = resolveKey(accountId, resource, sender)
      const dirty = await runExclusive(key, async () => {
        await ensureStateLoaded()
        const entry = getEntry(key)
        if (entry.refreshId !== refreshId)
          return

        entry.refreshStartedAt = 0
        await persistEntry(key)
        return entry.version !== entry.refreshVersion ? entry.version : undefined
      })
      if (dirty !== undefined)
        await deliverInvalidation({ accountId, resource, version: dirty }, sender)
    },

    async invalidate(data, sender) {
      const key = resolveKey(data.accountId, data.resource, sender)
      const version = await runExclusive(key, async () => {
        await ensureStateLoaded()
        const entry = getEntry(key)
        entry.updatedAt = 0
        entry.version++
        await persistEntry(key)
        return entry.version
      })

      await deliverInvalidation({ ...data, version }, sender)
    },

    notifyFavoritesChanged(data, sender) {
      return consumers.deliver('topBar', { type: TOP_BAR_STATE_MESSAGE.FAVORITES_CHANGED, data }, consumers.privacyOf(sender?.tab))
    },

  }
}

export function setupTopBarStateBroker() {
  const broker = createTopBarStateBroker(browser, getStateConsumerRegistry())

  onMessage<TopBarStateClaim>(
    TOP_BAR_STATE_MESSAGE.CLAIM_REFRESH,
    (data, sender) => broker.claimRefresh(data, sender),
  )

  onMessage<TopBarStatePublish>(
    TOP_BAR_STATE_MESSAGE.PUBLISH,
    (data, sender) => broker.publish(data, sender),
  )

  onMessage<TopBarStateRelease>(
    TOP_BAR_STATE_MESSAGE.RELEASE_REFRESH,
    (data, sender) => broker.releaseRefresh(data, sender),
  )

  onMessage<TopBarStateInvalidate>(
    TOP_BAR_STATE_MESSAGE.INVALIDATE,
    (data, sender) => broker.invalidate(data, sender),
  )

  onMessage<TopBarFavoritesChanged>(
    TOP_BAR_STATE_MESSAGE.FAVORITES_CHANGED,
    (data, sender) => broker.notifyFavoritesChanged(data, sender),
  )

  return broker
}
