import { watch } from 'vue'

import { useDark } from '~/composables/useDark'
import type { BewlyWidescreenManualToggleDetail } from '~/constants/globalEvents'
import { BEWLY_WIDESCREEN_CONTROLS_HIDDEN_CLASS, BEWLY_WIDESCREEN_MANUAL_TOGGLE } from '~/constants/globalEvents'
import { observePlayerDom } from '~/contentScripts/playerDomLifecycle'
import { settings } from '~/logic'
import type { VideoInfo } from '~/models/video/videoInfo'
import { clearActionGeometry, setupActionGeometryObservers, syncActionAnimationTheme } from '~/utils/bewlyWidescreen/actionEffects'
import { setupPlaybackCommentComposer } from '~/utils/bewlyWidescreen/commentComposer'
import { BODY_CLASS, DANMAKU_SKELETON_CLASS, DANMAKU_SOURCE_CLASS, DANMAKU_SOURCE_HOST_CLASS, EMPTY_CLASS, INITIAL_REVEAL_TIMEOUT, NATIVE_LIGHT_OFF_CONTROL_SELECTORS, NATIVE_PLAYER_CLASS, PAGE_READY_FALLBACK_DELAY, READY_POLL_FAST_DURATION, READY_POLL_INTERVAL, READY_STABILITY_DELAY, selectors, SIDEBAR_RELEVANT_SELECTOR, TRANSFER_SETTLE_DELAY } from '~/utils/bewlyWidescreen/constants'
import { clearDanmakuActivation, syncDanmakuInputSource } from '~/utils/bewlyWidescreen/danmaku'
import { syncDescription } from '~/utils/bewlyWidescreen/description'
import { setupFillToggle, setWidescreenDisplayMode, stopWidescreenZoom, syncFillToggleButton } from '~/utils/bewlyWidescreen/displayMode'
import { clearAnchoredPlayerElement, clearAspectObservers, clearAuxiliaryControlGeometry, clearPlayerResizeSync, ensureAnchoredPlayer, refreshPlayerLayout, schedulePlayerResizeSync, setupAspectObservers, syncAnchoredPlayerGeometry, updatePlayerLayoutState } from '~/utils/bewlyWidescreen/geometry'
import { setupIdleProgress } from '~/utils/bewlyWidescreen/idleProgress'
import { t } from '~/utils/bewlyWidescreen/labels'
import { createWidescreenLoading } from '~/utils/bewlyWidescreen/loading'
import { setupActiveWidescreenControl, syncNativePlayerControlVisibility } from '~/utils/bewlyWidescreen/nativeControls'
import { classifyWidescreenMutation, disableNativeLightOffMode, findCommentRoot, isReadyForLayout, isWidescreenTransferContentReady, leaveMutuallyExclusivePlayerModes, removeMovedNode, restoreCommentPrewarm, restoreMovedNodes, startCommentPrewarm } from '~/utils/bewlyWidescreen/nativeDom'
import { clearEpisodeSectionMarker, setupPlaylistToggle, syncPlaylistToggleButton } from '~/utils/bewlyWidescreen/playlist'
import { clearRailTabs } from '~/utils/bewlyWidescreen/railTabs'
import { session } from '~/utils/bewlyWidescreen/session'
import { createRoot, setActiveTab } from '~/utils/bewlyWidescreen/shell'
import { clearSidebarHydration, clearSidebarRefreshTimer, scheduleSidebarRefresh, startSidebarHydration, suspendSidebarForVideoNavigation, syncSidebarReadiness } from '~/utils/bewlyWidescreen/sidebar'
import { injectLayoutStyle } from '~/utils/bewlyWidescreen/styles/layout'
import type { BewlyWidescreenState, ExitBewlyWidescreenOptions, MovedNode } from '~/utils/bewlyWidescreen/types'
import { clearVideoMetadataObserver, clearViewerCount, loadFallbackVideoInfo, renderFallbackVideoInfo, syncSidebarTitle } from '~/utils/bewlyWidescreen/videoInfo'
import { canCommitWidescreenLayout, resolveWidescreenEngagedState, shouldScheduleWidescreenRefresh } from '~/utils/bewlyWidescreenPolicy'
import { ensureInterfaceLanguage } from '~/utils/interfaceLanguage'
import { getPageBridgeChannelId } from '~/utils/pageBridgeChannel'
import { getPlayerRoot } from '~/utils/playerMedia'
import type { PlayerModeApplication } from '~/utils/playerModeApplication'
import { initVerticalVideoZoom } from '~/utils/verticalVideoZoom'
import { isPgcPlaybackPage, parseVideoMetadataEvent, VIDEO_COMPONENT_CHANGED } from '~/utils/videoMetadataBridge'

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

