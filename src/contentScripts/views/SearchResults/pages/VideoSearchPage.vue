<script lang="ts" setup>
import { computed, watch } from 'vue'

import VideoCardGrid from '~/components/VideoCardGrid.vue'
import type { GridLayoutType } from '~/logic'

import Pagination from '../components/Pagination.vue'
import { useSearchListPage } from '../composables/useSearchListPage'
import { convertLiveRoomData, convertVideoData, isAdVideo } from '../searchTransforms'
import type { VideoSearchFilters } from '../types'
import { applyVideoTimeFilter, buildVideoSearchParams } from '../utils/searchHelpers'

const props = defineProps<{
  keyword: string
  filters: VideoSearchFilters
  initialPage?: number
}>()

const emit = defineEmits<{
  updatePage: [page: number]
}>()

const gridLayout = computed<GridLayoutType>(() => 'adaptive')
const { paginationMode, isLoading, error, results, totalResults, hasMore, requestLoadMore, needsManualLoadMore, resumeLoadMore, currentPage, totalPages, handlePageChange, refreshCurrentPage, restorePage, exhausted, resetAll, performSearch } = useSearchListPage<any>({
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
  transformItems: items => applyVideoTimeFilter(items.filter(item => !isAdVideo(item)))
    .map(item => item.type === 'live_room' ? convertLiveRoomData(item) : convertVideoData(item)),
  itemKey: item => String(item.aid ?? item.bvid ?? item.id ?? item.roomid),
  onPageChange: page => emit('updatePage', page),
})

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

// Transform 函数：数据已经转换过了，直接返回
function transformVideo(video: any) {
  return video
}

// 暴露给父组件
defineExpose({
  isLoading,
  error,
  results,
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
        :items="results || []"
        :grid-layout="gridLayout"
        :loading="isLoading"
        :no-more-content="paginationMode === 'scroll' && !hasMore"
        :request-failed="!!error"
        :transform-item="transformVideo"
        :get-item-key="(video: any) => video.aid || video.id"
        :empty-description="$t('common.no_data')"
        :show-loading-more-skeleton="true"
        :show-load-more-indicator="false"
        enable-row-padding
        show-preview
        @load-more="handleLoadMore"
      />
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
  padding-bottom: 2rem;
}

.error-message {
  padding: 2rem;
  text-align: center;
  color: var(--bew-error-color);
}
</style>
