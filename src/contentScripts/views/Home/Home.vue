<script setup lang="ts">
import { useMediaQuery } from '@vueuse/core'
import type { AsyncComponentLoader } from 'vue'

import LiquidSegmentIndicator from '~/components/LiquidSegmentIndicator.vue'
import PageAsyncLoading from '~/components/PageAsyncLoading.vue'
import { useBewlyApp } from '~/composables/useAppProvider'
import { provideHomeTabCache } from '~/composables/useHomeTabState'
import { usePageScrollPositions } from '~/composables/usePageViewState'
import { useReadyPageTransition } from '~/composables/useReadyPageTransition'
import { OVERLAY_SCROLL_BAR_SCROLL } from '~/constants/globalEvents'
import { resolveHomeSearchStage } from '~/constants/layout'
import { gridLayout, settings } from '~/logic'
import { isLayoutEditing, useLayoutEditSettingValue, vLayoutEditable } from '~/logic/layoutEdit'
import { useForYouStore } from '~/stores/forYouStore'
import type { HomeTab } from '~/stores/mainStore'
import { useMainStore } from '~/stores/mainStore'
import { useTopBarStore } from '~/stores/topBarStore'
import { resolveAuthenticatedAccountId } from '~/utils/accountScope'
import { createAsyncPageRegistry } from '~/utils/asyncPage'
import { homeTabStateKey } from '~/utils/homeRoute'
import { normalizeHomeTabConfig } from '~/utils/homeTabConfig'
import emitter from '~/utils/mitt'
import { retiringTransition } from '~/utils/motionPresence'
import { scrollToPosition } from '~/utils/scrollIntent'
import { subscribeViewportFrame } from '~/utils/viewportGeometry'

import HomeChannelsMenu from './components/HomeChannelsMenu.vue'
import RecommendationModeSwitcher from './components/RecommendationModeSwitcher.vue'
import VersionReminder from './components/VersionReminder.vue'
import type { GridLayoutIcon } from './types'
import { HomeSubPage } from './types'

defineOptions({ name: 'BewlyHomePage' })

const mainStore = useMainStore()
const topBarStore = useTopBarStore()
const forYouStore = useForYouStore()
const {
  homeActivatedPage,
  homeActivatedPageTouched,
  navigateToHomeTab,
  isHomeTabSwitching,
  scrollViewportRef,
} = useBewlyApp()

// Updated every scroll frame without reactivity; only crossing the sticky
// threshold below reaches render state.
let cachedScrollTop = 0
const shortViewport = useMediaQuery('(max-height: 800px)')
const searchStage = computed(() => resolveHomeSearchStage(shortViewport.value))
const searchStageStyle = computed(() => ({
  '--bew-layout-home-search-stage-lead-height': `${searchStage.value.lead}px`,
  '--bew-layout-home-search-stage-tail-height': `${searchStage.value.tail}px`,
  '--bew-layout-home-search-stage-sticky-scroll-top': `${searchStage.value.stickyScrollTop}px`,
}))
const showHomeSearchCharacter = ref(true)
function setCachedScrollTop(scrollTop: number) {
  cachedScrollTop = scrollTop
  showHomeSearchCharacter.value = scrollTop < searchStage.value.stickyScrollTop
}
watch(() => searchStage.value.stickyScrollTop, () => setCachedScrollTop(cachedScrollTop))

const tabScrollPositions = usePageScrollPositions('Home:')
const homeActive = ref(true)
let pendingTabScrollTop: number | null = null
let resetScrollOnEntry = settings.value.useSearchPageModeOnHomePage
let tabSwitchFrame: number | null = null
let homeEventsAttached = false

// Once the search sticks under the top bar, further scrolling slides it from the
// centre to just after the logo (a scroll-driven CSS animation). The centred
// position only changes with layout, so it is measured on layout frames.
const searchDock = useTemplateRef<HTMLElement>('searchDock')
function measureSearchDock() {
  const dock = searchDock.value
  const stage = dock?.parentElement
  if (dock && stage)
    dock.style.setProperty('--bew-home-search-left', `${stage.getBoundingClientRect().left + dock.offsetLeft}px`)
}
watch([searchDock, () => scrollViewportRef?.value, homeActive], ([dock, viewport, active], _, onCleanup) => {
  if (!dock || !viewport || !active)
    return
  measureSearchDock()
  onCleanup(subscribeViewportFrame(viewport, (_geometry, reason) => {
    if (reason === 'layout')
      measureSearchDock()
  }))
}, { flush: 'post' })

