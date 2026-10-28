<script setup lang="ts">
import { onKeyStroke } from '@vueuse/core'
import { computed, nextTick, onActivated, onDeactivated, onMounted, onUnmounted, ref, watch } from 'vue'

import { useBewlyApp } from '~/composables/useAppProvider'
import { useCurrentLocationHref } from '~/composables/useCurrentLocationHref'
import { useDark } from '~/composables/useDark'
import { usePageDim } from '~/composables/usePageDim'
import { BEWLY_IFRAME_DRAWER_HOST_CHANGE } from '~/constants/globalEvents'
import { settings } from '~/logic'
import { useIframePageActive } from '~/logic/iframePageState'
import { isLayoutEditing } from '~/logic/layoutEdit'
import { useSettingsStore } from '~/stores/settingsStore'
import { useTopBarStore } from '~/stores/topBarStore'
import { isBewlyWidescreenActive } from '~/utils/bewlyWidescreen'
import { isIframeDrawerHost } from '~/utils/iframeDrawerHost'
import { isInIframe, isUserSpacePage } from '~/utils/main'
import { reportRuntimeFailure } from '~/utils/messaging'

import TopBarHeader from './components/TopBarHeader.vue'
import TopBarLogo from './components/TopBarLogo.vue'
import { resetTopBarTransientInteraction, useTopBarInteraction } from './composables/useTopBarInteraction'

const { reachTop } = useBewlyApp()
// 顶栏状态管理
const topBarStore = useTopBarStore()
// The glass panels (profile and the media popovers) dim the page; the small
// upload and more menus stay menus.
usePageDim(() => (['userPanel', 'moments', 'favorites', 'history', 'watchLater'] as const).some(key => topBarStore.popupVisible[key]))
const settingsStore = useSettingsStore()
const { forceWhiteIcon, hasOpenClickPopup } = useTopBarInteraction()

const conflictingHeaderSelectors = ['.fixed-author-header', '.fixed-top-header']
const spaceNavbarSelector = '.nav-bar.space-navbar'

const { isDark } = useDark()

// 顶栏始终显示，只在两种情况下让位：Bewly 宽屏播放页，或原页面自己的固定页头
// （含个人空间的吸顶导航）出现时，避免两层页头重叠。
const bewlyWidescreenActive = ref(false)
const forceHideTopBar = ref(false)

const currentLocationHref = useCurrentLocationHref()
const effectiveTopBarSource = computed(() => settingsStore.getEffectiveTopBarSource())
const usesNativeTopBar = computed(() => effectiveTopBarSource.value === 'bilibili-native')
const iframeDrawerHost = ref(isIframeDrawerHost())
const iframePageActive = useIframePageActive()
const hostAllowsUiReads = computed(() => !iframeDrawerHost.value && (isInIframe() || !iframePageActive.value))

let topBarMounted = false

// 检测是否有弹窗激活
const hasActivePopup = computed(() => {
  return Object.values(topBarStore.popupVisible).some(visible => visible)
})

const hideTopBar = computed(() => bewlyWidescreenActive.value
  || (forceHideTopBar.value && !hasActivePopup.value && !isLayoutEditing.value))

watch(isLayoutEditing, (editing) => {
  if (editing)
    resetTopBarTransientInteraction()
})

watch(currentLocationHref, () => {
  setupSpaceScrollListener()
  startConflictingHeaderObservation()
}, { flush: 'post' })

// The profile page's sticky navigation appears with scrolling; re-check overlap then.
function handleSpaceScroll() {
  scheduleConflictingHeaderVisibilityUpdate()
}

function setupSpaceScrollListener() {
  window.removeEventListener('scroll', handleSpaceScroll)
  if (isUserSpacePage() && !iframeDrawerHost.value)
    window.addEventListener('scroll', handleSpaceScroll, { passive: true })
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
}

function startWidescreenStateObservation() {
  widescreenStateObserver?.disconnect()
  updateWidescreenState()
  if (!document.body)
    return
  widescreenStateObserver = new MutationObserver(updateWidescreenState)
  widescreenStateObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] })
}

