<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { useElementSize, usePreferredReducedMotion, useWindowSize } from '@vueuse/core'
import type { CSSProperties } from 'vue'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { UndoForwardState, useBewlyApp } from '~/composables/useAppProvider'
import { useDark } from '~/composables/useDark'
import { useDelayedHover } from '~/composables/useDelayedHover'
import {
  getDockCollapsedStateForMode,
  getPreservedDockStageSize,
  normalizeDockPosition,
  resolveDockCollapsedShellSize,
  shouldAutoCollapseDock,
  shouldShowDockCollapseButton,
} from '~/constants/dock'
import { DOCK_LAYOUT, GRID_BREAKPOINTS } from '~/constants/layout'
import { HomeSubPage } from '~/contentScripts/views/Home/types'
import { AppPage } from '~/enums/appEnums'
import { settings } from '~/logic'
import {
  getDockItemLayoutEditableId,
  isLayoutEditing,
  useLayoutEditableRoot,
  useLayoutEditSettingValue,
  vLayoutEditable,
} from '~/logic/layoutEdit'
import type { DockItem } from '~/stores/mainStore'
import { useSettingsStore } from '~/stores/settingsStore'
import { useTopBarStore } from '~/stores/topBarStore'
import { resolveActiveDockItemPage } from '~/utils/dockActiveItem'
import { isHomePage, openLinkToNewTab } from '~/utils/main'
import { createWheelStepper } from '~/utils/wheelStep'

import CountBadge from '../CountBadge.vue'
import IconButton from '../IconButton.vue'
import LiquidSegmentIndicator from '../LiquidSegmentIndicator.vue'
import PageModeSwitcherButton from '../PageModeSwitcherButton.vue'
import Tooltip from '../Tooltip.vue'
import type { HoveringDockItem } from './types'

const props = defineProps<{
  activatedPage: AppPage
  settingsOpen: boolean
}>()

const emit = defineEmits<{
  (e: 'dockItemClick', dockItem: DockItem): void
  (e: 'dockItemMiddleClick', dockItem: DockItem): void
  (e: 'settingsVisibilityChange', origin: DOMRect): void
  (e: 'refresh'): void
  (e: 'backToTop'): void
  (e: 'undoRefresh'): void
  (e: 'forwardRefresh'): void
  (e: 'bottomShiftChange', shift: number): void
}>()

const settingsStore = useSettingsStore()
const topBarStore = useTopBarStore()
const { t } = useI18n()
// Read the same account-scoped authority as TopBar; Dock never starts polling
// or acknowledges messages merely because its badge is visible.
const dockBadges = computed<Partial<Record<AppPage, { count: number, label: string }>>>(() => {
  if (!topBarStore.isLogin)
    return {}
  const result: Partial<Record<AppPage, { count: number, label: string }>> = {}
  const sources = [
    [AppPage.Notifications, topBarStore.unReadMessageCount, 'dock.unread_messages'],
    [AppPage.Moments, topBarStore.newMomentsCount, 'dock.new_moments'],
    [AppPage.WatchLater, topBarStore.watchLaterCount, 'dock.pending_videos'],
  ] as const
  for (const [page, value, key] of sources) {
    if (Number.isFinite(value) && value > 0) {
      const count = Math.floor(value)
      result[page] = { count, label: t(key, { count }) }
    }
  }
  return result
})
const { isDark, toggleDark } = useDark()
const { reachTop, homeActivatedPage, undoForwardState, canRefreshHomeSubPage, getDockPageHref } = useBewlyApp()
const dockPositionSetting = useLayoutEditSettingValue('navigation.dock.position', () => settings.value.dockPosition)
const dockPosition = computed(() => normalizeDockPosition(dockPositionSetting.value))

// 计算属性：是否显示撤销按钮
const showUndo = computed(() => undoForwardState.value === UndoForwardState.ShowUndo)
// 计算属性：是否显示前进按钮
const showForward = computed(() => undoForwardState.value === UndoForwardState.ShowForward)

const DOCK_CONTENT_TRANSITION_MS = 150
const DOCK_SHELL_TRANSITION_MS = 300
const DOCK_SHELL_COMPLETION_BUFFER_MS = 50
const dockContentHover = ref<boolean>(false)
const dockInteractionActive = ref(false)
const dockReady = ref(false)
const isDockCollapsed = ref(false)
const isDockTransitioning = ref(false)
const isDockContentVisible = ref(true)
const isDockCollapsedTriggerVisible = ref(false)
const expandedDockWidth = ref(0)
const expandedDockHeight = ref(0)
const expandedDockShellWidth = ref(0)
const expandedDockShellHeight = ref(0)
const dockMorphDirection = ref<'collapse' | 'expand'>()
let dockReadyFrame: number | undefined
let dockMorphFrame: number | undefined
let dockContentTimer: ReturnType<typeof setTimeout> | undefined
let dockMorphCompletionTimer: ReturnType<typeof setTimeout> | undefined
let dockMorphGeneration = 0
const dockContentRef = useDelayedHover({
  enterDelay: 100,
  leaveDelay: 600,
  beforeEnter: () => {
    clearAutoCollapseTimer()
    if (isLayoutEditing.value)
      return
    if (shouldAutoCollapseDock(settings.value.dockCollapseMode))
      expandDock()
  },
  enter: () => {
    if (isLayoutEditing.value)
      return
    dockContentHover.value = true
  },
  leave: () => {
    if (isLayoutEditing.value) {
      dockContentHover.value = false
      return
    }
    dockContentHover.value = false
    if (shouldAutoCollapseDock(settings.value.dockCollapseMode) && !isLayoutEditing.value && !dockInteractionActive.value && !props.settingsOpen)
      collapseDock()
  },
})
useLayoutEditableRoot('dock', dockContentRef)
const { width: dockWidth, height: dockHeight } = useElementSize(dockContentRef)
const dockShellRef = ref<HTMLElement>()
const dockShellSurfaceRef = ref<HTMLElement>()
const { width: dockShellWidth, height: dockShellHeight } = useElementSize(
  dockShellRef,
  { width: 0, height: 0 },
  { box: 'border-box' },
)
const preferredReducedMotion = usePreferredReducedMotion()

let autoCollapseTimer: ReturnType<typeof setTimeout> | undefined

const hoveringDockItem = reactive<HoveringDockItem>({
  themeMode: false,
  settings: false,
})
const currentDockItems = ref<DockItem[]>([])
const dockIndicatorRef = ref<InstanceType<typeof LiquidSegmentIndicator> | null>(null)

