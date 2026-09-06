import type { Ref } from 'vue'
import { computed } from 'vue'

import { FilterType, useFilter } from '~/composables/useFilter'
import type { HomeTabState } from '~/composables/useHomeTabState'
import { settings } from '~/logic'

export function useRecommendationFilters(tabState: HomeTabState, isWebRecommendationMode: Readonly<Ref<boolean>>) {
  const filterFunc = useFilter(
    ['is_followed'],
    [
      FilterType.duration,
      FilterType.viewCount,
      FilterType.likeCount,
      FilterType.title,
      FilterType.user,
      FilterType.user,
      FilterType.publishTime,
    ],
    [
      ['duration'],
      ['stat', 'view'],
      ['stat', 'like'],
      ['title'],
      ['owner', 'name'],
      ['owner', 'mid'],
      ['pubdate'],
    ],
  )

  const appFilterFunc = useFilter(
    ['bottom_rcmd_reason'],
    [
      FilterType.filterOutVerticalVideos,
      FilterType.duration,
      FilterType.viewCountStr,
      FilterType.title,
      FilterType.user,
      FilterType.user,
    ],
    [
      ['uri'],
      ['player_args', 'duration'],
      ['cover_left_text_1'],
      ['title'],
      ['mask', 'avatar', 'text'],
      ['mask', 'avatar', 'up_id'],
    ],
  )

  const FILTERED_FEED_SAMPLE_SIZE = 100

  const FILTERED_FEED_MIN_RETENTION_RATE = 0.6

  const filteredFeedCandidateCount = tabState.ref('filteredFeedCandidateCount', 0)

  const filteredFeedKeptCount = tabState.ref('filteredFeedKeptCount', 0)

  const hasActiveWebRecommendationFilter = computed(() => settings.value.enableFilterByDuration
    || settings.value.enableFilterByViewCount
    || settings.value.enableFilterByLikeCount
    || settings.value.enableFilterByTitle
    || settings.value.enableFilterByUser
    || settings.value.enableFilterByPublishTime)

  const hasActiveAppRecommendationFilter = computed(() => settings.value.filterOutVerticalVideos
    || settings.value.enableFilterByDuration
    || settings.value.enableFilterByViewCount
    || settings.value.enableFilterByTitle
    || settings.value.enableFilterByUser)

  const hasActiveRecommendationFilter = computed(() => isWebRecommendationMode.value
    ? hasActiveWebRecommendationFilter.value
    : hasActiveAppRecommendationFilter.value)

  const filteredFeedRetentionRate = computed(() => filteredFeedCandidateCount.value > 0
    ? filteredFeedKeptCount.value / filteredFeedCandidateCount.value
    : 1)

  const requiresManualFilteredPaging = computed(() => hasActiveRecommendationFilter.value
    && filteredFeedCandidateCount.value >= FILTERED_FEED_SAMPLE_SIZE
    && filteredFeedRetentionRate.value < FILTERED_FEED_MIN_RETENTION_RATE)

  const recommendationFilterSettingsSignature = computed(() => JSON.stringify([
    settings.value.disableFilterForFollowedUser,
    settings.value.filterOutVerticalVideos,
    settings.value.enableFilterByDuration,
    settings.value.enableFilterByViewCount,
    settings.value.enableFilterByLikeCount,
    settings.value.enableFilterByTitle,
    settings.value.enableFilterByUser,
    settings.value.enableFilterByPublishTime,
    settings.value.filterByDuration,
    settings.value.filterByViewCount,
    settings.value.filterByLikeCount,
    settings.value.filterByPublishTime,
    settings.value.filterByTitle.map(item => item.keyword),
    settings.value.filterByUser.map(item => item.keyword),
  ]))

  function resetFilteredFeedPagingState() {
    filteredFeedCandidateCount.value = 0
    filteredFeedKeptCount.value = 0
  }

  function recordFilteredFeedBatch(candidateCount: number, keptCount: number) {
    if (!hasActiveRecommendationFilter.value)
      return

    filteredFeedCandidateCount.value += candidateCount
    filteredFeedKeptCount.value += keptCount
  }
  return { filterFunc, appFilterFunc, hasActiveWebRecommendationFilter, hasActiveAppRecommendationFilter, hasActiveRecommendationFilter, requiresManualFilteredPaging, recommendationFilterSettingsSignature, resetFilteredFeedPagingState, recordFilteredFeedBatch }
}
