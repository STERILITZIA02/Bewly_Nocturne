import type { MaybeElement } from '@vueuse/core'
import { unrefElement } from '@vueuse/core'
import type { Ref } from 'vue'
import { computed, ref, watch } from 'vue'

import {
  ACCOUNT_URL,
  CHANNEL_PAGE_URL,
  SEARCH_PAGE_URL,
  SPACE_URL,
  VIDEO_PAGE_URL,
} from '~/components/TopBar/constants/urls'
import { useAnchoredPopoverPosition } from '~/composables/useAnchoredPopoverPosition'
import { useBewlyApp } from '~/composables/useAppProvider'
import { useCurrentLocationHref } from '~/composables/useCurrentLocationHref'
import { AppPage } from '~/enums/appEnums'
import { settings } from '~/logic'
import { useSettingsStore } from '~/stores/settingsStore'
import { useTopBarStore } from '~/stores/topBarStore'
import { isHomePage } from '~/utils/main'
import { shouldUsePluginSearchResultsPage } from '~/utils/searchNavigation'
import { openLinkInBackground } from '~/utils/tabs'

export type TopBarPopupKey
  = | 'channels'
    | 'userPanel'
    | 'notifications'
    | 'moments'
    | 'favorites'
    | 'history'
    | 'watchLater'
    | 'upload'
    | 'more'

const BEWLY_PAGE_BY_TOP_BAR_ITEM: Partial<Record<TopBarPopupKey, AppPage>> = {
  channels: AppPage.Home,
  moments: AppPage.Moments,
  favorites: AppPage.Favorites,
  history: AppPage.History,
  watchLater: AppPage.WatchLater,
}

interface TopBarHoverController {
  triggerHovered: boolean
  popupHovered: boolean
  enterTimer?: ReturnType<typeof setTimeout>
  leaveTimer?: ReturnType<typeof setTimeout>
}

const hoverControllers = new Map<TopBarPopupKey, TopBarHoverController>()

