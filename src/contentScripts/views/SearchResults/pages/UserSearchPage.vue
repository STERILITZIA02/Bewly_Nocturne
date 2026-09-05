<script lang="ts" setup>
import { computed, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import Empty from '~/components/Empty.vue'
import UserCard from '~/components/UserCard/UserCard.vue'
import UserCardSkeleton from '~/components/UserCard/UserCardSkeleton.vue'
import { useBewlyApp } from '~/composables/useAppProvider'
import { settings } from '~/logic'

import Pagination from '../components/Pagination.vue'
import { useLoadMore } from '../composables/useLoadMore'
import { usePagination } from '../composables/usePagination'
import { useSearchRequest } from '../composables/useSearchRequest'
import { useUserRelations } from '../composables/useUserRelations'
import { convertUserCardData } from '../searchTransforms'
import type { UserSearchFilters } from '../types'
import { dedupeByKey } from '../utils/searchHelpers'

const props = defineProps<{
  keyword: string
  filters: UserSearchFilters
  initialPage?: number
}>()

const emit = defineEmits<{
  updatePage: [page: number]
}>()

const { t } = useI18n()

function convertSearchUser(user: any) {
  return convertUserCardData(user, index => t('search.user.sample_title', { index }))
}

const { haveScrollbar, handleBackToTop } = useBewlyApp()

// 分页模式：scroll 滚动加载，pagination 翻页
const paginationMode = computed(() => settings.value.searchResultsPaginationMode)

// 用户关系管理
const {
  userRelations,
  batchQueryUserRelations,
  updateUserRelation,
  reset: resetUserRelations,
} = useUserRelations()

// 搜索请求管理
const {
  isLoading,
  error,
  results,
  requestScope,
  search,
  reset: resetSearch,
} = useSearchRequest<any[]>('user')

// 分页管理
const {
  currentPage,
  totalResults,
  totalPages,
  hasMore: paginationHasMore,
  extractPagination,
  updatePage,
  getNextPage,
  reset: resetPagination,
} = usePagination()

// 无限加载管理
const {
  hasMore,
  exhausted,
  requestLoadMore,
  needsManualLoadMore,
  resumeLoadMore,
  handleLoadMoreCompletion,
  setHasMore,
  setExhausted,
  reset: resetLoadMore,
} = useLoadMore(async () => {
  const previousCount = results.value?.length || 0
  const success = await performSearch(true)
  const appendedCount = Math.max(0, (results.value?.length || 0) - previousCount)
  return { success, appendedCount }
}, {
  isLoading: () => isLoading.value,
})

// 监听关键词变化
watch(() => props.keyword, async (newKeyword, oldKeyword) => {
  const normalizedNew = (newKeyword || '').trim()
  const normalizedOld = (oldKeyword || '').trim()

  if (!normalizedNew) {
    resetAll()
    return
  }

  // 关键词变化时才执行
  if (normalizedNew !== normalizedOld) {
    resetAll()
    await performSearch(false)
  }
})

// 组件挂载时立即执行搜索
onMounted(() => {
  const keyword = props.keyword.trim()
  if (keyword) {
    // 如果有初始页码，先设置页码
    if (props.initialPage && props.initialPage > 1) {
      updatePage(props.initialPage)
    }
    performSearch(false)
  }
})

// 监听筛选条件变化
watch(() => props.filters, () => {
  if (!props.keyword.trim())
    return

  resetAll()
  void performSearch(false)
}, { deep: true })

watch(requestScope, () => {
  resetAll()
  if (props.keyword.trim())
    void performSearch(false)
})

const userOrderMap: Record<string, { order: string, order_sort: number }> = {
  '': { order: '', order_sort: 0 },
  'fans': { order: 'fans', order_sort: 0 },
  'fans_desc': { order: 'fans', order_sort: 1 },
  'level': { order: 'level', order_sort: 0 },
  'level_desc': { order: 'level', order_sort: 1 },
}

async function runUserSearch(targetPage: number, isLoadMore: boolean, updateUrl = false): Promise<boolean> {
  const keyword = props.keyword.trim()
  if (!keyword)
    return false
  const previousLength = results.value?.length || 0
  const orderConfig = userOrderMap[props.filters.order] || userOrderMap['']
  return search({
    searchType: 'bili_user',
    keyword,
    page: targetPage,
    pageSize: 30,
    filters: {
      order: orderConfig.order,
      orderSort: orderConfig.order_sort,
      userType: props.filters.userType,
    },
  }, async (response, isCurrent) => {
    const rawData = response.data
    if (!rawData)
      return false
    const incomingList = Array.isArray(rawData.result) ? rawData.result : []
    results.value = isLoadMore
      ? dedupeByKey([...(results.value ?? []), ...incomingList], item => String(item?.mid ?? JSON.stringify(item)))
      : incomingList
    await batchQueryUserRelations(results.value!.map((user: any) => user.mid).filter(Boolean))
    if (!isCurrent())
      return false
    extractPagination(rawData, incomingList.length)
    updatePage(targetPage)
    setHasMore(paginationHasMore.value)
    if (paginationMode.value === 'scroll') {
      const newItems = Math.max((results.value?.length ?? 0) - previousLength, 0)
      setExhausted(incomingList.length === 0 || (newItems <= 0 && targetPage >= totalPages.value))
    }
    if (updateUrl)
      emit('updatePage', targetPage)
    return true
  })
}

async function performSearch(loadMore: boolean): Promise<boolean> {
  const isLoadMore = paginationMode.value === 'scroll' && loadMore
  if (isLoadMore && (isLoading.value || exhausted.value))
    return false
  if (!isLoadMore)
    setExhausted(false)
  const page = isLoadMore ? getNextPage(true) : (currentPage.value || getNextPage(false))
  const success = await runUserSearch(page, isLoadMore)
  if (success && isLoadMore)
    await handleLoadMoreCompletion(haveScrollbar)
  return success
}

function handlePageChange(page: number, updateUrl = true, scrollToTop = true): Promise<boolean> {
  if (paginationMode.value !== 'pagination' || !props.keyword.trim())
    return Promise.resolve(false)
  if (scrollToTop)
    handleBackToTop()
  return runUserSearch(page, false, updateUrl)
}

function refreshCurrentPage() {
  return paginationMode.value === 'pagination'
    ? handlePageChange(currentPage.value, false, false)
    : performSearch(false)
}
async function restorePage(page: number): Promise<boolean> {
  if (page === currentPage.value)
    return true
  if (paginationMode.value === 'pagination')
    return handlePageChange(page, false, false)

  updatePage(page)
  return performSearch(false)
}

function resetAll() {
  resetUserRelations()
  resetSearch()
  resetPagination()
  resetLoadMore()
  results.value = []
}

function handleFollowStateChanged(data: { mid: number, isFollowing: boolean }) {
  updateUserRelation(data.mid, data.isFollowing)
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
  userRelations,
  updateUserRelation,
  currentPage,
  totalPages,
  refreshCurrentPage,
  restorePage,
})
</script>

<template>
  <div class="user-search-page">
    <div v-if="error" class="error-message">
      {{ error }}
    </div>

    <div v-else-if="!isLoading && (!results || results.length === 0)" class="empty-state">
      <Empty :description="t('common.no_data')" />
    </div>

    <div v-else class="user-grid">
      <UserCardSkeleton
        v-for="index in (isLoading && (!results || results.length === 0) ? 6 : 0)"
        :key="`user-search-initial-skeleton-${index}`"
      />
      <UserCard
        v-for="user in results"
        :key="user.mid"
        v-bind="{
          ...convertSearchUser(user),
          isFollowed: userRelations[user.mid]?.isFollowing ? 1 : 0,
        }"
        :compact="true"
        @follow-state-changed="(mid: number, isFollowing: boolean) => handleFollowStateChanged({ mid, isFollowing })"
      />
      <UserCardSkeleton
        v-for="index in (isLoading && results && results.length > 0 ? 3 : 0)"
        :key="`user-search-more-skeleton-${index}`"
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

.user-search-page {
  width: 100%;
  padding-bottom: 2rem;
}

.user-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1rem;

  @media (max-width: breakpoints.$grid-lg) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  @media (max-width: breakpoints.$grid-sm) {
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
