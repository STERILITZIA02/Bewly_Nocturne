import { onScopeDispose, readonly, ref, watch } from 'vue'

import type { MotionScope } from '~/utils/motionPriority'
import { holdMotion } from '~/utils/motionPriority'
import { landingResponse, SPRING_VISIBLE_LANDING, stepCriticalSpring } from '~/utils/spring'

import { useReducedMotion } from './useReducedMotion'

/** Follows `target` with a spring that lands within `duration()` seconds; `scope` swaps wait for it. */
export function useSpringValue(target: () => number, duration: () => number, scope?: MotionScope) {
  const value = ref(target())
  const reduced = useReducedMotion()
  let velocity = 0
  let frame: number | undefined
  let lastTime = 0
  let responseSeconds = 0.2
  let releaseHold: (() => void) | undefined
  const stop = () => {
    if (frame !== undefined)
      cancelAnimationFrame(frame)
    frame = undefined
    velocity = 0
    releaseHold?.()
    releaseHold = undefined
  }
  const tick = (time: number) => {
    const next = stepCriticalSpring(value.value, velocity, target(), Math.max(0, (time - lastTime) / 1000), responseSeconds)
    lastTime = time
    value.value = next.position
    velocity = next.velocity
    if (Math.abs(target() - value.value) < 0.001 && Math.abs(velocity) < 0.01) {
      value.value = target()
      stop()
    }
    else {
      frame = requestAnimationFrame(tick)
    }
  }
  watch([target, reduced], () => {
    const seconds = Math.max(0.001, duration())
    responseSeconds = landingResponse(seconds)
    if (reduced.value) {
      stop()
      value.value = target()
    }
    else {
      // Content swaps of `scope` wait until it has visibly landed, not for the tail.
      releaseHold?.()
      releaseHold = scope && holdMotion(seconds * SPRING_VISIBLE_LANDING * 1000, scope)
      if (frame === undefined) {
        lastTime = performance.now()
        frame = requestAnimationFrame(tick)
      }
    }
  }, { flush: 'sync' })
  onScopeDispose(stop)
  return readonly(value)
}
