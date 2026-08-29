<script setup lang="ts">
import { onClickOutside, useDebounceFn, useElementBounding, useMediaQuery } from '@vueuse/core'
import type { CSSProperties } from 'vue'
import { computed, getCurrentInstance, nextTick, reactive, ref, shallowRef, watch } from 'vue'

import { LAYOUT_BREAKPOINTS } from '~/constants/layout'
import { settings } from '~/logic'
import { acquireSearchExperience, loadSharedHotSearch, useSearchExperience } from '~/logic/searchExperience'
import api from '~/utils/api'
import { debugLog } from '~/utils/debug'
import { isExtensionContextInvalidatedError } from '~/utils/messaging'
import { sanitizeSearchHighlight } from '~/utils/searchHighlight'
import { openSearchResults, resolveSearchNavigationTarget } from '~/utils/searchNavigation'

import SearchFocusOverlay from '../SearchFocusOverlay.vue'
import TagRemoveButton from '../TagRemoveButton.vue'
import type { HistoryItem, SuggestionItem, SuggestionResponse } from './searchHistoryProvider'
import {
  addSearchHistory,
  clearAllSearchHistory,
  getSearchHistory,
  removeSearchHistory,
} from './searchHistoryProvider'

type KeyboardSelectionMode = 'none' | 'suggestions' | 'history'

const props = defineProps<{
  darkenOnFocus?: boolean
  blurredOnFocus?: boolean
  focusedCharacter?: string
  showHotSearch?: boolean
  modelValue?: string
  searchBehavior?: 'navigate' | 'stay'
  topBarMode?: boolean
  topBarAppearance?: boolean
  forceLightText?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  focusChange: [focused: boolean]
  search: [value: string]
}>()

const searchWrapRef = ref<HTMLElement>()
const { left: searchWrapLeft, top: searchWrapTop } = useElementBounding(searchWrapRef)
const keywordRef = ref<HTMLInputElement>()
const searchBarInstanceId = getCurrentInstance()?.uid ?? 0
const suggestionListId = `search-suggestion-list-${searchBarInstanceId}`
const historyListId = `search-history-list-${searchBarInstanceId}`
const searchDropdownId = `search-dropdown-${searchBarInstanceId}`
const isFocus = ref<boolean>(false)
const keyword = ref<string>(props.modelValue ?? '')
const suggestions = reactive<SuggestionItem[]>([])
const selectedIndex = ref<number>(-1)
const keyboardSelectionMode = ref<KeyboardSelectionMode>('none')
const originalKeywordBeforeKeyboardSelection = ref<string>(keyword.value)
const searchHistory = shallowRef<HistoryItem[]>([])
const { hotSearchList, searchRecommendation } = useSearchExperience()
const isNarrowLayout = useMediaQuery(`(max-width: ${LAYOUT_BREAKPOINTS.mobileMax}px)`)

function reportSearchBarFailure(endpointName: string, error: unknown) {
  if (isExtensionContextInvalidatedError(error))
    return

  debugLog('[SearchBar] request failed', {
    endpointName,
    errorKind: 'network',
  })
}

