import type { Ref, WatchSource } from 'vue'
import { nextTick, onScopeDispose, watch } from 'vue'

interface Frame { rect: DOMRect, opacity: string }

/** Animate only mounted, visible items. The caller retains data, scroll and virtualization ownership. */
export function useLayoutMotion(root: Ref<HTMLElement | null>, source: WatchSource, options: {
  selector?: string
  key?: string
  enabled?: () => boolean
} = {}) {
  const animations = new Set<Animation>()
  let generation = 0
  const selector = options.selector ?? '[data-motion-key]'
  const key = options.key ?? 'data-motion-key'
  const rows = () => Array.from(root.value?.querySelectorAll<HTMLElement>(selector) ?? []).filter(row => !row.matches('.library-list-leave-active, .list-leave-active'))
  const visible = (rect: DOMRect) => rect.bottom > 0 && rect.top < window.innerHeight && rect.width > 0 && rect.height > 0
  const cancel = () => {
    generation++
    for (const animation of animations)
      animation.cancel()
    animations.clear()
  }
  watch(source, async () => {
    const element = root.value
    if (!element || options.enabled?.() === false || !element.animate || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      cancel()
      return
    }
    const before = new Map<string, Frame>()
    for (const row of rows()) {
      const rect = row.getBoundingClientRect()
      if (visible(rect))
        before.set(row.getAttribute(key)!, { rect, opacity: getComputedStyle(row).opacity })
    }
    // Read the current painted positions before cancelling a rapid previous operation.
    cancel()
    const version = generation
    await nextTick()
    await nextTick()
    if (version !== generation || !before.size || !root.value)
      return
    const style = getComputedStyle(root.value)
    const duration = Number.parseFloat(style.getPropertyValue('--bew-duration-normal')) || 200
    const easing = style.getPropertyValue('--bew-ease-standard').trim() || 'ease-out'
    const after = rows().map(row => ({ row, rect: row.getBoundingClientRect() }))
    for (const { row, rect } of after) {
      if (!visible(rect))
        continue
      const old = before.get(row.getAttribute(key)!)
      const x = old ? old.rect.left - rect.left : 0
      const y = old ? old.rect.top - rect.top : 0
      if (old && Math.abs(x) < 0.5 && Math.abs(y) < 0.5 && Number(old.opacity) === 1)
        continue
      // Cards retain their final typography and cover aspect ratio throughout.
      const animation = row.animate([
        { transform: `translate(${x}px, ${y}px)`, opacity: old?.opacity ?? 0 },
        { transform: 'translate(0, 0)', opacity: 1 },
      ], { duration, easing })
      animations.add(animation)
      void animation.finished.catch(() => {}).then(() => animations.delete(animation))
    }
  }, { flush: 'pre' })
  onScopeDispose(cancel)
  return { cancel }
}