const tooltipPlacement = computed(() => dockPosition.value === 'right' ? 'left' : 'top')

const dockCollapseIcon = computed(() => dockPosition.value === 'bottom'
  ? 'i-tabler:chevrons-left'
  : 'i-tabler:chevrons-up')

/**
 * Whether to show the back to top or refresh button
 */
const showBackToTopOrRefreshButton = computed((): boolean => {
  if (settingsStore.getDockItemIsUseOriginalBiliPage(props.activatedPage)) {
    return false
  }
  // Moments carries its own back-to-latest and refresh buttons under hot search.
  if (props.activatedPage === AppPage.Moments)
    return false

  // 在首页显示返回顶部/刷新按钮（包括搜索页）
  return isHomePage()
})

const canRefreshCurrentPage = computed((): boolean => {
  if (props.activatedPage === AppPage.Search || props.activatedPage === AppPage.SearchResults)
    return false

  return props.activatedPage !== AppPage.Home || homeActivatedPage.value === HomeSubPage.ForYou || canRefreshHomeSubPage.value
})

const showBackToTopOrRefreshActions = computed((): boolean => {
  return showBackToTopOrRefreshButton.value && (canRefreshCurrentPage.value || (settings.value.showDockBackToTop && !reachTop.value))
})
const combinedActionIsRefresh = computed(() => canRefreshCurrentPage.value && (reachTop.value || !settings.value.showDockBackToTop))
watch(() => settings.value.showDockBackToTop, async (visible) => {
  const root = document.getElementById('bewly')?.shadowRoot
  if (!visible && root?.activeElement?.hasAttribute('data-dock-back-to-top')) {
    await nextTick()
    dockContentRef.value?.querySelector<HTMLElement>('button:not(:disabled), a[href]')?.focus({ preventScroll: true })
  }
})

/**
 * Whether to show the undo/forward buttons
 * Only show on Home page when current sub-page is ForYou
 */
const shouldShowUndoForwardButtons = computed((): boolean => {
  return props.activatedPage === AppPage.Home && homeActivatedPage.value === HomeSubPage.ForYou
})

const showUndoForwardActions = computed((): boolean => {
  return shouldShowUndoForwardButtons.value && (showUndo.value || showForward.value) && settings.value.enableUndoRefreshButton
})

const showDockActionButtons = computed((): boolean => {
  return showBackToTopOrRefreshActions.value || showUndoForwardActions.value
})

const showInlineDockActionButtons = computed((): boolean => {
  return isDockContentVisible.value && showDockActionButtons.value
})

// use Json stringify to watch the changes of the array item properties
watch(
  [
    () => JSON.stringify(settings.value.dockItemsConfig),
    () => settings.value.pageMode,
    () => settings.value.useSearchPageModeOnHomePage,
  ],
  () => {
    currentDockItems.value = computeDockItem()
  },
  { immediate: true },
)

watch(currentDockItems, () => {
  void dockIndicatorRef.value?.updateIndicator(false)
}, { flush: 'post' })

watch(
  () => settings.value.touchScreenOptimization,
  () => {
    dockContentHover.value = false
    dockInteractionActive.value = false
    clearAutoCollapseTimer()

    if (isLayoutEditing.value) {
      expandDock()
      return
    }

    const shouldCollapse = getDockCollapsedStateForMode(
      settings.value.dockCollapseMode,
      props.settingsOpen,
    )
    if (shouldCollapse && dockReady.value)
      collapseDock()
    else if (!shouldCollapse)
      expandDock()
  },
)

function computeDockItem(): DockItem[] {
  const targetDockItems: DockItem[] = []

  for (const item of settingsStore.ensureDockItemsConfig()) {
    if (!item.visible || (settings.value.useSearchPageModeOnHomePage && item.page === AppPage.Search))
      continue

    const dockItem = settingsStore.getEffectiveDockItemByPage(item.page)
    if (!dockItem)
      continue

    targetDockItems.push(dockItem)
  }
  return targetDockItems
}

function cacheExpandedDockSize() {
  if (isDockCollapsed.value || isDockTransitioning.value)
    return

  if (dockWidth.value && dockHeight.value) {
    expandedDockWidth.value = dockWidth.value
    expandedDockHeight.value = dockHeight.value
  }

  if (dockShellWidth.value && dockShellHeight.value) {
    expandedDockShellWidth.value = dockShellWidth.value
    expandedDockShellHeight.value = dockShellHeight.value
  }
}

function clearDockMorphSchedule() {
  dockMorphGeneration++
  if (dockContentTimer !== undefined) {
    clearTimeout(dockContentTimer)
    dockContentTimer = undefined
  }

  if (dockMorphFrame !== undefined) {
    cancelAnimationFrame(dockMorphFrame)
    dockMorphFrame = undefined
  }

  if (dockMorphCompletionTimer !== undefined) {
    clearTimeout(dockMorphCompletionTimer)
    dockMorphCompletionTimer = undefined
  }
}

function completeDockMorph(direction: 'collapse' | 'expand') {
  if (dockMorphDirection.value !== direction)
    return

  if (dockMorphCompletionTimer !== undefined) {
    clearTimeout(dockMorphCompletionTimer)
    dockMorphCompletionTimer = undefined
  }

  isDockTransitioning.value = false
  dockMorphDirection.value = undefined

  if (direction === 'collapse')
    isDockCollapsedTriggerVisible.value = true
  else
    isDockContentVisible.value = true
}

function scheduleDockMorphCompletion(direction: 'collapse' | 'expand') {
  if (dockMorphCompletionTimer !== undefined)
    clearTimeout(dockMorphCompletionTimer)

  const transitionDuration = preferredReducedMotion.value === 'reduce'
    ? 1
    : DOCK_SHELL_TRANSITION_MS

  dockMorphCompletionTimer = setTimeout(() => {
    dockMorphCompletionTimer = undefined
    completeDockMorph(direction)
  }, transitionDuration + DOCK_SHELL_COMPLETION_BUFFER_MS)
}