const searchMode = computed(() => props.searchBehavior ?? 'navigate')
const isInPlaceSearch = computed(() => searchMode.value === 'stay')
const visibleHotSearchList = computed(() => {
  const limit = props.topBarMode && isNarrowLayout.value ? 5 : 10
  return hotSearchList.value.slice(0, limit)
})
const topBarAppearanceStyle = computed<CSSProperties | undefined>(() => {
  if (!props.topBarAppearance)
    return undefined

  const foreground = props.forceLightText ? 'white' : 'var(--bew-text-1)'
  return {
    '--b-search-bar-height': 'var(--bew-top-bar-primary-control-height, 46px)',
    '--b-search-bar-normal-color': settings.value.disableFrostedGlass
      ? 'var(--bew-elevated)'
      : 'color-mix(in oklab, var(--bew-elevated-solid), transparent 60%)',
    '--b-search-bar-focus-color': 'var(--bew-elevated)',
    '--b-search-bar-normal-icon-color': foreground,
    '--b-search-bar-normal-text-color': foreground,
    '--b-search-bar-hover-text-color': foreground,
    '--b-search-bar-placeholder-opacity': props.forceLightText ? '0.9' : '0.65',
  } as CSSProperties
})
const narrowTopBarPopupStyle = computed<CSSProperties | undefined>(() => {
  if (!props.topBarMode || !isNarrowLayout.value)
    return undefined

  return {
    position: 'absolute',
    top: `calc(var(--bew-top-bar-height) + 4px - ${searchWrapTop.value}px)`,
    right: 'auto',
    left: `calc(8px - ${searchWrapLeft.value}px)`,
    width: 'calc(100vw - 16px)',
    maxHeight: 'calc(100dvh - var(--bew-top-bar-height) - 12px)',
    marginTop: '0',
  }
})
const visibleKeyboardSelectionMode = computed<KeyboardSelectionMode>(() => {
  if (isFocus.value && keyword.value.trim().length > 0 && suggestions.length !== 0)
    return 'suggestions'
  if (isFocus.value && keyword.value.length === 0 && searchHistory.value.length !== 0)
    return 'history'
  return 'none'
})
const shouldShowSearchDropdown = computed(() => {
  if (!isFocus.value)
    return false

  const hasHotSearch = (props.showHotSearch ?? settings.value.showHotSearchInTopBar) && hotSearchList.value.length > 0
  const hasSearchHistory = searchHistory.value.length !== 0
  if (!hasHotSearch && !hasSearchHistory)
    return false

  return keyword.value.length === 0 || keyboardSelectionMode.value === 'history'
})
const comboboxExpanded = computed(() => (
  isFocus.value && keyword.value.length > 0 && suggestions.length > 0
))
const activeDescendantId = computed(() => {
  if (selectedIndex.value < 0 || keyboardSelectionMode.value !== 'suggestions')
    return undefined
  const value = suggestions[selectedIndex.value]?.value
  return value === undefined ? undefined : getSearchOptionId('suggestions', value)
})

// 计算 placeholder 显示文本
const placeholderText = computed(() => {
  if (settings.value.showSearchRecommendation && searchRecommendation.value) {
    return searchRecommendation.value.show_name || searchRecommendation.value.name
  }
  return ''
})

watch(() => props.modelValue, (value) => {
  const next = value ?? ''
  if (next !== keyword.value) {
    resetKeyboardSelection()
    keyword.value = next
  }
})

watch(keyword, (value) => {
  if (selectedIndex.value === -1)
    originalKeywordBeforeKeyboardSelection.value = value

  if (value !== (props.modelValue ?? ''))
    emit('update:modelValue', value)
})

let searchBarDisposed = false
let focusRequestId = 0
let suggestionRequestId = 0

watch(isFocus, async (focus) => {
  const requestId = ++focusRequestId
  emit('focusChange', focus)

  if (!focus) {
    suggestionRequestId++
    return
  }

  // 延后加载搜索历史
  try {
    const nextHistory = settings.value.enableSearchHistory
      ? await getSearchHistory()
      : []
    if (!searchBarDisposed && isFocus.value && requestId === focusRequestId)
      searchHistory.value = nextHistory
  }
  catch (error) {
    reportSearchBarFailure('search-history', error)
    if (!searchBarDisposed && isFocus.value && requestId === focusRequestId)
      searchHistory.value = []
  }

  // 加载热搜数据
  if (props.showHotSearch ?? settings.value.showHotSearchInTopBar) {
    try {
      await loadSharedHotSearch()
    }
    catch (error) {
      reportSearchBarFailure('hot-search', error)
    }
  }
})

// 点击外部关闭搜索框
onClickOutside(searchWrapRef, () => closeSearch())

