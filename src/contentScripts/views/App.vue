<script setup lang="ts">
import { onKeyStroke, useEventListener, useIntersectionObserver, useThrottleFn } from '@vueuse/core'
import type { Ref } from 'vue'
import { provide, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import Button from '~/components/Button.vue'
import CloseButton from '~/components/CloseButton.vue'
import type { BewlyAppProvider, SettingsNavigationRequest, SettingsNavigationTarget } from '~/composables/useAppProvider'
import { DrawerType, UndoForwardState } from '~/composables/useAppProvider'
import { confirmDialogKey } from '~/composables/useConfirmDialog'
import { useCurrentLocationHref } from '~/composables/useCurrentLocationHref'
import { useDark } from '~/composables/useDark'
import { BEWLY_MOUNTED, DRAWER_VIDEO_ENTER_PAGE_FULL, DRAWER_VIDEO_EXIT_PAGE_FULL, OVERLAY_SCROLL_BAR_SCROLL, OVERLAY_SCROLL_STATE_CHANGE } from '~/constants/globalEvents'
import { LAYOUT_BREAKPOINTS } from '~/constants/layout'
import { HomeSubPage } from '~/contentScripts/views/Home/types'
import { AppPage } from '~/enums/appEnums'
import { settings } from '~/logic'
import { setIframePageActive } from '~/logic/iframePageState'
import type { DockItem } from '~/stores/mainStore'
import { useMainStore } from '~/stores/mainStore'
import { useSettingsStore } from '~/stores/settingsStore'
import { useTopBarStore } from '~/stores/topBarStore'
import { setOriginalBilibiliTopBarScrolled } from '~/utils/bilibiliTopBar'
import { cleanBilibiliUrl } from '~/utils/bilibiliUrl'
import { showNativeBilibiliTopBar } from '~/utils/effectiveTopBarSource'
import { isSameHomeTabConfig, normalizeHomeTabConfig } from '~/utils/homeTabConfig'
import { isHomePage, isInIframe, isNotificationPage, isSearchResultsPage, isVideoOrBangumiPage, openLinkToNewTab, queryDomUntilFound, scrollToTop } from '~/utils/main'
import emitter from '~/utils/mitt'
import { resolvePageModeNavigationUrl, resolvePageModeTarget } from '~/utils/pageMode'

import { setupNecessarySettingsWatchers } from './necessarySettingsWatchers'

const mainStore = useMainStore()
const settingsStore = useSettingsStore()
const topBarStore = useTopBarStore()
const currentLocationHref = useCurrentLocationHref()
const effectiveTopBarSource = computed(() => settingsStore.getEffectiveTopBarSource())
const useOriginalBilibiliTopBar = computed(() => showNativeBilibiliTopBar(effectiveTopBarSource.value))
const { t } = useI18n()

const { isDark } = useDark()
const showSettings = ref(false)
const settingsLaunchStyle = ref<Record<string, string>>({})
const settingsNavigationRequest = shallowRef<SettingsNavigationRequest | null>(null)
let settingsNavigationRequestId = 0

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function toggleSettings(origin: DOMRect) {
  if (showSettings.value) {
    showSettings.value = false
    return
  }

  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  const compactLayout = viewportWidth <= LAYOUT_BREAKPOINTS.compactMax
  const panelWidth = compactLayout
    ? Math.min(1072, viewportWidth - 24)
    : Math.min(viewportWidth * 0.9, 1000)
  const panelHeight = Math.min(viewportHeight * 0.9, 900)
  const panelCenterX = viewportWidth / 2 + (compactLayout ? -4 : 0)
  const panelCenterY = viewportHeight / 2
  const sourceX = origin.left + origin.width / 2
  const sourceY = origin.top + origin.height / 2
  const enterX = clamp(sourceX - panelCenterX, -96, 96)
  const enterY = clamp(sourceY - panelCenterY, -72, 72)

  settingsLaunchStyle.value = {
    '--bew-settings-origin-x': `${clamp(sourceX - (panelCenterX - panelWidth / 2), 0, panelWidth)}px`,
    '--bew-settings-origin-y': `${clamp(sourceY - (panelCenterY - panelHeight / 2), 0, panelHeight)}px`,
    '--bew-settings-enter-x': `${enterX}px`,
    '--bew-settings-enter-y': `${enterY}px`,
    '--bew-settings-leave-x': `${enterX * 0.35}px`,
    '--bew-settings-leave-y': `${enterY * 0.35}px`,
  }
  showSettings.value = true
}

function openSettingsAt(target: SettingsNavigationTarget) {
  settingsNavigationRequest.value = {
    id: ++settingsNavigationRequestId,
    target,
  }
  if (!showSettings.value)
    toggleSettings(new DOMRect(window.innerWidth / 2, window.innerHeight / 2))
}

interface ConfirmDialogRequest {
  id: number
  message: string
  resolve: (confirmed: boolean) => void
  settled: boolean
}

/**
 * Lightweight confirm host (no Dialog / Transition / Teleport).
 * Resolving the promise often mutates large page lists (favorites, history…);
 * doing that in the same tick as a Transition/Teleport teardown races Vue's
 * patcher and throws insertBefore NotFoundError under <App>.
 */
const activeConfirmDialog = ref<ConfirmDialogRequest>()
const confirmDialogQueue: ConfirmDialogRequest[] = []
let confirmDialogBusy = false
let confirmDialogIdSeq = 0

function showNextConfirmDialog() {
  activeConfirmDialog.value = confirmDialogQueue.shift()
}

function showConfirmDialog(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    const request: ConfirmDialogRequest = {
      id: ++confirmDialogIdSeq,
      message,
      resolve,
      settled: false,
    }

    if (activeConfirmDialog.value || confirmDialogBusy)
      confirmDialogQueue.push(request)
    else
      activeConfirmDialog.value = request
  })
}

