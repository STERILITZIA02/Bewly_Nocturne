<script setup lang="ts">
import { onClickOutside, useDebounceFn, useDocumentVisibility, useElementBounding, useMediaQuery } from '@vueuse/core'
import type { CSSProperties } from 'vue'
import { computed, getCurrentInstance, nextTick, reactive, ref, shallowRef, watch } from 'vue'

import ALink from '~/components/ALink.vue'
import SkeletonBlock from '~/components/SkeletonBlock.vue'
import Tooltip from '~/components/Tooltip.vue'
import { usePageDim } from '~/composables/usePageDim'
import type { SearchCommand } from '~/composables/useSearchCommands'
import { useSearchCommands } from '~/composables/useSearchCommands'
import { LAYOUT_BREAKPOINTS } from '~/constants/layout'
import { settings } from '~/logic'
import { useIframePageActive } from '~/logic/iframePageState'
import { vLayoutEditable } from '~/logic/layoutEdit'
import { acquireSearchExperience, loadSharedHotSearch, useSearchExperience } from '~/logic/searchExperience'
import api from '~/utils/api'
import { debugLog } from '~/utils/debug'
import { hasNavigationModifier } from '~/utils/linkNavigation'
import { isInIframe } from '~/utils/main'
import { isExtensionContextInvalidatedError } from '~/utils/messaging'
import { holdAnimation } from '~/utils/motionPriority'
import { getMotionDuration } from '~/utils/motionTiming'
import { prefersReducedMotion } from '~/utils/reducedMotion'
import { sanitizeSearchHighlight } from '~/utils/searchHighlight'
import { openSearchResults, resolveSearchNavigationTarget, shouldUsePluginSearchResultsPage } from '~/utils/searchNavigation'
import type { SearchScope, SearchVideoFilters } from '~/utils/searchUrl'
import { EMPTY_SEARCH_VIDEO_FILTERS, readSearchVideoFilters, SEARCH_SCOPES } from '~/utils/searchUrl'

import TagRemoveButton from '../TagRemoveButton.vue'
import SearchBarFilters from './SearchBarFilters.vue'
import type { HistoryItem, SuggestionItem, SuggestionResponse } from './searchHistoryProvider'
import {
  addSearchHistory,
  clearAllSearchHistory,
  getSearchHistory,
  removeSearchHistory,
} from './searchHistoryProvider'

type SearchOptionKind = 'history' | 'action' | 'hot' | 'suggestions'
interface SearchOption {
  id: string
  run: () => void
  historyValue?: string
}

const props = withDefaults(defineProps<{
  active?: boolean
  focusedCharacter?: string
  showHotSearch?: boolean
  modelValue?: string
  topBarMode?: boolean
  topBarAppearance?: boolean
  forceLightText?: boolean
  layoutEditableId?: string
}>(), { active: true })

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'focusChange': [focused: boolean]
}>()

const HISTORY_DISPLAY_LIMIT = 8

const searchWrapRef = ref<HTMLElement>()
const { left: searchWrapLeft, top: searchWrapTop } = useElementBounding(searchWrapRef)
const keywordRef = ref<HTMLInputElement>()
const searchBarInstanceId = getCurrentInstance()?.uid ?? 0
const suggestionListId = `search-suggestion-list-${searchBarInstanceId}`
const searchDropdownId = `search-dropdown-${searchBarInstanceId}`
const isFocus = ref<boolean>(false)
const keyword = ref<string>(props.modelValue ?? '')
const suggestions = reactive<SuggestionItem[]>([])
const activeIndex = ref<number>(-1)
const searchHistory = shallowRef<HistoryItem[]>([])
const { hotSearchList, searchRecommendation, isLoadingHotSearch } = useSearchExperience()
const historyLoading = ref(false)
const historyChanging = ref(false)
const historyError = ref(false)
const suggestionsLoading = ref(false)
// The scope and video filters the next search opens with (Bilibili's own categories).
const scope = ref<SearchScope>('all')
const filters = shallowRef<SearchVideoFilters>({ ...EMPTY_SEARCH_VIDEO_FILTERS })
const commands = useSearchCommands(keyword)
// True from the panel's enter until its leave finishes, so the capsule stays merged into it while it fades.
const panelShown = ref(false)
let searchBarDisposed = false
let focusRequestId = 0
let suggestionRequestId = 0
let suggestionController: AbortController | undefined
let seededHref = ''
const isNarrowLayout = useMediaQuery(`(max-width: ${LAYOUT_BREAKPOINTS.mobileMax}px)`)
const documentVisibility = useDocumentVisibility()
const iframePageActive = useIframePageActive()
const uiActive = computed(() => props.active !== false && documentVisibility.value === 'visible' && (isInIframe() || !iframePageActive.value))