const releaseSearchExperience = acquireSearchExperience({
  hotSearch: computed(() => isFocus.value && (props.showHotSearch ?? settings.value.showHotSearchInTopBar)),
  recommendation: computed(() => settings.value.showSearchRecommendation),
})

// 监听搜索历史设置变化
watch(() => settings.value.enableSearchHistory, (enabled) => {
  if (!enabled)
    searchHistory.value = []
})

// 组件卸载时清理定时器
onBeforeUnmount(() => {
  searchBarDisposed = true
  focusRequestId++
  suggestionRequestId++
  emit('focusChange', false)
  releaseSearchExperience()
})

const handleKeywordInput = useDebounceFn(async (term: string, requestId: number) => {
  try {
    const res: SuggestionResponse = await api.search.getSearchSuggestion({ term })
    if (searchBarDisposed || requestId !== suggestionRequestId)
      return

    const nextSuggestions = res?.code === 0 && Array.isArray(res.result?.tag)
      ? res.result.tag
      : []
    const seenValues = new Set<string>()
    const uniqueSuggestions = nextSuggestions.filter((item) => {
      if (seenValues.has(item.value))
        return false
      seenValues.add(item.value)
      return true
    })
    suggestions.splice(0, suggestions.length, ...uniqueSuggestions)
  }
  catch (error) {
    if (!searchBarDisposed && requestId === suggestionRequestId)
      suggestions.length = 0
    reportSearchBarFailure('search-suggestion', error)
  }
}, 200)

function handleNativeInput(event: Event) {
  const value = (event.target as HTMLInputElement).value
  resetKeyboardSelection()
  keyword.value = value
  suggestions.length = 0
  const requestId = ++suggestionRequestId
  if (value.trim())
    handleKeywordInput(value, requestId)
}

function buildKeywordHref(keyword: string) {
  return resolveSearchNavigationTarget(keyword)
}

// 从URL中提取搜索关键词
function extractKeywordFromUrl(url: string): string {
  try {
    const urlObj = new URL(url)
    return urlObj.searchParams.get('keyword') || ''
  }
  catch {
    return ''
  }
}

let lastSubmittedKeyword = ''
let lastSubmittedAt = Number.NEGATIVE_INFINITY

function navigateToSearchResultPage(rawKeyword: string) {
  let normalized = (rawKeyword || keyword.value).trim()

  // 如果输入为空且启用了搜索推荐，使用推荐的搜索词
  if (!normalized && settings.value.showSearchRecommendation && searchRecommendation.value) {
    normalized = extractKeywordFromUrl(searchRecommendation.value.url)
  }

  if (!normalized)
    return

  const submittedAt = performance.now()
  if (normalized === lastSubmittedKeyword && submittedAt - lastSubmittedAt < 500)
    return
  lastSubmittedKeyword = normalized
  lastSubmittedAt = submittedAt

  const persistHistory = settings.value.enableSearchHistory
    ? async () => {
      try {
        const nextHistory = await addSearchHistory({
          value: normalized,
          timestamp: Date.now(),
        })
        if (!searchBarDisposed)
          searchHistory.value = nextHistory
      }
      catch (error) {
        reportSearchBarFailure('search-history-write', error)
      }
    }
    : undefined

  // 如果是就地搜索模式，则 emit 事件（这是组件级别的行为设置）
  if (isInPlaceSearch.value) {
    void persistHistory?.()
    emit('search', normalized)
    isFocus.value = false
    resetKeyboardSelection()
    return
  }

  openSearchResults(buildKeywordHref(normalized), { persistHistory })
  isFocus.value = false
  resetKeyboardSelection()
}

function handleKeywordLinkClick(value: string, event: MouseEvent) {
  // 始终阻止默认行为，使用 navigateToSearchResultPage 来处理所有情况
  event.preventDefault()
  event.stopPropagation()
  void navigateToSearchResultPage(value)
}

