import { getMotionDuration } from '~/utils/motionTiming'

const SVG_NS = 'http://www.w3.org/2000/svg'

/** Shared geometry for `LoadingRing.vue` and DOM-built loading views. */
export const LOADING_RING_SVG = { viewBox: '0 0 24 24', focusable: 'false', 'aria-hidden': 'true' } as const
export const LOADING_RING_ARC = { cx: '12', cy: '12', r: '9', pathLength: '100' } as const

/**
 * The same 3/4 arc as a CSS mask, for native loaders restyled without DOM of
 * ours (comment spinners, the player's loading panel): paint `currentColor`
 * or a fill through it and spin it with `bew-loading-ring-spin`.
 */
export const LOADING_RING_MASK = `url("data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' viewBox='${LOADING_RING_SVG.viewBox}'><circle cx='${LOADING_RING_ARC.cx}' cy='${LOADING_RING_ARC.cy}' r='${LOADING_RING_ARC.r}' pathLength='${LOADING_RING_ARC.pathLength}' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-dasharray='75 25'/></svg>`,
)}")`

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
