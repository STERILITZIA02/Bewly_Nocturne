import type { MaybeRefOrGetter } from 'vue'
import { readonly, ref, shallowRef, toValue, watch } from 'vue'

import { getPageBridgeTargetOrigin, matchesPageBridgeEvent, PAGE_BRIDGE_MESSAGE } from '~/constants/pageBridge'
import type { SearchRecommendationItem } from '~/models/search/defaultRecommendation'
import api from '~/utils/api'
import { debugLog } from '~/utils/debug'
import { getUserID } from '~/utils/main'
import { isExtensionContextInvalidatedError } from '~/utils/messaging'
import { getPageBridgeChannelId } from '~/utils/pageBridgeChannel'

export interface HotSearchItem {
  keyword: string
  show_name: string
  icon: string
}

export type { SearchRecommendationItem } from '~/models/search/defaultRecommendation'

interface SearchExperienceInterest {
  hotSearch: MaybeRefOrGetter<boolean>
  recommendation: MaybeRefOrGetter<boolean>
}

const CACHE_TTL_MS = 8 * 60 * 1000
const REFRESH_INTERVAL_MS = 10 * 60 * 1000

const hotSearchList = shallowRef<HotSearchItem[]>([])
const searchRecommendation = shallowRef<SearchRecommendationItem | null>(null)
const isLoadingHotSearch = ref(false)
const isLoadingSearchRecommendation = ref(false)

let hotSearchUpdatedAt: number | undefined
let hotSearchRequest: Promise<void> | null = null
let recommendationRequest: Promise<void> | null = null
let hotSearchController: AbortController | undefined
let recommendationController: AbortController | undefined
let refreshTimer: ReturnType<typeof setTimeout> | undefined
let hotSearchConsumerCount = 0
let recommendationConsumerCount = 0
let extensionContextInvalidated = false
let recommendationGeneration = 0
let hotSearchGeneration = 0
let recommendationAccount: string | undefined

function hasConsumers() {
  return hotSearchConsumerCount > 0 || recommendationConsumerCount > 0
}

function cancelHotSearch() {
  hotSearchGeneration++
  hotSearchController?.abort()
  hotSearchController = undefined
  hotSearchRequest = null
  isLoadingHotSearch.value = false
}

function cancelRecommendation() {
  recommendationGeneration++
  recommendationController?.abort()
  recommendationController = undefined
  recommendationRequest = null
  isLoadingSearchRecommendation.value = false
}

export async function loadSharedHotSearch(force = false): Promise<void> {
  if (extensionContextInvalidated || hotSearchConsumerCount === 0 || document.hidden)
    return
  if (!force && hotSearchUpdatedAt !== undefined && Date.now() - hotSearchUpdatedAt < CACHE_TTL_MS)
    return
  if (hotSearchRequest)
    return hotSearchRequest

  isLoadingHotSearch.value = true
  const generation = hotSearchGeneration
  const controller = new AbortController()
  hotSearchController = controller
  const request = api.search.getHotSearchList({ limit: 10 }, { signal: controller.signal })
    .then((response) => {
      if (generation === hotSearchGeneration && hotSearchConsumerCount > 0 && response?.code === 0 && Array.isArray(response.data?.trending?.list)) {
        hotSearchList.value = response.data.trending.list.slice(0, 10)
        hotSearchUpdatedAt = Date.now()
      }
    })
    .catch((error) => {
      if (!controller.signal.aborted)
        reportSearchExperienceFailure('hot-search', error)
    })
    .finally(() => {
      if (hotSearchRequest !== request)
        return
      hotSearchRequest = null
      hotSearchController = undefined
      isLoadingHotSearch.value = false
      if (generation !== hotSearchGeneration && hotSearchConsumerCount > 0)
        void loadSharedHotSearch()
    })
  hotSearchRequest = request
  return request
}

export async function loadSharedSearchRecommendation(): Promise<void> {
  if (extensionContextInvalidated || recommendationConsumerCount === 0 || document.hidden)
    return
  const account = getUserID()
  if (account !== recommendationAccount) {
    cancelRecommendation()
    recommendationAccount = account
    searchRecommendation.value = null
  }
  // The background owns the shared recommendation TTL. A second expiry here
  // would refresh the age of an already cached value on every tab activation.
  if (recommendationRequest)
    return recommendationRequest

  isLoadingSearchRecommendation.value = true
  const generation = recommendationGeneration
  const controller = new AbortController()
  recommendationController = controller
  const request = api.search.getDefaultSearchRecommendation({}, { signal: controller.signal })
    .then((response) => {
      if (generation === recommendationGeneration && account === getUserID() && recommendationConsumerCount > 0 && response?.code === 0 && response.data) {
        searchRecommendation.value = response.data
      }
    })
    .catch((error) => {
      if (!controller.signal.aborted)
        reportSearchExperienceFailure('search-recommendation', error)
    })
    .finally(() => {
      if (recommendationRequest !== request)
        return
      recommendationRequest = null
      recommendationController = undefined
      isLoadingSearchRecommendation.value = false
      if ((generation !== recommendationGeneration || account !== getUserID()) && recommendationConsumerCount > 0)
        void loadSharedSearchRecommendation()
    })
  recommendationRequest = request
  return request
}

