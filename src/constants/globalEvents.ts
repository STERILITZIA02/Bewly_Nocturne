export const OVERLAY_SCROLL_BAR_SCROLL = 'overlayScrollBarScroll'
export const OVERLAY_SCROLL_STATE_CHANGE = 'overlayScrollStateChange'
export const BEWLY_MOUNTED = 'bewlyMounted'
export const BEWLY_IFRAME_DRAWER_HOST_CLASS = 'bewly-iframe-drawer-host'
export const BEWLY_IFRAME_DRAWER_HOST_CHANGE = 'bewlyIframeDrawerHostChange'
export const BEWLY_NATIVE_USER_PROFILE_REQUEST = 'bewlyNativeUserProfileRequest'
export const BEWLY_NATIVE_USER_PROFILE_RELEASE = 'bewlyNativeUserProfileRelease'
export const BEWLY_WIDESCREEN_MANUAL_TOGGLE = 'bewlyWidescreenManualToggle'
export interface BewlyWidescreenManualToggleDetail {
  action: 'enter' | 'exit'
  userInitiated: true
}
/** On the anchored native player while the playback page's control card is hidden. */
export const BEWLY_WIDESCREEN_CONTROLS_HIDDEN_ATTRIBUTE = 'data-bewly-controls-hidden'
/** Window event, `detail` = hidden; the docked SideBar follows the control card. */
export const BEWLY_WIDESCREEN_CONTROLS_VISIBILITY = 'bewlyWidescreenControlsVisibility'
export const LISTEN_ATTRIBUTE = 'data-bew-listening'
/** On the player root while a finished session's stage dissolves over the picture. */
export const LISTEN_LEAVING_ATTRIBUTE = 'data-bew-listen-leaving'
/** On the player root while the listening stage's colours are known: the playback page's control card takes them. */
export const LISTEN_TONED_ATTRIBUTE = 'data-bew-listen-toned'
export const BEWLY_DRAWER_ESCAPE_HANDLED = 'BEWLY_DRAWER_ESCAPE_HANDLED'
export const BEWLY_DRAWER_CLOSE_REQUEST = 'BEWLY_DRAWER_CLOSE_REQUEST'
export const IFRAME_DARK_MODE_CHANGE = 'iframeDarkModeChange'
export const IFRAME_TOP_BAR_CHANGE = 'iframeTopBarChange'
export const IFRAME_NAVIGATION_REQUEST = 'bewlyIframeNavigationRequest'
export const IFRAME_NAVIGATION_ACK = 'bewlyIframeNavigationAck'
export const IFRAME_PLAYER_CONTEXT = 'bewlyIframePlayerContext'
/** An embedded page asks its Bewly parent to show the shared image viewer. */
export const IFRAME_IMAGE_VIEWER_OPEN = 'BEWLY_OPUS_IMAGE_VIEWER_OPEN'
export const IFRAME_IMAGE_VIEWER_ACK = 'BEWLY_OPUS_IMAGE_VIEWER_ACK'
export const IFRAME_IMAGE_VIEWER_CLOSE = 'BEWLY_OPUS_IMAGE_VIEWER_CLOSE'
