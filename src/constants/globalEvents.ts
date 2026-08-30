export const TOP_BAR_VISIBILITY_CHANGE = 'topBarVisibilityChange'
export const TOP_BAR_SCROLL_VISIBILITY_CHANGE = 'topBarScrollVisibilityChange'
export const OVERLAY_SCROLL_BAR_SCROLL = 'overlayScrollBarScroll'
export const OVERLAY_SCROLL_STATE_CHANGE = 'overlayScrollStateChange'
export const BEWLY_MOUNTED = 'bewlyMounted'
export const BEWLY_WIDESCREEN_MANUAL_TOGGLE = 'bewlyWidescreenManualToggle'
export interface BewlyWidescreenManualToggleDetail {
  action: 'enter' | 'exit'
  userInitiated: true
}
export const BEWLY_WIDESCREEN_FAILED = 'bewlyWidescreenFailed'
export const DRAWER_VIDEO_ENTER_PAGE_FULL = 'drawerVideoEnterPageFull'
export const DRAWER_VIDEO_EXIT_PAGE_FULL = 'drawerVideoExitPageFull'
export const BEWLY_DRAWER_ESCAPE_HANDLED = 'BEWLY_DRAWER_ESCAPE_HANDLED'
export const BEWLY_DRAWER_CLOSE_REQUEST = 'BEWLY_DRAWER_CLOSE_REQUEST'
export const IFRAME_DARK_MODE_CHANGE = 'iframeDarkModeChange'
export const IFRAME_TOP_BAR_CHANGE = 'iframeTopBarChange'
export const DARK_MODE_BASE_COLOR_CHANGE = 'darkModeBaseColorChange'