async function handleDelete(value: string) {
  searchHistory.value = await removeSearchHistory(value)
}

function getKeyboardSelectionItems(mode: KeyboardSelectionMode) {
  if (mode === 'suggestions')
    return suggestions.map(item => item.value)
  if (mode === 'history')
    return searchHistory.value.map(item => item.value)
  return []
}

function getSearchOptionId(mode: KeyboardSelectionMode, value: string) {
  return `search-${mode}-option-${searchBarInstanceId}-${encodeURIComponent(value)}`
}

function resetKeyboardSelection(options: { restoreKeyword?: boolean } = {}) {
  const { restoreKeyword = false } = options
  const originalKeyword = originalKeywordBeforeKeyboardSelection.value

  selectedIndex.value = -1
  keyboardSelectionMode.value = 'none'

  if (restoreKeyword)
    keyword.value = originalKeyword
}

function getKeyboardSelectionContext() {
  const mode = selectedIndex.value === -1
    ? visibleKeyboardSelectionMode.value
    : keyboardSelectionMode.value

  if (mode === 'none')
    return null

  const items = getKeyboardSelectionItems(mode)
  if (items.length === 0) {
    resetKeyboardSelection()
    return null
  }

  if (selectedIndex.value === -1)
    originalKeywordBeforeKeyboardSelection.value = keyword.value

  keyboardSelectionMode.value = mode
  return { items, mode }
}

function selectPreviousKeyboardOption() {
  const context = getKeyboardSelectionContext()
  if (!context)
    return

  if (selectedIndex.value === -1) {
    selectedIndex.value = context.items.length - 1
  }
  else if (selectedIndex.value === 0) {
    resetKeyboardSelection({ restoreKeyword: true })
    return
  }
  else {
    selectedIndex.value--
  }
  keyword.value = context.items[selectedIndex.value]
}

function selectNextKeyboardOption() {
  const context = getKeyboardSelectionContext()
  if (!context)
    return

  selectedIndex.value = Math.min(selectedIndex.value + 1, context.items.length - 1)
  keyword.value = context.items[selectedIndex.value]
}

function closeSearch(blur = false) {
  if (blur)
    keywordRef.value?.blur()
  isFocus.value = false
  resetKeyboardSelection()
}

function handleComboboxKeyDown(event: KeyboardEvent) {
  if (event.isComposing || event.keyCode === 229)
    return

  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault()
      selectNextKeyboardOption()
      break
    case 'ArrowUp':
      event.preventDefault()
      selectPreviousKeyboardOption()
      break
    case 'Enter':
      if (event.shiftKey)
        return
      event.preventDefault()
      void navigateToSearchResultPage(keyword.value)
      break
    case 'Escape':
      event.preventDefault()
      closeSearch(true)
      break
  }
}

async function handleClearSearchHistory() {
  await clearAllSearchHistory()
  searchHistory.value = []
}

function handleFocusOut(event: FocusEvent) {
  const nextTarget = event.relatedTarget as HTMLElement | null
  if (nextTarget && searchWrapRef.value?.contains(nextTarget))
    return

  isFocus.value = false
  resetKeyboardSelection()
}

function handleClearKeyword() {
  resetKeyboardSelection()
  suggestionRequestId++
  keyword.value = ''
  suggestions.length = 0
  void nextTick(() => keywordRef.value?.focus())
}
</script>

