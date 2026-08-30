export const PHOTO_VIEWER_SELECTOR = [
  '.pswp.pswp--open',
  '.bewly-opus-viewer.is-open',
  '.moment-image-viewer',
  '.photo-imager-container',
].join(', ')

function isElementVisible(element: Element): boolean {
  if (!(element instanceof HTMLElement || element instanceof SVGElement))
    return false
  const style = getComputedStyle(element)
  const rect = element.getBoundingClientRect()
  return rect.width > 0
    && rect.height > 0
    && style.display !== 'none'
    && style.visibility !== 'hidden'
}

function getKnownRoots(documentRoot: Document): ParentNode[] {
  const roots: ParentNode[] = [documentRoot]
  const bewlyShadowRoot = documentRoot.querySelector('#bewly')?.shadowRoot
  if (bewlyShadowRoot)
    roots.push(bewlyShadowRoot)
  return roots
}

export function isPhotoViewerOpen(documentRoot: Document = document): boolean {
  return getKnownRoots(documentRoot).some(root => (
    Array.from(root.querySelectorAll(PHOTO_VIEWER_SELECTOR)).some(isElementVisible)
  ))
}
