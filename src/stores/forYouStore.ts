import { defineStore } from 'pinia'

import type { VideoCardDisplayData } from '~/components/VideoCard/types'
import type { HomeTabSnapshot } from '~/composables/useHomeTabState'
import type { RecommendationMode } from '~/logic'
import type { Item as AppVideoItem } from '~/models/video/appForYou'
import type { Item as VideoItem } from '~/models/video/forYou'
import type { AccountId } from '~/utils/accountScope'

export interface VideoElement {
  uniqueId: string
  item?: VideoItem
  displayData?: VideoCardDisplayData
}

export interface AppVideoElement {
  uniqueId: string
  item?: AppVideoItem
  displayData?: VideoCardDisplayData
}

export interface ForYouState {
  accountId: AccountId
  recommendationMode: RecommendationMode
  scrollTop: number
  snapshot: HomeTabSnapshot
}

export const useForYouStore = defineStore('forYou', () => {
  // Only Home hands off one inactive snapshot. Active views consume it, never mirror it.
  const state = shallowRef<ForYouState | null>(null)
  const saveCompleteState = (newState: ForYouState) => {
    state.value = newState
  }
  const takeCompleteState = (accountId: AccountId, mode: RecommendationMode) => {
    if (state.value?.accountId !== accountId || state.value.recommendationMode !== mode)
      return null
    const saved = state.value
    state.value = null
    return saved
  }
  const resetState = () => {
    state.value = null
  }

  return {
    state: readonly(state),
    saveCompleteState,
    takeCompleteState,
    resetState,
  }
})
