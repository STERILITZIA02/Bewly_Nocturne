import type { DisplayMoment } from '~/components/MomentCard/types'
import type { DataItem, MomentResult } from '~/models/moment/moment'
import api from '~/utils/api'
import { isExtensionContextInvalidatedError } from '~/utils/messaging'
import { resolveMomentHostFollowState } from '~/utils/momentHostFollowState'

import type { MomentFilter } from './momentFeedTypes'

interface MomentFeedRead {
  reset: boolean
  type: MomentFilter
  hostMid: string
  offset: string
  updateBaseline: string
  page: number
  filtered: boolean
}
const MOMENT_FEED_FEATURES = 'itemOpusStyle,listOnlyfans,opusBigCover,onlyfansVote,decorationCard,onlyfansAssetsV2,forwardListHidden,ugcDelete,onlyfansQaCard'
const FILTERED_MAX_REQUEST_PAGES = 2

/** Owns remote page assembly; presentation never changes its cursor. */
export function createMomentFeedReader(
  mapMoment: (item: DataItem) => DisplayMoment,
) {
  let loadedItems: DisplayMoment[] = []
  let loadedQuery = ''
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
    const requestHostMid = request.hostMid
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
            stalled = hasMore && (pageItems.length === 0 || responseOffset === scanOffset)
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
            type: requestType,
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
          stalled = hasMore && (rawItems.length === 0 || nextOffset === request.offset)
          nextUpdateBaseline = response.data?.update_baseline || ''
          nextPage += 1
        }
        nextPageNumber = nextPage
      }
      else if (request.filtered) {
      // Filtered batches read at most two pages before yielding to the viewport.
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
          }, readOptions) as MomentResult
          if (!accept(response))
            return

          const pageItems = response.data?.items || []
          scanned.push(...pageItems)
          const responseOffset = response.data?.offset || ''
          scanUpdateBaseline = response.data?.update_baseline || ''
          hasMore = Boolean(response.data?.has_more)
          stalled = hasMore && (pageItems.length === 0 || responseOffset === scanOffset)
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
          type: requestType,
          offset: request.offset || undefined,
          update_baseline: request.updateBaseline || undefined,
          features: MOMENT_FEED_FEATURES,
        }, readOptions) as MomentResult
        if (!accept(response))
          return
        rawItems = response.data?.items || []
        nextOffset = response.data?.offset || ''
        hasMore = Boolean(response.data?.has_more)
        stalled = hasMore && (rawItems.length === 0 || nextOffset === request.offset)
        nextUpdateBaseline = response.data?.update_baseline || ''
      }

      if (!isCurrent())
        return
      const normalizedItems = rawItems.map(mapMoment)
      const key = queryKey(requestType, requestHostMid)
      const previous = request.reset || loadedQuery !== key ? [] : loadedItems
      const seen = new Set(previous.map(item => item.id))
      loadedItems = [...previous, ...normalizedItems.filter((item) => {
        if (seen.has(item.id))
          return false
        seen.add(item.id)
        return true
      })]
      loadedQuery = key
      return { rawItems, normalizedItems, hasMore, stalled, nextOffset, nextUpdateBaseline, nextPage: nextPageNumber }
    }
    finally {
      if (pendingRead === controller)
        pendingRead = undefined
    }
  }
  return {
    read,
    restore(items: DisplayMoment[], type: MomentFilter, hostMid: string) {
      loadedItems = items.slice()
      loadedQuery = queryKey(type, hostMid)
    },
    getLoaded: (type: MomentFilter, hostMid: string) => loadedQuery === queryKey(type, hostMid) ? loadedItems : undefined,
    remove(id: string) {
      loadedItems = loadedItems.filter(item => item.id !== id)
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
      loadedQuery = ''
    },
  }
}