async function startDockShellCollapse() {
  cacheExpandedDockSize()
  isDockTransitioning.value = dockReady.value
  dockMorphDirection.value = 'collapse'
  const generation = dockMorphGeneration

  if (!dockReady.value) {
    isDockCollapsed.value = true
    completeDockMorph('collapse')
    return
  }

  await nextTick()
  if (generation !== dockMorphGeneration || dockMorphDirection.value !== 'collapse')
    return
  // Commit the frozen expanded geometry before switching to the collapsed
  // dimensions. Without this read, Chromium can merge both style updates and
  // omit the transition event that unlocks the expand button.
  void dockShellSurfaceRef.value?.offsetHeight
  dockMorphFrame = requestAnimationFrame(() => {
    if (generation !== dockMorphGeneration || dockMorphDirection.value !== 'collapse')
      return
    isDockCollapsed.value = true
    dockMorphFrame = undefined
    scheduleDockMorphCompletion('collapse')
  })
}

function collapseDock() {
  if (props.settingsOpen)
    return
  if (isDockCollapsed.value || dockMorphDirection.value === 'collapse' || dockContentTimer !== undefined)
    return

  cacheExpandedDockSize()
  isDockContentVisible.value = false
  isDockCollapsedTriggerVisible.value = false

  if (dockMorphDirection.value === 'expand' || preferredReducedMotion.value === 'reduce') {
    clearDockMorphSchedule()
    void startDockShellCollapse()
    return
  }

  dockContentTimer = setTimeout(() => {
    dockContentTimer = undefined
    void startDockShellCollapse()
  }, DOCK_CONTENT_TRANSITION_MS)
}

function expandDock() {
  if (dockMorphDirection.value === 'expand')
    return

  if (dockContentTimer !== undefined || (dockMorphDirection.value === 'collapse' && !isDockCollapsed.value)) {
    clearDockMorphSchedule()
    isDockTransitioning.value = false
    dockMorphDirection.value = undefined
    isDockContentVisible.value = true
    return
  }

  if (!isDockCollapsed.value) {
    isDockContentVisible.value = true
    return
  }

  clearDockMorphSchedule()
  isDockContentVisible.value = false
  isDockCollapsedTriggerVisible.value = false
  isDockTransitioning.value = dockReady.value
  dockMorphDirection.value = dockReady.value ? 'expand' : undefined
  isDockCollapsed.value = false

  if (!dockReady.value) {
    isDockContentVisible.value = true
  }
  else {
    scheduleDockMorphCompletion('expand')
  }
}

function handleDockShellTransitionEnd(event: TransitionEvent) {
  if (event.target !== event.currentTarget)
    return

  if (event.propertyName !== 'transform')
    return

  const direction = dockMorphDirection.value
  if (direction)
    completeDockMorph(direction)
}

watch(preferredReducedMotion, (value) => {
  if (value !== 'reduce' || (!isDockTransitioning.value && dockContentTimer === undefined && dockMorphFrame === undefined))
    return
  const direction = dockMorphDirection.value ?? 'collapse'
  clearDockMorphSchedule()
  isDockCollapsed.value = direction === 'collapse'
  dockMorphDirection.value = direction
  completeDockMorph(direction)
})

function handleDockItemClick($event: MouseEvent, dockItem: DockItem) {
  if ($event.button !== 0)
    return
  if ($event.ctrlKey || $event.metaKey) {
    openDockItemInNewTab(dockItem)
    return
  }

  emit('dockItemClick', dockItem)
}

function openDockItemInNewTab(dockItem: DockItem) {
  openLinkToNewTab(getDockPageHref(dockItem.page))
}

function openSettings(event: MouseEvent) {
  emit('settingsVisibilityChange', (event.currentTarget as HTMLElement).getBoundingClientRect())
}

function clearAutoCollapseTimer() {
  if (autoCollapseTimer !== undefined) {
    clearTimeout(autoCollapseTimer)
    autoCollapseTimer = undefined
  }
}

function scheduleAutoCollapse(delay = 900) {
  clearAutoCollapseTimer()
  if (isLayoutEditing.value || !shouldAutoCollapseDock(settings.value.dockCollapseMode) || props.settingsOpen || dockContentHover.value || dockInteractionActive.value)
    return

  autoCollapseTimer = setTimeout(() => {
    autoCollapseTimer = undefined
    if (!isLayoutEditing.value && shouldAutoCollapseDock(settings.value.dockCollapseMode) && !props.settingsOpen && !dockContentHover.value && !dockInteractionActive.value)
      collapseDock()
  }, delay)
}

function handleDockPointerDown(event: PointerEvent) {
  if (event.pointerType === 'mouse')
    return
  dockInteractionActive.value = true
  clearAutoCollapseTimer()
  expandDock()
}

function handleDockPointerUp(event: PointerEvent) {
  if (event.pointerType === 'mouse')
    return
  dockInteractionActive.value = false
  scheduleAutoCollapse(1800)
}

function handleDockFocusIn(event: FocusEvent) {
  // Restoring mouse focus from Settings must not pin Dock open indefinitely.
  dockInteractionActive.value = event.target instanceof HTMLElement && event.target.matches(':focus-visible')
  clearAutoCollapseTimer()
  expandDock()
}

function handleDockFocusOut(event: FocusEvent) {
  if ((event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null))
    return
  dockInteractionActive.value = false
  scheduleAutoCollapse()
}

function handleBackToTopOrRefresh(action: 'backToTop' | 'refresh' | 'auto' = 'auto') {
  if (action === 'backToTop') {
    emit('backToTop')
  }
  else if (action === 'refresh') {
    if (canRefreshCurrentPage.value)
      emit('refresh')
  }
  else {
    if (combinedActionIsRefresh.value) {
      emit('refresh')
    }
    else if (settings.value.showDockBackToTop) {
      emit('backToTop')
    }
  }
}

// 处理撤销刷新
function handleUndoRefresh() {
  emit('undoRefresh')
}

// 添加处理前进的方法
function handleForwardRefresh() {
  emit('forwardRefresh')
}

// 添加统一的前进后退处理方法
function handleHistoryNavigation() {
  if (showUndo.value) {
    handleUndoRefresh()
  }
  else if (showForward.value) {
    handleForwardRefresh()
  }
}

const activeDockItemPage = computed(() => resolveActiveDockItemPage(
  currentDockItems.value,
  props.activatedPage,
  settings.value.useSearchPageModeOnHomePage,
  isHomePage(),
))

function isDockItemActivated(dockItem: DockItem): boolean {
  return activeDockItemPage.value === dockItem.page
}

// A two-finger horizontal swipe or the wheel over the Dock steps to the
// neighbouring page, once per gesture (momentum tails cannot skip pages).
const dockWheelStepper = createWheelStepper({ oncePerGesture: true })
function handleDockWheel(event: WheelEvent) {
  if (event.ctrlKey)
    return
  const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
  const items = currentDockItems.value
  const index = items.findIndex(item => item.page === activeDockItemPage.value)
  if (!delta || index < 0)
    return
  // Also keeps the page and the browser's swipe-back navigation out of it.
  event.preventDefault()
  const next = items[index + dockWheelStepper.step(delta, event.deltaMode, event.timeStamp)]
  if (next && next !== items[index])
    emit('dockItemClick', next)
}

