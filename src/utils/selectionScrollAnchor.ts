import { getMotionDuration } from './motionTiming'

const owners = new WeakMap<HTMLElement, () => void>()

/** One short-lived owner per list; user scroll intent always takes precedence. */
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
  timer = setTimeout(cancel, duration + 50)
  return cancel
}
