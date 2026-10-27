import { prefersReducedMotion } from '~/utils/reducedMotion'

import { holdAnimation } from './motionPriority'
import { getMotionDuration } from './motionTiming'
import { normalizeWheelDelta } from './wheelStep'

/** The furthest (px) content can be pulled past an edge. */
const STRETCH_LIMIT = 160
const RESISTANCE = 0.55
/** A pause this long (ms) in wheel input lets the content spring back. */
const RELEASE_DELAY = 100

/** Rubber band: the further past the edge, the less the content follows. */
export function rubberBand(distance: number) {
  return Math.sign(distance) * (1 - 1 / (Math.abs(distance) * RESISTANCE / STRETCH_LIMIT + 1)) * STRETCH_LIMIT
}

function inverseRubberBand(offset: number) {
  const band = Math.min(Math.abs(offset), STRETCH_LIMIT - 1)
  return Math.sign(offset) * band * STRETCH_LIMIT / (RESISTANCE * (STRETCH_LIMIT - band))
}

/**
 * Scrolls `scroller` horizontally from wheel and trackpad input (vertical wheels
 * included) and pulls `content` past either end with a rubber band that springs
 * back when the input pauses. Touch and keyboard scrolling stay native.
 */
export function createElasticWheelScroll(scroller: HTMLElement, content: HTMLElement) {
  /** Raw distance pushed past the edge; positive is past the end. */
  let stretch = 0
  let releaseTimer: ReturnType<typeof setTimeout> | undefined
  let settle: Animation | undefined

  function render() {
    content.style.translate = stretch ? `${-rubberBand(stretch)}px 0` : ''
  }

  function release() {
    releaseTimer = undefined
    if (!stretch)
      return
    const from = -rubberBand(stretch)
    stretch = 0
    render()
    if (typeof content.animate !== 'function' || prefersReducedMotion())
      return
    const style = getComputedStyle(content)
    settle = content.animate([{ translate: `${from}px 0` }, { translate: '0 0' }], {
      duration: getMotionDuration(style, '--bew-duration-moderate', 300),
      easing: style.getPropertyValue('--bew-ease-out').trim() || 'ease-out',
    })
    holdAnimation(settle)
  }

  /** Picks up a spring-back in flight from where it is drawn. */
  function interruptSettle() {
    if (!settle)
      return
    if (settle.playState === 'running')
      stretch = -inverseRubberBand(Number.parseFloat(getComputedStyle(content).translate) || 0)
    settle.cancel()
    settle = undefined
  }

  function handleWheel(event: WheelEvent) {
    if (event.ctrlKey || event.defaultPrevented)
      return
    const width = scroller.clientWidth
    const max = scroller.scrollWidth - width
    if (max <= 0)
      return
    const delta = normalizeWheelDelta(Math.abs(event.deltaX) >= Math.abs(event.deltaY) ? event.deltaX : event.deltaY, event.deltaMode, width)
    if (!delta)
      return
    event.preventDefault()
    interruptSettle()
    const left = scroller.scrollLeft
    if (prefersReducedMotion())
      stretch = 0

    let remaining = delta
    // Moving back toward the content first undoes the stretch.
    if (stretch && Math.sign(remaining) !== Math.sign(stretch)) {
      const next = stretch + remaining
      remaining = Math.sign(next) === Math.sign(stretch) ? 0 : next
      stretch = remaining ? 0 : next
    }
    if (remaining) {
      const target = left + remaining
      const clamped = Math.min(max, Math.max(0, target))
      if (clamped !== left)
        scroller.scrollLeft = clamped
      if (!prefersReducedMotion())
        stretch += target - clamped
    }
    render()
    clearTimeout(releaseTimer)
    releaseTimer = stretch ? setTimeout(release, RELEASE_DELAY) : undefined
  }

  function dispose() {
    clearTimeout(releaseTimer)
    settle?.cancel()
    stretch = 0
    render()
  }

  return { handleWheel, dispose }
}
