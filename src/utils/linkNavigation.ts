export type LinkOpenMode = 'currentTab' | 'currentTabIfNotHomepage' | 'currentTabIfHomepage' | 'newTab' | 'background' | 'drawer'
export type ResolvedLinkOpenAction = 'currentTab' | 'newTab' | 'background' | 'drawer'

export interface LinkNavigationContext {
  isHomepage: boolean
  inIframe: boolean
}

export function resolveLinkOpenAction(
  mode: LinkOpenMode,
  context: LinkNavigationContext,
): ResolvedLinkOpenAction {
  if (mode === 'currentTabIfNotHomepage')
    return context.isHomepage || context.inIframe ? 'newTab' : 'currentTab'
  if (mode === 'currentTabIfHomepage')
    return context.isHomepage ? 'currentTab' : 'newTab'
  return mode
}

export function hasNavigationModifier(event: MouseEvent): boolean {
  return event.ctrlKey || event.metaKey || event.altKey || event.shiftKey
}

/** Per-card pointer intent, with no document listeners or pointermove layout reads. */
export function createPointerNavigationGuard(element: () => HTMLElement | null) {
  const DRAG_DISTANCE = 6
  const LONG_PRESS_MS = 500
  let start: { id: number, x: number, y: number, at: number, top: number } | undefined
  let suppressed = false
  function hasSelection() {
    const target = element()
    const root = target?.getRootNode() as (Document | ShadowRoot) & { getSelection?: () => Selection | null }
    const selection = root?.getSelection?.() ?? window.getSelection()
    return Boolean(target && selection?.toString() && selection.rangeCount && selection.getRangeAt(0).intersectsNode(target))
  }
  return {
    down(event: PointerEvent) {
      if (event.button !== 0 || event.isPrimary === false)
        return
      suppressed = hasSelection()
      start = { id: event.pointerId, x: event.clientX, y: event.clientY, at: event.timeStamp, top: element()?.getBoundingClientRect().top ?? 0 }
    },
    move(event: PointerEvent) {
      if (start?.id === event.pointerId && Math.hypot(event.clientX - start.x, event.clientY - start.y) > DRAG_DISTANCE)
        suppressed = true
    },
    end(event: PointerEvent) {
      if (start?.id !== event.pointerId)
        return
      suppressed ||= event.type === 'pointercancel' || event.timeStamp - start.at >= LONG_PRESS_MS
        || Math.hypot(event.clientX - start.x, event.clientY - start.y) > DRAG_DISTANCE
        || Math.abs((element()?.getBoundingClientRect().top ?? start.top) - start.top) > DRAG_DISTANCE
      start = undefined
    },
    prevent(event: MouseEvent) {
      if (event.button !== 0 || hasNavigationModifier(event) || event.detail === 0 || (!suppressed && !hasSelection()))
        return false
      event.preventDefault()
      event.stopPropagation()
      return true
    },
  }
}

export function getLinkTarget(action: ResolvedLinkOpenAction): '_blank' | '_top' {
  return action === 'newTab' ? '_blank' : '_top'
}

export function executeResolvedLinkAction(
  action: ResolvedLinkOpenAction,
  destination: string,
  handlers: Record<ResolvedLinkOpenAction, (url: string) => void>,
): void {
  handlers[action](destination)
}