<template>
  <div
    id="search-wrap"
    ref="searchWrapRef"
    :class="{
      'search-wrap--top-bar': topBarMode,
      'search-wrap--focus-overlay': isFocus && (darkenOnFocus || blurredOnFocus),
    }"
    :style="topBarAppearanceStyle"
    w="full"
    max-w="550px"
    pos="relative"
    @focusout="handleFocusOut"
  >
    <SearchFocusOverlay
      :active="!topBarMode && isFocus && Boolean(darkenOnFocus || blurredOnFocus)"
      :darkened="darkenOnFocus"
      :blurred="blurredOnFocus"
      @dismiss="closeSearch(true)"
    />

    <div
      class="search-bar group"
      :class="isFocus ? 'focus' : ''"
      flex="~ items-center" pos="relative"
      h-inherit
    >
      <Transition name="focus-character">
        <img
          v-show="focusedCharacter && isFocus"
          :src="focusedCharacter"
          class="focus-character-image"
          width="100"
          alt=""
        >
      </Transition>

      <input
        ref="keywordRef"
        :value="keyword"
        :placeholder="placeholderText"
        role="combobox"
        :aria-label="$t('search_bar.input_label')"
        aria-autocomplete="list"
        :aria-expanded="comboboxExpanded"
        :aria-controls="suggestionListId"
        :aria-activedescendant="activeDescendantId"
        autocomplete="off"
        autocapitalize="off"
        autocorrect="off"
        class="group"
        enterkeyhint="search"
        name="search"
        p="l-6 r-18 y-3"
        h-inherit
        spellcheck="false"
        text="$b-search-bar-normal-text-color group-focus-within:$b-search-bar-focus-text-color group-hover:$b-search-bar-hover-text-color"
        un-border="1 solid $bew-surface-border-color"
        @focus="isFocus = true"
        @input="handleNativeInput"
        @keydown.stop="handleComboboxKeyDown"
      >
      <button
        v-if="isFocus && keyword"
        type="button"
        :aria-label="$t('search_bar.clear_keyword')"
        pos="absolute right-12" bg="$bew-fill-1 hover:$bew-fill-2" text="xs" rounded="$bew-radius-half"
        p-1
        flex="~ items-center justify-between"
        @click="handleClearKeyword"
      >
        <div i-ic-baseline-clear shrink-0 />
      </button>

      <button
        type="button"
        class="search-submit-btn bew-shape-circle"
        :aria-label="$t('search_bar.submit')"
        p-2
        rounded-full
        text="lg leading-0"
        border-none
        outline-none
        pos="absolute right-6px"
        @click="navigateToSearchResultPage(keyword)"
      >
        <div i-tabler:search block align-middle />
      </button>
    </div>

    <Transition name="slide-in">
      <div
        v-if="shouldShowSearchDropdown"
        :id="searchDropdownId"
        class="search-dropdown bew-popover-surface bew-popover-surface--clip"
        role="region"
        :aria-label="$t('search_bar.search_options_label')"
        :style="narrowTopBarPopupStyle"
      >
        <div class="search-popover__scroll bew-popover__scroll">
          <!-- 热搜区块 -->
          <div
            v-if="(showHotSearch ?? settings.showHotSearchInTopBar) && hotSearchList.length > 0"
            class="hot-search-section"
          >
            <div class="title p-2 pb-0">
              <span>{{ $t('search_bar.hot_search_title') }}</span>
            </div>

            <div class="hot-search-container p-2 grid grid-cols-2 gap-x-4 gap-y-1">
              <ALink
                v-for="(item, index) in visibleHotSearchList" :key="item.keyword"
                :href="buildKeywordHref(item.keyword)"
                type="searchBar"
                :custom-click-event="true"
                class="hot-search-item cursor-pointer duration-300"
                flex items-center gap-2 p="x-2 y-1"
                @click="handleKeywordLinkClick(item.keyword, $event)"
              >
                <span
                  class="index"
                  :class="{
                    'top-1': index === 0,
                    'top-2': index === 1,
                    'top-3': index === 2,
                    'normal': index > 2,
                  }"
                >
                  {{ index + 1 }}
                </span>
                <span class="keyword" text="base $bew-text-1" truncate flex-1>{{ item.show_name }}</span>
                <img
                  v-if="item.icon && !item.icon.includes('.gif')"
                  :src="item.icon"
                  class="hot-search-icon"
                  w-4 h-4 object-contain
                  alt=""
                >
              </ALink>
            </div>
          </div>

          <!-- 分割线 -->
          <div
            v-if="(showHotSearch ?? settings.showHotSearchInTopBar) && hotSearchList.length > 0 && searchHistory.length > 0"
            class="divider"
            mx-2 my-1 h-px bg="$bew-border-color"
          />

          <!-- 搜索历史区块 -->
          <div
            v-if="searchHistory.length !== 0"
            class="history-section"
          >
            <div class="title p-2 pb-0 flex justify-between">
              <span>{{ $t('search_bar.history_title') }}</span>
              <button type="button" class="rounded-2 duration-300 pointer-events-auto cursor-pointer" hover="text-$bew-theme-foreground" text="base $bew-text-2" @click="handleClearSearchHistory">
                {{ $t('search_bar.clear_history') }}
              </button>
            </div>

            <div
              :id="historyListId"
              class="history-item-container p2 flex flex-wrap gap-x-3 gap-y-3"
              role="list"
              :aria-label="$t('search_bar.history_title')"
            >
              <div
                v-for="(item, index) in searchHistory"
                :id="getSearchOptionId('history', item.value)"
                :key="item.timestamp"
                class="history-item group"
                :class="{ active: keyboardSelectionMode === 'history' && selectedIndex === index }"
                role="listitem"
                flex justify-between items-center
              >
                <ALink
                  :href="buildKeywordHref(item.value)"
                  type="searchBar"
                  :custom-click-event="true"
                  class="history-item__link"
                  flex-1
                  @click="handleKeywordLinkClick(item.value, $event)"
                >
                  <span>{{ item.value }}</span>
                </ALink>
                <TagRemoveButton
                  class="history-item__remove"
                  :label="$t('common.operation.remove')"
                  @mousedown.prevent
                  @click.stop.prevent="handleDelete(item.value)"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>

    <Transition name="slide-in">
      <div
        v-if="isFocus && suggestions.length !== 0 && keyword.length > 0"
        class="search-suggestion bew-popover-surface bew-popover-surface--clip"
        :style="narrowTopBarPopupStyle"
      >
        <div
          :id="suggestionListId"
          class="search-popover__scroll bew-popover__scroll"
          role="listbox"
          :aria-label="$t('search_bar.suggestions_label')"
        >
          <div
            v-for="(item, index) in suggestions"
            :id="getSearchOptionId('suggestions', item.value)"
            :key="item.value"
            class="suggestion-item"
            :class="{ active: keyboardSelectionMode === 'suggestions' && selectedIndex === index }"
            role="option"
            :aria-selected="keyboardSelectionMode === 'suggestions' && selectedIndex === index"
            tabindex="-1"
            @click="navigateToSearchResultPage(item.value)"
          >
            <span v-html="sanitizeSearchHighlight(item.name)" />
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style lang="scss" scoped>
@use "../../styles/breakpoints";

