<script setup lang="ts">
import { useEventListener, useIntersectionObserver, useThrottleFn } from '@vueuse/core'
import type { AsyncComponentLoader, Ref } from 'vue'
import { provide, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import AppAuthorizationDialog from '~/components/AppAuthorizationDialog.vue'
import AppGradientBackground from '~/components/AppGradientBackground.vue'
import ConfirmDialog from '~/components/ConfirmDialog.vue'
import Dock from '~/components/Dock/Dock.vue'
import ElementSettingsContextMenu from '~/components/ElementSettingsContextMenu.vue'
import IframeDrawer from '~/components/IframeDrawer.vue'
import IframePage from '~/components/IframePage.vue'
import ImageViewerHost from '~/components/ImageViewer/ImageViewerHost.vue'
import LayoutEditorOverlay from '~/components/LayoutEditorOverlay.vue'
import LocalLoudnessPanel from '~/components/LocalLoudnessPanel.vue'
import PageAsyncLoading from '~/components/PageAsyncLoading.vue'
import PersistentSidebar from '~/components/PersistentSidebar.vue'
import Settings from '~/components/Settings/Settings.vue'
import SideBar from '~/components/SideBar/SideBar.vue'
import TopBar from '~/components/TopBar/TopBar.vue'
import type { BewlyAppProvider } from '~/composables/useAppProvider'
import { DrawerType, UndoForwardState } from '~/composables/useAppProvider'
import { confirmDialogKey } from '~/composables/useConfirmDialog'
import { useConfirmDialogHost } from '~/composables/useConfirmDialogHost'
import { useCurrentLocationHref } from '~/composables/useCurrentLocationHref'
import { useDark } from '~/composables/useDark'
import { useHomePageRoute } from '~/composables/useHomePageRoute'
import { localLoudnessPanelOpen } from '~/composables/useLocalLoudness'
import { providePageViewState } from '~/composables/usePageViewState'
import { providePanelOrigin } from '~/composables/usePanelOrigin'
import { useReadyPageTransition } from '~/composables/useReadyPageTransition'
import { onRouteChange } from '~/composables/useRouteState'
import { useSettingsMotion } from '~/composables/useSettingsMotion'
import { useSettingsPanel } from '~/composables/useSettingsPanel'
import { provideSidebarHost, registerSidebarWidth } from '~/composables/useSidebarHost'
import { BEWLY_MOUNTED, OVERLAY_SCROLL_BAR_SCROLL, OVERLAY_SCROLL_STATE_CHANGE } from '~/constants/globalEvents'
import { PAGE_BRIDGE_MESSAGE, PAGE_BRIDGE_PROTOCOL, postPageBridgeMessage } from '~/constants/pageBridge'
import { setupWatchLaterAutoRemove } from '~/contentScripts/features/watchLaterAutoRemove'
import { observePlayerMode } from '~/contentScripts/playerDomLifecycle'
import { HomeSubPage } from '~/contentScripts/views/Home/types'
import { AppPage } from '~/enums/appEnums'
import { appAuthTokens, settings } from '~/logic'
import {
  appAuthorizationState,
  completeExternalAppAuthorization,
  synchronizeValidAppAuthorization,
} from '~/logic/appAuthorizationCoordinator'
import type { IframePlaybackContext } from '~/logic/iframePageState'
import { reportIframePlayerMode, setIframePageActive } from '~/logic/iframePageState'
import { exitLayoutEditMode } from '~/logic/layoutEdit'
import { getRecommendationRequestIdentity } from '~/logic/recommendationMode'
import type { DockItem } from '~/stores/mainStore'
import { useMainStore } from '~/stores/mainStore'
import { useSettingsStore } from '~/stores/settingsStore'
import { useTopBarStore } from '~/stores/topBarStore'
import { createAsyncPageRegistry } from '~/utils/asyncPage'
import { hasValidAppAuthTokens } from '~/utils/authProvider'
import { isBewlyWidescreenActive } from '~/utils/bewlyWidescreen'
import { setOriginalBilibiliTopBarScrolled } from '~/utils/bilibiliTopBar'
import { cleanBilibiliUrl } from '~/utils/bilibiliUrl'
import { showNativeBilibiliTopBar } from '~/utils/effectiveTopBarSource'
import { homeTabStateKey, resolveDefaultAppPage } from '~/utils/homeRoute'
import { readIframeDrawerHistory } from '~/utils/iframeDrawerHistory'
import { isSentinelWithinLoadThreshold } from '~/utils/loadMoreSentinel'
import { getUserID, isHomePage, isInIframe, isVideoOrBangumiPage, openLinkToNewTab, scrollToTop } from '~/utils/main'
import emitter from '~/utils/mitt'
import { getPageBridgeChannelId } from '~/utils/pageBridgeChannel'
import { resolvePageModeNavigationUrl, resolvePageModeTarget } from '~/utils/pageMode'
import { cancelScrollIntent, scrollToPosition } from '~/utils/scrollIntent'
import type { ViewportFrameReason, ViewportGeometry } from '~/utils/viewportGeometry'
import { invalidateViewportGeometry, readViewportGeometry, subscribeViewportFrame } from '~/utils/viewportGeometry'

import ImmersivePlaybackRail from './ImmersivePlaybackRail.vue'
import { setupNecessarySettingsWatchers } from './necessarySettingsWatchers'
import PlaybackCommentComposer from './PlaybackCommentComposer.vue'
import PlaybackRailTabsIndicator from './PlaybackRailTabsIndicator.vue'

const mainStore = useMainStore()
registerSidebarWidth()
const settingsStore = useSettingsStore()
const topBarStore = useTopBarStore()
const currentLocationHref = useCurrentLocationHref()
const appAccountScope = ref(String(getUserID() || 'guest'))
watch([() => topBarStore.userInfo.mid, currentLocationHref], () => {
  appAccountScope.value = String(getUserID() || 'guest')
}, { flush: 'sync' })
const effectiveTopBarSource = computed(() => settingsStore.getEffectiveTopBarSource())
const useOriginalBilibiliTopBar = computed(() => showNativeBilibiliTopBar(effectiveTopBarSource.value))
const { t } = useI18n()

const { isDark } = useDark()
const settingsMotion = useSettingsMotion()
const capturePanelOrigin = providePanelOrigin()
const dockBottomShift = ref(0)
const { showSettings, settingsDockHeld, onSettingsAfterLeave, settingsLaunchStyle, settingsNavigationRequest, toggleSettings, openSettingsAt, openLayoutEditorSetting } = useSettingsPanel()
const showAppAuthorizationDialog = computed(() => (
  appAuthorizationState.value === 'authorizing'
  || (settings.value.recommendationMode === 'app' && appAuthorizationState.value === 'invalid')
))
let appAuthorizationTokenObserverReady = false
watch(() => [
  appAuthTokens.value.accessToken,
  appAuthTokens.value.refreshToken,
  appAuthTokens.value.accessTokenExpiresAt,
  appAuthTokens.value.refreshTokenExpiresAt,
] as const, () => {
  if (!appAuthorizationTokenObserverReady) {
    appAuthorizationTokenObserverReady = true
    if (hasValidAppAuthTokens())
      synchronizeValidAppAuthorization(appAuthTokens.value.accessToken)
    return
  }
  if (!hasValidAppAuthTokens())
    return
  if (appAuthorizationState.value !== 'authorizing')
    completeExternalAppAuthorization(appAuthTokens.value.accessToken)
}, { immediate: true })

const confirmDialogHost = useConfirmDialogHost()
onScopeDispose(setupWatchLaterAutoRemove())
const { activeRequest: activeConfirmDialog } = confirmDialogHost
provide(confirmDialogKey, { confirm: confirmDialogHost.confirm })
let lastNativeCommentAccount = String(getUserID() ?? 'guest')
watch([
  currentLocationHref,
  () => topBarStore.isLogin,
  () => topBarStore.userInfo.mid,
], () => {
  confirmDialogHost.cancelAll()
  const account = String(getUserID() ?? 'guest')
  if (account === lastNativeCommentAccount)
    return
  lastNativeCommentAccount = account
  const channelId = getPageBridgeChannelId()
  if (channelId)
    postPageBridgeMessage(window, { protocol: PAGE_BRIDGE_PROTOCOL, channelId, type: PAGE_BRIDGE_MESSAGE.ACCOUNT_CHANGED })
}, { flush: 'sync' })

function getDefaultAppPage(): AppPage {
  return resolveDefaultAppPage(settings.value.dockItemsConfig)
}

const { activatedPage, homeActivatedPage, homeActivatedPageTouched, navigateToPage, navigateToHomeTab, resolveAvailableAppPage } = useHomePageRoute(getDefaultAppPage, mainStore.homeTabs.map(tab => ({
  page: tab.page,
  visible: tab.page !== HomeSubPage.Precious,
})), () => appAccountScope.value)
const isHomeTabSwitching = ref(false)
const displayedPage = ref(activatedPage.value)
const isPageSwitching = ref(false)
const pageViewCache = providePageViewState(() => appAccountScope.value)
provideSidebarHost(() => activatedPage.value)

const shouldUseOriginalSearchResultsPage = computed(() => {
  return activatedPage.value === AppPage.SearchResults
    && settingsStore.getDockItemIsUseOriginalBiliPage(AppPage.Search)
})

watch(shouldUseOriginalSearchResultsPage, (useOriginalBiliPage) => {
  if (!useOriginalBiliPage || !isHomePage(window.location.href) || isInIframe())
    return

  const target = resolvePageModeTarget(window.location.href, activatedPage.value)
  const navigationUrl = resolvePageModeNavigationUrl(window.location.href, target, true)
  if (navigationUrl)
    window.location.assign(navigationUrl)
}, { immediate: true })

// 监听 URL 变化,同步更新 activatedPage
watch(currentLocationHref, () => {
  exitLayoutEditMode()
  if (!isPageSwitching.value)
    cancelPageScrollRestore()
})

// URL normalization belongs to useHomePageRoute; the shell only owns the field.
if (activatedPage.value !== AppPage.Search && activatedPage.value !== AppPage.SearchResults && isHomePage())
  topBarStore.searchKeyword = ''

const asyncPages = createAsyncPageRegistry()
function definePageComponent(loader: AsyncComponentLoader, delay = 120) {
  return asyncPages.define(loader, {
    loadingComponent: PageAsyncLoading,
    delay,
  })
}

const pages = {
  [AppPage.Home]: definePageComponent(() => import('./Home/Home.vue')),
  [AppPage.Search]: definePageComponent(() => import('./Search/Search.vue')),
  [AppPage.SearchResults]: definePageComponent(() => import('./SearchResults/SearchResults.vue'), 0),
  [AppPage.Anime]: definePageComponent(() => import('./Anime/Anime.vue')),
  [AppPage.History]: definePageComponent(() => import('./History/History.vue')),
  [AppPage.WatchLater]: definePageComponent(() => import('./WatchLater/WatchLater.vue')),
  [AppPage.Favorites]: definePageComponent(() => import('./Favorites/Favorites.vue')),
  [AppPage.Moments]: definePageComponent(() => import('./Moments/Moments.vue')),
  [AppPage.Notifications]: definePageComponent(() => import('./Notifications/Notifications.vue')),
}
const mainAppRef = ref<HTMLElement>() as Ref<HTMLElement>
const LIBRARY_PAGES = [AppPage.Favorites, AppPage.WatchLater, AppPage.History, AppPage.Moments]
const RAIL_PAGES = [...LIBRARY_PAGES, AppPage.Notifications]
const isLibraryPage = computed(() => LIBRARY_PAGES.includes(displayedPage.value))
const scrollViewportRef = ref<HTMLElement | null>(null)
const loadMoreSentinelRef = ref<HTMLElement>() // ✅ IntersectionObserver 哨兵元素
const handlePageRefresh = ref<() => void>()
type ReachBottomResult = boolean | void
const handleReachBottom = ref<() => ReachBottomResult | Promise<ReachBottomResult>>()
const handleUndoRefresh = ref<() => void>()
const handleForwardRefresh = ref<() => void>()
const canRefreshHomeSubPage = ref<boolean>(false)
// 使用新的枚举状态管理撤销/前进按钮
const undoForwardState = ref<UndoForwardState>(UndoForwardState.Hidden)
let refreshScrollGeneration = 0
let refreshScrollTimer: ReturnType<typeof setTimeout> | null = null

function cancelPendingRefreshScroll() {
  refreshScrollGeneration++
  if (refreshScrollTimer) {
    clearTimeout(refreshScrollTimer)
    refreshScrollTimer = null
  }
}

function waitForScrollTop(viewport: HTMLElement, generation: number, startedAt: number, refresh = handlePageRefresh.value) {
  if (generation !== refreshScrollGeneration || !viewport.isConnected || viewport !== scrollViewportRef.value || refresh !== handlePageRefresh.value)
    return

  if (viewport.scrollTop === 0 || performance.now() - startedAt >= 1800) {
    refreshScrollTimer = null
    refresh?.()
    return
  }

  refreshScrollTimer = setTimeout(waitForScrollTop, 50, viewport, generation, startedAt, refresh)
}

const canRefreshCurrentPage = computed((): boolean => {
  return activatedPage.value !== AppPage.Home || homeActivatedPage.value === HomeSubPage.ForYou || canRefreshHomeSubPage.value
})
const handleThrottledPageRefresh = useThrottleFn(() => {
  if (!canRefreshCurrentPage.value)
    return

  cancelPendingRefreshScroll()
  const viewport = scrollViewportRef.value
  if (!viewport) {
    handlePageRefresh.value?.()
    return
  }
  if (viewport.scrollTop === 0) {
    handlePageRefresh.value?.()
  }
  else {
    handleBackToTop()
    const generation = refreshScrollGeneration
    const refresh = handlePageRefresh.value
    refreshScrollTimer = setTimeout(() => waitForScrollTop(viewport, generation, performance.now(), refresh), 50)
  }
}, 500)
const LOAD_MORE_THRESHOLD = 200
const handleThrottledReachBottom = useThrottleFn(async () => {
  const handler = handleReachBottom.value
  if (!handler)
    return

  const requestStarted = await handler()
  if (requestStarted === true)
    scheduleLoadMoreSentinelCheck()
}, 200)
const handleThrottledBackToTop = useThrottleFn(() => handleBackToTop(), 500)
const handleThrottledPageUnRefresh = useThrottleFn(() => handleUndoRefresh.value?.(), 500)
const handleThrottledPageForwardRefresh = useThrottleFn(() => handleForwardRefresh.value?.(), 500)

function checkLoadMoreSentinelGeometry() {
  const viewport = scrollViewportRef.value
  const sentinel = loadMoreSentinelRef.value
  if (!viewport || !sentinel || isHomeTabSwitching.value || isPageSwitching.value)
    return

  const geometry = readViewportGeometry(viewport)
  if (isSentinelWithinLoadThreshold(
    { top: geometry.top, bottom: geometry.top + geometry.clientHeight },
    sentinel.getBoundingClientRect(),
    LOAD_MORE_THRESHOLD,
  )) {
    handleThrottledReachBottom()
  }
}

// The observer owns the preload-zone state. Scroll frames only reuse it; one
// geometry check runs after commits, restores and resizes, where the observer
// may not report a change for a sentinel that stays inside the zone.
let loadMoreSentinelIntersecting = false
const { stop: stopLoadMoreObserver } = useIntersectionObserver(
  loadMoreSentinelRef,
  ([{ isIntersecting }]) => {
    loadMoreSentinelIntersecting = isIntersecting
    if (isIntersecting && !isHomeTabSwitching.value && !isPageSwitching.value)
      handleThrottledReachBottom()
  },
  {
    root: scrollViewportRef,
    rootMargin: `${LOAD_MORE_THRESHOLD}px`,
    threshold: 0,
  },
)
const reachTop = ref<boolean>(true)
/** Coalesced into the viewport's next layout frame, after the pending DOM commit. */
function scheduleLoadMoreSentinelCheck() {
  invalidateViewportGeometry(scrollViewportRef.value)
}

watch(isHomeTabSwitching, (switching) => {
  if (!switching)
    scheduleLoadMoreSentinelCheck()
})

const iframeDrawerURL = ref<string>('')
const iframeDrawerContext = ref<IframePlaybackContext>()
const showIframeDrawer = ref<boolean>(false)
const iframeDrawerRef = ref<{ close: () => Promise<void> }>()

// 添加活跃抽屉状态管理
const activeDrawer = ref<DrawerType>(DrawerType.None)
function setActiveDrawer(drawer: DrawerType) {
  activeDrawer.value = drawer
}

// 用于控制当iframe内打开图片预览时隐藏顶栏和Dock
const hideUIForIframePhotoViewer = ref<boolean>(false)

const iframePageRef = ref()

const iframePageURL = computed((): string => {
  // If the iframe is not the BiliBili homepage or in iframe, then don't show the iframe page
  if (!isHomePage(currentLocationHref.value) || isInIframe())
    return ''
  const dockItem = mainStore.getDockItemByPage(activatedPage.value)
  if (!dockItem)
    return ''

  return settingsStore.getDockItemIsUseOriginalBiliPage(activatedPage.value) || !dockItem.hasBewlyPage
    ? mainStore.getBiliWebPageURLByPage(activatedPage.value)
    : ''
})

function handleIframePhotoViewerChange(open: boolean, url: string) {
  if (url === iframePageURL.value)
    hideUIForIframePhotoViewer.value = open
}

watch(iframePageURL, (url) => {
  hideUIForIframePhotoViewer.value = false
  setIframePageActive(Boolean(url))
}, { immediate: true })
onBeforeUnmount(() => setIframePageActive(false))
const showBewlyPage = computed((): boolean => {
  if (isInIframe())
    return false

  const onHomePage = isHomePage(currentLocationHref.value)
  // SearchResults 页面是虚拟页面，不在 dockItems 中，但应该显示
  if (activatedPage.value === AppPage.SearchResults)
    return onHomePage

  const dockItem = mainStore.getDockItemByPage(activatedPage.value)
  if (!dockItem?.hasBewlyPage)
    return false

  if (iframePageURL.value)
    return false

  return onHomePage
})

const pageContentMinHeight = ref<number>()
let scrollRestoreObserver: ResizeObserver | undefined
let pendingPageScroll: number | undefined
function pageScrollKey(page: AppPage) {
  return page === AppPage.Home
    ? `${page}:${homeTabStateKey(homeActivatedPage.value, getRecommendationRequestIdentity())}`
    : page
}
function cancelPageScrollRestore() {
  pendingPageScroll = undefined
  scrollRestoreObserver?.disconnect()
  scrollRestoreObserver = undefined
}
function restorePageScroll() {
  const viewport = scrollViewportRef.value
  if (!viewport || pendingPageScroll === undefined)
    return
  const top = pendingPageScroll
  // Through the shared intent so an older pagination claim yields to this restore.
  scrollToPosition(viewport, top)
  reachTop.value = viewport.scrollTop === 0
  // A returning data-only page may still be rebuilding its list. Keep one
  // bounded observer until its content can accommodate the saved position.
  if (!isPageSwitching.value && viewport.scrollHeight - viewport.clientHeight >= top - 1)
    cancelPageScrollRestore()
}
const pageTransition = useReadyPageTransition(() => showBewlyPage.value ? pages[activatedPage.value as keyof typeof pages] : undefined, asyncPages.preload, {
  onStart() {
    const viewport = scrollViewportRef.value
    if (!isPageSwitching.value && viewport)
      pageViewCache.scroll.set(pageScrollKey(displayedPage.value), pendingPageScroll ?? viewport.scrollTop)
    cancelPageScrollRestore()
    isPageSwitching.value = showBewlyPage.value
    if (!showBewlyPage.value) {
      pageContentMinHeight.value = undefined
      return
    }
    if (viewport)
      pageContentMinHeight.value = viewport.scrollHeight
  },
  onSwap() {
    displayedPage.value = activatedPage.value
    pendingPageScroll = pageViewCache.scroll.get(pageScrollKey(activatedPage.value)) ?? 0
    const viewport = scrollViewportRef.value
    if (viewport)
      pageContentMinHeight.value = Math.max(pageContentMinHeight.value ?? 0, pendingPageScroll + viewport.clientHeight)
  },
  onEnter(element) {
    displayedPage.value = activatedPage.value
    pendingPageScroll ??= pageViewCache.scroll.get(pageScrollKey(activatedPage.value)) ?? 0
    restorePageScroll()
    if (typeof ResizeObserver !== 'undefined') {
      scrollRestoreObserver?.disconnect()
      scrollRestoreObserver = new ResizeObserver(restorePageScroll)
      scrollRestoreObserver.observe(element)
    }
  },
  onSettled() {
    isPageSwitching.value = false
    pageContentMinHeight.value = undefined
    void nextTick(() => {
      restorePageScroll()
      focusScrollViewport({ force: true })
      scheduleLoadMoreSentinelCheck()
    })
  },
})
onScopeDispose(cancelPageScrollRestore)
useEventListener(scrollViewportRef, 'wheel', cancelPageScrollRestore, { passive: true })
useEventListener(scrollViewportRef, 'touchstart', cancelPageScrollRestore, { passive: true })
useEventListener(scrollViewportRef, 'pointerdown', cancelPageScrollRestore, { passive: true })
useEventListener(scrollViewportRef, 'keydown', (event) => {
  if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key))
    cancelPageScrollRestore()
})

