import { useResizeObserver } from '@vueuse/core'
import type { Ref } from 'vue'
import { nextTick, onScopeDispose, ref, watch } from 'vue'

import { holdMotion } from '~/utils/motionPriority'
import { getMotionDuration } from '~/utils/motionTiming'
import { prefersReducedMotion } from '~/utils/reducedMotion'
import { getLayoutHeight } from '~/utils/viewportGeometry'

/** Animate a clipped outer height while keeping the scroll/content layout natural. */
export function useMeasuredDisclosure(
  outer: Ref<HTMLElement | null>,
  content: Ref<HTMLElement | null>,
  open: Readonly<Ref<boolean>>,
  onClosed: () => void,
  onMotionChange: (moving: boolean) => void,
) {
  const height = ref<number | undefined>(open.value ? undefined : 0)
  const moving = ref(false)
  let frame = 0
  let settleTimer: ReturnType<typeof setTimeout> | undefined
  let disposed = false
  let revision = 0
  let releaseMotion: (() => void) | undefined

  function finish() {
    releaseMotion?.()
    releaseMotion = undefined
    clearTimeout(settleTimer)
    settleTimer = undefined
    if (disposed)
      return
    if (moving.value) {
      moving.value = false
      onMotionChange(false)
    }
    if (!open.value)
      onClosed()
  }

  function measure() {
    frame = 0
    const shell = outer.value
    const body = content.value
    if (disposed || !shell || !body)
      return
    const target = open.value ? getLayoutHeight(body) : 0
    if (height.value === target) {
      if (!target && !moving.value)
        finish()
      return
    }
    const current = getLayoutHeight(shell)
    const version = ++revision
    clearTimeout(settleTimer)
    const reduced = prefersReducedMotion()
    const duration = getMotionDuration(getComputedStyle(shell), '--bew-duration-normal')
    if (reduced || duration <= 0 || Math.abs(target - current) < 1) {
      height.value = target
      void nextTick(() => version === revision && finish())
      return
    }
    if (!moving.value) {
      moving.value = true
      onMotionChange(true)
    }
    height.value = target
    const previous = releaseMotion
    releaseMotion = holdMotion(duration)
    previous?.()
    // A detached/hidden tab or reduced-motion change can cancel transitionend.
    settleTimer = setTimeout(() => version === revision && finish(), duration * 1.5)
  }

  function scheduleMeasure() {
    if (!disposed && !frame)
      frame = requestAnimationFrame(measure)
  }

  useResizeObserver(content, scheduleMeasure)
  watch([outer, content, open], scheduleMeasure, { immediate: true, flush: 'post' })

  function onTransitionEnd(event: TransitionEvent) {
    const shell = outer.value
    if (!shell || event.target !== shell || event.propertyName !== 'height' || event.type !== 'transitionend')
      return
    // Ignore a queued end from an animation that has already been redirected.
    if (Math.abs(getLayoutHeight(shell) - (height.value ?? 0)) < 1)
      finish()
  }

  onScopeDispose(() => {
    disposed = true
    revision++
    cancelAnimationFrame(frame)
    clearTimeout(settleTimer)
    releaseMotion?.()
    if (moving.value)
      onMotionChange(false)
  })
  return { height, moving, onTransitionEnd }
}
