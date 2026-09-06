import type { DisplayMoment } from '~/components/MomentCard/types'
import { useStorageLocal } from '~/composables/useStorageLocal'
import type { AccountId } from '~/utils/accountScope'
import { isSameAccount } from '~/utils/accountScope'

export type MomentFilter = 'all' | 'video' | 'pgc' | 'article'
export interface MomentsFeedCacheEntry {
  items: DisplayMoment[]
  offset: string
  updateBaseline: string
  hasMore: boolean
  updatedAt: number
  continuation?: {
    items: DisplayMoment[]
    offset: string
    updateBaseline: string
    hasMore: boolean
  }
}
export type MomentsFeedCacheEntries = Partial<Record<MomentFilter, MomentsFeedCacheEntry>>
export interface MomentsFeedCache {
  accountId: AccountId
  entries: MomentsFeedCacheEntries
}

export function mergeCachedMoments(primary: DisplayMoment[], secondary: DisplayMoment[]) {
  const result: DisplayMoment[] = []
  const ids = new Set<string>()
  for (const moment of [...primary, ...secondary]) {
    if (ids.has(moment.id))
      continue
    ids.add(moment.id)
    result.push(moment)
  }
  return result
}

export function useMomentsFeedCache(getAccountId: () => AccountId) {
  let resolveMomentsFeedCacheReady: (() => void) | undefined
  const momentsFeedCacheReady = new Promise<void>((resolve) => {
    resolveMomentsFeedCacheReady = resolve
  })
  const momentsFeedCache = useStorageLocal<MomentsFeedCache>('momentsFeedCache', {
    accountId: null,
    entries: {},
  }, {
    writeDefaults: false,
    deep: false,
    shallow: true,
    onReady: () => resolveMomentsFeedCacheReady?.(),
  })
  const MOMENTS_CACHE_MAX_ITEMS = 1000
  const MOMENTS_CACHE_TTL_MS = 3 * 24 * 60 * 60 * 1000
  function ensureMomentsCacheAccount(accountId: AccountId) {
    if (isSameAccount(momentsFeedCache.value.accountId, accountId))
      return

    momentsFeedCache.value = {
      accountId,
      entries: {},
    }
  }

  function getValidMomentsCache(filter: MomentFilter) {
    ensureMomentsCacheAccount(getAccountId())
    const entry = momentsFeedCache.value.entries[filter]
    if (!entry)
      return undefined
    const usesCurrentMomentShape = entry.items.every(moment => (
      typeof moment.videoPlay === 'string'
      && typeof moment.videoDanmaku === 'string'
      && !(moment.isForward && moment.isVideo)
      && 'commentId' in moment
      && 'commentType' in moment
      && 'descInherited' in moment
    ))
    if (usesCurrentMomentShape && Date.now() - entry.updatedAt < MOMENTS_CACHE_TTL_MS)
      return entry

    const { [filter]: _expired, ...validEntries } = momentsFeedCache.value.entries
    momentsFeedCache.value = {
      accountId: getAccountId(),
      entries: validEntries,
    }
    return undefined
  }

  function saveMomentsCache(filter: MomentFilter, entry: MomentsFeedCacheEntry) {
    ensureMomentsCacheAccount(getAccountId())
    const items = entry.items.slice(-MOMENTS_CACHE_MAX_ITEMS)
    const continuationLimit = Math.max(0, MOMENTS_CACHE_MAX_ITEMS - items.length)
    const continuation = entry.continuation && continuationLimit > 0
      ? { ...entry.continuation, items: entry.continuation.items.slice(-continuationLimit) }
      : undefined
    momentsFeedCache.value = {
      accountId: getAccountId(),
      entries: {
        ...momentsFeedCache.value.entries,
        [filter]: {
          ...entry,
          items,
          continuation,
          updatedAt: Date.now(),
        },
      },
    }
  }

  function cacheRegularMomentPage(
    filter: MomentFilter,
    pageItems: DisplayMoment[],
    pageOffset: string,
    pageUpdateBaseline: string,
    pageHasMore: boolean,
    reset: boolean,
  ) {
    if ((filter !== 'all' && filter !== 'video') || !pageItems.length)
      return

    const existing = getValidMomentsCache(filter)
    if (!existing) {
      saveMomentsCache(filter, {
        items: pageItems,
        offset: pageOffset,
        updateBaseline: pageUpdateBaseline,
        hasMore: pageHasMore,
        updatedAt: Date.now(),
      })
      return
    }

    const existingIds = new Set(existing.items.map(moment => moment.id))
    const overlapsCache = pageItems.some(moment => existingIds.has(moment.id))
    // 顶部刷新若尚未追上旧缓存，保留旧段，后续按每批 100 条继续寻找衔接点。
    if (reset && !overlapsCache) {
      saveMomentsCache(filter, {
        items: pageItems,
        offset: pageOffset,
        updateBaseline: pageUpdateBaseline,
        hasMore: pageHasMore,
        updatedAt: Date.now(),
        continuation: {
          items: existing.items,
          offset: existing.offset,
          updateBaseline: existing.updateBaseline,
          hasMore: existing.hasMore,
        },
      })
      return
    }

    const continuationIds = new Set(existing.continuation?.items.map(moment => moment.id) || [])
    const reachesContinuation = pageItems.some(moment => continuationIds.has(moment.id))
    if (reachesContinuation && existing.continuation) {
      saveMomentsCache(filter, {
        items: mergeCachedMoments(existing.items, mergeCachedMoments(pageItems, existing.continuation.items))
          .sort((a, b) => b.publishedAt - a.publishedAt),
        offset: existing.continuation.offset,
        updateBaseline: existing.continuation.updateBaseline,
        hasMore: existing.continuation.hasMore,
        updatedAt: Date.now(),
      })
      return
    }

    const existingOldest = Math.min(...existing.items.map(moment => moment.publishedAt || Infinity))
    const pageOldest = Math.min(...pageItems.map(moment => moment.publishedAt || Infinity))
    const extendsCachedTail = pageOldest < existingOldest
    const items = mergeCachedMoments(
      reset ? pageItems : existing.items,
      reset ? existing.items : pageItems,
    )
      .sort((a, b) => b.publishedAt - a.publishedAt)
    saveMomentsCache(filter, {
      items,
      offset: extendsCachedTail ? pageOffset : existing.offset,
      updateBaseline: extendsCachedTail ? pageUpdateBaseline : existing.updateBaseline,
      hasMore: extendsCachedTail ? pageHasMore : existing.hasMore,
      updatedAt: Date.now(),
      continuation: existing.continuation,
    })
  }
  function updateMoment(id: string, update: (item: DisplayMoment) => DisplayMoment) {
    const entries: MomentsFeedCacheEntries = {}
    const updateItems = (items: DisplayMoment[]) => items.map(item => item.id === id ? update(item) : item)
    for (const filter of Object.keys(momentsFeedCache.value.entries) as MomentFilter[]) {
      const entry = momentsFeedCache.value.entries[filter]
      if (entry)
        entries[filter] = { ...entry, items: updateItems(entry.items), continuation: entry.continuation ? { ...entry.continuation, items: updateItems(entry.continuation.items) } : undefined }
    }
    momentsFeedCache.value = { accountId: getAccountId(), entries }
  }
  return { ready: momentsFeedCacheReady, ensureMomentsCacheAccount, getValidMomentsCache, saveMomentsCache, cacheRegularMomentPage, updateMoment }
}
