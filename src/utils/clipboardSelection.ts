export interface ClipboardSelection {
  text: string
  html?: string
}

function getTextControlSelection(target: EventTarget | null): ClipboardSelection | null {
  if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement))
    return null

  const start = target.selectionStart
  const end = target.selectionEnd
  if (start == null || end == null || start === end)
    return null
  return { text: target.value.slice(start, end) }
}

export function getClipboardSelection(event: ClipboardEvent): ClipboardSelection | null {
  const textControlSelection = getTextControlSelection(event.target)
  if (textControlSelection)
    return textControlSelection

  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed)
    return null

  const text = selection.toString()
  if (!text)
    return null

  const container = document.createElement('div')
  for (let index = 0; index < selection.rangeCount; index++)
    container.append(selection.getRangeAt(index).cloneContents())

  return {
    text,
    html: container.childElementCount > 0 ? container.innerHTML : undefined,
  }
}

export function cleanClipboardSelectionHtml(
  html: string,
  cleanText: (text: string) => string,
  expectedText: string,
): string | null {
  const container = document.createElement('div')
  container.innerHTML = html
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
  let node = walker.nextNode()
  while (node) {
    node.textContent = cleanText(node.textContent ?? '')
    node = walker.nextNode()
  }
  return container.textContent === expectedText ? container.innerHTML : null
}
