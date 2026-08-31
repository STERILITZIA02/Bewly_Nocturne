<script setup lang="ts">
import { onKeyStroke, useMediaQuery, useMouseInElement } from '@vueuse/core'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'

import { useBewlyApp } from '~/composables/useAppProvider'
import { useCurrentLocationHref } from '~/composables/useCurrentLocationHref'
import { useDark } from '~/composables/useDark'
import { OVERLAY_SCROLL_BAR_SCROLL, TOP_BAR_SCROLL_VISIBILITY_CHANGE, TOP_BAR_VISIBILITY_CHANGE } from '~/constants/globalEvents'
import { VideoPageTopBarConfig } from '~/enums/appEnums'
import { settings } from '~/logic'
import { isLayoutEditing, useLayoutEditableRoot } from '~/logic/layoutEdit'
import { useSettingsStore } from '~/stores/settingsStore'
import { useTopBarStore } from '~/stores/topBarStore'
import { isBewlyWidescreenActive } from '~/utils/bewlyWidescreen'
import { isHomePage, isUserSpacePage, isVideoOrBangumiPage } from '~/utils/main'
import { reportRuntimeFailure } from '~/utils/messaging'
import emitter from '~/utils/mitt'

import NotificationsDrawer from './components/NotificationsDrawer.vue'
import TopBarHeader from './components/TopBarHeader.vue'
import { resetTopBarTransientInteraction, useTopBarInteraction } from './composables/useTopBarInteraction'

const { reachTop } = useBewlyApp()
// 顶栏状态管理
const topBarStore = useTopBarStore()
const settingsStore = useSettingsStore()
const { forceWhiteIcon } = useTopBarInteraction()

const conflictingHeaderSelectors = ['.fixed-author-header', '.fixed-top-header']
const spaceNavbarSelector = '.nav-bar.space-navbar'

const { isDark } = useDark()

// 顶栏显示控制
const hideTopBar = ref<boolean>(false)
const desiredTopBarVisible = ref(true)
const forceHideTopBar = ref(false)
const bewlyWidescreenActive = ref(false)
const headerTarget = ref<HTMLElement>()
const topAreaTarget = ref<HTMLElement>()
useLayoutEditableRoot('topBar', headerTarget)
const { isOutside: isOutsideTopBar } = useMouseInElement(headerTarget)
const { isOutside: isOutsideTopArea } = useMouseInElement(topAreaTarget)

const currentLocationHref = useCurrentLocationHref()
const effectiveTopBarSource = computed(() => settingsStore.getEffectiveTopBarSource())
const usesNativeTopBar = computed(() => effectiveTopBarSource.value === 'bilibili-native')
const isCurrentVideoPage = computed(() => isVideoOrBangumiPage(currentLocationHref.value))
const coarsePointer = useMediaQuery('(pointer: coarse)')
const lastPointerType = ref<'mouse' | 'touch' | 'pen'>(coarsePointer.value ? 'touch' : 'mouse')
const effectiveVideoTopBarConfig = computed(() => {
  const configuredMode = settings.value.videoPageTopBarConfig
  // 原版顶栏没有 Bewly 顶栏的顶部 Hover 感应层；该模式仅属于 Bewly 顶栏。
  if (usesNativeTopBar.value && configuredMode === VideoPageTopBarConfig.ShowOnMouse)
    return VideoPageTopBarConfig.AlwaysShow
  if (configuredMode === VideoPageTopBarConfig.ShowOnMouse && lastPointerType.value !== 'mouse')
    return VideoPageTopBarConfig.ShowOnScroll
  return configuredMode
})

// 延迟隐藏计时器
let hideTimer: number | null = null
let topBarMounted = false

function clearHideTimer() {
  if (hideTimer !== null) {
    clearTimeout(hideTimer)
    hideTimer = null
  }
}

// 检测是否有弹窗激活
const hasActivePopup = computed(() => {
  return Object.values(topBarStore.popupVisible).some(visible => visible)
})

const ORIGINAL_VIDEO_TOP_BAR_CONTROLLED_CLASS = 'bewly-original-video-top-bar-controlled'
const ORIGINAL_VIDEO_TOP_BAR_HIDDEN_CLASS = 'bewly-original-video-top-bar-hidden'

function clearOriginalVideoTopBarVisibility() {
  document.documentElement.classList.remove(
    ORIGINAL_VIDEO_TOP_BAR_CONTROLLED_CLASS,
    ORIGINAL_VIDEO_TOP_BAR_HIDDEN_CLASS,
  )
}

