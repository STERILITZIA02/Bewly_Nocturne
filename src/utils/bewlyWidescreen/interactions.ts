import { settings } from '~/logic'
import { SIDEBAR_RESIZE_KEYBOARD_STEP } from '~/utils/bewlyWidescreen/constants'
import { schedulePlayerResizeSync } from '~/utils/bewlyWidescreen/geometry'
import { forwardNativePlayerPointerActivity, isBottomControlPopoverOpen, isNativeActionOverlayOpen, isPointerInBottomControlContainer, syncNativePlayerControlVisibility } from '~/utils/bewlyWidescreen/nativeControls'
import { session } from '~/utils/bewlyWidescreen/session'
import { clearSidebarEdgeRevealSuppression } from '~/utils/bewlyWidescreen/shell'
import type { BewlyWidescreenState } from '~/utils/bewlyWidescreen/types'
import { clampWidescreenSidebarWidth, isWidescreenPlayerControlHoverRegion, resolveWidescreenSidebarHoverExpanded, resolveWidescreenSidebarResizeWidth, shouldBlockWidescreenSidebarReveal, WIDESCREEN_SIDEBAR_EDGE_EXIT_DELAY, WIDESCREEN_SIDEBAR_MIN_WIDTH, WIDESCREEN_SIDEBAR_RESIZE_MAX_WIDTH } from '~/utils/bewlyWidescreenPolicy'

