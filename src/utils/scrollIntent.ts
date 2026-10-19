const intents = new WeakMap<HTMLElement, { version: number, finish?: () => void }>()
const SMOOTH_SCROLL_DEADLINE_MS = 3_000

export function getScrollIntent(element: HTMLElement) {
  const intent = intents.get(element)
  return { version: intent?.version ?? 0, active: Boolean(intent?.finish) }
}

export function cancelScrollIntent(element: HTMLElement) {
  intents.get(element)?.finish?.()
}

const userInputs = new WeakMap<HTMLElement, { version: number }>()
const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '])

function trackUserScrollInput(element: HTMLElement) {
  let input = userInputs.get(element)
  if (input)
    return input
  const state = { version: 0 }
  const bump = () => state.version++
  element.addEventListener('wheel', bump, { passive: true })
  element.addEventListener('touchmove', bump, { passive: true })
  element.addEventListener('keydown', (event) => {
    if (SCROLL_KEYS.has(event.key))
      bump()
  }, { passive: true })
  userInputs.set(element, input = state)
  return input
}

export interface ScrollPositionClaim {
  top: number
  intentVersion: number
  inputVersion: number
}

/** Remember a position that a later layout commit may restore. */
export function claimScrollPosition(element: HTMLElement): ScrollPositionClaim {
  return { top: element.scrollTop, intentVersion: intents.get(element)?.version ?? 0, inputVersion: trackUserScrollInput(element).version }
}

/**
 * An explicit jump or another page's restore (both through `scrollToPosition`)
 * and any user scrolling since the claim take precedence over it. Without
 * either, an upward move is the browser clamping a temporarily shorter range;
 * restore it once the committed layout can hold the position again.
 */
export function canRestoreScrollPosition(element: HTMLElement, claim: ScrollPositionClaim) {
  const intent = intents.get(element)
  if (intent?.finish || (intent?.version ?? 0) !== claim.intentVersion || trackUserScrollInput(element).version !== claim.inputVersion)
    return false
  const current = element.scrollTop
  const maxTop = Math.max(0, element.scrollHeight - element.clientHeight)
  return current < claim.top - 1 && claim.top <= maxTop + 1
}

/** Shared by explicit navigation and restoration; geometry must not compete with it. */
export function scrollToPosition(element: HTMLElement, top: number, behavior: ScrollBehavior = 'auto') {
  cancelScrollIntent(element)
  const state = { version: (intents.get(element)?.version ?? 0) + 1, finish: undefined as (() => void) | undefined }
  intents.set(element, state)
  if (element.scrollTop === top)
    return
  if (behavior === 'smooth') {
    let timer: ReturnType<typeof setTimeout>
    const scrollTarget = element === element.ownerDocument.scrollingElement ? element.ownerDocument : element
    const finish = () => {
      clearTimeout(timer)
      scrollTarget.removeEventListener('scrollend', finish)
      for (const name of ['wheel', 'touchstart', 'pointerdown', 'keydown'])
        element.removeEventListener(name, finish)
      if (intents.get(element) === state) {
        state.finish = undefined
        state.version++
      }
    }
    timer = setTimeout(finish, SMOOTH_SCROLL_DEADLINE_MS)
    state.finish = finish
    scrollTarget.addEventListener('scrollend', finish, { passive: true })
    for (const name of ['wheel', 'touchstart', 'pointerdown', 'keydown'])
      element.addEventListener(name, finish, { passive: true })
  }
  element.scrollTo({ top, behavior })
}
