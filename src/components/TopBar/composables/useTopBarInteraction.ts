import type { MaybeElement } from '@vueuse/core'
import { unrefElement } from '@vueuse/core'
import type { Ref } from 'vue'
import { computed, nextTick, onScopeDispose, ref, watch } from 'vue'

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
import { resolveConfiguredLinkAction } from '~/utils/configuredLinkNavigation'
import { isHomePage, isInIframe } from '~/utils/main'
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
  keyboardOpen: boolean
  instantOpen: boolean
  popupElement?: HTMLElement
  enterTimer?: ReturnType<typeof setTimeout>
  leaveTimer?: ReturnType<typeof setTimeout>
}

const hoverControllers = new Map<TopBarPopupKey, TopBarHoverController>()
const transientResetters = new Set<() => void>()

function clearControllerTimers(controller: TopBarHoverController) {
  if (controller.enterTimer !== undefined)
    clearTimeout(controller.enterTimer)
  if (controller.leaveTimer !== undefined)
    clearTimeout(controller.leaveTimer)
  controller.enterTimer = undefined
  controller.leaveTimer = undefined
}

export function resetTopBarTransientInteraction() {
  hoverControllers.forEach((controller) => {
    clearControllerTimers(controller)
    controller.triggerHovered = false
    controller.popupHovered = false
    controller.keyboardOpen = false
    controller.instantOpen = false
  })
  transientResetters.forEach(reset => reset())
}

