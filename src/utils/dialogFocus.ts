import { tabbable } from 'tabbable'
import type { InjectionKey } from 'vue'

export const DIALOG_FOCUS_OWNER: InjectionKey<string> = Symbol('dialog-focus-owner')

export function getDeepActiveElement(root: Document | ShadowRoot): Element | null {
  let active = root.activeElement
  while (active?.shadowRoot?.activeElement)
    active = active.shadowRoot.activeElement
  return active
}

export function getTopDialog(root: ParentNode): HTMLElement | undefined {
  return Array.from(root.querySelectorAll<HTMLElement>('[data-bewly-dialog-active]'))
    .filter((dialog) => {
      if (!dialog.isConnected || dialog.closest('[inert]'))
        return false
      const style = getComputedStyle(dialog)
      return style.display !== 'none' && style.visibility !== 'hidden'
    })
    .sort((left, right) => (Number.parseInt(getComputedStyle(left).zIndex) || 0) - (Number.parseInt(getComputedStyle(right).zIndex) || 0))
    .at(-1)
}

export function ownsDialogKeyboard(dialog: HTMLElement, event: KeyboardEvent): boolean {
  if (getTopDialog(dialog.getRootNode() as ParentNode) !== dialog)
    return false
  const owner = dialog.dataset.bewlyDialogActive
  let inside = false
  for (const node of event.composedPath()) {
    if (!(node instanceof HTMLElement))
      continue
    if (dialog.contains(node)) {
      inside = true
      continue
    }
    if (node.contains(dialog))
      continue
    if (node.dataset.bewlyDialogOwner === owner)
      return true
    // An independently managed viewer or popup keeps its own keyboard path.
    if (node.matches('[aria-modal="true"], [role="alertdialog"], [role="menu"], [role="listbox"]'))
      return false
  }
  if (inside)
    return true
  const active = getDeepActiveElement(dialog.ownerDocument)
  return !active || active === dialog.ownerDocument.body || active === dialog.ownerDocument.documentElement || dialog.contains(active)
}

export function moveDialogTabFocus(dialog: HTMLElement, panel: HTMLElement, event: KeyboardEvent) {
  const focusable = tabbable(panel, { getShadowRoot: true })
  const owner = dialog.dataset.bewlyDialogActive
  const portal = event.composedPath().find((node): node is HTMLElement => (
    node instanceof HTMLElement && node.dataset.bewlyDialogOwner === owner
  ))
  // Tab out of a Select's teleported list resumes next to its trigger, rather
  // than following the portal's unrelated position under the app root.
  const active = portal
    ? focusable.find(element => element.getAttribute('aria-controls') === portal.id) ?? getDeepActiveElement(dialog.ownerDocument)
    : getDeepActiveElement(dialog.ownerDocument)
  const index = focusable.indexOf(active as HTMLElement)
  const nextIndex = event.shiftKey
    ? (index <= 0 ? focusable.length - 1 : index - 1)
    : (index < 0 || index === focusable.length - 1 ? 0 : index + 1)
  event.preventDefault()
  ;(focusable[nextIndex] || panel).focus({ preventScroll: true })
}

export function restoreOverlayFocus(overlay: HTMLElement | null, target: HTMLElement | null) {
  if (!target?.isConnected || target.closest('[inert]'))
    return
  const topDialog = getTopDialog(target.getRootNode() as ParentNode)
  if (topDialog && !topDialog.contains(target))
    return
  const active = getDeepActiveElement(target.ownerDocument)
  const otherModal = active?.closest('[aria-modal="true"]')
  if (otherModal && !overlay?.contains(otherModal) && !otherModal.contains(target))
    return
  target.focus({ preventScroll: true })
}