// SearchResults owns a keyword-aware title. Other Bewly shell pages follow the
// currently selected Dock page (and Home sub-tab) and react to locale changes.
const dockPageTitle = computed<string | undefined>(() => {
  if (
    !showBewlyPage.value
    || activatedPage.value === AppPage.SearchResults
    || activatedPage.value === AppPage.Notifications
  ) {
    return undefined
  }

  const titleKey = activatedPage.value === AppPage.Home
    ? mainStore.homeTabs.find(tab => tab.page === homeActivatedPage.value)?.i18nKey
    : mainStore.getDockItemByPage(activatedPage.value)?.i18nKey

  return titleKey ? `${t(titleKey)} - 哔哩哔哩` : undefined
})

watch(dockPageTitle, (title) => {
  if (title)
    document.title = title
}, { immediate: true })
const showTopBar = computed((): boolean => {
  const onHomePage = isHomePage(currentLocationHref.value)
  // When using the open in drawer feature, the iframe inside the page will hide the top bar
  if (isVideoOrBangumiPage() && isInIframe())
    return false

  // Always show TopBar in the outer layer, never inside iframe
  // This ensures TopBar is always visible outside of iframe content
  if (isInIframe())
    return false

  // when using original bilibili homepage, show top bar
  return (onHomePage && !settingsStore.getDockItemIsUseOriginalBiliPage(activatedPage.value))
  // when using original bilibili page on home page, show top bar in outer layer
    || (onHomePage && settingsStore.getDockItemIsUseOriginalBiliPage(activatedPage.value))
  // when not on home page, show top bar
    || !onHomePage
})

