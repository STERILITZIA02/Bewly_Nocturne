/** Keep these values aligned one-to-one with src/styles/_breakpoints.scss. */
export const GRID_BREAKPOINTS = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  xxl: 1536,
} as const

/**
 * Smallest video cover width in adaptive grids (320x168 at 40:21). Columns are as
 * many as fit, so covers are never smaller and grow until another column fits.
 * Keep aligned with --bew-video-card-min-width in variables.scss.
 */
export const VIDEO_CARD_MIN_WIDTH = 320
/** Keep aligned with --bew-video-card-horizontal-cover-max-width. */
export const VIDEO_CARD_HORIZONTAL_COVER_MAX_WIDTH = 400

/** 14/15 of the former 16:9 height; keep aligned with --bew-video-cover-aspect-ratio. */
export const VIDEO_CARD_COVER_ASPECT_RATIO = 40 / 21

export const LAYOUT_BREAKPOINTS = {
  mobileMax: GRID_BREAKPOINTS.md - 1,
  compactMax: GRID_BREAKPOINTS.xl - 1,
} as const

/** Keep aligned with the home search stage tokens in variables.scss. */
const HOME_SEARCH_STAGE_LEAD_HEIGHT = 128
const HOME_SEARCH_STAGE_TAIL_HEIGHT = 64
export const TOP_BAR_PRIMARY_CONTROL_HEIGHT = 46
/** Keep aligned with --bew-top-bar-height. */
export const TOP_BAR_HEIGHT = 64
export function resolveHomeSearchStage(shortViewport: boolean) {
  const lead = shortViewport ? 96 : HOME_SEARCH_STAGE_LEAD_HEIGHT
  const tail = shortViewport ? 32 : HOME_SEARCH_STAGE_TAIL_HEIGHT
  return {
    lead,
    tail,
    height: lead + TOP_BAR_PRIMARY_CONTROL_HEIGHT + tail,
    stickyScrollTop: Math.max(0, lead - (TOP_BAR_HEIGHT - TOP_BAR_PRIMARY_CONTROL_HEIGHT) / 2),
  }
}

/** Keep aligned with --bew-dock-control-size, --bew-dock-control-size-lg and the shell's 6px rim on each side. */
export const DOCK_LAYOUT = {
  controlSize: 36,
  controlSizeLarge: 44,
  shellPadding: 12,
  actionControlSize: 45,
  controlGap: 8,
} as const

/** Keep aligned with the single global LayoutEditorOverlay menu geometry. */
export const LAYOUT_EDITOR_LAYOUT = {
  actionMenuWidth: 288,
  actionMenuFallbackHeight: 176,
} as const

/** Keep aligned with --bew-media-episode-menu-max-height. */
export const MEDIA_EPISODE_MENU_MAX_HEIGHT = 400

export const MOMENTS_DETAIL_LAYOUT = {
  dialogMinWidth: 860,
  opusMaxWidth: 1088,
  playerMinHeight: 280,
  playerViewportScale: 0.92,
  verticalWidescreenMinWidth: 960,
  verticalWidescreenSidebarWidth: 420,
  viewportGutter: 32,
} as const
