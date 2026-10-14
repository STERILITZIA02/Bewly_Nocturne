import type { Ref, WatchSource } from 'vue'
import { nextTick, onScopeDispose, watch } from 'vue'

import { getMotionDuration } from '../utils/motionTiming'

/** Same surface, new geometry. Never fades a glass shell or scales its text. */
export function useSurfaceMorph(root: Ref<HTMLElement | null>, source: WatchSource) {
  let animation: Animation | undefined
  let generation = 0
  const cancel = () => {
    generation++
    animation?.cancel()
    animation = undefined
  }
  watch(source, async () => {
    const element = root.value
    if (!element || !element.animate || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      cancel()
      return
    }
    const before = element.getBoundingClientRect()
    const beforeRadius = getComputedStyle(element).borderTopLeftRadius
    cancel()
    const version = generation
    await nextTick()
    if (version !== generation || root.value !== element || !element.isConnected)
      return
    // Commit the new CSS radius before measuring it; otherwise an existing CSS
    // radius transition reports its old/intermediate value as our destination.
    const previousTransition = element.style.transition
    element.style.transition = 'none'
    const after = element.getBoundingClientRect()
    const style = getComputedStyle(element)
    const radius = (value: string, rect: DOMRect) => value.endsWith('%') ? Math.min(rect.width, rect.height) * Number.parseFloat(value) / 100 : Number.parseFloat(value)
    const targetRadius = radius(style.borderTopLeftRadius, after)
    element.style.transition = previousTransition
    animation = element.animate([
      { width: `${before.width}px`, maxWidth: `${before.width}px`, height: `${before.height}px`, minHeight: `${before.height}px`, translate: `${before.left - after.left}px ${before.top - after.top}px`, borderRadius: `${radius(beforeRadius, before)}px` },
      { width: `${after.width}px`, maxWidth: `${after.width}px`, height: `${after.height}px`, minHeight: `${after.height}px`, translate: '0 0', borderRadius: `${targetRadius}px` },
    ], {
      duration: getMotionDuration(style, '--bew-duration-normal'),
      easing: style.getPropertyValue('--bew-ease-standard').trim() || 'ease-out',
    })
    const current = animation
    void current.finished.catch(() => {}).then(() => {
      if (animation === current)
        animation = undefined
    })
  }, { flush: 'pre' })
  onScopeDispose(cancel)
}