function handleAccountChange(event: MessageEvent) {
  const channelId = getPageBridgeChannelId()
  const origin = getPageBridgeTargetOrigin()
  if (channelId && origin && matchesPageBridgeEvent(event, { source: window, origin, channelId, type: PAGE_BRIDGE_MESSAGE.ACCOUNT_CHANGED })
    && recommendationAccount !== getUserID()) {
    cancelRecommendation()
    recommendationAccount = getUserID()
    searchRecommendation.value = null
    void loadSharedSearchRecommendation()
  }
}

function clearRefreshTimer() {
  if (refreshTimer !== undefined)
    clearTimeout(refreshTimer)
  refreshTimer = undefined
}

function reportSearchExperienceFailure(endpointName: string, error: unknown) {
  if (isExtensionContextInvalidatedError(error)) {
    extensionContextInvalidated = true
    cancelHotSearch()
    cancelRecommendation()
    clearRefreshTimer()
    return
  }

  debugLog('[SearchExperience] shared request failed', {
    endpointName,
    errorKind: 'network',
  })
}

function scheduleRefresh() {
  if (extensionContextInvalidated || !hasConsumers() || document.hidden) {
    clearRefreshTimer()
    return
  }
  if (refreshTimer !== undefined)
    return

  refreshTimer = setTimeout(async () => {
    refreshTimer = undefined
    await Promise.allSettled([
      hotSearchConsumerCount > 0 ? loadSharedHotSearch(true) : Promise.resolve(),
      recommendationConsumerCount > 0 ? loadSharedSearchRecommendation() : Promise.resolve(),
    ])
    scheduleRefresh()
  }, REFRESH_INTERVAL_MS)
}

function handleVisibilityChange() {
  if (document.hidden) {
    cancelHotSearch()
    cancelRecommendation()
    clearRefreshTimer()
  }
  else {
    void loadSharedHotSearch()
    void loadSharedSearchRecommendation()
    scheduleRefresh()
  }
}

function updateConsumerCounts(previous: { hotSearch: boolean, recommendation: boolean }, next: typeof previous) {
  hotSearchConsumerCount += Number(next.hotSearch) - Number(previous.hotSearch)
  recommendationConsumerCount += Number(next.recommendation) - Number(previous.recommendation)
  if (hotSearchConsumerCount === 0)
    cancelHotSearch()
  if (recommendationConsumerCount === 0)
    cancelRecommendation()

  if (!previous.hotSearch && next.hotSearch)
    void loadSharedHotSearch()
  if (!previous.recommendation && next.recommendation)
    void loadSharedSearchRecommendation()

  if (!previous.hotSearch && !previous.recommendation && hasConsumers()) {
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('message', handleAccountChange)
  }
  if (!hasConsumers()) {
    document.removeEventListener('visibilitychange', handleVisibilityChange)
    window.removeEventListener('message', handleAccountChange)
    clearRefreshTimer()
  }
  else {
    scheduleRefresh()
  }
}

export function acquireSearchExperience(interest: SearchExperienceInterest) {
  let current = { hotSearch: false, recommendation: false }
  const stop = watch(
    [() => Boolean(toValue(interest.hotSearch)), () => Boolean(toValue(interest.recommendation))],
    ([hotSearch, recommendation]) => {
      const next = { hotSearch, recommendation }
      updateConsumerCounts(current, next)
      current = next
    },
    { immediate: true },
  )

  let released = false
  return () => {
    if (released)
      return
    released = true
    stop()
    updateConsumerCounts(current, { hotSearch: false, recommendation: false })
  }
}

export function useSearchExperience() {
  return {
    hotSearchList: readonly(hotSearchList),
    searchRecommendation: readonly(searchRecommendation),
    isLoadingHotSearch: readonly(isLoadingHotSearch),
    isLoadingSearchRecommendation: readonly(isLoadingSearchRecommendation),
  }
}
