import { MAX_MOTION_MS } from './motionTiming'

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

/** Progress (0 → 1) of the same spring, starting with `velocity` in progress per second. */
function criticalProgress(seconds: number, frequency: number, velocity: number) {
  return 1 + (-1 + (velocity - frequency) * seconds) * Math.exp(-frequency * seconds)
}

let linearEasing: boolean | undefined

/**
 * The response of a critically damped spring that lands by `seconds` (within
 * 0.05% of the move), so every spring ends inside its stated duration.
 */
export function landingResponse(seconds: number) {
  return Math.min(seconds, MAX_MOTION_MS / 1000) / 2
}

/**
 * Such a spring has visibly arrived (98% of the move) at this fraction of its
 * duration; content waiting on it may go then instead of after the tail.
 */
export const SPRING_VISIBLE_LANDING = 0.6

/**
 * Web Animation timing for a move of `distance` px that lands by `seconds`
 * (at most `MAX_MOTION_MS`) and follows the critically damped spring of
 * `stepCriticalSpring`: a CSS `linear()` curve sampled from its closed form.
 * The browser plays it at the display's refresh rate (on the compositor for
 * transform and opacity), and `velocity` (px/s along the move) lets it start at
 * the speed of a release or of the motion it interrupts. Start speed is capped
 * at 1.5× the spring's own pace: at most a 2.5% overshoot.
 */
export function springTiming(seconds: number, distance: number, velocity = 0): { duration: number, easing: string } {
  const length = Math.min(seconds, MAX_MOTION_MS / 1000)
  const frequency = 5 / landingResponse(length)
  const limit = frequency * 1.5
  const start = distance ? Math.max(-limit, Math.min(limit, velocity / distance)) : 0
  const duration = length * 1000
  linearEasing ??= typeof CSS !== 'undefined' && CSS.supports('animation-timing-function', 'linear(0, 1)')
  if (!linearEasing)
    return { duration, easing: 'cubic-bezier(0.2, 0, 0, 1)' }
  // About one point per 10ms; the browser interpolates between them per frame.
  const count = Math.max(16, Math.min(96, Math.round(duration / 10)))
  const points = Array.from({ length: count + 1 }, (_, index) => index === count ? '1' : String(Number(criticalProgress(length * index / count, frequency, start).toFixed(4))))
  return { duration, easing: `linear(${points.join(', ')})` }
}
