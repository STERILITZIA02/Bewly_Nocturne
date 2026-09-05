<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { useThrottleFn } from '@vueuse/core'
import type { AsyncComponentLoader } from 'vue'

import LiquidSegmentIndicator from '~/components/LiquidSegmentIndicator.vue'
import PageAsyncLoading from '~/components/PageAsyncLoading.vue'
import { useBewlyApp } from '~/composables/useAppProvider'
import { useSearchFocusEffect } from '~/composables/useSearchFocusEffect'
import { OVERLAY_SCROLL_BAR_SCROLL, TOP_BAR_VISIBILITY_CHANGE } from '~/constants/globalEvents'
import { HOME_SEARCH_STAGE_HEIGHT, HOME_SEARCH_STICKY_SCROLL_TOP } from '~/constants/layout'
import { gridLayout, settings } from '~/logic'
import { useLayoutEditSettingValue, vLayoutEditable } from '~/logic/layoutEdit'
import type { HomeTab } from '~/stores/mainStore'
import { useMainStore } from '~/stores/mainStore'
import { useTopBarStore } from '~/stores/topBarStore'
import { resolveAuthenticatedAccountId } from '~/utils/accountScope'
import { normalizeHomeTabConfig } from '~/utils/homeTabConfig'
import emitter from '~/utils/mitt'

import VersionReminder from './components/VersionReminder.vue'
import type { GridLayoutIcon } from './types'
import { HomeSubPage } from './types'

const mainStore = useMainStore()
const topBarStore = useTopBarStore()
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
const tabScrollPositions = new Map<HomeSubPage, number>()
let pendingTabScrollTop: number | null = null
let tabSwitchFrame: number | null = null

// 使用全局的homeActivatedPage状态
const activatedPage = homeActivatedPage
function defineHomePageComponent(loader: AsyncComponentLoader) {
  return defineAsyncComponent({
    loader,
    loadingComponent: PageAsyncLoading,
    delay: 120,
  })
}

// KeepAlive 依赖稳定的组件类型，不能在 computed 内重复创建异步组件包装器。
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
const tabContentLoading = ref<boolean>(false)
const currentTabs = ref<HomeTab[]>([])
const tabPageRef = ref()
const topBarVisibility = ref<boolean>(true)
const homeGridLayout = useLayoutEditSettingValue('page.home.gridLayout', () => gridLayout.value.home)
const shouldShowHomeTabs = computed(() => currentTabs.value.length > 1)
const shouldShowHomeHeader = computed(() => shouldShowHomeTabs.value || settings.value.enableGridLayoutSwitcher)
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

  // Recreate the KeepAlive scope once per real identity transition. Only the
  // active tab mounts and reloads now; other tabs reload lazily when selected.
  // Destroying the old scope also prevents late anonymous/previous-account
  // responses from becoming visible in the new account.
  tabContentLoading.value = false
  homeAccountGeneration.value++
})

function getInitialTabScrollTop(): number {
  return settings.value.useSearchPageModeOnHomePage ? HOME_SEARCH_STAGE_HEIGHT : 0
}

function restoreTabScrollPosition() {
  if (pendingTabScrollTop === null)
    return

  const viewport = scrollViewportRef.value
  if (viewport)
    viewport.scrollTop = pendingTabScrollTop

  pendingTabScrollTop = null
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

watch(activatedPage, (newPage, oldPage) => {
  const viewport = scrollViewportRef.value
  if (!viewport)
    return

  tabScrollPositions.set(oldPage, viewport.scrollTop)
  pendingTabScrollTop = tabScrollPositions.get(newPage) ?? getInitialTabScrollTop()
  isHomeTabSwitching.value = true
}, { flush: 'sync' })

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
})

onUnmounted(() => {
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
    <main>
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
        }"
        w-full z-9
      >
        <section
          v-if="shouldShowHomeTabs"
          v-layout-editable="'home-tabs'"
          class="glass-panel home-tabs-panel bew-segment-control bew-segment-control--surface"
          data-layout-editable-id="home-tabs"
          :class="{
            'bew-segment-control--solid': settings.disableFrostedGlass,
          }"
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

        <div
          v-if="settings.enableGridLayoutSwitcher"
          v-layout-editable="'home-grid-switcher'"
          class="glass-panel home-grid-layout-switcher bew-segment-control bew-segment-control--surface"
          data-layout-editable-id="home-grid-switcher"
          :class="{
            'bew-segment-control--solid': settings.disableFrostedGlass,
          }"
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
          <Loading
            v-if="homeAccountScope === 'profile-unavailable'"
            min-h="240px"
            flex="~ items-center"
          />
          <KeepAlive v-else :key="homeAccountGeneration" :max="8">
            <Component
              :is="pages[activatedPage]" :key="activatedPageCacheKey"
              ref="tabPageRef"
              :grid-layout="homeGridLayout"
              :top-bar-visibility="topBarVisibility"
              @before-loading="toggleTabContentLoading(true)"
              @after-loading="toggleTabContentLoading(false)"
            />
          </KeepAlive>
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

.glass-panel {
  /* 毛玻璃关闭时 --bew-filter-glass-1 为 none；同时配合 --solid 去掉 surface 上的 filter */
  backdrop-filter: var(--bew-filter-glass-1);
  /* 关键优化：绘制隔离，防止重绘传播 */
  contain: paint layout;
  /* 创建独立堆叠上下文，减少合成压力 */
  isolation: isolate;
}

.glass-panel.bew-segment-control--solid {
  backdrop-filter: none;
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

.home-grid-layout-switcher {
  grid-column: 2;
  justify-self: end;
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
