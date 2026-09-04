<script setup lang="ts">
import { computed, ref } from 'vue'

import { settings } from '~/logic'

import AllSearchPage from '../pages/AllSearchPage.vue'
import ArticleSearchPage from '../pages/ArticleSearchPage.vue'
import BangumiSearchPage from '../pages/BangumiSearchPage.vue'
import LiveSearchPage from '../pages/LiveSearchPage.vue'
import MediaFtSearchPage from '../pages/MediaFtSearchPage.vue'
import UserSearchPage from '../pages/UserSearchPage.vue'
import VideoSearchPage from '../pages/VideoSearchPage.vue'
import type { SearchCategory } from '../types'

const props = defineProps<{
  currentCategory: SearchCategory
  keyword: string
  videoFilters: {
    order: string
    duration: number
    timeRange: string
    customStartDate: string
    customEndDate: string
  }
  userFilters: {
    order: string
    userType: number
  }
  liveFilters: {
    subCategory: 'all' | 'live_room' | 'live_user'
    roomOrder: string
    userOrder: string
  }
  initialPage: number
}>()

const emit = defineEmits<{
  updatePage: [page: number]
}>()

// Page 组件的 refs
const allPageRef = ref<InstanceType<typeof AllSearchPage>>()
const videoPageRef = ref<InstanceType<typeof VideoSearchPage>>()
const bangumiPageRef = ref<InstanceType<typeof BangumiSearchPage>>()
const mediaFtPageRef = ref<InstanceType<typeof MediaFtSearchPage>>()
const userPageRef = ref<InstanceType<typeof UserSearchPage>>()
const livePageRef = ref<InstanceType<typeof LiveSearchPage>>()
const articlePageRef = ref<InstanceType<typeof ArticleSearchPage>>()

// 当前激活的 Page 组件
const currentPageRef = computed(() => {
  switch (props.currentCategory) {
    case 'all':
      return allPageRef.value
    case 'video':
      return videoPageRef.value
    case 'bangumi':
      return bangumiPageRef.value
    case 'media_ft':
      return mediaFtPageRef.value
    case 'user':
      return userPageRef.value
    case 'live':
      return livePageRef.value
    case 'article':
      return articlePageRef.value
    default:
      return null
  }
})

const canManuallyLoadMore = computed(() => {
  const page = currentPageRef.value
  if (settings.value.searchResultsPaginationMode !== 'scroll' || !page || page.isLoading || !page.hasMore)
    return false
  return page.needsManualLoadMore
    || ('results' in page && Array.isArray(page.results) && page.results.length === 0 && page.totalResults > 0)
})

// 处理滚动到底部事件
function handleReachBottom() {
  const page = currentPageRef.value
  if (page?.isLoading)
    return

  if (page && page.requestLoadMore) {
    page.requestLoadMore()
  }
}

// 处理页码更新
function handleUpdatePage(page: number) {
  emit('updatePage', page)
}

function refreshCurrentPage(): Promise<boolean> {
  return currentPageRef.value?.refreshCurrentPage?.() ?? Promise.resolve(false)
}

function restoreCurrentPage(page: number): Promise<boolean> {
  return currentPageRef.value?.restorePage?.(page) ?? Promise.resolve(false)
}

// 暴露给父组件
defineExpose({
  handleReachBottom,
  refreshCurrentPage,
  restoreCurrentPage,
})
</script>

<template>
  <div class="search-results-panel">
    <!-- All Search Page -->
    <AllSearchPage
      v-if="currentCategory === 'all'"
      ref="allPageRef"
      :keyword="keyword"
      :filters="videoFilters"
      :initial-page="initialPage"
      @update-page="handleUpdatePage"
    />

    <!-- Video Search Page -->
    <VideoSearchPage
      v-if="currentCategory === 'video'"
      ref="videoPageRef"
      :keyword="keyword"
      :filters="videoFilters"
      :initial-page="initialPage"
      @update-page="handleUpdatePage"
    />

    <!-- Bangumi Search Page -->
    <BangumiSearchPage
      v-if="currentCategory === 'bangumi'"
      ref="bangumiPageRef"
      :keyword="keyword"
      :initial-page="initialPage"
      @update-page="handleUpdatePage"
    />

    <!-- MediaFt Search Page -->
    <MediaFtSearchPage
      v-if="currentCategory === 'media_ft'"
      ref="mediaFtPageRef"
      :keyword="keyword"
      :initial-page="initialPage"
      @update-page="handleUpdatePage"
    />

    <!-- User Search Page -->
    <UserSearchPage
      v-if="currentCategory === 'user'"
      ref="userPageRef"
      :keyword="keyword"
      :filters="userFilters"
      :initial-page="initialPage"
      @update-page="handleUpdatePage"
    />

    <!-- Live Search Page -->
    <LiveSearchPage
      v-if="currentCategory === 'live'"
      ref="livePageRef"
      :keyword="keyword"
      :filters="liveFilters"
      :initial-page="initialPage"
      @update-page="handleUpdatePage"
    />

    <!-- Article Search Page -->
    <ArticleSearchPage
      v-if="currentCategory === 'article'"
      ref="articlePageRef"
      :keyword="keyword"
      :initial-page="initialPage"
      @update-page="handleUpdatePage"
    />
    <div v-if="canManuallyLoadMore" class="search-results-panel__more">
      <Button type="secondary" @click="currentPageRef?.resumeLoadMore()">
        {{ $t('common.load_more') }}
      </Button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.search-results-panel {
  width: 100%;
}

.search-results-panel__more {
  display: flex;
  justify-content: center;
  padding: var(--bew-space-4);
}
</style>
