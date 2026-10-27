import type { TransitionProps } from 'vue'
import { onScopeDispose } from 'vue'

import { prefersReducedMotion } from '~/utils/reducedMotion'

import { holdAnimation } from '../utils/motionPriority'
import { getMotionDuration } from '../utils/motionTiming'

/** Keep glass and its ancestors opaque: opacity changes the backdrop sampling root. */
export function useGlassPanelMotion(selector: string, collapsedTransform?: (panel: HTMLElement) => string, fadeSelector?: string): TransitionProps {
  const running = new Map<Element, Animation>()
  const fades = new Map<Element, { target: HTMLElement, animation: Animation }[]>()
  const interrupted = new WeakMap<Element, string>()
  const interruptedOpacity = new WeakMap<HTMLElement, string>()
  function cancel(element: Element, disposing = false) {
    const animation = running.get(element)
    const panel = element.querySelector<HTMLElement>(selector)
    // KeepAlive moves the panel to detached storage before leave-cancelled fires.
    // Its computed style is empty there; hold the painted animation until re-entry
    // can sample it while connected, rather than replacing it with the final size.
    if (animation && panel && !element.isConnected && !disposing) {
      animation.pause()
      fades.get(element)?.forEach(({ animation }) => animation.pause())
      return
    }
    if (animation && panel)
      interrupted.set(element, getComputedStyle(panel).transform)
    fades.get(element)?.forEach(({ target, animation }) => {
      if (!disposing)
        interruptedOpacity.set(target, getComputedStyle(target).opacity)
      animation.cancel()
    })
    fades.delete(element)
    animation?.cancel()
    running.delete(element)
  }
  function play(element: Element, entering: boolean, done: () => void) {
    cancel(element)
    const panel = element.querySelector<HTMLElement>(selector)
    if (element instanceof HTMLElement)
      element.inert = !entering
    if (!panel?.animate || prefersReducedMotion()) {
      interrupted.delete(element)
      if (panel && fadeSelector)
        element.querySelectorAll<HTMLElement>(fadeSelector).forEach(target => interruptedOpacity.delete(target))
      done()
      return
    }
    const style = getComputedStyle(panel)
    const base = style.transform === 'none' ? '' : style.transform
    const collapsed = collapsedTransform?.(panel)
    const offset = (phase: string) => collapsed ?? (style.getPropertyValue(`--bew-panel-${phase}-transform`).trim() || 'translateY(0)')
    const from = interrupted.get(element) ?? (entering ? `${base} ${offset('enter')}` : base || 'none')
    interrupted.delete(element)
    const duration = getMotionDuration(style, entering ? '--bew-panel-enter-duration' : '--bew-panel-leave-duration')
    let animation: Animation
    const paintAnimations: { target: HTMLElement, animation: Animation }[] = []
    try {
      animation = panel.animate([
        { transform: from },
        { transform: entering ? base || 'none' : `${base} ${offset('leave')}` },
      ], { duration, easing: style.getPropertyValue('--bew-ease-standard').trim() || 'ease-out', fill: 'both' })
      // Register immediately: a later paint layer can fail independently.
      running.set(element, animation)
      // Content swaps behind or inside the panel wait for its scale.
      holdAnimation(animation)
      fades.set(element, paintAnimations)
      // Fade actual paint layers, never a glass ancestor: the backdrop stays sampled
      // from the same root from first frame to last. Exit is invisible before arrival.
      if (fadeSelector) {
        for (const target of Array.from(element.querySelectorAll<HTMLElement>(fadeSelector))) {
          const from = interruptedOpacity.get(target) ?? (entering ? '0' : '1')
          interruptedOpacity.delete(target)
          const frames = entering
            ? [{ opacity: from, offset: 0 }, { opacity: from, offset: 0.12 }, { opacity: 1, offset: 1 }]
            : [{ opacity: from, offset: 0 }, { opacity: 0, offset: 0.72 }, { opacity: 0, offset: 1 }]
          paintAnimations.push({ target, animation: target.animate(frames, { duration, easing: 'linear', fill: 'both' }) })
        }
      }
    }
    catch (error) {
      // An unavailable animation must never strand Vue's leave/close lifecycle.
      // Consume cancellation before releasing any partially-created effects.
      void running.get(element)?.finished.catch(() => {})
      cancel(element, true)
      interrupted.delete(element)
      console.warn('[Bewly] Panel animation could not start.', error)
      done()
      return
    }
    const finish = () => {
      if (running.get(element) !== animation)
        return
      running.delete(element)
      // Detach this run before done(), which may immediately start a new enter.
      fades.delete(element)
      done()
      animation.cancel()
      paintAnimations.forEach(({ animation }) => animation.cancel())
    }
    // Own cancellations remove the map entry; external cancellation still has
    // to settle the current transition (focus, closing gates, Dock release).
    void animation.finished.then(finish, finish)
  }
  onScopeDispose(() => {
    for (const element of running.keys())
      cancel(element, true)
  })
  return {
    css: false,
    onEnter: (element, done) => play(element, true, done),
    onLeave: (element, done) => play(element, false, done),
    onEnterCancelled: cancel,
    onLeaveCancelled: cancel,
  }
}
