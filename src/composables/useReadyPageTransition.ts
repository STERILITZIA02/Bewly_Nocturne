import type { TransitionProps } from 'vue'
import { nextTick, onScopeDispose, watch } from 'vue'

import { restoreRetiringElement, retiringTransition } from '~/utils/motionPresence'
import { afterMotion, getMotionRemaining } from '~/utils/motionPriority'
import { getMotionDuration } from '~/utils/motionTiming'
import { prefersReducedMotion } from '~/utils/reducedMotion'

interface ReadyPageTransitionOptions {
  onStart?: () => void
  onSwap?: () => void
  onEnter?: (element: Element) => void
  onSettled?: () => void
  rise?: () => boolean
}

/**
 * Code readiness gates the 60ms exit; only the incoming content enters for 150ms.
 * Interaction motion goes first: while a slide, wheel or panel scale is still
 * running (utils/motionPriority), the old view fades out over that time and the
 * new view mounts only after it settles, so mounting never drops its frames.
 */
export function useReadyPageTransition<T>(source: () => T, prepare: (component: T) => Promise<unknown>, options: ReadyPageTransitionOptions = {}): TransitionProps {
  let generation = 0
  let initialized = false
  let ready = false
  let leavingGeneration: number | undefined
  let finishLeave: (() => void) | undefined
  let leaveElement: Element | undefined
  let leaveAnimation: Animation | undefined
  let enterAnimation: Animation | undefined
  let enterElement: Element | undefined
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
    const done = finishLeave
    const element = leaveElement
    const version = generation
    if (!ready || !done || !element || leavingGeneration === version)
      return
    leavingGeneration = version
    // out-in's done() immediately updates BaseTransition. Even a cached module
    // must wait until Vue has installed the current patch's placeholder vnode.
    await nextTick()
    if (version !== generation || !ready || finishLeave !== done)
      return
    const from = opacity(element)
    leaveAnimation?.cancel()
    // Stretch the exit across the triggering slide instead of idling blank.
    const animation = animate(element, [{ opacity: from }, { opacity: 0 }], false, getMotionRemaining())
    leaveAnimation = animation
    if (animation) {
      await animation.finished.catch(() => undefined)
      if (version !== generation || finishLeave !== done)
        return
    }
    await afterMotion()
    if (version !== generation || finishLeave !== done)
      return
    finishLeave = undefined
    leaveElement = undefined
    leaveAnimation = undefined
    leavingGeneration = undefined
    options.onSwap?.()
    done()
    animation?.cancel()
  }
  watch(source, async (component) => {
    const version = ++generation
    ready = false
    leavingGeneration = undefined
    if (initialized)
      options.onStart?.()
    initialized = true
    if (leaveAnimation && leaveElement) {
      // A later destination may still be loading. Retarget the old page back
      // toward visible instead of leaving it transparent while code is fetched.
      const from = opacity(leaveElement)
      leaveAnimation.cancel()
      leaveAnimation = animate(leaveElement, [{ opacity: from }, { opacity: 1 }], false)
      void leaveAnimation?.finished.catch(() => {})
    }
    try {
      await prepare(component)
    }
    catch {
      // The async component owns its load error/retry UI; do not retain the old
      // page indefinitely when preloading fails.
    }
    if (version !== generation)
      return
    ready = true
    await finishReadyLeave()
  }, { immediate: true, flush: 'sync' })
  onScopeDispose(() => {
    generation++
    finishLeave = undefined
    if (leaveElement)
      restoreRetiringElement(leaveElement)
    leaveElement = undefined
    leaveAnimation?.cancel()
    enterAnimation?.cancel()
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
      finishLeave = done
      leaveElement = element
      void finishReadyLeave()
    },
    onLeaveCancelled: (element) => {
      leaveAnimation?.cancel()
      leaveAnimation = undefined
      finishLeave = undefined
      leaveElement = undefined
      leavingGeneration = undefined
      restoreRetiringElement(element)
      options.onSettled?.()
    },
    onEnter: (element, done) => {
      enterAnimation?.cancel()
      options.onEnter?.(element)
      const reduced = prefersReducedMotion()
      const rise = !reduced && options.rise?.() === true
      const animation = animate(element, rise
        ? [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }]
        : [{ opacity: 0 }, { opacity: 1 }], true)
      enterAnimation = animation
      enterElement = element
      if (!animation) {
        done()
        return
      }
      void animation.finished.then(() => {
        if (enterAnimation !== animation)
          return
        enterAnimation = undefined
        enterElement = undefined
        animation.cancel()
        done()
      }, () => {
        if (enterAnimation !== animation)
          return
        enterAnimation = undefined
        enterElement = undefined
        done()
      })
    },
    onEnterCancelled: (element) => {
      if (enterAnimation && enterElement === element)
        interruptedOpacity.set(element, opacity(element))
      enterAnimation?.cancel()
      enterAnimation = undefined
      enterElement = undefined
    },
    onAfterEnter: () => options.onSettled?.(),
  }
}
