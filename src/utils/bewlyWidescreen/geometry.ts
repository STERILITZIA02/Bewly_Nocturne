import { settings } from '~/logic'
import { scheduleActionGeometrySync } from '~/utils/bewlyWidescreen/actionEffects'
import { HIGH_ENERGY_PROGRESS_PIN_SELECTOR, HIGH_ENERGY_PROGRESS_SELECTOR, NATIVE_PLAYER_CLASS, NATIVE_PLAYER_CONTROL_SURFACE_SELECTOR, selectors } from '~/utils/bewlyWidescreen/constants'
import { syncDescription } from '~/utils/bewlyWidescreen/description'
import { forwardNativePlayerPointerActivity, getNativePlayerContainer, isPointerInBottomControlContainer, setupSidebarToggleAutoHide, syncNativePlayerControlVisibility } from '~/utils/bewlyWidescreen/nativeControls'
import { exitNativeMiniPlayer, findMovable } from '~/utils/bewlyWidescreen/nativeDom'
import { session } from '~/utils/bewlyWidescreen/session'
import type { BewlyWidescreenState } from '~/utils/bewlyWidescreen/types'
import { resolveWidescreenAnchoredPlayerGeometry, resolveWidescreenCenterGeometry, WIDESCREEN_BOTTOM_CONTROL_HOVER_LEAVE_DELAY } from '~/utils/bewlyWidescreenPolicy'
import { getVideoElement } from '~/utils/player'

const ANCHORED_PLAYER_GEOMETRY_PROPERTIES = [
  '--bewly-widescreen-player-height',
  '--bewly-widescreen-player-left',
  '--bewly-widescreen-player-top',
  '--bewly-widescreen-player-width',
  '--bewly-widescreen-center-offset',
] as const

const AUXILIARY_CONTROL_GEOMETRY_PROPERTIES = [
  '--bewly-widescreen-aux-controls-bottom',
  '--bewly-widescreen-aux-controls-left',
] as const

export function clearAuxiliaryControlGeometry() {
  const host = document.querySelector<HTMLElement>('#bewly')
  AUXILIARY_CONTROL_GEOMETRY_PROPERTIES.forEach(property => host?.style.removeProperty(property))
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
  const host = document.querySelector<HTMLElement>('#bewly')
  const viewerInfo = currentState.danmakuSemanticsSource?.querySelector<HTMLElement>('.bpx-player-video-info')
  const dockRect = (currentState.danmakuSourceHost ?? currentState.danmakuDock).getBoundingClientRect()
  const viewerRect = viewerInfo?.getBoundingClientRect()
  if (!host || !viewerRect || dockRect.width <= 0 || dockRect.height <= 0) {
    clearAuxiliaryControlGeometry()
    return
  }

  const rootStyle = getComputedStyle(currentState.root)
  const gap = Number.parseFloat(rootStyle.getPropertyValue('--bew-space-2')) || 8
  const controlHeight = Number.parseFloat(rootStyle.getPropertyValue('--bew-control-height')) || 36
  const left = viewerRect.right + gap
  // 圆键贴底锚定稳定布局几何，避免显隐过程中的绘制状态影响按钮位置。
  const glassBottom = Number.parseFloat(rootStyle.getPropertyValue('--bewly-widescreen-controls-glass-bottom')) || 32
  const stableDockBottom = currentState.danmakuSourceHost?.isConnected && currentState.playerEl.isConnected
    ? currentState.playerEl.getBoundingClientRect().bottom - glassBottom
    : currentState.playerFrame.isConnected
      ? currentState.playerFrame.getBoundingClientRect().bottom + dockRect.height
      : dockRect.bottom
  // 按卡片内容块间距贴底，与原生 36px 控制按钮同水平线
  const blockPadding = Math.max((dockRect.height - controlHeight) / 2, 0)
  const bottom = Math.max(window.innerHeight - stableDockBottom + blockPadding, 0)
  host.style.setProperty('--bewly-widescreen-aux-controls-left', `${left}px`)
  host.style.setProperty('--bewly-widescreen-aux-controls-bottom', `${bottom}px`)
}

export function clearAnchoredPlayerElement(playerEl: HTMLElement) {
  playerEl.classList.remove(NATIVE_PLAYER_CLASS)
  ANCHORED_PLAYER_GEOMETRY_PROPERTIES.forEach(property => playerEl.style.removeProperty(property))
}

