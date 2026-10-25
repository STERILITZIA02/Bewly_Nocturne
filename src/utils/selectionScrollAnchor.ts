import { getMotionDuration } from './motionTiming'
import { scrollToPosition } from './scrollIntent'

const owners = new WeakMap<HTMLElement, () => void>()

/**
 * Glides the list so the opened row shows whole (user-specified): one cut off
 * at the top or bottom moves to the nearest edge, a margin inside it; one
 * taller than the list starts at its top.
 */
export function revealSelectionRow(row: HTMLElement, viewport: HTMLElement) {
  if (!row.isConnected)
    return
  const bounds = viewport.getBoundingClientRect()
  const rect = row.getBoundingClientRect()
  const margin = Number.parseFloat(getComputedStyle(row).getPropertyValue('--bew-space-2')) || 0
  const delta = rect.top < bounds.top + margin || rect.height > bounds.height - margin * 2
    ? rect.top - bounds.top - margin
    : Math.max(0, rect.bottom - bounds.bottom + margin)
  if (Math.abs(delta) < 1)
    return
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  void scrollToPosition(viewport, viewport.scrollTop + delta, reduced ? 'auto' : 'smooth')
}

/**
 * One short-lived owner per list; user scroll intent always takes precedence.
 * Once the row has opened undisturbed, it is glided into full view.
 */
export function keepSelectionScrollAnchor(row: HTMLElement, viewport: HTMLElement) {
  owners.get(viewport)?.()
  if (typeof ResizeObserver !== 'function')
    return () => {}
  const bounds = viewport.getBoundingClientRect()
  const trigger = row.querySelector<HTMLElement>('button') ?? row
  const top = Math.max(bounds.top, Math.min(trigger.getBoundingClientRect().top, bounds.bottom - trigger.offsetHeight))
  const previousAnchor = viewport.style.overflowAnchor
  viewport.style.overflowAnchor = 'none'
  let timer: ReturnType<typeof setTimeout>
  let active = true
  const observer = new ResizeObserver(() => {
    if (row.isConnected)
      viewport.scrollTop += trigger.getBoundingClientRect().top - top
  })
  const cancel = () => {
    if (!active)
      return
    active = false
    clearTimeout(timer)
    observer.disconnect()
    for (const type of ['wheel', 'touchstart', 'pointerdown', 'keydown'])
      viewport.removeEventListener(type, cancel)
    viewport.style.overflowAnchor = previousAnchor
    if (owners.get(viewport) === cancel)
      owners.delete(viewport)
  }
  owners.set(viewport, cancel)
  // Only the outgoing and incoming rows affect this handoff.
  const previous = viewport.querySelector<HTMLElement>('.favorite-sidebar-item.is-active')
  if (previous)
    observer.observe(previous)
  observer.observe(row)
  for (const type of ['wheel', 'touchstart', 'pointerdown', 'keydown'])
    viewport.addEventListener(type, cancel, { passive: true })
  const duration = getMotionDuration(getComputedStyle(row), '--bew-duration-normal')
  timer = setTimeout(() => {
    cancel()
    revealSelectionRow(row, viewport)
  }, duration + 50)
  return cancel
}
