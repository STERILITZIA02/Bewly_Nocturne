import { settings } from '~/logic'
import { scheduleActionGeometrySync } from '~/utils/bewlyWidescreen/actionEffects'
import { HIGH_ENERGY_PROGRESS_PIN_SELECTOR, HIGH_ENERGY_PROGRESS_SELECTOR, NATIVE_PLAYER_ANCESTOR_CLASS, NATIVE_PLAYER_CLASS, NATIVE_PLAYER_CONTROL_SURFACE_SELECTOR, PLAYER_DISPLAY_MODE_ATTRIBUTE, PLAYER_ZOOMING_ATTRIBUTE, READY_STABILITY_DELAY, VIEWER_COUNT_MIRRORED_ATTRIBUTE } from '~/utils/bewlyWidescreen/constants'
import { syncDescription } from '~/utils/bewlyWidescreen/description'
import { forwardNativePlayerPointerActivity, getNativePlayerContainer, isPointerInBottomControlContainer, syncNativePlayerControlVisibility } from '~/utils/bewlyWidescreen/nativeControls'
import { exitNativeMiniPlayer } from '~/utils/bewlyWidescreen/nativeDom'
import { session } from '~/utils/bewlyWidescreen/session'
import type { BewlyWidescreenState } from '~/utils/bewlyWidescreen/types'
import { WIDESCREEN_BOTTOM_CONTROL_HOVER_LEAVE_DELAY } from '~/utils/bewlyWidescreenPolicy'
import { getVideoElement, isPlayerShowingEndingRecommendation } from '~/utils/player'
import { getPlayerRoot } from '~/utils/playerMedia'

const ANCHORED_PLAYER_GEOMETRY_PROPERTIES = [
  '--bewly-widescreen-player-height',
  '--bewly-widescreen-player-left',
  '--bewly-widescreen-player-top',
  '--bewly-widescreen-player-width',
] as const

const AUXILIARY_CONTROL_GEOMETRY_PROPERTIES = [
  '--bewly-widescreen-aux-controls-bottom',
  '--bewly-widescreen-aux-controls-left',
] as const

function setGeometryProperty(element: HTMLElement, name: string, value: string) {
  if (element.style.getPropertyValue(name) !== value)
    element.style.setProperty(name, value)
}

export function clearAuxiliaryControlGeometry() {
  const host = document.querySelector<HTMLElement>('#bewly')
  AUXILIARY_CONTROL_GEOMETRY_PROPERTIES.forEach(property => host?.style.removeProperty(property))
  document.body.style.removeProperty('--bewly-widescreen-aux-controls-width')
}

function disablePinnedHighEnergyProgress(highEnergyProgress: HTMLElement) {
  if (!highEnergyProgress.classList.contains('pin'))
    return
  highEnergyProgress.querySelector<HTMLElement>(HIGH_ENERGY_PROGRESS_PIN_SELECTOR)?.click()
}

function syncHighEnergyProgressState(
  currentState: BewlyWidescreenState,
  highEnergyProgress: HTMLElement | null,
) {
  if (currentState.highEnergyProgressElement === highEnergyProgress) {
    if (highEnergyProgress)
      disablePinnedHighEnergyProgress(highEnergyProgress)
    return
  }

  currentState.highEnergyProgressObserver?.disconnect()
  currentState.highEnergyProgressObserver = undefined
  currentState.highEnergyProgressElement = highEnergyProgress ?? undefined
  if (!highEnergyProgress)
    return

  currentState.highEnergyProgressObserver = new MutationObserver(() => {
    if (session.current === currentState && currentState.highEnergyProgressElement === highEnergyProgress)
      disablePinnedHighEnergyProgress(highEnergyProgress)
  })
  currentState.highEnergyProgressObserver.observe(highEnergyProgress, {
    attributes: true,
    attributeFilter: ['class'],
  })
  disablePinnedHighEnergyProgress(highEnergyProgress)
}

