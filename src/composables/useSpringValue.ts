import { usePreferredReducedMotion } from '@vueuse/core'
import { onScopeDispose, readonly, ref, watch } from 'vue'

import { holdMotion } from '~/utils/motionPriority'

/** Exact critically damped step: stable across refresh rates and rapid retargets. */
export function stepCriticalSpring(position: number, velocity: number, target: number, seconds: number, response: number) {
  const frequency = 5 / response
  const displacement = position - target
  const impulse = velocity + frequency * displacement
  const decay = Math.exp(-frequency * seconds)
  return {
    position: target + (displacement + impulse * seconds) * decay,
    velocity: (velocity - frequency * impulse * seconds) * decay,
  }
}

export function useSpringValue(target: () => number, response: () => number) {
  const value = ref(target())
  const reduced = usePreferredReducedMotion()
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
    responseSeconds = Math.max(0.001, response())
    if (reduced.value === 'reduce') {
      stop()
      value.value = target()
    }
    else {
      // Visually settled after ~1.2 responses; content swaps wait for it.
      releaseHold?.()
      releaseHold = holdMotion(responseSeconds * 1200)
      if (frame === undefined) {
        lastTime = performance.now()
        frame = requestAnimationFrame(tick)
      }
    }
  }, { flush: 'sync' })
  onScopeDispose(stop)
  return readonly(value)
}