function reportSearchBarFailure(endpointName: string, error: unknown) {
  if (isExtensionContextInvalidatedError(error))
    return

  debugLog('[SearchBar] request failed', {
    endpointName,
    errorKind: 'network',
  })
}

const showHotSearchSetting = computed(() => props.showHotSearch ?? settings.value.showHotSearchInTopBar)
const hotSearchDisplayLimit = computed(() => props.topBarMode && isNarrowLayout.value ? 5 : 10)
const visibleHotSearchList = computed(() => {
  return hotSearchList.value.slice(0, hotSearchDisplayLimit.value)
})
const visibleHistory = computed(() => searchHistory.value.slice(0, HISTORY_DISPLAY_LIMIT))
const hasKeyword = computed(() => keyword.value.trim().length > 0)
// On a narrow top bar the panel drops below the bar instead of growing out of the capsule.
const panelDetached = computed(() => Boolean(props.topBarMode) && isNarrowLayout.value)
// Dims with the panel's open state, so the page brightens as the panel leaves.
usePageDim(() => isFocus.value && uiActive.value)
const panelMerged = computed(() => panelShown.value && !panelDetached.value)
const showHistorySection = computed(() => !hasKeyword.value && (searchHistory.value.length !== 0 || historyLoading.value || historyError.value))
const showHotSection = computed(() => !hasKeyword.value && showHotSearchSetting.value && (hotSearchList.value.length > 0 || isLoadingHotSearch.value))
const showSuggestionSection = computed(() => hasKeyword.value && (suggestions.length !== 0 || suggestionsLoading.value))
const hasPanelBody = computed(() => showHistorySection.value || showHotSection.value || showSuggestionSection.value || commands.value.length > 0)

const topBarAppearanceStyle = computed<CSSProperties | undefined>(() => {
  if (!props.topBarAppearance)
    return undefined

  // Merged into the solid panel, the capsule reads like the panel's text.
  const foreground = props.forceLightText && !panelMerged.value ? 'white' : 'var(--bew-text-1)'
  return {
    '--b-search-bar-height': 'var(--bew-top-bar-primary-control-height, 46px)',
    '--b-search-bar-normal-color': settings.value.disableFrostedGlass
      ? 'var(--bew-elevated)'
      : 'color-mix(in oklab, var(--bew-elevated-solid), transparent 60%)',
    '--b-search-bar-normal-icon-color': foreground,
    '--b-search-bar-normal-text-color': foreground,
    '--b-search-bar-hover-text-color': foreground,
    '--b-search-bar-placeholder-opacity': props.forceLightText && !panelMerged.value ? '0.9' : '0.65',
  } as CSSProperties
})
const wrapStyle = computed<CSSProperties | undefined>(() => {
  if (!panelShown.value || panelDetached.value)
    return topBarAppearanceStyle.value
  return { ...topBarAppearanceStyle.value, '--search-panel-top': `${searchWrapTop.value}px` } as CSSProperties
})
const narrowTopBarPopupStyle = computed<CSSProperties | undefined>(() => {
  if (!panelDetached.value)
    return undefined

  return {
    top: `calc(var(--bew-top-bar-height) + 4px - ${searchWrapTop.value}px)`,
    left: `calc(8px - ${searchWrapLeft.value}px)`,
    right: 'auto',
    width: 'calc(100vw - 16px)',
    maxHeight: 'calc(100dvh - var(--bew-top-bar-height) - 12px)',
  }
})

function getSearchOptionId(mode: SearchOptionKind, value: string) {
  return `search-${mode}-option-${searchBarInstanceId}-${encodeURIComponent(value)}`
}

// Every row in reading order; the arrow keys walk this list, Enter runs the row.
const options = computed<SearchOption[]>(() => {
  const list: SearchOption[] = []
  const actionOptions = () => commands.value.map(command => ({ id: getSearchOptionId('action', command.key), run: () => runCommand(command) }))
  if (hasKeyword.value) {
    list.push(...actionOptions())
    for (const item of suggestions)
      list.push({ id: getSearchOptionId('suggestions', item.value), run: () => navigateToSearchResultPage(item.value) })
    return list
  }
  if (showHistorySection.value) {
    for (const item of visibleHistory.value)
      list.push({ id: getSearchOptionId('history', item.value), run: () => navigateToSearchResultPage(item.value), historyValue: item.value })
  }
  list.push(...actionOptions())
  if (showHotSection.value) {
    for (const item of visibleHotSearchList.value)
      list.push({ id: getSearchOptionId('hot', item.keyword), run: () => navigateToSearchResultPage(item.keyword) })
  }
  return list
})
const optionIndexById = computed(() => new Map(options.value.map((option, index) => [option.id, index])))
const activeDescendantId = computed(() => options.value[activeIndex.value]?.id)

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
    suggestionRequestId++
    cancelSuggestion()
    suggestions.length = 0
    suggestionsLoading.value = false
    keyword.value = next
  }
})