function finishConfirmDialog(confirmed: boolean) {
  const request = activeConfirmDialog.value
  if (!request || request.settled)
    return

  request.settled = true
  confirmDialogBusy = true
  // Unmount the overlay first; only then resolve so callers' DOM updates
  // (e.g. splicing favorite cards) never interleave with this node removal.
  activeConfirmDialog.value = undefined

  nextTick(() => {
    request.resolve(confirmed)
    confirmDialogBusy = false
    showNextConfirmDialog()
  })
}

onKeyStroke('Escape', (e: KeyboardEvent) => {
  if (!activeConfirmDialog.value)
    return
  e.preventDefault()
  e.stopPropagation()
  finishConfirmDialog(false)
}, { dedupe: true })

onKeyStroke('Enter', (e: KeyboardEvent) => {
  if (!activeConfirmDialog.value)
    return
  e.preventDefault()
  e.stopPropagation()
  finishConfirmDialog(true)
}, { dedupe: true })

provide(confirmDialogKey, {
  confirm: showConfirmDialog,
})

// Get the 'page' query parameter from the URL
function getPageParam(): AppPage | null {
  const urlParams = new URLSearchParams(window.location.search)
  const result = urlParams.get('page') as AppPage | null
  if (result && Object.values(AppPage).includes(result))
    return result
  return null
}

function resolveAvailableAppPage(page: AppPage): AppPage {
  return settings.value.useSearchPageModeOnHomePage && page === AppPage.Search
    ? AppPage.Home
    : page
}

function replacePageParam(page: AppPage) {
  const url = new URL(window.location.href)
  url.searchParams.set('page', page)
  window.history.replaceState({}, '', url.toString())
}

const requestedInitialPage = getPageParam()
  || settings.value.dockItemsConfig.find(e => e.visible === true)?.page
  || AppPage.Home
const initialPage = resolveAvailableAppPage(requestedInitialPage)
const activatedPage = ref<AppPage>(initialPage)

if (initialPage !== requestedInitialPage)
  replacePageParam(initialPage)

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
  const pageParam = getPageParam()
  if (!pageParam)
    return

  const availablePage = resolveAvailableAppPage(pageParam)
  if (availablePage !== pageParam)
    replacePageParam(availablePage)

  if (availablePage !== activatedPage.value)
    activatedPage.value = availablePage
})

watch(() => settings.value.useSearchPageModeOnHomePage, (useOnHomePage) => {
  if (!useOnHomePage || activatedPage.value !== AppPage.Search)
    return

  activatedPage.value = AppPage.Home
})

