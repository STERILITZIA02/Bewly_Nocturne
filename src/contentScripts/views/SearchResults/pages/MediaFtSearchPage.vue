<script lang="ts" setup>
import '../components/mediaResults.scss'

import { useI18n } from 'vue-i18n'

import Empty from '~/components/Empty.vue'
import MediaEpisodeSelect from '~/components/MediaEpisodeSelect/MediaEpisodeSelect.vue'

import MediaHighlightSkeleton from '../components/MediaHighlightSkeleton.vue'
import Pagination from '../components/Pagination.vue'
import SearchEmptyState from '../components/SearchEmptyState.vue'
import { useSearchListPage } from '../composables/useSearchListPage'
import { convertMediaFtHighlight } from '../searchTransforms'

const props = defineProps<{
  keyword: string
  initialPage?: number
}>()

const emit = defineEmits<{
  updatePage: [page: number]
}>()

const { t } = useI18n()

const { paginationMode, isLoading, error, results, totalResults, hasMore, requestLoadMore, needsManualLoadMore, resumeLoadMore, currentPage, totalPages, handlePageChange, refreshCurrentPage, restorePage } = useSearchListPage<any>({
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
      <div class="bew-media-result-grid">
        <MediaHighlightSkeleton
          v-for="index in (isLoading && (!results || results.length === 0) ? 4 : 0)"
          :key="`media-ft-initial-skeleton-${index}`"
        />
        <div
          v-for="item in (results || []).map(convertMediaFtHighlight)"
          :key="item.id || item.title"
          class="bew-media-result-card"
        >
          <ALink
            class="bew-media-result-cover"
            :href="item.url"
            type="videoCard"
            tabindex="-1"
            aria-hidden="true"
          >
            <img
              :src="item.cover"
              :alt="item.title"
            >
            <div v-if="item.badge" class="bew-media-result-badge">
              {{ item.badge }}
            </div>
          </ALink>
          <div class="bew-media-result-info">
            <div class="bew-media-result-title">
              {{ item.title }}
            </div>
            <div class="bew-media-result-meta" text="$bew-text-3" flex items-center gap-2>
              <span v-if="item.score" text="$bew-theme-foreground" font-bold>
                {{ t('search.media.score', { score: item.score?.toFixed(1) }) }}
              </span>
              <span v-if="item.areas">
                {{ item.areas }}
              </span>
              <span v-if="item.styles">
                {{ item.styles }}
              </span>
              <span v-if="item.indexShow">
                {{ item.indexShow }}
              </span>
            </div>
            <div v-if="item.desc" class="bew-media-result-desc">
              {{ item.desc }}
            </div>
            <MediaEpisodeSelect
              v-if="item.episodes && item.episodes.length"
              :episodes="item.episodes"
            />
            <div class="bew-media-result-actions" flex items-center gap-3>
              <ALink
                class="bew-media-result-button"
                :href="item.url"
                type="videoCard"
                :aria-label="`${t('search.media.watch_now')}：${item.title}`"
              >
                {{ t('search.media.watch_now') }}
              </ALink>
            </div>
          </div>
        </div>
        <MediaHighlightSkeleton
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
