export interface WidescreenMutationOrigin {
  insideRoot: boolean
  relevant: boolean
}

export function shouldScheduleWidescreenRefresh(origins: readonly WidescreenMutationOrigin[]): boolean {
  return origins.some(origin => !origin.insideRoot && origin.relevant)
}

export function shortenCommentDateText(value: string): string {
  return value.replace(/\b\d{4}-(\d{2})-(\d{2})\b/g, '$1-$2')
}

export interface WidescreenEngagementState {
  active: boolean
  entering: boolean
  hasLoadingOverlay: boolean
  hasReadyRetry: boolean
  waitingForLoad: boolean
}

export function resolveWidescreenEngagedState({
  active,
  entering,
  hasLoadingOverlay,
  hasReadyRetry,
  waitingForLoad,
}: WidescreenEngagementState): boolean {
  return active || entering || hasLoadingOverlay || hasReadyRetry || waitingForLoad
}

export function shouldSuppressWidescreenAutoEntry(
  navigationKey: string,
  userExitSuppressedNavigationKey: string | undefined,
): boolean {
  return navigationKey.length > 0 && navigationKey === userExitSuppressedNavigationKey
}

export interface WidescreenCenterGeometryInput {
  centerEnabled: boolean
  compactLayout: boolean
  horizontalLayout: boolean
  viewportWidth: number
  playerHeight: number
  visualAspect: number
  sidebarWidth: number
}

export interface WidescreenCenterGeometry {
  enabled: boolean
  offset: number
  sideGap: number
}

/**
 * Resolve centering from measured geometry. The sidebar must fit entirely in a
 * single letterbox side; otherwise no offset is applied and the video keeps its
 * normal video-first layout.
 */
export function resolveWidescreenCenterGeometry({
  centerEnabled,
  compactLayout,
  horizontalLayout,
  viewportWidth,
  playerHeight,
  visualAspect,
  sidebarWidth,
}: WidescreenCenterGeometryInput): WidescreenCenterGeometry {
  const safeViewportWidth = Math.max(0, viewportWidth)
  const safePlayerHeight = Math.max(0, playerHeight)
  const safeAspect = Number.isFinite(visualAspect) && visualAspect > 0 ? visualAspect : 16 / 9
  const safeSidebarWidth = Math.max(0, Math.min(sidebarWidth, safeViewportWidth))
  const visualWidth = Math.min(safePlayerHeight * safeAspect, safeViewportWidth)
  const sideGap = Math.max((safeViewportWidth - visualWidth) / 2, 0)
  const availablePlayerWidth = Math.max(safeViewportWidth - safeSidebarWidth, 0)
  const maxOffset = Math.max((availablePlayerWidth - visualWidth) / 2, 0)
  const enabled = centerEnabled
    && compactLayout
    && horizontalLayout
    && safeSidebarWidth > 0
    && sideGap >= safeSidebarWidth
    && availablePlayerWidth >= visualWidth

  return {
    enabled,
    offset: enabled ? Math.min(safeSidebarWidth / 2, maxOffset) : 0,
    sideGap,
  }
}
