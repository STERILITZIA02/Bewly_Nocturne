import type { Ref } from 'vue'
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'

import { getMotionDuration } from '~/utils/motionTiming'

interface Frame { rect: DOMRect, opacity: string }
interface Leave { finish: () => void, restore: () => void }

/** FLIP only mounted, visible rows; the existing window still owns list geometry. */
export function useHistoryDayMotion(container: Ref<HTMLElement | null>) {
  const active = ref(false)
  const animations = new Map<HTMLElement, Animation>()
  const leaves = new Map<HTMLElement, Leave>()
  let frames = new Map<string, Frame>()
  let generation = 0
  let duration = 200
  let easing = 'ease-out'
  let restoreHeight: (() => void) | undefined

  function rows() {
    return Array.from(container.value?.querySelectorAll<HTMLElement>('[data-history-cell]') ?? [])
  }
  function visible(rect: DOMRect) {
    return rect.bottom >= 0 && rect.top <= window.innerHeight && rect.width > 0 && rect.height > 0
  }
  function animate(element: HTMLElement, keyframes: Keyframe[], time = duration) {
    const animation = element.animate(keyframes, { duration: time, easing })
    animations.set(element, animation)
    void animation.finished.catch(() => {}).then(() => {
      if (animations.get(element) === animation)
        animations.delete(element)
    })
    return animation
  }
  function cancel() {
    generation++
    for (const animation of animations.values())
      animation.cancel()
    animations.clear()
    for (const leave of [...leaves.values()])
      leave.finish()
    leaves.clear()
    restoreHeight?.()
    restoreHeight = undefined
    frames.clear()
    active.value = false
  }
  function beforeLeave(element: Element) {
    const row = element as HTMLElement
    const frame = frames.get(row.dataset.historyCell ?? '')
    const parent = row.offsetParent as HTMLElement | null
    if (!frame || !parent)
      return
    const origin = parent.getBoundingClientRect()
    const style = row.getAttribute('style')
    const inert = row.hasAttribute('inert')
    const hidden = row.getAttribute('aria-hidden')
    const restore = () => {
      if (style === null)
        row.removeAttribute('style')
      else row.setAttribute('style', style)
      if (!inert)
        row.removeAttribute('inert')
      if (hidden === null)
        row.removeAttribute('aria-hidden')
      else row.setAttribute('aria-hidden', hidden)
      delete row.dataset.historyLeaving
    }
    Object.assign(row.style, {
      position: 'absolute',
      top: `${frame.rect.top - origin.top}px`,
      left: `${frame.rect.left - origin.left}px`,
      width: `${frame.rect.width}px`,
      height: `${frame.rect.height}px`,
      margin: '0',
      pointerEvents: 'none',
      zIndex: '0',
    })
    row.setAttribute('inert', '')
    row.setAttribute('aria-hidden', 'true')
    row.dataset.historyLeaving = 'true'
    leaves.set(row, { finish: () => {}, restore })
  }
  function leave(element: Element, done: () => void) {
    const row = element as HTMLElement
    const pending = leaves.get(row)
    const frame = frames.get(row.dataset.historyCell ?? '')
    if (!pending || !frame) {
      done()
      return
    }
    let finished = false
    pending.finish = () => {
      if (finished)
        return
      finished = true
      leaves.delete(row)
      done()
      pending.restore()
    }
    const animation = animate(row, [{ opacity: frame.opacity }, { opacity: 0 }])
    void animation.finished.then(pending.finish, pending.finish)
  }
  function leaveCancelled(element: Element) {
    const row = element as HTMLElement
    const pending = leaves.get(row)
    leaves.delete(row)
    animations.get(row)?.cancel()
    animations.delete(row)
    pending?.restore()
  }
  const transitionProps = computed(() => active.value ? { onBeforeLeave: beforeLeave, onLeave: leave, onLeaveCancelled: leaveCancelled } : {})

  async function run(change: () => void, keyboard = false) {
    const root = container.value
    if (!root || typeof root.animate !== 'function' || keyboard || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      cancel()
      const version = generation
      active.value = true // Also suppress the generic list enter/leave CSS.
      change()
      await nextTick()
      await nextTick()
      if (version === generation)
        active.value = false
      return
    }
    const before = new Map<string, Frame>()
    const rootStyle = getComputedStyle(root)
    const verticalInsets = ['paddingTop', 'paddingBottom', 'borderTopWidth', 'borderBottomWidth']
      .reduce((sum, property) => sum + (Number.parseFloat(rootStyle[property as keyof CSSStyleDeclaration] as string) || 0), 0)
    const previousHeight = Math.max(0, root.getBoundingClientRect().height - verticalInsets)
    for (const row of rows()) {
      const rect = row.getBoundingClientRect()
      if (visible(rect))
        before.set(row.dataset.historyCell!, { rect, opacity: getComputedStyle(row).opacity })
    }
    // Capture the displayed positions before cancelling: reversing a running
    // fold starts at the current frame, not its previous destination.
    cancel()
    frames = before
    const style = getComputedStyle(root)
    duration = getMotionDuration(style, '--bew-duration-normal')
    easing = style.getPropertyValue('--bew-ease-standard').trim() || 'ease-out'
    const version = generation
    active.value = true
    const originalMinHeight = root.style.minHeight
    restoreHeight = () => {
      root.style.minHeight = originalMinHeight
    }
    root.style.minHeight = `${previousHeight}px`
    change()
    await nextTick()
    await nextTick() // Let the virtual window restore its anchor before FLIP.
    if (version !== generation)
      return
    // Keep the scroll range from clamping in a single frame near the bottom.
    // Only the outer accordion's empty extent changes; card sizes stay fixed.
    const grid = root.querySelector<HTMLElement>('.history-window')
    const targetHeight = grid?.getBoundingClientRect().height ?? previousHeight
    if (targetHeight < previousHeight) {
      animate(root, [{ minHeight: `${previousHeight}px` }, { minHeight: `${targetHeight}px` }])
    }
    else {
      restoreHeight?.()
      restoreHeight = undefined
    }
    const after = rows().filter(row => !row.dataset.historyLeaving).map(row => ({ row, rect: row.getBoundingClientRect() }))
    for (const { row, rect } of after) {
      if (!visible(rect))
        continue
      const previous = before.get(row.dataset.historyCell!)
      const x = previous ? previous.rect.left - rect.left : 0
      const y = previous ? previous.rect.top - rect.top : 0
      if (!previous || x || y || Number(previous.opacity) < 1) {
        animate(row, [
          { transform: `translate(${x}px, ${y}px)`, opacity: previous?.opacity ?? 0 },
          { transform: 'translate(0, 0)', opacity: 1 },
        ])
      }
    }
    await Promise.allSettled([...animations.values()].map(animation => animation.finished))
    if (version === generation) {
      restoreHeight?.()
      restoreHeight = undefined
      active.value = false
      frames.clear()
    }
  }
  onBeforeUnmount(cancel)
  return { active, transitionProps, run, cancel }
}
