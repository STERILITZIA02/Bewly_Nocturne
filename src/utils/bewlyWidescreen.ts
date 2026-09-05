import { watch } from 'vue'

import type { BewlyWidescreenManualToggleDetail } from '~/constants/globalEvents'
import { BEWLY_WIDESCREEN_CONTROLS_HIDDEN_CLASS, BEWLY_WIDESCREEN_MANUAL_TOGGLE } from '~/constants/globalEvents'
import { settings } from '~/logic'
import type { VideoInfo } from '~/models/video/videoInfo'
import { clearActionGeometry, setupActionGeometryObservers, syncActionAnimationTheme } from '~/utils/bewlyWidescreen/actionEffects'
import { BODY_CLASS, DANMAKU_SKELETON_CLASS, DANMAKU_SOURCE_CLASS, DANMAKU_SOURCE_HOST_CLASS, EMPTY_CLASS, NATIVE_LIGHT_OFF_CONTROL_SELECTORS, NATIVE_PLAYER_CLASS, PAGE_READY_FALLBACK_DELAY, READY_POLL_FAST_DURATION, READY_POLL_INTERVAL, READY_POLL_SLOW_INTERVAL, READY_STABILITY_DELAY, selectors, TRANSFER_SETTLE_DELAY } from '~/utils/bewlyWidescreen/constants'
import { clearDanmakuActivation, syncDanmakuInputSource } from '~/utils/bewlyWidescreen/danmaku'
import { syncDescription } from '~/utils/bewlyWidescreen/description'
import { clearAnchoredPlayerElement, clearAspectObservers, clearAuxiliaryControlGeometry, clearPlayerResizeSync, ensureAnchoredPlayer, schedulePlayerResizeSync, setupAspectObservers, syncAnchoredPlayerGeometry, updateAspectRatio, updateSidebarLayoutState } from '~/utils/bewlyWidescreen/geometry'
import { setupSidebarInteractionTracking } from '~/utils/bewlyWidescreen/interactions'
import { t } from '~/utils/bewlyWidescreen/labels'
import { createWidescreenLoading } from '~/utils/bewlyWidescreen/loading'
import { setupActiveWidescreenControl, setupSidebarToggleAutoHide, syncNativePlayerControlVisibility } from '~/utils/bewlyWidescreen/nativeControls'
import { classifyWidescreenMutation, disableNativeLightOffMode, findCommentRoot, findMovable, isReadyForLayout, isWidescreenTransferContentReady, leaveMutuallyExclusivePlayerModes, removeMovedNode, restoreCommentPrewarm, restoreMovedNodes, startCommentPrewarm } from '~/utils/bewlyWidescreen/nativeDom'
import { clearEpisodeSectionMarker, setupPlaylistToggle, syncPlaylistToggleButton } from '~/utils/bewlyWidescreen/playlist'
import { session } from '~/utils/bewlyWidescreen/session'
import { clearSidebarEdgeRevealSuppression, createRoot, setActiveTab, setSidebarLayout, syncSidebarToggleButton } from '~/utils/bewlyWidescreen/shell'
import { clearSidebarHydration, clearSidebarRefreshTimer, scheduleSidebarRefresh, startSidebarHydration, suspendSidebarForVideoNavigation, syncSidebarReadiness } from '~/utils/bewlyWidescreen/sidebar'
import { injectLayoutStyle } from '~/utils/bewlyWidescreen/styles/layout'
import type { BewlyWidescreenState, ExitBewlyWidescreenOptions, MovedNode } from '~/utils/bewlyWidescreen/types'
import { loadFallbackVideoInfo, renderFallbackVideoInfo, syncSidebarTitle } from '~/utils/bewlyWidescreen/videoInfo'
import { canCommitWidescreenLayout, resolveWidescreenEngagedState, shouldScheduleWidescreenRefresh } from '~/utils/bewlyWidescreenPolicy'
import { ensureInterfaceLanguage } from '~/utils/interfaceLanguage'
import { initVerticalVideoZoom } from '~/utils/verticalVideoZoom'

export type { ExitBewlyWidescreenOptions } from './bewlyWidescreen/types'

let readyObserver: MutationObserver | undefined

let readyFrame: number | undefined

let readyMetadataHandler: ((event: Event) => void) | undefined

let readyPollTimer: ReturnType<typeof setTimeout> | undefined