// 清理搜索相关的URL参数（仅在首页生效）
function clearSearchParamsFromUrl() {
  // 只在首页清理搜索参数，避免影响其他B站页面（如搜索结果页）
  if (!isHomePage() || isSearchResultsPage()) {
    return
  }

  const urlParams = new URLSearchParams(window.location.search)
  const hasSearchParams = urlParams.has('keyword')
    || urlParams.has('category')
    || urlParams.has('user_order')
    || urlParams.has('user_type')
    || urlParams.has('search_type')
    || urlParams.has('live_room_order')
    || urlParams.has('live_user_order')
    || urlParams.has('pn')

  if (hasSearchParams) {
    urlParams.delete('keyword')
    urlParams.delete('category')
    urlParams.delete('user_order')
    urlParams.delete('user_type')
    urlParams.delete('search_type')
    urlParams.delete('live_room_order')
    urlParams.delete('live_user_order')
    urlParams.delete('pn')
    // 注意：不要删除 'page' 参数，它用于 dock 的页面切换
    const currentUrl = new URL(window.location.href)
    currentUrl.search = urlParams.toString()
    window.history.replaceState({}, '', `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`)
  }
}

// 页面加载时，如果不是Search或SearchResults页面且在首页则清理搜索参数
if (activatedPage.value !== AppPage.Search && activatedPage.value !== AppPage.SearchResults && isHomePage() && !isSearchResultsPage()) {
  clearSearchParamsFromUrl()
  topBarStore.searchKeyword = ''
}

const defaultHomeTabConfig = mainStore.homeTabs.map(tab => ({
  page: tab.page,
  visible: tab.page !== HomeSubPage.Precious,
}))

function getDefaultHomeSubPage(tabConfig: { page: HomeSubPage, visible: boolean }[]): HomeSubPage {
  return normalizeHomeTabConfig(tabConfig, defaultHomeTabConfig)
    .find(tab => tab.visible)
    ?.page ?? HomeSubPage.ForYou
}

// 添加Home页面的子页面状态
const homeActivatedPage = ref<HomeSubPage>(getDefaultHomeSubPage(settings.value.homePageTabVisibilityList))
const homeActivatedPageTouched = ref<boolean>(false)
const isHomeTabSwitching = ref<boolean>(false)
watch(
  () => settings.value.homePageTabVisibilityList,
  (tabConfig) => {
    const normalizedTabConfig = normalizeHomeTabConfig(tabConfig, defaultHomeTabConfig)
    if (!isSameHomeTabConfig(tabConfig, normalizedTabConfig)) {
      settings.value.homePageTabVisibilityList = normalizedTabConfig
      return
    }

    if (homeActivatedPageTouched.value)
      return

    const defaultHomeSubPage = getDefaultHomeSubPage(normalizedTabConfig)
    if (homeActivatedPage.value !== defaultHomeSubPage)
      homeActivatedPage.value = defaultHomeSubPage
  },
  { deep: true, immediate: true },
)
const pages = {
  [AppPage.Home]: defineAsyncComponent(() => import('./Home/Home.vue')),
  [AppPage.Search]: defineAsyncComponent(() => import('./Search/Search.vue')),
  [AppPage.SearchResults]: defineAsyncComponent(() => import('./SearchResults/SearchResults.vue')),
  [AppPage.Anime]: defineAsyncComponent(() => import('./Anime/Anime.vue')),
  [AppPage.History]: defineAsyncComponent(() => import('./History/History.vue')),
  [AppPage.WatchLater]: defineAsyncComponent(() => import('./WatchLater/WatchLater.vue')),
  [AppPage.Favorites]: defineAsyncComponent(() => import('./Favorites/Favorites.vue')),
  [AppPage.Moments]: defineAsyncComponent(() => import('./Moments/Moments.vue')),
  [AppPage.Notifications]: defineAsyncComponent(() => import('./Notifications/Notifications.vue')),
}
const mainAppRef = ref<HTMLElement>() as Ref<HTMLElement>
const scrollViewportRef = ref<HTMLElement | null>(null)
const loadMoreSentinelRef = ref<HTMLElement>() // ✅ IntersectionObserver 哨兵元素
const handlePageRefresh = ref<() => void>()
const handleReachBottom = ref<() => void>()
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

