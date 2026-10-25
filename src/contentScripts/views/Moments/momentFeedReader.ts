import type { DisplayMoment } from '~/components/MomentCard/types'
import type { DataItem, MomentResult } from '~/models/moment/moment'
import api from '~/utils/api'
import { isExtensionContextInvalidatedError } from '~/utils/messaging'
import { resolveMomentHostFollowState } from '~/utils/momentHostFollowState'
import type { MomentGap } from '~/utils/momentsReadPosition'
import { fetchNewerMoments, isNotNewerMoment, MOMENTS_LATEST_OFFSET } from '~/utils/momentsReadPosition'

import type { MomentFilter } from './momentFeedTypes'
import { getMomentFeedApiType, isClientFilteredMomentType, keepsMomentItem } from './momentFeedTypes'

interface MomentFeedRead {
  reset: boolean
  type: MomentFilter
  hostMid: string
  offset: string
  updateBaseline: string
  page: number
  filtered: boolean
  advanceRead?: boolean
}
const MOMENT_FEED_FEATURES = 'itemOpusStyle,listOnlyfans,opusBigCover,onlyfansVote,decorationCard,onlyfansAssetsV2,forwardListHidden,ugcDelete,onlyfansQaCard'
const FILTERED_MAX_REQUEST_PAGES = 2

