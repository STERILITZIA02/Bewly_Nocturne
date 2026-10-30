import { useResizeObserver } from '@vueuse/core'
import type { MaybeRefOrGetter, Ref } from 'vue'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, toValue, watch } from 'vue'

import type { MotionScope } from '~/utils/motionPriority'
import { holdMotion } from '~/utils/motionPriority'
import { getTravelDuration } from '~/utils/motionTiming'
import { landingResponse, SPRING_VISIBLE_LANDING, stepCriticalSpring } from '~/utils/spring'

import { useReducedMotion } from './useReducedMotion'

export interface LiquidSegmentRect {
  x: number
  y: number
  width: number
  height: number
}

interface LiquidSegmentMeasurementBox {
  left: number
  top: number
  width: number
  height: number
}

/**
 * Converts viewport measurements back into the untransformed coordinate space
 * of the segmented-control container.
 */
function calculateLiquidSegmentRect({
  containerBox,
  containerLayoutWidth,
  containerLayoutHeight,
  itemBox,
  clientLeft,
  clientTop,
  scrollLeft,
  scrollTop,
}: {
  containerBox: LiquidSegmentMeasurementBox
  containerLayoutWidth: number
  containerLayoutHeight: number
  itemBox: LiquidSegmentMeasurementBox
  clientLeft: number
  clientTop: number
  scrollLeft: number
  scrollTop: number
}): LiquidSegmentRect {
  const scaleX = containerLayoutWidth > 0 ? containerBox.width / containerLayoutWidth : 1
  const scaleY = containerLayoutHeight > 0 ? containerBox.height / containerLayoutHeight : 1
  const normalizedScaleX = Number.isFinite(scaleX) && scaleX > 0 ? scaleX : 1
  const normalizedScaleY = Number.isFinite(scaleY) && scaleY > 0 ? scaleY : 1

  return {
    x: (itemBox.left - containerBox.left) / normalizedScaleX - clientLeft + scrollLeft,
    y: (itemBox.top - containerBox.top) / normalizedScaleY - clientTop + scrollTop,
    width: itemBox.width / normalizedScaleX,
    height: itemBox.height / normalizedScaleY,
  }
}

/** Duration of a one-item move; longer travel scales up via `getTravelDuration`. */
export const LIQUID_MOVE_DURATION_MS = 220
/** The leading edge's spring response relative to the trailing edge's. */
const LEADING_EDGE_RESPONSE = 0.7

/** Travel measured in items along the move axis, so wide tabs count as one step. */
function getLiquidTravelSteps(from: LiquidSegmentRect, to: LiquidSegmentRect) {
  const dx = Math.abs((to.x + to.width / 2) - (from.x + from.width / 2))
  const dy = Math.abs((to.y + to.height / 2) - (from.y + from.height / 2))
  const horizontal = dx >= dy
  const itemSize = horizontal ? (from.width + to.width) / 2 : (from.height + to.height) / 2
  return itemSize > 0 ? (horizontal ? dx : dy) / itemSize : 1
}

interface Edge {
  position: number
  velocity: number
  target: number
  response: number
}

type Edges = Record<'left' | 'right' | 'top' | 'bottom', Edge>

function edgesOf(rect: LiquidSegmentRect): Edges {
  const edge = (position: number): Edge => ({ position, velocity: 0, target: position, response: 1 })
  return { left: edge(rect.x), right: edge(rect.x + rect.width), top: edge(rect.y), bottom: edge(rect.y + rect.height) }
}

function rectOf(edges: Edges): LiquidSegmentRect {
  return {
    x: edges.left.position,
    y: edges.top.position,
    width: Math.max(0, edges.right.position - edges.left.position),
    height: Math.max(0, edges.bottom.position - edges.top.position),
  }
}

/**
 * Sliding liquid indicator for segmented controls / dock. Each edge rides its
 * own critically damped spring; the edge in the direction of travel answers
 * faster, so the capsule stretches ahead and the trailing edge catches up. A
 * new target keeps every edge's position and velocity, and the springs advance
 * by real elapsed time, so the motion is the same at any refresh rate.
 */
