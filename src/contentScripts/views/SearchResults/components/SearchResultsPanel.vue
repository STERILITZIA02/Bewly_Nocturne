<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'

import Button from '~/components/Button.vue'
import { useBewlyApp } from '~/composables/useAppProvider'
import { usePageScrollPositions } from '~/composables/usePageViewState'
import { useReadyPageTransition } from '~/composables/useReadyPageTransition'
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

interface SearchPageHandle {
  isLoading: boolean
  hasMore: boolean
  needsManualLoadMore?: boolean
  results?: unknown[]
  totalResults?: number
  requestLoadMore?: () => unknown
  resumeLoadMore?: () => unknown
  refreshCurrentPage?: () => Promise<boolean>
  restorePage?: (page: number) => Promise<boolean>
}
const pages = { all: AllSearchPage, video: VideoSearchPage, bangumi: BangumiSearchPage, media_ft: MediaFtSearchPage, user: UserSearchPage, live: LiveSearchPage, article: ArticleSearchPage }
const currentPageRef = ref<SearchPageHandle>()
const { scrollViewportRef } = useBewlyApp()
const scrollPositions = usePageScrollPositions('SearchResults:')
const switching = ref(false)
const panelRef = ref<HTMLElement>()
const minHeight = ref<number>()
let displayedKey = `${props.keyword}:${props.currentCategory}`
let pendingScroll: number | undefined
let ready = Promise.resolve(true)
let finishReady: ((value: boolean) => void) | undefined
const pageProps = computed(() => ({
  keyword: props.keyword,
  initialPage: props.initialPage,
  ...(props.currentCategory === 'all' || props.currentCategory === 'video'
    ? { filters: props.videoFilters }
    : props.currentCategory === 'user'
      ? { filters: props.userFilters }
      : props.currentCategory === 'live' ? { filters: props.liveFilters } : {}),
}))
watch(() => props.currentCategory, () => {
  finishReady?.(false)
  ready = new Promise(resolve => finishReady = resolve)
}, { flush: 'sync' })
watch(() => props.keyword, () => {
  displayedKey = `${props.keyword}:${props.currentCategory}`
  pendingScroll = undefined
})
function restoreScroll() {
  if (switching.value || currentPageRef.value?.isLoading || pendingScroll === undefined)
    return
  minHeight.value = undefined
  const top = pendingScroll
  pendingScroll = undefined
  void nextTick(() => {
    if (scrollViewportRef.value)
      scrollViewportRef.value.scrollTop = top
  })
}
const transition = useReadyPageTransition(() => pages[props.currentCategory], async () => {}, {
  onStart() {
    if (!switching.value)
      scrollPositions.set(displayedKey, scrollViewportRef.value?.scrollTop ?? 0)
    switching.value = true
    minHeight.value = panelRef.value?.offsetHeight
  },
  onSwap() {
    displayedKey = `${props.keyword}:${props.currentCategory}`
    pendingScroll = scrollPositions.get(displayedKey) ?? 0
    if (scrollViewportRef.value)
      scrollViewportRef.value.scrollTop = pendingScroll
  },
  onEnter() {
    void nextTick(() => {
      finishReady?.(true)
      finishReady = undefined
    })
  },
  onSettled() {
    switching.value = false
    restoreScroll()
  },
})
watch(() => currentPageRef.value?.isLoading, restoreScroll, { flush: 'post' })
onBeforeUnmount(() => finishReady?.(false))

const canManuallyLoadMore = computed(() => {
  const page = currentPageRef.value
  if (switching.value || settings.value.searchResultsPaginationMode !== 'scroll' || !page || page.isLoading || !page.hasMore)
    return false
  return page.needsManualLoadMore
    || (Array.isArray(page.results) && page.results.length === 0 && (page.totalResults ?? 0) > 0)
})

// 处理滚动到底部事件
function handleReachBottom() {
  const page = currentPageRef.value
  if (switching.value || page?.isLoading)
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
  if (switching.value)
    return Promise.resolve(false)
  return currentPageRef.value?.refreshCurrentPage?.() ?? Promise.resolve(false)
}

async function restoreCurrentPage(page: number): Promise<boolean> {
  const category = props.currentCategory
  if (!await ready || category !== props.currentCategory)
    return false
  await nextTick()
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
  <div ref="panelRef" class="search-results-panel" :style="{ minHeight: minHeight === undefined ? undefined : `${minHeight}px` }">
    <Transition mode="out-in" v-bind="transition">
      <Component :is="pages[currentCategory]" :key="currentCategory" ref="currentPageRef" v-bind="pageProps" @update-page="handleUpdatePage" />
    </Transition>
    <div v-if="canManuallyLoadMore" class="search-results-panel__more">
      <Button type="secondary" @click="currentPageRef?.resumeLoadMore?.()">
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
