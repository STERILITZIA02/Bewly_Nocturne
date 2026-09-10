<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { useThrottleFn } from '@vueuse/core'
import type { AsyncComponentLoader } from 'vue'

import LiquidSegmentIndicator from '~/components/LiquidSegmentIndicator.vue'
import PageAsyncLoading from '~/components/PageAsyncLoading.vue'
import { useBewlyApp } from '~/composables/useAppProvider'
import { provideHomeTabCache } from '~/composables/useHomeTabState'
import { useSearchFocusEffect } from '~/composables/useSearchFocusEffect'
import { OVERLAY_SCROLL_BAR_SCROLL, TOP_BAR_VISIBILITY_CHANGE } from '~/constants/globalEvents'
import { HOME_SEARCH_STAGE_HEIGHT, HOME_SEARCH_STICKY_SCROLL_TOP } from '~/constants/layout'
import { gridLayout, settings } from '~/logic'
import { isLayoutEditing, useLayoutEditSettingValue, vLayoutEditable } from '~/logic/layoutEdit'
import { useForYouStore } from '~/stores/forYouStore'
import type { HomeTab } from '~/stores/mainStore'
import { useMainStore } from '~/stores/mainStore'
import { useTopBarStore } from '~/stores/topBarStore'
import { resolveAuthenticatedAccountId } from '~/utils/accountScope'
import { normalizeHomeTabConfig } from '~/utils/homeTabConfig'
import emitter from '~/utils/mitt'

import RecommendationModeSwitcher from './components/RecommendationModeSwitcher.vue'
import VersionReminder from './components/VersionReminder.vue'
import type { GridLayoutIcon } from './types'
import { HomeSubPage } from './types'

const mainStore = useMainStore()
const topBarStore = useTopBarStore()
const forYouStore = useForYouStore()
const searchFocusEffect = useSearchFocusEffect()
const {
  handleBackToTop,
  homeActivatedPage,
  homeActivatedPageTouched,
  isHomeTabSwitching,
  scrollViewportRef,
} = useBewlyApp()
const handleThrottledBackToTop = useThrottleFn((targetScrollTop: number = 0) => handleBackToTop(targetScrollTop), 1000)

// ✅ 性能优化：缓存 scrollTop 值，避免重复 DOM 读取
const cachedScrollTop = ref(0)
const showHomeSearchCharacter = computed(() => cachedScrollTop.value < HOME_SEARCH_STICKY_SCROLL_TOP)
const tabScrollPositions = new Map<string, number>()
let pendingTabScrollTop: number | null = null
let resetScrollOnEntry = settings.value.useSearchPageModeOnHomePage
let tabSwitchFrame: number | null = null

// 使用全局的homeActivatedPage状态
const activatedPage = homeActivatedPage
const homeGridLayout = useLayoutEditSettingValue('page.home.gridLayout', () => gridLayout.value.home)
function preventBackgroundSelection(event: MouseEvent) {
  if (isLayoutEditing.value || event.button !== 0 || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey
    || window.getSelection()?.isCollapsed === false || !(event.target instanceof HTMLElement)) {
    return
  }
  // Only the empty layout surfaces opt in. Card text, controls and selection
  // gestures keep their native behavior, including layout editing and batching.
  if (event.target === event.currentTarget || event.target.matches('.video-card-grid-root, .video-card-grid-container, .video-card-spacer, [data-layout-editable-id="home-video-grid"]'))
    event.preventDefault()
}
function defineHomePageComponent(loader: AsyncComponentLoader) {
  return defineAsyncComponent({
    loader,
    loadingComponent: { render: () => h(PageAsyncLoading, { contentOnly: true, gridLayout: homeGridLayout.value }) },
    delay: 120,
  })
}