watch(keyword, (value) => {
  if (value !== (props.modelValue ?? ''))
    emit('update:modelValue', value)
})

function cancelSuggestion() {
  suggestionController?.abort()
  suggestionController = undefined
}

// On Bewly's results page the panel opens on that search's scope and filters;
// elsewhere it starts from the combined results.
function seedSearchScope() {
  if (location.href === seededHref)
    return
  seededHref = location.href
  const params = new URL(location.href).searchParams
  const onResults = params.get('page') === 'SearchResults'
  const category = params.get('category') as SearchScope | null
  scope.value = onResults && category && SEARCH_SCOPES.includes(category) ? category : 'all'
  filters.value = onResults ? readSearchVideoFilters(params) : { ...EMPTY_SEARCH_VIDEO_FILTERS }
}

async function loadHistory(requestId = ++focusRequestId) {
  if (!uiActive.value)
    return
  historyLoading.value = settings.value.enableSearchHistory
  try {
    const nextHistory = settings.value.enableSearchHistory
      ? await getSearchHistory()
      : []
    if (!searchBarDisposed && isFocus.value && requestId === focusRequestId) {
      searchHistory.value = nextHistory
      historyError.value = false
    }
  }
  catch (error) {
    reportSearchBarFailure('search-history', error)
    if (!searchBarDisposed && isFocus.value && requestId === focusRequestId)
      historyError.value = true
  }
  finally {
    if (!searchBarDisposed && requestId === focusRequestId)
      historyLoading.value = false
  }
}

watch(isFocus, async (focus) => {
  const requestId = ++focusRequestId
  emit('focusChange', focus)

  if (!focus) {
    suggestionRequestId++
    cancelSuggestion()
    historyLoading.value = false
    suggestionsLoading.value = false
    return
  }

  seedSearchScope()
  await loadHistory(requestId)

  // 加载热搜数据
  if (searchBarDisposed || !isFocus.value || requestId !== focusRequestId)
    return
  if (showHotSearchSetting.value) {
    try {
      await loadSharedHotSearch()
    }
    catch (error) {
      reportSearchBarFailure('hot-search', error)
    }
  }
})

// 点击外部关闭搜索框
// Blur too: an outside press that takes no focus would leave the caret here, and
// the next click on the input would fire no focus event to reopen the panel.
onClickOutside(searchWrapRef, () => closeSearch(true))

const releaseSearchExperience = acquireSearchExperience({
  hotSearch: computed(() => uiActive.value && isFocus.value && showHotSearchSetting.value),
  recommendation: computed(() => uiActive.value && settings.value.showSearchRecommendation),
})
watch(uiActive, (active) => {
  if (!active) {
    closeSearch(props.active === false)
    suggestionRequestId++
    cancelSuggestion()
    suggestionsLoading.value = false
  }
  else if (keywordRef.value?.matches(':focus')) {
    isFocus.value = true
  }
})

// 监听搜索历史设置变化
watch(() => settings.value.enableSearchHistory, (enabled) => {
  if (!enabled) {
    focusRequestId++
    searchHistory.value = []
    historyError.value = false
    historyLoading.value = false
  }
})

// 组件卸载时清理定时器
onBeforeUnmount(() => {
  searchBarDisposed = true
  focusRequestId++
  suggestionRequestId++
  cancelSuggestion()
  emit('focusChange', false)
  releaseSearchExperience()
})

const handleKeywordInput = useDebounceFn(async (term: string, requestId: number) => {
  if (searchBarDisposed || !uiActive.value || requestId !== suggestionRequestId)
    return
  const controller = new AbortController()
  suggestionController = controller
  try {
    const res: SuggestionResponse = await api.search.getSearchSuggestion({ term }, { signal: controller.signal })
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
    if (!controller.signal.aborted)
      reportSearchBarFailure('search-suggestion', error)
  }
  finally {
    if (!searchBarDisposed && requestId === suggestionRequestId)
      suggestionsLoading.value = false
    if (suggestionController === controller)
      suggestionController = undefined
  }
}, 200)

function handleNativeInput(event: Event) {
  cancelSuggestion()
  const value = (event.target as HTMLInputElement).value
  resetKeyboardSelection()
  keyword.value = value
  suggestions.length = 0
  const requestId = ++suggestionRequestId
  suggestionsLoading.value = uiActive.value && Boolean(value.trim()) && !(event as InputEvent).isComposing
  if (suggestionsLoading.value)
    handleKeywordInput(value, requestId)
}

function buildKeywordHref(keyword: string) {
  return resolveSearchNavigationTarget(keyword, scope.value, filters.value)
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

  openSearchResults(buildKeywordHref(normalized), {
    // The destination owns plugin-search history, including a full navigation
    // from video pages. Native search retains its own search-history handling.
    persistHistory: shouldUsePluginSearchResultsPage() ? undefined : persistHistory,
    fromSearchResultsTopBar: props.topBarMode,
  })
  closeSearch(true)
}