export function clearAspectObservers(currentState: BewlyWidescreenState) {
  currentState.metadataListener?.()
  currentState.metadataListener = undefined
  currentState.resizeObserver?.disconnect()
  currentState.resizeObserver = undefined
  currentState.playerStateObserver?.disconnect()
  currentState.playerStateObserver = undefined
  currentState.layoutEventCleanup?.()
  currentState.layoutEventCleanup = undefined
}

export function syncAnchoredPlayerGeometry(currentState: BewlyWidescreenState) {
  const { playerEl, playerFrame, root, sidebarEl } = currentState
  if (!playerEl.isConnected || !playerFrame.isConnected)
    return

  exitNativeMiniPlayer(playerEl)
  const frameRect = playerFrame.getBoundingClientRect()
  const sidebarRect = sidebarEl.getBoundingClientRect()
  const sidebarFloatingInset = Number.parseFloat(
    getComputedStyle(root).getPropertyValue('--bewly-widescreen-sidebar-floating-inset'),
  ) || 0
  const geometry = resolveWidescreenAnchoredPlayerGeometry({
    centered: root.dataset.centered === 'true',
    frameHeight: frameRect.height,
    frameLeft: frameRect.left,
    frameTop: frameRect.top,
    frameWidth: frameRect.width,
    sidebarPosition: currentState.sidebarPosition,
    sidebarReservedWidth: sidebarRect.width + sidebarFloatingInset * 2,
  })

  playerEl.style.setProperty('--bewly-widescreen-player-height', `${geometry.height}px`)
  playerEl.style.setProperty('--bewly-widescreen-player-left', `${geometry.left}px`)
  playerEl.style.setProperty('--bewly-widescreen-player-top', `${geometry.top}px`)
  playerEl.style.setProperty('--bewly-widescreen-player-width', `${geometry.width}px`)
  syncAuxiliaryControlGeometry(currentState)
}

export function ensureAnchoredPlayer(currentState: BewlyWidescreenState) {
  if (!currentState.playerEl.isConnected) {
    const replacement = findMovable(selectors.player)
    if (!replacement)
      return false
    const shouldRestoreAspectObservers = !!currentState.resizeObserver
      || !!currentState.playerStateObserver
      || !!currentState.layoutEventCleanup
    const shouldRestoreToggleAutoHide = !!currentState.sidebarToggleAutoHideCleanup
    clearAspectObservers(currentState)
    currentState.sidebarToggleAutoHideCleanup?.()
    currentState.sidebarToggleAutoHideCleanup = undefined
    clearAnchoredPlayerElement(currentState.playerEl)
    currentState.playerEl = replacement
    if (shouldRestoreAspectObservers)
      setupAspectObservers(currentState)
    if (shouldRestoreToggleAutoHide)
      setupSidebarToggleAutoHide(currentState)
  }

  exitNativeMiniPlayer(currentState.playerEl)
  currentState.playerEl.classList.add(NATIVE_PLAYER_CLASS)
  syncAnchoredPlayerGeometry(currentState)
  return true
}

function isHorizontalWidescreenLayout(currentState: BewlyWidescreenState) {
  const playerRect = currentState.playerSlot.getBoundingClientRect()
  const sidebarRect = currentState.sidebarEl.getBoundingClientRect()
  return playerRect.top < sidebarRect.bottom - 1
    && sidebarRect.top < playerRect.bottom - 1
}

export function updateSidebarLayoutState(currentState: BewlyWidescreenState | null = session.current) {
  if (!currentState || session.current !== currentState)
    return

  const rootRect = currentState.root.getBoundingClientRect()
  const playerRect = currentState.playerFrame.getBoundingClientRect()
  const sidebarRect = currentState.sidebarEl.getBoundingClientRect()
  const sidebarFloatingInset = Number.parseFloat(
    getComputedStyle(currentState.root).getPropertyValue('--bewly-widescreen-sidebar-floating-inset'),
  ) || 0
  const configuredAspect = Number.parseFloat(
    currentState.root.style.getPropertyValue('--bewly-widescreen-layout-aspect'),
  ) || 16 / 9
  const playerHost = getVideoElement()?.closest<HTMLElement>('.bewly-vertical-video-zoom-host')
  const visualAspect = playerHost?.classList.contains('is-bewly-vertical-video-zoomed')
    ? 1
    : configuredAspect
  const geometry = resolveWidescreenCenterGeometry({
    centerEnabled: settings.value.bewlyWidescreenCenterVideo,
    compactLayout: currentState.sidebarLayout === 'compact',
    horizontalLayout: isHorizontalWidescreenLayout(currentState),
    viewportWidth: rootRect.width,
    playerHeight: playerRect.height,
    visualAspect,
    sidebarWidth: sidebarRect.width + sidebarFloatingInset * 2,
  })
  const direction = currentState.sidebarPosition === 'right' ? 1 : -1

  const centered = geometry.enabled
    && currentState.root.dataset.sidebarManuallyClosed !== 'true'
  currentState.root.dataset.centered = String(centered)
  currentState.root.dataset.sidebarToggleVisible = 'true'
  currentState.root.style.setProperty(
    '--bewly-widescreen-center-offset',
    `${geometry.offset * direction}px`,
  )
  currentState.playerEl.style.setProperty(
    '--bewly-widescreen-center-offset',
    `${geometry.offset * direction}px`,
  )
  if (centered)
    currentState.root.dataset.sidebarHoverExpanded = 'false'
  syncAnchoredPlayerGeometry(currentState)
  syncNativePlayerControlVisibility(currentState)
  scheduleActionGeometrySync(currentState)
}