export function useTopBarInteraction() {
  const topBarStore = useTopBarStore()
  const settingsStore = useSettingsStore()
  const { closeAllPopups } = topBarStore
  const topBarItemElements: Partial<Record<TopBarPopupKey, Ref<MaybeElement>>> = {}

  // 当前点击的顶栏项
  const currentClickedTopBarItem = ref<TopBarPopupKey | null>(null)
  const handledClickEvents = new WeakSet<MouseEvent>()

  function clearControllerTimers(controller: TopBarHoverController) {
    if (controller.enterTimer !== undefined)
      clearTimeout(controller.enterTimer)
    if (controller.leaveTimer !== undefined)
      clearTimeout(controller.leaveTimer)
    controller.enterTimer = undefined
    controller.leaveTimer = undefined
  }

  function clearOtherHoverTimers(activeKey?: TopBarPopupKey) {
    hoverControllers.forEach((controller, key) => {
      if (key !== activeKey)
        clearControllerTimers(controller)
    })
  }

  // 获取 App Provider
  const { activatedPage, getDockPageHref, navigateToDockPage } = useBewlyApp()

  const currentLocationHref = useCurrentLocationHref()

  // TopBar 相关计算属性
  const forceWhiteIcon = computed((): boolean => {
    const currentUrl = currentLocationHref.value
    if (!settings.value)
      return false

    if (
      (CHANNEL_PAGE_URL.test(currentUrl) && !VIDEO_PAGE_URL.test(currentUrl))
      || SPACE_URL.test(currentUrl)
      || ACCOUNT_URL.test(currentUrl)
    ) {
      return true
    }

    if (!isHomePage(currentUrl))
      return false
    return false
  })

  const showSearchBar = computed((): boolean => {
    const currentUrl = currentLocationHref.value
    const isSearchPage = SEARCH_PAGE_URL.test(currentUrl)

    if (isHomePage(currentUrl)) {
      if (!activatedPage?.value)
        return true
      // Search 页面的显示逻辑：不显示顶栏搜索框（因为页面中已有搜索框）
      if (activatedPage.value === AppPage.Search) {
        return false
      }
      // SearchResults 页面的显示逻辑：
      if (activatedPage.value === AppPage.SearchResults) {
        // 启用了插件搜索结果页才显示搜索框
        if (!shouldUsePluginSearchResultsPage())
          return false
        // 其他情况显示搜索框
      }
      if (settings.value.useSearchPageModeOnHomePage && activatedPage.value === AppPage.Home)
        return false
    }
    else if (isSearchPage) {
      // 原生搜索页面本身已有搜索框，隐藏顶栏搜索框避免重复
      return false
    }

    return true
  })

  // 设置顶栏项悬停事件
  function setupTopBarItemHoverEvent(key: TopBarPopupKey) {
    const element = ref<MaybeElement>()
    const controller: TopBarHoverController = {
      triggerHovered: false,
      popupHovered: false,
      enterTimer: undefined,
      leaveTimer: undefined,
    }
    hoverControllers.set(key, controller)
    topBarItemElements[key] = element

    function clearEnterTimer() {
      if (controller.enterTimer !== undefined)
        clearTimeout(controller.enterTimer)
      controller.enterTimer = undefined
    }

    function clearLeaveTimer() {
      if (controller.leaveTimer !== undefined)
        clearTimeout(controller.leaveTimer)
      controller.leaveTimer = undefined
    }

    function handleTriggerEnter() {
      controller.triggerHovered = true
      clearOtherHoverTimers(key)
      clearLeaveTimer()
      clearEnterTimer()
      closeAllPopups(key)
      controller.enterTimer = setTimeout(() => {
        controller.enterTimer = undefined
        if (controller.triggerHovered)
          topBarStore.popupVisible[key] = true
      }, 320)
    }

    function scheduleClose() {
      clearEnterTimer()
      clearLeaveTimer()
      controller.leaveTimer = setTimeout(() => {
        controller.leaveTimer = undefined
        if (!controller.triggerHovered && !controller.popupHovered)
          topBarStore.popupVisible[key] = false
      }, 320)
    }

    function handleTriggerLeave() {
      controller.triggerHovered = false
      scheduleClose()
    }

    watch([element, () => settings.value.touchScreenOptimization], ([target, touchOptimized], _, onCleanup) => {
      const triggerElement = unrefElement(target)
      if (!triggerElement)
        topBarStore.popupVisible[key] = false
      if (triggerElement && !touchOptimized) {
        triggerElement.addEventListener('mouseenter', handleTriggerEnter)
        triggerElement.addEventListener('mouseleave', handleTriggerLeave)
      }
      onCleanup(() => {
        triggerElement?.removeEventListener('mouseenter', handleTriggerEnter)
        triggerElement?.removeEventListener('mouseleave', handleTriggerLeave)
        const hadMouseInteraction = controller.triggerHovered
          || controller.popupHovered
          || controller.enterTimer !== undefined
          || controller.leaveTimer !== undefined
        controller.triggerHovered = false
        controller.popupHovered = false
        clearEnterTimer()
        clearLeaveTimer()
        if (hadMouseInteraction)
          topBarStore.popupVisible[key] = false
      })
    }, { immediate: true, flush: 'post' })

    onScopeDispose(() => {
      clearEnterTimer()
      clearLeaveTimer()
      if (hoverControllers.get(key) === controller)
        hoverControllers.delete(key)
    })

    return element
  }

  // 设置顶栏项变换器
  function setupTopBarItemTransformer(key: TopBarPopupKey, popupRef: Ref<MaybeElement>) {
    const triggerRef = topBarItemElements[key]
    if (!triggerRef)
      return popupRef
    const controller = hoverControllers.get(key)
    if (!controller)
      return popupRef
    const activeController: TopBarHoverController = controller

    function clearLeaveTimer() {
      if (activeController.leaveTimer !== undefined)
        clearTimeout(activeController.leaveTimer)
      activeController.leaveTimer = undefined
    }

    function handlePopupEnter() {
      activeController.popupHovered = true
      clearLeaveTimer()
    }

    function handlePopupLeave() {
      activeController.popupHovered = false
      clearLeaveTimer()
      activeController.leaveTimer = setTimeout(() => {
        activeController.leaveTimer = undefined
        if (!activeController.triggerHovered && !activeController.popupHovered)
          topBarStore.popupVisible[key] = false
      }, 320)
    }

    watch([popupRef, () => settings.value.touchScreenOptimization], ([target, touchOptimized], _, onCleanup) => {
      const popupElement = unrefElement(target)
      if (popupElement && !touchOptimized) {
        popupElement.addEventListener('mouseenter', handlePopupEnter)
        popupElement.addEventListener('mouseleave', handlePopupLeave)
      }
      onCleanup(() => {
        popupElement?.removeEventListener('mouseenter', handlePopupEnter)
        popupElement?.removeEventListener('mouseleave', handlePopupLeave)
        const hadPopupInteraction = activeController.popupHovered
        activeController.popupHovered = false
        clearLeaveTimer()
        if (hadPopupInteraction && !activeController.triggerHovered)
          topBarStore.popupVisible[key] = false
      })
    }, { immediate: true, flush: 'post' })

    useAnchoredPopoverPosition(
      triggerRef,
      popupRef,
      computed(() => Boolean(topBarStore.popupVisible[key])),
    )
    return popupRef
  }

  // 处理顶栏项点击
  function openConfiguredPageFromTopBar(page: AppPage) {
    const pageUrl = `https://www.bilibili.com/?page=${page}`
    const openMode = settings.value.topBarLinkOpenMode

    if (openMode === 'background') {
      void openLinkInBackground(pageUrl)
      return
    }

    if (openMode === 'newTab' || (openMode === 'currentTabIfNotHomepage' && isHomePage())) {
      window.open(pageUrl, '_blank')
      return
    }

    if (isHomePage()) {
      // activatedPage 会读取同一项 Dock 配置，决定显示 Bewly 页面还是原版 Bilibili 页面。
      activatedPage.value = page
      return
    }

    location.href = pageUrl
  }

  function getConfiguredTopBarPage(key: TopBarPopupKey): AppPage | undefined {
    return BEWLY_PAGE_BY_TOP_BAR_ITEM[key]
  }

  function shouldOpenConfiguredTopBarItem(key: TopBarPopupKey): boolean {
    const page = getConfiguredTopBarPage(key)
    return Boolean(
      page
      && settings.value.openTopBarItemsInBewly
      && !settingsStore.getDockItemIsUseOriginalBiliPage(page),
    )
  }

  function getTopBarItemHref(key: TopBarPopupKey, originalHref: string): string {
    const page = getConfiguredTopBarPage(key)
    return page && shouldOpenConfiguredTopBarItem(key)
      ? `https://www.bilibili.com/?page=${page}`
      : originalHref
  }

  function handleClickTopBarItem(event: MouseEvent, key: TopBarPopupKey) {
    if (handledClickEvents.has(event))
      return

    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey)
      return

    if (settings.value.touchScreenOptimization) {
      clearOtherHoverTimers()
      handledClickEvents.add(event)
      event.preventDefault()
      event.stopPropagation()
      closeAllPopups(key)
      topBarStore.popupVisible[key] = !topBarStore.popupVisible[key]
      currentClickedTopBarItem.value = key
      return
    }

    if (!shouldOpenConfiguredTopBarItem(key))
      return

    const page = getConfiguredTopBarPage(key)
    if (!page)
      return

    handledClickEvents.add(event)
    clearOtherHoverTimers()
    event.preventDefault()
    event.stopPropagation()
    closeAllPopups()
    openConfiguredPageFromTopBar(page)
  }

  function handleClickTopBarLogo(event: MouseEvent) {
    if (settings.value.touchScreenOptimization) {
      handleClickTopBarItem(event, 'channels')
      return
    }

    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey)
      return

    handledClickEvents.add(event)
    clearOtherHoverTimers()
    event.preventDefault()
    event.stopPropagation()
    closeAllPopups()
    navigateToDockPage(AppPage.Home)
  }

  function getTopBarLogoHref(): string {
    return getDockPageHref(AppPage.Home)
  }

  // 处理通知项点击
  function handleNotificationsItemClick(item: { name: string, url: string, unreadCount: number, icon: string }) {
    if (settings.value.openNotificationsPageAsDrawer) {
      topBarStore.drawerVisible.notifications = true
      topBarStore.notificationsDrawerUrl = item.url
    }
  }

  return {
    currentClickedTopBarItem,
    setupTopBarItemHoverEvent,
    setupTopBarItemTransformer,
    handleClickTopBarItem,
    handleClickTopBarLogo,
    getTopBarLogoHref,
    handleNotificationsItemClick,
    getTopBarItemHref,
    shouldOpenConfiguredTopBarItem,
    forceWhiteIcon,
    showSearchBar,
  }
}