let pageReadyFallbackTimer: ReturnType<typeof setTimeout> | undefined

let pageReadyHandler: (() => void) | undefined

let pageReadyForLayout = false

let playerReadyForLayout = false

let contentReadyForLayout = false

let pageReadySince: number | undefined

let readinessStableSince: number | undefined

let waitingForLoad = false

let pendingSidebarPosition: 'left' | 'right' = 'right'

let stopLanguageWatch: (() => void) | undefined

const loading = createWidescreenLoading({
  exit: () => exitBewlyWidescreen({ userInitiated: true }),
  onPreparationTimeout: stopWidescreenLanguageWatch,
})

function syncLocalizedWidescreenText(currentState = session.current) {
  loading.syncLabels()

  if (!currentState || session.current !== currentState)
    return

  const closeButton = currentState.sidebarTop.querySelector<HTMLButtonElement>('.bewly-widescreen-close')
  if (closeButton) {
    const closeLabel = t('widescreen.close_sidebar')
    closeButton.textContent = closeLabel
    closeButton.setAttribute('aria-label', closeLabel)
  }
  const resizeLabel = t('widescreen.resize_sidebar')
  currentState.sidebarResizer.setAttribute('aria-label', resizeLabel)
  currentState.sidebarResizer.title = resizeLabel
  currentState.tabButtons.comment.textContent = t('widescreen.comments')
  currentState.tabButtons.danmaku.textContent = t('widescreen.danmaku')
  currentState.tabButtons.playlist.textContent = currentState.panels.playlist.querySelector(selectors.playlist.join(','))
    ? t('widescreen.playlist')
    : t('widescreen.recommendations')
  syncSidebarToggleButton(currentState)
  syncDescription(currentState)
  syncPlaylistToggleButton(currentState)
  syncDanmakuInputSource(currentState, true)
  renderFallbackVideoInfo(currentState)

  const emptyLabels: Array<[HTMLElement, string]> = [
    [currentState.panels.comment, 'widescreen.comments_loading'],
    [currentState.panels.playlist, 'widescreen.list_loading'],
  ]
  for (const [panel, key] of emptyLabels) {
    const empty = panel.querySelector<HTMLElement>(`.${EMPTY_CLASS}`)
    if (empty && !empty.classList.contains('bewly-widescreen-panel-error'))
      empty.textContent = t(key)
  }
  currentState.panels.danmaku
    .querySelector<HTMLElement>(`.${DANMAKU_SKELETON_CLASS}`)
    ?.setAttribute('aria-label', t('widescreen.danmaku_loading'))
}

function startWidescreenLanguageWatch() {
  if (stopLanguageWatch)
    return
  stopLanguageWatch = watch(
    () => settings.value.language,
    async () => {
      await ensureInterfaceLanguage()
      syncLocalizedWidescreenText()
    },
  )
}

export function prepareBewlyWidescreenLoading(allowPlayingDismiss = false) {
  startWidescreenLanguageWatch()
  loading.prepare(allowPlayingDismiss)
}

function stopWidescreenLanguageWatch() {
  stopLanguageWatch?.()
  stopLanguageWatch = undefined
}

function setupWidescreenSettingsWatchers(currentState: BewlyWidescreenState) {
  const stopPriorityWatch = watch(
    () => settings.value.bewlyWidescreenLayoutPriority,
    priority => setSidebarLayout(priority === 'sidebar-first' ? 'expanded' : 'compact', currentState),
    { flush: 'sync' },
  )
  const stopCenterWatch = watch(
    () => settings.value.bewlyWidescreenCenterVideo,
    () => updateSidebarLayoutState(currentState),
    { flush: 'sync' },
  )
  const stopThemeWatch = watch(
    () => [
      settings.value.themeColor,
      settings.value.darkModeBaseColor,
      settings.value.enableOledDarkMode,
    ] as const,
    () => syncActionAnimationTheme(currentState),
    { flush: 'post' },
  )
  const stopPositionWatch = watch(
    () => settings.value.bewlyWidescreenSidebarPosition,
    (position) => {
      if (session.current !== currentState || currentState.sidebarPosition === position)
        return
      currentState.sidebarPosition = position
      currentState.root.dataset.sidebarPosition = position
      if (position === 'left')
        currentState.stage.append(currentState.sidebarEl, currentState.playerSlot)
      else
        currentState.stage.append(currentState.playerSlot, currentState.sidebarEl)
      syncSidebarToggleButton(currentState)
      updateSidebarLayoutState(currentState)
      schedulePlayerResizeSync(currentState)
    },
    { flush: 'sync' },
  )
  currentState.settingsWatchCleanup = [
    stopPriorityWatch,
    stopCenterWatch,
    stopThemeWatch,
    stopPositionWatch,
  ]
}