const { width: windowWidth, height: windowHeight } = useWindowSize()

// The initial 0 -> measured scale must render without a transition; later
// responsive scale changes can keep the existing smooth behavior.
watch([dockWidth, dockHeight], ([width, height]) => {
  if (!isDockCollapsed.value && width && height) {
    expandedDockWidth.value = width
    expandedDockHeight.value = height
  }

  if (dockReady.value || dockReadyFrame !== undefined || !width || !height)
    return

  dockReadyFrame = requestAnimationFrame(() => {
    dockReady.value = true
    dockReadyFrame = undefined
  })
}, { flush: 'post' })

watch([dockShellWidth, dockShellHeight], ([width, height]) => {
  if (!isDockCollapsed.value && !isDockTransitioning.value && width && height) {
    expandedDockShellWidth.value = width
    expandedDockShellHeight.value = height
  }
}, { flush: 'post' })

watch(
  [() => settings.value.dockCollapseMode, () => props.settingsOpen, dockReady, isLayoutEditing],
  ([mode, settingsOpen, ready, editing]) => {
    if (editing) {
      clearAutoCollapseTimer()
      dockContentHover.value = false
      dockInteractionActive.value = false
      expandDock()
      return
    }
    clearAutoCollapseTimer()
    const shouldCollapse = getDockCollapsedStateForMode(mode, dockContentHover.value || dockInteractionActive.value || settingsOpen)
    if (shouldCollapse && ready)
      collapseDock()
    else if (!shouldCollapse)
      expandDock()
  },
  { immediate: true },
)

const dockScale = computed((): number => {
  if (!dockHeight.value || !dockWidth.value)
    return 1

  // Get current top bar height from CSS variable
  const getTopBarHeight = (): number => {
    const topBarHeight = getComputedStyle(document.documentElement)
      .getPropertyValue('--bew-top-bar-height')
      .replace('px', '')
    return Number.parseInt(topBarHeight) || 64 // fallback to 64px
  }

  const currentTopBarHeight = getTopBarHeight()

  // Dynamic margins based on screen size and dock position
  let heightMargin: number
  let widthMargin: number

  if (dockPosition.value === 'bottom') {
    // For bottom position, use original logic
    heightMargin = Math.max(100, Math.min(150, windowHeight.value * 0.1))
    widthMargin = Math.max(100, Math.min(150, windowWidth.value * 0.1))
  }
  else {
    // For side positions, adjust margins considering responsive top bar height
    heightMargin = Math.max(50, Math.min(100, windowHeight.value * 0.08)) + currentTopBarHeight
    widthMargin = Math.max(50, Math.min(100, windowWidth.value * 0.08))
  }

  const maxAllowedHeight = windowHeight.value - heightMargin
  const maxAllowedWidth = windowWidth.value - widthMargin

  const buttonSize = DOCK_LAYOUT.actionControlSize
  const buttonGap = DOCK_LAYOUT.controlGap

  // Reserve only available actions, without resizing again when scrolling reveals them.
  const availableActions = Number(canRefreshCurrentPage.value) + Number(settings.value.showDockBackToTop)
  const maxButtonCount = showBackToTopOrRefreshButton.value
    ? Math.min(availableActions, settings.value.backToTopAndRefreshButtonsAreSeparated ? 2 : 1)
    : 0
  const undoCount = settings.value.enableUndoRefreshButton && shouldShowUndoForwardButtons.value ? 1 : 0
  const actionSpace = (maxButtonCount + undoCount) * (buttonSize + buttonGap)
  const additionalWidth = dockPosition.value === 'bottom' ? actionSpace : 0
  const additionalHeight = dockPosition.value === 'bottom' ? 0 : actionSpace

  const effectiveDockHeight = dockHeight.value + additionalHeight
  const effectiveDockWidth = dockWidth.value + additionalWidth

  // Calculate scale factors for both dimensions
  const heightScale = effectiveDockHeight > maxAllowedHeight
    ? maxAllowedHeight / effectiveDockHeight
    : 1

  const widthScale = effectiveDockWidth > maxAllowedWidth
    ? maxAllowedWidth / effectiveDockWidth
    : 1

  // Use the smaller scale to ensure dock fits in both dimensions
  return Math.min(heightScale, widthScale)
})

const dockActionButtonsStyle = computed<CSSProperties>(() => {
  return {
    bottom: dockPosition.value === 'bottom' ? 'unset' : 0,
    right: dockPosition.value === 'bottom' ? 0 : 'unset',
    transform: dockPosition.value === 'bottom' ? 'translate(100%, 0)' : 'translateY(100%)',
    flexDirection: dockPosition.value === 'bottom' ? 'row' : 'column',
  }
})

const dockTransformStyle = computed((): CSSProperties => {
  const position = dockPosition.value
  const scale = dockScale.value
  const preservedSize = getPreservedDockStageSize(
    isDockCollapsed.value || isDockTransitioning.value,
    expandedDockWidth.value,
    expandedDockHeight.value,
  )
  dockContentRef.value?.style.setProperty('--scale', `${scale}`)

  // Adjust origin based on dock position
  const origin = {
    right: 'right center',
    bottom: 'center bottom',
  }[position] || 'center center'

  return {
    transform: `scale(${scale})`,
    transformOrigin: origin,
    ...(preservedSize
      ? {
          width: `${preservedSize.width}px`,
          height: `${preservedSize.height}px`,
        }
      : {}),
  }
})

const dockShellGeometry = computed(() => {
  const measuredSize = dockPosition.value === 'bottom'
    ? expandedDockShellHeight.value
    : expandedDockShellWidth.value
  const controlSize = windowWidth.value >= GRID_BREAKPOINTS.lg
    ? DOCK_LAYOUT.controlSizeLarge
    : DOCK_LAYOUT.controlSize
  const expectedDockShellSize = controlSize + DOCK_LAYOUT.shellPadding
  const collapsedSize = resolveDockCollapsedShellSize(measuredSize, expectedDockShellSize)
  const longSide = collapsedSize * 2
  const shortSide = collapsedSize / 3
  const width = dockPosition.value === 'right' ? shortSide : longSide
  const height = dockPosition.value === 'right' ? longSide : shortSide
  const expandedWidth = expandedDockShellWidth.value || collapsedSize
  const expandedHeight = expandedDockShellHeight.value || collapsedSize
  return { width, height, expandedWidth, expandedHeight, radius: collapsedSize / 2 }
})

