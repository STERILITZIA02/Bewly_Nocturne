import { onMounted, onScopeDispose, readonly, ref, watch } from 'vue'

import type { ConversationScrollMetrics } from './conversationExpansion'
import { isConversationAtLatest } from './conversationExpansion'

const SCROLL_EDGE_THRESHOLD = 48
interface VisibleMessageAnchor { id: string, offset: number }

function readScrollMetrics(viewport: HTMLElement): ConversationScrollMetrics {
  return { clientHeight: viewport.clientHeight, scrollHeight: viewport.scrollHeight, scrollTop: viewport.scrollTop }
}
function readVerticalScrollPadding(viewport: HTMLElement) {
  const style = getComputedStyle(viewport)
  return (Number.parseFloat(style.paddingTop) || 0) + (Number.parseFloat(style.paddingBottom) || 0)
}
function isMetricsAtLatest(metrics: ConversationScrollMetrics) {
  return metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight <= SCROLL_EDGE_THRESHOLD
}
function captureVisibleMessageAnchor(viewport: HTMLElement): VisibleMessageAnchor | null {
  const top = viewport.getBoundingClientRect().top
  for (const element of Array.from(viewport.querySelectorAll<HTMLElement>('[data-message-id]'))) {
    const rect = element.getBoundingClientRect()
    if (rect.bottom > top)
      return { id: element.dataset.messageId ?? '', offset: rect.top - top }
  }
  return null
}
function restoreVisibleMessageAnchor(viewport: HTMLElement, anchor: VisibleMessageAnchor | null) {
  if (!anchor?.id)
    return false
  const target = Array.from(viewport.querySelectorAll<HTMLElement>('[data-message-id]')).find(element => element.dataset.messageId === anchor.id)
  if (!target)
    return false
  const nextOffset = target.getBoundingClientRect().top - viewport.getBoundingClientRect().top
  viewport.scrollTop += nextOffset - anchor.offset
  return true
}

