export function getLayoutEditAncestors(element: Element): Element[] {
  const ancestors: Element[] = []
  let current: Element | null = element
  while (current) {
    ancestors.push(current)
    const root = current.getRootNode()
    current = current.parentElement ?? (root instanceof ShadowRoot ? root.host : null)
  }
  return ancestors
}

export function getLayoutEditViewport() {
  const viewport = window.visualViewport
  const left = viewport?.offsetLeft ?? 0
  const top = viewport?.offsetTop ?? 0
  return { left, top, right: left + (viewport?.width ?? window.innerWidth), bottom: top + (viewport?.height ?? window.innerHeight) }
}

function establishesContainingBlock(style: CSSStyleDeclaration, position: string) {
  if (style.display === 'contents')
    return false
  return (position === 'absolute' && style.position !== 'static')
    || ['transform', 'translate', 'rotate', 'scale', 'perspective', 'filter', 'backdrop-filter'].some((property) => {
      const value = style.getPropertyValue(property)
      return value !== '' && value !== 'none'
    })
    || /layout|paint|strict|content/.test(style.contain)
    || /transform|translate|rotate|scale|perspective|filter|contain/.test(style.willChange)
    || style.contentVisibility === 'auto'
}

/** Measure the painted box; clipping trims the outline instead of inventing a new edge. */
export function measureLayoutEditTarget(element: Element) {
  if (!element.isConnected || !element.getClientRects().length)
    return
  const rect = element.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0)
    return
  const visible = getLayoutEditViewport()
  const ancestors = getLayoutEditAncestors(element)
  const styles = ancestors.map(node => getComputedStyle(node))
  let shapeElement = element
  let shapeStyle = styles[0]
  let shapeBounds = rect
  if (styles[0].visibility === 'hidden' || styles[0].visibility === 'collapse')
    return
  let positioned = ''
  for (const [index, node] of ancestors.entries()) {
    const style = styles[index]
    if (style.display === 'none' || style.contentVisibility === 'hidden' || (Number(style.opacity) === 0 && style.opacity !== ''))
      return
    if (positioned && establishesContainingBlock(style, positioned))
      positioned = ''
    // Overflow between an out-of-flow box and its containing block does not
    // clip that box. In particular, the fixed app escapes the home body's 0px box.
    const clipsDescendant = index > 0 && !positioned && style.display !== 'contents'
    if (!positioned && (style.position === 'fixed' || style.position === 'absolute'))
      positioned = style.position
    const documentRoot = node.ownerDocument.documentElement
    const rootStyle = styles.at(-1)!
    const propagatesToViewport = node === documentRoot || (node === node.ownerDocument.body
      && rootStyle.overflowX === 'visible' && rootStyle.overflowY === 'visible'
      && !/layout|paint|strict|content/.test(`${style.contain} ${rootStyle.contain}`))
    if (!clipsDescendant || propagatesToViewport)
      continue
    const paintClip = /paint|strict|content/.test(style.contain) || style.contentVisibility === 'auto'
    const clipsX = paintClip || /hidden|clip|auto|scroll/.test(style.overflowX)
    const clipsY = paintClip || /hidden|clip|auto|scroll/.test(style.overflowY)
    if (!clipsX && !clipsY)
      continue
    const bounds = node.getBoundingClientRect()
    const scaleX = node instanceof HTMLElement && node.offsetWidth ? bounds.width / node.offsetWidth : 1
    const scaleY = node instanceof HTMLElement && node.offsetHeight ? bounds.height / node.offsetHeight : 1
    const clip = {
      left: bounds.left + node.clientLeft * scaleX,
      right: bounds.left + (node.clientLeft + node.clientWidth) * scaleX,
      top: bounds.top + node.clientTop * scaleY,
      bottom: bounds.top + (node.clientTop + node.clientHeight) * scaleY,
    }
    // Avatars and covers often put the clipping radius on their wrapper.
    if (clipsX && clipsY && [bounds, clip].some(box => (['top', 'right', 'bottom', 'left'] as const).every(edge => Math.abs(box[edge] - rect[edge]) < 0.5))
      && [shapeStyle.borderTopLeftRadius, shapeStyle.borderTopRightRadius, shapeStyle.borderBottomRightRadius, shapeStyle.borderBottomLeftRadius].every(value => !Number.parseFloat(value))) {
      shapeElement = node
      shapeStyle = style
      shapeBounds = bounds
    }
    if (clipsX) {
      visible.left = Math.max(visible.left, clip.left)
      visible.right = Math.min(visible.right, clip.right)
    }
    if (clipsY) {
      visible.top = Math.max(visible.top, clip.top)
      visible.bottom = Math.min(visible.bottom, clip.bottom)
    }
  }
  visible.left = Math.max(visible.left, rect.left)
  visible.right = Math.min(visible.right, rect.right)
  visible.top = Math.max(visible.top, rect.top)
  visible.bottom = Math.min(visible.bottom, rect.bottom)
  if (visible.left >= visible.right || visible.top >= visible.bottom)
    return
  const scaleX = shapeElement instanceof HTMLElement && shapeElement.offsetWidth ? shapeBounds.width / shapeElement.offsetWidth : 1
  const scaleY = shapeElement instanceof HTMLElement && shapeElement.offsetHeight ? shapeBounds.height / shapeElement.offsetHeight : 1
  function radius(value: string, insetX: number, insetY: number) {
    const [x, y = x] = value.split(' ')
    const scale = (length: string, factor: number, size: number, inset: number) => {
      if (length.endsWith('%') && shapeElement === element)
        return length
      const pixels = length.endsWith('%') ? Number.parseFloat(length) * size / 100 : Number.parseFloat(length || '0') * factor
      return `${Math.max(0, pixels - inset)}px`
    }
    return `${scale(x, scaleX, shapeBounds.width, insetX)} ${scale(y, scaleY, shapeBounds.height, insetY)}`
  }
  return {
    rect,
    visible: { ...visible, width: visible.right - visible.left, height: visible.bottom - visible.top },
    style: {
      top: `${rect.top}px`,
      left: `${rect.left}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      borderTopLeftRadius: radius(shapeStyle.borderTopLeftRadius, rect.left - shapeBounds.left, rect.top - shapeBounds.top),
      borderTopRightRadius: radius(shapeStyle.borderTopRightRadius, shapeBounds.right - rect.right, rect.top - shapeBounds.top),
      borderBottomRightRadius: radius(shapeStyle.borderBottomRightRadius, shapeBounds.right - rect.right, shapeBounds.bottom - rect.bottom),
      borderBottomLeftRadius: radius(shapeStyle.borderBottomLeftRadius, rect.left - shapeBounds.left, shapeBounds.bottom - rect.bottom),
      cornerShape: shapeStyle.getPropertyValue('corner-shape') || 'round',
      clipPath: `inset(${visible.top - rect.top}px ${rect.right - visible.right}px ${rect.bottom - visible.bottom}px ${visible.left - rect.left}px)`,
    },
  }
}
