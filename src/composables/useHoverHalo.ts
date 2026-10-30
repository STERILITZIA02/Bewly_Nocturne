import type { Ref } from 'vue'
import { onScopeDispose, ref } from 'vue'

import { getMotionDuration } from '~/utils/motionTiming'

// One halo leaves at a time: sweeping the pointer across a row starts a new
// fade on each card, and the older one, mostly faded already, unmounts then,
// so no more than two stacks of backdrop blur exist at once.
let leaving: (() => void) | undefined
// Read once: a computed-style read on every pointer crossing would force a style flush.
let fadeMs: number | undefined

/**
 * The hover halo of a bare card (`contentCard.hover-halo`): a ProgressiveBlur
 * mounted only while a mouse is over the card. It mounts a frame after the
 * pointer enters, so the first frame of the card's scale-up carries no new blur
 * layers, fades in and out over the card's own scale time, then unmounts.
 */
export function useHoverHalo(root: Ref<HTMLElement | null | undefined>) {
  const mounted = ref(false)
  const visible = ref(false)
  let frame: number | undefined
  let timer: ReturnType<typeof setTimeout> | undefined

  function unmount() {
    clearTimeout(timer)
    timer = undefined
    if (leaving === unmount)
      leaving = undefined
    mounted.value = false
  }

  function enter(event: PointerEvent) {
    if (event.pointerType !== 'mouse')
      return
    clearTimeout(timer)
    timer = undefined
    if (leaving === unmount)
      leaving = undefined
    if (mounted.value) {
      visible.value = true
      return
    }
    if (frame === undefined) {
      frame = requestAnimationFrame(() => {
        frame = undefined
        mounted.value = true
        visible.value = true
      })
    }
  }

  function leave() {
    if (frame !== undefined) {
      cancelAnimationFrame(frame)
      frame = undefined
    }
    visible.value = false
    if (!mounted.value || timer !== undefined)
      return
    if (leaving !== unmount)
      leaving?.()
    leaving = unmount
    const element = root.value
    fadeMs ??= element ? getMotionDuration(getComputedStyle(element), '--bew-duration-moderate', 300) : 300
    timer = setTimeout(unmount, fadeMs)
  }

  onScopeDispose(() => {
    if (frame !== undefined)
      cancelAnimationFrame(frame)
    unmount()
  })

  return { mounted, visible, enter, leave }
}