::v-deep(.suggest_high_light) {
  --uno: "text-$bew-theme-foreground not-italic";
}

.focus-character-enter-active,
.focus-character-leave-active {
  transition:
    opacity var(--bew-duration-moderate) var(--bew-ease-in-out),
    transform var(--bew-duration-moderate) var(--bew-ease-in-out);
}

.focus-character-enter-from,
.focus-character-leave-to {
  --uno: "transform translate-y-6 opacity-0";
}

#search-wrap {
  min-width: 0;
  max-width: var(--b-search-bar-max-width, 550px);
  height: var(--b-search-bar-height, var(--bew-top-bar-primary-control-height, 46px));

  --b-search-bar-normal-color: var(--bew-content);
  --b-search-bar-focus-color: var(--bew-content-hover);

  --b-search-bar-normal-icon-color: var(--bew-text-1);
  --b-search-bar-hover-icon-color: var(--bew-theme-foreground);
  --b-search-bar-focus-icon-color: var(--bew-theme-foreground);

  --b-search-bar-normal-text-color: var(--bew-text-1);
  --b-search-bar-hover-text-color: var(--bew-text-1);
  --b-search-bar-focus-text-color: var(--bew-text-1);

  &.search-wrap--focus-overlay {
    z-index: var(--bew-z-topbar-interaction);

    .search-bar {
      z-index: 1;
    }
  }

  @mixin card-content {
    --uno: "text-base outline-none w-full bg-$b-search-bar-normal-color border-1 border-$bew-surface-border-color";
    backdrop-filter: var(--bew-filter-glass-1);
  }

  .search-bar::before,
  .search-bar::after {
    content: "";
    position: absolute;
    inset: 0;
    z-index: 1;
    border-radius: var(--b-search-bar-current-radius);
    corner-shape: var(--bew-corner-shape);
    pointer-events: none;
    transition:
      opacity var(--bew-duration-normal) var(--bew-ease-standard),
      border-radius var(--bew-duration-moderate) var(--bew-ease-standard);
  }

  .search-bar::before {
    box-shadow: var(--bew-shadow-2), var(--bew-shadow-edge-glow-1);
    opacity: 1;
  }

  .search-bar::after {
    box-shadow:
      0 0 0 2px var(--bew-theme-focus-ring),
      0 6px 16px var(--bew-theme-color-40),
      inset 0 0 6px var(--bew-theme-color-30);
    opacity: 0;
  }

  .search-bar.focus::before {
    opacity: 0;
  }

  .search-bar.focus::after {
    opacity: 1;
  }

  .search-bar {
    --b-search-bar-current-radius: var(
      --b-search-bar-radius,
      calc(var(--b-search-bar-height, var(--bew-top-bar-primary-control-height, 46px)) / 2)
    );

    &.focus {
      --b-search-bar-current-radius: var(--bew-radius);
    }

    .focus-character-image {
      position: absolute;
      right: 0;
      bottom: var(--bew-space-10);
      z-index: 0;
      display: block;
      width: 100px;
      max-width: none;
      height: auto;
      object-fit: contain;
      pointer-events: none;
    }

    > button {
      z-index: 2;
    }

    input {
      @include card-content;
      appearance: none;
      min-width: 0;
      position: relative;
      z-index: 0;
      border-radius: var(--b-search-bar-current-radius);
      corner-shape: var(--bew-corner-shape);
      transition:
        background-color var(--bew-duration-normal) var(--bew-ease-standard),
        color var(--bew-duration-normal) var(--bew-ease-standard),
        opacity var(--bew-duration-normal) var(--bew-ease-standard),
        border-color var(--bew-duration-normal) var(--bew-ease-standard),
        border-radius var(--bew-duration-moderate) var(--bew-ease-standard);

      &::placeholder {
        color: inherit;
        opacity: var(--b-search-bar-placeholder-opacity, 0.65);
      }

      &:focus {
        --uno: "bg-$b-search-bar-focus-color";
      }
    }

    &.focus input {
      border-color: var(--bew-theme-focus-ring);
    }

    .search-submit-btn {
      position: absolute;
      color: var(--b-search-bar-normal-icon-color);
      background: transparent;
      isolation: isolate;
      transition: color 280ms ease;

      &::before {
        content: "";
        position: absolute;
        left: 50%;
        top: 50%;
        width: 8px;
        height: 8px;
        border-radius: 50%;
        corner-shape: var(--bew-corner-shape-round);
        pointer-events: none;
        z-index: 0;
        background: var(--bew-theme-color);
        filter: blur(4px);
        opacity: 0;
        transform: translate(-50%, -50%) scale(0.25);
        transition:
          transform 420ms cubic-bezier(0.22, 1, 0.36, 1),
          opacity 320ms ease;
      }

      > * {
        position: relative;
        z-index: 1;
      }
    }

    &:hover .search-submit-btn,
    &:focus-within .search-submit-btn,
    .search-submit-btn:hover,
    .search-submit-btn:focus-visible {
      color: var(--b-search-bar-hover-icon-color, var(--bew-theme-foreground));

      &::before {
        opacity: 0.4;
        transform: translate(-50%, -50%) scale(1.1);
      }
    }
  }

  @mixin search-content {
    --uno: "text-base outline-none w-full mt-2 absolute hover:block";
  }

  @mixin search-content-item {
    --uno: "px-4 py-2 w-full rounded-$bew-radius duration-300 cursor-pointer not-first:mt-1 tracking-wider hover:bg-$bew-fill-2";
  }

  .search-dropdown {
    @include search-content;
    --uno: "max-h-420px";
    z-index: var(--bew-z-topbar-interaction);

    .title {
      --uno: "text-lg font-500";
    }

    .hot-search-section {
      .hot-search-container {
        .hot-search-item {
          --uno: "relative cursor-pointer duration-300";
          border-radius: var(--bew-interactive-radius);
          corner-shape: var(--bew-corner-shape);
          transition: background-color var(--bew-duration-normal) var(--bew-ease-standard);

          .hot-search-icon {
            object-fit: contain;
            display: inline-block;
            height: 16px;
            width: auto;
            max-width: 24px;
            vertical-align: baseline;
            flex-shrink: 0;
            position: relative;
            z-index: inherit;
            margin: 0;
            padding: 0;
            border: none;
            background: none;
          }

          .index {
            --uno: "text-xs min-w-4 text-center font-bold";

            &.top-1 {
              --uno: "text-red-500";
            }

            &.top-2 {
              --uno: "text-orange-500";
            }

            &.top-3 {
              --uno: "text-yellow-500";
            }

            &.normal {
              --uno: "text-$bew-text-3";
            }
          }

          .keyword {
            --uno: "text-base truncate flex-1";
          }

          &:hover,
          &:focus-visible {
            background-color: var(--bew-fill-2);
          }
        }
      }
    }

    .divider {
      --uno: "mx-2 my-1 h-px bg-$bew-border-color";
    }

    .history-section {
      .history-item-container {
        .history-item {
          --uno: "relative cursor-pointer duration-300";
          --uno: "py-2 px-6 bg-$bew-fill-1 hover:bg-$bew-theme-color-20 hover:text-$bew-theme-foreground rounded-$bew-radius-half";

          .history-item__link {
            min-width: 0;
            color: inherit;
          }

          .history-item__remove {
            position: absolute;
            top: 0;
            right: 0;
            margin-left: 0;
            opacity: 0;
            transform: scale(0.8);
          }

          &:hover .history-item__remove,
          &:focus-within .history-item__remove {
            opacity: 1;
            transform: scale(1);
          }

          &.active {
            --uno: "bg-$bew-fill-2 text-$bew-theme-foreground shadow-[var(--bew-shadow-1),var(--bew-shadow-edge-glow-1)]";
          }
        }
      }
    }
  }

  .search-suggestion {
    @include search-content;
    --uno: "max-h-420px";
    z-index: var(--bew-z-topbar-interaction);

    .suggestion-item {
      @include search-content-item;

      &.active {
        --uno: "bg-$bew-fill-2 shadow-[var(--bew-shadow-1),var(--bew-shadow-edge-glow-1)]";
      }
    }
  }

  .search-popover__scroll {
    max-height: inherit;
    padding: var(--bew-space-2);
    box-sizing: border-box;
  }

  &.search-wrap--top-bar {
    @media (max-width: breakpoints.$mobile-max) {
      .search-dropdown,
      .search-suggestion {
        max-height: calc(100dvh - var(--bew-top-bar-height) - 12px);
      }

      .search-dropdown .hot-search-container {
        grid-template-columns: minmax(0, 1fr);
      }
    }
  }
}
</style>
