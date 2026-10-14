let lockCount = 0
let restoreStyles: (() => void) | undefined

function preserveProperties(element: HTMLElement, properties: string[]) {
  const saved = properties.map(name => [name, element.style.getPropertyValue(name), element.style.getPropertyPriority(name)] as const)
  return () => {
    for (const [name, value, priority] of saved) {
      if (value)
        element.style.setProperty(name, value, priority)
      else element.style.removeProperty(name)
    }
  }
}

function getDocumentElements() {
  if (typeof document === 'undefined')
    return null

  const { documentElement, body } = document
  if (!documentElement || !body)
    return null

  return { documentElement, body }
}

function isScrollable(element: HTMLElement, overflowY: string) {
  if (overflowY === 'hidden')
    return false
  return element.scrollHeight > element.clientHeight
}

function getScrollContainer(documentElement: HTMLElement, body: HTMLElement) {
  const documentStyle = window.getComputedStyle(documentElement)
  const bodyStyle = window.getComputedStyle(body)
  const documentScrollable = isScrollable(documentElement, documentStyle.overflowY)
  const bodyScrollable = isScrollable(body, bodyStyle.overflowY)

  if (bodyScrollable && !documentScrollable)
    return body

  return documentElement
}

export function lockPageScroll() {
  const elements = getDocumentElements()
  if (!elements)
    return

  lockCount += 1
  if (lockCount > 1)
    return

  const { documentElement, body } = elements
  const scrollContainer = getScrollContainer(documentElement, body)
  const paddingRight = Number.parseFloat(window.getComputedStyle(scrollContainer).paddingRight) || 0
  const restoreHtml = preserveProperties(documentElement, ['overflow-x', 'overflow-y'])
  const restoreBody = preserveProperties(body, ['overflow-x', 'overflow-y'])
  const restorePadding = preserveProperties(scrollContainer, ['padding-right'])
  const beforeWidth = documentElement.clientWidth
  documentElement.style.setProperty('overflow', 'hidden', 'important')
  body.style.setProperty('overflow', 'hidden', 'important')
  // Windows classic scrollbars consume layout width. Overlay scrollbars and a
  // stable gutter do not release space when locked, so must not be compensated.
  const scrollbarWidth = Math.max(0, documentElement.clientWidth - beforeWidth)
  if (scrollbarWidth > 0) {
    scrollContainer.style.setProperty('padding-right', `${paddingRight + scrollbarWidth}px`, 'important')
  }
  restoreStyles = () => {
    documentElement.style.removeProperty('overflow')
    body.style.removeProperty('overflow')
    restoreHtml()
    restoreBody()
    if (scrollbarWidth > 0)
      restorePadding()
  }
}

export function unlockPageScroll() {
  const elements = getDocumentElements()
  if (!elements)
    return

  if (lockCount === 0)
    return

  lockCount -= 1
  if (lockCount > 0)
    return

  restoreStyles?.()
  restoreStyles = undefined
}