function syncOriginalVideoTopBarVisibility(shouldShow: boolean) {
  const shouldControl = usesNativeTopBar.value
    && isCurrentVideoPage.value
    && settings.value.videoPageTopBarConfig !== VideoPageTopBarConfig.ShowOnMouse

  document.documentElement.classList.toggle(ORIGINAL_VIDEO_TOP_BAR_CONTROLLED_CLASS, shouldControl)
  document.documentElement.classList.toggle(ORIGINAL_VIDEO_TOP_BAR_HIDDEN_CLASS, shouldControl && !shouldShow)
}

function applyTopBarVisibility() {
  const shouldShow = !bewlyWidescreenActive.value
    && (
      isLayoutEditing.value
      || (
        desiredTopBarVisible.value
        && (
          !forceHideTopBar.value
          || hasActivePopup.value
        )
      )
    )

  hideTopBar.value = !shouldShow
  syncOriginalVideoTopBarVisibility(shouldShow)
  topBarStore.setTopBarVisible(shouldShow)
  emitter.emit(TOP_BAR_VISIBILITY_CHANGE, shouldShow)
}

// 处理顶栏显示/隐藏逻辑的函数
function handleTopBarVisibility() {
  if (bewlyWidescreenActive.value)
    return
  if (isLayoutEditing.value) {
    clearHideTimer()
    toggleTopBarVisible(true)
    return
  }

  if (isVideoOrBangumiPage() && effectiveVideoTopBarConfig.value === VideoPageTopBarConfig.ShowOnMouse) {
    // 清除之前的计时器
    clearHideTimer()

    // 如果鼠标在顶栏区域或顶部监听区域，或者有任何弹窗激活，则显示顶栏
    if (!isOutsideTopBar.value || !isOutsideTopArea.value || hasActivePopup.value) {
      toggleTopBarVisible(true)
    }
    else {
      // 延迟隐藏顶栏
      hideTimer = window.setTimeout(() => {
        // 再次检查是否有弹窗激活，防止在延迟期间有弹窗打开
        const hasActivePopupNow = hasActivePopup.value
        // 在鼠标显示模式下，如果所有弹窗都关闭且鼠标不在检测区域，则隐藏顶栏
        if (!hasActivePopupNow) {
          toggleTopBarVisible(false)
        }
      }, 500) // 500ms 延迟
    }
  }
}

// 监听鼠标位置变化和相关状态
watch([isOutsideTopBar, isOutsideTopArea], handleTopBarVisibility)

// 监听弹窗状态变化
watch(hasActivePopup, () => {
  // 当弹窗状态变化时，触发顶栏显示/隐藏逻辑
  handleTopBarVisibility()
  applyTopBarVisibility()
})

watch(forceHideTopBar, () => {
  applyTopBarVisibility()
})

watch(isLayoutEditing, (editing) => {
  clearHideTimer()
  if (editing) {
    desiredTopBarVisible.value = true
    resetTopBarTransientInteraction()
  }
  applyTopBarVisibility()
})

watch(currentLocationHref, () => {
  setupScrollListeners()
  startConflictingHeaderObservation()
}, { flush: 'post' })

watch(effectiveTopBarSource, () => {
  clearHideTimer()
  setupScrollListeners()
}, { flush: 'post' })

// 滚动处理
const scrollTop = ref<number>(0)
const oldScrollTop = ref<number>(0)
const topBarVisibilityAnchorScrollTop = ref<number>(0)
const TOP_BAR_HIDE_SCROLL_THRESHOLD = 20
const TOP_BAR_SHOW_SCROLL_THRESHOLD = 20

// 保存overlay scroll的handler引用，用于正确移除监听器
let overlayScrollHandler: ((scrollTop: number) => void) | null = null