function subscribeHomeEvents() {
  if (homeEventsAttached)
    return
  homeEventsAttached = true
  emitter.on(OVERLAY_SCROLL_BAR_SCROLL, handleOverlayScroll)
}
function unsubscribeHomeEvents() {
  homeEventsAttached = false
  emitter.off(OVERLAY_SCROLL_BAR_SCROLL, handleOverlayScroll)
}

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
const asyncPages = createAsyncPageRegistry()
function defineHomePageComponent(loader: AsyncComponentLoader) {
  return asyncPages.define(loader, {
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
const tabTransition = useReadyPageTransition(() => pages.value[activatedPage.value], asyncPages.preload, {
  onSwap: restoreTabScrollPosition,
  rise: () => false,
})
const activatedPageCacheKey = computed(() => homeTabStateKey(activatedPage.value, settings.value.recommendationMode, settings.value.useFollowingNewLayout))
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
const getContentScrollTop = () => settings.value.useSearchPageModeOnHomePage ? searchStage.value.height : 0
const tabCache = provideHomeTabCache(() => activatedPageCacheKey.value, restoreTabScrollPosition, getContentScrollTop)

function restorePreservedForYou(restorePosition = true) {
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
  if (restorePosition && activatedPage.value === HomeSubPage.ForYou)
    pendingTabScrollTop = resetScrollOnEntry ? 0 : saved.scrollTop
}
restorePreservedForYou()
const tabContentLoading = ref<boolean>(false)
const currentTabs = ref<HomeTab[]>([])
const tabContentRef = ref<HTMLElement>()
const tabContentMinHeight = ref<number>()
const shouldShowHomeTabs = computed(() => currentTabs.value.length > 1)
const recommendationSwitcherEnabled = useLayoutEditSettingValue('page.home.recommendationSwitcher', () => settings.value.showRecommendationModeSwitcher)
const reserveRecommendationModeSwitcher = computed(() => recommendationSwitcherEnabled.value || isLayoutEditing.value)
const shouldShowRecommendationModeSwitcher = computed(() => activatedPage.value === HomeSubPage.ForYou && reserveRecommendationModeSwitcher.value)
const gridLayoutIcons = computed((): GridLayoutIcon[] => {
  return [
    { icon: 'i-tabler:table', iconActivated: 'i-tabler:table-filled', value: 'adaptive', labelKey: 'layout_editor.layout_adaptive' },
    { icon: 'i-tabler:layout-grid', iconActivated: 'i-tabler:layout-grid-filled', value: 'twoColumns', labelKey: 'layout_editor.layout_two_columns' },
    { icon: 'i-tabler:layout-list', iconActivated: 'i-tabler:layout-list-filled', value: 'oneColumn', labelKey: 'layout_editor.layout_one_column' },
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
  pendingTabScrollTop = resetScrollOnEntry ? 0 : null
  restorePreservedForYou(resetScrollOnEntry)
  tabContentLoading.value = false
  homeAccountGeneration.value++
}, { flush: 'sync' })

function getInitialTabScrollTop(): number {
  return Math.min(
    scrollViewportRef.value?.scrollTop ?? 0,
    getContentScrollTop(),
  )
}

// A tab switch swaps only the grid and never moves the shared header: above
// the content top the page stays exactly where it is; once the header is
// pinned, the incoming tab may resume its own position below that point.
function resolveTabSwitchScrollTop(current: number, saved: number | undefined): number {
  const contentTop = getContentScrollTop()
  if (current < contentTop)
    return current
  return Math.max(saved ?? contentTop, contentTop)
}

function restoreTabScrollPosition() {
  if (pendingTabScrollTop !== null) {
    const viewport = scrollViewportRef.value
    if (viewport) {
      scrollToPosition(viewport, pendingTabScrollTop)
      setCachedScrollTop(pendingTabScrollTop)
      pendingTabScrollTop = null
    }
  }
  // Home owns one continuous viewport. Cached grids may restore their data and
  // measurements, but must never replay another tab's old scroll anchor.
  return true
}

function finishTabSwitch() {
  // Also restore here as a safeguard for transitions that skip the enter hook.
  restoreTabScrollPosition()
  if (tabSwitchFrame !== null)
    cancelAnimationFrame(tabSwitchFrame)
  tabSwitchFrame = requestAnimationFrame(() => {
    tabSwitchFrame = null
    isHomeTabSwitching.value = false
    if (!tabContentLoading.value && !tabContentRef.value?.querySelector('.bew-page-async-loading'))
      tabContentMinHeight.value = undefined
  })
}

watch(activatedPageCacheKey, (_newPage, oldPage) => {
  resetScrollOnEntry = false
  tabContentLoading.value = false
  const viewport = scrollViewportRef.value
  if (!viewport || !homeActive.value)
    return

  if (pendingTabScrollTop === null)
    tabScrollPositions.set(oldPage, viewport.scrollTop)
  pendingTabScrollTop = resolveTabSwitchScrollTop(viewport.scrollTop, tabScrollPositions.get(activatedPageCacheKey.value))
  // Keep the outgoing space through the out-in/async-loading gap so the
  // browser itself cannot clamp the shared viewport back to the top.
  tabContentMinHeight.value = Math.max(tabContentRef.value?.getBoundingClientRect().height ?? 0, pendingTabScrollTop + viewport.clientHeight - getContentScrollTop())
  if (tabSwitchFrame !== null) {
    cancelAnimationFrame(tabSwitchFrame)
    tabSwitchFrame = null
  }
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
  setCachedScrollTop(scrollTop)
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
    homeActivatedPage.value = fallbackPage
  }
}

onMounted(() => {
  // ✅ 性能优化：订阅滚动事件以缓存 scrollTop，避免后续 DOM 读取
  subscribeHomeEvents()

  syncCurrentTabs()
  resetScrollOnEntry = settings.value.useSearchPageModeOnHomePage
  if (resetScrollOnEntry) {
    pendingTabScrollTop = 0
    restoreTabScrollPosition()
  }
})

onActivated(() => {
  homeActive.value = true
  subscribeHomeEvents()
  setCachedScrollTop(scrollViewportRef.value?.scrollTop ?? cachedScrollTop)
})

onDeactivated(() => {
  // Keep the Home shell and its data cache, but release its active grid owner.
  // This reuses existing unmount cleanup for requests, previews and observers.
  homeActive.value = false
  unsubscribeHomeEvents()
  isHomeTabSwitching.value = false
  if (tabSwitchFrame !== null) {
    cancelAnimationFrame(tabSwitchFrame)
    tabSwitchFrame = null
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
      scrollTop: activatedPage.value === HomeSubPage.ForYou ? cachedScrollTop : tabScrollPositions.get(key) ?? getInitialTabScrollTop(),
      snapshot,
    })
  }
  tabCache.clear()
  unsubscribeHomeEvents()
  isHomeTabSwitching.value = false
  if (tabSwitchFrame !== null) {
    cancelAnimationFrame(tabSwitchFrame)
    tabSwitchFrame = null
  }
  pendingTabScrollTop = null
  tabScrollPositions.clear()
})

function handleChangeTab(tab: HomeTab) {
  homeActivatedPageTouched.value = true

  if (activatedPage.value === tab.page)
    return
  if (tabContentLoading.value)
    toggleTabContentLoading(false)

  navigateToHomeTab(tab.page)
}

function toggleTabContentLoading(loading: boolean) {
  tabContentLoading.value = loading
}

watch(tabContentLoading, (loading) => {
  if (!loading && !isHomeTabSwitching.value && tabContentMinHeight.value !== undefined)
    finishTabSwitch()
}, { flush: 'post' })
</script>

<template>
  <div pos="relative" :style="searchStageStyle">
    <main @mousedown="preventBackgroundSelection">
      <!-- Home search page mode content -->
      <Transition name="content" v-bind="retiringTransition">
        <div v-if="settings.useSearchPageModeOnHomePage" class="home-search-stage">
          <div class="home-search-stage__lead">
            <Logo
              v-if="settings.searchPageShowLogo"
              class="home-search-stage__logo"
              :size="shortViewport ? 144 : 180"
              :color="settings.searchPageLogoColor === 'white' ? 'white' : 'var(--bew-theme-color)'"
            />
          </div>
          <div
            v-layout-editable="'home-search'"
            class="home-search-stage__sticky-search"
            data-layout-editable-id="home-search"
          >
            <div
              ref="searchDock"
              class="home-search-stage__dock"
              :class="{ 'home-search-stage__dock--brand-logo': settings.topBarLogoStyle === 'brand' }"
            >
              <SearchBar
                :focused-character="showHomeSearchCharacter ? settings.searchPageSearchBarFocusCharacter : undefined"
                :show-hot-search="settings.showHotSearchInTopBar"
                :top-bar-appearance="true"
              />
            </div>
          </div>
          <div class="home-search-stage__tail" aria-hidden="true" />
        </div>
      </Transition>

      <header
        class="home-header"
        :class="{
          'home-header-fixed': settings.fixedHomeTabsOnHomePage,
          'home-header--recommendation-switcher': reserveRecommendationModeSwitcher,
        }"
        w-full z-9
      >
        <div class="home-navigation">
          <section
            v-if="shouldShowHomeTabs"
            v-layout-editable="'home-tabs'"
            class="home-control-surface home-tabs-panel bew-segment-control bew-segment-control--surface bew-segment-control--track"
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
          <HomeChannelsMenu />
        </div>

        <div class="home-header-actions">
          <RecommendationModeSwitcher
            v-if="reserveRecommendationModeSwitcher"
            class="home-control-surface"
            :class="{ 'home-control-surface--inactive': !shouldShowRecommendationModeSwitcher }"
            :inert="!shouldShowRecommendationModeSwitcher || undefined"
            :aria-hidden="!shouldShowRecommendationModeSwitcher || undefined"
          />
          <div
            v-if="settings.enableGridLayoutSwitcher"
            v-layout-editable="'home-grid-switcher'"
            class="home-control-surface home-grid-layout-switcher bew-segment-control bew-segment-control--surface bew-segment-control--track"
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
              <span
                class="home-grid-layout-item__icon bew-segment-control__icon"
                :class="homeGridLayout === icon.value ? icon.iconActivated : icon.icon"
                aria-hidden="true"
              />
            </button>
          </div>
        </div>
      </header>

      <div
        v-if="homeActive"
        ref="tabContentRef"
        v-layout-editable="'home-video-grid'"
        data-layout-editable-id="home-video-grid"
        :style="tabContentMinHeight === undefined ? undefined : { minHeight: `${tabContentMinHeight}px` }"
        min-w-0
      >
        <Transition
          v-bind="tabTransition"
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
            :grid-layout="homeGridLayout"
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
  margin-bottom: var(--bew-space-6);
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

.home-search-stage__dock {
  width: min(var(--b-search-bar-max-width, 550px), 100%);
  min-width: 0;
  margin-inline: auto;
}

// Without scroll timelines the search simply stays centred.
@supports (animation-timeline: scroll()) {
  .home-search-stage__dock {
    animation: home-search-dock linear both;
    animation-timeline: --bew-page-scroll;
    animation-range: var(--bew-layout-home-search-stage-sticky-scroll-top)
      calc(var(--bew-layout-home-search-stage-sticky-scroll-top) + var(--bew-home-search-dock-travel));
  }
}

// Reduced motion: no glide, it moves once the travel range is passed.
@media (prefers-reduced-motion: reduce) {
  .home-search-stage__dock {
    animation-timing-function: steps(1, jump-end);
  }
}

@keyframes home-search-dock {
  from {
    translate: 0 0;
  }
  to {
    translate: calc(var(--bew-home-search-dock-start) - var(--bew-home-search-left, 0px)) 0;
  }
}

.home-search-stage__dock--brand-logo {
  --bew-home-search-dock-start: calc(
    var(--bew-home-logo-inline-start) + var(--bew-top-bar-brand-logo-width) + var(--bew-space-2) * 2 +
      var(--bew-top-bar-section-gap)
  );
}

.content-enter-active,
.content-leave-active {
  transition: opacity var(--bew-duration-fast) var(--bew-ease-standard);
}
.content-enter-from,
.content-leave-to {
  opacity: 0;
}
.content-leave-active {
  pointer-events: none;
}
@media (prefers-reduced-motion: reduce) {
  .content-enter-active,
  .content-leave-active {
    transition: none;
  }
}

.home-control-surface {
  /* 关键优化：绘制隔离，防止重绘传播 */
  contain: paint layout;
  /* 创建独立堆叠上下文，减少合成压力 */
  isolation: isolate;
}

// Reserve the same toolbar geometry without exposing unrelated actions or
// keyboard targets on another Home tab.
.home-control-surface--inactive {
  visibility: hidden;
  pointer-events: none;
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

.home-navigation {
  display: flex;
  align-items: center;
  gap: var(--bew-space-3);
  min-width: 0;
  max-width: 100%;

  .home-tabs-panel {
    min-width: 0;
    flex: 0 1 auto;
  }
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
  .home-navigation {
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
</style>