/* 悬浮玻璃卡高度 = 弹幕区高度 + 原生控制栏实际高度 + 高能进度图高度。
   原生收起态由 CSS 属性选择器塌缩，无需在此处处理。 */
export function syncControlsGlassGeometry(currentState: BewlyWidescreenState) {
  // A zoom scales the whole player; its end re-measures the settled layout.
  if (currentState.zoom)
    return
  currentState.danmakuPopoverPositionSync?.()
  const glass = currentState.danmakuGlass
  if (!glass?.isConnected)
    return
  const container = getNativePlayerContainer(currentState) ?? currentState.playerEl
  const wrap = container?.querySelector<HTMLElement>(NATIVE_PLAYER_CONTROL_SURFACE_SELECTOR)
  const wrapHeight = wrap?.isConnected ? Math.round(wrap.getBoundingClientRect().height) : 0
  const highEnergyProgress = container?.querySelector<HTMLElement>(HIGH_ENERGY_PROGRESS_SELECTOR)
  syncHighEnergyProgressState(currentState, highEnergyProgress ?? null)
  const highEnergyProgressHeight = highEnergyProgress?.isConnected
    ? Math.ceil(highEnergyProgress.getBoundingClientRect().height)
    : 0
  const controlsHeight = wrapHeight + highEnergyProgressHeight
  // 同值跳过：visibility/resize/observer 链频繁触发本函数，重复写自定义属性会重启过渡
  if (controlsHeight === currentState.controlsGlassAppliedHeight)
    return
  currentState.controlsGlassAppliedHeight = controlsHeight
  if (controlsHeight > 0) {
    glass.style.setProperty(
      '--bewly-widescreen-controls-glass-height',
      `calc(var(--bewly-widescreen-bottom-controls-height) + var(--bewly-widescreen-controls-block-padding, 12px) + ${controlsHeight}px)`,
    )
  }
  else {
    glass.style.removeProperty('--bewly-widescreen-controls-glass-height')
  }
}

export function syncAuxiliaryControlGeometry(currentState: BewlyWidescreenState) {
  if (currentState.zoom)
    return
  const host = document.querySelector<HTMLElement>('#bewly')
  if (settings.value.alwaysUseDock) {
    AUXILIARY_CONTROL_GEOMETRY_PROPERTIES.forEach(property => host?.style.removeProperty(property))
    setGeometryProperty(document.body, '--bewly-widescreen-aux-controls-width', '0px')
    return
  }
  const auxiliary = host?.shadowRoot?.querySelector<HTMLElement>('.widescreen-docked .sidebar-content')
  if (auxiliary !== currentState.auxiliaryControlsElement) {
    if (currentState.auxiliaryControlsElement)
      currentState.resizeObserver?.unobserve(currentState.auxiliaryControlsElement)
    currentState.auxiliaryControlsElement = auxiliary ?? undefined
    if (auxiliary)
      currentState.resizeObserver?.observe(auxiliary)
  }
  const viewerInfo = currentState.danmakuSemanticsSource?.querySelector<HTMLElement>('.bpx-player-video-info')
  const dockRect = (currentState.danmakuSourceHost ?? currentState.danmakuDock).getBoundingClientRect()
  const viewerRect = viewerInfo?.getBoundingClientRect()
  const auxiliaryRect = auxiliary?.getBoundingClientRect()
  if (!host || dockRect.width <= 0 || dockRect.height <= 0
    || !auxiliaryRect || auxiliaryRect.width <= 0 || auxiliaryRect.height <= 0) {
    clearAuxiliaryControlGeometry()
    return
  }

  const rootStyle = getComputedStyle(currentState.root)
  const gap = Number.parseFloat(rootStyle.getPropertyValue('--bew-space-2')) || 8
  const controlHeight = Number.parseFloat(rootStyle.getPropertyValue('--bew-control-height')) || 36
  setGeometryProperty(document.body, '--bewly-widescreen-aux-controls-width', `${auxiliaryRect.width + gap}px`)
  // After the viewer count while the bar shows it; with the card it reads in
  // the info's meta line instead (syncViewerCount), and the controls open the row.
  const left = viewerRect && viewerRect.width > 0 && viewerRect.height > 0
    ? viewerRect.right + gap
    : dockRect.left + gap
  // 圆键贴底锚定稳定布局几何，避免显隐过程中的绘制状态影响按钮位置。
  const glassBottom = Number.parseFloat(getComputedStyle(currentState.playerEl).getPropertyValue('--bewly-widescreen-controls-glass-bottom')) || 32
  const stableDockBottom = currentState.danmakuSourceHost?.isConnected && currentState.playerEl.isConnected
    ? currentState.playerEl.getBoundingClientRect().bottom - glassBottom
    : currentState.playerFrame.isConnected
      ? currentState.playerFrame.getBoundingClientRect().bottom + dockRect.height
      : dockRect.bottom
  // 按卡片内容块间距贴底，与原生 36px 控制按钮同水平线
  const blockPadding = Math.max((dockRect.height - controlHeight) / 2, 0)
  const bottom = Math.max(window.innerHeight - stableDockBottom + blockPadding, 0)
  setGeometryProperty(host, '--bewly-widescreen-aux-controls-left', `${left}px`)
  setGeometryProperty(host, '--bewly-widescreen-aux-controls-bottom', `${bottom}px`)
}