function setupDomRefreshObserver(currentState: BewlyWidescreenState) {
  const danmakuInputSelector = selectors.danmakuInput.join(',')
  const lightOffControlSelector = NATIVE_LIGHT_OFF_CONTROL_SELECTORS.join(',')
  const onCommentsReady = (event: Event) => {
    const target = event.target
    if (target instanceof HTMLElement && target.matches('bili-comments')
      && (currentState.panels.comment.contains(target) || findCommentRoot(document, true)?.contains(target))) {
      scheduleSidebarRefresh(currentState)
    }
  }
  // Native completion is dispatched outside its shadow root, including when a
  // slow request finishes after the bounded polling window has ended.
  document.addEventListener('inited', onCommentsReady, true)
  document.addEventListener('bili-comments-inited', onCommentsReady, true)
  currentState.commentReadyCleanup = () => {
    document.removeEventListener('inited', onCommentsReady, true)
    document.removeEventListener('bili-comments-inited', onCommentsReady, true)
  }
  currentState.mutationObserver = new MutationObserver((records) => {
    if (!session.current || session.current !== currentState)
      return
    if (!currentState.root.isConnected) {
      exitBewlyWidescreen()
      return
    }

    const addedLightOffControl = records.some(record => Array.from(record.addedNodes).some((node) => {
      if (!(node instanceof Element))
        return false
      return node.matches(lightOffControlSelector) || !!node.querySelector(lightOffControlSelector)
    }))
    if (addedLightOffControl)
      disableNativeLightOffMode(currentState.playerEl)

    const addedDanmakuInput = records.some(record => Array.from(record.addedNodes).some((node) => {
      if (!(node instanceof Element))
        return false
      return node.matches(danmakuInputSelector) || !!node.querySelector(danmakuInputSelector)
    }))
    const nativeDanmakuChanged = currentState.activeTab === 'danmaku' && records.some((record) => {
      const target = record.target instanceof Element ? record.target : record.target.parentElement
      if (!target || !currentState.panels.danmaku.contains(target))
        return false

      return [...Array.from(record.addedNodes), ...Array.from(record.removedNodes)].some((node) => {
        const element = node instanceof Element ? node : node.parentElement
        return !element || !element.closest(`.${DANMAKU_SKELETON_CLASS}`)
      })
    })
    if (addedDanmakuInput || nativeDanmakuChanged) {
      scheduleSidebarRefresh(currentState)
      return
    }

    const origins = records.map(record => classifyWidescreenMutation(record, currentState))
    if (shouldScheduleWidescreenRefresh(origins))
      scheduleSidebarRefresh(currentState)
  })

  currentState.mutationObserver.observe(document.body, { childList: true, subtree: true })
  disableNativeLightOffMode(currentState.playerEl)
}