// Reuse loaded component modules while inactive views keep data only.
const forYouPage = defineHomePageComponent(() => import('./components/ForYou.vue'))
const followingPage = defineHomePageComponent(() => import('./components/Following.vue'))
const followingOldPage = defineHomePageComponent(() => import('./components/FollowingOld.vue'))
const subscribedSeriesPage = defineHomePageComponent(() => import('./components/SubscribedSeries.vue'))
const trendingPage = defineHomePageComponent(() => import('./components/Trending.vue'))
const rankingPage = defineHomePageComponent(() => import('./components/Ranking.vue'))
const preciousPage = defineHomePageComponent(() => import('./components/Precious.vue'))
const weeklyPage = defineHomePageComponent(() => import('./components/Weekly.vue'))
const livePage = defineHomePageComponent(() => import('./components/Live.vue'))
const pages = computed(() => ({
  [HomeSubPage.ForYou]: forYouPage,
  [HomeSubPage.Following]: settings.value.useFollowingNewLayout
    ? followingPage
    : followingOldPage,
  [HomeSubPage.SubscribedSeries]: subscribedSeriesPage,
  [HomeSubPage.Trending]: trendingPage,
  [HomeSubPage.Ranking]: rankingPage,
  [HomeSubPage.Precious]: preciousPage,
  [HomeSubPage.Weekly]: weeklyPage,
  [HomeSubPage.Live]: livePage,
}))
const activatedPageCacheKey = computed(() => activatedPage.value === HomeSubPage.Following
  ? `${activatedPage.value}:${settings.value.useFollowingNewLayout ? 'new' : 'old'}`
  : activatedPage.value === HomeSubPage.ForYou
    ? `${activatedPage.value}:${settings.value.recommendationMode}`
    : activatedPage.value)
const homeAccountId = computed(() => resolveAuthenticatedAccountId(
  topBarStore.isLogin,
  topBarStore.userInfo.mid,
))
const homeAccountScope = computed(() => {
  if (homeAccountId.value !== null)
    return `account:${homeAccountId.value}`
  return topBarStore.isLogin ? 'profile-unavailable' : 'logged-out'
})
const homeAccountGeneration = ref(0)
const tabCache = provideHomeTabCache(() => activatedPageCacheKey.value, restoreTabScrollPosition)

function restorePreservedForYou() {
  if (!settings.value.preserveForYouState) {
    forYouStore.resetState()
    return
  }
  const saved = forYouStore.takeCompleteState(homeAccountId.value, settings.value.recommendationMode)
  if (!saved)
    return
  const key = `${HomeSubPage.ForYou}:${saved.recommendationMode}`
  tabCache.save(key, saved.snapshot, tabCache.generation)
  tabScrollPositions.set(key, saved.scrollTop)
  if (activatedPage.value === HomeSubPage.ForYou)
    pendingTabScrollTop = resetScrollOnEntry ? 0 : saved.scrollTop
}
restorePreservedForYou()
const tabContentLoading = ref<boolean>(false)
const currentTabs = ref<HomeTab[]>([])
const tabPageRef = ref()
const topBarVisibility = ref<boolean>(true)
const shouldShowHomeTabs = computed(() => currentTabs.value.length > 1)
const recommendationSwitcherEnabled = useLayoutEditSettingValue('page.home.recommendationSwitcher', () => settings.value.showRecommendationModeSwitcher)
const shouldShowRecommendationModeSwitcher = computed(() => activatedPage.value === HomeSubPage.ForYou && (recommendationSwitcherEnabled.value || isLayoutEditing.value))
const shouldShowHomeHeader = computed(() => shouldShowHomeTabs.value || settings.value.enableGridLayoutSwitcher || shouldShowRecommendationModeSwitcher.value)
const gridLayoutIcons = computed((): GridLayoutIcon[] => {
  return [
    { icon: 'mingcute:table-3-line', iconActivated: 'mingcute:table-3-fill', value: 'adaptive', labelKey: 'layout_editor.layout_adaptive' },
    { icon: 'mingcute:layout-grid-line', iconActivated: 'mingcute:layout-grid-fill', value: 'twoColumns', labelKey: 'layout_editor.layout_two_columns' },
    { icon: 'mingcute:list-check-3-line', iconActivated: 'mingcute:list-check-3-fill', value: 'oneColumn', labelKey: 'layout_editor.layout_one_column' },
  ]
})

const tabsIndicatorRef = ref<InstanceType<typeof LiquidSegmentIndicator> | null>(null)
const gridIndicatorRef = ref<InstanceType<typeof LiquidSegmentIndicator> | null>(null)

watch(currentTabs, () => {
  void tabsIndicatorRef.value?.updateIndicator(true)
})

watch(() => settings.value.enableGridLayoutSwitcher, (enabled) => {
  if (enabled)
    void gridIndicatorRef.value?.updateIndicator(true)
})

watch(homeAccountScope, (nextScope, previousScope) => {
  if (nextScope === previousScope || nextScope === 'profile-unavailable')
    return

  tabCache.clear()
  tabScrollPositions.clear()
  pendingTabScrollTop = resetScrollOnEntry ? 0 : getInitialTabScrollTop()
  restorePreservedForYou()
  tabContentLoading.value = false
  homeAccountGeneration.value++
}, { flush: 'sync' })