/** Every transferable native structure is present (not the settle fallback). */
let structureReadyForLayout = false

let pageReadySince: number | undefined

let readinessStableSince: number | undefined

let waitingForLoad = false

let pendingSidebarPosition: 'left' | 'right' = 'right'
let pendingApplication: PlayerModeApplication | undefined

let stopLanguageWatch: (() => void) | undefined

const loading = createWidescreenLoading({
  exit: () => exitBewlyWidescreen({ userInitiated: true }),
  onPreparationTimeout: stopWidescreenLanguageWatch,
})

function syncLocalizedWidescreenText(currentState = session.current) {
  loading.syncLabels()

  if (!currentState || session.current !== currentState)
    return

  currentState.tabButtons.comment.textContent = t('widescreen.comments')
  currentState.tabButtons.danmaku.textContent = t('widescreen.danmaku')
  currentState.tabButtons.playlist.textContent = currentState.panels.playlist.querySelector(selectors.playlist.join(','))
    ? t('widescreen.playlist')
    : t('widescreen.recommendations')
  syncFillToggleButton(currentState)
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
    if (empty && !empty.classList.contains('bewly-widescreen-panel-error')) {
      if (empty.classList.contains('bewly-widescreen-panel-skeleton'))
        empty.setAttribute('aria-label', t(key))
      else
        empty.textContent = t(key)
    }
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
  const { isDark, appearanceStyle } = useDark()
  const stopThemeWatch = watch(
    [isDark, appearanceStyle],
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
      currentState.backdrop.dataset.sidebarPosition = position
      // The pane keeps its size while it changes side; no resize reports that.
      updatePlayerLayoutState(currentState)
      schedulePlayerResizeSync(currentState)
    },
    { flush: 'sync' },
  )
  currentState.settingsWatchCleanup = [
    stopThemeWatch,
    stopPositionWatch,
  ]
}

/** Body-wide discovery is bounded; a mounted sidebar then watches only its own structures. */
const DOM_DISCOVERY_WINDOW_MS = 15_000

function isSidebarFullyReady(currentState: BewlyWidescreenState) {
  const { dataset } = currentState.root
  return dataset.sidebarTopReady === 'true' && dataset.sidebarCommentReady === 'true'
    && dataset.sidebarDanmakuReady === 'true' && dataset.sidebarPlaylistReady === 'true'
}