function handleScroll(arg?: number | Event): void {
  // ✅ 性能优化：优先使用传入的 scrollTop 值，避免重复 DOM 读取
  if (typeof arg === 'number') {
    scrollTop.value = arg
  }
  else {
    // ✅ 只在非首页或使用原始页面时才需要读取 DOM
    // 首页场景下必须通过 OVERLAY_SCROLL_BAR_SCROLL 事件接收 scrollTop
    if (!isHomePage()) {
      scrollTop.value = document.documentElement.scrollTop
    }
    else {
      // 首页且使用 Bewly 页面时，必须通过事件传递 scrollTop
      // 如果执行到这里说明事件没有正确传递参数，警告并返回
      console.warn('[TopBar Performance] Missing scrollTop parameter from OVERLAY_SCROLL_BAR_SCROLL event')
      return
    }
  }

  if (isUserSpacePage()) {
    scheduleConflictingHeaderVisibilityUpdate()
  }

  // 计算滚动距离，只有超过阈值才处理
  const scrollDelta = scrollTop.value - oldScrollTop.value
  const finishScrollHandling = () => {
    oldScrollTop.value = scrollTop.value
  }

  // 在视频页面处理不同的配置
  if (isVideoOrBangumiPage()) {
    const config = effectiveVideoTopBarConfig.value

    // 总是显示：不处理滚动隐藏
    if (config === VideoPageTopBarConfig.AlwaysShow) {
      // 不做任何处理，保持显示
      finishScrollHandling()
      return
    }

    // 总是隐藏：不处理滚动显示
    if (config === VideoPageTopBarConfig.AlwaysHide) {
      // 不做任何处理，保持隐藏
      finishScrollHandling()
      return
    }

    // 鼠标显示：不处理滚动事件
    if (config === VideoPageTopBarConfig.ShowOnMouse) {
      finishScrollHandling()
      return
    }

    // 滚动显示：处理滚动逻辑
    if (config === VideoPageTopBarConfig.ShowOnScroll) {
      if (scrollTop.value === 0) {
        setTopBarVisibleFromScroll(true, scrollDelta)
      }
      else if (!hideTopBar.value && scrollDelta < 0) {
        topBarVisibilityAnchorScrollTop.value = scrollTop.value
      }
      else if (hideTopBar.value && scrollDelta > 0) {
        topBarVisibilityAnchorScrollTop.value = scrollTop.value
      }
      else if (!hideTopBar.value && scrollDelta > 0 && scrollTop.value - topBarVisibilityAnchorScrollTop.value > TOP_BAR_HIDE_SCROLL_THRESHOLD) {
        // 只有滚动超过阈值才更新状态
        setTopBarVisibleFromScroll(false, scrollDelta)
      }
      else if (hideTopBar.value && scrollDelta < 0 && topBarVisibilityAnchorScrollTop.value - scrollTop.value > TOP_BAR_SHOW_SCROLL_THRESHOLD) {
        setTopBarVisibleFromScroll(true, scrollDelta)
      }
    }
    finishScrollHandling()
  }
  // 处理其他页面的自动隐藏逻辑
  else {
    if (scrollTop.value === 0) {
      setTopBarVisibleFromScroll(true, scrollDelta)
      finishScrollHandling()
      return
    }

    // 在用户首页强制开启滚动隐藏，无论设置如何
    if (isUserSpacePage() || settings.value.autoHideTopBar) {
      if (!hideTopBar.value && scrollDelta < 0) {
        topBarVisibilityAnchorScrollTop.value = scrollTop.value
      }
      else if (hideTopBar.value && scrollDelta > 0) {
        topBarVisibilityAnchorScrollTop.value = scrollTop.value
      }
      else if (!hideTopBar.value && scrollDelta > 0 && scrollTop.value - topBarVisibilityAnchorScrollTop.value > TOP_BAR_HIDE_SCROLL_THRESHOLD) {
        setTopBarVisibleFromScroll(false, scrollDelta)
      }
      else if (hideTopBar.value && scrollDelta < 0 && topBarVisibilityAnchorScrollTop.value - scrollTop.value > TOP_BAR_SHOW_SCROLL_THRESHOLD) {
        setTopBarVisibleFromScroll(true, scrollDelta)
      }
    }
    finishScrollHandling()
  }
}

function toggleTopBarVisible(visible: boolean) {
  desiredTopBarVisible.value = visible
  applyTopBarVisibility()
}

function setTopBarVisibleFromScroll(visible: boolean, scrollDelta: number) {
  topBarVisibilityAnchorScrollTop.value = scrollTop.value
  toggleTopBarVisible(visible)
  emitTopBarScrollVisibilityChange(!hideTopBar.value, scrollDelta)
}

function emitTopBarScrollVisibilityChange(visible: boolean, scrollDelta: number) {
  emitter.emit(TOP_BAR_SCROLL_VISIBILITY_CHANGE, {
    visible,
    scrollTop: scrollTop.value,
    scrollDelta,
  })
}

