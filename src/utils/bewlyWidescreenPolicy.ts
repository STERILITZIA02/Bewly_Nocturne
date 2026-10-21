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
  contentReady?: boolean
}

export function canCommitWidescreenLayout({
  pageReady,
  playerReady,
  contentReady,
}: WidescreenLayoutReadiness): boolean {
  return pageReady && playerReady && contentReady === true
}

export interface WidescreenControlSurfaceStateInput {
  bottomControlsFocused: boolean
  textEditingActive: boolean
  bottomControlsHovered: boolean
  danmakuControlsReady: boolean
  nativeControlsHidden: boolean
  nativeControlsReady: boolean
  pointerInsidePlayer: boolean
}

export function resolveWidescreenControlSurfaceState({
  bottomControlsFocused,
  textEditingActive,
  bottomControlsHovered,
  danmakuControlsReady,
  nativeControlsHidden,
  nativeControlsReady,
  pointerInsidePlayer,
}: WidescreenControlSurfaceStateInput) {
  const ready = danmakuControlsReady && nativeControlsReady
  return {
    // 页面任意文字编辑或底部控件持有焦点时，暂停原生闲置隐藏。
    // 失焦后重新采用原生空闲/指针状态，不冻结上一帧结果。
    hidden: !ready
      || (!textEditingActive && !bottomControlsFocused && !bottomControlsHovered && (pointerInsidePlayer ? nativeControlsHidden : true)),
    ready,
  }
}

/**
 * hydrating: the loading state shows. pending: the budget is spent but the
 * native comment request is still in flight, so loading still shows.
 * recovering: the failure notice shows while hydration keeps watching at a
 * slower pace, so a late native node clears it. stopped: give up watching.
 */
export type WidescreenSidebarHydrationPhase = 'complete' | 'hydrating' | 'pending' | 'recovering' | 'stopped'

export const WIDESCREEN_SIDEBAR_HYDRATION_BUDGET = 12_000
/** How long an in-flight native comment request may keep the loading state. */
export const WIDESCREEN_SIDEBAR_HYDRATION_PENDING_LIMIT = 30_000
export const WIDESCREEN_SIDEBAR_HYDRATION_RECOVERY_LIMIT = 60_000

export interface WidescreenSidebarHydrationState {
  complete: boolean
  /** Time spent while the page was visible; a hidden tab neither paints nor lazy-loads. */
  elapsed: number
  nativeRequestPending: boolean
}

export function resolveWidescreenSidebarHydrationPhase({
  complete,
  elapsed,
  nativeRequestPending,
}: WidescreenSidebarHydrationState): WidescreenSidebarHydrationPhase {
  if (complete)
    return 'complete'
  if (elapsed < WIDESCREEN_SIDEBAR_HYDRATION_BUDGET)
    return 'hydrating'
  if (nativeRequestPending && elapsed < WIDESCREEN_SIDEBAR_HYDRATION_PENDING_LIMIT)
    return 'pending'
  return elapsed < WIDESCREEN_SIDEBAR_HYDRATION_RECOVERY_LIMIT ? 'recovering' : 'stopped'
}

export const WIDESCREEN_PLAYER_CONTROL_HOVER_GUARD_HEIGHT = 96
export const WIDESCREEN_BOTTOM_CONTROL_HOVER_ENTRY_TOLERANCE = 4
export const WIDESCREEN_BOTTOM_CONTROL_HOVER_EXIT_TOLERANCE = 16
export const WIDESCREEN_BOTTOM_CONTROL_HOVER_LEAVE_DELAY = 240
/** Narrowest comment / danmaku / recommendation column beside the video card. */
export const WIDESCREEN_SIDEBAR_MIN_WIDTH = 360

export interface WidescreenPlayerControlHoverInput {
  playerBottom: number
  playerTop: number
  pointerY: number
}

export function isWidescreenPlayerControlHoverRegion({
  playerBottom,
  playerTop,
  pointerY,
}: WidescreenPlayerControlHoverInput): boolean {
  if (![playerBottom, playerTop, pointerY].every(Number.isFinite))
    return false

  const top = Math.min(playerTop, playerBottom)
  const bottom = Math.max(playerTop, playerBottom)
  const guardHeight = Math.min(WIDESCREEN_PLAYER_CONTROL_HOVER_GUARD_HEIGHT, bottom - top)
  return pointerY >= bottom - guardHeight && pointerY <= bottom
}

export interface WidescreenBottomControlHoverInput {
  currentlyHovered: boolean
  pointerX: number
  pointerY: number
  surfaceHeight: number
  viewportBottom: number
  viewportLeft: number
  viewportRight: number
}

