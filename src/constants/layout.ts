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
const HOME_SEARCH_STAGE_LEAD_HEIGHT = 128
const HOME_SEARCH_STAGE_TAIL_HEIGHT = 64
export const TOP_BAR_PRIMARY_CONTROL_HEIGHT = 46
export const HOME_TASK_SEARCH_STAGE_HEIGHT = 16 + TOP_BAR_PRIMARY_CONTROL_HEIGHT + 24
/** Keep aligned with --bew-top-bar-height. */
export const TOP_BAR_HEIGHT = 64
export function resolveHomeSearchStage(discovery: boolean, shortViewport: boolean) {
  const lead = discovery ? shortViewport ? 96 : HOME_SEARCH_STAGE_LEAD_HEIGHT : 16
  const tail = discovery ? shortViewport ? 32 : HOME_SEARCH_STAGE_TAIL_HEIGHT : 24
  return {
    lead,
    tail,
    height: lead + TOP_BAR_PRIMARY_CONTROL_HEIGHT + tail,
    stickyScrollTop: Math.max(0, lead - (TOP_BAR_HEIGHT - TOP_BAR_PRIMARY_CONTROL_HEIGHT) / 2),
  }
}

/** Keep aligned with --bew-dock-control-size, --bew-dock-control-size-lg and --bew-space-4. */
export const DOCK_LAYOUT = {
  controlSize: 35,
  controlSizeLarge: 45,
  shellPadding: 16,
  actionControlSize: 45,
  controlGap: 8,
} as const

/** Keep aligned with the single global LayoutEditorOverlay menu geometry. */
export const LAYOUT_EDITOR_LAYOUT = {
  actionMenuWidth: 288,
  actionMenuFallbackHeight: 176,
  contextMenuWidth: 224,
  contextMenuFallbackHeight: 104,
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
