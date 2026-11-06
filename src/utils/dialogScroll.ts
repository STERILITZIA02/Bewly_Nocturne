const locks = new WeakMap<HTMLElement, { owners: number, value: string, priority: string }>()

/** Nested dialogs share the actual background viewport until the last owner closes. */
export function lockDialogScroll(viewport: HTMLElement) {
  let lock = locks.get(viewport)
  if (!lock) {
    lock = { owners: 0, value: viewport.style.getPropertyValue('overflow-y'), priority: viewport.style.getPropertyPriority('overflow-y') }
    locks.set(viewport, lock)
    viewport.style.setProperty('overflow-y', 'hidden', 'important')
  }
  lock.owners++
  return () => {
    if (--lock.owners)
      return
    if (lock.value)
      viewport.style.setProperty('overflow-y', lock.value, lock.priority)
    else viewport.style.removeProperty('overflow-y')
    locks.delete(viewport)
  }
}