export function isWidescreenBottomControlHoverRegion({
  currentlyHovered,
  pointerX,
  pointerY,
  surfaceHeight,
  viewportBottom,
  viewportLeft,
  viewportRight,
}: WidescreenBottomControlHoverInput): boolean {
  if (![pointerX, pointerY, surfaceHeight, viewportBottom, viewportLeft, viewportRight].every(Number.isFinite))
    return false

  const left = Math.min(viewportLeft, viewportRight)
  const right = Math.max(viewportLeft, viewportRight)
  if (pointerX < left || pointerX > right)
    return false

  const tolerance = currentlyHovered
    ? WIDESCREEN_BOTTOM_CONTROL_HOVER_EXIT_TOLERANCE
    : WIDESCREEN_BOTTOM_CONTROL_HOVER_ENTRY_TOLERANCE
  const bottom = viewportBottom + tolerance
  const top = viewportBottom - Math.max(0, surfaceHeight) - tolerance
  return pointerY >= top && pointerY <= bottom
}

export type WidescreenDisplayMode = 'card' | 'fill'

export interface WidescreenRect {
  left: number
  top: number
  width: number
  height: number
}

export interface WidescreenZoomFrame {
  /** Uniform scale applied from the layout box's top-left corner. */
  scale: number
  x: number
  y: number
  /** Inset of the layout box (its own pixels) clipped away on each side. */
  clipX: number
  clipY: number
}

/** What the viewer sees of the player: its visible outline and video width. */
export interface WidescreenZoomVisual {
  rect: WidescreenRect
  contentWidth: number
}

function isUsableRect(rect: WidescreenRect) {
  return [rect.left, rect.top, rect.width, rect.height].every(Number.isFinite) && rect.width > 0 && rect.height > 0
}

/** Width of a picture of `aspect` letterboxed into a box (object-fit: contain). */
export function resolveWidescreenContentWidth(box: Pick<WidescreenRect, 'width' | 'height'>, aspect: number) {
  return Math.min(box.width, box.height * (aspect > 0 ? aspect : 16 / 9))
}

/**
 * Frame that makes a player laid out at `layout` look like `from`: the video
 * keeps its on-screen width and centre, and only the outline of `from` stays
 * visible. Card ⇄ fill and any reversal in between share this one mapping, so
 * the zoom never jumps however the video is letterboxed.
 */
export function resolveWidescreenZoomFrame(
  from: WidescreenZoomVisual,
  layout: WidescreenRect,
  layoutContentWidth: number,
): WidescreenZoomFrame | null {
  if (!isUsableRect(from.rect) || !isUsableRect(layout) || !(from.contentWidth > 0) || !(layoutContentWidth > 0))
    return null

  const scale = from.contentWidth / layoutContentWidth
  const centerX = from.rect.left + from.rect.width / 2
  const centerY = from.rect.top + from.rect.height / 2
  return {
    scale,
    x: centerX - layout.left - layout.width * scale / 2,
    y: centerY - layout.top - layout.height * scale / 2,
    clipX: Math.max(0, (layout.width * scale - from.rect.width) / (2 * scale)),
    clipY: Math.max(0, (layout.height * scale - from.rect.height) / (2 * scale)),
  }
}

/** The settled frame: the layout box itself. */
export const WIDESCREEN_IDENTITY_ZOOM_FRAME: Readonly<WidescreenZoomFrame> = { scale: 1, x: 0, y: 0, clipX: 0, clipY: 0 }

/** Linear in every component, as the browser interpolates the keyframes. */
export function interpolateWidescreenZoomFrame(from: WidescreenZoomFrame, to: WidescreenZoomFrame, progress: number): WidescreenZoomFrame {
  const p = Math.min(1, Math.max(0, Number.isFinite(progress) ? progress : 1))
  const mix = (a: number, b: number) => a + (b - a) * p
  return {
    scale: mix(from.scale, to.scale),
    x: mix(from.x, to.x),
    y: mix(from.y, to.y),
    clipX: mix(from.clipX, to.clipX),
    clipY: mix(from.clipY, to.clipY),
  }
}

/** What a frame shows of a player laid out at `layout`. */
export function resolveWidescreenZoomVisual(layout: WidescreenRect, frame: WidescreenZoomFrame, layoutContentWidth: number): WidescreenZoomVisual {
  return {
    rect: {
      left: layout.left + frame.x + frame.clipX * frame.scale,
      top: layout.top + frame.y + frame.clipY * frame.scale,
      width: Math.max(0, layout.width - frame.clipX * 2) * frame.scale,
      height: Math.max(0, layout.height - frame.clipY * 2) * frame.scale,
    },
    contentWidth: layoutContentWidth * frame.scale,
  }
}
