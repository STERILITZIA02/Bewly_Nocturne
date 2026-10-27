export interface ViewportGeometry {
  /** Bumped whenever scroll position, viewport size or committed layout changes. */
  version: number
  scrollTop: number
  clientHeight: number
  scrollHeight: number
  /** Viewport content-box top in client coordinates. */
  top: number
  scrollLeft: number
  clientWidth: number
  scrollWidth: number
  left: number
}

type ViewportListener = (geometry: ViewportGeometry, reason: ViewportFrameReason) => void
export type ViewportFrameReason = 'scroll' | 'layout'

interface ViewportState {
  version: number
  snapshot?: ViewportGeometry
  frame?: number
  pending?: ViewportFrameReason
  listeners: Set<ViewportListener>
  resizeObserver?: ResizeObserver
  release: () => void
}

const states = new WeakMap<HTMLElement, ViewportState>()

function isDocumentViewport(element: HTMLElement) {
  return element === element.ownerDocument.scrollingElement
}

function measure(element: HTMLElement, version: number): ViewportGeometry {
  const rect = isDocumentViewport(element) ? undefined : element.getBoundingClientRect()
  return {
    version,
    scrollTop: element.scrollTop,
    clientHeight: Math.max(1, element.clientHeight || window.innerHeight),
    scrollHeight: element.scrollHeight,
    top: rect ? rect.top + element.clientTop : 0,
    scrollLeft: element.scrollLeft,
    clientWidth: Math.max(1, element.clientWidth || window.innerWidth),
    scrollWidth: element.scrollWidth,
    left: rect ? rect.left + element.clientLeft : 0,
  }
}

function scheduleFrame(element: HTMLElement, state: ViewportState) {
  state.frame ??= requestAnimationFrame(() => {
    state.frame = undefined
    const reason = state.pending
    state.pending = undefined
    if (!reason || !state.listeners.size)
      return
    const geometry = readViewportGeometry(element)
    for (const listener of [...state.listeners])
      listener(geometry, reason)
  })
}

function change(element: HTMLElement, state: ViewportState, reason: ViewportFrameReason) {
  state.version++
  state.snapshot = undefined
  if (!state.listeners.size)
    return
  // A layout request outranks a plain scroll in the same frame.
  state.pending = state.pending === 'layout' ? 'layout' : reason
  scheduleFrame(element, state)
}

function ensureState(element: HTMLElement): ViewportState {
  const existing = states.get(element)
  if (existing)
    return existing
  const target: HTMLElement | Window = isDocumentViewport(element) ? window : element
  const state: ViewportState = { version: 0, listeners: new Set(), release: () => {} }
  const handleScroll = () => change(element, state, 'scroll')
  const handleResize = () => change(element, state, 'layout')
  state.release = () => {
    target.removeEventListener('scroll', handleScroll)
    window.removeEventListener('resize', handleResize)
    state.resizeObserver?.disconnect()
    if (state.frame !== undefined)
      cancelAnimationFrame(state.frame)
    states.delete(element)
  }
  target.addEventListener('scroll', handleScroll, { passive: true })
  window.addEventListener('resize', handleResize, { passive: true })
  if (typeof ResizeObserver !== 'undefined') {
    state.resizeObserver = new ResizeObserver(handleResize)
    state.resizeObserver.observe(element)
  }
  states.set(element, state)
  return state
}

/**
 * One measurement per scroll owner and round. App, grids, card windows and
 * feeds of the same viewport share it; separate scroll areas keep separate
 * snapshots. Scroll, resize, explicit layout commits and the end of the
 * current task drop it, so later DOM writes cannot keep stale geometry alive.
 * A viewport with no frame subscriber is measured directly.
 */
export function readViewportGeometry(element: HTMLElement): ViewportGeometry {
  const state = states.get(element)
  // Only subscribed owners keep listeners that can invalidate a cached snapshot.
  if (!state)
    return measure(element, 0)
  if (state.snapshot)
    return state.snapshot
  const snapshot = measure(element, state.version)
  state.snapshot = snapshot
  // Shared by every consumer in the current task (one frame dispatch, one
  // emitter round). A later DOM commit runs in a new microtask and re-reads.
  queueMicrotask(() => {
    if (state.snapshot === snapshot)
      state.snapshot = undefined
  })
  return snapshot
}

/**
 * Coalesce every consumer of a viewport into one frame callback. Scroll frames
 * report position changes; layout frames follow resizes and explicit commits
 * from `invalidateViewportGeometry`. Hidden documents defer until visible.
 */
export function subscribeViewportFrame(element: HTMLElement, listener: ViewportListener) {
  const state = ensureState(element)
  state.listeners.add(listener)
  return () => {
    state.listeners.delete(listener)
    if (!state.listeners.size && states.get(element) === state)
      state.release()
  }
}

/** Call after committing DOM that changes the viewport's scroll range or content position. */
export function invalidateViewportGeometry(element: HTMLElement | null | undefined) {
  const state = element && states.get(element)
  if (element && state)
    change(element, state, 'layout')
}

export function getRemainingScroll(geometry: ViewportGeometry) {
  return geometry.scrollHeight - geometry.clientHeight - geometry.scrollTop
}

/**
 * Border-box height from layout. Unlike a rect it ignores transforms on the
 * element and its ancestors, so a card's hover scale never inflates it.
 */
export function getLayoutHeight(element: HTMLElement) {
  const style = getComputedStyle(element)
  const height = Number.parseFloat(style.height) || 0
  if (style.boxSizing === 'border-box')
    return height
  return height + [style.paddingTop, style.paddingBottom, style.borderTopWidth, style.borderBottomWidth]
    .reduce((total, value) => total + (Number.parseFloat(value) || 0), 0)
}
