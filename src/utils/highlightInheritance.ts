let supported: boolean | undefined

/** Probe both the native document and the extension's shadow-tree inheritance. */
export function supportsHighlightInheritance() {
  if (supported !== undefined)
    return supported
  const css = '.bewly-selection-probe::selection { background-color: rgb(1, 2, 3) }'
  const style = document.createElement('style')
  style.textContent = css
  const parent = document.createElement('div')
  parent.className = 'bewly-selection-probe'
  parent.style.cssText = 'position:fixed;width:0;height:0;overflow:hidden;pointer-events:none'
  const child = document.createElement('span')
  const host = document.createElement('div')
  const shadow = host.attachShadow({ mode: 'open' })
  const shadowParent = parent.cloneNode() as HTMLElement
  const shadowChild = child.cloneNode() as HTMLElement
  shadowParent.append(shadowChild)
  shadow.append(style.cloneNode(true), shadowParent)
  parent.append(child, host)
  document.documentElement.append(style, parent)
  supported = [child, shadowChild].every(element => getComputedStyle(element, '::selection').backgroundColor === 'rgb(1, 2, 3)')
  parent.remove()
  style.remove()
  return supported
}