function waitForScrollTop(viewport: HTMLElement, generation: number, startedAt: number) {
  if (generation !== refreshScrollGeneration)
    return

  if (viewport.scrollTop === 0 || performance.now() - startedAt >= 1800) {
    refreshScrollTimer = null
    handlePageRefresh.value?.()
    return
  }

  refreshScrollTimer = setTimeout(() => waitForScrollTop(viewport, generation, startedAt), 50)
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
    refreshScrollTimer = setTimeout(() => waitForScrollTop(viewport, generation, performance.now()), 50)
  }
}, 500)
const handleThrottledReachBottom = useThrottleFn(() => handleReachBottom.value?.(), 200)
const handleThrottledBackToTop = useThrottleFn(() => handleBackToTop(), 500)
const handleThrottledPageUnRefresh = useThrottleFn(() => handleUndoRefresh.value?.(), 500)
const handleThrottledPageForwardRefresh = useThrottleFn(() => handleForwardRefresh.value?.(), 500)
const topBarRef = ref()
const reachTop = ref<boolean>(true)

watch(isHomeTabSwitching, (switching) => {
  if (switching)
    return

  // IntersectionObserver may have reported an intersection while callbacks were
  // suspended. Recheck once after restoration so a genuinely short/bottom page
  // can still request more content without waiting for another scroll event.
  requestAnimationFrame(() => {
    const viewport = scrollViewportRef.value
    const sentinel = loadMoreSentinelRef.value
    if (!viewport || !sentinel || isHomeTabSwitching.value)
      return

    const viewportRect = viewport.getBoundingClientRect()
    const sentinelRect = sentinel.getBoundingClientRect()
    if (sentinelRect.top <= viewportRect.bottom + 200 && sentinelRect.bottom >= viewportRect.top)
      handleThrottledReachBottom()
  })
})

const iframeDrawerURL = ref<string>('')
const showIframeDrawer = ref<boolean>(false)

// 添加活跃抽屉状态管理
const activeDrawer = ref<DrawerType>(DrawerType.None)
function setActiveDrawer(drawer: DrawerType) {
  activeDrawer.value = drawer
}

// 用于控制当iframe内打开图片预览时隐藏顶栏和Dock
const hideUIForIframePhotoViewer = ref<boolean>(false)

const iframePageRef = ref()

// 监听来自iframe的图片预览器状态
useEventListener(window, 'message', ({ data, source }) => {
  // 确保消息来自iframe
  if (!data || data.type !== 'IFRAME_PHOTO_VIEWER_STATE')
    return

  // 检查消息来源是否是iframe
  const iframe = iframePageRef.value?.$el?.querySelector('iframe')
  if (iframe && source === iframe.contentWindow) {
    hideUIForIframePhotoViewer.value = data.isOpen
  }
})

const iframePageURL = computed((): string => {
  // If the iframe is not the BiliBili homepage or in iframe, then don't show the iframe page
  if (!isHomePage(window.self.location.href) || isInIframe())
    return ''
  const dockItem = mainStore.getDockItemByPage(activatedPage.value)
  if (!dockItem)
    return ''

  return settingsStore.getDockItemIsUseOriginalBiliPage(activatedPage.value) || !dockItem.hasBewlyPage
    ? mainStore.getBiliWebPageURLByPage(activatedPage.value)
    : ''
})
watch(iframePageURL, url => setIframePageActive(Boolean(url)), { immediate: true })
onBeforeUnmount(() => setIframePageActive(false))
const showBewlyPage = computed((): boolean => {
  if (isInIframe())
    return false

  // SearchResults 页面是虚拟页面，不在 dockItems 中，但应该显示
  if (activatedPage.value === AppPage.SearchResults) {
    return isHomePage()
  }

  const dockItem = mainStore.getDockItemByPage(activatedPage.value)
  if (!dockItem?.hasBewlyPage)
    return false

  if (iframePageURL.value)
    return false

  return isHomePage()
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
  // When using the open in drawer feature, the iframe inside the page will hide the top bar
  if (isVideoOrBangumiPage() && isInIframe())
    return false

  // when user open the notifications page as a drawer, don't show the top bar
  if (isNotificationPage() && settings.value.openNotificationsPageAsDrawer && isInIframe())
    return false

  // Always show TopBar in the outer layer, never inside iframe
  // This ensures TopBar is always visible outside of iframe content
  if (isInIframe())
    return false

  // when using original bilibili homepage, show top bar
  return (isHomePage() && !settingsStore.getDockItemIsUseOriginalBiliPage(activatedPage.value))
  // when using original bilibili page on home page, show top bar in outer layer
    || (isHomePage() && settingsStore.getDockItemIsUseOriginalBiliPage(activatedPage.value))
  // when not on home page, show top bar
    || !isHomePage()
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

    if (!options.force && (showSettings.value || activeDrawer.value !== DrawerType.None || isEditableElement(getActiveElement())))
      return

    viewport.focus({ preventScroll: true })
  })
}