export function clearAnchoredPlayerElement(playerEl: HTMLElement) {
  playerEl.classList.remove(NATIVE_PLAYER_CLASS)
  playerEl.removeAttribute(PLAYER_DISPLAY_MODE_ATTRIBUTE)
  playerEl.removeAttribute(PLAYER_ZOOMING_ATTRIBUTE)
  ANCHORED_PLAYER_GEOMETRY_PROPERTIES.forEach(property => playerEl.style.removeProperty(property))
  document.querySelectorAll(`.${NATIVE_PLAYER_ANCESTOR_CLASS}`).forEach(node => node.classList.remove(NATIVE_PLAYER_ANCESTOR_CLASS))
}

export function clearAspectObservers(currentState: BewlyWidescreenState) {
  currentState.metadataListener?.()
  currentState.metadataListener = undefined
  currentState.resizeObserver?.disconnect()
  currentState.resizeObserver = undefined
  currentState.playerStateObserver?.disconnect()
  currentState.playerStateObserver = undefined
  currentState.playerAncestryObserver?.disconnect()
  currentState.playerAncestryObserver = undefined
  currentState.layoutEventCleanup?.()
  currentState.layoutEventCleanup = undefined
}

/**
 * Mirrors the display mode onto every element whose styles depend on it. The
 * shell and backdrop follow at once and only fade or recolour. The player's
 * own mode styles (control insets) and the column's inertness
 * restyle whole native and comment trees, so while a zoom runs they keep the
 * mode it left until the settled frame, with the controls hidden.
 */
export function syncDisplayModeAttributes(currentState: BewlyWidescreenState) {
  const mode = currentState.displayMode
  for (const element of [currentState.root, currentState.backdrop]) {
    if (element.dataset.displayMode !== mode)
      element.dataset.displayMode = mode
  }
  const restMode = currentState.heldRestMode ?? mode
  if (currentState.playerEl.getAttribute(PLAYER_DISPLAY_MODE_ATTRIBUTE) !== restMode)
    currentState.playerEl.setAttribute(PLAYER_DISPLAY_MODE_ATTRIBUTE, restMode)
  // Filled, the faded column (info included) leaves hit testing and the focus order.
  if (currentState.sidebarEl.inert !== (restMode === 'fill'))
    currentState.sidebarEl.inert = restMode === 'fill'
}

/**
 * The pane mirrors the shell's player frame; filling the window anchors the
 * player to the whole overlay. Only the native player moves, never its tree.
 */
