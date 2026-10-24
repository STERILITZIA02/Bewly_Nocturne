import { computed } from 'vue'

import type { HomeTabState } from '~/composables/useHomeTabState'
import type { AppVideoElement, VideoElement } from '~/stores/forYouStore'

import type { RecommendationDataState } from './recommendationState'

export interface RecommendationSnapshot {
  videoList: VideoElement[]
  appVideoList: AppVideoElement[]
  appFeedIdx: number
  requestIdentity: string
  appRecentShownKeys: string[]
  refreshIdx: number
  webFetchRow: number
  webShowlistGroups: string[]
  noMoreContent: boolean
  dataState: RecommendationDataState
}

/**
 * One previous and one next state. The lists follow an immutable update
 * contract (every change replaces the array root), so a snapshot shares the
 * accepted arrays and entities instead of copying them.
 */
export function useRecommendationHistory(tab: HomeTabState) {
  const back = tab.shallowRef<RecommendationSnapshot | null>('recommendationBack', null)
  const forward = tab.shallowRef<RecommendationSnapshot | null>('recommendationForward', null)
  return {
    canUndo: computed(() => back.value !== null),
    canRedo: computed(() => forward.value !== null),
    remember(current: RecommendationSnapshot) {
      back.value = current
      forward.value = null
    },
    undo(current: RecommendationSnapshot) {
      const target = back.value
      if (!target)
        return null
      forward.value = current
      back.value = null
      return target
    },
    redo(current: RecommendationSnapshot) {
      const target = forward.value
      if (!target)
        return null
      back.value = current
      forward.value = null
      return target
    },
    reset() {
      back.value = null
      forward.value = null
    },
  }
}