const isFirstTimeActivatedPageChange = ref<boolean>(true)
watch(
  () => activatedPage.value,
  () => {
    cancelPendingRefreshScroll()
    if (!isFirstTimeActivatedPageChange.value) {
      // Update the URL query parameter when activatedPage changes
      const url = new URL(window.location.href)
      url.searchParams.set('page', activatedPage.value)
      window.history.replaceState({}, '', url.toString())
    }

    scrollViewportRef.value?.scrollTo({ top: 0 })
    focusScrollViewport()
    isFirstTimeActivatedPageChange.value = false
  },
  { immediate: true },
)

watch(homeActivatedPage, cancelPendingRefreshScroll)

onScopeDispose(cancelPendingRefreshScroll)

watch(
  () => showBewlyPage.value,
  (visible) => {
    if (visible)
      focusScrollViewport()
  },
  { immediate: true, flush: 'post' },
)

// Setup necessary settings watchers
setupNecessarySettingsWatchers()
let scrollingEmitted = false

onMounted(() => {
  window.dispatchEvent(new CustomEvent(BEWLY_MOUNTED))

  // ✅ 设置 IntersectionObserver 用于无限滚动底部检测（仅在首页且使用Bewly页面时）
  // 避免在每次滚动时读取 scrollHeight/clientHeight
  if (isHomePage()) {
    nextTick(() => {
      const viewport = scrollViewportRef.value
      if (!viewport)
        return

      useIntersectionObserver(
        loadMoreSentinelRef,
        ([{ isIntersecting }]) => {
          if (isIntersecting && !isHomeTabSwitching.value) {
            handleThrottledReachBottom()
          }
        },
        {
          root: viewport,
          rootMargin: '200px', // 提前 200px 触发加载
          threshold: 0,
        },
      )
    })
  }

  if (isHomePage()) {
    focusScrollViewport()
  }

  document.addEventListener('scroll', () => {
    if (window.scrollY > 0)
      reachTop.value = false
    else
      reachTop.value = true
  })
})

function handleDockItemClick(dockItem: DockItem) {
  // Opening in a new tab while still on the current tab doesn't require changing the `activatedPage`
  if (dockItem.openInNewTab) {
    openLinkToNewTab(settingsStore.resolveDockPageHref(dockItem.page))
  }
  else {
    if (dockItem.useOriginalBiliPage) {
      // It seem like the `activatedPage` watcher above will handle this, so no need to set iframePageURL.value here
      // iframePageURL.value = dockItem.url
      if (!isHomePage()) {
        location.href = settingsStore.resolveDockPageHref(dockItem.page)
      }
    }
    else {
      if (isHomePage()) {
        changeActivatePage(dockItem.page)
      }
      else {
        location.href = `https://www.bilibili.com/?page=${dockItem.page}`
      }
    }

    // When not opened in a new tab, change the `activatedPage`
    activatedPage.value = dockItem.page

    // Clear search keyword and URL params when switching to/from search pages (only on homepage)
    if (isHomePage() && !isSearchResultsPage()) {
      // 从 SearchResults 返回 Search 页面时清理搜索参数
      if (dockItem.page === AppPage.Search) {
        topBarStore.searchKeyword = ''
        clearSearchParamsFromUrl()
      }
      // 从 Search/SearchResults 切换到其他页面时清理搜索参数
      else if (dockItem.page !== AppPage.SearchResults) {
        topBarStore.searchKeyword = ''
        clearSearchParamsFromUrl()
      }
    }
  }
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
  activatedPage.value = targetPage
}

function handleBackToTop(targetScrollTop = 0 as number) {
  const viewport = scrollViewportRef.value
  if (viewport) {
    scrollToTop(viewport, targetScrollTop)
    topBarRef.value?.toggleTopBarVisible(true)
  }

  iframePageRef.value?.handleBackToTop()
}

let scrollStateTimer: ReturnType<typeof setTimeout> | null = null
let lastScrollTop = 0
let rafId: number | null = null
let latestScrollTop = 0

