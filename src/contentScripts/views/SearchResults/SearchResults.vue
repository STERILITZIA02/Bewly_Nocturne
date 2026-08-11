<script lang="ts" setup>
import { useTitle } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { useBewlyApp } from '~/composables/useAppProvider'
import { useCurrentLocationHref } from '~/composables/useCurrentLocationHref'
import { settings } from '~/logic'
import { useTopBarStore } from '~/stores/topBarStore'

import SearchCategoryTabs from './components/SearchCategoryTabs.vue'
import SearchLiveFilters from './components/SearchLiveFilters.vue'
import SearchResultsPanel from './components/SearchResultsPanel.vue'
import SearchUserFilters from './components/SearchUserFilters.vue'
import SearchVideoFilters from './components/SearchVideoFilters.vue'
import type { LiveSubCategory, SearchCategory, SearchCategoryOption } from './types'
import { buildSearchResultsUrl, parseSearchUrlState } from './utils/searchUrlState'

// 从 URL 读取关键词
function getKeywordFromUrl(): string {
  const urlParams = new URLSearchParams(window.location.search)
  return urlParams.get('keyword') || ''
}

const keyword = ref<string>(getKeywordFromUrl())
const { t } = useI18n()
const normalizedKeyword = computed(() => (keyword.value || '').trim())
const currentLocationHref = useCurrentLocationHref()
let restoringFromUrl = false
let urlRestoreGeneration = 0

// 设置页面标题
const pageTitle = computed(() => {
  if (!normalizedKeyword.value) {
    return t('search.page_title')
  }
  return t('search.results_page_title', { keyword: normalizedKeyword.value })
})
useTitle(pageTitle)

// 从URL读取所有筛选条件
function getFiltersFromUrl() {
  return parseSearchUrlState(new URLSearchParams(window.location.search))
}

// 更新URL参数
function updateUrlParams(params: Record<string, string | number | undefined | null>) {
  if (restoringFromUrl)
    return

  const urlParams = new URLSearchParams(window.location.search)

  Object.entries(params).forEach(([key, value]) => {
    // pn=1 时删除参数，其他默认值也删除
    if (value === undefined || value === null || value === '' || value === 0 || value === 'all' || (key === 'pn' && value === 1)) {
      urlParams.delete(key)
    }
    else {
      urlParams.set(key, String(value))
    }
  })

  const newUrl = buildSearchResultsUrl(window.location.pathname, urlParams, window.location.hash)
  window.history.pushState({}, '', newUrl)
}

const currentCategory = ref<SearchCategory>(getFiltersFromUrl().category)

// 从URL初始化筛选条件
const initialFilters = getFiltersFromUrl()

// 当前页码（响应式，切换tab时重置为1）
const currentPage = ref<number>(initialFilters.page)

// 视频筛选条件（不同步到URL）
const currentVideoOrder = ref<string>('')
const currentDuration = ref<number>(0)
const currentTimeRange = ref<string>('all')
const customStartDate = ref<string>('')
const customEndDate = ref<string>('')

// 用户筛选条件（同步到URL）
const currentUserOrder = ref<string>(initialFilters.userOrder)
const currentUserType = ref<number>(initialFilters.userType)

// 直播筛选条件（同步到URL）
const currentLiveSubCategory = ref<LiveSubCategory>(initialFilters.liveSubCategory)

// 组合过滤器对象
const videoFilters = computed(() => ({
  order: currentVideoOrder.value,
  duration: currentDuration.value,
  timeRange: currentTimeRange.value,
  customStartDate: customStartDate.value,
  customEndDate: customEndDate.value,
}))

const userFilters = computed(() => ({
  order: currentUserOrder.value,
  userType: currentUserType.value,
}))

const liveFilters = computed(() => ({
  subCategory: currentLiveSubCategory.value,
  // Room/user sorting is reserved for a future visible filter UI.
  roomOrder: '',
  userOrder: '',
}))

const { handleReachBottom, handlePageRefresh } = useBewlyApp()
const topBarStore = useTopBarStore()
const { searchKeyword: topBarSearchKeyword } = storeToRefs(topBarStore)

