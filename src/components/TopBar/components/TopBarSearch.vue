<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed } from 'vue'

import { useSearchFocusEffect } from '~/composables/useSearchFocusEffect'
import { settings } from '~/logic'
import { useTopBarStore } from '~/stores/topBarStore'
import { isHomePage } from '~/utils/main'
import { shouldUsePluginSearchResultsPage } from '~/utils/searchNavigation'

import { useTopBarInteraction } from '../composables/useTopBarInteraction'

const emit = defineEmits<{
  focusChange: [focused: boolean]
}>()

const { showSearchBar, forceWhiteIcon } = useTopBarInteraction()
const topBarStore = useTopBarStore()
const { searchKeyword } = storeToRefs(topBarStore)
const searchFocusEffect = useSearchFocusEffect()

const useLightText = computed(() => forceWhiteIcon.value && !settings.value.disableFrostedGlass)

const searchBehavior = computed<'navigate' | 'stay'>(() => {
  // 不再在这里决定搜索行为，让 SearchBar 组件自己根据情况判断
  // SearchBar 会根据当前是否在搜索页来决定是否使用 stay 模式
  return 'navigate'
})

function pushKeywordToSearchResultsPage(keyword: string) {
  const normalized = keyword.trim()
  if (!normalized)
    return

  // 如果在首页,直接使用 pushState 更新 URL
  if (isHomePage()) {
    const params = new URLSearchParams(window.location.search)
    params.set('page', 'SearchResults')
    params.set('keyword', normalized)
    // 清除旧的筛选参数，重新搜索时重置筛选条件
    params.delete('category')
    params.delete('pn')
    params.delete('user_order')
    params.delete('user_type')
    params.delete('search_type')
    params.delete('live_room_order')
    params.delete('live_user_order')
    const newUrl = `${window.location.pathname}?${params.toString()}`
    window.history.pushState({}, '', newUrl)
  }
  else {
    // 如果不在首页,跳转到 bilibili.com 主页的搜索结果页
    const params = new URLSearchParams()
    params.set('page', 'SearchResults')
    params.set('keyword', normalized)
    window.location.href = `https://www.bilibili.com/?${params.toString()}`
  }
}

function handleSearch(keyword: string) {
  // 先更新 searchKeyword，确保顶栏搜索框显示正确的值
  searchKeyword.value = keyword

  // 只有在搜索结果页且启用了插件搜索时才使用 pushState 方式
  // 其他情况由 SearchBar 组件的 navigateToSearchResultPage 处理
  if (!shouldUsePluginSearchResultsPage())
    return

  // 检查是否在搜索结果页（通过 URL 参数判断，因为在 TopBar 中无法 inject BEWLY_APP）
  const urlParams = new URLSearchParams(window.location.search)
  const isInSearchResultsPage = urlParams.get('page') === 'SearchResults' && !!urlParams.get('keyword')

  if (!isInSearchResultsPage)
    return

  pushKeywordToSearchResultsPage(keyword)
}
</script>

<template>
  <div flex="inline 1 md:justify-center items-center" w="full" data-top-bar-search>
    <Transition name="slide-out">
      <SearchBar
        v-if="showSearchBar"
        v-model="searchKeyword"
        class="search-bar"
        :darken-on-focus="searchFocusEffect.darkened"
        :blurred-on-focus="searchFocusEffect.blurred"
        :force-light-text="useLightText"
        :show-hot-search="settings.showHotSearchInTopBar"
        :search-behavior="searchBehavior"
        :top-bar-appearance="true"
        :top-bar-mode="true"
        @focus-change="emit('focusChange', $event)"
        @search="handleSearch"
      />
    </Transition>
  </div>
</template>

<style lang="scss" scoped>
@use "../styles/index.scss";
</style>
