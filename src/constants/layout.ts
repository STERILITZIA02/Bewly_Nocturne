/** Keep these values aligned one-to-one with src/styles/_breakpoints.scss. */
export const GRID_BREAKPOINTS = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  xxl: 1536,
} as const

export const LAYOUT_BREAKPOINTS = {
  mobileMax: GRID_BREAKPOINTS.md - 1,
  compactMax: GRID_BREAKPOINTS.xl - 1,
} as const

/** Keep aligned with the home search stage tokens in variables.scss. */
export const HOME_SEARCH_STAGE_LEAD_HEIGHT = 156
export const HOME_SEARCH_STAGE_TAIL_HEIGHT = 116
export const TOP_BAR_PRIMARY_CONTROL_HEIGHT = 46
export const HOME_SEARCH_STAGE_HEIGHT = HOME_SEARCH_STAGE_LEAD_HEIGHT
  + TOP_BAR_PRIMARY_CONTROL_HEIGHT
  + HOME_SEARCH_STAGE_TAIL_HEIGHT
/** Keep aligned with --bew-top-bar-height. */
export const TOP_BAR_HEIGHT = 64
/** The centered home SearchBar reaches the TopBar midpoint at this scroll position. */
export const HOME_SEARCH_STICKY_SCROLL_TOP = HOME_SEARCH_STAGE_LEAD_HEIGHT
  - (TOP_BAR_HEIGHT - TOP_BAR_PRIMARY_CONTROL_HEIGHT) / 2

/** Keep aligned with --bew-dock-control-size-lg and --bew-space-2. */
export const DOCK_LAYOUT = {
  actionControlSize: 45,
  controlGap: 8,
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