const dockShellStyle = computed((): CSSProperties => {
  const { width, height, expandedWidth, expandedHeight, radius } = dockShellGeometry.value
  const collapsedRadius = Math.min(width, height) / 2
  return {
    '--dock-shell-radius': `${radius}px`,
    '--dock-collapsed-width': `${width}px`,
    '--dock-collapsed-height': `${height}px`,
    '--dock-wake-width': `${expandedDockWidth.value || expandedWidth}px`,
    '--dock-wake-height': `${expandedDockHeight.value || expandedHeight}px`,
    '--dock-collapsed-mark-length': `${Math.abs(width - height)}px`,
    '--dock-collapse-x': `${dockPosition.value === 'right' ? (expandedWidth - width) / 2 : 0}px`,
    '--dock-collapse-y': `${dockPosition.value === 'bottom' ? (expandedHeight - height) / 2 : 0}px`,
    '--dock-collapse-scale-x': width / expandedWidth,
    '--dock-collapse-scale-y': height / expandedHeight,
    // Compensate the shell scale so the final painted ends remain circular.
    '--dock-collapse-radius-x': `${collapsedRadius * expandedWidth / width}px`,
    '--dock-collapse-radius-y': `${collapsedRadius * expandedHeight / height}px`,
  }
})

watchEffect(() => {
  const { expandedHeight, height } = dockShellGeometry.value
  emit('bottomShiftChange', dockPosition.value === 'bottom' && isDockCollapsed.value
    ? (expandedHeight - height) * dockScale.value
    : 0)
})

onUnmounted(() => {
  emit('bottomShiftChange', 0)
  clearAutoCollapseTimer()
  if (dockReadyFrame !== undefined)
    cancelAnimationFrame(dockReadyFrame)
  clearDockMorphSchedule()
})
</script>

