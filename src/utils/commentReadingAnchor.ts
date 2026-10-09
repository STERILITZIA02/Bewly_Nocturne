import { waitWithSignal } from './abort'
import { getScrollIntent, scrollToPosition } from './scrollIntent'

function parentOf(element: HTMLElement): HTMLElement | null {
  const root = element.getRootNode()
  return element.parentElement ?? (root instanceof ShadowRoot && root.host instanceof HTMLElement ? root.host : null)
}

export function commentScrollAncestors(element: HTMLElement) {
  const result: HTMLElement[] = []
  for (let parent = parentOf(element); parent; parent = parentOf(parent)) {
    if (/auto|scroll/.test(getComputedStyle(parent).overflowY))
      result.push(parent)
  }
  const page = element.ownerDocument.scrollingElement
  if (page instanceof HTMLElement && !result.includes(page))
    result.push(page)
  return result
}

/** A short-lived restoration lease; user input always takes precedence. */
export function captureCommentReadingAnchor(anchor: HTMLElement, inner?: HTMLElement, ownerSignal?: AbortSignal) {
  const controller = new AbortController()
  const { signal } = controller
  const outer = commentScrollAncestors(anchor).filter(element => element !== inner)
  const elements = [...outer, ...(inner ? [inner] : [])].map(element => ({ element, top: element.scrollTop, left: element.scrollLeft, intent: getScrollIntent(element).version }))
  const top = anchor.getBoundingClientRect().top
  const innerRect = inner?.getBoundingClientRect()
  const innerAnchor = inner && innerRect
    ? Array.from(inner.children)
      .filter((element): element is HTMLElement => element instanceof HTMLElement && getComputedStyle(element).position !== 'absolute')
      .map(element => ({ element, rect: element.getBoundingClientRect() }))
      .filter(({ rect }) => rect.height > 0 && rect.bottom > innerRect.top + inner.clientTop && rect.top < innerRect.bottom)
      .sort((left, right) => left.rect.top - right.rect.top)[0]
    : undefined
  let frame: number | undefined
  const cancel = () => {
    controller.abort()
    if (frame !== undefined)
      cancelAnimationFrame(frame)
    frame = undefined
    ownerSignal?.removeEventListener('abort', cancel)
  }
  for (const name of ['wheel', 'touchstart', 'pointerdown', 'keydown'])
    window.addEventListener(name, cancel, { capture: true, passive: true, signal })
  ownerSignal?.addEventListener('abort', cancel, { once: true })
  if (ownerSignal?.aborted)
    cancel()
  const nextFrame = () => waitWithSignal(new Promise<void>((resolve) => {
    frame = requestAnimationFrame(() => {
      frame = undefined
      resolve()
    })
  }), signal)
  return {
    cancel,
    async restore(isCurrent: () => boolean = () => true) {
      try {
        await nextFrame()
        await nextFrame()
        if (signal.aborted || !isCurrent() || !anchor.isConnected
          || elements.some(({ element, intent }) => !element.isConnected || getScrollIntent(element).version !== intent)) {
          return
        }
        for (const { element, left, top } of elements) {
          element.scrollLeft = left
          scrollToPosition(element, top)
        }
        if (inner && innerRect && innerAnchor?.element.isConnected && inner.contains(innerAnchor.element)) {
          const delta = innerAnchor.element.getBoundingClientRect().top - inner.getBoundingClientRect().top - (innerAnchor.rect.top - innerRect.top)
          if (Math.abs(delta) > 0.5)
            scrollToPosition(inner, inner.scrollTop + delta)
        }
        const delta = anchor.getBoundingClientRect().top - top
        if (outer[0] && Math.abs(delta) > 0.5)
          scrollToPosition(outer[0], outer[0].scrollTop + delta)
      }
      catch { /* A later user scroll, route or disclosure owns the viewport now. */ }
      finally { cancel() }
    },
  }
}
