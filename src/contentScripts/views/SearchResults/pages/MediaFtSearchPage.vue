<script lang="ts" setup>
import '../components/mediaResults.scss'

import { useI18n } from 'vue-i18n'

import BangumiCardSkeleton from '~/components/BangumiCard/BangumiCardSkeleton.vue'
import Empty from '~/components/Empty.vue'

import Pagination from '../components/Pagination.vue'
import SearchEmptyState from '../components/SearchEmptyState.vue'
import SearchMediaCard from '../components/SearchMediaCard.vue'
import { useSearchListPage } from '../composables/useSearchListPage'
import type { SearchMediaResult } from '../types'

const props = defineProps<{
  keyword: string
  initialPage?: number
}>()

const emit = defineEmits<{
  updatePage: [page: number]
}>()

const { t } = useI18n()

const { paginationMode, isLoading, error, results, totalResults, hasMore, requestLoadMore, needsManualLoadMore, resumeLoadMore, currentPage, totalPages, handlePageChange, refreshCurrentPage, restorePage } = useSearchListPage<SearchMediaResult>({
  category: 'media_ft',
  keyword: () => props.keyword,
  initialPage: () => props.initialPage,
  buildRequest: ({ keyword, page }) => ({ searchType: 'media_ft', keyword, page, pageSize: 30 }),
  itemKey: item => String(item?.season_id ?? item?.media_id ?? item?.id ?? JSON.stringify(item)),
  onPageChange: page => emit('updatePage', page),
})

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
  <div class="media-ft-search-page bew-media-search-page">
    <div v-if="error" class="error-message">
      {{ error }}
    </div>

    <div v-else-if="!isLoading && (!results || results.length === 0)" class="empty-state">
      <SearchEmptyState :keyword="keyword" category="media_ft" />
    </div>

    <div v-else class="media-ft-results">
      <div class="bew-grid-adaptive-poster">
        <BangumiCardSkeleton
          v-for="index in (isLoading && (!results || results.length === 0) ? 4 : 0)"
          :key="`media-ft-initial-skeleton-${index}`"
        />
        <SearchMediaCard
          v-for="item in (results || [])"
          :key="item.season_id || item.media_id || item.id || item.title"
          :item="item" movie
        />
        <BangumiCardSkeleton
          v-for="index in (isLoading && results && results.length > 0 ? 2 : 0)"
          :key="`media-ft-more-skeleton-${index}`"
        />
      </div>
    </div>

    <!-- 滚动加载模式 -->
    <template v-if="paginationMode === 'scroll'">
      <Empty
        v-if="!isLoading && results && results.length > 0 && !hasMore"
        :description="t('common.no_more_content')"
      />
    </template>

    <!-- 翻页模式 -->
    <template v-else>
      <Pagination
        :current-page="currentPage"
        :total-pages="totalPages"
        :loading="isLoading"
        :disabled="isLoading"
        @change="handlePageChange"
      />
    </template>
  </div>
</template>