<template>
  <aside
    class="dock-wrap"
    :class="`dock-wrap--${dockPosition}`"
    pos="fixed" flex="~ col justify-center items-center"
    pointer-events-none
  >
    <!-- Dock Content -->
    <div
      ref="dockContentRef"
      class="dock-content"
      data-layout-editable-id="dock"
      :class="{
        right: dockPosition === 'right',
        bottom: dockPosition === 'bottom',
        hover: dockContentHover,
        ready: dockReady,
        collapsed: isDockCollapsed,
      }"
      :style="dockTransformStyle"
      @pointerdown="handleDockPointerDown"
      @pointerup="handleDockPointerUp"
      @pointercancel="handleDockPointerUp"
      @focusin="handleDockFocusIn"
      @focusout="handleDockFocusOut"
    >
      <div
        ref="dockShellRef"
        class="dock-content-inner"
        :class="{
          collapsed: isDockCollapsed,
          morphing: isDockTransitioning,
        }"
        :style="dockShellStyle"
      >
        <div
          ref="dockShellSurfaceRef"
          class="dock-shell-surface"
          aria-hidden="true"
          @transitionend="handleDockShellTransitionEnd"
        />

        <div
          class="dock-expanded-content"
          :class="{ visible: isDockContentVisible }"
          :aria-hidden="!isDockContentVisible"
          :inert="!isDockContentVisible"
          @wheel="handleDockWheel"
        >
          <div class="dock-page-navigation bew-segment-control">
            <LiquidSegmentIndicator ref="dockIndicatorRef" class="dock-page-navigation__indicator bew-shape-circle" :active-key="activeDockItemPage" />

            <template v-for="dockItem in currentDockItems" :key="dockItem.page">
              <Tooltip :content="dockBadges[dockItem.page]?.label || $t(dockItem.i18nKey)" :placement="tooltipPlacement">
                <button
                  v-layout-editable="getDockItemLayoutEditableId(dockItem.page)"
                  type="button"
                  class="dock-page-navigation__item bew-segment-control__item bew-segment-control__item--icon bew-shape-circle"
                  :class="{ inactive: hoveringDockItem.themeMode && isDark }"
                  data-segment-item
                  :data-active="isDockItemActivated(dockItem) ? 'true' : undefined"
                  :aria-label="dockBadges[dockItem.page]?.label || $t(dockItem.i18nKey)"
                  :aria-current="isDockItemActivated(dockItem) ? 'page' : undefined"
                  @click="handleDockItemClick($event, dockItem)"
                  @click.middle="openDockItemInNewTab(dockItem)"
                >
                  <span
                    class="dock-page-navigation__icon"
                    :class="isDockItemActivated(dockItem) ? dockItem.iconActivated : dockItem.icon"
                    aria-hidden="true"
                  />
                  <CountBadge v-if="dockBadges[dockItem.page]" :count="dockBadges[dockItem.page]!.count" class="dock-count-badge" aria-hidden="true" />
                </button>
              </Tooltip>
            </template>
          </div>

          <!-- dividing line -->
          <div class="divider" />

          <PageModeSwitcherButton
            v-if="settings.showBewlyOrBiliPageSwitcher"
            :activated-page="activatedPage"
            :placement="tooltipPlacement"
            variant="dock"
          />

          <Tooltip
            v-if="!settings.disableLightDarkModeSwitcherOnDock"
            :content="isDark ? $t('dock.dark_mode') : $t('dock.light_mode')" :placement="tooltipPlacement"
            class="group"
            pointer-events-none
          >
            <!-- moon: the signature theme-toggle moonlight is the one kept glow -->
            <div
              v-if="isDark"
              class="bew-shape-circle"
              pos="absolute top-0 left-0 group-hover:top-2px group-hover:left--4px"
              w-full h-full bg-white
              z--2 pointer-events-none
              shadow="group-hover:[-8px_4px_160px_20px_hsla(226deg,85%,77%,1),-8px_4px_100px_12px_hsla(226deg,85%,77%,0.8),-8px_4px_60px_10px_hsla(226deg,85%,77%,0.6),-8px_4px_20px_4px_hsla(226deg,85%,77%,0.4),-4px_2px_8px_0_hsla(226deg,85%,77%,0.8)]"
              opacity-0 group-hover:opacity-100
              duration-300
            />

            <button
              v-layout-editable="'dock-theme-toggle'"
              type="button"
              class="dock-item dock-item--icon-only bew-shape-circle"
              :aria-label="isDark ? $t('dock.dark_mode') : $t('dock.light_mode')"
              pointer-events-auto
              @click="toggleDark"
              @mouseenter="hoveringDockItem.themeMode = true"
              @mouseleave="hoveringDockItem.themeMode = false"
            >
              <Transition name="fade">
                <div v-show="hoveringDockItem.themeMode" absolute>
                  <Icon v-if="isDark" icon="tabler:moon" />
                  <Icon v-else icon="tabler:sun" />
                </div>
              </Transition>
              <Transition name="fade">
                <div v-show="!hoveringDockItem.themeMode" absolute>
                  <Icon v-if="isDark" icon="tabler:moon" />
                  <Icon v-else icon="tabler:sun" />
                </div>
              </Transition>
            </button>
          </Tooltip>

          <Tooltip :content="$t('dock.settings')" :placement="tooltipPlacement">
            <button
              type="button"
              class="dock-item dock-item--icon-only group bew-shape-circle"
              :class="{
                inactive: hoveringDockItem.themeMode && isDark,
              }"
              :aria-label="$t('dock.settings')"
              @click="openSettings"
            >
              <span class="dock-item__icon i-tabler:settings" group-hover:rotate-180 transition="transform duration-400 ease-out" aria-hidden="true" />
            </button>
          </Tooltip>

          <Tooltip
            v-if="shouldShowDockCollapseButton(settings.dockCollapseMode)"
            :content="$t('dock.collapse_dock')"
            :placement="tooltipPlacement"
          >
            <button
              v-layout-editable="'dock-collapse-toggle'"
              type="button"
              class="dock-item bew-shape-circle"
              :aria-label="$t('dock.collapse_dock')"
              @click="collapseDock"
            >
              <span class="dock-item__icon" :class="dockCollapseIcon" aria-hidden="true" />
            </button>
          </Tooltip>
        </div>

        <IconButton
          class="dock-collapsed-trigger"
          shape="pill"
          :class="{ visible: isDockCollapsedTriggerVisible }"
          :label="$t('dock.expand_dock')"
          :aria-hidden="!isDockCollapsedTriggerVisible"
          :disabled="!isDockCollapsedTriggerVisible"
          :tabindex="isDockCollapsedTriggerVisible ? 0 : -1"
          @click="expandDock"
          @pointerenter="shouldAutoCollapseDock(settings.dockCollapseMode) && expandDock()"
        >
          <span class="dock-collapsed-mark" aria-hidden="true">
            <span class="dock-collapsed-mark__line" />
            <span v-for="dot in 3" :key="dot" class="dock-collapsed-mark__dot" />
          </span>
        </IconButton>
      </div>

      <!-- Back to top & refresh buttons -->
      <div
        v-if="showInlineDockActionButtons"
        :style="dockActionButtonsStyle"
        pos="absolute"
        flex="~ gap-2"
      >
        <template
          v-if="settings.backToTopAndRefreshButtonsAreSeparated"
        >
          <template v-for="key in 2" :key="key">
            <Transition name="fade">
              <IconButton
                v-if="(key === 1 && canRefreshCurrentPage) || (key === 2 && settings.showDockBackToTop && !reachTop)"
                v-layout-editable="key === 1 ? 'dock-refresh-action' : 'dock-back-to-top-action'"
                :data-dock-back-to-top="key === 2 ? '' : undefined"
                class="back-to-top-or-refresh-btn"
                :label="key === 1 ? $t('common.operation.refresh') : $t('common.operation.back_to_top')"
                :class="{
                  inactive: hoveringDockItem.themeMode && isDark,
                }"
                @click="handleBackToTopOrRefresh(key === 1 ? 'refresh' : 'backToTop')"
              >
                <span
                  v-if="key === 1"
                  class="dock-action-icon i-tabler:rotate-clockwise"
                  shrink-0 absolute
                  aria-hidden="true"
                />
                <span
                  v-else
                  class="dock-action-icon i-tabler:arrow-bar-to-up"
                  shrink-0 absolute
                  aria-hidden="true"
                />
              </IconButton>
            </Transition>
          </template>
        </template>
        <template v-else>
          <IconButton
            v-if="showBackToTopOrRefreshActions"
            v-layout-editable="'dock-refresh-back-to-top-action'"
            class="back-to-top-or-refresh-btn"
            :label="combinedActionIsRefresh ? $t('common.operation.refresh') : $t('common.operation.back_to_top')"
            :class="{
              inactive: hoveringDockItem.themeMode && isDark,
            }"
            @click="handleBackToTopOrRefresh('auto')"
          >
            <Transition name="fade">
              <span
                v-if="combinedActionIsRefresh"
                class="dock-action-icon i-tabler:rotate-clockwise"
                shrink-0 absolute
                aria-hidden="true"
              />
              <span
                v-else
                class="dock-action-icon i-tabler:arrow-bar-to-up"
                shrink-0 absolute
                aria-hidden="true"
              />
            </Transition>
          </IconButton>
        </template>
        <!-- 将原来的两个按钮替换为一个 -->
        <Transition name="fade">
          <IconButton
            v-if="showUndoForwardActions"
            v-layout-editable="showUndo ? 'dock-undo-refresh-action' : 'dock-forward-refresh-action'"
            class="back-to-top-or-refresh-btn"
            :label="showUndo ? $t('common.operation.undo_refresh') : $t('common.operation.forward_refresh')"
            :class="{
              inactive: hoveringDockItem.themeMode && isDark,
            }"
            @click="handleHistoryNavigation"
          >
            <span
              v-if="showUndo"
              class="dock-action-icon i-tabler:arrow-back-up"
              shrink-0 absolute
              aria-hidden="true"
            />
            <span
              v-else-if="showForward"
              class="dock-action-icon i-tabler:arrow-forward-up"
              shrink-0 absolute
              aria-hidden="true"
            />
          </IconButton>
        </Transition>
      </div>
    </div>
  </aside>
</template>

<style lang="scss" scoped>
@use "../../styles/breakpoints";

.dock-wrap {
  z-index: var(--bew-z-base-overlay);

  // Keep the absolute flex child's static center, without a viewport-sized
  // hit-test surface. The child's scale origin and wake channel stay unchanged.
  &--bottom {
    inset: auto 0 0;
    height: 0;
  }

  &--right {
    inset: 0 0 0 auto;
    width: 0;
  }
}