function getInitialTabScrollTop(): number {
  return Math.min(
    scrollViewportRef.value?.scrollTop ?? 0,
    settings.value.useSearchPageModeOnHomePage ? HOME_SEARCH_STAGE_HEIGHT : 0,
  )
}

function restoreTabScrollPosition() {
  if (pendingTabScrollTop !== null) {
    const viewport = scrollViewportRef.value
    if (viewport) {
      viewport.scrollTop = pendingTabScrollTop
      cachedScrollTop.value = pendingTabScrollTop
      pendingTabScrollTop = null
    }
  }
  // A grid mounts after the parent transition may already have consumed the
  // pending position. Keep this intent until an actual Home tab switch.
  return resetScrollOnEntry
}

function finishTabSwitch() {
  // Also restore here as a safeguard for transitions that skip the enter hook.
  restoreTabScrollPosition()
  if (tabSwitchFrame !== null)
    cancelAnimationFrame(tabSwitchFrame)
  tabSwitchFrame = requestAnimationFrame(() => {
    tabSwitchFrame = null
    isHomeTabSwitching.value = false
  })
}

watch(activatedPageCacheKey, (newPage, oldPage) => {
  resetScrollOnEntry = false
  tabContentLoading.value = false
  const viewport = scrollViewportRef.value
  if (!viewport)
    return

  if (pendingTabScrollTop === null)
    tabScrollPositions.set(oldPage, viewport.scrollTop)
  pendingTabScrollTop = tabScrollPositions.get(newPage) ?? getInitialTabScrollTop()
  isHomeTabSwitching.value = true
}, { flush: 'sync' })

watch(() => settings.value.useSearchPageModeOnHomePage, (integrated) => {
  if (integrated) {
    resetScrollOnEntry = true
    pendingTabScrollTop = 0
    restoreTabScrollPosition()
  }
}, { flush: 'post' })

// 使用deep监听
watch(() => settings.value.homePageTabVisibilityList, () => {
  syncCurrentTabs()
}, { deep: true })

function handleOverlayScroll(scrollTop: number) {
  cachedScrollTop.value = scrollTop
}

function handleTopBarVisibilityChange(visible: boolean) {
  topBarVisibility.value = visible
}

function computeTabs(): HomeTab[] {
  const targetTabs: HomeTab[] = []
  const defaultConfig = mainStore.homeTabs.map(tab => ({
    page: tab.page,
    visible: tab.page !== HomeSubPage.Precious,
  }))
  const tabConfig = normalizeHomeTabConfig(settings.value.homePageTabVisibilityList, defaultConfig)

  for (const tab of tabConfig) {
    if (tab.visible) {
      targetTabs.push({
        i18nKey: (mainStore.homeTabs.find(defaultTab => defaultTab.page === tab.page) || {})?.i18nKey || tab.page,
        page: tab.page,
      })
    }
  }

  return targetTabs
}

function syncCurrentTabs() {
  const nextTabs = computeTabs()
  currentTabs.value = nextTabs

  const fallbackPage = nextTabs[0]?.page || mainStore.homeTabs[0].page
  if (!nextTabs.some(tab => tab.page === activatedPage.value)) {
    activatedPage.value = fallbackPage
    homeActivatedPage.value = fallbackPage
  }
}

onMounted(() => {
  // ✅ 性能优化：订阅滚动事件以缓存 scrollTop，避免后续 DOM 读取
  emitter.on(OVERLAY_SCROLL_BAR_SCROLL, handleOverlayScroll)
  emitter.on(TOP_BAR_VISIBILITY_CHANGE, handleTopBarVisibilityChange)

  syncCurrentTabs()
  resetScrollOnEntry = settings.value.useSearchPageModeOnHomePage
  if (resetScrollOnEntry) {
    pendingTabScrollTop = 0
    restoreTabScrollPosition()
  }
})

onUnmounted(() => {
  const mode = settings.value.recommendationMode
  const key = `${HomeSubPage.ForYou}:${mode}`
  const snapshot = tabCache.take(key)
  if (settings.value.preserveForYouState && snapshot) {
    forYouStore.saveCompleteState({
      accountId: homeAccountId.value,
      recommendationMode: mode,
      scrollTop: activatedPage.value === HomeSubPage.ForYou ? cachedScrollTop.value : tabScrollPositions.get(key) ?? getInitialTabScrollTop(),
      snapshot,
    })
  }
  tabCache.clear()
  emitter.off(TOP_BAR_VISIBILITY_CHANGE, handleTopBarVisibilityChange)
  emitter.off(OVERLAY_SCROLL_BAR_SCROLL, handleOverlayScroll)
  isHomeTabSwitching.value = false
  if (tabSwitchFrame !== null) {
    cancelAnimationFrame(tabSwitchFrame)
    tabSwitchFrame = null
  }
  pendingTabScrollTop = null
  tabScrollPositions.clear()
  tabPageRef.value = null
})