export function useLiquidSegmentIndicator(options: {
  containerRef: Ref<HTMLElement | null | undefined>
  indicatorRef: Ref<HTMLElement | null | undefined>
  activeKey: MaybeRefOrGetter<unknown>
  itemSelector?: string
  activeItemSelector?: string
  /** Content swaps of this scope wait for the slide; without one nothing waits. */
  motionScope?: MotionScope
}) {
  const itemSelector = options.itemSelector ?? '[data-segment-item]'
  const activeItemSelector = options.activeItemSelector ?? `${itemSelector}[data-active="true"]`

  const visible = ref(false)
  const isMoving = ref(false)

  let edges: Edges | undefined
  let rafId: number | undefined
  let lastFrame = 0
  let measureFrameId: number | undefined
  let pendingImmediateMeasure = false
  let disposed = false
  let releaseMotionHold: (() => void) | undefined
  const prefersReducedMotion = useReducedMotion()

  // Content swaps of `motionScope` wait until the slide has visibly landed (see utils/motionPriority).
  function holdSlide(duration: number) {
    if (!options.motionScope)
      return
    const previous = releaseMotionHold
    releaseMotionHold = holdMotion(duration * SPRING_VISIBLE_LANDING, options.motionScope)
    previous?.()
  }

  function releaseSlide() {
    releaseMotionHold?.()
    releaseMotionHold = undefined
  }

  // Only the rarely changing visibility goes through Vue; geometry is written
  // straight to the element once a frame.
  const indicatorStyle = computed(() => ({ opacity: visible.value ? '1' : '0' }))

  function paint() {
    const element = options.indicatorRef.value
    if (!element || !edges)
      return
    const { x, y, width, height } = rectOf(edges)
    element.style.width = `${width}px`
    element.style.height = `${height}px`
    element.style.transform = `translate3d(${x}px, ${y}px, 0)`
  }

  function cancelRaf() {
    if (rafId !== undefined) {
      cancelAnimationFrame(rafId)
      rafId = undefined
    }
  }

  function cancelMeasureFrame() {
    if (measureFrameId !== undefined) {
      cancelAnimationFrame(measureFrameId)
      measureFrameId = undefined
    }
  }

  function settle(rect: LiquidSegmentRect) {
    cancelRaf()
    edges = edgesOf(rect)
    paint()
    isMoving.value = false
    releaseSlide()
  }

  function tick(time: number) {
    if (!edges)
      return
    const seconds = Math.max(0, (time - lastFrame) / 1000)
    lastFrame = time
    let settled = true
    for (const edge of Object.values(edges)) {
      const next = stepCriticalSpring(edge.position, edge.velocity, edge.target, seconds, edge.response)
      edge.position = next.position
      edge.velocity = next.velocity
      if (Math.abs(edge.target - edge.position) > 0.1 || Math.abs(edge.velocity) > 1)
        settled = false
    }
    if (settled) {
      rafId = undefined
      const { left, right, top, bottom } = edges
      settle({ x: left.target, y: top.target, width: right.target - left.target, height: bottom.target - top.target })
      return
    }
    paint()
    rafId = requestAnimationFrame(tick)
  }

  function slideTo(to: LiquidSegmentRect) {
    if (!edges)
      return
    const from = rectOf(edges)
    const travel = getTravelDuration(LIQUID_MOVE_DURATION_MS, getLiquidTravelSteps(from, to)) / 1000
    holdSlide(travel * 1000)
    isMoving.value = true
    // Per axis, the edge on the side the capsule is heading answers faster.
    const aim = (near: Edge, far: Edge, nearTarget: number, farTarget: number) => {
      const direction = Math.sign((nearTarget + farTarget) - (near.position + far.position))
      near.target = nearTarget
      far.target = farTarget
      const response = landingResponse(travel)
      near.response = direction < 0 ? response * LEADING_EDGE_RESPONSE : response
      far.response = direction > 0 ? response * LEADING_EDGE_RESPONSE : response
    }
    aim(edges.left, edges.right, to.x, to.x + to.width)
    aim(edges.top, edges.bottom, to.y, to.y + to.height)
    if (rafId === undefined) {
      lastFrame = performance.now()
      rafId = requestAnimationFrame(tick)
    }
  }

  function readItemRect(container: HTMLElement, el: HTMLElement): LiquidSegmentRect {
    const containerBox = container.getBoundingClientRect()
    const itemBox = el.getBoundingClientRect()
    return calculateLiquidSegmentRect({
      containerBox,
      containerLayoutWidth: container.offsetWidth,
      containerLayoutHeight: container.offsetHeight,
      itemBox,
      clientLeft: container.clientLeft,
      clientTop: container.clientTop,
      scrollLeft: container.scrollLeft,
      scrollTop: container.scrollTop,
    })
  }

  function measure(immediate = false) {
    const container = options.containerRef.value
    const activeEl = container?.querySelector(activeItemSelector) as HTMLElement | null
    if (!container || !activeEl) {
      cancelRaf()
      releaseSlide()
      visible.value = false
      isMoving.value = false
      return
    }

    const activeRect = readItemRect(container, activeEl)
    if (immediate || prefersReducedMotion.value || !edges || !visible.value) {
      settle(activeRect)
      visible.value = true
      return
    }

    // Same target as the springs already hold: nothing to start.
    const current = edges
    const unchanged = Math.abs(current.left.target - activeRect.x) <= 0.5
      && Math.abs(current.top.target - activeRect.y) <= 0.5
      && Math.abs(current.right.target - (activeRect.x + activeRect.width)) <= 0.5
      && Math.abs(current.bottom.target - (activeRect.y + activeRect.height)) <= 0.5
    if (unchanged) {
      if (rafId === undefined)
        settle(activeRect)
      return
    }
    slideTo(activeRect)
  }

  async function updateIndicator(immediate = false) {
    pendingImmediateMeasure ||= immediate
    await nextTick()
    if (disposed)
      return

    // One coalesced frame is enough after Vue has patched data-active. The old
    // nested rAF added visible input latency and allowed stale measurements to
    // race with newer tab selections.
    cancelMeasureFrame()
    measureFrameId = requestAnimationFrame(() => {
      measureFrameId = undefined
      const shouldMeasureImmediately = pendingImmediateMeasure
      pendingImmediateMeasure = false
      measure(shouldMeasureImmediately)
    })
  }

  watch(prefersReducedMotion, (reduced) => {
    if (reduced)
      void updateIndicator(true)
  })

  watch(() => toValue(options.activeKey), () => {
    // The slide starts a frame later; hold now so a swap triggered by the same
    // input already sees the slide when it schedules its fade.
    if (edges && visible.value && !prefersReducedMotion.value)
      holdSlide(LIQUID_MOVE_DURATION_MS)
    void updateIndicator(false)
  })

  useResizeObserver(options.containerRef, () => {
    void updateIndicator(true)
  })

  onMounted(() => {
    void updateIndicator(true)
  })

  onBeforeUnmount(() => {
    disposed = true
    cancelMeasureFrame()
    cancelRaf()
    releaseSlide()
  })

  return {
    indicatorStyle,
    isMoving,
    updateIndicator,
  }
}
