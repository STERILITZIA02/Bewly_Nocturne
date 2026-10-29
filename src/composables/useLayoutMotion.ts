import type { Ref, WatchSource } from 'vue'
import { nextTick, onScopeDispose, watch } from 'vue'

import { prefersReducedMotion } from '~/utils/reducedMotion'
import { claimScrollPosition, ownsScrollPosition, scrollToPosition } from '~/utils/scrollIntent'

import { getMotionDuration } from '../utils/motionTiming'

interface Frame { rect: DOMRect, opacity: string }

/** Animate only mounted, visible items. The caller retains data, scroll and virtualization ownership. */
export function useLayoutMotion(root: Ref<HTMLElement | null | undefined>, source: WatchSource, options: {
  selector?: string
  key?: string
  enabled?: () => boolean
  /**
   * The scroller holding the rows. When every removed row was off screen (a
   * batch reaching above the view), the first visible row keeps its place.
   */
  scroller?: Ref<HTMLElement | null | undefined>
} = {}) {
  const animations = new Set<Animation>()
  let generation = 0
  const selector = options.selector ?? '[data-motion-key]'
  const key = options.key ?? 'data-motion-key'
  const rows = () => Array.from(root.value?.querySelectorAll<HTMLElement>(selector) ?? []).filter(row => !row.matches('.list-leave-active'))
  const visible = (rect: DOMRect) => rect.bottom > 0 && rect.top < window.innerHeight && rect.width > 0 && rect.height > 0
  const cancel = () => {
    generation++
    for (const animation of animations)
      animation.cancel()
    animations.clear()
  }
  watch(source, async () => {
    const element = root.value
    if (!element || options.enabled?.() === false || !element.animate || prefersReducedMotion()) {
      cancel()
      return
    }
    const before = new Map<string, Frame>()
    const mounted = new Set<string>()
    for (const row of rows()) {
      mounted.add(row.getAttribute(key)!)
      const rect = row.getBoundingClientRect()
      if (visible(rect))
        before.set(row.getAttribute(key)!, { rect, opacity: getComputedStyle(row).opacity })
    }
    const scroller = options.scroller?.value
    const claim = scroller && claimScrollPosition(scroller)
    // Read the current painted positions before cancelling a rapid previous operation.
    cancel()
    const version = generation
    await nextTick()
    await nextTick()
    if (version !== generation || !before.size || !root.value)
      return
    const style = getComputedStyle(root.value)
    const duration = getMotionDuration(style, '--bew-duration-normal')
    const easing = style.getPropertyValue('--bew-ease-standard').trim() || 'ease-out'
    let after = rows().map(row => ({ row, rect: row.getBoundingClientRect() }))
    if (scroller && claim && ownsScrollPosition(scroller, claim)) {
      const present = new Map(after.map(({ row, rect }) => [row.getAttribute(key)!, rect]))
      const anchor = [...before].find(([id]) => present.has(id))
      const removedOffscreen = [...mounted].some(id => !present.has(id)) && [...before.keys()].every(id => present.has(id))
      if (anchor && removedOffscreen) {
        const shift = present.get(anchor[0])!.top - anchor[1].rect.top
        if (Math.abs(shift) >= 0.5) {
          void scrollToPosition(scroller, scroller.scrollTop + shift)
          after = rows().map(row => ({ row, rect: row.getBoundingClientRect() }))
        }
      }
    }
    for (const { row, rect } of after) {
      if (!visible(rect))
        continue
      const old = before.get(row.getAttribute(key)!)
      const x = old ? old.rect.left - rect.left : 0
      const y = old ? old.rect.top - rect.top : 0
      if (old && Math.abs(x) < 0.5 && Math.abs(y) < 0.5 && Number(old.opacity) === 1)
        continue
      // Cards retain their final typography and cover aspect ratio throughout.
      // Only entering (or partly faded) rows animate opacity: a moving row stays
      // opaque, so blur layers inside it keep sampling (no backdrop root).
      const fade = !old || Number(old.opacity) < 1
      const animation = row.animate([
        { transform: `translate(${x}px, ${y}px)`, ...fade && { opacity: old?.opacity ?? 0 } },
        { transform: 'translate(0, 0)', ...fade && { opacity: 1 } },
      ], { duration, easing })
      animations.add(animation)
      void animation.finished.catch(() => {}).then(() => animations.delete(animation))
    }
  }, { flush: 'pre' })
  onScopeDispose(cancel)
  return { cancel }
}