function handleKeywordLinkClick(value: string, event: MouseEvent) {
  if (event.button !== 0 || hasNavigationModifier(event))
    return
  event.preventDefault()
  event.stopPropagation()
  void navigateToSearchResultPage(value)
}

function runCommand(command: SearchCommand) {
  closeSearch(true)
  command.run()
}

function handleCommandClick(command: SearchCommand, event: MouseEvent) {
  if (command.href && (event.button !== 0 || hasNavigationModifier(event)))
    return
  event.preventDefault()
  runCommand(command)
}

async function changeHistory(operation: () => Promise<HistoryItem[]>) {
  if (historyChanging.value || !settings.value.enableSearchHistory)
    return
  const requestId = ++focusRequestId
  historyLoading.value = false
  historyChanging.value = true
  historyError.value = false
  try {
    const next = await operation()
    if (!searchBarDisposed && requestId === focusRequestId) {
      searchHistory.value = next
      resetKeyboardSelection()
    }
  }
  catch (error) {
    reportSearchBarFailure('search-history-write', error)
    if (!searchBarDisposed && requestId === focusRequestId)
      historyError.value = true
  }
  finally {
    historyChanging.value = false
  }
}

function handleDelete(value: string) {
  return changeHistory(() => removeSearchHistory(value))
}

function resetKeyboardSelection() {
  activeIndex.value = -1
}

function activateOption(id: string) {
  activeIndex.value = optionIndexById.value.get(id) ?? -1
}

// Steps through the rows and back to the input (-1) at either end.
function moveKeyboardSelection(step: 1 | -1) {
  const count = options.value.length
  if (!count)
    return
  const current = Math.min(activeIndex.value, count - 1)
  activeIndex.value = (current + 1 + step + count + 1) % (count + 1) - 1
  const id = activeDescendantId.value
  if (!id)
    return
  void nextTick(() => {
    const row = Array.from(searchWrapRef.value?.querySelectorAll<HTMLElement>('[role="option"]') ?? []).find(element => element.id === id)
    row?.scrollIntoView({ block: 'nearest' })
  })
}

function moveScope(step: 1 | -1) {
  const index = SEARCH_SCOPES.indexOf(scope.value)
  scope.value = SEARCH_SCOPES[(index + step + SEARCH_SCOPES.length) % SEARCH_SCOPES.length]
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
      moveKeyboardSelection(1)
      break
    case 'ArrowUp':
      event.preventDefault()
      moveKeyboardSelection(-1)
      break
    case 'Tab':
      // Like a command palette, Tab moves the scope while the panel is open.
      if (!isFocus.value || event.altKey || event.ctrlKey || event.metaKey)
        return
      event.preventDefault()
      moveScope(event.shiftKey ? -1 : 1)
      break
    case 'Delete': {
      const historyValue = options.value[activeIndex.value]?.historyValue
      if (!event.shiftKey || historyValue === undefined)
        return
      event.preventDefault()
      void handleDelete(historyValue)
      break
    }
    case 'Enter': {
      if (event.shiftKey)
        return
      event.preventDefault()
      const option = options.value[activeIndex.value]
      if (option)
        option.run()
      else
        void navigateToSearchResultPage(keyword.value)
      break
    }
    case 'Escape':
      event.preventDefault()
      closeSearch(true)
      break
  }
}

function handleClearSearchHistory() {
  return changeHistory(clearAllSearchHistory)
}

function handleFocusOut(event: FocusEvent) {
  const nextTarget = event.relatedTarget as HTMLElement | null
  if (nextTarget && searchWrapRef.value?.contains(nextTarget))
    return

  isFocus.value = false
  resetKeyboardSelection()
}

// Pressing anywhere in the panel keeps the caret in the input.
function keepInputFocus(event: MouseEvent) {
  if (!(event.target as Element).closest('input, textarea'))
    event.preventDefault()
}

function handleClearKeyword() {
  resetKeyboardSelection()
  suggestionRequestId++
  cancelSuggestion()
  keyword.value = ''
  suggestions.length = 0
  void nextTick(() => keywordRef.value?.focus())
}

// The panel grows out of the capsule: it fades in from slightly smaller and
// higher, anchored at its top edge (transform and opacity only).
function animatePanel(element: Element, done: () => void, entering: boolean) {
  const panel = element as HTMLElement
  if (prefersReducedMotion() || typeof panel.animate !== 'function') {
    done()
    return
  }
  const style = getComputedStyle(panel)
  const frames: Keyframe[] = [
    { opacity: 0, transform: 'translateY(-4px) scale(0.98, 0.96)' },
    { opacity: 1, transform: 'none' },
  ]
  const animation = panel.animate(entering ? frames : [...frames].reverse(), {
    duration: getMotionDuration(style, entering ? '--bew-duration-normal' : '--bew-duration-fast'),
    easing: style.getPropertyValue('--bew-ease-standard').trim() || 'ease-out',
    fill: entering ? 'none' : 'forwards',
  })
  holdAnimation(animation)
  animation.finished.then(done, done)
}
</script>