const videoOrderOptions = computed(() => [
  { value: '', label: t('search.filters.order_relevance') },
  { value: 'click', label: t('search.filters.order_most_played') },
  { value: 'pubdate', label: t('search.filters.order_latest') },
  { value: 'dm', label: t('search.filters.order_most_danmaku') },
  { value: 'stow', label: t('search.filters.order_most_favorited') },
])

const durationOptions = computed(() => [
  { value: 0, label: t('search.filters.duration_all') },
  { value: 1, label: t('search.filters.duration_under_10') },
  { value: 2, label: t('search.filters.duration_10_30') },
  { value: 3, label: t('search.filters.duration_30_60') },
  { value: 4, label: t('search.filters.duration_over_60') },
])

const timeRangeOptions = computed(() => [
  { value: 'all', label: t('search.filters.date_all') },
  { value: 'day', label: t('search.filters.date_day') },
  { value: 'week', label: t('search.filters.date_week') },
  { value: 'halfyear', label: t('search.filters.date_halfyear') },
])

const userOrderOptions = computed(() => [
  { value: '', label: t('search.filters.user_order_default') },
  { value: 'fans', label: t('search.filters.user_order_fans_desc') },
  { value: 'fans_desc', label: t('search.filters.user_order_fans_asc') },
  { value: 'level', label: t('search.filters.user_order_level_desc') },
  { value: 'level_desc', label: t('search.filters.user_order_level_asc') },
])

const userTypeOptions = computed(() => [
  { value: 0, label: t('search.filters.user_type_all') },
  { value: 1, label: t('search.filters.user_type_uploader') },
  { value: 2, label: t('search.filters.user_type_normal') },
  { value: 3, label: t('search.filters.user_type_verified') },
])

const categories = computed<ReadonlyArray<SearchCategoryOption>>(() => [
  { value: 'all', label: t('search.categories.all'), icon: 'i-tabler:search' },
  { value: 'video', label: t('search.categories.video'), icon: 'i-tabler:video' },
  { value: 'bangumi', label: t('search.categories.bangumi'), icon: 'i-tabler:movie' },
  { value: 'media_ft', label: t('search.categories.media_ft'), icon: 'i-tabler:movie-off' },
  { value: 'user', label: t('search.categories.user'), icon: 'i-tabler:user' },
  { value: 'live', label: t('search.categories.live'), icon: 'i-tabler:broadcast' },
  { value: 'article', label: t('search.categories.article'), icon: 'i-tabler:article' },
])

// TODO: 分类数量等待真实聚合接口后再展示。

const searchResultsPanelRef = ref<InstanceType<typeof SearchResultsPanel>>()

// 监听 URL 变化（前进/后退或 pushstate）
async function handleUrlChange() {
  const restoreGeneration = ++urlRestoreGeneration
  const previousKeyword = normalizedKeyword.value
  const previousCategory = currentCategory.value
  const previousPage = currentPage.value
  restoringFromUrl = true
  try {
    const newKeyword = getKeywordFromUrl()
    if (newKeyword !== keyword.value)
      keyword.value = newKeyword

    const filters = getFiltersFromUrl()
    const categoryFromUrl = filters.category

    currentCategory.value = categoryFromUrl
    currentPage.value = filters.page
    currentUserOrder.value = filters.userOrder
    currentUserType.value = filters.userType
    currentLiveSubCategory.value = filters.liveSubCategory
    await nextTick()
    if (restoreGeneration !== urlRestoreGeneration)
      return

    const sameSearch = previousKeyword === normalizedKeyword.value && previousCategory === categoryFromUrl
    if (sameSearch && previousPage !== filters.page) {
      const restored = await searchResultsPanelRef.value?.restoreCurrentPage(filters.page)
      if (restoreGeneration !== urlRestoreGeneration)
        return
      if (!restored) {
        currentPage.value = previousPage
        const params = new URLSearchParams(window.location.search)
        if (previousPage === 1)
          params.delete('pn')
        else
          params.set('pn', String(previousPage))
        history.replaceState({}, '', buildSearchResultsUrl(location.pathname, params, location.hash))
      }
    }
  }
  finally {
    if (restoreGeneration === urlRestoreGeneration)
      restoringFromUrl = false
  }
}

watch(currentLocationHref, () => void handleUrlChange())

// 同步搜索关键词到 topBar
watch(normalizedKeyword, (value) => {
  topBarSearchKeyword.value = value
}, { immediate: true })

