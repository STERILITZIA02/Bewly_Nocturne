import { PGC_REACT_BRIDGE_ATTRIBUTE } from '~/utils/bewlyWidescreen/constants'
import { parseVideoMetadataEvent, VIDEO_COMPONENT_REQUEST } from '~/utils/videoMetadataBridge'

interface ReactFiber {
  return: ReactFiber | null
  child: ReactFiber | null
  sibling: ReactFiber | null
  alternate: ReactFiber | null
  stateNode: Node | { current?: ReactFiber, containerInfo?: Node } | null
}

function getReactValue(node: Element, prefix: string) {
  const key = Object.keys(node).find(key => key.startsWith(prefix))
  return key ? Reflect.get(node, key) : undefined
}

/**
 * Follow the committed tree, including bailed-out/alternate branches. A DOM
 * expando alone survives some deletions and is not proof of a mounted node.
 */
export function getMountedPgcEventRoot(node: HTMLElement): Node | null {
  const fiber = getReactValue(node, '__reactFiber$') as ReactFiber | undefined
  if (!fiber || fiber.stateNode !== node)
    return null
  const path: ReactFiber[] = []
  const visited = new Set<ReactFiber>()
  let ancestor = fiber
  while (ancestor.return) {
    if (visited.has(ancestor))
      return null
    visited.add(ancestor)
    path.push(ancestor)
    ancestor = ancestor.return
  }
  const owner = ancestor.stateNode as { current?: ReactFiber, containerInfo?: Node } | null
  if (!owner?.current || !owner.containerInfo?.isConnected)
    return null
  let current: ReactFiber = owner.current
  for (const expected of path.reverse()) {
    let child: ReactFiber | null = current.child
    while (child && child !== expected && child !== expected.alternate)
      child = child.sibling
    if (!child)
      return null
    current = child
  }
  return current.stateNode === node ? owner.containerInfo : null
}

export function createMovedPgcReactBridge() {
  const bindings = new Map<HTMLElement, AbortController>()
  const events = {
    click: 'Click',
    mousedown: 'MouseDown',
    mousemove: 'MouseMove',
    mouseup: 'MouseUp',
    pointerdown: 'PointerDown',
    pointermove: 'PointerMove',
    pointerup: 'PointerUp',
    pointercancel: 'PointerCancel',
    touchstart: 'TouchStart',
    touchmove: 'TouchMove',
    touchend: 'TouchEnd',
    touchcancel: 'TouchCancel',
    mouseover: 'MouseOver',
    mouseout: 'MouseOut',
    pointerover: 'PointerOver',
    pointerout: 'PointerOut',
  }

  function release(node: HTMLElement) {
    bindings.get(node)?.abort()
    bindings.delete(node)
    node.removeAttribute(PGC_REACT_BRIDGE_ATTRIBUTE)
  }

  function bind(node: HTMLElement) {
    const root = getMountedPgcEventRoot(node)
    if (!root || root.contains(node)) {
      release(node)
      return
    }
    if (bindings.has(node))
      return
    const controller = new AbortController()
    bindings.set(node, controller)
    node.setAttribute(PGC_REACT_BRIDGE_ATTRIBUTE, '')
    // A removed React subtree no longer bubbles requests to document. Keep its
    // release path on the boundary itself so detached shells retain no listeners.
    node.addEventListener(VIDEO_COMPONENT_REQUEST, (event) => {
      if (parseVideoMetadataEvent(event)?.release === true)
        release(node)
    }, { signal: controller.signal })
    for (const [eventName, suffix] of Object.entries(events)) {
      node.addEventListener(eventName, (event) => {
        const currentRoot = getMountedPgcEventRoot(node)
        if (!currentRoot) {
          release(node)
          return
        }
        if (currentRoot.contains(node) || event.composedPath().includes(currentRoot))
          return
        const outer = node.parentElement?.closest<HTMLElement>(`[${PGC_REACT_BRIDGE_ATTRIBUTE}]`)
        if (outer && bindings.has(outer) && getMountedPgcEventRoot(outer) === currentRoot)
          return
        const target = event.target
        if (!(target instanceof Element))
          return
        const transition = suffix.endsWith('Over') ? suffix.replace('Over', 'Enter') : suffix.endsWith('Out') ? suffix.replace('Out', 'Leave') : undefined
        const related = (event as MouseEvent).relatedTarget
        const path: Element[] = []
        for (let element: Element | null = target; element && node.contains(element); element = element.parentElement) {
          path.push(element)
          if (element === node)
            break
        }
        const invoke = (currentTarget: Element, prop: string) => {
          const handler = getReactValue(currentTarget, '__reactProps$')?.[prop]
          if (typeof handler !== 'function')
            return
          const forwarded = new Proxy(event, {
            get(nativeEvent, key) {
              if (key === 'nativeEvent')
                return nativeEvent
              if (key === 'currentTarget')
                return currentTarget
              if (key === 'persist')
                return () => {}
              if (key === 'isDefaultPrevented')
                return () => nativeEvent.defaultPrevented
              if (key === 'isPropagationStopped')
                return () => nativeEvent.cancelBubble
              if (key === 'type' && /Enter|Leave/.test(prop))
                return prop.slice(2).toLowerCase()
              const value = Reflect.get(nativeEvent, key, nativeEvent)
              return typeof value === 'function' ? value.bind(nativeEvent) : value
            },
          })
          handler(forwarded)
        }
        for (const element of [...path].reverse()) {
          invoke(element, `on${suffix}Capture`)
          if (event.cancelBubble)
            return
        }
        for (const element of path) {
          invoke(element, `on${suffix}`)
          if (event.cancelBubble)
            return
        }
        if (transition) {
          const crossed = path.filter(element => !(related instanceof Node) || !element.contains(related))
          if (transition.endsWith('Enter'))
            crossed.reverse()
          for (const element of crossed) {
            invoke(element, `on${transition}`)
            if (event.cancelBubble)
              return
          }
        }
      }, { signal: controller.signal })
    }
  }

  return { bind, release, dispose: () => [...bindings.keys()].forEach(release) }
}
