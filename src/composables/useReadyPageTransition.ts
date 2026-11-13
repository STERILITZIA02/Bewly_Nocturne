import type { TransitionProps } from 'vue'
import { nextTick, onScopeDispose, watch } from 'vue'

import { restoreRetiringElement, retiringTransition } from '~/utils/motionPresence'
import type { MotionScope } from '~/utils/motionPriority'
import { afterMotion, getMotionRemaining } from '~/utils/motionPriority'
import { getMotionDuration } from '~/utils/motionTiming'
import { prefersReducedMotion } from '~/utils/reducedMotion'

interface ReadyPageTransitionOptions {
  /** The interaction motion this swap waits for (its tab slider, the Dock); none swaps at once. */
  motion?: MotionScope
  onStart?: () => void
  onSwap?: () => void
  onEnter?: (element: Element) => void
  onSettled?: () => void
  rise?: () => boolean
}

/**
 * Code readiness gates the 60ms exit; only the incoming content enters for 150ms.
 * Interaction motion of `options.motion` goes first: while that slide, wheel or
 * sidebar is still running (utils/motionPriority), the old view fades out over
 * that time and the new view mounts only after it settles (at most 300ms).
 */
export function useReadyPageTransition<T>(source: () => T, prepare: (component: T) => Promise<unknown>, options: ReadyPageTransitionOptions = {}): TransitionProps {
  interface Destination { phase: 'initial' | 'preparing' | 'ready' | 'disposed' }
  let destination: Destination = { phase: 'initial' }
  let departure: {
    phase: 'waiting' | 'leaving'
    element: Element
    done: () => void
    target?: Destination
    animation?: Animation
  } | undefined
  let arrival: { element: Element, animation: Animation } | undefined
  const interruptedOpacity = new WeakMap<Element, string>()

  function opacity(element: Element) {
    return getComputedStyle(element).opacity || '1'
  }

  function animate(element: Element, frames: Keyframe[], entering: boolean, minDuration = 0): Animation | undefined {
    if (!(element instanceof HTMLElement) || typeof element.animate !== 'function')
      return
    const style = getComputedStyle(element)
    const reduced = prefersReducedMotion()
    const duration = reduced ? (entering ? 70 : 30) : Math.max(minDuration, getMotionDuration(style, entering ? '--bew-page-enter-duration' : '--bew-page-exit-duration', entering ? 150 : 60))
    const easing = style.getPropertyValue(entering ? '--bew-ease-out' : '--bew-ease-in').trim() || (entering ? 'ease-out' : 'ease-in')
    try {
      return element.animate(frames, { duration, easing, fill: 'both' })
    }
    catch {
      // Unsupported timing/API must still commit navigation and release inert.
    }
  }

  async function finishReadyLeave() {
    const leaving = departure
    const target = destination
    if (target.phase !== 'ready' || !leaving || (leaving.phase === 'leaving' && leaving.target === target))
      return
    leaving.phase = 'leaving'
    leaving.target = target
    const { element, done } = leaving
    const isCurrent = () => destination === target && departure === leaving && target.phase === 'ready'
    // out-in's done() immediately updates BaseTransition. Even a cached module
    // must wait until Vue has installed the current patch's placeholder vnode.
    await nextTick()
    if (!isCurrent())
      return
    const from = opacity(element)
    leaving.animation?.cancel()
    // Stretch the exit across the triggering slide instead of idling blank.
    const animation = animate(element, [{ opacity: from }, { opacity: 0 }], false, options.motion ? getMotionRemaining(options.motion) : 0)
    leaving.animation = animation
    if (animation) {
      await animation.finished.catch(() => undefined)
      if (!isCurrent())
        return
    }
    if (options.motion)
      await afterMotion(options.motion)
    if (!isCurrent())
      return
    departure = undefined
    options.onSwap?.()
    done()
    animation?.cancel()
  }
  watch(source, async (component) => {
    const initialized = destination.phase !== 'initial'
    const target: Destination = { phase: 'preparing' }
    destination = target
    if (departure)
      departure.phase = 'waiting'
    if (initialized)
      options.onStart?.()
    if (departure?.animation) {
      // A later destination may still be loading. Retarget the old page back
      // toward visible instead of leaving it transparent while code is fetched.
      const from = opacity(departure.element)
      departure.animation.cancel()
      departure.animation = animate(departure.element, [{ opacity: from }, { opacity: 1 }], false)
      void departure.animation?.finished.catch(() => {})
    }
    try {
      await prepare(component)
    }
    catch {
      // The async component owns its load error/retry UI; do not retain the old
      // page indefinitely when preloading fails.
    }
    if (destination !== target)
      return
    target.phase = 'ready'
    await finishReadyLeave()
  }, { immediate: true, flush: 'sync' })
  onScopeDispose(() => {
    destination = { phase: 'disposed' }
    if (departure) {
      restoreRetiringElement(departure.element)
      departure.animation?.cancel()
      departure = undefined
    }
    const entering = arrival
    arrival = undefined
    entering?.animation.cancel()
  })
  return {
    ...retiringTransition,
    css: false,
    onBeforeLeave: (element) => {
      const beforeLeave = retiringTransition.onBeforeLeave
      if (Array.isArray(beforeLeave))
        beforeLeave.forEach(hook => hook(element))
      else beforeLeave?.(element)
      const from = interruptedOpacity.get(element)
      if (from && element instanceof HTMLElement) {
        element.style.opacity = from
        interruptedOpacity.delete(element)
      }
    },
    onLeave: (element, done) => {
      departure = { phase: 'waiting', element, done }
      void finishReadyLeave()
    },
    onLeaveCancelled: (element) => {
      departure?.animation?.cancel()
      departure = undefined
      restoreRetiringElement(element)
      options.onSettled?.()
    },
    onEnter: (element, done) => {
      arrival?.animation.cancel()
      arrival = undefined
      options.onEnter?.(element)
      const reduced = prefersReducedMotion()
      const rise = !reduced && options.rise?.() === true
      const animation = animate(element, rise
        ? [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }]
        : [{ opacity: 0 }, { opacity: 1 }], true)
      if (!animation) {
        done()
        return
      }
      const entering = { element, animation }
      arrival = entering
      void animation.finished.then(() => {
        if (arrival !== entering)
          return
        arrival = undefined
        animation.cancel()
        done()
      }, () => {
        if (arrival !== entering)
          return
        arrival = undefined
        done()
      })
    },
    onEnterCancelled: (element) => {
      if (arrival?.element === element)
        interruptedOpacity.set(element, opacity(element))
      const entering = arrival
      arrival = undefined
      entering?.animation.cancel()
    },
    onAfterEnter: () => options.onSettled?.(),
  }
}