.dock-content {
  // The shell and its floating action buttons paint the shared glass.
  --dock-surface-background: var(--bew-glass-tint);
  --dock-surface-background-hover: var(--bew-glass-tint-hover);
  --uno: "absolute flex justify-center items-center scale-$scale";

  transition-duration: 0ms;
  pointer-events: none;

  &.ready {
    transition-duration: var(--bew-duration-moderate, 300ms);
  }

  // Dock reveal can move an item underneath a stationary pointer. Delay only
  // Dock tooltips so that movement does not cause a tooltip to flash immediately.
  :deep(.b-tooltip) {
    transition-delay: 0ms;
  }

  :deep(.b-tooltip-wrapper:hover .b-tooltip) {
    transition-delay: var(--bew-duration-moderate, 300ms);
  }

  &.right {
    --uno: "right-2 after:left--4px";
  }

  &.bottom {
    --uno: "top-unset bottom-0";
  }

  &.collapsed {
    pointer-events: none;
  }

  .divider {
    --uno: "my-1 mx-3 h-3px bg-$bew-separator-color rounded-$bew-pill-radius";
    corner-shape: var(--bew-corner-shape-capsule);
  }

  &.bottom .divider {
    --uno: "w-3px h-auto my-3 mx-1";
  }

  .dock-content-inner {
    --dock-shell-control-size: var(--bew-dock-control-size);
    // User-chosen optical rim between 4px and 8px; deliberately off the 4px grid.
    --dock-shell-rim: 6px;
    --dock-shell-size: calc(var(--dock-shell-control-size) + var(--dock-shell-rim) * 2);
    --dock-shell-radius: calc(var(--dock-shell-control-size) / 2 + var(--dock-shell-rim));
    --uno: "m-2 relative flex shrink-0";
    padding: var(--dock-shell-rim);
    box-sizing: border-box;

    &.collapsed:hover .dock-shell-surface {
      background: var(--bew-fill-2);
      --dock-surface-shadow: 0 0 0 2px var(--bew-fill-2), var(--bew-glass-shadow);
    }
  }

  .dock-shell-surface {
    --dock-surface-shadow: var(--bew-glass-shadow);
    position: absolute;
    top: 50%;
    left: 50%;
    width: 100%;
    height: 100%;
    z-index: 0;
    background: var(--dock-surface-background);
    border: var(--bew-glass-edge-width) solid var(--bew-glass-edge-color);
    border-radius: var(--dock-shell-radius);
    corner-shape: var(--bew-corner-shape-capsule);
    backdrop-filter: var(--bew-filter-glass-1);
    box-sizing: border-box;
    box-shadow: var(--dock-surface-shadow);
    pointer-events: auto;
    transform: translate(-50%, -50%);
    transition:
      transform var(--bew-duration-moderate) var(--bew-ease-standard),
      border-radius var(--bew-duration-moderate) var(--bew-ease-standard),
      background var(--bew-duration-normal) var(--bew-ease-standard),
      box-shadow var(--bew-duration-normal) var(--bew-ease-standard);
  }

  .dock-content-inner.collapsed .dock-shell-surface {
    transform: translate(-50%, -50%) translate(var(--dock-collapse-x), var(--dock-collapse-y))
      scale(var(--dock-collapse-scale-x), var(--dock-collapse-scale-y));
    border-radius: var(--dock-collapse-radius-x) / var(--dock-collapse-radius-y);
  }

  .dock-expanded-content {
    position: relative;
    z-index: 2;
    display: flex;
    flex: 0 0 auto;
    flex-direction: column;
    gap: var(--bew-space-2);
    min-width: max-content;
    visibility: hidden;
    opacity: 0;
    pointer-events: none;
    transform: translateY(var(--bew-space-2));
    transition:
      opacity var(--bew-duration-fast) var(--bew-ease-standard),
      transform var(--bew-duration-fast) var(--bew-ease-standard),
      visibility 0s linear var(--bew-duration-fast);

    &.visible {
      visibility: visible;
      opacity: 1;
      pointer-events: auto;
      transform: translateY(0);
      transition-delay: 0s;
    }
  }

  .dock-collapsed-trigger {
    position: absolute;
    display: flex;
    align-items: center;
    justify-content: center;
    top: 50%;
    left: 50%;
    z-index: 3;
    width: var(--dock-collapsed-width);
    height: var(--dock-collapsed-height);
    min-height: calc(var(--bew-space-6) / var(--scale, 1));
    border-radius: var(--bew-pill-radius);
    corner-shape: var(--bew-corner-shape-capsule);
    background: transparent;
    color: var(--bew-text-1);
    visibility: hidden;
    opacity: 0;
    pointer-events: none;
    transform: translate(-50%, -50%) translate(var(--dock-collapse-x), var(--dock-collapse-y)) scale(0.86);
    transition:
      opacity var(--bew-duration-fast) var(--bew-ease-standard),
      transform var(--bew-duration-fast) var(--bew-ease-standard),
      visibility 0s linear var(--bew-duration-fast);

    &.visible {
      visibility: visible;
      opacity: 1;
      pointer-events: auto;
      transform: translate(-50%, -50%) translate(var(--dock-collapse-x), var(--dock-collapse-y)) scale(1);
      transition-delay: 0s;
    }

    &.visible:active:not(:disabled) {
      transform: translate(-50%, -50%) translate(var(--dock-collapse-x), var(--dock-collapse-y))
        scale(var(--bew-control-press-scale));
    }
  }

  &.bottom .dock-collapsed-trigger::before {
    content: "";
    position: absolute;
    top: 0;
    left: 50%;
    width: var(--dock-wake-width);
    height: 100%;
    transform: translateX(-50%);
  }

  &.right .dock-collapsed-trigger {
    min-width: calc(var(--bew-space-6) / var(--scale, 1));

    &::before {
      content: "";
      position: absolute;
      top: 50%;
      right: 0;
      width: 100%;
      height: var(--dock-wake-height);
      transform: translateY(-50%);
    }
  }

  .back-to-top-or-refresh-btn {
    pointer-events: auto;
  }

  .dock-collapsed-mark {
    position: relative;
    z-index: 1;
    display: flex;
    flex: none;
    align-items: center;
    gap: var(--bew-space-2);
    width: var(--dock-collapsed-mark-length);
    height: var(--bew-space-1);
    pointer-events: none;
  }

  &.right .dock-collapsed-mark {
    transform: rotate(90deg);
  }

  .dock-collapsed-mark__line,
  .dock-collapsed-mark__dot {
    height: 100%;
    background: currentColor;
    border-radius: var(--bew-pill-radius);
    corner-shape: var(--bew-corner-shape-capsule);
  }

  .dock-collapsed-mark__line {
    flex: 1;
  }
  .dock-collapsed-mark__dot {
    width: var(--bew-space-1);
    flex: none;
  }

  &.bottom .dock-expanded-content {
    flex-direction: row;
    transform: translateX(var(--bew-space-2));

    &.visible {
      transform: translateX(0);
    }
  }

  // Selection is a neutral translucent plate under a filled black/white icon.
  .dock-page-navigation {
    --bew-liquid-indicator-bg: var(--bew-dock-navigation-active-bg);
    // The plate keeps the default hairline edge (user-specified), not the glass rim.

    flex-direction: column;
    width: auto;
    height: auto;
    padding: 0;
    gap: var(--bew-space-2);
    overflow: visible;
  }

  &.bottom .dock-page-navigation {
    flex-direction: row;
  }

  .dock-page-navigation__item {
    position: relative;
    overflow: visible;
    width: var(--bew-dock-control-size);
    height: var(--bew-dock-control-size);
    color: var(--bew-text-1);
    transition:
      color var(--bew-duration-normal) var(--bew-ease-standard),
      transform var(--bew-duration-moderate) var(--bew-ease-emphasized);

    &:hover:not([data-active="true"]):not(:disabled) {
      transform: scale(1.1);
    }

    &[data-active="true"] {
      color: var(--bew-dock-navigation-active-color);
    }

    &:hover:not([data-active="true"]):not(:disabled),
    &:focus-visible:not([data-active="true"]):not(:disabled) {
      background: transparent;
      box-shadow: none;
    }

    &:focus-visible:not([data-active="true"]):not(:disabled) {
      outline: var(--bew-focus-ring, 1px solid CanvasText);
      outline-offset: var(--bew-space-0-5);
    }

    &:active:not(:disabled) {
      transform: scale(0.9);
    }

    &.inactive {
      opacity: 0.8;
      box-shadow: none !important;
    }
  }

  .dock-page-navigation__indicator {
    corner-shape: var(--bew-corner-shape-capsule);
  }

  .dock-count-badge {
    // Optical overlap clears the icon while staying within the shell's padding.
    position: absolute;
    top: calc(-1 * var(--bew-space-0-5));
    right: calc(-1 * var(--bew-space-1));
    z-index: 2;
    box-shadow: 0 0 0 1px var(--bew-content-solid);
  }

  // Every Dock glyph except the protected theme toggle shares the idle nav icon.
  .dock-page-navigation__icon,
  .dock-item__icon {
    display: block;
    width: var(--bew-icon-size-md);
    height: var(--bew-icon-size-md);
    font-size: var(--bew-icon-size-md);
  }

  .back-to-top-or-refresh-btn {
    --dock-surface-shadow: var(--bew-glass-shadow);
    --uno: "transform active:important-scale-90 hover:scale-110";
    --uno: "lg:w-45px w-35px lg:h-45px h-35px";
    --uno: "grid place-items-center";

    background: var(--dock-surface-background);
    border: var(--bew-glass-edge-width) solid var(--bew-glass-edge-color);
    backdrop-filter: var(--bew-filter-glass-1);
    box-sizing: border-box;
    transition:
      transform 300ms var(--bew-ease-emphasized, cubic-bezier(0.34, 1.3, 0.64, 1)),
      background 300ms ease,
      color 300ms ease,
      box-shadow 300ms ease,
      opacity 300ms ease;
    box-shadow: var(--dock-surface-shadow);

    &:hover {
      background: var(--dock-surface-background-hover);
    }

    &.inactive {
      --dock-surface-shadow: none;
      --uno: "opacity-80 !shadow-none";
    }
  }

  &.bottom .back-to-top-or-refresh-btn {
    --uno: "bottom-unset lg:right--45px right--35px";
  }
}

