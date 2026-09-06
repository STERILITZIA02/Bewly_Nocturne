import type { DisplayMoment } from '~/components/MomentCard/types'
import type { DataItem, MomentResult } from '~/models/moment/moment'
import api from '~/utils/api'
import { isExtensionContextInvalidatedError } from '~/utils/messaging'
import { resolveMomentHostFollowState } from '~/utils/momentHostFollowState'

import type { MomentFilter, MomentsFeedCacheEntry, useMomentsFeedCache } from './useMomentsFeedCache'
import { mergeCachedMoments } from './useMomentsFeedCache'

interface MomentFeedRead {
  reset: boolean
  type: MomentFilter
  group: 'all' | 'wanted'
  hostMid: string
  offset: string
  updateBaseline: string
  page: number
  filtered: boolean
  hasWantedUsers: boolean
}
const MOMENT_FEED_FEATURES = 'itemOpusStyle,listOnlyfans,opusBigCover,onlyfansVote,decorationCard,onlyfansAssetsV2,forwardListHidden,ugcDelete,onlyfansQaCard'
const FILTERED_MAX_REQUEST_PAGES = 2
const WANTED_SCAN_LIMIT = 100

/** Owns remote page assembly and the unconsumed wanted segment; presentation never changes its cursor. */
export function createMomentFeedReader(
  cache: ReturnType<typeof useMomentsFeedCache>,
  mapMoment: (item: DataItem) => DisplayMoment,
) {
  let wantedFeedBuffer: MomentsFeedCacheEntry | undefined
  let loadedItems: DisplayMoment[] = []
  let loadedQuery = ''
  const queryKey = (type: MomentFilter, group: string, hostMid: string) => `${type}:${group}:${hostMid}`
  async function read(request: MomentFeedRead, isCurrent: () => boolean) {
    if (!isCurrent())
      return
    const previousBuffer = wantedFeedBuffer
    if (request.reset)
      wantedFeedBuffer = undefined
    const requestType = request.type
    const requestGroup = request.group
    const requestHostMid = request.hostMid
    let nextPageNumber = request.page
    let filteredRequestPages = 0
    let rawItems: DataItem[] = []
    let cachedBatch: DisplayMoment[] | undefined
    let hasMore = false
    let nextOffset = ''
    let nextUpdateBaseline = ''
    const hostFollowStatePromise = request.reset && requestHostMid
      ? api.user.getRelations({ fids: requestHostMid })
          .then(response => ({ state: resolveMomentHostFollowState(response, requestHostMid) }))
          .catch(error => isExtensionContextInvalidatedError(error) ? { error } : { state: 'unknown' })
      : null
    let hostFollowStateChecked = false
    async function keepSelectedHostFilter() {
      if (!hostFollowStatePromise || hostFollowStateChecked)
        return true
      hostFollowStateChecked = true
      const result = await hostFollowStatePromise
      if ('error' in result)
        throw result.error
      return result.state !== 'unfollowed'
    }
    function accept(response: MomentResult) {
      if (!isCurrent())
        return false
      if (response.code !== 0)
        throw new Error(response.message || 'Moments request failed')
      return true
    }
    try {
      if (requestHostMid) {
      // 按 UP 主筛选：走 feed/all + host_mid，不写入全局全部动态缓存
        let nextPage = nextPageNumber
        if (request.filtered) {
          let scanOffset = request.offset
          let scanUpdateBaseline = request.updateBaseline
          let canContinue = true
          const scanned: DataItem[] = []

          while (canContinue && filteredRequestPages < FILTERED_MAX_REQUEST_PAGES) {
            filteredRequestPages += 1
            const response = await api.moment.getMomentsByUp({
              host_mid: requestHostMid,
              type: requestType,
              offset: scanOffset || undefined,
              update_baseline: scanUpdateBaseline || undefined,
              page: nextPage,
              platform: 'web',
              features: MOMENT_FEED_FEATURES,
              web_location: '333.1365',
            }) as MomentResult
            if (!await keepSelectedHostFilter())
              return { hostUnfollowed: true as const }
            if (!accept(response))
              return

            const pageItems = response.data?.items || []
            scanned.push(...pageItems)
            const responseOffset = response.data?.offset || ''
            scanUpdateBaseline = response.data?.update_baseline || ''
            canContinue = Boolean(response.data?.has_more)
              && responseOffset !== scanOffset
            scanOffset = responseOffset
            nextPage += 1
          }

          rawItems = scanned
          hasMore = canContinue
          nextOffset = scanOffset
          nextUpdateBaseline = scanUpdateBaseline
        }
        else {
          const response = await api.moment.getMomentsByUp({
            host_mid: requestHostMid,
            type: requestType,
            offset: request.offset || undefined,
            update_baseline: request.updateBaseline || undefined,
            page: nextPage,
            platform: 'web',
            features: MOMENT_FEED_FEATURES,
            web_location: '333.1365',
          }) as MomentResult
          if (!await keepSelectedHostFilter())
            return { hostUnfollowed: true as const }
          if (!accept(response))
            return
          rawItems = response.data?.items || []
          nextOffset = response.data?.offset || ''
          hasMore = Boolean(response.data?.has_more) && rawItems.length > 0 && nextOffset !== request.offset
          nextUpdateBaseline = response.data?.update_baseline || ''
          nextPage += 1
        }
        nextPageNumber = nextPage
      }
      else if (requestGroup === 'wanted') {
        await cache.ready
        if (!isCurrent())
          return
        let cacheEntry = wantedFeedBuffer ?? cache.getValidMomentsCache(requestType) ?? {
          items: [],
          offset: '',
          updateBaseline: '',
          hasMore: true,
          updatedAt: Date.now(),
        }

        if (!request.hasWantedUsers) {
          wantedFeedBuffer = undefined
          cachedBatch = []
        }
        else {
          let cacheChanged = false
          if (request.reset) {
            wantedFeedBuffer = undefined
            const existingCache = cacheEntry
            const existingIds = new Set(existingCache.items.map(moment => moment.id))
            const freshItems: DisplayMoment[] = []
            let scanOffset = ''
            let scanUpdateBaseline = ''
            let canContinue = true
            let reachedCache = false

            while (
              canContinue
              && freshItems.length < WANTED_SCAN_LIMIT
              && !reachedCache
              && filteredRequestPages < FILTERED_MAX_REQUEST_PAGES
            ) {
              filteredRequestPages += 1
              const response = await api.moment.getMoments({
                type: requestType,
                offset: scanOffset || undefined,
                update_baseline: scanUpdateBaseline || undefined,
                features: MOMENT_FEED_FEATURES,
              }) as MomentResult
              if (!accept(response))
                return

              const pageItems = (response.data?.items || []).map(mapMoment)
              reachedCache = pageItems.some(moment => existingIds.has(moment.id))
              freshItems.push(...pageItems)
              const responseOffset = response.data?.offset || ''
              scanUpdateBaseline = response.data?.update_baseline || ''
              canContinue = Boolean(response.data?.has_more)
                && responseOffset !== scanOffset
              scanOffset = responseOffset
            }

            cacheEntry = reachedCache
              ? {
                  ...existingCache,
                  items: mergeCachedMoments(freshItems, existingCache.items),
                }
              : {
                  items: mergeCachedMoments(freshItems, []),
                  offset: scanOffset,
                  updateBaseline: scanUpdateBaseline,
                  hasMore: canContinue,
                  updatedAt: Date.now(),
                  continuation: canContinue && existingCache.items.length
                    ? {
                        items: existingCache.items,
                        offset: existingCache.offset,
                        updateBaseline: existingCache.updateBaseline,
                        hasMore: existingCache.hasMore,
                      }
                    : undefined,
                }
            cacheChanged = true
          }

          const batchEnd = WANTED_SCAN_LIMIT
          while (
            cacheEntry.items.length < batchEnd
            && cacheEntry.hasMore
            && filteredRequestPages < FILTERED_MAX_REQUEST_PAGES
          ) {
            filteredRequestPages += 1
            const response = await api.moment.getMoments({
              type: requestType,
              offset: cacheEntry.offset || undefined,
              update_baseline: cacheEntry.updateBaseline || undefined,
              features: MOMENT_FEED_FEATURES,
            }) as MomentResult
            if (!accept(response))
              return

            const pageItems = (response.data?.items || []).map(mapMoment)
            const responseOffset = response.data?.offset || ''
            const continuationIds = new Set(cacheEntry.continuation?.items.map(moment => moment.id) || [])
            const reachesContinuation = pageItems.some(moment => continuationIds.has(moment.id))
            if (reachesContinuation && cacheEntry.continuation) {
              cacheEntry = {
                items: mergeCachedMoments(
                  cacheEntry.items,
                  mergeCachedMoments(pageItems, cacheEntry.continuation.items),
                ),
                offset: cacheEntry.continuation.offset,
                updateBaseline: cacheEntry.continuation.updateBaseline,
                hasMore: cacheEntry.continuation.hasMore,
                updatedAt: Date.now(),
              }
            }
            else {
              cacheEntry = {
                items: mergeCachedMoments(cacheEntry.items, pageItems),
                offset: responseOffset,
                updateBaseline: response.data?.update_baseline || '',
                hasMore: Boolean(response.data?.has_more)
                  && responseOffset !== cacheEntry.offset,
                updatedAt: Date.now(),
                continuation: response.data?.has_more && responseOffset !== cacheEntry.offset ? cacheEntry.continuation : undefined,
              }
            }
            cacheChanged = true
            if (reachesContinuation)
              break
          }

          if (cacheChanged) {
            const displayed = !request.reset && loadedQuery === queryKey(requestType, requestGroup, requestHostMid) ? loadedItems : []
            cache.saveMomentsCache(requestType, { ...cacheEntry, items: mergeCachedMoments(displayed, cacheEntry.items) })
          }
          // 连续缓存可一次全部展示；存在缺口时仍按 API 原始条数每批推进 100 条。
          const displayEnd = cacheEntry.continuation ? batchEnd : cacheEntry.items.length
          cachedBatch = cacheEntry.items.slice(0, displayEnd)
          wantedFeedBuffer = { ...cacheEntry, items: cacheEntry.items.slice(cachedBatch.length) }
          nextOffset = cacheEntry.offset
          nextUpdateBaseline = cacheEntry.updateBaseline
          hasMore = wantedFeedBuffer.items.length > 0 || cacheEntry.hasMore
        }
      }
      else if (request.filtered) {
      // 过滤开启：每次用户操作最多请求两页原始动态，再交给本地过滤。
        let scanOffset = request.offset
        let scanUpdateBaseline = request.updateBaseline
        let canContinue = true
        const scanned: DataItem[] = []

        while (canContinue && filteredRequestPages < FILTERED_MAX_REQUEST_PAGES) {
          filteredRequestPages += 1
          const response = await api.moment.getMoments({
            type: requestType,
            offset: scanOffset || undefined,
            update_baseline: scanUpdateBaseline || undefined,
            features: MOMENT_FEED_FEATURES,
          }) as MomentResult
          if (!accept(response))
            return

          const pageItems = response.data?.items || []
          scanned.push(...pageItems)
          const responseOffset = response.data?.offset || ''
          scanUpdateBaseline = response.data?.update_baseline || ''
          canContinue = Boolean(response.data?.has_more)
            && responseOffset !== scanOffset
          scanOffset = responseOffset
        }

        // 以整页推进 offset，同一次刷新/手动加载不会在缓存或补屏阶段重置预算。
        rawItems = scanned
        hasMore = canContinue
        nextOffset = scanOffset
        nextUpdateBaseline = scanUpdateBaseline
      }
      else {
        const response = await api.moment.getMoments({
          type: requestType,
          offset: request.offset || undefined,
          update_baseline: request.updateBaseline || undefined,
          features: MOMENT_FEED_FEATURES,
        }) as MomentResult
        if (!accept(response))
          return
        rawItems = response.data?.items || []
        nextOffset = response.data?.offset || ''
        hasMore = Boolean(response.data?.has_more) && rawItems.length > 0 && nextOffset !== request.offset
        nextUpdateBaseline = response.data?.update_baseline || ''
      }

      if (!isCurrent())
        return
      const normalizedItems = cachedBatch ?? rawItems.map(mapMoment)
      if (requestGroup === 'all' && !requestHostMid)
        cache.cacheRegularMomentPage(requestType, normalizedItems, nextOffset, nextUpdateBaseline, hasMore, request.reset)
      const key = queryKey(requestType, requestGroup, requestHostMid)
      loadedItems = request.reset || loadedQuery !== key ? normalizedItems.slice() : mergeCachedMoments(loadedItems, normalizedItems)
      loadedQuery = key
      return { rawItems, normalizedItems, hasMore, nextOffset, nextUpdateBaseline, nextPage: nextPageNumber }
    }
    catch (error) {
      if (isCurrent())
        wantedFeedBuffer = previousBuffer
      throw error
    }
  }
  return {
    read,
    getLoaded: (type: MomentFilter, group: string, hostMid: string) => loadedQuery === queryKey(type, group, hostMid) ? loadedItems : undefined,
    updateMoment(id: string, patch: Partial<DisplayMoment>) {
      const index = loadedItems.findIndex(item => item.id === id)
      if (index < 0)
        return undefined
      const updated = { ...loadedItems[index], ...patch }
      loadedItems[index] = updated
      return updated
    },
    reset: () => {
      wantedFeedBuffer = undefined
      loadedItems = []
      loadedQuery = ''
    },
  }
}