function setupDomRefreshObserver(currentState: BewlyWidescreenState) {
  const danmakuInputSelector = selectors.danmakuInput.join(',')
  const lightOffControlSelector = NATIVE_LIGHT_OFF_CONTROL_SELECTORS.join(',')
  let discovering = false
  let discoveryTimer: ReturnType<typeof setTimeout> | undefined
  let stopPlayerObservation: (() => void) | undefined
  /** Stable-phase subtree targets; their removal reopens discovery. */
  let stableTargets: Node[] = []
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
  const onNativeComponentChanged = (event: Event) => {
    const message = parseVideoMetadataEvent(event)
    if (message && session.current === currentState && event.target instanceof Node && currentState.root.contains(event.target)
      && message.channelId === getPageBridgeChannelId() && message.href === location.href) {
      // A native rebuild at the same URL may place replacements anywhere.
      enterDiscovery()
      scheduleSidebarRefresh(currentState)
    }
  }
  document.addEventListener(VIDEO_COMPONENT_CHANGED, onNativeComponentChanged, true)
  currentState.sidebarReadyCleanup = () => {
    document.removeEventListener('inited', onCommentsReady, true)
    document.removeEventListener('bili-comments-inited', onCommentsReady, true)
    document.removeEventListener(VIDEO_COMPONENT_CHANGED, onNativeComponentChanged, true)
    clearTimeout(discoveryTimer)
    discoveryTimer = undefined
    stopPlayerObservation?.()
    stopPlayerObservation = undefined
    currentState.restartDomDiscovery = undefined
  }

  const handleRecords = (records: MutationRecord[]) => {
    if (!session.current || session.current !== currentState)
      return
    if (!currentState.root.isConnected) {
      exitBewlyWidescreen()
      return
    }
    // A shallow ancestor or observed origin lost its subtree: rediscover hosts.
    if (!discovering && records.some(record => Array.from(record.removedNodes).some(node =>
      stableTargets.some(target => node === target || node.contains(target))))) {
      enterDiscovery()
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
    }
    else {
      const origins = records.map(record => classifyWidescreenMutation(record, currentState))
      if (shouldScheduleWidescreenRefresh(origins))
        scheduleSidebarRefresh(currentState)
    }
    if (discovering && isSidebarFullyReady(currentState))
      enterStable()
  }
  const observer = new MutationObserver(handleRecords)
  currentState.mutationObserver = observer

  function enterDiscovery() {
    if (session.current !== currentState)
      return
    clearTimeout(discoveryTimer)
    discoveryTimer = setTimeout(enterStable, DOM_DISCOVERY_WINDOW_MS)
    if (discovering)
      return
    discovering = true
    stopPlayerObservation?.()
    stopPlayerObservation = undefined
    stableTargets = []
    observer.disconnect()
    observer.observe(document.body, { childList: true, subtree: true })
  }

  /**
   * The root holds every transferred native node; origin parents receive
   * native re-renders; the shared player observer reports control and media
   * changes; shallow ancestry reports replacement of any of these hosts.
   */
  function enterStable() {
    clearTimeout(discoveryTimer)
    discoveryTimer = undefined
    if (session.current !== currentState || !currentState.root.isConnected)
      return
    discovering = false
    observer.disconnect()
    const origins = currentState.movedNodes
      .map(({ placeholder }) => placeholder.parentNode)
      .filter((parent): parent is Element => parent instanceof Element && parent.isConnected && !currentState.root.contains(parent))
    const subtrees = [currentState.root, ...new Set(origins)]
      .filter((target, index, all) => !all.some((other, otherIndex) => otherIndex !== index && other !== target && other.contains(target)))
    const ancestors = new Set<Element>()
    for (const target of subtrees) {
      for (let parent = target.parentElement; parent; parent = parent.parentElement) {
        if (!subtrees.some(subtree => subtree !== parent && subtree.contains(parent)))
          ancestors.add(parent)
      }
    }
    subtrees.forEach(target => observer.observe(target, { childList: true, subtree: true }))
    ancestors.forEach(parent => observer.observe(parent, { childList: true }))
    stableTargets = subtrees
    // An origin subtree that already holds the player reports its changes once.
    if (subtrees.some(target => target.contains(currentState.playerEl)))
      return
    stopPlayerObservation ??= observePlayerDom((mutations) => {
      if (!mutations) {
        // The player root itself was rebound; its new host may be elsewhere.
        enterDiscovery()
        return
      }
      handleRecords(mutations)
    })
  }

  currentState.restartDomDiscovery = enterDiscovery
  enterDiscovery()
  disableNativeLightOffMode(currentState.playerEl)
}

function cleanupState(currentState: BewlyWidescreenState) {
  currentState.sidebarReadyCleanup?.()
  currentState.escapeKeyCleanup?.()
  stopWidescreenZoom(currentState)
  currentState.fillToggleCleanup?.()
  currentState.fillToggleCleanup = undefined
  currentState.commentComposerCleanup?.()
  currentState.commentComposerCleanup = undefined
  currentState.idleProgressCleanup?.()
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
  clearViewerCount(currentState)
  clearVideoMetadataObserver(currentState)
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
  clearTimeout(currentState.initialRevealTimer)
  currentState.initialRevealTimer = undefined
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
  clearRailTabs(currentState.tabButtons.comment.parentElement!)
  currentState.root.remove()
  currentState.backdrop.remove()
  currentState.styleEl.remove()
  document.body.classList.remove(BODY_CLASS, BEWLY_WIDESCREEN_CONTROLS_HIDDEN_CLASS)
  window.dispatchEvent(new Event('resize'))
}