function getActiveElement(): Element | null {
  const shadowRoot = document.getElementById('bewly')?.shadowRoot
  return shadowRoot?.activeElement || document.activeElement
}

function isEditableElement(element: Element | null): boolean {
  return element instanceof HTMLInputElement
    || element instanceof HTMLTextAreaElement
    || element instanceof HTMLSelectElement
    || (element instanceof HTMLElement && (element.isContentEditable || !!element.closest('[contenteditable="true"]')))
}

function focusScrollViewport(options: { force?: boolean } = {}) {
  nextTick(() => {
    const viewport = scrollViewportRef.value
    if (!viewport || !showBewlyPage.value)
      return

    if (showSettings.value || activeDrawer.value !== DrawerType.None || (!options.force && isEditableElement(getActiveElement())))
      return

    viewport.focus({ preventScroll: true })
  })
}

watch(
  () => activatedPage.value,
  () => {
    // Load only the selected view, during the outgoing fade rather than after it.
    // This imports code only; requests start when the incoming component mounts.
    const component = pages[activatedPage.value as keyof typeof pages]
    if (showBewlyPage.value && component)
      asyncPages.preload(component)
    exitLayoutEditMode()
    cancelPendingRefreshScroll()
  },
  { immediate: true },
)

watch(homeActivatedPage, cancelPendingRefreshScroll)