function cleanupState(currentState: BewlyWidescreenState) {
  currentState.commentReadyCleanup?.()
  currentState.escapeKeyCleanup?.()
  clearSidebarEdgeRevealSuppression(currentState)
  currentState.sidebarInteractionCleanup?.()
  currentState.sidebarToggleAutoHideCleanup?.()
  currentState.activeControlCleanup?.()
  currentState.activeControlCleanup = undefined
  clearAspectObservers(currentState)
  currentState.mutationObserver?.disconnect()
  currentState.mutationObserver = undefined
  currentState.toolbarMutationObserver?.disconnect()
  currentState.toolbarMutationObserver = undefined
  currentState.toolbarResizeObserver?.disconnect()
  currentState.toolbarResizeObserver = undefined
  currentState.themeObserver?.disconnect()
  currentState.themeObserver = undefined
  currentState.highEnergyProgressObserver?.disconnect()
  currentState.highEnergyProgressObserver = undefined
  currentState.highEnergyProgressElement = undefined
  currentState.settingsWatchCleanup?.forEach(stop => stop())
  currentState.settingsWatchCleanup = undefined
  currentState.descriptionCleanup?.()
  currentState.descriptionCleanup = undefined
  currentState.playlistToggleCleanup?.()
  currentState.playlistToggleCleanup = undefined
  clearDanmakuActivation(currentState)
  currentState.danmakuSemanticsCleanup?.()
  currentState.danmakuSemanticsCleanup = undefined
  currentState.danmakuSettingsCleanup?.()
  currentState.danmakuSettingsCleanup = undefined
  currentState.danmakuGlass?.remove()
  currentState.danmakuGlass = undefined
  currentState.danmakuSemanticsSource?.classList.remove(DANMAKU_SOURCE_CLASS)
  currentState.danmakuSourceHost?.classList.remove(DANMAKU_SOURCE_HOST_CLASS)
  currentState.danmakuSemanticsSource = undefined
  currentState.danmakuSourceHost = undefined
  currentState.panelScrollFrames.forEach(frame => cancelAnimationFrame(frame))
  currentState.panelScrollFrames.clear()
  clearSidebarHydration(currentState)
  clearPlayerResizeSync(currentState)
  clearActionGeometry(currentState)
  clearSidebarRefreshTimer()
  clearAnchoredPlayerElement(currentState.playerEl)
  clearAuxiliaryControlGeometry()
  currentState.colorProbe?.remove()
  currentState.colorProbe = undefined

  // If Bilibili created a replacement while its original comment root was in
  // the sidebar, keep the replacement instead of restoring a duplicate editor.
  const movedCommentRoot = findCommentRoot(currentState.panels.comment)
  const replacementCommentRoot = findCommentRoot(document, true)
  if (movedCommentRoot && replacementCommentRoot)
    removeMovedNode(movedCommentRoot, currentState.movedNodes)

  clearEpisodeSectionMarker(currentState.panels.playlist, currentState.movedNodes)
  restoreMovedNodes(currentState.movedNodes)
  currentState.root.remove()
  currentState.styleEl.remove()
  document.body.classList.remove(BODY_CLASS, BEWLY_WIDESCREEN_CONTROLS_HIDDEN_CLASS)
  window.dispatchEvent(new Event('resize'))
}

function applyNow(sidebarPosition: 'left' | 'right' = 'right') {
  const player = findMovable(selectors.player)
  if (!player)
    return false

  const { root, stage, playerSlot, playerFrame, danmakuDock, sidebarEl, sidebarTop, metadataSlot, upSlot, toolbarSlot, descriptionSlot, tagsSlot, panels, tabButtons, playlistToggleButton, sidebarResizer, sidebarToggleButton } = createRoot(sidebarPosition)
  const styleEl = injectLayoutStyle()
  const movedNodes: MovedNode[] = []

  const nextState: BewlyWidescreenState = {
    exit: exitBewlyWidescreen,
    refreshSidebar: () => scheduleSidebarRefresh(nextState),
    hydrateSidebar: () => startSidebarHydration(nextState),
    root,
    stage,
    playerEl: player,
    playerSlot,
    playerFrame,
    danmakuDock,
    sidebarEl,
    sidebarTop,
    metadataSlot,
    upSlot,
    toolbarSlot,
    descriptionSlot,
    tagsSlot,
    panels,
    tabButtons,
    playlistToggleButton,
    sidebarResizer,
    sidebarToggleButton,
    movedNodes,
    styleEl,
    activeTab: 'comment',
    sidebarLayout: settings.value.bewlyWidescreenLayoutPriority === 'sidebar-first' ? 'expanded' : 'compact',
    sidebarPosition,
    descriptionExpanded: false,
    playlistCollapsed: false,
    hydratedTabs: new Set(),
    initialScrollResetTabs: new Set(),
    panelScrollFrames: new Map(),
    navigationPending: false,
    bottomControlsHovered: false,
    playerPointerInside: false,
  }

  session.current = nextState
  session.entering = false
  syncNativePlayerControlVisibility(nextState)
  document.body.classList.add(BODY_CLASS)
  setupPlaylistToggle(nextState)
  syncSidebarReadiness(nextState, {
    complete: false,
    top: false,
    comment: false,
    danmaku: false,
    playlist: false,
  })

  const handleWidescreenKeydown = (event: KeyboardEvent) => {
    if (event.repeat || event.isComposing || event.keyCode === 229 || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey)
      return
    const ownsPlayerShortcut = event.composedPath().some(node => (
      node instanceof Element
      && !!node.closest(
        'input, textarea, select, [contenteditable="true"], [role="dialog"], [role="menu"], [role="listbox"]',
      )
    ))
    if (ownsPlayerShortcut)
      return
    if (event.key.toLowerCase() === 'f') {
      // 只在 Bewly 播放页生命周期内先恢复原播放器；不接管或阻止 Bilibili 的原生快捷键。
      exitBewlyWidescreen({ userInitiated: true })
    }
  }
  window.addEventListener('keydown', handleWidescreenKeydown, { capture: true })
  nextState.escapeKeyCleanup = () => {
    window.removeEventListener('keydown', handleWidescreenKeydown, { capture: true })
  }

  player.classList.add(NATIVE_PLAYER_CLASS)
  syncAnchoredPlayerGeometry(nextState)
  setActiveTab('comment', false)
  startSidebarHydration(nextState)
  void loadFallbackVideoInfo(nextState)
  setSidebarLayout(nextState.sidebarLayout, nextState)
  setupActionGeometryObservers(nextState)
  setupAspectObservers(nextState)
  setupDomRefreshObserver(nextState)
  setupWidescreenSettingsWatchers(nextState)
  setupActiveWidescreenControl(nextState)
  setupSidebarInteractionTracking(nextState)
  setupSidebarToggleAutoHide(nextState)
  if (settings.value.showVerticalVideoZoomButton)
    initVerticalVideoZoom()
  schedulePlayerResizeSync(nextState)
  loading.remove()

  return true
}