function handleChangeTab(tab: HomeTab) {
  homeActivatedPageTouched.value = true

  if (activatedPage.value === tab.page) {
    const scrollTop = scrollViewportRef.value?.scrollTop ?? cachedScrollTop.value

    if ((!settings.value.useSearchPageModeOnHomePage && scrollTop > 0) || (settings.value.useSearchPageModeOnHomePage && scrollTop > HOME_SEARCH_STAGE_HEIGHT)) {
      handleThrottledBackToTop(settings.value.useSearchPageModeOnHomePage ? HOME_SEARCH_STAGE_HEIGHT : 0)
    }
    else {
      if (tabContentLoading.value)
        return
      if (tabPageRef.value)
        tabPageRef.value.initData()
    }
    return
  }
  if (tabContentLoading.value)
    toggleTabContentLoading(false)

  activatedPage.value = tab.page
  // Update global home activated page state
  homeActivatedPage.value = tab.page
}

function toggleTabContentLoading(loading: boolean) {
  tabContentLoading.value = loading
}
</script>

<template>
  <div pos="relative">
    <main @mousedown="preventBackgroundSelection">
      <!-- Home search page mode content -->
      <Transition name="content">
        <div v-if="settings.useSearchPageModeOnHomePage" class="home-search-stage">
          <div class="home-search-stage__lead">
            <Logo
              v-if="settings.searchPageShowLogo"
              class="home-search-stage__logo"
              :size="180"
              :color="settings.searchPageLogoColor === 'white' ? 'white' : 'var(--bew-theme-color)'"
              :glow="settings.searchPageLogoGlow"
            />
          </div>
          <div
            v-layout-editable="'home-search'"
            class="home-search-stage__sticky-search"
            data-layout-editable-id="home-search"
          >
            <SearchBar
              :darken-on-focus="searchFocusEffect.darkened"
              :blurred-on-focus="searchFocusEffect.blurred"
              :focused-character="showHomeSearchCharacter ? settings.searchPageSearchBarFocusCharacter : undefined"
              :show-hot-search="settings.showHotSearchInTopBar"
              :top-bar-appearance="true"
            />
          </div>
          <div class="home-search-stage__tail" aria-hidden="true" />
        </div>
      </Transition>

      <header
        v-if="shouldShowHomeHeader"
        class="home-header"
        :class="{
          'home-header-fixed': settings.fixedHomeTabsOnHomePage,
          'home-header--recommendation-switcher': shouldShowRecommendationModeSwitcher,
        }"
        w-full z-9
      >
        <section
          v-if="shouldShowHomeTabs"
          v-layout-editable="'home-tabs'"
          class="home-control-surface home-tabs-panel bew-segment-control bew-segment-control--surface"
          data-layout-editable-id="home-tabs"
        >
          <div class="home-tabs-scroll" h-full of-x-auto of-y-hidden>
            <div
              class="home-tabs-inside" flex="~ items-center" h-inherit w-max
              box-border
            >
              <LiquidSegmentIndicator
                ref="tabsIndicatorRef"
                :active-key="activatedPage"
              />
              <button
                v-for="tab in currentTabs" :key="tab.page"
                type="button" :aria-pressed="activatedPage === tab.page"
                class="home-tab-button bew-segment-control__item bew-segment-control__item--wide"
                data-segment-item
                :data-active="activatedPage === tab.page ? 'true' : undefined"
                flex="~ gap-2 items-center shrink-0" relative
                @click="handleChangeTab(tab)"
              >
                <span class="text-center">{{ $t(tab.i18nKey) }}</span>
              </button>
            </div>
          </div>
        </section>

        <div class="home-header-actions">
          <RecommendationModeSwitcher v-if="shouldShowRecommendationModeSwitcher" class="home-control-surface" />
          <div
            v-if="settings.enableGridLayoutSwitcher"
            v-layout-editable="'home-grid-switcher'"
            class="home-control-surface home-grid-layout-switcher bew-segment-control bew-segment-control--surface"
            data-layout-editable-id="home-grid-switcher"
            flex="~ shrink-0 items-center"
            box-border
          >
            <LiquidSegmentIndicator
              ref="gridIndicatorRef"
              :active-key="homeGridLayout"
            />
            <button
              v-for="icon in gridLayoutIcons" :key="icon.value"
              type="button"
              class="home-grid-layout-item bew-segment-control__item bew-segment-control__item--icon"
              data-segment-item
              :data-active="homeGridLayout === icon.value ? 'true' : undefined"
              :aria-pressed="homeGridLayout === icon.value"
              :title="$t(icon.labelKey)"
              @click="gridLayout.home = icon.value"
            >
              <Icon
                class="home-grid-layout-item__icon bew-segment-control__icon"
                :icon="homeGridLayout === icon.value ? icon.iconActivated : icon.icon"
                aria-hidden="true"
              />
            </button>
          </div>
        </div>
      </header>

      <div
        v-layout-editable="'home-video-grid'"
        data-layout-editable-id="home-video-grid"
        min-w-0
      >
        <Transition
          name="home-tab"
          mode="out-in"
          @enter="restoreTabScrollPosition"
          @after-enter="finishTabSwitch"
        >
          <PageAsyncLoading
            v-if="homeAccountScope === 'profile-unavailable'"
            content-only
            :grid-layout="homeGridLayout"
          />
          <Component
            :is="pages[activatedPage]"
            v-else :key="`${activatedPageCacheKey}:${homeAccountGeneration}`"
            ref="tabPageRef"
            :grid-layout="homeGridLayout"
            :top-bar-visibility="topBarVisibility"
            @before-loading="toggleTabContentLoading(true)"
            @after-loading="toggleTabContentLoading(false)"
          />
        </Transition>
      </div>
    </main>

    <VersionReminder />
  </div>
