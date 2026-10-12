const PLACEHOLDER = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs='
const ROOTS = 'body > #app, body > #i_cecream, body > .bilibili-gate-root'
const MEDIA = 'img, picture > source'

/** Release hidden native-home image resources without destroying native Vue/header owners. */
export function suspendHiddenHomepageImages(doc: Document = document) {
  if (!doc.body || !doc.documentElement.classList.contains('bewly-custom-homepage'))
    return () => {}
  const roots = new Map<Element, () => void>()
  function attach(root: Element) {
    const originals = new Map<Element, Map<string, string | null>>()
    const replacement = (attribute: string) => attribute === 'src' ? PLACEHOLDER : ''
    function restore(element: Element) {
      for (const [attribute, value] of originals.get(element) ?? []) {
        // A native update queued before disposal remains authoritative.
        if (element.getAttribute(attribute) === replacement(attribute)) {
          if (value === null)
            element.removeAttribute(attribute)
          else element.setAttribute(attribute, value)
        }
      }
      originals.delete(element)
    }
    function suspend(element: Element) {
      if (!element.matches(MEDIA) || element.closest('.bili-header'))
        return
      const attributes = element.tagName === 'IMG' ? ['src', 'srcset'] : ['srcset']
      let saved = originals.get(element)
      if (!saved && !attributes.some(attribute => element.hasAttribute(attribute)))
        return
      saved ??= new Map()
      originals.set(element, saved)
      for (const attribute of attributes) {
        const current = element.getAttribute(attribute)
        const blank = replacement(attribute)
        if (!saved.has(attribute) || current !== blank)
          saved.set(attribute, current)
        if (current !== blank)
          element.setAttribute(attribute, blank)
      }
    }
    const visit = (node: Node, action: (element: Element) => void) => {
      if (!(node instanceof Element))
        return
      action(node)
      node.querySelectorAll(MEDIA).forEach(action)
    }
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === 'attributes') {
          if (root.contains(record.target))
            suspend(record.target as Element)
        }
        else {
          record.addedNodes.forEach(node => visit(node, suspend))
          record.removedNodes.forEach(node => visit(node, (element) => {
            if (!root.contains(element))
              restore(element)
          }))
        }
      }
    })
    root.querySelectorAll(MEDIA).forEach(suspend)
    observer.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['src', 'srcset'] })
    return () => {
      observer.disconnect()
      for (const element of originals.keys())
        restore(element)
    }
  }
  function syncRoots() {
    const current = new Set(Array.from(doc.querySelectorAll(ROOTS)))
    for (const [root, release] of roots) {
      if (!current.has(root)) {
        release()
        roots.delete(root)
      }
    }
    for (const root of current) {
      if (!roots.has(root))
        roots.set(root, attach(root))
    }
  }
  const observer = new MutationObserver(syncRoots)
  observer.observe(doc.body, { childList: true })
  syncRoots()
  return () => {
    observer.disconnect()
    roots.forEach(release => release())
    roots.clear()
  }
}