function handleOsScroll(_instance: any, event: Event) {
  // 从事件的 target 读取 scrollTop，避免调用 osInstance().elements() 触发强制布局
  latestScrollTop = (event.target as HTMLElement | null)?.scrollTop ?? 0

  // 如果已经有 RAF 在等待，跳过本次滚动事件
  if (rafId !== null)
    return

  // 只在滚动开始时发出一次信号（避免额外的响应式开销）
  if (!scrollingEmitted) {
    emitter.emit(OVERLAY_SCROLL_STATE_CHANGE, true)
    scrollingEmitted = true
  }

  // 使用 RAF 将所有 DOM 读取合并到下一帧
  rafId = requestAnimationFrame(() => {
    const scrollTop = latestScrollTop

    emitter.emit(OVERLAY_SCROLL_BAR_SCROLL, scrollTop)
    if (useOriginalBilibiliTopBar.value)
      setOriginalBilibiliTopBarScrolled(document, scrollTop > 0)

    // 只在滚动距离超过阈值时更新状态
    const scrollDelta = Math.abs(scrollTop - lastScrollTop)
    if (scrollDelta > 50) {
      lastScrollTop = scrollTop
    }

    reachTop.value = scrollTop === 0

    // ✅ 移除手动的"到达底部"检测，改用 IntersectionObserver（见 loadMoreSentinelRef）
    // 这避免了在每次滚动时计算 threshold 和读取 scrollHeight/clientHeight

    // 清除之前的滚动状态定时器
    if (scrollStateTimer) {
      clearTimeout(scrollStateTimer)
    }

    // 设置滚动状态结束检测，150ms后发出滚动结束信号
    scrollStateTimer = setTimeout(() => {
      emitter.emit(OVERLAY_SCROLL_STATE_CHANGE, false)
      scrollingEmitted = false
    }, 150)

    rafId = null
  })
}

function handleNativeScroll(event: Event) {
  handleOsScroll(null, event)
}

function openIframeDrawer(url: string) {
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
    iframeDrawerURL.value = destination.href
    showIframeDrawer.value = true
  }
  catch {
    // An invalid URL cannot be normalized safely for either the drawer or a new tab.
  }
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

// In drawer video, watch btn className changed and post message to parent
watchEffect(async (onCleanUp) => {
  if (!isInIframe())
    return null

  const observer = new MutationObserver(([{ target: el }]) => {
    if (!(el instanceof HTMLElement))
      return null
    if (el.classList.contains('bpx-state-entered')) {
      parent.postMessage(DRAWER_VIDEO_ENTER_PAGE_FULL)
    }
    else {
      parent.postMessage(DRAWER_VIDEO_EXIT_PAGE_FULL)
    }
  })

  const abort = new AbortController()
  queryDomUntilFound('.bpx-player-ctrl-btn.bpx-player-ctrl-web', 500, abort).then((openVideo2WebFullBtn) => {
    if (!openVideo2WebFullBtn)
      return
    observer.observe(openVideo2WebFullBtn, { attributes: true })
  })

  onCleanUp(() => {
    observer.disconnect()
    abort.abort()
  })
})