export function syncAnchoredPlayerGeometry(currentState: BewlyWidescreenState) {
  const { playerEl, playerFrame, root } = currentState
  if (!playerEl.isConnected || !playerFrame.isConnected)
    return

  for (let ancestor = playerEl.parentElement; ancestor && ancestor !== document.body; ancestor = ancestor.parentElement) {
    if (!ancestor.classList.contains(NATIVE_PLAYER_ANCESTOR_CLASS))
      ancestor.classList.add(NATIVE_PLAYER_ANCESTOR_CLASS)
  }

  if (!isPlayerShowingEndingRecommendation())
    exitNativeMiniPlayer(playerEl)
  syncDisplayModeAttributes(currentState)
  const rect = (currentState.displayMode === 'fill' ? root : playerFrame).getBoundingClientRect()
  const finite = (value: number) => Number.isFinite(value) ? value : 0
  setGeometryProperty(playerEl, '--bewly-widescreen-player-height', `${Math.max(0, finite(rect.height))}px`)
  setGeometryProperty(playerEl, '--bewly-widescreen-player-left', `${finite(rect.left)}px`)
  setGeometryProperty(playerEl, '--bewly-widescreen-player-top', `${finite(rect.top)}px`)
  setGeometryProperty(playerEl, '--bewly-widescreen-player-width', `${Math.max(0, finite(rect.width))}px`)
  syncAuxiliaryControlGeometry(currentState)
}

export function ensureAnchoredPlayer(currentState: BewlyWidescreenState) {
  const replacement = getPlayerRoot()
  if (!currentState.playerEl.isConnected || (replacement && replacement !== currentState.playerEl)) {
    if (!replacement)
      return false
    const shouldRestoreAspectObservers = !!currentState.resizeObserver
      || !!currentState.playerStateObserver
      || !!currentState.layoutEventCleanup
    clearAspectObservers(currentState)
    clearAnchoredPlayerElement(currentState.playerEl)
    currentState.playerEl = replacement
    resetControlsLayout(currentState)
    if (shouldRestoreAspectObservers)
      setupAspectObservers(currentState)
  }

  if (!isPlayerShowingEndingRecommendation())
    exitNativeMiniPlayer(currentState.playerEl)
  if (!currentState.playerEl.classList.contains(NATIVE_PLAYER_CLASS))
    currentState.playerEl.classList.add(NATIVE_PLAYER_CLASS)
  syncAnchoredPlayerGeometry(currentState)
  return true
}

export function updatePlayerLayoutState(currentState: BewlyWidescreenState | null = session.current) {
  if (!currentState || session.current !== currentState)
    return

  syncAnchoredPlayerGeometry(currentState)
  syncNativePlayerControlVisibility(currentState)
  scheduleActionGeometrySync(currentState)
}

/** Media changes (new source, metadata) re-anchor the player and let the native layout re-measure. */
export function refreshPlayerLayout(currentState: BewlyWidescreenState | null = session.current) {
  if (!currentState || session.current !== currentState)
    return

  updatePlayerLayoutState(currentState)
  schedulePlayerResizeSync(currentState)
}

export function clearPlayerResizeSync(currentState: BewlyWidescreenState) {
  if (currentState.resizeSyncFrame !== undefined)
    cancelAnimationFrame(currentState.resizeSyncFrame)
  currentState.resizeSyncFrame = undefined
  currentState.onInitialLayoutReady = undefined
}

export function resetControlsLayout(currentState: BewlyWidescreenState) {
  currentState.controlsLayoutReady = false
  currentState.controlsLayoutSignature = undefined
  currentState.controlsLayoutStableSince = undefined
  syncNativePlayerControlVisibility(currentState)
}