function clearReadyWait({ preserveCommentPrewarm = false }: { preserveCommentPrewarm?: boolean } = {}) {
  readyObserver?.disconnect()
  readyObserver = undefined
  if (readyFrame !== undefined)
    cancelAnimationFrame(readyFrame)
  readyFrame = undefined
  if (readyMetadataHandler) {
    document.removeEventListener('loadedmetadata', readyMetadataHandler, true)
    readyMetadataHandler = undefined
  }
  if (readyPollTimer !== undefined) {
    clearTimeout(readyPollTimer)
    readyPollTimer = undefined
  }
  if (pageReadyFallbackTimer !== undefined) {
    clearTimeout(pageReadyFallbackTimer)
    pageReadyFallbackTimer = undefined
  }
  if (!preserveCommentPrewarm)
    restoreCommentPrewarm()
  clearPageReadyHandler()
  pageReadyForLayout = false
  playerReadyForLayout = false
  contentReadyForLayout = false
  pageReadySince = undefined
  readinessStableSince = undefined
  waitingForLoad = false
}

function clearPageReadyHandler() {
  if (!pageReadyHandler)
    return

  window.removeEventListener('load', pageReadyHandler)
  pageReadyHandler = undefined
}

function hasWidescreenTransferSettleElapsed() {
  return pageReadySince !== undefined
    && Date.now() - pageReadySince >= TRANSFER_SETTLE_DELAY
}