watch(() => settings.value.pageMode, exitLayoutEditMode)

onScopeDispose(() => {
  cancelPendingRefreshScroll()
  exitLayoutEditMode()
})

watch(
  () => showBewlyPage.value,
  (visible) => {
    if (visible)
      focusScrollViewport()
    else
      exitLayoutEditMode()
  },
  { immediate: true, flush: 'post' },
)

// Drop outgoing closures before the incoming view installs its actions.
watch([
  activatedPage,
  () => activatedPage.value === AppPage.Home ? homeActivatedPage.value : undefined,
  () => activatedPage.value === AppPage.Home && homeActivatedPage.value === HomeSubPage.ForYou ? getRecommendationRequestIdentity() : undefined,
  showBewlyPage,
], () => {
  cancelPendingRefreshScroll()
  handlePageRefresh.value = undefined
  handleReachBottom.value = undefined
  handleUndoRefresh.value = undefined
  handleForwardRefresh.value = undefined
  undoForwardState.value = UndoForwardState.Hidden
  canRefreshHomeSubPage.value = false
}, { flush: 'sync' })

// Setup necessary settings watchers
setupNecessarySettingsWatchers(scrollViewportRef)
let scrollingEmitted = false

function handleDocumentScroll() {
  reachTop.value = window.scrollY <= 0
}