function handleIframeDrawerHostChange() {
  iframeDrawerHost.value = isIframeDrawerHost()
  setupSpaceScrollListener()
}

// 处理点击外部关闭 POP 窗（仅在触屏优化开启时）
function handleClickOutsidePopup(event: MouseEvent) {
  if (!settings.value.touchScreenOptimization && !hasOpenClickPopup())
    return

  if (!hasActivePopup.value)
    return

  const target = event.target as HTMLElement

  // 检查点击是否在顶栏项目按钮上（这些按钮会自己处理切换逻辑）
  const isTopBarItemButton = target.closest('.right-side-item')
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
  window.addEventListener(BEWLY_IFRAME_DRAWER_HOST_CHANGE, handleIframeDrawerHostChange)
  setupSpaceScrollListener()
  startConflictingHeaderObservation()
  startWidescreenStateObservation()

  // 添加全局点击事件监听器（用于触屏模式下点击外部关闭弹窗）
  document.addEventListener('click', handleClickOutsidePopup)
  // 页面重新可见时按本地 Cookie 校正登录态：覆盖「他处登录/登出后
  // 本标签处于后台」的场景，无需轮询（见 issue #921）
  document.addEventListener('visibilitychange', handleVisibilityChange)
  window.addEventListener('blur', resetTopBarTransientInteraction)

  nextTick(async () => {
    if (!topBarMounted)
      return
    // 初始化数据和更新定时器
    try {
      await topBarStore.setUiActive(!document.hidden && hostAllowsUiReads.value)
    }
    catch (error) {
      reportRuntimeFailure('Failed to initialize TopBar data', error)
    }
  })
})

function handleVisibilityChange() {
  void topBarStore.setUiActive(topBarMounted && !document.hidden && hostAllowsUiReads.value).catch(error => reportRuntimeFailure('Failed to resume TopBar data', error))
  if (document.hidden) {
    resetTopBarTransientInteraction()
  }
}

onDeactivated(() => {
  void topBarStore.setUiActive(false)
})
onActivated(() => {
  if (topBarMounted)
    handleVisibilityChange()
})
watch(hostAllowsUiReads, () => {
  if (topBarMounted)
    handleVisibilityChange()
})

onUnmounted(() => {
  topBarMounted = false

  stopConflictingHeaderObservation()
  widescreenStateObserver?.disconnect()
  widescreenStateObserver = undefined
  window.removeEventListener('scroll', handleSpaceScroll)
  // 使用 store 中的方法清理定时器
  topBarStore.cleanup()

  // 移除全局点击事件监听器
  document.removeEventListener('click', handleClickOutsidePopup)
  document.removeEventListener('visibilitychange', handleVisibilityChange)
  window.removeEventListener('blur', resetTopBarTransientInteraction)
  window.removeEventListener(BEWLY_IFRAME_DRAWER_HOST_CHANGE, handleIframeDrawerHostChange)
})

onKeyStroke('Escape', (event: KeyboardEvent) => {
  if ((!settings.value.touchScreenOptimization && !hasOpenClickPopup()) || !hasActivePopup.value)
    return

  event.preventDefault()
  resetTopBarTransientInteraction()
})
</script>

<template>
  <div class="top-bar-container">
    <!-- The playback page frames its card from the window corner; the Dock still leads home. -->
    <TopBarLogo
      v-if="topBarStore.showTopBar && !bewlyWidescreenActive"
      class="floating-home-logo"
      floating
      :force-white-icon="forceWhiteIcon && !hideTopBar"
    />
    <Transition name="top-bar">
      <header
        v-if="topBarStore.showTopBar"
        class="top-bar"
        w="full" transition="opacity duration-300, transform duration-300, background-color duration-300"
        :class="{ 'hide': hideTopBar, 'force-white-icon': forceWhiteIcon }"
      >
        <TopBarHeader
          :active="hostAllowsUiReads && !hideTopBar && !usesNativeTopBar"
          :force-white-icon="forceWhiteIcon"
          :reach-top="reachTop"
          :is-dark="isDark"
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
</style>