<template>
  <div
    id="search-wrap"
    ref="searchWrapRef"
    :class="{ 'search-wrap--top-bar': topBarMode, 'search-wrap--open': panelMerged }"
    :style="wrapStyle"
    w="full"
    pos="relative"
    @focusout="handleFocusOut"
  >
    <div
      v-layout-editable="layoutEditableId ?? ''"
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
        :aria-expanded="isFocus"
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
        @focus="isFocus = true"
        @click="isFocus = true"
        @input="handleNativeInput"
        @compositionend="handleNativeInput"
        @keydown.stop="handleComboboxKeyDown"
      >
      <button
        v-if="isFocus && keyword"
        type="button"
        :aria-label="$t('search_bar.clear_keyword')"
        pos="absolute right-12" bg="$bew-fill-1 hover:$bew-fill-2" text="xs" rounded="$bew-interactive-radius"
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
        rounded="$bew-pill-radius"
        text="lg leading-0"
        border-none
        outline-none
        pos="absolute right-6px"
        @click="navigateToSearchResultPage(keyword)"
      >
        <div i-tabler:search block align-middle />
      </button>
    </div>

    <Transition
      :css="false"
      @before-enter="panelShown = true"
      @enter="(element, done) => animatePanel(element, done, true)"
      @leave="(element, done) => animatePanel(element, done, false)"
      @after-leave="panelShown = false"
    >
      <div
        v-if="isFocus"
        :id="searchDropdownId"
        class="search-panel"
        :class="{ 'search-panel--detached': panelDetached }"
        role="region"
        :aria-label="$t('search_bar.search_options_label')"
        :style="narrowTopBarPopupStyle"
        @mousedown="keepInputFocus"
      >
        <SearchBarFilters v-model:scope="scope" v-model:filters="filters" />

        <div
          v-show="hasPanelBody"
          :id="suggestionListId"
          class="search-panel__body bew-popover__scroll"
          role="listbox"
          :aria-label="$t('search_bar.suggestions_label')"
          :aria-busy="suggestionsLoading"
          @pointerleave="resetKeyboardSelection"
        >
          <div class="search-panel__columns" :class="{ 'search-panel__columns--split': showHotSection }">
            <div class="search-panel__column">
              <!-- 搜索历史 -->
              <section v-if="showHistorySection" class="search-panel__section history-section" :aria-busy="historyChanging">
                <div class="search-panel__heading">
                  <span>{{ $t('search_bar.history_title') }}</span>
                  <Tooltip :content="$t('search_bar.clear_history')" placement="bottom" teleport>
                    <button
                      type="button" tabindex="-1"
                      class="bew-popover__action bew-popover__action--danger"
                      :aria-label="$t('search_bar.clear_history')"
                      :disabled="historyChanging || historyLoading"
                      @click="handleClearSearchHistory"
                    >
                      <span class="i-tabler:trash" aria-hidden="true" />
                    </button>
                  </Tooltip>
                </div>
                <div v-if="historyError" class="history-error" role="alert">
                  <span>{{ $t('search_bar.history_unavailable') }}</span>
                  <button type="button" :disabled="historyLoading || historyChanging" @click="loadHistory()">
                    {{ $t('common.retry') }}
                  </button>
                </div>
                <div v-if="historyLoading && !searchHistory.length" class="search-panel__skeleton" aria-hidden="true">
                  <SkeletonBlock v-for="index in 3" :key="index" height="var(--bew-control-height-sm)" radius="sm" />
                </div>
                <div
                  v-for="item in visibleHistory"
                  :id="getSearchOptionId('history', item.value)"
                  :key="item.value"
                  class="search-panel__row history-item"
                  role="option"
                  :aria-selected="activeDescendantId === getSearchOptionId('history', item.value)"
                  :data-active="activeDescendantId === getSearchOptionId('history', item.value) ? 'true' : undefined"
                  @pointermove="activateOption(getSearchOptionId('history', item.value))"
                >
                  <ALink
                    :href="buildKeywordHref(item.value)"
                    type="searchBar"
                    :custom-click-event="true"
                    class="search-panel__link"
                    tabindex="-1"
                    @click="handleKeywordLinkClick(item.value, $event)"
                  >
                    <span class="sr-only">{{ item.value }}</span>
                  </ALink>
                  <span class="search-panel__icon i-tabler:history" aria-hidden="true" />
                  <span class="search-panel__label">{{ item.value }}</span>
                  <TagRemoveButton
                    class="history-item__remove"
                    :label="$t('common.operation.remove')"
                    :disabled="historyChanging"
                    tabindex="-1"
                    @click.stop.prevent="handleDelete(item.value)"
                  />
                </div>
              </section>

              <!-- 快捷操作 -->
              <section v-if="commands.length" class="search-panel__section">
                <div class="search-panel__heading">
                  <span>{{ $t('search_bar.actions_title') }}</span>
                </div>
                <div
                  v-for="item in commands"
                  :id="getSearchOptionId('action', item.key)"
                  :key="item.key"
                  class="search-panel__row"
                  role="option"
                  :aria-selected="activeDescendantId === getSearchOptionId('action', item.key)"
                  :data-active="activeDescendantId === getSearchOptionId('action', item.key) ? 'true' : undefined"
                  @pointermove="activateOption(getSearchOptionId('action', item.key))"
                >
                  <component
                    :is="item.href ? 'a' : 'button'"
                    :href="item.href"
                    :type="item.href ? undefined : 'button'"
                    class="search-panel__link"
                    tabindex="-1"
                    @click="handleCommandClick(item, $event)"
                  >
                    <span class="sr-only">{{ item.label }}</span>
                  </component>
                  <span class="search-panel__icon" :class="item.icon" aria-hidden="true" />
                  <span class="search-panel__label">{{ item.label }}</span>
                  <span v-if="item.hint" class="search-panel__hint">{{ item.hint }}</span>
                  <span class="search-panel__enter i-tabler:corner-down-left" aria-hidden="true" />
                </div>
              </section>

              <!-- 联想建议 -->
              <section v-if="showSuggestionSection" class="search-panel__section">
                <div class="search-panel__heading">
                  <span>{{ $t('search_bar.suggestions_label') }}</span>
                </div>
                <div v-if="suggestionsLoading && !suggestions.length" class="search-panel__skeleton" aria-hidden="true">
                  <SkeletonBlock v-for="index in 4" :key="index" height="var(--bew-control-height-sm)" radius="sm" />
                </div>
                <div
                  v-for="item in suggestions"
                  :id="getSearchOptionId('suggestions', item.value)"
                  :key="item.value"
                  class="search-panel__row suggestion-item"
                  role="option"
                  :aria-selected="activeDescendantId === getSearchOptionId('suggestions', item.value)"
                  :data-active="activeDescendantId === getSearchOptionId('suggestions', item.value) ? 'true' : undefined"
                  tabindex="-1"
                  @pointermove="activateOption(getSearchOptionId('suggestions', item.value))"
                  @click="navigateToSearchResultPage(item.value)"
                >
                  <span class="search-panel__icon i-tabler:search" aria-hidden="true" />
                  <span class="search-panel__label bew-search-highlight" v-html="sanitizeSearchHighlight(item.name)" />
                </div>
              </section>
            </div>

            <!-- 热搜 -->
            <div v-if="showHotSection" class="search-panel__column">
              <section class="search-panel__section hot-search-section">
                <div class="search-panel__heading">
                  <span>{{ $t('search_bar.hot_search_title') }}</span>
                </div>
                <div v-if="isLoadingHotSearch && !hotSearchList.length" class="search-panel__skeleton" aria-hidden="true">
                  <SkeletonBlock v-for="index in hotSearchDisplayLimit" :key="`hot-loading-${index}`" height="var(--bew-control-height-sm)" radius="sm" />
                </div>
                <div
                  v-for="(item, index) in visibleHotSearchList"
                  :id="getSearchOptionId('hot', item.keyword)"
                  :key="item.keyword"
                  class="search-panel__row hot-search-item"
                  role="option"
                  :aria-selected="activeDescendantId === getSearchOptionId('hot', item.keyword)"
                  :data-active="activeDescendantId === getSearchOptionId('hot', item.keyword) ? 'true' : undefined"
                  @pointermove="activateOption(getSearchOptionId('hot', item.keyword))"
                >
                  <ALink
                    :href="buildKeywordHref(item.keyword)"
                    type="searchBar"
                    :custom-click-event="true"
                    class="search-panel__link"
                    tabindex="-1"
                    @click="handleKeywordLinkClick(item.keyword, $event)"
                  >
                    <span class="sr-only">{{ item.show_name }}</span>
                  </ALink>
                  <span class="search-panel__rank" :class="{ 'search-panel__rank--top': index < 3 }">{{ index + 1 }}</span>
                  <span class="search-panel__label">{{ item.show_name }}</span>
                  <img
                    v-if="item.icon && !item.icon.includes('.gif')"
                    :src="item.icon"
                    class="hot-search-icon"
                    alt=""
                  >
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style lang="scss" scoped>
@use "../../styles/truncateFade";

