<script lang="ts" setup>
import { computed, watch } from 'vue'

import type { Video } from '~/components/VideoCard/types'
import VideoCardGrid from '~/components/VideoCardGrid.vue'
import type { GridLayoutType } from '~/logic'
import { settings } from '~/logic'

import Pagination from '../components/Pagination.vue'
import SearchEmptyState from '../components/SearchEmptyState.vue'
import { useSearchListPage } from '../composables/useSearchListPage'
import { convertLiveRoomData, convertVideoData, isAdVideo } from '../searchTransforms'
import type { SearchLiveResult, SearchVideoResult, VideoSearchFilters } from '../types'
import { buildVideoSearchParams } from '../utils/searchHelpers'

const props = defineProps<{
  keyword: string
  filters: VideoSearchFilters
  initialPage?: number
}>()

const emit = defineEmits<{
  updatePage: [page: number]
}>()

const gridLayout = computed<GridLayoutType>(() => 'adaptive')
const { paginationMode, isLoading, error, results, totalResults, hasMore, requestLoadMore, needsManualLoadMore, resumeLoadMore, currentPage, totalPages, handlePageChange, refreshCurrentPage, restorePage, exhausted, resetAll, performSearch } = useSearchListPage<Video, SearchVideoResult | SearchLiveResult>({
  category: 'video',
  keyword: () => props.keyword,
  initialPage: () => props.initialPage,
  buildRequest: ({ keyword, page, loadMore, context }) => ({
    searchType: 'video',
    keyword,
    page,
    pageSize: 30,
    ...buildVideoSearchParams({ loadMore, context, filters: props.filters }),
  }),
  transformItems: items => items.map(item => ({
    ...(item.type === 'live_room' ? convertLiveRoomData(item as SearchLiveResult) : convertVideoData(item as SearchVideoResult)),
    isAdvertisement: isAdVideo(item),
  })),
  itemKey: item => item.advertisementKey ?? String(item.aid ?? item.bvid ?? item.id ?? item.roomid),
  onPageChange: page => emit('updatePage', page),
})

// Keep accepted results so toggling the shared setting restores cards without another request.
const visibleResults = computed(() => settings.value.blockAds
  ? results.value?.filter(item => !item.isAdvertisement)
  : results.value)

// 监听筛选条件变化
watch(() => props.filters, () => {
  if (!props.keyword.trim())
    return

  if (paginationMode.value === 'pagination') {
    void handlePageChange(1, currentPage.value !== 1, false)
    return
  }

  resetAll()
  void performSearch(false)
}, { deep: true })

// 供 VideoCardGrid 预加载调用
function handleLoadMore() {
  if (paginationMode.value !== 'scroll')
    return
  if (isLoading.value || exhausted.value)
    return

  requestLoadMore()
}

// 暴露给父组件
defineExpose({
  isLoading,
  error,
  results: visibleResults,
  totalResults,
  hasMore,
  requestLoadMore,
  needsManualLoadMore,
  resumeLoadMore,
  currentPage,
  totalPages,
  refreshCurrentPage,
  restorePage,
})
</script>

<template>
  <div class="video-search-page">
    <div v-if="error" class="error-message">
      {{ error }}
    </div>

    <template v-else>
      <VideoCardGrid
        :items="visibleResults || []"
        :grid-layout="gridLayout"
        :loading="isLoading"
        :no-more-content="paginationMode === 'scroll' && !hasMore"
        :request-failed="!!error"
        :transform-item="(video: Video) => video"
        :get-item-key="(video: Video) => video.advertisementKey || video.aid || video.id"
        :empty-description="$t('common.no_data')"
        :show-loading-more-skeleton="true"
        :show-load-more-indicator="false"
        enable-row-padding
        show-preview
        @load-more="handleLoadMore"
      >
        <template #empty>
          <SearchEmptyState :keyword="keyword" category="video" />
        </template>
      </VideoCardGrid>
    </template>

    <!-- 翻页模式 -->
    <Pagination
      v-if="paginationMode === 'pagination'"
      :current-page="currentPage"
      :total-pages="totalPages"
      :loading="isLoading"
      :disabled="isLoading"
      @change="handlePageChange"
    />
  </div>
</template>

<style scoped lang="scss">
.video-search-page {
  width: 100%;
  padding-bottom: var(--bew-space-8);
}

.error-message {
  padding: var(--bew-space-8);
  text-align: center;
  color: var(--bew-error-color);
}
</style>
