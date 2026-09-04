const TRANSFER_ATTRIBUTE = 'data-bewly-comment-transfer'
const patchedPrototypes = new WeakSet<object>()

function isCommentTransfer(element: HTMLElement): boolean {
  if (!element.isConnected)
    return false
  let current: Element | null = element
  while (current) {
    if (current.hasAttribute(TRANSFER_ATTRIBUTE))
      return true
    const root = current.getRootNode()
    current = current.parentElement ?? (root instanceof ShadowRoot ? root.host : null)
  }
  return false
}

/** Install before customElements.define, which captures lifecycle callbacks. */
export function patchCommentTransferLifecycle(name: string, constructor: unknown) {
  if (!name.startsWith('bili-') || typeof constructor !== 'function')
    return
  const prototype = constructor.prototype
  if (!prototype || patchedPrototypes.has(prototype))
    return
  patchedPrototypes.add(prototype)
  for (const name of ['connectedCallback', 'disconnectedCallback'] as const) {
    const original = prototype[name]
    if (typeof original !== 'function')
      continue
    prototype[name] = function (this: HTMLElement, ...args: unknown[]) {
      // Bilibili unloads its list, editor and lazy-load task on disconnect.
      // Only our synchronous move of the intact tree skips that lifecycle.
      if (isCommentTransfer(this)) {
        if (name === 'connectedCallback')
          (this as HTMLElement & { requestUpdate?: () => unknown }).requestUpdate?.()
        return
      }
      return original.apply(this, args)
    }
  }
}

export function transferCommentNode(node: HTMLElement, parent: Node, before: Node | null = null) {
  const hasComments = !!node.querySelector('bili-comments')
  if (hasComments)
    node.setAttribute(TRANSFER_ATTRIBUTE, '')
  try {
    parent.insertBefore(node, before)
  }
  finally {
    if (hasComments)
      node.removeAttribute(TRANSFER_ATTRIBUTE)
  }
}
