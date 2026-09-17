const intents = new WeakMap<HTMLElement, { version: number, finish?: () => void }>()
const SMOOTH_SCROLL_DEADLINE_MS = 3_000

export function getScrollIntent(element: HTMLElement) {
  const intent = intents.get(element)
  return { version: intent?.version ?? 0, active: Boolean(intent?.finish) }
}

export function cancelScrollIntent(element: HTMLElement) {
  intents.get(element)?.finish?.()
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