function setupScrollListeners() {
  // 根据视频页面配置设置初始显示状态
  if (isVideoOrBangumiPage()) {
    const config = effectiveVideoTopBarConfig.value
    if (config === VideoPageTopBarConfig.AlwaysHide || config === VideoPageTopBarConfig.ShowOnMouse) {
      toggleTopBarVisible(false)
    }
    else {
      toggleTopBarVisible(true)
    }
  }
  else {
    toggleTopBarVisible(true)
  }

  // 清理之前的监听器
  cleanupScrollListeners()

  // 在视频页面根据配置决定是否设置滚动监听
  if (isVideoOrBangumiPage()) {
    const config = effectiveVideoTopBarConfig.value
    // 只有在滚动显示模式下才设置滚动监听
    if (config !== VideoPageTopBarConfig.ShowOnScroll) {
      return
    }
  }

  // 设置滚动监听
  if (isHomePage()) {
    // 创建并保存handler引用
    overlayScrollHandler = (payloadScrollTop: number) => {
      handleScroll(payloadScrollTop)
    }
    emitter.on(OVERLAY_SCROLL_BAR_SCROLL, overlayScrollHandler)
  }
  else {
    window.addEventListener('scroll', handleScroll)
  }
}

function cleanupScrollListeners() {
  window.removeEventListener('scroll', handleScroll)
  // 只移除我们自己的handler，不影响其他组件（如VideoCardGrid）的监听器
  if (overlayScrollHandler) {
    emitter.off(OVERLAY_SCROLL_BAR_SCROLL, overlayScrollHandler)
    overlayScrollHandler = null
  }
}

function isVisibleElement(element: HTMLElement) {
  const style = window.getComputedStyle(element)
  return style.display !== 'none'
    && style.visibility !== 'hidden'
    && Number.parseFloat(style.opacity) !== 0
    && element.offsetWidth > 0
    && element.offsetHeight > 0
}

function isStickySpaceNavbarVisible(targets: HTMLElement[]) {
  if (!isUserSpacePage())
    return false

  return targets.some((element) => {
    if (!isVisibleElement(element))
      return false
    const style = window.getComputedStyle(element)
    const rect = element.getBoundingClientRect()
    return style.position === 'sticky' && rect.top <= 1 && rect.bottom > 0
  })
}

let conflictingHeaderTargets: HTMLElement[] = []

function updateConflictingHeaderVisibility(targets = conflictingHeaderTargets) {
  const hasVisibleHeader = isUserSpacePage()
    ? isStickySpaceNavbarVisible(targets)
    : targets.some(isVisibleElement)

  forceHideTopBar.value = hasVisibleHeader
  applyTopBarVisibility()
}

let conflictingHeaderDiscoveryObserver: MutationObserver | undefined
let conflictingHeaderTargetObservers: MutationObserver[] = []
let conflictingHeaderUpdateRaf: number | undefined
let conflictingHeaderVisibilityRaf: number | undefined
let conflictingHeaderDiscoveryTimer: ReturnType<typeof setTimeout> | undefined
let conflictingHeaderDiscoveryDeadline = 0

function findConflictingHeaders(): HTMLElement[] {
  const selectors = isUserSpacePage() ? [spaceNavbarSelector] : conflictingHeaderSelectors
  return selectors.flatMap(selector =>
    Array.from(document.querySelectorAll<HTMLElement>(selector)),
  )
}

function stopConflictingHeaderObservation() {
  conflictingHeaderDiscoveryObserver?.disconnect()
  conflictingHeaderDiscoveryObserver = undefined
  conflictingHeaderTargetObservers.forEach(observer => observer.disconnect())
  conflictingHeaderTargetObservers = []
  if (conflictingHeaderUpdateRaf != null)
    cancelAnimationFrame(conflictingHeaderUpdateRaf)
  conflictingHeaderUpdateRaf = undefined
  if (conflictingHeaderVisibilityRaf != null)
    cancelAnimationFrame(conflictingHeaderVisibilityRaf)
  conflictingHeaderVisibilityRaf = undefined
  if (conflictingHeaderDiscoveryTimer != null)
    clearTimeout(conflictingHeaderDiscoveryTimer)
  conflictingHeaderDiscoveryTimer = undefined
  conflictingHeaderDiscoveryDeadline = 0
  conflictingHeaderTargets = []
}

function scheduleConflictingHeaderRefresh() {
  if (conflictingHeaderUpdateRaf != null)
    return

  conflictingHeaderUpdateRaf = requestAnimationFrame(() => {
    conflictingHeaderUpdateRaf = undefined
    bindConflictingHeaderObservers()
  })
}

