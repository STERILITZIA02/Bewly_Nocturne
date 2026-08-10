import { readonly, ref, shallowRef } from 'vue'

import api from '~/utils/api'

export interface HotSearchItem {
  keyword: string
  show_name: string
  icon: string
}

export interface SearchRecommendationItem {
  seid: string
  id: number
  type: number
  show_name: string
  name: string
  goto_type: number
  goto_value: string
  url: string
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
let consumerCount = 0

export async function loadSharedHotSearch(force = false): Promise<void> {
  if (!force && hotSearchList.value.length > 0 && Date.now() - hotSearchUpdatedAt < CACHE_TTL_MS)
    return
  if (hotSearchRequest)
    return hotSearchRequest

  isLoadingHotSearch.value = true
  hotSearchRequest = api.search.getHotSearchList({ limit: 10 })
    .then((response) => {
      if (response?.code === 0 && Array.isArray(response.data?.trending?.list)) {
        hotSearchList.value = response.data.trending.list.slice(0, 10)
        hotSearchUpdatedAt = Date.now()
      }
    })
    .finally(() => {
      hotSearchRequest = null
      isLoadingHotSearch.value = false
    })
  return hotSearchRequest
}

export async function loadSharedSearchRecommendation(force = false): Promise<void> {
  if (!force && searchRecommendation.value && Date.now() - recommendationUpdatedAt < CACHE_TTL_MS)
    return
  if (recommendationRequest)
    return recommendationRequest

  isLoadingSearchRecommendation.value = true
  recommendationRequest = api.search.getDefaultSearchRecommendation()
    .then((response) => {
      if (response?.code === 0 && response.data) {
        searchRecommendation.value = response.data
        recommendationUpdatedAt = Date.now()
      }
    })
    .finally(() => {
      recommendationRequest = null
      isLoadingSearchRecommendation.value = false
    })
  return recommendationRequest
}

function scheduleRefresh() {
  if (refreshTimer !== undefined)
    clearTimeout(refreshTimer)
  if (consumerCount === 0 || document.hidden)
    return

  refreshTimer = setTimeout(async () => {
    refreshTimer = undefined
    await Promise.allSettled([
      loadSharedHotSearch(true),
      loadSharedSearchRecommendation(true),
    ])
    scheduleRefresh()
  }, REFRESH_INTERVAL_MS)
}

function handleVisibilityChange() {
  if (document.hidden) {
    if (refreshTimer !== undefined) {
      clearTimeout(refreshTimer)
      refreshTimer = undefined
    }
  }
  else {
    scheduleRefresh()
  }
}

export function acquireSearchExperience() {
  consumerCount++
  if (consumerCount === 1) {
    document.addEventListener('visibilitychange', handleVisibilityChange)
    scheduleRefresh()
  }

  let released = false
  return () => {
    if (released)
      return
    released = true
    consumerCount--
    if (consumerCount === 0) {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      if (refreshTimer !== undefined) {
        clearTimeout(refreshTimer)
        refreshTimer = undefined
      }
    }
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
