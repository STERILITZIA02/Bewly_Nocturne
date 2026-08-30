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

export interface WidescreenLayoutReadiness {
  pageReady: boolean
  playerReady: boolean
  contentReady: boolean
}

export function canCommitWidescreenLayout({
  pageReady,
  playerReady,
  contentReady,
}: WidescreenLayoutReadiness): boolean {
  return pageReady && playerReady && contentReady
}

export interface WidescreenSidebarHydrationState {
  complete: boolean
  now: number
  deadline: number
}

export function shouldContinueWidescreenSidebarHydration({
  complete,
  now,
  deadline,
}: WidescreenSidebarHydrationState): boolean {
  return !complete && now < deadline
}

export const WIDESCREEN_SIDEBAR_EDGE_ACTIVATION_WIDTH = 72
export const WIDESCREEN_SIDEBAR_EDGE_EXIT_TOLERANCE = 48
export const WIDESCREEN_SIDEBAR_EDGE_EXIT_DELAY = 320
export const WIDESCREEN_SIDEBAR_MIN_WIDTH = 360
export const WIDESCREEN_SIDEBAR_DEFAULT_MAX_WIDTH = 460
export const WIDESCREEN_SIDEBAR_RESIZE_MAX_WIDTH = 720
export const WIDESCREEN_SIDEBAR_MAX_VIEWPORT_RATIO = 0.5

export interface WidescreenSidebarHoverInput {
  position: 'left' | 'right'
  currentlyExpanded: boolean
  pointerX: number
  viewportStart: number
  viewportEnd: number
  sidebarWidth: number
}

/**
 * Resolve edge reveal from stable viewport geometry instead of the moving
 * sidebar hitbox. The wider exit boundary provides hysteresis while the
 * sidebar is animating and while the pointer crosses its inner edge.
 */
export function resolveWidescreenSidebarHoverExpanded({
  position,
  currentlyExpanded,
  pointerX,
  viewportStart,
  viewportEnd,
  sidebarWidth,
}: WidescreenSidebarHoverInput): boolean {
  const safeViewportStart = Math.min(viewportStart, viewportEnd)
  const safeViewportEnd = Math.max(viewportStart, viewportEnd)
  if (!Number.isFinite(pointerX) || pointerX < safeViewportStart || pointerX > safeViewportEnd)
    return false

  if (!currentlyExpanded) {
    const edgeDistance = position === 'right'
      ? safeViewportEnd - pointerX
      : pointerX - safeViewportStart
    return edgeDistance <= WIDESCREEN_SIDEBAR_EDGE_ACTIVATION_WIDTH
  }

  const safeSidebarWidth = Math.max(
    0,
    Math.min(sidebarWidth, safeViewportEnd - safeViewportStart),
  )
  return position === 'right'
    ? pointerX >= safeViewportEnd - safeSidebarWidth - WIDESCREEN_SIDEBAR_EDGE_EXIT_TOLERANCE
    : pointerX <= safeViewportStart + safeSidebarWidth + WIDESCREEN_SIDEBAR_EDGE_EXIT_TOLERANCE
}

export function clampWidescreenSidebarWidth(width: number, viewportWidth: number): number {
  const safeViewportWidth = Math.max(0, viewportWidth)
  const minWidth = Math.min(WIDESCREEN_SIDEBAR_MIN_WIDTH, safeViewportWidth)
  const maxWidth = Math.max(
    minWidth,
    Math.min(
      WIDESCREEN_SIDEBAR_RESIZE_MAX_WIDTH,
      safeViewportWidth * WIDESCREEN_SIDEBAR_MAX_VIEWPORT_RATIO,
    ),
  )
  const safeWidth = Number.isFinite(width) ? width : WIDESCREEN_SIDEBAR_DEFAULT_MAX_WIDTH
  return Math.min(Math.max(safeWidth, minWidth), maxWidth)
}

export interface WidescreenSidebarResizeInput {
  position: 'left' | 'right'
  pointerX: number
  viewportStart: number
  viewportEnd: number
}

export function resolveWidescreenSidebarResizeWidth({
  position,
  pointerX,
  viewportStart,
  viewportEnd,
}: WidescreenSidebarResizeInput): number {
  const safeViewportStart = Math.min(viewportStart, viewportEnd)
  const safeViewportEnd = Math.max(viewportStart, viewportEnd)
  const viewportWidth = safeViewportEnd - safeViewportStart
  const width = position === 'right'
    ? safeViewportEnd - pointerX
    : pointerX - safeViewportStart
  return clampWidescreenSidebarWidth(width, viewportWidth)
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
