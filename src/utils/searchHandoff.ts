import { prefersReducedMotion } from '~/utils/reducedMotion'

import { holdAnimation, PAGE_MOTION } from './motionPriority'
import { getMotionDuration } from './motionTiming'

/** A departure older than this is not the counterpart of the next arrival. */
const HANDOFF_WINDOW_MS = 1500

let departure: { left: number, top: number, time: number } | undefined

/**
 * The home page search and the top bar search are separate instances in
 * different places. When one leaves on navigation, it records where it was; the
 * one that appears next slides in from there, so the box moves instead of
 * jumping. One measurement at each end.
 */
export function departSearchFrom(element: Element) {
  const rect = element.getBoundingClientRect()
  departure = { left: rect.left, top: rect.top, time: performance.now() }
}

export function arriveSearchAt(element: HTMLElement) {
  const from = departure
  departure = undefined
  if (!from || performance.now() - from.time > HANDOFF_WINDOW_MS || typeof element.animate !== 'function'
    || prefersReducedMotion()) {
    return
  }
  const to = element.getBoundingClientRect()
  const x = from.left - to.left
  const y = from.top - to.top
  if (!x && !y)
    return
  const style = getComputedStyle(element)
  holdAnimation(element.animate([{ translate: `${x}px ${y}px` }, { translate: '0 0' }], {
    duration: getMotionDuration(style, '--bew-sidebar-morph-duration', 300),
    easing: style.getPropertyValue('--bew-ease-standard').trim() || 'ease-out',
    // Compose with the element's own translate (the home dock's scroll animation).
    composite: 'add',
  }), PAGE_MOTION)
}