function waitForReadyLayout() {
  clearReadyWait()
  const readinessStartedAt = Date.now()
  pageReadyForLayout = document.readyState === 'complete'
  pageReadySince = pageReadyForLayout ? Date.now() : undefined
  waitingForLoad = !pageReadyForLayout

  const tryCommitLayout = () => {
    if (session.current) {
      clearReadyWait({ preserveCommentPrewarm: true })
      return true
    }
    if (!canCommitWidescreenLayout({
      pageReady: pageReadyForLayout,
      playerReady: playerReadyForLayout,
      contentReady: contentReadyForLayout,
    })) {
      readinessStableSince = undefined
      return false
    }
    const now = Date.now()
    readinessStableSince ??= now
    if (now - readinessStableSince < READY_STABILITY_DELAY)
      return false
    if (!applyNow(pendingSidebarPosition)) {
      playerReadyForLayout = false
      readinessStableSince = undefined
      return false
    }
    clearReadyWait({ preserveCommentPrewarm: true })
    return true
  }

  const scheduleAttempt = () => {
    if (readyFrame !== undefined)
      return
    readyFrame = requestAnimationFrame(() => {
      readyFrame = undefined
      if (session.current) {
        clearReadyWait()
        return
      }
      startCommentPrewarm()
      playerReadyForLayout = isReadyForLayout()
      contentReadyForLayout = isWidescreenTransferContentReady()
        || hasWidescreenTransferSettleElapsed()
      tryCommitLayout()
    })
  }

  readyObserver = new MutationObserver(scheduleAttempt)
  readyObserver.observe(document.body || document.documentElement, { childList: true, subtree: true })
  readyMetadataHandler = scheduleAttempt
  document.addEventListener('loadedmetadata', readyMetadataHandler, true)
  if (!pageReadyForLayout) {
    pageReadyHandler = () => {
      if (pageReadyFallbackTimer !== undefined) {
        clearTimeout(pageReadyFallbackTimer)
        pageReadyFallbackTimer = undefined
      }
      pageReadyForLayout = true
      pageReadySince = Date.now()
      waitingForLoad = false
      clearPageReadyHandler()
      scheduleAttempt()
    }
    window.addEventListener('load', pageReadyHandler, { once: true })
    pageReadyFallbackTimer = setTimeout(() => {
      pageReadyFallbackTimer = undefined
      if (!pageReadyForLayout && document.readyState !== 'loading')
        pageReadyHandler?.()
    }, PAGE_READY_FALLBACK_DELAY)
    if (document.readyState === 'complete')
      pageReadyHandler()
  }
  const pollReadiness = () => {
    readyPollTimer = undefined
    if (!session.entering || session.current)
      return
    scheduleAttempt()
    // Slow CDN metadata is not a terminal failure. Keep the event-driven wait
    // alive until navigation or an explicit exit, but reduce idle polling cost.
    const interval = Date.now() - readinessStartedAt < READY_POLL_FAST_DURATION
      ? READY_POLL_INTERVAL
      : READY_POLL_SLOW_INTERVAL
    readyPollTimer = setTimeout(pollReadiness, interval)
  }
  readyPollTimer = setTimeout(pollReadiness, READY_POLL_INTERVAL)
  scheduleAttempt()
}

export function applyBewlyWidescreen(
  sidebarPosition: 'left' | 'right' = 'right',
  showLoading = true,
) {
  startWidescreenLanguageWatch()
  if (session.current || session.entering || waitingForLoad || readyObserver || readyFrame !== undefined)
    return

  session.entering = true
  leaveMutuallyExclusivePlayerModes()
  pendingSidebarPosition = sidebarPosition
  if (showLoading)
    loading.show()
  waitForReadyLayout()
}

export function prepareBewlyPlaybackPageNavigation() {
  const currentState = session.current
  if (!currentState || !currentState.root.isConnected)
    return false

  suspendSidebarForVideoNavigation(currentState)
  return true
}

export function refreshBewlyPlaybackPageNavigation(videoInfoRequest?: Promise<VideoInfo>) {
  const currentState = session.current
  if (!currentState || !currentState.root.isConnected)
    return false

  if (!currentState.navigationPending)
    suspendSidebarForVideoNavigation(currentState)
  currentState.navigationPending = false
  delete currentState.root.dataset.navigationPending

  ensureAnchoredPlayer(currentState)
  syncSidebarTitle(currentState)
  void loadFallbackVideoInfo(currentState, videoInfoRequest)
  scheduleSidebarRefresh(currentState)
  updateAspectRatio(currentState)
  return true
}

function dispatchManualWidescreenToggle(action: BewlyWidescreenManualToggleDetail['action']) {
  window.dispatchEvent(new CustomEvent<BewlyWidescreenManualToggleDetail>(
    BEWLY_WIDESCREEN_MANUAL_TOGGLE,
    { detail: { action, userInitiated: true } },
  ))
}

export function exitBewlyWidescreen({ userInitiated = false }: ExitBewlyWidescreenOptions = {}) {
  if (userInitiated)
    dispatchManualWidescreenToggle('exit')
  stopWidescreenLanguageWatch()
  clearReadyWait()
  clearPageReadyHandler()
  loading.reset()
  waitingForLoad = false
  session.entering = false

  if (!session.current)
    return

  const currentState = session.current
  session.current = null
  cleanupState(currentState)
}

export function isBewlyWidescreenActive() {
  return !!session.current
}

export function isBewlyWidescreenEngaged() {
  return resolveWidescreenEngagedState({
    active: !!session.current,
    entering: session.entering,
    hasLoadingOverlay: loading.hasOverlay,
    hasReadyRetry: !!readyObserver
      || readyFrame !== undefined
      || !!pageReadyHandler,
    waitingForLoad,
  })
}
