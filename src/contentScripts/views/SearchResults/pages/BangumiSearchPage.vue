<script lang="ts" setup>
import '../components/mediaResults.scss'

import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import BangumiEpisodeList from '~/components/BangumiEpisodeList/BangumiEpisodeList.vue'
import Empty from '~/components/Empty.vue'
import MediaEpisodeSelect from '~/components/MediaEpisodeSelect/MediaEpisodeSelect.vue'

import MediaHighlightSkeleton from '../components/MediaHighlightSkeleton.vue'
import Pagination from '../components/Pagination.vue'
import SearchEmptyState from '../components/SearchEmptyState.vue'
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
  <div class="bangumi-search-page bew-media-search-page">
    <div v-if="error" class="error-message">
      {{ error }}
    </div>

    <div v-else-if="!isLoading && (!results || results.length === 0)" class="empty-state">
      <SearchEmptyState :keyword="keyword" category="bangumi" />
    </div>

    <div v-else class="bangumi-results" space-y-6>
      <div v-if="isLoading && (!results || results.length === 0)" class="bew-media-result-grid">
        <MediaHighlightSkeleton v-for="index in 4" :key="`bangumi-initial-skeleton-${index}`" />
      </div>
      <div v-if="bangumiGroups.bangumi.length" class="bew-media-result-grid">
        <div
          v-for="bangumi in bangumiGroups.bangumi.map(convertBangumiHighlight)"
          :key="bangumi.id || bangumi.title"
          class="bew-media-result-card"
        >
          <ALink
            class="bew-media-result-cover"
            :href="bangumi.url"
            type="videoCard"
            tabindex="-1"
            aria-hidden="true"
          >
            <img
              :src="bangumi.cover"
              :alt="bangumi.title"
            >
            <div v-if="bangumi.badge?.text || bangumi.capsuleText" class="bew-media-result-badge">
              {{ bangumi.badge?.text || bangumi.capsuleText }}
            </div>
          </ALink>
          <div class="bew-media-result-info">
            <div class="bew-media-result-title">
              {{ bangumi.title }}
            </div>
            <div class="bew-media-result-meta" text="$bew-text-3" flex items-center gap-2>
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
            <div v-if="bangumi.desc" class="bew-media-result-desc">
              {{ bangumi.desc }}
            </div>
            <div v-if="bangumi.tags?.length" class="bew-media-result-tags">
              <span v-for="tag in bangumi.tags" :key="tag">
                {{ tag }}
              </span>
            </div>
            <BangumiEpisodeList
              v-if="bangumi.episodes?.length"
              :episodes="bangumi.episodes ?? []"
            />
            <div class="bew-media-result-actions" flex items-center gap-3>
              <ALink
                class="bew-media-result-button"
                :href="bangumi.url"
                type="videoCard"
                :aria-label="`${bangumi.buttonText || t('search.media.watch_now')}：${bangumi.title}`"
              >
                {{ bangumi.buttonText || t('search.media.watch_now') }}
              </ALink>
            </div>
          </div>
        </div>
      </div>
      <div v-if="bangumiGroups.movie.length" space-y-3>
        <h3 text="lg $bew-text-1" font-medium>
          {{ t('search.categories.media_ft') }}
        </h3>
        <div class="bew-media-result-grid">
          <div
            v-for="item in bangumiGroups.movie.map(convertMediaFtHighlight)"
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
        </div>
      </div>
      <div v-if="isLoading && results && results.length > 0" class="bew-media-result-grid">
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
