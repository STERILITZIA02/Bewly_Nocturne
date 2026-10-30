/**
 * Interaction motion that a content swap depends on plays first: the swap fades
 * the old view over the remaining motion and mounts the new one afterwards.
 * Holds and waits are scoped: a wait only sees the holds of its own scope (the
 * Dock and sidebar for a page change, a tab bar's slider for its tab swap), so
 * unrelated motion elsewhere never delays it. Motion that nothing waits on
 * registers nothing. Every wait is bounded by `MAX_MOTION_WAIT_MS`.
 */
export const MAX_MOTION_WAIT_MS = 300

/** Identifies the motion one swap waits for. */
export type MotionScope = symbol

/** Page navigation: Dock indicator, persistent sidebar, top-bar buttons, search handoff. */
export const PAGE_MOTION: MotionScope = Symbol('page-motion')

/** The persistent sidebar heading's wheel: the category view of the current page. */
export const SIDEBAR_HEADING_MOTION: MotionScope = Symbol('sidebar-heading-motion')

/** The Bewly widescreen player's card/fill zoom; control fitting waits for it. */
export const PLAYER_DISPLAY_MOTION: MotionScope = Symbol('player-display-motion')

export function createMotionScope(name: string): MotionScope {
  return Symbol(name)
}

const holds = new Map<symbol, { scope: MotionScope, end: number }>()
const waiters: { scope: MotionScope, resolve: () => void, deadline: number }[] = []
let timer: ReturnType<typeof setTimeout> | undefined

function now() {
  return performance.now()
}

function prune(time: number) {
  for (const [id, hold] of holds) {
    if (hold.end <= time)
      holds.delete(id)
  }
}

/** Remaining motion of one scope in milliseconds, capped by `MAX_MOTION_WAIT_MS`. */
export function getMotionRemaining(scope: MotionScope): number {
  const time = now()
  prune(time)
  let end = time
  for (const hold of holds.values()) {
    if (hold.scope === scope)
      end = Math.max(end, hold.end)
  }
  return Math.min(MAX_MOTION_WAIT_MS, end - time)
}

function settle() {
  if (timer !== undefined)
    clearTimeout(timer)
  timer = undefined
  const time = now()
  for (let index = waiters.length - 1; index >= 0; index--) {
    const waiter = waiters[index]
    if (waiter.deadline <= time || getMotionRemaining(waiter.scope) <= 0)
      waiters.splice(index, 1)[0].resolve()
  }
  if (!waiters.length)
    return
  const next = Math.min(...waiters.map(waiter => Math.min(waiter.deadline - time, getMotionRemaining(waiter.scope))))
  timer = setTimeout(settle, Math.max(0, next))
}

/**
 * Registers motion of `scope` expected to run for `duration` ms. The returned
 * release ends it early (finished, cancelled, unmounted); it is safe to call
 * more than once.
 */
export function holdMotion(duration: number, scope: MotionScope): () => void {
  if (!(duration > 0))
    return () => {}
  const id = Symbol('motion-hold')
  holds.set(id, { scope, end: now() + Math.min(duration, MAX_MOTION_WAIT_MS) })
  return () => {
    if (holds.delete(id) && waiters.length)
      settle()
  }
}

/**
 * Holds a Web Animation until it finishes or is cancelled. `visible` ends the
 * hold earlier where the tail is imperceptible (a spring's last pixels).
 */
export function holdAnimation(animation: Animation, scope: MotionScope, visible?: number): () => void {
  const timing = animation.effect?.getComputedTiming()
  const end = Number(timing?.endTime ?? 0)
  const current = Number(animation.currentTime ?? 0)
  const remaining = (end - current) / Math.abs(animation.playbackRate || 1)
  const release = holdMotion(visible === undefined ? remaining : Math.min(remaining, visible), scope)
  void animation.finished.then(release, release)
  return release
}

/** Resolves once the motion of `scope` has settled, or after `MAX_MOTION_WAIT_MS`. */
export function afterMotion(scope: MotionScope): Promise<void> {
  if (getMotionRemaining(scope) <= 0)
    return Promise.resolve()
  return new Promise((resolve) => {
    waiters.push({ scope, resolve, deadline: now() + MAX_MOTION_WAIT_MS })
    settle()
  })
}