function applyNow(sidebarPosition: 'left' | 'right' = 'right') {
  if (pendingApplication && !pendingApplication.shouldApply())
    return false
  const player = getPlayerRoot()
  if (!player)
    return false

  const { root, backdrop, stage, playerSlot, playerFrame, danmakuDock, sidebarEl, infoEl, sidebarTop, metadataSlot, upSlot, toolbarSlot, descriptionSlot, tagsSlot, panels, tabButtons, playlistToggleButton } = createRoot(sidebarPosition)
  const styleEl = injectLayoutStyle()
  root.dataset.pageKind = isPgcPlaybackPage() ? 'pgc' : 'video'
  const movedNodes: MovedNode[] = []

  const application = pendingApplication
  const nextState: BewlyWidescreenState = {
    exit: exitBewlyWidescreen,
    refreshSidebar: () => scheduleSidebarRefresh(nextState),
    hydrateSidebar: () => startSidebarHydration(nextState),
    root,
    backdrop,
    stage,
    playerEl: player,
    playerSlot,
    playerFrame,
    danmakuDock,
    sidebarEl,
    infoEl,
    sidebarTop,
    metadataSlot,
    upSlot,
    toolbarSlot,
    descriptionSlot,
    tagsSlot,
    panels,
    tabButtons,
    playlistToggleButton,
    movedNodes,
    styleEl,
    activeTab: 'comment',
    displayMode: 'card',
    sidebarPosition,
    descriptionExpanded: false,
    playlistCollapsed: false,
    hydratedTabs: new Set(),
    initialScrollResetTabs: new Set(),
    panelScrollFrames: new Map(),
    navigationPending: false,
    bottomControlsHovered: false,
    playerPointerInside: false,
    controlsLayoutReady: false,
    onInitialLayoutReady: () => {
      clearTimeout(nextState.initialRevealTimer)
      nextState.initialRevealTimer = undefined
      loading.alignToCurrentLayout()
      loading.remove()
      if (session.current === nextState && !nextState.navigationPending)
        application?.onApplied()
    },
  }

  session.current = nextState
  pendingApplication = undefined
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
    recommendations: true,
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
    if (event.key === 'Escape' && nextState.displayMode === 'fill') {
      setWidescreenDisplayMode(nextState, 'card')
      return
    }
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
  setupActionGeometryObservers(nextState)
  setupAspectObservers(nextState)
  setupDomRefreshObserver(nextState)
  setupWidescreenSettingsWatchers(nextState)
  setupActiveWidescreenControl(nextState)
  setupFillToggle(nextState)
  nextState.commentComposerCleanup = setupPlaybackCommentComposer(nextState.panels.comment)
  setupIdleProgress(nextState)
  if (settings.value.showVerticalVideoZoomButton)
    initVerticalVideoZoom()
  schedulePlayerResizeSync(nextState)
  // Native controls missing a part (e.g. no danmaku input bar) never settle;
  // the shell is already built, so reveal it instead of holding the overlay.
  nextState.initialRevealTimer = setTimeout(() => {
    nextState.initialRevealTimer = undefined
    const reveal = nextState.onInitialLayoutReady
    if (session.current !== nextState || !reveal)
      return
    nextState.onInitialLayoutReady = undefined
    reveal()
  }, INITIAL_REVEAL_TIMEOUT)

  return true
}

