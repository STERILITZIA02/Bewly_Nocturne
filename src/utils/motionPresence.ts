import type { TransitionProps } from 'vue'

interface RetiredFrame {
  inert: boolean
  hidden: string | null
  style: string | null
}

const retired = new WeakMap<HTMLElement, RetiredFrame>()

export function restoreRetiringElement(element: Element) {
  if (!(element instanceof HTMLElement))
    return
  const frame = retired.get(element)
  if (!frame)
    return
  element.inert = frame.inert
  if (frame.hidden === null)
    element.removeAttribute('aria-hidden')
  else element.setAttribute('aria-hidden', frame.hidden)
  if (frame.style === null)
    element.removeAttribute('style')
  else element.setAttribute('style', frame.style)
  retired.delete(element)
}

function retire(element: Element, absolute: boolean) {
  if (!(element instanceof HTMLElement))
    return
  restoreRetiringElement(element)
  retired.set(element, { inert: element.inert, hidden: element.getAttribute('aria-hidden'), style: element.getAttribute('style') })
  element.inert = true
  element.setAttribute('aria-hidden', 'true')
  if (!absolute)
    return
  const rect = element.getBoundingClientRect()
  const parent = element.offsetParent as HTMLElement | null
  if (!parent)
    return
  const origin = parent.getBoundingClientRect()
  Object.assign(element.style, {
    position: 'absolute',
    top: `${rect.top - origin.top + parent.scrollTop - parent.clientTop}px`,
    left: `${rect.left - origin.left + parent.scrollLeft - parent.clientLeft}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    boxSizing: 'border-box',
    margin: '0',
  })
}

/** Leaving UI is visible until its transition ends, but never remains interactive. */
export const retiringTransition: TransitionProps = {
  onBeforeLeave: element => retire(element, false),
  onAfterLeave: restoreRetiringElement,
  onLeaveCancelled: restoreRetiringElement,
  onBeforeEnter: restoreRetiringElement,
}

/** TransitionGroup owns the surviving rows' FLIP; freeze only the departing row. */
export const retiringListTransition: TransitionProps = {
  ...retiringTransition,
  onBeforeLeave: element => retire(element, true),
}
