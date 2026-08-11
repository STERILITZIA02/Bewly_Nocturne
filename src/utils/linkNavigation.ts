export type LinkOpenMode = 'currentTab' | 'currentTabIfNotHomepage' | 'newTab' | 'background' | 'drawer'
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
  return mode
}

export function hasNavigationModifier(event: MouseEvent): boolean {
  return event.ctrlKey || event.metaKey || event.altKey || event.shiftKey
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