function scheduleConflictingHeaderVisibilityUpdate() {
  if (conflictingHeaderVisibilityRaf != null)
    return
  conflictingHeaderVisibilityRaf = requestAnimationFrame(() => {
    conflictingHeaderVisibilityRaf = undefined
    updateConflictingHeaderVisibility()
  })
}

function nodeContainsConflictingHeader(node: Node): boolean {
  const selectors = isUserSpacePage() ? [spaceNavbarSelector] : conflictingHeaderSelectors
  return node instanceof Element && selectors.some(selector =>
    node.matches(selector) || Boolean(node.querySelector(selector)),
  )
}

function scheduleConflictingHeaderDiscoveryRetry() {
  if (conflictingHeaderDiscoveryTimer != null || Date.now() >= conflictingHeaderDiscoveryDeadline)
    return
  conflictingHeaderDiscoveryTimer = setTimeout(() => {
    conflictingHeaderDiscoveryTimer = undefined
    if (findConflictingHeaders().length > 0)
      scheduleConflictingHeaderRefresh()
    else
      scheduleConflictingHeaderDiscoveryRetry()
  }, 250)
}

function bindConflictingHeaderObservers() {
  conflictingHeaderDiscoveryObserver?.disconnect()
  conflictingHeaderDiscoveryObserver = undefined
  conflictingHeaderTargetObservers.forEach(observer => observer.disconnect())
  conflictingHeaderTargetObservers = []

  const targets = findConflictingHeaders()
  conflictingHeaderTargets = targets
  updateConflictingHeaderVisibility(targets)

  if (targets.length === 0) {
    const discoveryRoot = isUserSpacePage()
      ? document.querySelector('#app') ?? document.body
      : document.body
    if (!discoveryRoot)
      return
    conflictingHeaderDiscoveryObserver = new MutationObserver((mutations) => {
      if (mutations.some(mutation => Array.from(mutation.addedNodes).some(nodeContainsConflictingHeader)))
        scheduleConflictingHeaderRefresh()
    })
    conflictingHeaderDiscoveryObserver.observe(discoveryRoot, { childList: true, subtree: true })
    scheduleConflictingHeaderDiscoveryRetry()
    return
  }

  if (conflictingHeaderDiscoveryTimer != null)
    clearTimeout(conflictingHeaderDiscoveryTimer)
  conflictingHeaderDiscoveryTimer = undefined

  targets.forEach((target) => {
    const observer = new MutationObserver(scheduleConflictingHeaderRefresh)
    observer.observe(target, { attributes: true, attributeFilter: ['class', 'style'] })
    if (target.parentElement)
      observer.observe(target.parentElement, { childList: true })
    conflictingHeaderTargetObservers.push(observer)
  })
}

function startConflictingHeaderObservation() {
  stopConflictingHeaderObservation()
  conflictingHeaderDiscoveryDeadline = Date.now() + 2000
  scheduleConflictingHeaderRefresh()
}

let widescreenStateObserver: MutationObserver | undefined

function updateWidescreenState() {
  bewlyWidescreenActive.value = isBewlyWidescreenActive()
  applyTopBarVisibility()
}

function startWidescreenStateObservation() {
  widescreenStateObserver?.disconnect()
  updateWidescreenState()
  if (!document.body)
    return
  widescreenStateObserver = new MutationObserver(updateWidescreenState)
  widescreenStateObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] })
}

// 处理点击外部关闭 POP 窗（仅在触屏优化开启时）
function handleClickOutsidePopup(event: MouseEvent) {
  if (!settings.value.touchScreenOptimization)
    return

  if (!hasActivePopup.value)
    return

  const target = event.target as HTMLElement

  // 检查点击是否在顶栏项目按钮上（这些按钮会自己处理切换逻辑）
  const isTopBarItemButton = target.closest('.logo, .right-side-item, .home-button')
  if (isTopBarItemButton)
    return

  // 检查点击是否在弹窗内
  const isInPopup = target.closest('.bew-popover')
  if (isInPopup)
    return

  // 点击在弹窗外部，关闭所有弹窗
  resetTopBarTransientInteraction()
}

