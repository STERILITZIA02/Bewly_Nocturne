import type { TransitionProps } from 'vue'
import { onScopeDispose } from 'vue'

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
    if (!panel?.animate || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
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
    const duration = Number.parseFloat(style.getPropertyValue(entering ? '--bew-panel-enter-duration' : '--bew-panel-leave-duration')) || 200
    const animation = panel.animate([
      { transform: from },
      { transform: entering ? base || 'none' : `${base} ${offset('leave')}` },
    ], { duration, easing: style.getPropertyValue('--bew-ease-standard').trim() || 'ease-out', fill: 'both' })
    // Fade actual paint layers, never a glass ancestor: the backdrop stays sampled
    // from the same root from first frame to last. Exit is invisible before arrival.
    if (fadeSelector) {
      fades.set(element, Array.from(element.querySelectorAll<HTMLElement>(fadeSelector), (target) => {
        const from = interruptedOpacity.get(target) ?? (entering ? '0' : '1')
        interruptedOpacity.delete(target)
        const frames = entering
          ? [{ opacity: from, offset: 0 }, { opacity: from, offset: 0.12 }, { opacity: 1, offset: 1 }]
          : [{ opacity: from, offset: 0 }, { opacity: 0, offset: 0.72 }, { opacity: 0, offset: 1 }]
        return { target, animation: target.animate(frames, { duration, easing: 'linear', fill: 'both' }) }
      }))
    }
    running.set(element, animation)
    void animation.finished.then(() => {
      if (running.get(element) !== animation)
        return
      running.delete(element)
      done()
      animation.cancel()
      fades.get(element)?.forEach(({ animation }) => animation.cancel())
      fades.delete(element)
    }, () => {})
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