provide<BewlyAppProvider>('BEWLY_APP', {
  activatedPage,
  homeActivatedPage,
  homeActivatedPageTouched,
  isHomeTabSwitching,
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
  activeDrawer,
  setActiveDrawer,
  getDockPageHref,
  navigateToDockPage,
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
            history.replaceState(null, '', cleanedUrl)
          isCleaningUrl = false
        })
      }
      else {
        cleanupApplyTimer = setTimeout(() => {
          cleanupApplyTimer = undefined
          if (settings.value.cleanUrlArgument && window.location.href === currentUrl)
            history.replaceState(null, '', cleanedUrl)
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
    :class="{
      'dark': isDark,
      'bewly-wrapper--viewport': isHomePage(),
    }"
    text="$bew-text-1 size-$bew-base-font-size"
  >
    <!-- Theme color gradient -->
    <template v-if="showBewlyPage">
      <AppGradientBackground :activated-page="activatedPage" />
    </template>

    <!-- Settings -->
    <Transition name="settings-launch">
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
        :settings-open="showSettings"
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

    <!-- TopBar -->
    <div
      v-if="showTopBar"
      class="top-bar-host"
      m-auto max-w="$bew-page-max-width"
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
            <main m-auto max-w="$bew-page-max-width">
              <div
                p="t-[calc(var(--bew-top-bar-height)+10px)]" m-auto
                w="lg:[calc(100%-200px)] [calc(100%-150px)]"
                :style="useOriginalBilibiliTopBar && !reachTop
                  ? { paddingTop: 'calc(var(--bew-top-bar-height) + 120px)' }
                  : undefined"
              >
                <Transition name="page-fade">
                  <Component :is="pages[activatedPage]" :key="activatedPage" />
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
        <IframePage ref="iframePageRef" :url="iframePageURL" />
      </Transition>
    </div>

    <IframeDrawer
      v-if="showIframeDrawer"
      :url="iframeDrawerURL"
      @close="showIframeDrawer = false"
    />

    <!-- Static confirm overlay: no Transition/Teleport (see finishConfirmDialog). -->
    <div
      v-if="activeConfirmDialog"
      :key="activeConfirmDialog.id"
      class="bew-confirm-dialog"
      role="alertdialog"
      aria-modal="true"
      :aria-label="$t('common.operation.confirm')"
    >
      <div class="bew-confirm-dialog__backdrop" @click="finishConfirmDialog(false)" />
      <div class="bew-confirm-dialog__panel">
        <header class="bew-confirm-dialog__header">
          <p class="bew-confirm-dialog__title">
            {{ $t('common.operation.confirm') }}
          </p>
          <CloseButton
            class="bew-confirm-dialog__close"
            :label="$t('common.close')"
            size="medium"
            @click="finishConfirmDialog(false)"
          />
        </header>
        <div class="bew-confirm-dialog__body">
          <p class="bew-confirm-dialog__message">
            {{ activeConfirmDialog.message }}
          </p>
        </div>
        <footer class="bew-confirm-dialog__footer">
          <Button type="tertiary" @click="finishConfirmDialog(false)">
            {{ $t('common.operation.cancel') }}
          </Button>
          <Button type="primary" @click="finishConfirmDialog(true)">
            {{ $t('common.operation.confirm') }}
          </Button>
        </footer>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.top-bar-layer {
  z-index: var(--bew-z-topbar-host);
}

.settings-layer {
  z-index: var(--bew-z-modal);
}

.bew-confirm-dialog {
  position: fixed;
  inset: 0;
  z-index: var(--bew-z-modal);
  pointer-events: auto;
}

.bew-confirm-dialog__backdrop {
  position: absolute;
  inset: 0;
  background: rgb(0 0 0 / 40%);
}

.bew-confirm-dialog__panel {
  position: absolute;
  top: 50%;
  left: 50%;
  display: flex;
  flex-direction: column;
  width: var(--bew-layout-dialog-width);
  max-width: calc(100vw - 32px);
  overflow: hidden;
  background: var(--bew-elevated-alt-solid);
  box-sizing: border-box;
  border: 1px solid var(--bew-surface-border-color);
  border-radius: var(--bew-modal-radius);
  corner-shape: var(--bew-corner-shape);
  box-shadow: var(--bew-shadow-4), var(--bew-shadow-edge-glow-2);
  transform: translate(-50%, -50%);
}

.bew-confirm-dialog__header {
  display: flex;
  gap: var(--bew-space-4);
  align-items: center;
  justify-content: space-between;
  min-height: 70px;
  padding: 0 var(--bew-space-8);
}

.bew-confirm-dialog__title {
  margin: 0;
  font-size: var(--bew-font-size-title);
  font-weight: var(--bew-font-weight-semibold);
  line-height: var(--bew-line-height-title);
}

.bew-confirm-dialog__body {
  padding: var(--bew-space-2) var(--bew-space-8) var(--bew-space-2);
}

.bew-confirm-dialog__message {
  margin: 0;
  color: var(--bew-text-1);
  font-size: var(--bew-font-size-body);
  font-weight: var(--bew-font-weight-regular);
  line-height: var(--bew-line-height-body);
  white-space: pre-line;
}

.bew-confirm-dialog__footer {
  display: flex;
  gap: var(--bew-space-2);
  justify-content: flex-end;
  padding: var(--bew-space-2) var(--bew-space-8) var(--bew-space-6);
}

.bewly-wrapper {
  // To fix the filter used in `.bewly-wrapper` that cause the positions of elements become discorded.
  > * > * {
    filter: var(--bew-filter-force-dark);
  }
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
}
</style>
