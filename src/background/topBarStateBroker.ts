import type Browser from 'webextension-polyfill'
import browser from 'webextension-polyfill'

import { CONTENT_SCRIPT_MATCHES } from '~/constants/contentScript'
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

interface TopBarStateEntry {
  snapshot?: Partial<TopBarSharedState>
  updatedAt: number
  refreshStartedAt: number
  refreshId: number
  version: number
  refreshVersion: number
  snapshotVersion?: number
}

export interface TopBarStateBrokerBrowser {
  extension?: Pick<Browser.Extension.Static, 'inIncognitoContext'>
  storage?: {
    session?: Pick<Browser.Storage.StorageAreaWithUsage, 'get' | 'set'>
  }
  tabs: Pick<Browser.Tabs.Static, 'query' | 'sendMessage'>
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
const TOP_BAR_STATE_STORAGE_KEY = 'topBarStateBroker:v3'
const TOP_BAR_STATE_STORAGE_VERSION = 3

interface PersistedTopBarState {
  version: typeof TOP_BAR_STATE_STORAGE_VERSION
  entries: Record<string, TopBarStateEntry>
}

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

function isPersistedTopBarState(value: unknown): value is PersistedTopBarState {
  return isRecord(value)
    && value.version === TOP_BAR_STATE_STORAGE_VERSION
    && isRecord(value.entries)
    && Object.values(value.entries).every(isTopBarStateEntry)
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
): TopBarStateBroker {
  const stateByContext = new Map<string, TopBarStateEntry>()
  const sessionStorage = extensionApi.storage?.session
  const storageKey = extensionApi.extension?.inIncognitoContext ? `${TOP_BAR_STATE_STORAGE_KEY}:private` : TOP_BAR_STATE_STORAGE_KEY
  let stateLoadPromise: Promise<void> | undefined
  let operationQueue: Promise<void> = Promise.resolve()

  function runExclusive<T>(operation: () => T | Promise<T>): Promise<T> {
    const result = operationQueue.then(operation, operation)
    operationQueue = result.then(() => undefined, () => undefined)
    return result
  }

  async function loadPersistedState(): Promise<void> {
    if (!sessionStorage)
      return

    try {
      const stored = await sessionStorage.get(storageKey)
      const persistedState = stored[storageKey]

      if (!isPersistedTopBarState(persistedState))
        return

      Object.entries(persistedState.entries).forEach(([key, entry]) => {
        stateByContext.set(key, entry)
      })
    }
    catch {
      // 不支持会话存储时继续使用当前后台进程内的状态
    }
  }

  async function ensureStateLoaded(): Promise<void> {
    stateLoadPromise ??= loadPersistedState()
    await stateLoadPromise
  }

  async function persistState(): Promise<void> {
    if (!sessionStorage)
      return

    const persistedState: PersistedTopBarState = {
      version: TOP_BAR_STATE_STORAGE_VERSION,
      entries: Object.fromEntries(stateByContext),
    }

    try {
      await sessionStorage.set({
        [storageKey]: persistedState,
      })
    }
    catch {
      // 写入失败不影响当前后台进程继续协调刷新
    }
  }

  function getEntry(accountId: number, resource: TopBarSharedResource, sender?: Browser.Runtime.MessageSender) {
    if (!Number.isSafeInteger(accountId) || accountId <= 0 || !Object.hasOwn(TOP_BAR_RESOURCE_FIELDS, resource))
      throw new TypeError('Invalid TopBar resource')
    const key = getStateKey(sender?.tab, accountId, resource)
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

  async function broadcastSnapshot(
    data: TopBarStatePublish,
    sender?: Browser.Runtime.MessageSender,
  ): Promise<void> {
    const browserContextKey = getBrowserContextKey(sender?.tab)
    let tabs: Browser.Tabs.Tab[]

    try {
      tabs = await extensionApi.tabs.query({
        url: [...CONTENT_SCRIPT_MATCHES],
      })
    }
    catch {
      return
    }

    await Promise.allSettled(
      tabs
        .filter(tab => tab.id !== undefined && getBrowserContextKey(tab) === browserContextKey)
        .map(tab => extensionApi.tabs.sendMessage(tab.id!, {
          type: TOP_BAR_STATE_MESSAGE.UPDATED,
          data,
        })),
    )
  }

  async function broadcastInvalidation(
    data: TopBarStateInvalidate,
    sender?: Browser.Runtime.MessageSender,
    messageType: string = TOP_BAR_STATE_MESSAGE.INVALIDATED,
    excludeSender = false,
  ): Promise<void> {
    const browserContextKey = getBrowserContextKey(sender?.tab)

    try {
      const tabs = await extensionApi.tabs.query({ url: [...CONTENT_SCRIPT_MATCHES] })
      await Promise.allSettled(
        tabs
          .filter(tab => tab.id !== undefined
            && (!excludeSender || tab.id !== sender?.tab?.id)
            && getBrowserContextKey(tab) === browserContextKey)
          .map(tab => extensionApi.tabs.sendMessage(tab.id!, {
            type: messageType,
            data,
          })),
      )
    }
    catch {
      // 页面可能已关闭；后续初始化仍会从已失效的缓存重新请求
    }
  }

  async function broadcastFavoritesChanged(
    data: TopBarFavoritesChanged,
    sender?: Browser.Runtime.MessageSender,
  ): Promise<void> {
    const browserContextKey = getBrowserContextKey(sender?.tab)

    try {
      const tabs = await extensionApi.tabs.query({ url: [...CONTENT_SCRIPT_MATCHES] })
      await Promise.allSettled(
        tabs
          .filter(tab => tab.id !== undefined && getBrowserContextKey(tab) === browserContextKey)
          .map(tab => extensionApi.tabs.sendMessage(tab.id!, {
            type: TOP_BAR_STATE_MESSAGE.FAVORITES_CHANGED,
            data,
          })),
      )
    }
    catch {
      // 页面可能已关闭；下次打开收藏 Pop 时仍会重新拉取
    }
  }

  return {
    claimRefresh({ accountId, maxAge, force = false, resource }, sender) {
      return runExclusive(async () => {
        await ensureStateLoaded()

        const entry = getEntry(accountId, resource, sender)
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
          await persistState()
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
      const published = await runExclusive(async () => {
        await ensureStateLoaded()

        const entry = getEntry(accountId, resource, sender)
        if (entry.refreshId !== refreshId || !entry.refreshStartedAt || entry.refreshVersion !== version)
          return undefined

        entry.refreshStartedAt = 0
        if (entry.version !== version) {
          await persistState()
          return { invalidated: true, version: entry.version }
        }
        const fields = TOP_BAR_RESOURCE_FIELDS[resource]
        const selected = Object.fromEntries(fields.filter(field => field in snapshot).map(field => [field, snapshot[field]]))
        if (!isTopBarSharedState(selected) || fields.some(field => !field.endsWith('At') && !(field in selected))) {
          await persistState()
          return undefined
        }
        entry.snapshot = selected
        entry.snapshotVersion = version
        entry.updatedAt = Date.now()
        await persistState()
        return { invalidated: false, version, snapshot: selected }
      })

      if (published?.invalidated)
        await broadcastInvalidation({ accountId, resource, version: published.version }, sender)
      else if (published?.snapshot)
        await broadcastSnapshot({ ...data, snapshot: published.snapshot }, sender)
    },

    async releaseRefresh({ accountId, refreshId, resource }, sender) {
      const dirty = await runExclusive(async () => {
        await ensureStateLoaded()
        const entry = getEntry(accountId, resource, sender)
        if (entry.refreshId !== refreshId)
          return

        entry.refreshStartedAt = 0
        await persistState()
        return entry.version !== entry.refreshVersion ? entry.version : undefined
      })
      if (dirty !== undefined)
        await broadcastInvalidation({ accountId, resource, version: dirty }, sender)
    },

    async invalidate(data, sender) {
      const version = await runExclusive(async () => {
        await ensureStateLoaded()
        const entry = getEntry(data.accountId, data.resource, sender)
        entry.updatedAt = 0
        entry.version++
        await persistState()
        return entry.version
      })

      await broadcastInvalidation({ ...data, version }, sender)
    },

    notifyFavoritesChanged(data, sender) {
      return broadcastFavoritesChanged(data, sender)
    },

  }
}

export function setupTopBarStateBroker() {
  const broker = createTopBarStateBroker()

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
