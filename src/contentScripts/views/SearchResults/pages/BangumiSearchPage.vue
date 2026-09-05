<script lang="ts" setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import BangumiEpisodeList from '~/components/BangumiEpisodeList/BangumiEpisodeList.vue'
import Empty from '~/components/Empty.vue'
import MediaEpisodeSelect from '~/components/MediaEpisodeSelect/MediaEpisodeSelect.vue'

import MediaHighlightSkeleton from '../components/MediaHighlightSkeleton.vue'
import Pagination from '../components/Pagination.vue'
import { useSearchListPage } from '../composables/useSearchListPage'
import { convertBangumiHighlight, convertMediaFtHighlight, isMediaFtItem } from '../searchTransforms'

const props = defineProps<{
  keyword: string
  initialPage?: number
}>()

const emit = defineEmits<{
  updatePage: [page: number]
}>()

const { t } = useI18n()

const { paginationMode, isLoading, error, results, totalResults, hasMore, requestLoadMore, needsManualLoadMore, resumeLoadMore, currentPage, totalPages, handlePageChange, refreshCurrentPage, restorePage } = useSearchListPage<any>({
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
  <div class="bangumi-search-page">
    <div v-if="error" class="error-message">
      {{ error }}
    </div>

    <div v-else-if="!isLoading && (!results || results.length === 0)" class="empty-state">
      <Empty :description="t('common.no_data')" />
    </div>

    <div v-else class="bangumi-results" space-y-6>
      <div v-if="isLoading && (!results || results.length === 0)" class="bangumi-highlight-grid">
        <MediaHighlightSkeleton v-for="index in 4" :key="`bangumi-initial-skeleton-${index}`" />
      </div>
      <div v-if="bangumiGroups.bangumi.length" class="bangumi-highlight-grid">
        <div
          v-for="bangumi in bangumiGroups.bangumi.map(convertBangumiHighlight)"
          :key="bangumi.id || bangumi.title"
          class="bangumi-highlight-card"
        >
          <a
            class="bangumi-highlight-cover"
            :href="bangumi.url"
            target="_blank"
            @click.stop
          >
            <img
              :src="bangumi.cover"
              :alt="bangumi.title"
            >
            <div v-if="bangumi.badge?.text || bangumi.capsuleText" class="bangumi-highlight-badge">
              {{ bangumi.badge?.text || bangumi.capsuleText }}
            </div>
          </a>
          <div class="bangumi-highlight-info">
            <div class="bangumi-highlight-title" text="lg $bew-text-1" font-medium>
              {{ bangumi.title }}
            </div>
            <div class="bangumi-highlight-meta" text="sm $bew-text-3" flex items-center gap-2>
              <span v-if="bangumi.score" text="$bew-theme-foreground" font-bold>
                {{ t('search.media.score', { score: bangumi.score?.toFixed(1) }) }}
              </span>
              <span v-if="bangumi.areas">
                {{ bangumi.areas }}
              </span>
              <span v-if="bangumi.episodeCount">
                {{ t('search.media.episode_count', { count: bangumi.episodeCount }) }}
              </span>
              <span v-if="bangumi.publishDateFormatted">
                {{ t('search.media.premiere', { date: bangumi.publishDateFormatted }) }}
              </span>
            </div>
            <div v-if="bangumi.desc" class="bangumi-highlight-desc">
              {{ bangumi.desc }}
            </div>
            <div v-if="bangumi.tags?.length" class="bangumi-highlight-tags">
              <span v-for="tag in bangumi.tags" :key="tag">
                {{ tag }}
              </span>
            </div>
            <BangumiEpisodeList
              v-if="(bangumi.episodes && bangumi.episodes.length) || bangumi.episodeCount"
              :episodes="bangumi.episodes ?? []"
              :total-episodes="bangumi.episodeCount"
              :fallback-url="bangumi.url"
            />
            <div class="bangumi-highlight-actions" flex items-center gap-3>
              <a
                class="bangumi-highlight-button"
                :href="bangumi.url"
                target="_blank"
                @click.stop
              >
                {{ bangumi.buttonText || t('search.media.watch_now') }}
              </a>
            </div>
          </div>
        </div>
      </div>
      <div v-if="bangumiGroups.movie.length" space-y-3>
        <h3 text="lg $bew-text-1" font-medium>
          {{ t('search.media.other') }}
        </h3>
        <div class="bangumi-highlight-grid">
          <div
            v-for="item in bangumiGroups.movie.map(convertMediaFtHighlight)"
            :key="item.id || item.title"
            class="bangumi-highlight-card"
          >
            <a
              class="bangumi-highlight-cover"
              :href="item.url"
              target="_blank"
              @click.stop
            >
              <img
                :src="item.cover"
                :alt="item.title"
              >
              <div v-if="item.badge" class="bangumi-highlight-badge">
                {{ item.badge }}
              </div>
            </a>
            <div class="bangumi-highlight-info">
              <div class="bangumi-highlight-title" text="lg $bew-text-1" font-medium>
                {{ item.title }}
              </div>
              <div class="bangumi-highlight-meta" text="sm $bew-text-3" flex items-center gap-2>
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
              <div v-if="item.desc" class="bangumi-highlight-desc">
                {{ item.desc }}
              </div>
              <MediaEpisodeSelect
                v-if="item.episodes && item.episodes.length"
                :episodes="item.episodes"
                :fallback-url="item.url"
              />
              <div class="bangumi-highlight-actions" flex items-center gap-3>
                <a
                  class="bangumi-highlight-button"
                  :href="item.url"
                  target="_blank"
                  @click.stop
                >
                  {{ t('search.media.watch_now') }}
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div v-if="isLoading && results && results.length > 0" class="bangumi-highlight-grid">
        <MediaHighlightSkeleton v-for="index in 2" :key="`bangumi-more-skeleton-${index}`" />
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

.bangumi-search-page {
  width: 100%;
  padding-bottom: 2rem;
}

.bangumi-results {
  width: 100%;
}

/* 优化性能：使用固定列数替代 auto-fit */
.bangumi-highlight-grid {
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

.bangumi-highlight-card {
  box-sizing: border-box;
  display: flex;
  gap: 1rem;
  padding: 1rem;
  background: var(--bew-elevated);
  border-radius: var(--bew-card-radius);
  border: 1px solid var(--bew-surface-border-color);
  corner-shape: var(--bew-corner-shape);
}

.bangumi-highlight-cover {
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

.bangumi-highlight-badge {
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

.bangumi-highlight-info {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  flex: 1;
}

.bangumi-highlight-desc {
  font-size: var(--bew-font-size-body);
  color: var(--bew-text-2);
  line-height: var(--bew-line-height-body);
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.bangumi-highlight-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;

  span {
    padding: 0.25rem 0.5rem;
    border-radius: var(--bew-badge-radius);
    corner-shape: var(--bew-corner-shape-round);
    background: var(--bew-fill-1);
    color: var(--bew-text-3);
    font-size: var(--bew-font-size-control);
  }
}

.bangumi-highlight-actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-top: 0.5rem;
}

.bangumi-highlight-button {
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