/** Owns remote page assembly; presentation never changes its cursor. */
export function createMomentFeedReader(
  mapMoment: (item: DataItem) => DisplayMoment,
) {
  let loadedItems: DisplayMoment[] = []
  let loadedQuery = ''
  const loadedIds = new Set<string>()
  /** Raw post ids the feed has returned for `loadedQuery`. */
  let seenRawIds = new Set<string>()
  let pendingRead: AbortController | undefined
  const queryKey = (type: MomentFilter, hostMid: string) => `${type}:${hostMid}`
  async function read(request: MomentFeedRead, isRequestCurrent: () => boolean) {
    if (!isRequestCurrent())
      return
    pendingRead?.abort()
    const controller = new AbortController()
    pendingRead = controller
    const readOptions = { signal: controller.signal }
    const isCurrent = () => !controller.signal.aborted && isRequestCurrent()
    const requestType = request.type
    const apiType = getMomentFeedApiType(requestType)
    const preservesVideoBoundary = apiType === 'all' || apiType === 'video'
    const initialOffset = request.offset || (!request.advanceRead && preservesVideoBoundary ? MOMENTS_LATEST_OFFSET : '')
    // A client-side type drops much of each page, so it scans like other filters.
    const filtered = request.filtered || isClientFilteredMomentType(requestType)
    const requestHostMid = request.hostMid
    const key = queryKey(requestType, requestHostMid)
    const resetQuery = request.reset || loadedQuery !== key
    const seenIds = new Set<string>()
    /**
     * Some feeds (uploader, series) leave the offset empty or unchanged, and
     * uploader feeds also page by number, so a page of unseen posts is
     * progress; only empty or repeated pages stall.
     */
    function pageAdvanced(pageItems: DataItem[], responseOffset: string, previousOffset: string) {
      let fresh = false
      for (const item of pageItems) {
        if (!seenIds.has(item.id_str) && (resetQuery || !seenRawIds.has(item.id_str))) {
          seenIds.add(item.id_str)
          fresh = true
        }
      }
      return fresh || (pageItems.length > 0 && responseOffset !== previousOffset)
    }
    let nextPageNumber = request.page
    let filteredRequestPages = 0
    let rawItems: DataItem[] = []
    /** Server-reported continuation; `stalled` marks a page that did not advance it. */
    let hasMore = false
    let stalled = false
    let nextOffset = ''
    let nextUpdateBaseline = ''
    const hostFollowStatePromise = request.reset && requestHostMid
      ? api.user.getRelations({ fids: requestHostMid }, readOptions)
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
      if (!Array.isArray(response.data?.items) || typeof response.data.has_more !== 'boolean')
        throw new Error('Invalid Moments page')
      return true
    }
    try {
      if (requestHostMid) {
      // 按 UP 主筛选：走 feed/all + host_mid，不写入全局全部动态缓存
        let nextPage = nextPageNumber
        if (filtered) {
          let scanOffset = request.offset
          let scanUpdateBaseline = request.updateBaseline
          let canContinue = true
          const scanned: DataItem[] = []

          while (canContinue && filteredRequestPages < FILTERED_MAX_REQUEST_PAGES) {
            filteredRequestPages += 1
            const response = await api.moment.getMomentsByUp({
              host_mid: requestHostMid,
              type: apiType,
              offset: scanOffset || undefined,
              update_baseline: scanUpdateBaseline || undefined,
              page: nextPage,
              platform: 'web',
              features: MOMENT_FEED_FEATURES,
              web_location: '333.1365',
            }, readOptions) as MomentResult
            if (!await keepSelectedHostFilter())
              return { hostUnfollowed: true as const }
            if (!accept(response))
              return

            const pageItems = response.data?.items || []
            scanned.push(...pageItems)
            const responseOffset = response.data?.offset || ''
            scanUpdateBaseline = response.data?.update_baseline || ''
            hasMore = Boolean(response.data?.has_more)
            stalled = hasMore && !pageAdvanced(pageItems, responseOffset, scanOffset)
            canContinue = hasMore && !stalled
            scanOffset = responseOffset
            nextPage += 1
          }

          rawItems = scanned
          nextOffset = scanOffset
          nextUpdateBaseline = scanUpdateBaseline
        }
        else {
          const response = await api.moment.getMomentsByUp({
            host_mid: requestHostMid,
            type: apiType,
            offset: request.offset || undefined,
            update_baseline: request.updateBaseline || undefined,
            page: nextPage,
            platform: 'web',
            features: MOMENT_FEED_FEATURES,
            web_location: '333.1365',
          }, readOptions) as MomentResult
          if (!await keepSelectedHostFilter())
            return { hostUnfollowed: true as const }
          if (!accept(response))
            return
          rawItems = response.data?.items || []
          nextOffset = response.data?.offset || ''
          hasMore = Boolean(response.data?.has_more)
          stalled = hasMore && !pageAdvanced(rawItems, nextOffset, request.offset)
          nextUpdateBaseline = response.data?.update_baseline || ''
          nextPage += 1
        }
        nextPageNumber = nextPage
      }
      else if (filtered) {
      // Filtered batches read at most two pages before yielding to the viewport.
        let scanOffset = initialOffset
        let scanUpdateBaseline = request.updateBaseline
        let canContinue = true
        const scanned: DataItem[] = []

        while (canContinue && filteredRequestPages < (request.advanceRead ? 1 : FILTERED_MAX_REQUEST_PAGES)) {
          filteredRequestPages += 1
          const response = await api.moment.getMoments({
            type: apiType,
            offset: scanOffset || ((!request.advanceRead || filteredRequestPages > 1) && preservesVideoBoundary ? MOMENTS_LATEST_OFFSET : ''),
            update_baseline: scanUpdateBaseline || undefined,
            features: MOMENT_FEED_FEATURES,
          }, readOptions) as MomentResult
          if (!accept(response))
            return

          const pageItems = response.data?.items || []
          scanned.push(...pageItems)
          const responseOffset = response.data?.offset || ''
          scanUpdateBaseline = response.data?.update_baseline || ''
          hasMore = Boolean(response.data?.has_more)
          stalled = hasMore && !pageAdvanced(pageItems, responseOffset, scanOffset)
          canContinue = hasMore && !stalled
          scanOffset = responseOffset
        }

        // 以整页推进 offset，同一次刷新/手动加载不会在缓存或补屏阶段重置预算。
        // An exhausted two-page budget keeps `hasMore`; it is not a server end.
        rawItems = scanned
        nextOffset = scanOffset
        nextUpdateBaseline = scanUpdateBaseline
      }
      else {
        const response = await api.moment.getMoments({
          type: apiType,
          offset: initialOffset,
          update_baseline: request.updateBaseline || undefined,
          features: MOMENT_FEED_FEATURES,
        }, readOptions) as MomentResult
        if (!accept(response))
          return
        rawItems = response.data?.items || []
        nextOffset = response.data?.offset || ''
        hasMore = Boolean(response.data?.has_more)
        stalled = hasMore && !pageAdvanced(rawItems, nextOffset, request.offset)
        nextUpdateBaseline = response.data?.update_baseline || ''
      }

      if (!isCurrent())
        return
      const normalizedItems = rawItems.filter(item => keepsMomentItem(requestType, item)).map(mapMoment)
      if (resetQuery) {
        loadedItems = []
        loadedIds.clear()
        seenRawIds.clear()
      }
      for (const item of normalizedItems) {
        if (!loadedIds.has(item.id)) {
          loadedIds.add(item.id)
          loadedItems.push(item)
        }
      }
      loadedQuery = key
      seenIds.forEach(id => seenRawIds.add(id))
      return { rawItems, normalizedItems, hasMore, stalled, nextOffset, nextUpdateBaseline, nextPage: nextPageNumber }
    }
    finally {
      if (pendingRead === controller)
        pendingRead = undefined
    }
  }
  return {
    read,
    cancel: () => pendingRead?.abort(),
    async readNewer(type: MomentFilter, gap: MomentGap, isRequestCurrent: () => boolean) {
      pendingRead?.abort()
      const controller = new AbortController()
      pendingRead = controller
      const isCurrent = () => !controller.signal.aborted && isRequestCurrent()
      try {
        const result = await fetchNewerMoments(async (offset) => {
          if (!isCurrent())
            throw new Error('Retired Moments request')
          const response = await api.moment.getMoments({ type: getMomentFeedApiType(type), offset, features: MOMENT_FEED_FEATURES }, { signal: controller.signal }) as MomentResult
          if (!isCurrent() || response.code !== 0 || !Array.isArray(response.data?.items) || typeof response.data.has_more !== 'boolean')
            throw new Error('Invalid Moments page')
          return { items: response.data.items, offset: response.data.offset, hasMore: Boolean(response.data.has_more) }
        }, gap, item => item.id_str)
        if (!isCurrent())
          return
        const rawItems = result.items.filter(item => !seenRawIds.has(item.id_str))
        rawItems.forEach(item => seenRawIds.add(item.id_str))
        const normalizedItems = rawItems.filter(item => keepsMomentItem(type, item)).map(mapMoment).filter(item => !loadedIds.has(item.id))
        normalizedItems.forEach(item => loadedIds.add(item.id))
        const insertion = loadedItems.findIndex(item => isNotNewerMoment(item.id, gap.targetId))
        loadedItems.splice(insertion < 0 ? loadedItems.length : insertion, 0, ...normalizedItems)
        return { ...result, rawItems, normalizedItems }
      }
      finally {
        if (pendingRead === controller)
          pendingRead = undefined
      }
    },
    restore(items: DisplayMoment[], type: MomentFilter, hostMid: string) {
      loadedItems = items.slice()
      loadedIds.clear()
      items.forEach(item => loadedIds.add(item.id))
      loadedQuery = queryKey(type, hostMid)
    },
    getLoaded: (type: MomentFilter, hostMid: string) => loadedQuery === queryKey(type, hostMid) ? loadedItems : undefined,
    remove(id: string) {
      loadedItems = loadedItems.filter(item => item.id !== id)
      loadedIds.delete(id)
    },
    updateMoment(id: string, patch: Partial<DisplayMoment>) {
      const index = loadedItems.findIndex(item => item.id === id)
      if (index < 0)
        return undefined
      const updated = { ...loadedItems[index], ...patch }
      loadedItems[index] = updated
      return updated
    },
    reset: () => {
      pendingRead?.abort()
      pendingRead = undefined
      loadedItems = []
      loadedIds.clear()
      loadedQuery = ''
      seenRawIds = new Set()
    },
  }
}
