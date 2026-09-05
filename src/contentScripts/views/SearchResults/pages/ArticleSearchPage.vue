<script lang="ts" setup>
import { useI18n } from 'vue-i18n'

import ArticleCard from '~/components/ArticleCard/ArticleCard.vue'
import ArticleCardSkeleton from '~/components/ArticleCard/ArticleCardSkeleton.vue'
import Empty from '~/components/Empty.vue'

import Pagination from '../components/Pagination.vue'
import { useSearchListPage } from '../composables/useSearchListPage'
import { convertArticleCardData } from '../searchTransforms'

const props = defineProps<{
  keyword: string
  initialPage?: number
}>()

const emit = defineEmits<{
  updatePage: [page: number]
}>()

const { t } = useI18n()

const { paginationMode, isLoading, error, results, totalResults, hasMore, requestLoadMore, needsManualLoadMore, resumeLoadMore, currentPage, totalPages, handlePageChange, refreshCurrentPage, restorePage } = useSearchListPage<any>({
  category: 'article',
  keyword: () => props.keyword,
  initialPage: () => props.initialPage,
  buildRequest: ({ keyword, page }) => ({ searchType: 'article', keyword, page, pageSize: 30 }),
  itemKey: item => String(item?.id ?? JSON.stringify(item)),
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
  <div class="article-search-page">
    <div v-if="error" class="error-message">
      {{ error }}
    </div>

    <div v-else-if="!isLoading && (!results || results.length === 0)" class="empty-state">
      <Empty :description="t('common.no_data')" />
    </div>

    <div v-else class="article-grid">
      <ArticleCardSkeleton
        v-for="index in (isLoading && (!results || results.length === 0) ? 6 : 0)"
        :key="`article-search-initial-skeleton-${index}`"
      />
      <ArticleCard
        v-for="article in results"
        :key="article.id"
        v-bind="convertArticleCardData(article)"
      />
      <ArticleCardSkeleton
        v-for="index in (isLoading && results && results.length > 0 ? 2 : 0)"
        :key="`article-search-more-skeleton-${index}`"
      />
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

.article-search-page {
  width: 100%;
  padding-bottom: 2rem;
}

.article-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;

  @media (max-width: breakpoints.$grid-md) {
    grid-template-columns: 1fr;
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