function settleControlsLayout(currentState: BewlyWidescreenState) {
  currentState.resizeSyncFrame = undefined
  if (session.current !== currentState || !currentState.root.isConnected)
    return

  syncAnchoredPlayerGeometry(currentState)
  syncControlsGlassGeometry(currentState)
  if (currentState.controlsLayoutReady)
    return

  const controls = currentState.playerEl.querySelector<HTMLElement>(NATIVE_PLAYER_CONTROL_SURFACE_SELECTOR)
  const source = currentState.danmakuSemanticsSource
  const viewers = source?.querySelector<HTMLElement>('.bpx-player-video-info')
  const nativeButtons = controls?.matches('.bpx-player-control-wrap')
    ? controls.querySelector<HTMLElement>('.bpx-player-control-bottom')
    : controls
  const nativeLayoutReady = !controls?.matches('.bpx-player-control-wrap')
    || (nativeButtons && getComputedStyle(nativeButtons).display === 'flex')
  const elements = [currentState.playerFrame, controls, nativeButtons, currentState.danmakuSourceHost]
  // BV bars open with the online count, unless the card shows it in the info's
  // meta line instead (syncViewerCount) and its pill has no box.
  if (currentState.root.dataset.pageKind !== 'pgc' && !viewers?.hasAttribute(VIEWER_COUNT_MIRRORED_ATTRIBUTE))
    elements.push(viewers)
  if (!settings.value.alwaysUseDock) {
    const auxiliary = currentState.auxiliaryControlsElement
    elements.push(auxiliary)
    if (!auxiliary || getComputedStyle(auxiliary).flexDirection !== 'row') {
      currentState.controlsLayoutSignature = undefined
      currentState.controlsLayoutStableSince = undefined
      return
    }
  }
  const rects = elements.map(element => element?.isConnected ? element.getBoundingClientRect() : undefined)
  if (!nativeLayoutReady || !source?.isConnected || !currentState.danmakuGlass?.isConnected
    || !nativeButtons?.childElementCount
    || rects.some(rect => !rect || rect.width <= 0 || rect.height <= 0)) {
    currentState.controlsLayoutSignature = undefined
    currentState.controlsLayoutStableSince = undefined
    return // Existing DOM/Resize observers resume this when native controls arrive.
  }

  const signature = `${rects.flatMap(rect => [rect!.left, rect!.top, rect!.width, rect!.height])
    .map(value => value.toFixed(1))
    .join(':')}:${nativeButtons.childElementCount}`
  const now = Date.now()
  if (signature !== currentState.controlsLayoutSignature) {
    currentState.controlsLayoutSignature = signature
    currentState.controlsLayoutStableSince = now
  }
  if (now - currentState.controlsLayoutStableSince! < READY_STABILITY_DELAY) {
    currentState.resizeSyncFrame = requestAnimationFrame(() => settleControlsLayout(currentState))
    return
  }

  currentState.controlsLayoutReady = true
  syncNativePlayerControlVisibility(currentState)
  const reveal = currentState.onInitialLayoutReady
  currentState.onInitialLayoutReady = undefined
  reveal?.()
}

export function schedulePlayerResizeSync(currentState: BewlyWidescreenState) {
  if (!session.current || session.current !== currentState || currentState.resizeSyncFrame !== undefined)
    return

  currentState.resizeSyncFrame = requestAnimationFrame(() => {
    currentState.resizeSyncFrame = undefined
    if (!session.current || session.current !== currentState)
      return

    syncDescription(currentState)
    updatePlayerLayoutState(currentState)
    // Layout size, not the painted box: a running zoom transform is not a resize.
    const signature = `${currentState.playerEl.offsetWidth}:${currentState.playerEl.offsetHeight}`
    if (!isPlayerShowingEndingRecommendation() && signature !== currentState.lastPlayerResizeSignature) {
      currentState.lastPlayerResizeSignature = signature
      window.dispatchEvent(new Event('resize'))
    }
    settleControlsLayout(currentState)
  })
}

/**
 * Bilibili may discard and re-render its whole app after the shell commits
 * (a hydration fallback), handing the player a new element. Watching only the
 * direct children of the anchored player's ancestors notices that removal, and
 * re-anchoring in the observer's microtask puts the replacement back in the
 * card before it can paint at its native place.
 */
