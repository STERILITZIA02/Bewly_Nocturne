export const PHOTO_VIEWER_SELECTOR = [
  '.pswp.pswp--open',
  '.bewly-opus-viewer.is-open',
  '.moment-image-viewer',
  '.photo-imager-container',
].join(', ')

const PHOTO_VIEWER_HOST_SELECTOR = '.pswp, .bewly-opus-viewer, .moment-image-viewer, .photo-imager-container'

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

/**
 * Track only viewer candidates, including the extension's shadow tree. Normal
 * player/comment mutations do not trigger full-document visibility scans.
 */
export function observePhotoViewerState(onChange: (open: boolean) => void, documentRoot: Document = document): () => void {
  const candidates = new Set<Element>()
  let shadow: ShadowRoot | undefined
  let frame: number | undefined
  let previous: boolean | undefined
  let disposed = false
  let observer: MutationObserver
  const options: MutationObserverInit = { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden'] }

  function collect(root: ParentNode) {
    let added = false
    const add = (element: Element) => {
      if (!candidates.has(element)) {
        candidates.add(element)
        added = true
      }
    }
    if (root instanceof Element && root.matches(PHOTO_VIEWER_HOST_SELECTOR))
      add(root)
    root.querySelectorAll(PHOTO_VIEWER_HOST_SELECTOR).forEach(add)
    return added
  }
  function check() {
    frame = undefined
    if (disposed)
      return
    for (const candidate of candidates) {
      if (!candidate.isConnected || !candidate.matches(PHOTO_VIEWER_HOST_SELECTOR))
        candidates.delete(candidate)
    }
    const open = [...candidates].some(candidate => candidate.matches(PHOTO_VIEWER_SELECTOR) && isElementVisible(candidate))
    if (previous !== open) {
      previous = open
      onChange(open)
    }
  }
  function bindShadow() {
    const next = documentRoot.getElementById('bewly')?.shadowRoot ?? undefined
    if (next === shadow)
      return false
    shadow = next
    observer.disconnect()
    observer.observe(documentRoot, options)
    if (shadow) {
      collect(shadow)
      observer.observe(shadow, options)
    }
    return true
  }
  observer = new MutationObserver((records) => {
    let changed = false
    let structureChanged = false
    for (const record of records) {
      if (record.type === 'childList') {
        structureChanged = true
        for (const node of Array.from(record.addedNodes)) {
          if (node instanceof Element)
            changed = collect(node) || changed
        }
      }
      const target = record.target
      if (record.type === 'attributes' && target instanceof Element && target.matches(PHOTO_VIEWER_HOST_SELECTOR)) {
        candidates.add(target)
        changed = true
      }
      if (!changed) {
        changed = [...candidates].some(candidate => !candidate.isConnected || target.contains(candidate)
          || candidate.contains(target) || (shadow && candidate.getRootNode() === shadow && target.contains(shadow.host)))
      }
    }
    if (structureChanged)
      changed = bindShadow() || changed
    if (changed && frame === undefined)
      frame = requestAnimationFrame(check)
  })
  collect(documentRoot)
  observer.observe(documentRoot, options)
  bindShadow()
  check()
  return () => {
    disposed = true
    observer.disconnect()
    if (frame !== undefined)
      cancelAnimationFrame(frame)
    candidates.clear()
  }
}