onMounted(() => {
  window.dispatchEvent(new CustomEvent(BEWLY_MOUNTED))

  if (isHomePage()) {
    focusScrollViewport()
  }

  document.addEventListener('scroll', handleDocumentScroll, { passive: true })
})

function handleDockItemClick(dockItem: DockItem) {
  if (dockItem.openInNewTab) {
    openLinkToNewTab(settingsStore.resolveDockPageHref(dockItem.page))
    return
  }
  if (!isHomePage()) {
    location.href = settingsStore.resolveDockPageHref(dockItem.page)
    return
  }
  changeActivatePage(dockItem.page)
  if (dockItem.page !== AppPage.SearchResults)
    topBarStore.searchKeyword = ''
}

function getDockPageHref(page: AppPage): string {
  return settingsStore.resolveDockPageHref(resolveAvailableAppPage(page))
}

function navigateToDockPage(page: AppPage): void {
  const dockItem = settingsStore.getEffectiveDockItemByPage(resolveAvailableAppPage(page))
  if (dockItem)
    handleDockItemClick(dockItem)
}

function changeActivatePage(pageName: AppPage) {
  const targetPage = resolveAvailableAppPage(pageName)
  const scrollTop: number = scrollViewportRef.value?.scrollTop ?? 0

  if (activatedPage.value === targetPage) {
    if (activatedPage.value !== AppPage.Search && activatedPage.value !== AppPage.SearchResults) {
      if (scrollTop === 0)
        handleThrottledPageRefresh()
      else
        handleThrottledBackToTop()
    }
    return
  }
  navigateToPage(targetPage)
}

function handleBackToTop(targetScrollTop = 0 as number) {
  const viewport = scrollViewportRef.value
  if (viewport) {
    scrollToTop(viewport, targetScrollTop)
  }

  iframePageRef.value?.handleBackToTop()
}

let scrollStateTimer: ReturnType<typeof setTimeout> | null = null
let emittedScrollTop: number | undefined

// The raw event only marks the start; reads happen once in the shared frame.
function handleNativeScroll() {
  if (!scrollingEmitted) {
    emitter.emit(OVERLAY_SCROLL_STATE_CHANGE, true)
    scrollingEmitted = true
  }
}

