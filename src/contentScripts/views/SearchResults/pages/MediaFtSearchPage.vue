<script lang="ts" setup>
import { useI18n } from 'vue-i18n'

import Empty from '~/components/Empty.vue'
import MediaEpisodeSelect from '~/components/MediaEpisodeSelect/MediaEpisodeSelect.vue'

import MediaHighlightSkeleton from '../components/MediaHighlightSkeleton.vue'
import Pagination from '../components/Pagination.vue'
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
  <div class="media-ft-search-page">
    <div v-if="error" class="error-message">
      {{ error }}
    </div>

    <div v-else-if="!isLoading && (!results || results.length === 0)" class="empty-state">
      <Empty :description="t('common.no_data')" />
    </div>

    <div v-else class="media-ft-results">
      <div class="media-ft-highlight-grid">
        <MediaHighlightSkeleton
          v-for="index in (isLoading && (!results || results.length === 0) ? 4 : 0)"
          :key="`media-ft-initial-skeleton-${index}`"
        />
        <div
          v-for="item in (results || []).map(convertMediaFtHighlight)"
          :key="item.id || item.title"
          class="media-ft-highlight-card"
        >
          <a
            class="media-ft-highlight-cover"
            :href="item.url"
            target="_blank"
            @click.stop
          >
            <img
              :src="item.cover"
              :alt="item.title"
            >
            <div v-if="item.badge" class="media-ft-highlight-badge">
              {{ item.badge }}
            </div>
          </a>
          <div class="media-ft-highlight-info">
            <div class="media-ft-highlight-title" text="lg $bew-text-1" font-medium>
              {{ item.title }}
            </div>
            <div class="media-ft-highlight-meta" text="sm $bew-text-3" flex items-center gap-2>
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
            <div v-if="item.desc" class="media-ft-highlight-desc">
              {{ item.desc }}
            </div>
            <MediaEpisodeSelect
              v-if="item.episodes && item.episodes.length"
              :episodes="item.episodes"
              :fallback-url="item.url"
            />
            <div class="media-ft-highlight-actions" flex items-center gap-3>
              <a
                class="media-ft-highlight-button"
                :href="item.url"
                target="_blank"
                @click.stop
              >
                {{ t('search.media.watch_now') }}
              </a>
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

<style scoped lang="scss">
@use "../../../../styles/breakpoints";

.media-ft-search-page {
  width: 100%;
  padding-bottom: 2rem;
}

.media-ft-results {
  width: 100%;
}

/* 优化性能：使用固定列数替代 auto-fit */
.media-ft-highlight-grid {
  display: grid;
  gap: 1.5rem;
  grid-template-columns: repeat(2, minmax(0, 1fr));

  @media (max-width: breakpoints.$grid-lg) {
    grid-template-columns: repeat(1, 1fr);
  }

  @media (min-width: breakpoints.$grid-sm) and (max-width: breakpoints.$grid-lg) {
    grid-template-columns: repeat(2, 1fr);
  }
}

.media-ft-highlight-card {
  box-sizing: border-box;
  display: flex;
  gap: 1rem;
  padding: 1rem;
  background: var(--bew-elevated);
  border-radius: var(--bew-card-radius);
  border: 1px solid var(--bew-surface-border-color);
  corner-shape: var(--bew-corner-shape);
}

.media-ft-highlight-cover {
  display: block;
  width: 160px;
  min-width: 160px;
  aspect-ratio: 3 / 4;
  border-radius: var(--bew-media-radius);
  border: 1px solid var(--bew-surface-border-color);
  corner-shape: var(--bew-corner-shape);
  overflow: hidden;
  position: relative;

  img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: inherit;
    corner-shape: inherit;
  }
}

.media-ft-highlight-badge {
  position: absolute;
  top: 0.75rem;
  left: 0.75rem;
  padding: 0.25rem 0.5rem;
  border-radius: var(--bew-badge-radius);
  corner-shape: var(--bew-corner-shape-round);
  background: rgba(0, 0, 0, 0.65);
  color: #fff;
  font-size: var(--bew-font-size-control);
}

.media-ft-highlight-info {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  flex: 1;
}

.media-ft-highlight-desc {
  font-size: var(--bew-font-size-body);
  color: var(--bew-text-2);
  line-height: var(--bew-line-height-body);
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.media-ft-highlight-actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-top: 0.5rem;
}

.media-ft-highlight-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.5rem 1.25rem;
  min-height: var(--bew-control-height);
  border-radius: var(--bew-interactive-radius);
  corner-shape: var(--bew-corner-shape);
  background: var(--bew-theme-color);
  color: var(--bew-on-theme-color);
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-semibold);
  text-decoration: none;
  transition: background-color 0.2s ease;

  &:hover {
    filter: brightness(0.9);
  }
}

.error-message {
  padding: 2rem;
  text-align: center;
  color: var(--bew-error-color);
}

.empty-state {
  padding: 2rem;
  text-align: center;
  color: var(--bew-text-2);
}
</style>
