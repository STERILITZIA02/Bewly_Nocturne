/**
 * Interaction motion (segment slides, wheel springs, panel scaling) plays before
 * the work it reveals. A running animation registers a hold; content swaps fade
 * the old view over the remaining motion and mount the new one afterwards. Every
 * wait is bounded so a stalled or forgotten hold never blocks loading.
 */
export const MAX_MOTION_WAIT_MS = 800

const holds = new Map<symbol, number>()
const waiters: { resolve: () => void, deadline: number }[] = []
let timer: ReturnType<typeof setTimeout> | undefined

function now() {
  return performance.now()
}

function prune(time: number) {
  for (const [id, end] of holds) {
    if (end <= time)
      holds.delete(id)
  }
}

/** Remaining registered motion in milliseconds, capped by `MAX_MOTION_WAIT_MS`. */
export function getMotionRemaining(): number {
  const time = now()
  prune(time)
  let end = time
  for (const value of holds.values())
    end = Math.max(end, value)
  return Math.min(MAX_MOTION_WAIT_MS, end - time)
}

function settle() {
  if (timer !== undefined)
    clearTimeout(timer)
  timer = undefined
  const time = now()
  prune(time)
  for (let index = waiters.length - 1; index >= 0; index--) {
    if (!holds.size || waiters[index].deadline <= time)
      waiters.splice(index, 1)[0].resolve()
  }
  if (!waiters.length)
    return
  const deadline = Math.min(...waiters.map(waiter => waiter.deadline))
  timer = setTimeout(settle, Math.max(0, Math.min(deadline - time, getMotionRemaining())))
}

/**
 * Registers motion expected to run for `duration` ms. The returned release ends
 * it early (finished, cancelled, unmounted); it is safe to call more than once.
 */
export function holdMotion(duration: number): () => void {
  if (!(duration > 0))
    return () => {}
  const id = Symbol('motion-hold')
  holds.set(id, now() + Math.min(duration, MAX_MOTION_WAIT_MS))
  return () => {
    if (holds.delete(id) && waiters.length)
      settle()
  }
}

/** Holds a Web Animation until it finishes or is cancelled. */
export function holdAnimation(animation: Animation): () => void {
  const timing = animation.effect?.getComputedTiming()
  const end = Number(timing?.endTime ?? 0)
  const current = Number(animation.currentTime ?? 0)
  const release = holdMotion((end - current) / Math.abs(animation.playbackRate || 1))
  void animation.finished.then(release, release)
  return release
}

/** Resolves once registered motion has settled, or after `MAX_MOTION_WAIT_MS`. */
export function afterMotion(): Promise<void> {
  if (getMotionRemaining() <= 0)
    return Promise.resolve()
  return new Promise((resolve) => {
    waiters.push({ resolve, deadline: now() + MAX_MOTION_WAIT_MS })
    settle()
  })
}
