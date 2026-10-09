import { nextTick } from 'vue'

import { waitWithSignal, withRequestDeadline } from '~/utils/abort'

function nextFrame(signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    let frame: number
    const abort = () => {
      cancelAnimationFrame(frame)
      reject(signal.reason)
    }
    frame = requestAnimationFrame(() => {
      signal.removeEventListener('abort', abort)
      resolve()
    })
    if (signal.aborted)
      abort()
    else signal.addEventListener('abort', abort, { once: true })
  })
}

function expand(target: HTMLElement, root: HTMLElement) {
  const controls = new Set<HTMLElement>()
  if (target.matches('[aria-expanded="false"]'))
    controls.add(target)
  for (let element: HTMLElement | null = target; element && element !== root; element = element.parentElement) {
    if (element.matches('details'))
      (element as HTMLDetailsElement).open = true
    const control = element.matches('.b-settings-item-group')
      ? element.querySelector<HTMLElement>(':scope > .group-heading[aria-expanded="false"]')
      : element.matches('section') ? element.querySelector<HTMLElement>(':scope > .settings-section-heading[aria-expanded="false"]') : undefined
    if (control)
      controls.add(control)
  }
  Array.from(controls).reverse().forEach(control => control.click())
}

/**
 * Event-driven settings navigation. Only the settings viewport scrolls; async
 * mounts and finite ancestor transitions settle before geometry is measured.
 */
export async function navigateToSetting(options: {
  root: HTMLElement
  viewport: HTMLElement
  find: () => HTMLElement | undefined
  signal: AbortSignal
  behavior: ScrollBehavior
}): Promise<HTMLElement | undefined> {
  const { root, viewport } = options
  try {
    return await withRequestDeadline(async (signal) => {
      while (!signal.aborted && root.isConnected) {
        const target = await new Promise<HTMLElement>((resolve, reject) => {
          const observer = new MutationObserver(check)
          function cleanup() {
            observer.disconnect()
            signal.removeEventListener('abort', abort)
          }
          function abort() {
            cleanup()
            reject(signal.reason)
          }
          function check() {
            const element = options.find()
            if (element && root.contains(element) && !element.closest('.page-fade-leave-active')) {
              cleanup()
              resolve(element)
            }
          }
          observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'data-settings-title', 'data-setting-id'] })
          signal.addEventListener('abort', abort, { once: true })
          check()
        })
        signal.throwIfAborted()
        expand(target, root)
        await nextTick()
        await nextFrame(signal)
        // Vue starts CSS enter transitions on its second animation frame.
        // Sample active animations after that boundary, not after a guessed delay.
        await nextFrame(signal)
        const animations = new Set<Animation>()
        for (let element: HTMLElement | null = target; element; element = element.parentElement) {
          for (const animation of element.getAnimations?.() ?? []) {
            if (animation.playState !== 'finished' && animation.playState !== 'idle'
              && Number.isFinite(Number(animation.effect?.getComputedTiming().iterations))) {
              animations.add(animation)
            }
          }
          if (element === root)
            break
        }
        if (animations.size) {
          await waitWithSignal(Promise.allSettled([...animations].map(animation => animation.finished)), signal)
          await nextFrame(signal)
        }
        signal.throwIfAborted()
        if (!root.contains(target) || options.find() !== target)
          continue
        if (!target.getClientRects().length)
          return undefined
        const targetRect = target.getBoundingClientRect()
        const viewportRect = viewport.getBoundingClientRect()
        const header = root.querySelector<HTMLElement>('.settings-header')?.getBoundingClientRect()
        const inset = Math.max(Number.parseFloat(getComputedStyle(viewport).paddingTop) || 0, header ? header.bottom - viewportRect.top : 0)
        const centerOffset = Math.max(0, (viewport.clientHeight - inset - targetRect.height) / 2)
        viewport.scrollTo({ top: Math.max(0, viewport.scrollTop + targetRect.top - viewportRect.top - viewport.clientTop - inset - centerOffset), behavior: options.behavior })
        return target
      }
    }, { signal: options.signal }, 5000)
  }
  catch { return undefined }
}
