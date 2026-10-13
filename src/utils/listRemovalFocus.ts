import { getDeepActiveElement } from './dialogFocus'

/** Capture only the focused row before a write disables its button. Call on success. */
export function captureListRemovalFocus(trigger?: EventTarget | null) {
  const element = trigger instanceof HTMLElement ? trigger : null
  const row = element?.closest<HTMLElement>('.popover-card')
  const focused = row?.contains(getDeepActiveElement(document))
  const popover = row?.closest<HTMLElement>('.bew-popover')
  const rows = Array.from(popover?.querySelectorAll<HTMLElement>('.popover-card') || [])
  const index = row ? rows.indexOf(row) : -1
  const candidates = [...rows.slice(index + 1), ...rows.slice(0, index).reverse()]
  return () => {
    if (!focused || !popover?.isConnected)
      return
    const active = getDeepActiveElement(document)
    if (active && active !== document.body && active !== element && !row?.contains(active))
      return
    const selector = 'a[href], button:not(:disabled), [tabindex="0"]'
    const next = candidates.find(candidate => candidate.isConnected && candidate.getAttribute('aria-hidden') !== 'true')?.querySelector<HTMLElement>(selector)
      || popover.querySelector('.bew-popover__header')?.querySelector<HTMLElement>(selector)
    next?.focus({ preventScroll: true })
  }
}