// 生命周期钩子
onMounted(() => {
  topBarMounted = true
  // 可见性策略必须先于异步数据初始化生效，避免原版 AlwaysHide 首屏闪现，
  // 也确保 ShowOnScroll 在初始化期间已经接管滚动。
  setupScrollListeners()
  startConflictingHeaderObservation()
  startWidescreenStateObservation()

  // 添加全局点击事件监听器（用于触屏模式下点击外部关闭弹窗）
  document.addEventListener('click', handleClickOutsidePopup)
  // 页面重新可见时按本地 Cookie 校正登录态：覆盖「他处登录/登出后
  // 本标签处于后台」的场景，无需轮询（见 issue #921）
  document.addEventListener('visibilitychange', handleVisibilityChange)
  window.addEventListener('blur', resetTopBarTransientInteraction)
  window.addEventListener('pointerdown', handlePointerDown, { passive: true })

  nextTick(async () => {
    // 初始化数据和更新定时器
    try {
      await topBarStore.initData()
    }
    catch (error) {
      reportRuntimeFailure('Failed to initialize TopBar data', error)
    }
    if (!topBarMounted)
      return
    // 启动定时器：已登录时同步角标/补填 userInfo；未登录时不启动轮询，
    // 登录态由本地 Cookie 事实与事件驱动维护（见 issue #921）
    topBarStore.startUpdateTimer()
  })
})

function handleVisibilityChange() {
  if (document.hidden) {
    resetTopBarTransientInteraction()
    return
  }
  topBarStore.reconcileLocalLoginState()
}

function handlePointerDown(event: PointerEvent) {
  lastPointerType.value = event.pointerType === 'pen' || event.pointerType === 'touch' ? event.pointerType : 'mouse'
}

watch(effectiveVideoTopBarConfig, () => {
  clearHideTimer()
  setupScrollListeners()
}, { flush: 'post' })

onUnmounted(() => {
  topBarMounted = false
  clearHideTimer()

  stopConflictingHeaderObservation()
  widescreenStateObserver?.disconnect()
  widescreenStateObserver = undefined
  clearOriginalVideoTopBarVisibility()

  cleanupScrollListeners()
  // 使用 store 中的方法清理定时器
  topBarStore.cleanup()

  // 移除全局点击事件监听器
  document.removeEventListener('click', handleClickOutsidePopup)
  document.removeEventListener('visibilitychange', handleVisibilityChange)
  window.removeEventListener('blur', resetTopBarTransientInteraction)
  window.removeEventListener('pointerdown', handlePointerDown)
})

onKeyStroke('Escape', (event: KeyboardEvent) => {
  if (!settings.value.touchScreenOptimization || !hasActivePopup.value)
    return

  event.preventDefault()
  resetTopBarTransientInteraction()
})

defineExpose({
  toggleTopBarVisible,
  handleScroll,
})

// 导出枚举供模板使用
const VideoPageTopBarConfigEnum = VideoPageTopBarConfig
</script>

<template>
  <div class="top-bar-container">
    <!-- 顶部监听区域 -->
    <div
      v-if="!bewlyWidescreenActive && isCurrentVideoPage && effectiveVideoTopBarConfig === VideoPageTopBarConfigEnum.ShowOnMouse"
      ref="topAreaTarget"
      class="top-area-listener"
    />
    <Transition name="top-bar">
      <header
        v-if="topBarStore.showTopBar"
        ref="headerTarget"
        class="top-bar"
        data-layout-editable-id="topbar"
        w="full" transition="opacity duration-300, transform duration-300, background-color duration-300"
        :class="{ 'hide': hideTopBar, 'force-white-icon': forceWhiteIcon }"
      >
        <TopBarHeader
          :force-white-icon="forceWhiteIcon"
          :reach-top="reachTop"
          :is-dark="isDark"
        />

        <NotificationsDrawer
          v-if="settings.openNotificationsPageAsDrawer && topBarStore.drawerVisible.notifications"
          :url="topBarStore.notificationsDrawerUrl"
          @close="topBarStore.drawerVisible.notifications = false"
        />
      </header>
    </Transition>
  </div>
</template>

<style lang="scss" scoped>
@use "./styles/index.scss";

.top-bar-container {
  position: relative;
  width: 100%;
}

.top-bar {
  top: 0;
  left: 0;
  right: 0;
  z-index: var(--bew-z-topbar);
  position: fixed;
}

.top-area-listener {
  cursor: default;
  position: fixed;
  z-index: var(--bew-z-topbar-interaction);
  top: 0;
  left: 0;
  right: 0;
  height: 20px;
}
</style>