export function updateAspectRatio(currentState: BewlyWidescreenState | null = session.current) {
  if (!currentState || session.current !== currentState)
    return

  const video = getVideoElement()
  const aspect = video?.videoWidth && video.videoHeight
    ? video.videoWidth / video.videoHeight
    : 16 / 9
  const layoutAspect = Math.min(aspect, 16 / 9)

  currentState.root.style.setProperty('--bewly-widescreen-aspect', String(aspect))
  currentState.root.style.setProperty('--bewly-widescreen-layout-aspect', String(layoutAspect))
  updateSidebarLayoutState(currentState)
  schedulePlayerResizeSync(currentState)
}

export function clearPlayerResizeSync(currentState: BewlyWidescreenState) {
  if (currentState.resizeSyncFrame !== undefined)
    cancelAnimationFrame(currentState.resizeSyncFrame)
  currentState.resizeSyncFrame = undefined
}

export function schedulePlayerResizeSync(currentState: BewlyWidescreenState) {
  if (!session.current || session.current !== currentState || currentState.resizeSyncFrame !== undefined)
    return

  currentState.resizeSyncFrame = requestAnimationFrame(() => {
    currentState.resizeSyncFrame = undefined
    if (!session.current || session.current !== currentState)
      return

    updateSidebarLayoutState(currentState)
    window.dispatchEvent(new Event('resize'))
  })
}

export function setupAspectObservers(currentState: BewlyWidescreenState) {
  const video = currentState.playerEl.querySelector<HTMLVideoElement>('video') ?? getVideoElement()
  if (video) {
    const onLoadedMetadata = () => {
      updateAspectRatio(currentState)
      currentState.refreshSidebar()
    }
    video.addEventListener('loadedmetadata', onLoadedMetadata)
    currentState.metadataListener = () => video.removeEventListener('loadedmetadata', onLoadedMetadata)
  }

  const refreshMeasuredLayout = () => {
    if (!session.current || session.current !== currentState)
      return
    updateAspectRatio(currentState)
    syncDescription(currentState)
    scheduleActionGeometrySync(currentState)
    syncControlsGlassGeometry(currentState)
  }

  currentState.resizeObserver = new ResizeObserver(refreshMeasuredLayout)
  currentState.resizeObserver.observe(currentState.root)
  currentState.resizeObserver.observe(currentState.playerFrame)
  currentState.resizeObserver.observe(currentState.sidebarEl)
  currentState.resizeObserver.observe(currentState.danmakuDock)
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
  const updateBottomControlsHover = (event: PointerEvent) => {
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
    const pointerHost = playerHost ?? currentState.playerEl
    const pointerRect = pointerHost.getBoundingClientRect()
    const pointerInsidePlayer = event.clientX >= pointerRect.left
      && event.clientX <= pointerRect.right
      && event.clientY >= pointerRect.top
      && event.clientY <= pointerRect.bottom
    const bottomHoverChanged = updateBottomControlsHover(event)
    const playerPointerChanged = currentState.playerPointerInside !== pointerInsidePlayer
    if (playerPointerChanged)
      currentState.playerPointerInside = pointerInsidePlayer
    if (bottomHoverChanged || playerPointerChanged)
      syncNativePlayerControlVisibility(currentState, pointerHost)
    if (playerHost && pointerInsidePlayer)
      forwardNativePlayerPointerActivity(currentState, playerHost, event)
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

  updateAspectRatio(currentState)
  schedulePlayerResizeSync(currentState)
}