export function useTopBarInteraction() {
  const topBarStore = useTopBarStore()
  const settingsStore = useSettingsStore()
  const { closeAllPopups } = topBarStore
  const topBarItemElements: Partial<Record<TopBarPopupKey, Ref<MaybeElement>>> = {}

  // 当前点击的顶栏项
  const currentClickedTopBarItem = ref<TopBarPopupKey | null>(null)
  const handledClickEvents = new WeakSet<MouseEvent>()
  const resetLocalTransientState = () => {
    currentClickedTopBarItem.value = null
    closeAllPopups()
  }
  transientResetters.add(resetLocalTransientState)
  onScopeDispose(() => transientResetters.delete(resetLocalTransientState))

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
      keyboardOpen: false,
      instantOpen: false,
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
      if (controller.keyboardOpen)
        return
      clearOtherHoverTimers(key)
      clearLeaveTimer()
      clearEnterTimer()
      const browsingPopups = Object.values(topBarStore.popupVisible).some(Boolean)
      controller.instantOpen = browsingPopups
      closeAllPopups(key)
      controller.enterTimer = setTimeout(() => {
        controller.enterTimer = undefined
        if (controller.triggerHovered)
          topBarStore.popupVisible[key] = true
      }, browsingPopups ? 0 : 320)
    }

    function scheduleClose() {
      clearEnterTimer()
      clearLeaveTimer()
      controller.leaveTimer = setTimeout(() => {
        controller.leaveTimer = undefined
        if (!controller.triggerHovered && !controller.popupHovered && !controller.keyboardOpen)
          topBarStore.popupVisible[key] = false
      }, 320)
    }

    function handleTriggerLeave() {
      controller.triggerHovered = false
      scheduleClose()
    }

    function getTrigger(): HTMLElement | null {
      return unrefElement(element)?.querySelector<HTMLElement>('.top-bar-trigger, .logo') ?? null
    }

    function focusPopup() {
      if (!controller.keyboardOpen || !topBarStore.popupVisible[key])
        return
      const popup = controller.popupElement
      const firstControl = popup?.querySelector<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), [tabindex="0"]')
      ;(firstControl ?? popup)?.focus({ preventScroll: true })
    }

    function handleKeydown(event: Event) {
      const keyboardEvent = event as KeyboardEvent
      if (keyboardEvent.defaultPrevented)
        return
      if (keyboardEvent.key === 'Escape' && topBarStore.popupVisible[key]) {
        keyboardEvent.preventDefault()
        keyboardEvent.stopPropagation()
        clearControllerTimers(controller)
        controller.keyboardOpen = false
        topBarStore.popupVisible[key] = false
        getTrigger()?.focus({ preventScroll: true })
      }
      else if (keyboardEvent.target === getTrigger() && (
        keyboardEvent.key === 'ArrowDown'
        || keyboardEvent.key === 'ArrowUp'
        || (key === 'more' && ['Enter', ' '].includes(keyboardEvent.key))
      )) {
        keyboardEvent.preventDefault()
        keyboardEvent.stopPropagation()
        clearOtherHoverTimers()
        clearControllerTimers(controller)
        closeAllPopups(key)
        controller.keyboardOpen = true
        controller.instantOpen = true
        topBarStore.popupVisible[key] = true
        void nextTick(focusPopup)
      }
    }

    function handleFocusOut(event: Event) {
      const nextTarget = (event as FocusEvent).relatedTarget
      if (nextTarget instanceof Node && unrefElement(element)?.contains(nextTarget))
        return
      if (controller.keyboardOpen) {
        controller.keyboardOpen = false
        topBarStore.popupVisible[key] = false
      }
    }

    watch(() => topBarStore.popupVisible[key], (visible) => {
      getTrigger()?.setAttribute('aria-expanded', String(visible))
      if (!visible)
        controller.keyboardOpen = false
      if (controller.popupElement)
        controller.popupElement.dataset.instant = String(controller.instantOpen)
    }, { flush: 'sync' })

    watch([element, () => settings.value.touchScreenOptimization], ([target, touchOptimized], _, onCleanup) => {
      const triggerElement = unrefElement(target)
      const trigger = getTrigger()
      trigger?.setAttribute('aria-expanded', String(Boolean(topBarStore.popupVisible[key])))
      trigger?.setAttribute('aria-controls', `bew-topbar-popup-${key}`)
      trigger?.setAttribute('aria-keyshortcuts', 'ArrowDown ArrowUp')
      triggerElement?.addEventListener('keydown', handleKeydown)
      triggerElement?.addEventListener('focusout', handleFocusOut)
      if (!triggerElement)
        topBarStore.popupVisible[key] = false
      if (triggerElement && !touchOptimized) {
        triggerElement.addEventListener('mouseenter', handleTriggerEnter)
        triggerElement.addEventListener('mouseleave', handleTriggerLeave)
      }
      onCleanup(() => {
        triggerElement?.removeEventListener('mouseenter', handleTriggerEnter)
        triggerElement?.removeEventListener('mouseleave', handleTriggerLeave)
        triggerElement?.removeEventListener('keydown', handleKeydown)
        triggerElement?.removeEventListener('focusout', handleFocusOut)
        controller.triggerHovered = false
        controller.popupHovered = false
        controller.keyboardOpen = false
        clearEnterTimer()
        clearLeaveTimer()
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
        if (!activeController.triggerHovered && !activeController.popupHovered && !activeController.keyboardOpen)
          topBarStore.popupVisible[key] = false
      }, 320)
    }

    watch([popupRef, () => settings.value.touchScreenOptimization], ([target, touchOptimized], _, onCleanup) => {
      const popupElement = unrefElement(target)
      if (popupElement instanceof HTMLElement) {
        activeController.popupElement = popupElement
        popupElement.id = `bew-topbar-popup-${key}`
        popupElement.tabIndex = -1
        popupElement.dataset.instant = String(activeController.instantOpen)
      }
      if (popupElement && !touchOptimized) {
        popupElement.addEventListener('mouseenter', handlePopupEnter)
        popupElement.addEventListener('mouseleave', handlePopupLeave)
      }
      onCleanup(() => {
        popupElement?.removeEventListener('mouseenter', handlePopupEnter)
        popupElement?.removeEventListener('mouseleave', handlePopupLeave)
        activeController.popupElement = undefined
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
    const openMode = resolveConfiguredLinkAction(settings.value.topBarLinkOpenMode, location.href, activatedPage.value)

    if (openMode === 'background') {
      resetTopBarTransientInteraction()
      void openLinkInBackground(pageUrl)
      return
    }

    if (openMode === 'newTab') {
      resetTopBarTransientInteraction()
      window.open(pageUrl, '_blank')
      return
    }

    if (isInIframe()) {
      window.open(pageUrl, '_top')
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
