import type { MaybeRefOrGetter } from 'vue'
import { readonly, ref, shallowRef, toValue, watch } from 'vue'

import type { SearchRecommendationItem } from '~/models/search/defaultRecommendation'
import api from '~/utils/api'
import { debugLog } from '~/utils/debug'
import { getUserID } from '~/utils/main'
import { isExtensionContextInvalidatedError } from '~/utils/messaging'

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

let hotSearchUpdatedAt = 0
let recommendationUpdatedAt = 0
let hotSearchRequest: Promise<void> | null = null
let recommendationRequest: Promise<void> | null = null
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

export async function loadSharedHotSearch(force = false): Promise<void> {
  if (extensionContextInvalidated || hotSearchConsumerCount === 0 || document.hidden)
    return
  if (!force && hotSearchList.value.length > 0 && Date.now() - hotSearchUpdatedAt < CACHE_TTL_MS)
    return
  if (hotSearchRequest)
    return hotSearchRequest

  isLoadingHotSearch.value = true
  const generation = hotSearchGeneration
  hotSearchRequest = api.search.getHotSearchList({ limit: 10 })
    .then((response) => {
      if (generation === hotSearchGeneration && hotSearchConsumerCount > 0 && response?.code === 0 && Array.isArray(response.data?.trending?.list)) {
        hotSearchList.value = response.data.trending.list.slice(0, 10)
        hotSearchUpdatedAt = Date.now()
      }
    })
    .catch(error => reportSearchExperienceFailure('hot-search', error))
    .finally(() => {
      hotSearchRequest = null
      isLoadingHotSearch.value = false
      if (generation !== hotSearchGeneration && hotSearchConsumerCount > 0)
        void loadSharedHotSearch()
    })
  return hotSearchRequest
}

export async function loadSharedSearchRecommendation(force = false): Promise<void> {
  if (extensionContextInvalidated || recommendationConsumerCount === 0 || document.hidden)
    return
  const account = getUserID()
  if (account !== recommendationAccount) {
    recommendationAccount = account
    recommendationUpdatedAt = 0
    searchRecommendation.value = null
  }
  if (!force && searchRecommendation.value && Date.now() - recommendationUpdatedAt < CACHE_TTL_MS)
    return
  if (recommendationRequest)
    return recommendationRequest

  isLoadingSearchRecommendation.value = true
  const generation = recommendationGeneration
  recommendationRequest = api.search.getDefaultSearchRecommendation()
    .then((response) => {
      if (generation === recommendationGeneration && account === getUserID() && recommendationConsumerCount > 0 && response?.code === 0 && response.data) {
        searchRecommendation.value = response.data
        recommendationUpdatedAt = Date.now()
      }
    })
    .catch(error => reportSearchExperienceFailure('search-recommendation', error))
    .finally(() => {
      recommendationRequest = null
      isLoadingSearchRecommendation.value = false
      if ((generation !== recommendationGeneration || account !== getUserID()) && recommendationConsumerCount > 0)
        void loadSharedSearchRecommendation()
    })
  return recommendationRequest
}

function clearRefreshTimer() {
  if (refreshTimer !== undefined)
    clearTimeout(refreshTimer)
  refreshTimer = undefined
}

function reportSearchExperienceFailure(endpointName: string, error: unknown) {
  if (isExtensionContextInvalidatedError(error)) {
    extensionContextInvalidated = true
    clearRefreshTimer()
    return
  }

  debugLog('[SearchExperience] shared request failed', {
    endpointName,
    errorKind: 'network',
  })
}

function scheduleRefresh() {
  clearRefreshTimer()
  if (extensionContextInvalidated || !hasConsumers() || document.hidden)
    return

  refreshTimer = setTimeout(async () => {
    refreshTimer = undefined
    await Promise.allSettled([
      hotSearchConsumerCount > 0 ? loadSharedHotSearch(true) : Promise.resolve(),
      recommendationConsumerCount > 0 ? loadSharedSearchRecommendation(true) : Promise.resolve(),
    ])
    scheduleRefresh()
  }, REFRESH_INTERVAL_MS)
}

function handleVisibilityChange() {
  if (document.hidden) {
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
    hotSearchGeneration++
  if (recommendationConsumerCount === 0)
    recommendationGeneration++

  if (!previous.hotSearch && next.hotSearch)
    void loadSharedHotSearch()
  if (!previous.recommendation && next.recommendation)
    void loadSharedSearchRecommendation()

  if (!previous.hotSearch && !previous.recommendation && hasConsumers())
    document.addEventListener('visibilitychange', handleVisibilityChange)
  if (!hasConsumers()) {
    document.removeEventListener('visibilitychange', handleVisibilityChange)
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