function handleViewportFrame(geometry: ViewportGeometry, reason: ViewportFrameReason) {
  const { scrollTop } = geometry
  if (scrollTop !== emittedScrollTop) {
    emittedScrollTop = scrollTop
    emitter.emit(OVERLAY_SCROLL_BAR_SCROLL, scrollTop)
    if (useOriginalBilibiliTopBar.value)
      setOriginalBilibiliTopBarScrolled(document, scrollTop > 0)
    reachTop.value = scrollTop === 0
  }

  if (reason === 'layout')
    checkLoadMoreSentinelGeometry()
  // A sentinel that stays inside the preload zone reports no new intersection.
  else if (loadMoreSentinelIntersecting && !isHomeTabSwitching.value && !isPageSwitching.value)
    handleThrottledReachBottom()

  if (!scrollingEmitted)
    return
  if (scrollStateTimer)
    clearTimeout(scrollStateTimer)
  // 150ms 内没有新的滚动帧时发出一次滚动结束信号
  scrollStateTimer = setTimeout(() => {
    scrollStateTimer = null
    emitter.emit(OVERLAY_SCROLL_STATE_CHANGE, false)
    scrollingEmitted = false
  }, 150)
}

watch(scrollViewportRef, (viewport, _previous, onCleanup) => {
  if (viewport)
    onCleanup(subscribeViewportFrame(viewport, handleViewportFrame))
}, { immediate: true, flush: 'post' })

onBeforeUnmount(() => {
  stopLoadMoreObserver()
  if (scrollViewportRef.value)
    cancelScrollIntent(scrollViewportRef.value)
  document.removeEventListener('scroll', handleDocumentScroll)
  if (scrollStateTimer) {
    clearTimeout(scrollStateTimer)
    scrollStateTimer = null
  }
  if (scrollingEmitted) {
    emitter.emit(OVERLAY_SCROLL_STATE_CHANGE, false)
    scrollingEmitted = false
  }
})

function openIframeDrawer(url: string, options?: { playbackContext?: IframePlaybackContext }) {
  cancelPageScrollRestore()
  const isSameOrigin = (origin: URL, destination: URL) =>
    origin.protocol === destination.protocol && origin.host === destination.host && origin.port === destination.port

  try {
    const currentUrl = new URL(location.href)
    const destination = new URL(url, currentUrl)
    if (!['http:', 'https:'].includes(destination.protocol) || !isSameOrigin(currentUrl, destination)) {
      openLinkToNewTab(destination.href)
      return
    }

    setActiveDrawer(DrawerType.IframeDrawer)
    iframeDrawerContext.value = options?.playbackContext
    iframeDrawerURL.value = destination.href
    showIframeDrawer.value = true
  }
  catch {
    // An invalid URL cannot be normalized safely for either the drawer or a new tab.
  }
}

onScopeDispose(onRouteChange(({ href }) => {
  const entry = readIframeDrawerHistory(window.history.state, href)
  if (!entry) {
    if (showIframeDrawer.value)
      void iframeDrawerRef.value?.close()
    return
  }
  if (showIframeDrawer.value)
    return
  iframeDrawerURL.value = href
  iframeDrawerContext.value = entry.playbackContext
  setActiveDrawer(DrawerType.IframeDrawer)
  showIframeDrawer.value = true
}))

function handleIframeDrawerClosed() {
  showIframeDrawer.value = false
  // A rapid Forward during the old drawer's exit belongs to the new entry.
  void nextTick(() => {
    const href = window.location.href
    const entry = readIframeDrawerHistory(window.history.state, href)
    if (!entry)
      return
    iframeDrawerURL.value = href
    iframeDrawerContext.value = entry.playbackContext
    setActiveDrawer(DrawerType.IframeDrawer)
    showIframeDrawer.value = true
  })
}

/**
 * Checks if the current viewport has a scrollbar.
 * @returns {Promise<boolean>} Returns true if the viewport has a scrollbar, false otherwise.
 */
async function haveScrollbar() {
  await nextTick()
  const viewport = scrollViewportRef.value
  if (!viewport)
    return false

  return viewport.scrollHeight > viewport.clientHeight
}

watchEffect((onCleanup) => {
  if (!isInIframe() || !isVideoOrBangumiPage(currentLocationHref.value))
    return
  onCleanup(observePlayerMode(mode => reportIframePlayerMode(isBewlyWidescreenActive() ? 'bewlyWidescreen' : mode)))
})

provide<BewlyAppProvider>('BEWLY_APP', {
  activatedPage,
  homeActivatedPage,
  homeActivatedPageTouched,
  navigateToPage,
  navigateToHomeTab,
  isHomeTabSwitching,
  isPageSwitching,
  mainAppRef,
  scrollViewportRef,
  reachTop,
  handleBackToTop,
  handlePageRefresh,
  canRefreshHomeSubPage,
  handleReachBottom,
  handleUndoRefresh,
  handleForwardRefresh,
  undoForwardState,
  openIframeDrawer,
  haveScrollbar,
  requestLoadMoreCheck: scheduleLoadMoreSentinelCheck,
  activeDrawer,
  setActiveDrawer,
  getDockPageHref,
  navigateToDockPage,
  openLayoutEditorSetting,
  openSettingsAt,
})

let isCleaningUrl = false
let cleanupTimer: ReturnType<typeof setTimeout> | undefined
let cleanupApplyTimer: ReturnType<typeof setTimeout> | undefined
let cleanupIdleCallback: number | undefined

