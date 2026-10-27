import { prefersReducedMotion } from '~/utils/reducedMotion'

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
  element.addEventListener('pointerdown', bump, { passive: true })
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
  if (!ownsScrollPosition(element, claim))
    return false
  const current = element.scrollTop
  const maxTop = Math.max(0, element.scrollHeight - element.clientHeight)
  return current < claim.top - 1 && claim.top <= maxTop + 1
}

export function ownsScrollPosition(element: HTMLElement, claim: ScrollPositionClaim) {
  const intent = intents.get(element)
  return !intent?.finish && (intent?.version ?? 0) === claim.intentVersion && trackUserScrollInput(element).version === claim.inputVersion
}

export interface ScrollCardAnchor {
  position: ScrollPositionClaim
  candidates: Array<{ key: string, offset: number }>
}

/** Offsets are content coordinates measured by the caller's existing layout pass. */
export function claimScrollCardAnchor(element: HTMLElement, cards: Array<{ key: string, top: number }>): ScrollCardAnchor {
  const position = claimScrollPosition(element)
  const candidates = cards.map(card => ({ key: card.key, offset: card.top - position.top }))
    .sort((a, b) => Math.abs(a.offset) - Math.abs(b.offset))
    .slice(0, 6)
  return { position, candidates }
}

export function resolveScrollCardAnchor(element: HTMLElement, anchor: ScrollCardAnchor, offsetOf: (key: string) => number | undefined) {
  if (!ownsScrollPosition(element, anchor.position) || Math.abs(element.scrollTop - anchor.position.top) > 1)
    return
  for (const candidate of anchor.candidates) {
    const top = offsetOf(candidate.key)
    if (top !== undefined)
      return Math.max(0, top - candidate.offset)
  }
}

/**
 * Shared by explicit navigation and restoration; geometry must not compete with it.
 * Resolves once the scroll settles (a smooth glide ends, is interrupted or times out).
 */
export function scrollToPosition(element: HTMLElement, top: number, behavior: ScrollBehavior = 'auto') {
  cancelScrollIntent(element)
  const state = { version: (intents.get(element)?.version ?? 0) + 1, finish: undefined as (() => void) | undefined }
  intents.set(element, state)
  if (element.scrollTop === top)
    return Promise.resolve()
  if (behavior === 'smooth' && prefersReducedMotion())
    behavior = 'instant'
  if (behavior !== 'smooth') {
    element.scrollTo({ top, behavior })
    return Promise.resolve()
  }
  const end = Math.max(0, Math.min(top, element.scrollHeight - element.clientHeight))
  // A clamped or subpixel no-op emits no scrollend in Chromium.
  if (Math.abs(element.scrollTop - end) <= 1)
    return Promise.resolve()
  return new Promise<void>((resolve) => {
    let timer: ReturnType<typeof setTimeout>
    const scrollTarget = element === element.ownerDocument.scrollingElement ? element.ownerDocument : element
    // A long glide would lay out and paint every screen in between (each one
    // new cards in a windowed list): it starts one screen from the target.
    const reach = element.clientHeight
    const jump = reach > 0 && Math.abs(element.scrollTop - end) > reach * 2
    // That jump ends a scroll of its own; then only the glide reaching the target settles.
    function settle() {
      if (!jump || Math.abs(element.scrollTop - end) <= 1)
        finish()
    }
    function finish() {
      clearTimeout(timer)
      scrollTarget.removeEventListener('scrollend', settle)
      for (const name of ['wheel', 'touchstart', 'pointerdown', 'keydown'])
        element.removeEventListener(name, finish)
      if (intents.get(element) === state) {
        state.finish = undefined
        state.version++
      }
      resolve()
    }
    timer = setTimeout(finish, SMOOTH_SCROLL_DEADLINE_MS)
    state.finish = finish
    scrollTarget.addEventListener('scrollend', settle, { passive: true })
    for (const name of ['wheel', 'touchstart', 'pointerdown', 'keydown'])
      element.addEventListener(name, finish, { passive: true })
    if (jump)
      element.scrollTop = end + (element.scrollTop > end ? reach : -reach)
    element.scrollTo({ top, behavior })
  })
}
