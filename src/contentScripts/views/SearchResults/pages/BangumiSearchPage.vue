<script lang="ts" setup>
import '../components/mediaResults.scss'

import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import BangumiCardSkeleton from '~/components/BangumiCard/BangumiCardSkeleton.vue'
import Empty from '~/components/Empty.vue'

import Pagination from '../components/Pagination.vue'
import SearchEmptyState from '../components/SearchEmptyState.vue'
import SearchMediaCard from '../components/SearchMediaCard.vue'
import { useSearchListPage } from '../composables/useSearchListPage'
import { isMediaFtItem } from '../searchTransforms'
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
  category: 'bangumi',
  keyword: () => props.keyword,
  initialPage: () => props.initialPage,
  buildRequest: ({ keyword, page }) => ({ searchType: 'media_bangumi', keyword, page, pageSize: 30 }),
  itemKey: item => String(item?.season_id ?? item?.media_id ?? item?.id ?? JSON.stringify(item)),
  onPageChange: page => emit('updatePage', page),
})

// 将番剧分组为番剧和影视
const bangumiGroups = computed(() => {
  const list = results.value || []
  return {
    bangumi: list.filter(item => !isMediaFtItem(item)),
    movie: list.filter(item => isMediaFtItem(item)),
  }
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
  <div class="bangumi-search-page bew-media-search-page">
    <div v-if="error" class="error-message">
      {{ error }}
    </div>

    <div v-else-if="!isLoading && (!results || results.length === 0)" class="empty-state">
      <SearchEmptyState :keyword="keyword" category="bangumi" />
    </div>

    <div v-else class="bangumi-results" space-y-6>
      <div v-if="isLoading && (!results || results.length === 0)" class="bew-grid-adaptive-poster">
        <BangumiCardSkeleton v-for="index in 4" :key="`bangumi-initial-skeleton-${index}`" />
      </div>
      <div v-if="bangumiGroups.bangumi.length" class="bew-grid-adaptive-poster">
        <SearchMediaCard
          v-for="bangumi in bangumiGroups.bangumi"
          :key="bangumi.season_id || bangumi.media_id || bangumi.id || bangumi.title"
          :item="bangumi"
        />
      </div>
      <div v-if="bangumiGroups.movie.length" space-y-3>
        <h3 text="lg $bew-text-1">
          {{ t('search.categories.media_ft') }}
        </h3>
        <div class="bew-grid-adaptive-poster">
          <SearchMediaCard
            v-for="item in bangumiGroups.movie"
            :key="item.season_id || item.media_id || item.id || item.title"
            :item="item" movie
          />
        </div>
      </div>
      <div v-if="isLoading && results && results.length > 0" class="bew-grid-adaptive-poster">
        <BangumiCardSkeleton v-for="index in 2" :key="`bangumi-more-skeleton-${index}`" />
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
