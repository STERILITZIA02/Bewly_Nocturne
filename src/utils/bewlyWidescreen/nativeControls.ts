import { BEWLY_WIDESCREEN_CONTROLS_HIDDEN_CLASS } from '~/constants/globalEvents'
import { BOTTOM_CONTROL_POPOVER_SELECTOR, MUTUALLY_EXCLUSIVE_PLAYER_CONTROL_SELECTOR, NATIVE_ACTION_OVERLAY_SELECTOR, NATIVE_PLAYER_CONTROL_SURFACE_SELECTOR, SIDEBAR_TOGGLE_IDLE_DELAY } from '~/utils/bewlyWidescreen/constants'
import { isWidescreenSidebarExpanded } from '~/utils/bewlyWidescreen/session'
import type { BewlyWidescreenState } from '~/utils/bewlyWidescreen/types'
import { hasWidescreenControlPopoverArea, isWidescreenBottomControlHoverRegion, isWidescreenPlayerControlHoverRegion, resolveWidescreenControlSurfaceState } from '~/utils/bewlyWidescreenPolicy'
import { isPhotoViewerOpen } from '~/utils/photoViewer'

export function getNativePlayerContainer(
  currentState: BewlyWidescreenState,
  playerHost: HTMLElement = currentState.playerEl,
) {
  return playerHost.matches('.bpx-player-container')
    ? playerHost
    : playerHost.querySelector<HTMLElement>('.bpx-player-container')
}

export function isBottomControlPopoverOpen(currentState: BewlyWidescreenState) {
  const roots = new Set<HTMLElement>()
  currentState.playerEl
    .querySelectorAll<HTMLElement>(NATIVE_PLAYER_CONTROL_SURFACE_SELECTOR)
    .forEach(root => roots.add(root))
  if (currentState.danmakuSemanticsSource?.isConnected)
    roots.add(currentState.danmakuSemanticsSource)

  return [...roots].some(root => Array.from(
    root.querySelectorAll<HTMLElement>(BOTTOM_CONTROL_POPOVER_SELECTOR),
  ).some((element) => {
    if (element.hidden || element.getAttribute('aria-hidden') === 'true')
      return false
    const style = getComputedStyle(element)
    const opacity = Number.parseFloat(style.opacity)
    if (style.display === 'none'
      || style.visibility === 'hidden'
      || style.visibility === 'collapse'
      || style.pointerEvents === 'none'
      || (Number.isFinite(opacity) && opacity <= 0)) {
      return false
    }
    const rect = element.getBoundingClientRect()
    // Bpx keeps 2px positioning anchors rendered while their menu is closed.
    // Only an interaction-sized surface represents a genuinely open popover.
    return hasWidescreenControlPopoverArea(rect.width, rect.height)
  }))
}

export function isNativeActionOverlayOpen() {
  if (isPhotoViewerOpen())
    return true
  return Array.from(document.querySelectorAll<HTMLElement>(NATIVE_ACTION_OVERLAY_SELECTOR)).some((element) => {
    if (element.hidden || element.getAttribute('aria-hidden') === 'true')
      return false

    const style = getComputedStyle(element)
    const opacity = Number.parseFloat(style.opacity)
    if (style.display === 'none'
      || style.visibility === 'hidden'
      || style.visibility === 'collapse'
      || style.pointerEvents === 'none'
      || (Number.isFinite(opacity) && opacity <= 0)) {
      return false
    }

    const rect = element.getBoundingClientRect()
    return rect.width > 0 && rect.height > 0
  })
}

export function isPointerInBottomControlContainer(
  currentState: BewlyWidescreenState,
  pointerX: number,
  pointerY: number,
) {
  const glass = currentState.danmakuGlass
  if (!glass?.isConnected)
    return false

  const rect = glass.getBoundingClientRect()
  const rootRect = currentState.root.getBoundingClientRect()
  const glassBottom = Number.parseFloat(
    getComputedStyle(currentState.root).getPropertyValue('--bewly-widescreen-controls-glass-bottom'),
  ) || 0
  return isWidescreenBottomControlHoverRegion({
    currentlyHovered: currentState.bottomControlsHovered,
    pointerX,
    pointerY,
    surfaceHeight: rect.height,
    // Anchor the hit region to the glass's stable layout edge so opacity-only
    // hiding preserves the same reveal area without stealing the sidebar edge.
    viewportBottom: rootRect.bottom - glassBottom,
    viewportLeft: rect.left,
    viewportRight: rect.right,
  })
}