</template>

<style scoped lang="scss">
.home-search-stage {
  display: contents;
}

.home-search-stage__lead,
.home-search-stage__tail {
  pointer-events: none;
}

.home-search-stage__lead {
  height: var(--bew-layout-home-search-stage-lead-height);
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.home-search-stage__tail {
  height: var(--bew-layout-home-search-stage-tail-height);
}

.home-search-stage__logo {
  z-index: 1;
  margin-bottom: var(--bew-space-12);
}

.home-search-stage__sticky-search {
  position: sticky;
  top: calc((var(--bew-top-bar-height) - var(--bew-top-bar-primary-control-height)) / 2);
  z-index: var(--bew-z-topbar-host);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-width: 0;
  height: var(--bew-top-bar-primary-control-height);
  pointer-events: none;
}

.home-search-stage__sticky-search :deep(#search-wrap) {
  pointer-events: auto;
}

.content-enter-active,
.content-leave-active {
  --uno: "duration-500 ease-in-out";
}
.content-enter-from,
.content-leave-to {
  --uno: "opacity-0 h-100vh";
}
.content-leave-to {
  --uno: "hidden";
}

.home-tab-enter-active,
.home-tab-leave-active {
  transition: opacity var(--bew-duration-fast, 150ms) var(--bew-ease-standard, ease);
}

.home-tab-enter-from,
.home-tab-leave-to {
  opacity: 0;
}

.home-control-surface {
  /* 关键优化：绘制隔离，防止重绘传播 */
  contain: paint layout;
  /* 创建独立堆叠上下文，减少合成压力 */
  isolation: isolate;
}

.home-header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
  gap: var(--bew-space-4);
  margin-bottom: var(--bew-space-4);
}

.home-tabs-panel {
  grid-column: 1;
  max-width: 100%;
  justify-self: start;
}

.home-header-actions {
  grid-column: 2;
  justify-self: end;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: var(--bew-space-4);
  max-width: 100%;
  margin-inline-start: auto;
  > .bew-segment-control {
    flex: none;
  }
}

.home-header--recommendation-switcher {
  display: flex;
  flex-wrap: wrap;
  .home-tabs-panel {
    min-width: min(100%, 24rem);
    flex: 0 1 auto;
  }
}

.home-grid-layout-item {
  &__icon {
    pointer-events: none;
  }
}

.home-tabs-scroll {
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
}

.home-tabs-inside {
  position: relative;
  box-sizing: border-box;
  gap: var(--bew-control-gap);
}

.home-header-fixed {
  --uno: "sticky top-[calc(var(--bew-top-bar-height)+10px)]";
}

@media (prefers-reduced-motion: reduce) {
  .home-tab-enter-active,
  .home-tab-leave-active {
    transition: opacity 1ms linear;
  }
}
</style>