.search-panel__skeleton {
  display: grid;
  gap: var(--bew-space-2);
  padding: var(--bew-space-1) var(--bew-popover-inset) var(--bew-space-2);
}
.history-error {
  display: flex;
  align-items: center;
  gap: var(--bew-space-2);
  padding: var(--bew-space-1) var(--bew-popover-inset) var(--bew-space-2);
  font-size: var(--bew-font-size-callout);
  line-height: var(--bew-line-height-callout);
  color: var(--bew-text-2);

  button {
    flex-shrink: 0;
    min-height: var(--bew-control-height-sm);
    padding-inline: var(--bew-space-2);
    border-radius: var(--bew-interactive-radius);
    color: var(--bew-theme-foreground);
    background: var(--bew-content-solid);
    cursor: pointer;

    &:hover:not(:disabled) {
      color: var(--bew-on-theme-surface);
      background: var(--bew-theme-surface);
    }

    &:active:not(:disabled) {
      background: var(--bew-theme-surface-hover);
    }

    &:disabled {
      opacity: 0.5;
      cursor: default;
    }
  }
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
  max-width: var(--bew-search-bar-max-width);
  height: var(--b-search-bar-height, var(--bew-top-bar-primary-control-height, 46px));

  --b-search-bar-normal-color: var(--bew-glass-tint);

  --b-search-bar-normal-icon-color: var(--bew-text-1);
  --b-search-bar-hover-icon-color: var(--bew-text-1);
  --b-search-bar-focus-icon-color: var(--bew-text-1);

  --b-search-bar-normal-text-color: var(--bew-text-1);
  --b-search-bar-hover-text-color: var(--bew-text-1);
  --b-search-bar-focus-text-color: var(--bew-text-1);
  // Half the height: the capsule's ends, and the panel's corners when it grows out of it.
  --b-search-bar-current-radius: var(
    --b-search-bar-radius,
    calc(var(--b-search-bar-height, var(--bew-top-bar-primary-control-height, 46px)) / 2)
  );

  @mixin card-content {
    --uno: "text-base outline-none w-full bg-transparent";
  }

  // Focus keeps the same pill, material and shadow; no shape or opacity change.
  .search-bar::before {
    content: "";
    position: absolute;
    inset: 0;
    z-index: 1;
    border-radius: var(--b-search-bar-current-radius);
    corner-shape: var(--b-search-bar-current-corner);
    box-shadow: var(--bew-glass-shadow);
    pointer-events: none;
    transition: opacity var(--bew-duration-normal) var(--bew-ease-standard);
  }

  .search-bar {
    --b-search-bar-current-corner: var(--bew-corner-shape-capsule);
    background: var(--b-search-bar-normal-color);
    backdrop-filter: var(--bew-filter-glass-1);
    transition: background-color var(--bew-duration-normal) var(--bew-ease-standard);
    border-radius: var(--b-search-bar-current-radius);
    corner-shape: var(--b-search-bar-current-corner);

    .focus-character-image {
      position: absolute;
      right: 0;
      bottom: 100%;
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
      // The input fills the glass capsule, so it draws the glass rim.
      border: var(--bew-glass-edge-width) solid var(--bew-glass-edge-color);
      min-width: 0;
      position: relative;
      z-index: 0;
      border-radius: var(--b-search-bar-current-radius);
      corner-shape: var(--b-search-bar-current-corner);
      transition:
        background-color var(--bew-duration-normal) var(--bew-ease-standard),
        color var(--bew-duration-normal) var(--bew-ease-standard),
        opacity var(--bew-duration-normal) var(--bew-ease-standard),
        border-color var(--bew-duration-normal) var(--bew-ease-standard);

      &::placeholder {
        color: inherit;
        opacity: var(--b-search-bar-placeholder-opacity, 0.65);
      }
    }

    .search-submit-btn {
      position: absolute;
      color: var(--b-search-bar-normal-icon-color);
      background: transparent;
      isolation: isolate;
      transition: color 280ms ease;

      > * {
        position: relative;
        z-index: 1;
      }
    }

    &:hover .search-submit-btn,
    &:focus-within .search-submit-btn,
    .search-submit-btn:hover,
    .search-submit-btn:focus-visible {
      color: var(--b-search-bar-hover-icon-color, var(--bew-text-1));
    }
  }

  // Open, the capsule becomes the top of the solid panel: its glass, rim and
  // shadow give way to the panel's (no glass over glass), and it sits above it.
  &.search-wrap--open .search-bar {
    z-index: calc(var(--bew-z-topbar-interaction) + 1);
    background-color: transparent;
    backdrop-filter: none;

    &::before {
      opacity: 0;
    }

    input {
      border-color: transparent;
    }
  }

  // The panel is the capsule's surface grown downward: same width and top
  // corners, solid (it reaches past the bar's glass), ruled by hairlines.
  .search-panel {
    position: absolute;
    top: 0;
    inset-inline: 0;
    z-index: var(--bew-z-topbar-interaction);
    container-type: inline-size;
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
    max-height: calc(100dvh - var(--search-panel-top, 0px) - var(--bew-space-4));
    padding-top: var(--b-search-bar-height, var(--bew-top-bar-primary-control-height, 46px));
    overflow: hidden;
    color: var(--bew-text-1);
    background: var(--bew-popover-surface-background-solid);
    border: var(--bew-hairline) solid var(--bew-edge-color);
    border-radius: var(--b-search-bar-current-radius);
    corner-shape: var(--bew-corner-shape-capsule);
    box-shadow: var(--bew-popover-surface-shadow);
    transform-origin: top center;
  }

  .search-panel--detached {
    position: absolute;
    padding-top: 0;
    border-radius: var(--bew-surface-radius);
    corner-shape: var(--bew-corner-shape);
  }

  .search-panel__body {
    flex: 1 1 auto;
    min-height: 0;
    border-top: var(--bew-hairline) solid var(--bew-separator-color);
  }

  .search-panel__columns {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
  }

  .search-panel__column + .search-panel__column {
    border-top: var(--bew-hairline) solid var(--bew-separator-color);
  }

  // Wide panels set the trending list beside history and actions.
  @container (min-width: 600px) {
    .search-panel__columns--split {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .search-panel__columns--split .search-panel__column + .search-panel__column {
      border-top: 0;
      border-inline-start: var(--bew-hairline) solid var(--bew-separator-color);
    }
  }

  .search-panel__section {
    padding-bottom: var(--bew-space-2);
  }

  .search-panel__section + .search-panel__section {
    border-top: var(--bew-hairline) solid var(--bew-separator-color);
  }

  .search-panel__heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--bew-space-2);
    min-height: var(--bew-control-height);
    padding: var(--bew-space-1) var(--bew-space-2) 0 var(--bew-popover-inset);
    color: var(--bew-text-2);
    font-size: var(--bew-font-size-callout);
    line-height: var(--bew-line-height-callout);
  }

  // Rows run edge to edge; the active (pointer or keyboard) row is tinted.
  .search-panel__row {
    position: relative;
    display: flex;
    align-items: center;
    gap: var(--bew-space-3);
    min-height: var(--bew-popover-row-min-height);
    padding-inline: var(--bew-popover-inset);
    color: var(--bew-text-1);
    font-size: var(--bew-font-size-control);
    line-height: var(--bew-line-height-control);
    cursor: pointer;
    transition: background-color var(--bew-duration-fast) var(--bew-ease-standard);

    &[data-active="true"] {
      background: var(--bew-hover-bg);
    }

    // The row's link or button covers it; what is drawn passes the pointer through.
    > :not(.search-panel__link) {
      position: relative;
      z-index: 1;
      pointer-events: none;
    }
  }

  .search-panel__link {
    position: absolute;
    inset: 0;
    z-index: 0;
    padding: 0;
    color: inherit;
    background: transparent;
    border: 0;
    cursor: pointer;

    &:focus-visible {
      outline: none;
    }
  }

  .search-panel__icon {
    flex: none;
    width: var(--bew-icon-size-sm);
    height: var(--bew-icon-size-sm);
    color: var(--bew-text-2);
  }

  .search-panel__label {
    flex: 1 1 auto;
    min-width: 0;
    @include truncateFade.line;
  }

  .search-panel__hint {
    flex: 0 1 auto;
    max-width: 40%;
    color: var(--bew-text-3);
    font-size: var(--bew-font-size-caption);
    line-height: var(--bew-line-height-caption);
    @include truncateFade.line;
  }

  .search-panel__enter {
    flex: none;
    width: var(--bew-icon-size-xs);
    height: var(--bew-icon-size-xs);
    color: var(--bew-text-3);
    opacity: 0;
    transition: opacity var(--bew-duration-fast) var(--bew-ease-standard);
  }

  .search-panel__row[data-active="true"] .search-panel__enter {
    opacity: 1;
  }

  .search-panel__rank {
    flex: none;
    width: var(--bew-icon-size-sm);
    color: var(--bew-text-3);
    font-size: var(--bew-font-size-caption);
    line-height: var(--bew-line-height-caption);
    font-variant-numeric: tabular-nums;
    text-align: center;
  }

  .search-panel__rank--top {
    color: var(--bew-text-1);
  }

  .hot-search-icon {
    flex: none;
    width: auto;
    max-width: var(--bew-space-6);
    height: var(--bew-icon-size-sm);
    object-fit: contain;
  }

  .search-panel__row > .history-item__remove {
    flex: none;
    pointer-events: auto;
    opacity: 0;
    transition: opacity var(--bew-duration-fast) var(--bew-ease-standard);
  }

  .history-item[data-active="true"] .history-item__remove,
  .history-item__remove:focus-visible {
    opacity: 1;
  }

  @media (hover: none) {
    .history-item__remove {
      opacity: 1;
    }
  }
}
</style>
