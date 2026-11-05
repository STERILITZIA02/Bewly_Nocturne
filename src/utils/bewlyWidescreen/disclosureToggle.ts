// @unocss-include
import { DISCLOSURE_TOGGLE_CLASS } from '~/utils/bewlyWidescreen/constants'
import { t } from '~/utils/bewlyWidescreen/labels'

export interface DisclosureLabels {
  collapse: string
  expand: string
}

/** A collection's episode list and each bangumi section's list. */
export const EPISODE_LABELS: DisclosureLabels = { collapse: 'widescreen.collapse_episodes', expand: 'widescreen.expand_episodes' }

/**
 * The rail's one fold control (the info card, a collection, each bangumi
 * section): a chevron button. `aria-expanded` carries the state; layout.ts
 * turns the chevron from it, so open it points the way the content folds
 * (up) and folded the way it opens (down).
 */
export function createDisclosureToggle(labels: DisclosureLabels, open: boolean) {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = DISCLOSURE_TOGGLE_CLASS
  const icon = document.createElement('span')
  icon.className = `i-tabler:chevron-down ${DISCLOSURE_TOGGLE_CLASS}__icon`
  icon.setAttribute('aria-hidden', 'true')
  button.append(icon)
  setDisclosureToggle(button, labels, open)
  return button
}

export function setDisclosureToggle(button: HTMLElement, labels: DisclosureLabels, open: boolean) {
  const label = t(open ? labels.collapse : labels.expand)
  if (button.getAttribute('aria-expanded') !== String(open))
    button.setAttribute('aria-expanded', String(open))
  if (button.getAttribute('aria-label') !== label)
    button.setAttribute('aria-label', label)
}