function watchAnchoredPlayerAncestry(currentState: BewlyWidescreenState) {
  currentState.playerAncestryObserver?.disconnect()
  const observer = new MutationObserver(() => {
    if (session.current !== currentState || currentState.playerAncestryObserver !== observer || currentState.playerEl.isConnected)
      return
    ensureAnchoredPlayer(currentState)
  })
  for (let node = currentState.playerEl.parentElement; node; node = node.parentElement)
    observer.observe(node, { childList: true })
  currentState.playerAncestryObserver = observer
}

export function setupAspectObservers(currentState: BewlyWidescreenState) {
  watchAnchoredPlayerAncestry(currentState)
  const video = currentState.playerEl.querySelector<HTMLVideoElement>('video') ?? getVideoElement()
  if (video) {
    const onLoadedMetadata = () => {
      refreshPlayerLayout(currentState)
      currentState.refreshSidebar()
    }
    const mediaEvents = ['loadedmetadata', 'loadeddata', 'playing']
    mediaEvents.forEach(name => video.addEventListener(name, onLoadedMetadata))
    currentState.metadataListener = () => mediaEvents.forEach(name => video.removeEventListener(name, onLoadedMetadata))
  }

  const refreshMeasuredLayout = () => {
    if (!session.current || session.current !== currentState)
      return
    // Sidebar, description and native control observers can fire together.
    // Measure through the existing frame owner, rather than synchronously
    // reflowing the same native subtrees from every observer callback.
    schedulePlayerResizeSync(currentState)
  }

  currentState.resizeObserver = new ResizeObserver(refreshMeasuredLayout)
  currentState.resizeObserver.observe(currentState.root)
  currentState.resizeObserver.observe(currentState.playerFrame)
  currentState.resizeObserver.observe(currentState.danmakuDock)
  if (currentState.auxiliaryControlsElement)
    currentState.resizeObserver.observe(currentState.auxiliaryControlsElement)
  if (currentState.danmakuSourceHost)
    currentState.resizeObserver.observe(currentState.danmakuSourceHost)
  currentState.resizeObserver.observe(currentState.descriptionSlot)

  const playerHost = video?.closest<HTMLElement>('.bewly-vertical-video-zoom-host, .bpx-player-container, .player-wrap')
  if (playerHost) {
    const refreshPlayerState = () => {
      syncNativePlayerControlVisibility(currentState, playerHost)
      refreshMeasuredLayout()
    }
    currentState.playerStateObserver = new MutationObserver(refreshPlayerState)
    currentState.playerStateObserver.observe(playerHost, {
      attributes: true,
      attributeFilter: ['class', 'data-screen', 'data-ctrl-hidden', 'style'],
    })
    syncNativePlayerControlVisibility(currentState, playerHost)
  }
  else {
    syncNativePlayerControlVisibility(currentState)
  }

  let bottomControlsLeaveTimer: ReturnType<typeof setTimeout> | undefined
  const clearBottomControlsLeaveTimer = () => {
    if (bottomControlsLeaveTimer) {
      clearTimeout(bottomControlsLeaveTimer)
      bottomControlsLeaveTimer = undefined
    }
  }
  const setBottomControlsHovered = (hovered: boolean) => {
    if (currentState.bottomControlsHovered === hovered)
      return false
    currentState.bottomControlsHovered = hovered
    currentState.root.dataset.bottomControlsHovered = String(hovered)
    return true
  }
  const scheduleBottomControlsLeave = () => {
    if (!currentState.bottomControlsHovered || bottomControlsLeaveTimer)
      return
    bottomControlsLeaveTimer = setTimeout(() => {
      bottomControlsLeaveTimer = undefined
      if (session.current === currentState && setBottomControlsHovered(false))
        syncNativePlayerControlVisibility(currentState, playerHost ?? currentState.playerEl)
    }, WIDESCREEN_BOTTOM_CONTROL_HOVER_LEAVE_DELAY)
  }
  const updateBottomControlsHover = (event: PointerEvent, playerRect: DOMRect) => {
    const sourceHost = currentState.danmakuSourceHost
    const pointerInBottomControlTree = event.composedPath().some(node => (
      node === currentState.danmakuDock
      || (node instanceof Node && currentState.danmakuDock.contains(node))
      || node === sourceHost
      || (node instanceof Node && !!sourceHost?.contains(node))
    ))
    const hovered = pointerInBottomControlTree || isPointerInBottomControlContainer(
      currentState,
      event.clientX,
      event.clientY,
      playerRect,
    )
    if (hovered) {
      clearBottomControlsLeaveTimer()
      return setBottomControlsHovered(true)
    }
    scheduleBottomControlsLeave()
    return false
  }

  currentState.root.dataset.bottomControlsHovered = String(currentState.bottomControlsHovered)
  const handleBottomPointerActivity = (event: PointerEvent) => {
    if (!event.isTrusted)
      return
    // Geometry is read once, before the state writes below.
    const pointerHost = playerHost ?? currentState.playerEl
    const pointerRect = pointerHost.getBoundingClientRect()
    const pointerInsidePlayer = event.clientX >= pointerRect.left
      && event.clientX <= pointerRect.right
      && event.clientY >= pointerRect.top
      && event.clientY <= pointerRect.bottom
    const bottomHoverChanged = updateBottomControlsHover(event, currentState.playerEl === pointerHost ? pointerRect : currentState.playerEl.getBoundingClientRect())
    const playerPointerChanged = currentState.playerPointerInside !== pointerInsidePlayer
    if (playerPointerChanged)
      currentState.playerPointerInside = pointerInsidePlayer
    if (bottomHoverChanged || playerPointerChanged)
      syncNativePlayerControlVisibility(currentState, pointerHost)
    if (playerHost && pointerInsidePlayer)
      forwardNativePlayerPointerActivity(currentState, playerHost, event, pointerRect)
  }
  const clearPlayerPointerState = () => {
    clearBottomControlsLeaveTimer()
    const bottomHoverChanged = setBottomControlsHovered(false)
    if (!currentState.playerPointerInside && !bottomHoverChanged)
      return
    currentState.playerPointerInside = false
    syncNativePlayerControlVisibility(currentState, playerHost ?? currentState.playerEl)
  }
  window.addEventListener('pointermove', handleBottomPointerActivity, { passive: true })
  window.addEventListener('blur', clearPlayerPointerState)
  document.documentElement.addEventListener('pointerleave', clearPlayerPointerState)

  const onWindowResize = (event: Event) => {
    if (!event.isTrusted)
      return
    refreshMeasuredLayout()
  }
  const onFullscreenChange = () => {
    const fullscreenDocument = document as Document & { webkitFullscreenElement?: Element | null }
    if ((document.fullscreenElement || fullscreenDocument.webkitFullscreenElement) && session.current === currentState) {
      currentState.exit({ userInitiated: true })
      return
    }
    refreshMeasuredLayout()
  }
  window.addEventListener('resize', onWindowResize)
  window.visualViewport?.addEventListener('resize', onWindowResize)
  document.addEventListener('fullscreenchange', onFullscreenChange)
  document.addEventListener('webkitfullscreenchange', onFullscreenChange)
  currentState.layoutEventCleanup = () => {
    window.removeEventListener('resize', onWindowResize)
    window.visualViewport?.removeEventListener('resize', onWindowResize)
    document.removeEventListener('fullscreenchange', onFullscreenChange)
    document.removeEventListener('webkitfullscreenchange', onFullscreenChange)
    clearBottomControlsLeaveTimer()
    window.removeEventListener('pointermove', handleBottomPointerActivity)
    window.removeEventListener('blur', clearPlayerPointerState)
    document.documentElement.removeEventListener('pointerleave', clearPlayerPointerState)
    delete currentState.root.dataset.bottomControlsHovered
  }

  refreshPlayerLayout(currentState)
}
