/** Wheel distance (px) that commits one step; line/page deltas are normalised. */
const STEP_DISTANCE = 48
/** A pause this long (ms) ends a gesture, including its inertial tail. */
const GESTURE_GAP = 180
/** Minimum time (ms) between steps within one continuous gesture. */
const STEP_COOLDOWN = 220

export function normalizeWheelDelta(delta: number, deltaMode: number, pageSize: number) {
  return delta * (deltaMode === 1 ? 16 : deltaMode === 2 ? pageSize : 1)
}

/**
 * Turns wheel and trackpad deltas into discrete steps. Continuous gestures can
 * advance again after a cooldown (unless `oncePerGesture`), reversing starts a
 * new gesture, and short inertial tails never add a step.
 */
export function createWheelStepper({ oncePerGesture = false } = {}) {
  let distance = 0
  let lastTime = -Infinity
  let lastCommit = -Infinity
  let lastDirection = 0
  let committed = false

  function reset() {
    distance = 0
    lastTime = -Infinity
    lastCommit = -Infinity
    lastDirection = 0
    committed = false
  }

  /** Returns -1 or 1 when a step commits, otherwise 0. */
  function step(delta: number, deltaMode: number, time: number): -1 | 0 | 1 {
    const direction = Math.sign(delta) as -1 | 0 | 1
    if (!direction)
      return 0
    if (time - lastTime > GESTURE_GAP || direction !== lastDirection) {
      distance = 0
      lastCommit = -Infinity
      committed = false
    }
    lastTime = time
    lastDirection = direction
    distance += normalizeWheelDelta(delta, deltaMode, 120)
    if (Math.abs(distance) < STEP_DISTANCE || time - lastCommit < STEP_COOLDOWN || (oncePerGesture && committed))
      return 0
    distance = 0
    lastCommit = time
    committed = true
    return direction
  }

  return { step, reset }
}
