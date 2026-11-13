import type { Ref, WatchSource } from 'vue'
import { watch } from 'vue'

/**
 * Asks for the next page when a sentinel at the end of a list comes within
 * `margin` of its scroller's bottom. No scroll listener: the observer reports
 * crossings, and a page that still leaves the end in reach (`progress`
 * changed while near) asks again.
 */
export function useLoadMoreSentinel(
  root: Ref<HTMLElement | null | undefined>,
  sentinel: Ref<HTMLElement | null | undefined>,
  onReach: () => void,
  progress: WatchSource,
  margin = 400,
) {
  let near = false
  watch([root, sentinel], ([rootElement, target], _previous, onCleanup) => {
    near = false
    if (!rootElement || !target)
      return
    const observer = new IntersectionObserver(([entry]) => {
      near = entry.isIntersecting
      if (near)
        onReach()
    }, { root: rootElement, rootMargin: `0px 0px ${margin}px 0px` })
    observer.observe(target)
    onCleanup(() => observer.disconnect())
  }, { immediate: true, flush: 'post' })
  watch(progress, () => {
    if (near)
      onReach()
  }, { flush: 'post' })
}
