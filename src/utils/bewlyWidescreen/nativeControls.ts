import { BEWLY_WIDESCREEN_CONTROLS_HIDDEN_CLASS } from '~/constants/globalEvents'
import { MUTUALLY_EXCLUSIVE_PLAYER_CONTROL_SELECTOR, NATIVE_PLAYER_CONTROL_SURFACE_SELECTOR } from '~/utils/bewlyWidescreen/constants'
import { session } from '~/utils/bewlyWidescreen/session'
import type { BewlyWidescreenState } from '~/utils/bewlyWidescreen/types'
import { getDeepActiveElement } from '~/utils/dialogFocus'

const CONTROL_IDLE_MS = 2500

export function getNativePlayerContainer(
  currentState: BewlyWidescreenState,
  playerHost: HTMLElement = currentState.playerEl,
) {
  return playerHost.matches('.bpx-player-container')
    ? playerHost
    : playerHost.querySelector<HTMLElement>('.bpx-player-container')
}

export function syncNativePlayerControlVisibility(
  currentState: BewlyWidescreenState,
  playerHost: HTMLElement = currentState.playerEl,
) {
  const playerContainer = getNativePlayerContainer(currentState, playerHost)
  const nativeControls = playerContainer?.querySelector(NATIVE_PLAYER_CONTROL_SURFACE_SELECTOR)
  if (!nativeControls || !currentState.danmakuSemanticsSource?.isConnected) {
    currentState.controlsLayoutReady = false
    currentState.controlsLayoutSignature = undefined
    currentState.controlsLayoutStableSince = undefined
  }
  const ready = currentState.controlsLayoutReady
  const active = getDeepActiveElement(document)
  const editingDanmaku = !!active && currentState.danmakuSemanticsSource?.contains(active)
    && active.matches('input:not([type]), input[type="text"], textarea, [contenteditable]:not([contenteditable="false"]), [role="textbox"]')
  const keyboardFocus = active?.matches(':focus-visible')
    && [nativeControls, currentState.danmakuSemanticsSource, currentState.auxiliaryControlsElement]
      .some(control => control?.contains(active))
  const hidden = !ready || !(currentState.playerControlsActive || editingDanmaku || keyboardFocus)
  if (currentState.root.dataset.playerControlsReady !== String(ready))
    currentState.root.dataset.playerControlsReady = String(ready)
  if (currentState.root.dataset.playerControlsHidden !== String(hidden))
    currentState.root.dataset.playerControlsHidden = String(hidden)
  if (document.body.classList.contains(BEWLY_WIDESCREEN_CONTROLS_HIDDEN_CLASS) !== hidden)
    document.body.classList.toggle(BEWLY_WIDESCREEN_CONTROLS_HIDDEN_CLASS, hidden)
  currentState.updateIdleProgress?.()
}

export function setupActiveWidescreenControl(currentState: BewlyWidescreenState) {
  let disposed = false
  let idleTimer: ReturnType<typeof setTimeout> | undefined
  let lastActivity = 0
  function setActive(active: boolean) {
    if (currentState.playerControlsActive === active)
      return
    currentState.playerControlsActive = active
    syncNativePlayerControlVisibility(currentState)
  }
  function clearActivity() {
    clearTimeout(idleTimer)
    idleTimer = undefined
    setActive(false)
  }
  function expireActivity() {
    const remaining = CONTROL_IDLE_MS - (performance.now() - lastActivity)
    if (remaining > 0)
      idleTimer = setTimeout(expireActivity, remaining)
    else
      clearActivity()
  }
  function handlePlayerActivity(event: Event) {
    if (!event.isTrusted)
      return
    const path = event.composedPath()
    if (![currentState.playerEl, currentState.danmakuSourceHost, currentState.danmakuDock, currentState.auxiliaryControlsElement]
      .some(owner => owner && path.includes(owner))) {
      if (currentState.playerControlsActive)
        clearActivity()
      return
    }
    lastActivity = performance.now()
    idleTimer ??= setTimeout(expireActivity, CONTROL_IDLE_MS)
    setActive(true)
  }
  const focusRoots = new Set<Document | ShadowRoot>()
  const syncControlFocus = () => {
    if (disposed || session.current !== currentState)
      return

    // A focus transfer inside Bewly's Shadow DOM need not reach the document.
    const nextRoots = new Set<Document | ShadowRoot>([document])
    let active = document.activeElement
    while (active?.shadowRoot) {
      nextRoots.add(active.shadowRoot)
      active = active.shadowRoot.activeElement
    }
    for (const root of focusRoots) {
      if (nextRoots.has(root))
        continue
      root.removeEventListener('focusin', syncControlFocus, true)
      root.removeEventListener('focusout', handleControlFocusOut, true)
      focusRoots.delete(root)
    }
    for (const root of nextRoots) {
      if (focusRoots.has(root))
        continue
      root.addEventListener('focusin', syncControlFocus, true)
      root.addEventListener('focusout', handleControlFocusOut, true)
      focusRoots.add(root)
    }
    syncNativePlayerControlVisibility(currentState)
  }
  // focusout occurs before activeElement moves to the next control. Re-read the
  // DOM after the focus transfer rather than retaining a second focus state.
  function handleControlFocusOut() {
    queueMicrotask(syncControlFocus)
  }
  const handleControlClick = (event: Event) => {
    handlePlayerActivity(event)
    const eventElements = event.composedPath().filter((node): node is Element => node instanceof Element)
    if (eventElements.some(element => element.closest(MUTUALLY_EXCLUSIVE_PLAYER_CONTROL_SELECTOR)))
      currentState.exit({ userInitiated: true })
  }
  document.addEventListener('click', handleControlClick, true)
  document.addEventListener('pointermove', handlePlayerActivity, { capture: true, passive: true })
  document.addEventListener('pointerdown', handlePlayerActivity, { capture: true, passive: true })
  document.documentElement.addEventListener('pointerleave', clearActivity)
  window.addEventListener('blur', clearActivity)
  syncControlFocus()
  currentState.activeControlCleanup = () => {
    disposed = true
    clearTimeout(idleTimer)
    document.removeEventListener('pointermove', handlePlayerActivity, true)
    document.removeEventListener('pointerdown', handlePlayerActivity, true)
    document.documentElement.removeEventListener('pointerleave', clearActivity)
    window.removeEventListener('blur', clearActivity)
    document.removeEventListener('click', handleControlClick, true)
    for (const root of focusRoots) {
      root.removeEventListener('focusin', syncControlFocus, true)
      root.removeEventListener('focusout', handleControlFocusOut, true)
    }
    focusRoots.clear()
  }
}