// 监听用户筛选条件变化
watch([currentUserOrder, currentUserType], () => {
  if (restoringFromUrl || !normalizedKeyword.value)
    return

  // 筛选条件变化时重置页码
  currentPage.value = 1

  // 更新URL参数（筛选条件变化时回到第一页）
  updateUrlParams({
    user_order: currentUserOrder.value,
    user_type: currentUserType.value,
    pn: 1,
  })
}, { deep: false })

// 监听直播子分类变化
watch(currentLiveSubCategory, () => {
  if (restoringFromUrl || !normalizedKeyword.value)
    return

  // 筛选条件变化时重置页码
  currentPage.value = 1

  // 更新URL参数（筛选条件变化时回到第一页）
  updateUrlParams({
    search_type: currentLiveSubCategory.value,
    pn: 1,
  })
})

function switchCategory(category: SearchCategory) {
  if (currentCategory.value === category)
    return

  currentCategory.value = category

  // 切换分类时重置页码为1
  currentPage.value = 1

  // 更新URL中的category参数，并清空不相关的筛选参数
  const params = new URLSearchParams(window.location.search)
  params.set('category', category)

  // 切换分类时清除页码参数（回到第一页）
  params.delete('pn')

  // 根据新的category清空不相关的筛选参数
  if (category !== 'user') {
    params.delete('user_order')
    params.delete('user_type')
  }
  if (category !== 'live') {
    params.delete('search_type')
  }

  const newUrl = buildSearchResultsUrl(window.location.pathname, params, window.location.hash)
  window.history.pushState({}, '', newUrl)
}

function handlePageUpdate(page: number) {
  currentPage.value = page
  updateUrlParams({ pn: page })
}

function initPageAction() {
  handleReachBottom.value = () => {
    if (!normalizedKeyword.value)
      return

    // 翻页模式下不触发滚动加载
    if (settings.value.searchResultsPaginationMode === 'pagination')
      return

    if (searchResultsPanelRef.value?.handleReachBottom) {
      searchResultsPanelRef.value.handleReachBottom()
    }
  }

  handlePageRefresh.value = () => {
    // 刷新时保持在搜索结果页，重新触发搜索
    const urlParams = new URLSearchParams(window.location.search)
    const keyword = urlParams.get('keyword')
    if (keyword) {
      void searchResultsPanelRef.value?.refreshCurrentPage()
    }
    else {
      window.location.reload()
    }
  }

  // 使用 App.vue 提供的 handleBackToTop，它会正确处理滚动条实例
  // 不需要重新赋值，直接使用从 useBewlyApp 获取的值即可
}

onMounted(() => {
  // 初始化 URL 参数和筛选条件
  void handleUrlChange()
  // 初始化页面操作
  initPageAction()
})
</script>

<template>
  <div class="search-results-container">
    <SearchCategoryTabs
      :categories="categories"
      :current-category="currentCategory"
      @select="switchCategory"
    />

    <SearchVideoFilters
      v-if="currentCategory === 'video' || currentCategory === 'all'"
      v-model:video-order="currentVideoOrder"
      v-model:duration="currentDuration"
      v-model:time-range="currentTimeRange"
      v-model:custom-start-date="customStartDate"
      v-model:custom-end-date="customEndDate"
      :order-options="videoOrderOptions"
      :duration-options="durationOptions"
      :time-range-options="timeRangeOptions"
    />

    <SearchUserFilters
      v-if="currentCategory === 'user'"
      v-model:order="currentUserOrder"
      v-model:user-type="currentUserType"
      :order-options="userOrderOptions"
      :user-type-options="userTypeOptions"
    />

    <SearchLiveFilters
      v-if="currentCategory === 'live'"
      v-model:sub-category="currentLiveSubCategory"
    />

    <SearchResultsPanel
      ref="searchResultsPanelRef"
      :current-category="currentCategory"
      :keyword="normalizedKeyword"
      :video-filters="videoFilters"
      :user-filters="userFilters"
      :live-filters="liveFilters"
      :initial-page="currentPage"
      @update-page="handlePageUpdate"
    />
  </div>
</template>

<style scoped lang="scss">
.search-results-container {
  padding: 0;
}
</style>