function clearReadyWait({ preserveCommentPrewarm = false }: { preserveCommentPrewarm?: boolean } = {}) {
  readyObserver?.disconnect()
  readyObserver = undefined
  if (readyFrame !== undefined)
    cancelAnimationFrame(readyFrame)
  readyFrame = undefined
  if (readyMetadataHandler) {
    for (const name of ['loadedmetadata', 'loadeddata', 'resize'])
      document.removeEventListener(name, readyMetadataHandler, true)
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
  structureReadyForLayout = false
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
    if (pendingApplication && !pendingApplication.shouldApply()) {
      exitBewlyWidescreen()
      return true
    }
    if (session.current) {
      clearReadyWait({ preserveCommentPrewarm: true })
      return true
    }
    // Complete native structure commits once the DOM is parsed; images, ads
    // and other `load` dependencies never hold the skeleton. Only the settle
    // fallback (structure still incomplete) waits for load or its bound.
    if (!canCommitWidescreenLayout({
      pageReady: pageReadyForLayout || (structureReadyForLayout && document.readyState !== 'loading'),
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
      if (pendingApplication && !pendingApplication.shouldApply()) {
        exitBewlyWidescreen()
        return
      }
      startCommentPrewarm()
      playerReadyForLayout = isReadyForLayout()
      structureReadyForLayout = isWidescreenTransferContentReady()
      contentReadyForLayout = structureReadyForLayout
        || hasWidescreenTransferSettleElapsed()
      if (!tryCommitLayout() && readyPollTimer === undefined
        && (Date.now() - readinessStartedAt < READY_POLL_FAST_DURATION
          || ((pageReadyForLayout || structureReadyForLayout) && playerReadyForLayout
            && (!hasWidescreenTransferSettleElapsed() || readinessStableSince !== undefined)))) {
        readyPollTimer = setTimeout(() => {
          readyPollTimer = undefined
          scheduleAttempt()
        }, READY_POLL_INTERVAL)
      }
    })
  }

  readyObserver = new MutationObserver((records) => {
    // Clock/danmaku text and our loading decoration do not change readiness.
    const relevant = records.some(record => (record.target instanceof Element && record.target.matches(SIDEBAR_RELEVANT_SELECTOR))
      || [...Array.from(record.addedNodes), ...Array.from(record.removedNodes)].some(node => node instanceof Element
        && (node.matches(`${SIDEBAR_RELEVANT_SELECTOR},video,bwp-video`) || !!node.querySelector(`${SIDEBAR_RELEVANT_SELECTOR},video,bwp-video`))))
    if (relevant)
      scheduleAttempt()
  })
  readyObserver.observe(document.body || document.documentElement, { childList: true, subtree: true })
  readyMetadataHandler = (event) => {
    if (event.target instanceof Element && getPlayerRoot()?.contains(event.target))
      scheduleAttempt()
  }
  for (const name of ['loadedmetadata', 'loadeddata', 'resize'])
    document.addEventListener(name, readyMetadataHandler, true)
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
  // Keep late native events subscribed after the initial window, without an
  // idle polling loop. A real readiness change still gets its stability delay.
  scheduleAttempt()
}

export function applyBewlyWidescreen(
  sidebarPosition: 'left' | 'right' = 'right',
  showLoading = true,
  application?: PlayerModeApplication,
) {
  if (application && !application.shouldApply())
    return
  startWidescreenLanguageWatch()
  if (session.current || session.entering || waitingForLoad || readyObserver || readyFrame !== undefined)
    return

  session.entering = true
  pendingApplication = application
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
  // A new episode/manuscript may render its native hosts anywhere again.
  currentState.restartDomDiscovery?.()
  scheduleSidebarRefresh(currentState)
  refreshPlayerLayout(currentState)
  return true
}

function dispatchManualWidescreenToggle(action: BewlyWidescreenManualToggleDetail['action']) {
  window.dispatchEvent(new CustomEvent<BewlyWidescreenManualToggleDetail>(
    BEWLY_WIDESCREEN_MANUAL_TOGGLE,
    { detail: { action, userInitiated: true } },
  ))
}

export function exitBewlyWidescreen({ userInitiated = false }: ExitBewlyWidescreenOptions = {}) {
  pendingApplication?.cancel()
  if (userInitiated)
    dispatchManualWidescreenToggle('exit')
  stopWidescreenLanguageWatch()
  clearReadyWait()
  clearPageReadyHandler()
  loading.reset()
  pendingApplication = undefined
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

export function isBewlyPlaybackLayoutReady() {
  return !!session.current?.controlsLayoutReady && !session.current.navigationPending
}

export function isBewlyPlaybackNavigationPending() {
  return session.current?.navigationPending === true
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