.dock-item {
  --uno: "relative transform active:important-scale-90 hover:scale-110";
  width: var(--bew-dock-control-size);
  height: var(--bew-dock-control-size);
  line-height: var(--bew-dock-control-size);
  --uno: "p-0 flex items-center justify-center";
  --uno: "aspect-square relative";
  --uno: "leading-0";
  --uno: "rounded-$bew-pill-radius antialiased";
  --uno: "bg-$bew-fill-alt hover:bg-$bew-fill-2 cursor-pointer";
  --uno: "dark:bg-$bew-fill-1 dark-hover:bg-$bew-fill-4";
  corner-shape: var(--bew-corner-shape-capsule);

  box-shadow: var(--bew-shadow-1);
  transition:
    transform 300ms var(--bew-ease-emphasized, cubic-bezier(0.34, 1.3, 0.64, 1)),
    background 300ms ease,
    color 300ms ease,
    box-shadow 300ms ease,
    opacity 300ms ease;

  &:hover {
    box-shadow:
      0 0 0 2px var(--bew-fill-2),
      var(--bew-shadow-2);
  }

  &.dock-item--icon-only {
    appearance: none;
    border: 0;
    background: transparent;
    box-shadow: none;

    &:hover {
      background: transparent;
      box-shadow: none;
    }
  }

  &.inactive {
    --uno: "opacity-80 !shadow-none";
  }

  svg {
    width: var(--bew-dock-control-icon-size);
    height: var(--bew-dock-control-icon-size);
    display: block;
    vertical-align: middle;
  }
}

.back-to-top-or-refresh-btn {
  aspect-ratio: 1;
  border-radius: 50%;
  corner-shape: var(--bew-corner-shape-round);

  // Same glyph size as the Dock controls beside them.
  :deep(.dock-action-icon) {
    width: var(--bew-icon-size-md);
    height: var(--bew-icon-size-md);
  }
}

@media (min-width: breakpoints.$grid-lg) {
  .dock-content .dock-page-navigation__item {
    width: var(--bew-dock-control-size-lg);
    height: var(--bew-dock-control-size-lg);
  }

  .dock-item {
    width: var(--bew-dock-control-size-lg);
    height: var(--bew-dock-control-size-lg);
    line-height: var(--bew-dock-control-size-lg);

    svg {
      width: var(--bew-dock-control-icon-size-lg);
      height: var(--bew-dock-control-icon-size-lg);
    }
  }

  .dock-content .dock-content-inner {
    --dock-shell-control-size: var(--bew-dock-control-size-lg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .dock-content .dock-shell-surface,
  .dock-content .dock-expanded-content,
  .dock-content .dock-collapsed-trigger {
    transition-duration: 1ms;
  }
}
</style>