function stopUrlCleaner() {
  if (cleanupTimer !== undefined)
    clearTimeout(cleanupTimer)
  if (cleanupApplyTimer !== undefined)
    clearTimeout(cleanupApplyTimer)
  if (cleanupIdleCallback !== undefined)
    window.cancelIdleCallback?.(cleanupIdleCallback)
  cleanupTimer = undefined
  cleanupApplyTimer = undefined
  cleanupIdleCallback = undefined
  isCleaningUrl = false
}

function cleanUrlParams() {
  // 防止在页面加载过程中执行URL清理
  if (isCleaningUrl || document.readyState === 'loading') {
    return
  }

  try {
    isCleaningUrl = true
    const currentUrl = window.location.href
    const cleanedUrl = cleanBilibiliUrl(currentUrl)

    if (cleanedUrl !== currentUrl) {
      // 使用 requestIdleCallback 来避免阻塞页面加载
      if (window.requestIdleCallback) {
        cleanupIdleCallback = window.requestIdleCallback(() => {
          cleanupIdleCallback = undefined
          if (settings.value.cleanUrlArgument && window.location.href === currentUrl)
            history.replaceState(history.state, '', cleanedUrl)
          isCleaningUrl = false
        })
      }
      else {
        cleanupApplyTimer = setTimeout(() => {
          cleanupApplyTimer = undefined
          if (settings.value.cleanUrlArgument && window.location.href === currentUrl)
            history.replaceState(history.state, '', cleanedUrl)
          isCleaningUrl = false
        }, 0)
      }
    }
    else {
      isCleaningUrl = false
    }
  }
  catch (error) {
    console.warn('URL清理失败:', error)
    isCleaningUrl = false
  }
}

function scheduleCleanup(delay = 1000) {
  if (!settings.value.cleanUrlArgument)
    return
  if (cleanupTimer !== undefined)
    clearTimeout(cleanupTimer)
  cleanupTimer = setTimeout(() => {
    cleanupTimer = undefined
    if (document.readyState !== 'loading')
      cleanUrlParams()
  }, delay)
}

function startUrlCleaner() {
  stopUrlCleaner()
  scheduleCleanup(0)
}

watch(() => settings.value.cleanUrlArgument, (enabled) => {
  if (enabled)
    startUrlCleaner()
  else
    stopUrlCleaner()
}, { immediate: true })

watch(currentLocationHref, () => {
  if (settings.value.cleanUrlArgument)
    scheduleCleanup()
})

onBeforeUnmount(stopUrlCleaner)
</script>