/** Reading intent and geometry only; the existing reader still owns messages and ACKs. */
export function useConversationViewport(options: {
  active: () => boolean
  ready: () => boolean
  canProcess: () => boolean
  talkerId: () => string
  save: (talkerId: string, position: { atLatest: boolean, scrollTop: number }) => void
  onFrame: (atLatest: boolean, shouldLoadOlder: boolean) => void
}) {
  const messageScrollRef = ref<HTMLElement | null>(null)
  const isAtLatestPosition = ref(true)
  let mounted = false
  let generation = 0
  let frame: number | null = null
  let gestureEndFrame: number | null = null
  let gestureListeners: AbortController | null = null
  let userHasReadUpward = false
  let userRequestedLatest = false
  let directGesture = false
  let gestureY: number | null = null
  let lastScrollTop = 0

  function isAtLatest() {
    const viewport = messageScrollRef.value
    return !!viewport && isConversationAtLatest({
      physicalAtLatest: isMetricsAtLatest(readScrollMetrics(viewport)),
      requestedLatest: userRequestedLatest,
      userHasReadUpward,
    })
  }
  function saveViewportState(metrics?: ConversationScrollMetrics, atLatestOverride?: boolean, savedTalkerId = options.talkerId()) {
    const viewport = messageScrollRef.value
    if (!viewport || !options.ready())
      return
    const current = metrics ?? readScrollMetrics(viewport)
    options.save(savedTalkerId, { atLatest: atLatestOverride ?? (isAtLatestPosition.value && isMetricsAtLatest(current)), scrollTop: current.scrollTop })
  }
  function processScrollFrame() {
    frame = null
    const viewport = messageScrollRef.value
    if (!viewport || !mounted || !options.active() || !options.ready() || !options.canProcess())
      return
    const metrics = readScrollMetrics(viewport)
    lastScrollTop = metrics.scrollTop
    const atLatest = isAtLatest()
    isAtLatestPosition.value = atLatest
    saveViewportState(metrics, atLatest)
    if (atLatest) {
      userHasReadUpward = false
      userRequestedLatest = false
    }
    options.onFrame(atLatest, userHasReadUpward && metrics.scrollTop <= SCROLL_EDGE_THRESHOLD)
  }
  function scheduleScrollFrame() {
    if (mounted && options.active() && frame === null)
      frame = requestAnimationFrame(processScrollFrame)
  }
  function applyReadingDirection(upward: boolean) {
    generation++
    if (upward) {
      userHasReadUpward = true
      userRequestedLatest = false
    }
    else {
      userRequestedLatest = true
    }
  }
  function getGestureY(event: PointerEvent | TouchEvent) {
    return event instanceof PointerEvent ? event.clientY : event.touches[0]?.clientY ?? event.changedTouches[0]?.clientY ?? null
  }
  function markReadingIntent(event: Event) {
    let upward = true
    if (event instanceof WheelEvent) {
      upward = event.deltaY < 0
    }
    else if (event instanceof KeyboardEvent) {
      if (!['ArrowDown', 'ArrowUp', 'End', 'Home', 'PageDown', 'PageUp'].includes(event.key))
        return
      upward = ['ArrowUp', 'Home', 'PageUp'].includes(event.key)
    }
    else if (event instanceof PointerEvent || event instanceof TouchEvent) {
      if (gestureEndFrame !== null)
        cancelAnimationFrame(gestureEndFrame)
      gestureEndFrame = null
      directGesture = true
      gestureY = getGestureY(event)
      scheduleScrollFrame()
      return
    }
    directGesture = false
    gestureY = null
    applyReadingDirection(upward)
    scheduleScrollFrame()
  }
  function handleDirectGestureMove(event: PointerEvent | TouchEvent) {
    if (!directGesture)
      return
    const nextY = getGestureY(event)
    const previousY = gestureY
    gestureY = nextY
    if (nextY === null || previousY === null || Math.abs(nextY - previousY) <= 1 || (event instanceof PointerEvent && event.pointerType === 'mouse'))
      return
    applyReadingDirection(nextY > previousY)
    scheduleScrollFrame()
  }
  function endDirectScrollGesture() {
    if (gestureEndFrame === null) {
      gestureEndFrame = requestAnimationFrame(() => {
        gestureEndFrame = null
        directGesture = false
        gestureY = null
      })
    }
    scheduleScrollFrame()
  }
  function handleScroll() {
    const viewport = messageScrollRef.value
    if (viewport && directGesture) {
      if (viewport.scrollTop < lastScrollTop - 1)
        applyReadingDirection(true)
      else if (viewport.scrollTop > lastScrollTop + 1)
        applyReadingDirection(false)
      lastScrollTop = viewport.scrollTop
    }
    scheduleScrollFrame()
  }
  function scrollToLatest(behavior: ScrollBehavior = 'auto') {
    const viewport = messageScrollRef.value
    if (!viewport || !options.ready())
      return
    generation++
    directGesture = false
    userHasReadUpward = false
    userRequestedLatest = true
    lastScrollTop = viewport.scrollTop
    viewport.scrollTo({ top: viewport.scrollHeight, behavior: behavior === 'smooth' && window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : behavior })
    const metrics = readScrollMetrics(viewport)
    isAtLatestPosition.value = isMetricsAtLatest(metrics)
    saveViewportState(metrics)
    scheduleScrollFrame()
  }
  function restorePosition(atLatest: boolean, scrollTop: number) {
    if (atLatest) {
      scrollToLatest()
    }
    else if (messageScrollRef.value) {
      userHasReadUpward = true
      isAtLatestPosition.value = false
      messageScrollRef.value.scrollTop = scrollTop
      lastScrollTop = scrollTop
    }
    userRequestedLatest = false
  }
  function captureReadingAnchor() {
    const viewport = messageScrollRef.value
    if (!viewport)
      return null
    const requestGeneration = generation
    const anchor = captureVisibleMessageAnchor(viewport)
    const oldScrollHeight = viewport.scrollHeight
    const oldScrollTop = viewport.scrollTop
    const oldPadding = readVerticalScrollPadding(viewport)
    const isCurrent = () => generation === requestGeneration && viewport === messageScrollRef.value
    return { isCurrent, restore() {
      if (viewport !== messageScrollRef.value)
        return
      if (isCurrent() && !restoreVisibleMessageAnchor(viewport, anchor)) {
        const paddingGrowth = readVerticalScrollPadding(viewport) - oldPadding
        const messageContentGrowth = Math.max(0, viewport.scrollHeight - oldScrollHeight - paddingGrowth)
        viewport.scrollTop = oldScrollTop + messageContentGrowth
      }
      lastScrollTop = viewport.scrollTop
      saveViewportState()
    } }
  }
  function resetReading() {
    generation++
    if (frame !== null)
      cancelAnimationFrame(frame)
    if (gestureEndFrame !== null)
      cancelAnimationFrame(gestureEndFrame)
    frame = gestureEndFrame = null
    userHasReadUpward = userRequestedLatest = directGesture = false
    gestureY = null
    lastScrollTop = 0
    isAtLatestPosition.value = true
  }
  watch(options.active, (active) => {
    gestureListeners?.abort()
    gestureListeners = null
    if (!active) {
      resetReading()
      return
    }
    gestureListeners = new AbortController()
    for (const name of ['pointercancel', 'pointerup', 'touchcancel', 'touchend'])
      window.addEventListener(name, endDirectScrollGesture, { passive: true, signal: gestureListeners.signal })
  }, { immediate: true })
  onMounted(() => {
    mounted = true
  })
  onScopeDispose(() => {
    mounted = false
    gestureListeners?.abort()
    resetReading()
  })
  return {
    messageScrollRef,
    isAtLatestPosition: readonly(isAtLatestPosition),
    get interactionGeneration() { return generation },
    isAtLatest,
    saveViewportState,
    scrollToLatest,
    scheduleScrollFrame,
    markReadingIntent,
    handleDirectGestureMove,
    endDirectScrollGesture,
    handleScroll,
    captureReadingAnchor,
    resetReading,
    restorePosition,
    stopAutomaticHistory: () => { userHasReadUpward = false },
  }
}
