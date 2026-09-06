import { computed } from 'vue'

import type { HomeTabState } from '~/composables/useHomeTabState'
import type { AppVideoElement, VideoElement } from '~/stores/forYouStore'

import type { RecommendationDataState } from './recommendationState'

export interface RecommendationSnapshot {
  videoList: VideoElement[]
  appVideoList: AppVideoElement[]
  refreshIdx: number
  webFetchRow: number
  webShowlistGroups: string[]
  noMoreContent: boolean
  dataState: RecommendationDataState
}

/** One previous and one next state. Restoring transfers arrays, then releases the consumed snapshot. */
export function useRecommendationHistory(tab: HomeTabState) {
  const back = tab.ref<RecommendationSnapshot | null>('recommendationBack', null)
  const forward = tab.ref<RecommendationSnapshot | null>('recommendationForward', null)
  const copy = (state: RecommendationSnapshot): RecommendationSnapshot => ({
    ...state,
    videoList: state.videoList.slice(),
    appVideoList: state.appVideoList.slice(),
    webShowlistGroups: state.webShowlistGroups.slice(),
  })
  return {
    canUndo: computed(() => back.value !== null),
    canRedo: computed(() => forward.value !== null),
    remember(current: RecommendationSnapshot) {
      back.value = copy(current)
      forward.value = null
    },
    undo(current: RecommendationSnapshot) {
      const target = back.value
      if (!target)
        return null
      forward.value = copy(current)
      back.value = null
      return target
    },
    redo(current: RecommendationSnapshot) {
      const target = forward.value
      if (!target)
        return null
      back.value = copy(current)
      forward.value = null
      return target
    },
    reset() {
      back.value = null
      forward.value = null
    },
  }
}