<template>
  <div
    id="bewly-wrapper"
    ref="mainAppRef"
    class="bewly-wrapper"
    :style="{ '--bew-dock-bottom-shift': `${dockBottomShift}px` }"
    :class="{
      'dark': isDark,
      'bewly-wrapper--wide-sidebar': displayedPage === AppPage.Notifications,
      'bewly-wrapper--viewport': isHomePage(currentLocationHref),
    }"
    text="$bew-text-1 size-$bew-base-font-size"
    @click.capture="capturePanelOrigin"
    @keydown.capture="capturePanelOrigin"
  >
    <!-- Theme color gradient -->
    <template v-if="showBewlyPage">
      <AppGradientBackground :activated-page="activatedPage" />
    </template>

    <LayoutEditorOverlay v-if="!isInIframe()" @open-setting="openLayoutEditorSetting" />
    <ElementSettingsContextMenu v-if="!isInIframe()" @open-setting="openLayoutEditorSetting" />

    <!-- Settings -->
    <Transition v-bind="settingsMotion" @after-leave="onSettingsAfterLeave">
      <KeepAlive>
        <Settings
          v-if="showSettings"
          class="settings-layer"
          :navigation-request="settingsNavigationRequest"
          :style="settingsLaunchStyle"
          @close="showSettings = false"
        />
      </KeepAlive>
    </Transition>

    <!-- Dock & RightSideButtons -->
    <div
      v-if="!isInIframe()"
      pos="absolute top-0 left-0" w-full h-full overflow-hidden
      pointer-events-none
      :style="{
        opacity: hideUIForIframePhotoViewer ? 0 : 1,
        transition: 'opacity 0.2s ease',
      }"
    >
      <Dock
        v-if="settings.alwaysUseDock || (showBewlyPage || iframePageURL)"
        pointer-events-auto
        :activated-page="activatedPage"
        :settings-open="settingsDockHeld"
        @bottom-shift-change="dockBottomShift = $event"
        @settings-visibility-change="toggleSettings"
        @refresh="handleThrottledPageRefresh"
        @undo-refresh="handleThrottledPageUnRefresh"
        @forward-refresh="handleThrottledPageForwardRefresh"
        @back-to-top="handleThrottledBackToTop"
        @dock-item-click="handleDockItemClick"
      />
      <SideBar
        v-else
        pointer-events-auto
        :activated-page="activatedPage"
        @settings-visibility-change="toggleSettings"
      />
    </div>

    <!-- The destination page (not the one still displayed) drives the rail, so it
         folds or unfolds before the incoming page mounts. -->
    <PersistentSidebar :active="showBewlyPage && RAIL_PAGES.includes(activatedPage)" />

    <!-- TopBar -->
    <div
      v-if="showTopBar"
      class="top-bar-host"
      :class="{ 'top-bar-host--messages': showBewlyPage && activatedPage === AppPage.Notifications, 'top-bar-host--library': showBewlyPage && isLibraryPage }"
      :style="{
        opacity: hideUIForIframePhotoViewer ? 0 : 1,
        pointerEvents: hideUIForIframePhotoViewer ? 'none' : 'auto',
        transition: 'opacity 0.2s ease',
      }"
    >
      <TopBar
        class="top-bar-layer"
        pos="top-0 left-0" w-full
      />
    </div>

    <div
      pos="absolute top-0 left-0" w-full h-full
      :style="{
        height: showBewlyPage || iframePageURL ? '100dvh' : '0',
      }"
    >
      <Transition name="fade">
        <template v-if="showBewlyPage">
          <div
            ref="scrollViewportRef"
            class="bewly-scroll-viewport"
            h-inherit of-y-auto of-x-hidden
            tabindex="-1"
            style="overscroll-behavior: contain;"
            @scroll.passive="handleNativeScroll"
          >
            <main
              m-auto max-w="$bew-page-max-width"
              :class="{ 'bewly-page-container--messages': displayedPage === AppPage.Notifications, 'bewly-page-container--library': isLibraryPage }"
            >
              <div
                class="bewly-page-content"
                :class="{ 'bewly-page-content--messages': displayedPage === AppPage.Notifications, 'bewly-page-content--library': isLibraryPage, 'bewly-page-content--home': displayedPage === AppPage.Home }"
                p="t-[calc(var(--bew-top-bar-height)+10px)]" m-auto
                w="lg:[calc(100%-200px)] [calc(100%-150px)]"
                :style="{
                  minHeight: pageContentMinHeight === undefined ? undefined : `${pageContentMinHeight}px`,
                  paddingTop: displayedPage !== AppPage.Notifications && !isLibraryPage && useOriginalBilibiliTopBar && !reachTop ? 'calc(var(--bew-top-bar-height) + 120px)' : undefined,
                }"
              >
                <Transition appear mode="out-in" v-bind="pageTransition" @after-enter="scheduleLoadMoreSentinelCheck">
                  <KeepAlive :include="['BewlyHomePage']" :max="1">
                    <Component :is="pages[activatedPage]" :key="activatedPage" />
                  </KeepAlive>
                </Transition>

                <!-- ✅ IntersectionObserver 哨兵：用于检测滚动到底部，避免在 RAF 中读取 scrollHeight -->
                <div
                  v-if="activatedPage !== AppPage.Notifications"
                  ref="loadMoreSentinelRef"
                  h-1px w-full pointer-events-none opacity-0
                />
              </div>
            </main>
          </div>
        </template>
      </Transition>

      <Transition v-if="!showBewlyPage && iframePageURL && !isInIframe()" name="fade">
        <IframePage ref="iframePageRef" :url="iframePageURL" @photo-viewer-change="handleIframePhotoViewerChange" />
      </Transition>
    </div>

    <IframeDrawer
      v-if="showIframeDrawer"
      ref="iframeDrawerRef"
      :url="iframeDrawerURL"
      :playback-context="iframeDrawerContext"
      @close="handleIframeDrawerClosed"
    />

    <AppAuthorizationDialog v-if="showAppAuthorizationDialog" />
    <LocalLoudnessPanel v-if="localLoudnessPanelOpen" />
    <PlaybackCommentComposer v-if="!isInIframe()" />
    <PlaybackRailTabsIndicator />
    <ImmersivePlaybackRail />

    <!-- Keep the static overlay removal before resolving a caller's request. -->
    <ConfirmDialog
      v-if="activeConfirmDialog"
      :key="activeConfirmDialog.id"
      :message="activeConfirmDialog.message"
      @finish="confirmDialogHost.finish"
    />
    <ImageViewerHost />
  </div>
</template>

<style lang="scss" scoped>
.bewly-wrapper {
  --bew-active-sidebar-width: var(--bew-sidebar-base-width);
  --bew-messages-sidebar-width: var(--bew-active-sidebar-width);
  transition: --bew-active-sidebar-width var(--bew-duration-normal) var(--bew-ease-standard);
}
.bewly-wrapper--wide-sidebar {
  --bew-active-sidebar-width: var(--bew-sidebar-message-width);
}
@media (prefers-reduced-motion: reduce) {
  .bewly-wrapper {
    transition: none;
  }
}
.top-bar-layer {
  z-index: var(--bew-z-topbar-host);
}

// Let the persistent rail sit above the top bar's own surface, while keeping
// top-bar controls/popovers above it.
.top-bar-host--messages,
.top-bar-host--library {
  :deep(.top-bar-layer),
  :deep(.top-bar) {
    z-index: auto;
  }

  :deep(.top-bar) {
    // Fixed creates a stacking context even at z-index:auto. The message page
    // has a stationary viewport, so absolute preserves its position and lets
    // controls stack above cards while the decorative edge stays below the rail.
    position: absolute;
  }

  :deep(.top-bar-header__side),
  :deep(.top-bar-header__search) {
    position: relative;
    z-index: var(--bew-z-topbar-host);
  }
}

.bewly-page-content.bewly-page-content--messages,
.bewly-page-content.bewly-page-content--library {
  width: 100%;
  padding-top: 0;
}

// The home feed reaches as close to the window edge as the Moments right column.
.bewly-page-content.bewly-page-content--home {
  width: calc(100% - var(--bew-page-inline-inset) * 2);
}

.bewly-page-container--messages,
.bewly-page-container--library {
  max-width: none;
}

.settings-layer {
  z-index: var(--bew-z-dialog);
}

.bewly-wrapper--viewport {
  position: relative;
  width: 100%;
  min-width: 0;
  height: 100%;
  overflow: hidden;
  background-color: var(--bew-homepage-bg);
}

.bewly-scroll-viewport {
  outline: none;
  scrollbar-gutter: stable;
  // Page-level scroll progress for scroll-driven effects (the home search dock).
  scroll-timeline: --bew-page-scroll block;
}
</style>
