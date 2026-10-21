import { BEWLY_WIDESCREEN_CONTROLS_HIDDEN_CLASS } from '~/constants/globalEvents'
import { MUTUALLY_EXCLUSIVE_PLAYER_CONTROL_SELECTOR, NATIVE_PLAYER_CONTROL_SURFACE_SELECTOR } from '~/utils/bewlyWidescreen/constants'
import { session } from '~/utils/bewlyWidescreen/session'
import type { BewlyWidescreenState } from '~/utils/bewlyWidescreen/types'
import { isWidescreenBottomControlHoverRegion, isWidescreenPlayerControlHoverRegion, resolveWidescreenControlSurfaceState } from '~/utils/bewlyWidescreenPolicy'
import { getDeepActiveElement } from '~/utils/dialogFocus'

const NON_TEXT_INPUT_TYPES = new Set(['button', 'checkbox', 'color', 'file', 'hidden', 'image', 'radio', 'range', 'reset', 'submit'])

export function isWidescreenTextEditing() {
  const active = getDeepActiveElement(document)
  if (!(active instanceof HTMLElement))
    return false
  // An embedded editor may be cross-origin; its focused frame is the only
  // observable focus owner. Keep that interaction without reading its document.
  if (active.tagName === 'IFRAME')
    return true
  if (active.matches('input, textarea')) {
    const input = active as HTMLInputElement | HTMLTextAreaElement
    return !input.disabled && !input.readOnly
      && (input.tagName !== 'INPUT' || !NON_TEXT_INPUT_TYPES.has((input as HTMLInputElement).type))
  }
  const editable = active.closest('[contenteditable]')
  return active.isContentEditable
    || (!!editable && ['', 'true', 'plaintext-only'].includes(editable.getAttribute('contenteditable') ?? ''))
    || (active.getAttribute('role') === 'textbox'
      && active.getAttribute('aria-readonly') !== 'true'
      && active.getAttribute('aria-disabled') !== 'true')
}

export function getNativePlayerContainer(
  currentState: BewlyWidescreenState,
  playerHost: HTMLElement = currentState.playerEl,
) {
  return playerHost.matches('.bpx-player-container')
    ? playerHost
    : playerHost.querySelector<HTMLElement>('.bpx-player-container')
}

export function isPointerInBottomControlContainer(
  currentState: BewlyWidescreenState,
  pointerX: number,
  pointerY: number,
  playerRect: DOMRect,
) {
  const glass = currentState.danmakuGlass
  if (!glass?.isConnected)
    return false

  const rect = glass.getBoundingClientRect()
  const glassBottom = Number.parseFloat(
    getComputedStyle(currentState.playerEl).getPropertyValue('--bewly-widescreen-controls-glass-bottom'),
  ) || 0
  return isWidescreenBottomControlHoverRegion({
    currentlyHovered: currentState.bottomControlsHovered,
    pointerX,
    pointerY,
    surfaceHeight: rect.height,
    // Anchor the hit region to the glass's stable layout edge inside the
    // player, so opacity-only hiding preserves the same reveal area.
    viewportBottom: playerRect.bottom - glassBottom,
    viewportLeft: rect.left,
    viewportRight: rect.right,
  })
}

export function isWidescreenBottomControlFocused(
  currentState: BewlyWidescreenState,
  nativeControls: Element | null | undefined = getNativePlayerContainer(currentState)?.querySelector(NATIVE_PLAYER_CONTROL_SURFACE_SELECTOR),
) {
  return [nativeControls, currentState.danmakuSemanticsSource, currentState.danmakuDock, currentState.auxiliaryControlsElement]
    .some((control) => {
      if (!control?.isConnected)
        return false
      const root = control.getRootNode() as Document | ShadowRoot
      return control.contains(root.activeElement)
    })
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
  const { hidden, ready } = resolveWidescreenControlSurfaceState({
    bottomControlsFocused: isWidescreenBottomControlFocused(currentState, nativeControls),
    textEditingActive: isWidescreenTextEditing(),
    bottomControlsHovered: currentState.bottomControlsHovered,
    danmakuControlsReady: currentState.danmakuSemanticsSource?.isConnected === true,
    nativeControlsHidden: (
      playerContainer?.dataset.ctrlHidden === 'true'
      || playerContainer?.classList.contains('bpx-state-no-cursor') === true
    ),
    nativeControlsReady: currentState.controlsLayoutReady
      && !!nativeControls,
    pointerInsidePlayer: currentState.playerPointerInside,
  })
  if (currentState.root.dataset.playerControlsReady !== String(ready))
    currentState.root.dataset.playerControlsReady = String(ready)
  if (currentState.root.dataset.playerControlsHidden !== String(hidden))
    currentState.root.dataset.playerControlsHidden = String(hidden)
  if (document.body.classList.contains(BEWLY_WIDESCREEN_CONTROLS_HIDDEN_CLASS) !== hidden)
    document.body.classList.toggle(BEWLY_WIDESCREEN_CONTROLS_HIDDEN_CLASS, hidden)
  currentState.updateIdleProgress?.()
}

/** `playerRect` is read before any state write in the same event, so forwarding never forces layout. */
export function forwardNativePlayerPointerActivity(
  currentState: BewlyWidescreenState,
  playerHost: HTMLElement,
  event: PointerEvent,
  playerRect: DOMRect,
) {
  if (!event.isTrusted)
    return

  const playerContainer = getNativePlayerContainer(currentState, playerHost)
  if (!playerContainer || event.composedPath().some(node => (
    node === playerContainer
    || (node instanceof Node && playerContainer.contains(node))
  ))) {
    return
  }

  if (event.clientX < playerRect.left || event.clientX > playerRect.right || !isWidescreenPlayerControlHoverRegion({
    playerBottom: playerRect.bottom,
    playerTop: playerRect.top,
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
  let disposed = false
  const focusRoots = new Set<Document | ShadowRoot>()
  const syncControlFocus = () => {
    if (disposed || session.current !== currentState)
      return

    // Focus transfers inside one Shadow host do not necessarily reach document.
    // Follow only the active focus path, including native comment editors.
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
    const eventElements = event.composedPath().filter((node): node is Element => node instanceof Element)
    if (eventElements.some(element => element.closest(MUTUALLY_EXCLUSIVE_PLAYER_CONTROL_SELECTOR)))
      currentState.exit({ userInitiated: true })
  }
  document.addEventListener('click', handleControlClick, true)
  syncControlFocus()
  currentState.activeControlCleanup = () => {
    disposed = true
    document.removeEventListener('click', handleControlClick, true)
    for (const root of focusRoots) {
      root.removeEventListener('focusin', syncControlFocus, true)
      root.removeEventListener('focusout', handleControlFocusOut, true)
    }
    focusRoots.clear()
  }
}