export function syncNativePlayerControlVisibility(
  currentState: BewlyWidescreenState,
  playerHost: HTMLElement = currentState.playerEl,
) {
  const playerContainer = getNativePlayerContainer(currentState, playerHost)
  const { hidden, ready } = resolveWidescreenControlSurfaceState({
    bottomControlsHovered: currentState.bottomControlsHovered,
    danmakuControlsReady: currentState.danmakuSemanticsSource?.isConnected === true,
    nativeControlsHidden: (
      playerContainer?.dataset.ctrlHidden === 'true'
      || playerContainer?.classList.contains('bpx-state-no-cursor') === true
    ),
    nativeControlsReady: !!playerContainer?.querySelector(NATIVE_PLAYER_CONTROL_SURFACE_SELECTOR),
    pointerInsidePlayer: currentState.playerPointerInside,
    sidebarExpanded: isWidescreenSidebarExpanded(currentState),
  })
  currentState.root.dataset.playerControlsReady = String(ready)
  currentState.root.dataset.playerControlsHidden = String(hidden)
  document.body.classList.toggle(BEWLY_WIDESCREEN_CONTROLS_HIDDEN_CLASS, hidden)
}

export function forwardNativePlayerPointerActivity(
  currentState: BewlyWidescreenState,
  playerHost: HTMLElement,
  event: PointerEvent,
  allowSidebarExpanded = false,
) {
  if (!event.isTrusted || (!allowSidebarExpanded && isWidescreenSidebarExpanded(currentState)))
    return

  const playerContainer = getNativePlayerContainer(currentState, playerHost)
  if (!playerContainer || event.composedPath().some(node => (
    node === playerContainer
    || (node instanceof Node && playerContainer.contains(node))
  ))) {
    return
  }

  const rootRect = currentState.root.getBoundingClientRect()
  if (!isWidescreenPlayerControlHoverRegion({
    playerBottom: rootRect.bottom,
    playerTop: rootRect.top,
    pointerY: event.clientY,
  })) {
    return
  }

  const mouseInit: MouseEventInit = {
    bubbles: true,
    composed: true,
    clientX: event.clientX,
    clientY: event.clientY,
    screenX: event.screenX,
    screenY: event.screenY,
    button: event.button,
    buttons: event.buttons,
    ctrlKey: event.ctrlKey,
    altKey: event.altKey,
    metaKey: event.metaKey,
    shiftKey: event.shiftKey,
  }
  const playerSurface = playerContainer.querySelector<HTMLElement>('.bpx-player-video-area') ?? playerContainer
  playerSurface.dispatchEvent(new PointerEvent('pointermove', {
    ...mouseInit,
    pointerId: event.pointerId,
    pointerType: event.pointerType,
    isPrimary: event.isPrimary,
  }))
  playerSurface.dispatchEvent(new MouseEvent('mousemove', mouseInit))
}

export function setupActiveWidescreenControl(currentState: BewlyWidescreenState) {
  const handleControlClick = (event: Event) => {
    const eventElements = event.composedPath().filter((node): node is Element => node instanceof Element)
    if (eventElements.some(element => element.closest(MUTUALLY_EXCLUSIVE_PLAYER_CONTROL_SELECTOR)))
      currentState.exit({ userInitiated: true })
  }
  document.addEventListener('click', handleControlClick, true)
  currentState.activeControlCleanup = () => {
    document.removeEventListener('click', handleControlClick, true)
  }
}

export function setupSidebarToggleAutoHide(currentState: BewlyWidescreenState) {
  const { playerEl, sidebarToggleButton, root } = currentState
  let idleTimer: ReturnType<typeof setTimeout> | undefined
  let hoveringToggle = false

  function clearIdleTimer() {
    if (idleTimer) {
      clearTimeout(idleTimer)
      idleTimer = undefined
    }
  }

  function hideToggle() {
    root.dataset.pointerActive = 'false'
  }

  function showToggle() {
    root.dataset.pointerActive = 'true'
    clearIdleTimer()
    // 鼠标停在按钮上时保持显示，避免误隐藏
    if (!hoveringToggle)
      idleTimer = setTimeout(hideToggle, SIDEBAR_TOGGLE_IDLE_DELAY)
  }

  function onPointerLeave() {
    clearIdleTimer()
    hideToggle()
  }

  function onToggleEnter() {
    hoveringToggle = true
    root.dataset.pointerActive = 'true'
    clearIdleTimer()
  }

  function onToggleLeave() {
    hoveringToggle = false
    showToggle()
  }

  playerEl.addEventListener('pointermove', showToggle, { passive: true })
  playerEl.addEventListener('pointerleave', showToggle)
  window.addEventListener('blur', onPointerLeave)
  document.documentElement.addEventListener('pointerleave', onPointerLeave)
  sidebarToggleButton.addEventListener('pointerenter', onToggleEnter)
  sidebarToggleButton.addEventListener('pointerleave', onToggleLeave)

  currentState.sidebarToggleAutoHideCleanup = () => {
    clearIdleTimer()
    playerEl.removeEventListener('pointermove', showToggle)
    playerEl.removeEventListener('pointerleave', showToggle)
    window.removeEventListener('blur', onPointerLeave)
    document.documentElement.removeEventListener('pointerleave', onPointerLeave)
    sidebarToggleButton.removeEventListener('pointerenter', onToggleEnter)
    sidebarToggleButton.removeEventListener('pointerleave', onToggleLeave)
    delete root.dataset.pointerActive
  }
}
