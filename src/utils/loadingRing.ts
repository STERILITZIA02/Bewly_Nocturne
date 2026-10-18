import { getMotionDuration } from '~/utils/motionTiming'

const SVG_NS = 'http://www.w3.org/2000/svg'

/** Shared geometry for `LoadingRing.vue` and DOM-built loading views. */
export const LOADING_RING_SVG = { viewBox: '0 0 24 24', focusable: 'false', 'aria-hidden': 'true' } as const
export const LOADING_RING_ARC = { cx: '12', cy: '12', r: '9', pathLength: '100' } as const

/** Builds the ring for views rendered outside Vue; styles come from `styles/loadingRing.scss`. */
export function createLoadingRingElement(doc: Document = document): SVGSVGElement {
  const ring = doc.createElementNS(SVG_NS, 'svg')
  ring.classList.add('bew-loading-ring')
  for (const [name, value] of Object.entries(LOADING_RING_SVG))
    ring.setAttribute(name, value)
  const arc = doc.createElementNS(SVG_NS, 'circle')
  arc.classList.add('bew-loading-ring__arc')
  for (const [name, value] of Object.entries(LOADING_RING_ARC))
    arc.setAttribute(name, value)
  ring.append(arc)
  return ring
}

/** Reads the close duration from the ring itself so reduced motion resolves to 0. */
export function getLoadingRingCloseDuration(ring: Element | undefined | null): number {
  if (!ring)
    return 0
  return getMotionDuration(getComputedStyle(ring), '--bew-loading-ring-close-duration', 300)
}