export function setupSidebarInteractionTracking(currentState: BewlyWidescreenState) {
  const { root, sidebarEl: sidebar, sidebarResizer } = currentState
  let collapseTimer: ReturnType<typeof setTimeout> | undefined
  let resizeFrame: number | undefined
  let pointerTrackingFrame: number | undefined
  let pendingPointerPosition: { x: number, y: number, type: string } | undefined
  let pendingSidebarWidth: number | undefined
  let resizingPointerId: number | undefined
  let lastPointerX: number | undefined
  let lastPointerY: number | undefined
  let lastPointerEvent: PointerEvent | undefined
  let appliedSidebarWidth = clampWidescreenSidebarWidth(
    settings.value.bewlyWidescreenSidebarWidth,
    root.getBoundingClientRect().width,
  )

  function canTemporarilyExpand() {
    return currentState.sidebarLayout === 'compact'
      && currentState.root.dataset.centered !== 'true'
  }

  function clearCollapseTimer() {
    if (collapseTimer) {
      clearTimeout(collapseTimer)
      collapseTimer = undefined
    }
  }

  function setHoverExpanded(expanded: boolean) {
    if (expanded)
      clearCollapseTimer()
    const nextValue = String(expanded)
    if (root.dataset.sidebarHoverExpanded !== nextValue) {
      root.dataset.sidebarHoverExpanded = nextValue
      syncNativePlayerControlVisibility(currentState)
    }
    if (expanded)
      delete root.dataset.sidebarManuallyClosed
  }

  function collapseSidebar() {
    clearCollapseTimer()
    setHoverExpanded(false)
  }

  function scheduleCollapse() {
    if (
      collapseTimer
      || resizingPointerId !== undefined
      || !canTemporarilyExpand()
      || sidebarResizer.matches(':focus-visible')
    ) {
      return
    }

    collapseTimer = setTimeout(() => {
      collapseTimer = undefined
      if (resizingPointerId !== undefined || sidebarResizer.matches(':focus-visible') || isNativeActionOverlayOpen())
        return

      const playerRect = currentState.playerEl.getBoundingClientRect()
      const pointerIsInPlayerControls = lastPointerX !== undefined
        && lastPointerY !== undefined
        && lastPointerX >= playerRect.left
        && lastPointerX <= playerRect.right
        && isWidescreenPlayerControlHoverRegion({
          playerBottom: playerRect.bottom,
          playerTop: playerRect.top,
          pointerY: lastPointerY,
        })
      if (lastPointerEvent && pointerIsInPlayerControls) {
        // Let Bilibili reveal its own controller while the sidebar still masks
        // the bottom surfaces, then hand over once instead of alternating states.
        forwardNativePlayerPointerActivity(currentState, currentState.playerEl, lastPointerEvent, true)
      }

      setHoverExpanded(false)
    }, WIDESCREEN_SIDEBAR_EDGE_EXIT_DELAY)
  }

  function getResizeBounds(viewportWidth = root.getBoundingClientRect().width) {
    return {
      minWidth: Math.min(WIDESCREEN_SIDEBAR_MIN_WIDTH, viewportWidth),
      maxWidth: clampWidescreenSidebarWidth(WIDESCREEN_SIDEBAR_RESIZE_MAX_WIDTH, viewportWidth),
    }
  }

  function syncSidebarResizerValue(
    width = sidebar.getBoundingClientRect().width,
    viewportWidth = root.getBoundingClientRect().width,
  ) {
    const { minWidth, maxWidth } = getResizeBounds(viewportWidth)
    sidebarResizer.setAttribute('aria-valuemin', String(Math.round(minWidth)))
    sidebarResizer.setAttribute('aria-valuemax', String(Math.round(maxWidth)))
    sidebarResizer.setAttribute('aria-valuenow', String(Math.round(width)))
  }

  function applySidebarWidth(width: number) {
    const rootRect = root.getBoundingClientRect()
    const nextWidth = clampWidescreenSidebarWidth(width, rootRect.width)
    appliedSidebarWidth = nextWidth
    root.style.setProperty('--bewly-widescreen-sidebar-user-width', `${nextWidth}px`)
    syncSidebarResizerValue(nextWidth, rootRect.width)
    return nextWidth
  }

  function persistSidebarWidth() {
    const storedWidth = Math.round(appliedSidebarWidth)
    if (settings.value.bewlyWidescreenSidebarWidth !== storedWidth)
      settings.value.bewlyWidescreenSidebarWidth = storedWidth
  }

  function flushPendingSidebarWidth() {
    if (resizeFrame !== undefined) {
      cancelAnimationFrame(resizeFrame)
      resizeFrame = undefined
    }
    if (pendingSidebarWidth === undefined)
      return
    const width = pendingSidebarWidth
    pendingSidebarWidth = undefined
    applySidebarWidth(width)
  }

  function scheduleSidebarWidth(width: number) {
    pendingSidebarWidth = width
    if (resizeFrame !== undefined)
      return
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = undefined
      if (session.current !== currentState || !root.isConnected) {
        pendingSidebarWidth = undefined
        return
      }
      flushPendingSidebarWidth()
    })
  }

  function resizeFromPointer(pointerX: number) {
    const rootRect = root.getBoundingClientRect()
    scheduleSidebarWidth(resolveWidescreenSidebarResizeWidth({
      position: currentState.sidebarPosition,
      pointerX,
      viewportStart: rootRect.left,
      viewportEnd: rootRect.right,
    }))
  }

  function handlePointerPosition(pointerX: number, pointerY: number, pointerType: string) {
    lastPointerX = pointerX
    lastPointerY = pointerY
    if (resizingPointerId !== undefined)
      return
    if (pointerType === 'touch' || !canTemporarilyExpand()) {
      collapseSidebar()
      return
    }

    const currentlyExpanded = root.dataset.sidebarHoverExpanded === 'true'
    const rootRect = root.getBoundingClientRect()
    const pointerInput = {
      position: currentState.sidebarPosition,
      pointerX,
      viewportStart: rootRect.left,
      viewportEnd: rootRect.right,
      sidebarWidth: sidebar.getBoundingClientRect().width,
    }
    const pointerIsAtActivationEdge = resolveWidescreenSidebarHoverExpanded({
      ...pointerInput,
      currentlyExpanded: false,
    })
    if (!currentlyExpanded && pointerIsAtActivationEdge) {
      const pointerIsInBottomControls = isPointerInBottomControlContainer(
        currentState,
        pointerX,
        pointerY,
      )
      if (shouldBlockWidescreenSidebarReveal({
        pointerInBottomControls: pointerIsInBottomControls,
        bottomControlPopoverOpen: pointerIsInBottomControls
          ? false
          : isBottomControlPopoverOpen(currentState),
      })) {
        collapseSidebar()
        return
      }
    }
    if (root.dataset.sidebarEdgeRevealSuppressed === 'true') {
      if (!pointerIsAtActivationEdge)
        clearSidebarEdgeRevealSuppression(currentState)
      collapseSidebar()
      return
    }

    const shouldRemainExpanded = resolveWidescreenSidebarHoverExpanded({
      ...pointerInput,
      currentlyExpanded,
    })
    if (shouldRemainExpanded || (currentlyExpanded && isNativeActionOverlayOpen())) {
      setHoverExpanded(true)
    }
    else if (currentlyExpanded) {
      scheduleCollapse()
    }
    else {
      collapseSidebar()
    }
  }

  function handlePointerMove(event: PointerEvent) {
    if (!event.isTrusted)
      return
    lastPointerEvent = event
    pendingPointerPosition = { x: event.clientX, y: event.clientY, type: event.pointerType }
    if (pointerTrackingFrame !== undefined)
      return
    pointerTrackingFrame = requestAnimationFrame(() => {
      pointerTrackingFrame = undefined
      const pending = pendingPointerPosition
      pendingPointerPosition = undefined
      if (pending)
        handlePointerPosition(pending.x, pending.y, pending.type)
    })
  }

  function handlePointerLeave() {
    lastPointerEvent = undefined
    pendingPointerPosition = undefined
    // Leaving the document ends the gesture that set manual-close suppression.
    // Re-entering at the edge must be treated as a fresh reveal attempt.
    clearSidebarEdgeRevealSuppression(currentState)
    if (pointerTrackingFrame !== undefined)
      cancelAnimationFrame(pointerTrackingFrame)
    pointerTrackingFrame = undefined
    if (resizingPointerId === undefined && root.dataset.sidebarHoverExpanded === 'true')
      scheduleCollapse()
  }

  function handleResizePointerDown(event: PointerEvent) {
    if (event.pointerType === 'mouse' && event.button !== 0)
      return
    event.preventDefault()
    clearCollapseTimer()
    resizingPointerId = event.pointerId
    lastPointerX = event.clientX
    lastPointerY = event.clientY
    root.dataset.sidebarResizing = 'true'
    if (canTemporarilyExpand())
      setHoverExpanded(true)
    sidebarResizer.setPointerCapture(event.pointerId)
    resizeFromPointer(event.clientX)
  }

  function handleResizePointerMove(event: PointerEvent) {
    if (resizingPointerId !== event.pointerId)
      return
    lastPointerX = event.clientX
    lastPointerY = event.clientY
    resizeFromPointer(event.clientX)
  }

  function finishResize(event: PointerEvent) {
    if (resizingPointerId !== event.pointerId)
      return
    lastPointerX = event.clientX
    lastPointerY = event.clientY
    flushPendingSidebarWidth()
    if (sidebarResizer.hasPointerCapture(event.pointerId))
      sidebarResizer.releasePointerCapture(event.pointerId)
    resizingPointerId = undefined
    delete root.dataset.sidebarResizing
    persistSidebarWidth()
    schedulePlayerResizeSync(currentState)
    handlePointerPosition(event.clientX, event.clientY, event.pointerType)
  }

  function handleResizeKeydown(event: KeyboardEvent) {
    const currentWidth = sidebar.getBoundingClientRect().width
    const { minWidth, maxWidth } = getResizeBounds()
    let nextWidth: number | undefined
    switch (event.key) {
      case 'ArrowLeft':
        nextWidth = currentWidth + (currentState.sidebarPosition === 'right' ? SIDEBAR_RESIZE_KEYBOARD_STEP : -SIDEBAR_RESIZE_KEYBOARD_STEP)
        break
      case 'ArrowRight':
        nextWidth = currentWidth + (currentState.sidebarPosition === 'left' ? SIDEBAR_RESIZE_KEYBOARD_STEP : -SIDEBAR_RESIZE_KEYBOARD_STEP)
        break
      case 'Home':
        nextWidth = minWidth
        break
      case 'End':
        nextWidth = maxWidth
        break
      default:
        return
    }

    event.preventDefault()
    event.stopPropagation()
    clearCollapseTimer()
    if (canTemporarilyExpand())
      setHoverExpanded(true)
    applySidebarWidth(nextWidth)
    persistSidebarWidth()
    schedulePlayerResizeSync(currentState)
  }

  function handleResizeFocus() {
    clearCollapseTimer()
    if (canTemporarilyExpand())
      setHoverExpanded(true)
  }

  function handleResizeBlur() {
    if (lastPointerX !== undefined && lastPointerY !== undefined)
      handlePointerPosition(lastPointerX, lastPointerY, 'mouse')
  }

  syncSidebarResizerValue()
  window.addEventListener('pointermove', handlePointerMove, { passive: true })
  window.addEventListener('blur', handlePointerLeave)
  document.documentElement.addEventListener('pointerenter', handlePointerMove, { passive: true })
  document.documentElement.addEventListener('pointerleave', handlePointerLeave)
  sidebarResizer.addEventListener('pointerdown', handleResizePointerDown)
  sidebarResizer.addEventListener('pointermove', handleResizePointerMove)
  sidebarResizer.addEventListener('pointerup', finishResize)
  sidebarResizer.addEventListener('pointercancel', finishResize)
  sidebarResizer.addEventListener('keydown', handleResizeKeydown)
  sidebarResizer.addEventListener('focus', handleResizeFocus)
  sidebarResizer.addEventListener('blur', handleResizeBlur)

  currentState.sidebarInteractionCleanup = () => {
    clearCollapseTimer()
    if (resizeFrame !== undefined)
      cancelAnimationFrame(resizeFrame)
    resizeFrame = undefined
    if (pointerTrackingFrame !== undefined)
      cancelAnimationFrame(pointerTrackingFrame)
    pointerTrackingFrame = undefined
    pendingPointerPosition = undefined
    pendingSidebarWidth = undefined
    lastPointerEvent = undefined
    if (resizingPointerId !== undefined && sidebarResizer.hasPointerCapture(resizingPointerId))
      sidebarResizer.releasePointerCapture(resizingPointerId)
    resizingPointerId = undefined
    window.removeEventListener('pointermove', handlePointerMove)
    window.removeEventListener('blur', handlePointerLeave)
    document.documentElement.removeEventListener('pointerenter', handlePointerMove)
    document.documentElement.removeEventListener('pointerleave', handlePointerLeave)
    sidebarResizer.removeEventListener('pointerdown', handleResizePointerDown)
    sidebarResizer.removeEventListener('pointermove', handleResizePointerMove)
    sidebarResizer.removeEventListener('pointerup', finishResize)
    sidebarResizer.removeEventListener('pointercancel', finishResize)
    sidebarResizer.removeEventListener('keydown', handleResizeKeydown)
    sidebarResizer.removeEventListener('focus', handleResizeFocus)
    sidebarResizer.removeEventListener('blur', handleResizeBlur)
    delete root.dataset.sidebarHoverExpanded
    clearSidebarEdgeRevealSuppression(currentState)
    delete root.dataset.sidebarManuallyClosed
    delete root.dataset.sidebarResizing
  }
}
