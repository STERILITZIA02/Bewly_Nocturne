import { WIDESCREEN_SIDEBAR_MAX_VIEWPORT_RATIO } from '~/utils/bewlyWidescreenPolicy'

export const ROOT_ID = 'bewly-widescreen-root'

export const LOADING_ROOT_ID = 'bewly-widescreen-loading'

export const BODY_CLASS = 'bewly-widescreen-active'

export const NATIVE_PLAYER_CLASS = 'bewly-widescreen-native-player'

export const EMPTY_CLASS = 'bewly-widescreen-empty'

export const DANMAKU_SKELETON_CLASS = 'bewly-widescreen-danmaku-skeleton'

export const DANMAKU_SOURCE_CLASS = 'bewly-widescreen-danmaku-source'

export const DANMAKU_SOURCE_HOST_CLASS = 'bewly-widescreen-danmaku-source-host'

export const DANMAKU_GLASS_CLASS = 'bewly-widescreen-danmaku-glass'

export const DANMAKU_SURFACE_SELECTOR = `:is(#${ROOT_ID} .bewly-widescreen-danmaku-dock, body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .${DANMAKU_SOURCE_HOST_CLASS})`

export const EPISODE_SECTION_CLASS = 'bewly-widescreen-episode-section'

export const EPISODE_ITEM_SELECTOR = '.video-pod__item, .multi-page__item, .page-item, .list-item, .episode-item, .section-item, .collect-item'

export const PLAYLIST_RECOMMENDATION_FOOTER_SELECTOR = '.rec-footer'

export const NATIVE_LIGHT_OFF_CONTROL_SELECTORS = [
  '.bpx-player-ctrl-setting-lightoff',
  '.bilibili-player-video-btn-setting-right-others-content-lightoff',
  '.squirtle-lightoff',
] as const

export const SIDEBAR_RESIZE_KEYBOARD_STEP = 16

export const PLAYLIST_AUTO_EXPAND_THRESHOLD = 24

export const SIDEBAR_MAX_VIEWPORT_PERCENT = WIDESCREEN_SIDEBAR_MAX_VIEWPORT_RATIO * 100

export const MOBILE_BREAKPOINT = 900

export const LOADING_FADE_DURATION = 240

export const LOADING_EXIT_DELAY = 5000

export const PREPARED_LOADING_TIMEOUT = 30_000

export const READY_POLL_INTERVAL = 100

export const READY_POLL_FAST_DURATION = 5000

export const READY_POLL_SLOW_INTERVAL = 500

export const READY_STABILITY_DELAY = 160

export const TRANSFER_SETTLE_DELAY = 1200

export const PAGE_READY_FALLBACK_DELAY = 3000

export const SIDEBAR_HYDRATION_FAST_DURATION = 1500

export const SIDEBAR_HYDRATION_FAST_INTERVAL = 100

export const SIDEBAR_HYDRATION_INTERVAL = 250

export const SIDEBAR_HYDRATION_TIMEOUT = 12_000

export const SIDEBAR_TOGGLE_IDLE_DELAY = 1000

export const DANMAKU_RESIZE_DELAYS = [0, 80, 180, 360, 720] as const

export const BILIBILI_ACTION_ANIMATION_HUE = 196

export const COMMENT_ROOT_ID_SELECTOR = '#comment-module, #comment-body, #commentapp'

export const COMMENT_NESTED_UI_SELECTOR = '.reply-item, .sub-reply-item, bili-comment-renderer'

// Light-DOM markers only. Modern bili-comments mounts most UI in shadow roots,
// so readiness must not require these descendants to exist.
export const COMMENT_CONTENT_MARKER_SELECTOR = 'bili-comments, bili-comment-box, bili-comment-renderer, .reply-list, .comment-list, .reply-box, .comment-header'

export const COMMENT_SHADOW_HOST_SELECTOR = 'bili-comments, bili-comment-box, bili-comment-renderer, bili-comment-thread-renderer'

export const DANMAKU_LIST_VIEWPORT_SELECTOR = '.bui-long-list-list, .bpx-player-dm-container'

export const DANMAKU_LIST_ITEM_SELECTOR = '.bui-long-list-item, .bpx-player-dm-item, .bui-long-list-list > li, .bui-long-list-list > [data-index]'

export const DANMAKU_EMPTY_STATE_SELECTOR = '.bpx-player-dm-empty, .bui-empty, [class*="dm-empty"], [class*="danmaku-empty"]'

export const COMMENT_TIME_SELECTOR = [
  '.reply-time',
  '.sub-reply-time',
  '.reply-time-location',
  '.comment-time',
  'bili-comment-user-info .time',
  'bili-comment-user-info .pubdate',
].join(',')

export const HIDDEN_NATIVE_PLAYER_CONTROL_SELECTORS = [
  '.bpx-player-ctrl-wide',
  '.bilibili-player-video-btn-widescreen',
  '.squirtle-video-widescreen',
  '.bpx-player-ctrl-web',
  '.bilibili-player-video-web-fullscreen',
  '.squirtle-video-pagefullscreen',
  '.bpx-player-ctrl-full',
  '.bilibili-player-video-btn-fullscreen',
  '.squirtle-video-fullscreen',
] as const

export const NATIVE_PLAYER_CONTROL_SURFACE_SELECTOR = [
  '.bpx-player-control-wrap',
  '.bilibili-player-video-control-wrap',
  '.bilibili-player-video-control',
  '.squirtle-controller',
].join(',')

export const BOTTOM_CONTROL_POPOVER_SELECTOR = [
  '.bpx-player-dm-setting-wrap',
  '.bpx-player-mode-selection-container.active',
  '[role="dialog"]',
  '[role="menu"]',
  '[role="listbox"]',
  '.bpx-player-ctrl-eplist-menu-wrap',
  '[class*="bpx-player-ctrl-"][class*="-menu"]:not([class*="-menu-item"]):not([class*="-menu-wrap"])',
  '[class*="bpx-player-ctrl-"][class*="-panel"]:not([class*="-panel-item"]):not([class*="-panel-wrap"])',
  '[class*="bpx-player-ctrl-"][class*="-popup"]',
  '[class*="bpx-player-ctrl-"][class*="-box"]',
  '[class*="bilibili-player-video-btn-"][class*="-menu"]:not([class*="-menu-item"]):not([class*="-menu-wrap"])',
  '[class*="squirtle-"][class*="-menu"]:not([class*="-menu-item"]):not([class*="-menu-wrap"])',
].join(',')

export const NATIVE_ACTION_OVERLAY_SELECTOR = [
  '.bili-dialog-m',
  '.video-share-popover',
].join(',')

export const HIGH_ENERGY_PROGRESS_SELECTOR = '.bpx-player-pbp'

export const HIGH_ENERGY_PROGRESS_PIN_SELECTOR = '.bpx-player-pbp-pin'

export const MUTUALLY_EXCLUSIVE_PLAYER_CONTROL_SELECTOR = [
  ...HIDDEN_NATIVE_PLAYER_CONTROL_SELECTORS,
  '.bpx-player-ctrl-full',
  '.bilibili-player-video-btn-fullscreen',
  '.squirtle-video-fullscreen',
].join(',')

export const selectors = {
  player: [
    '#playerWrap',
    '#bilibili-player',
    '#bilibiliPlayer',
    '.bpx-player-container',
    '.player-wrap',
  ],
  title: [
    '.video-title',
    'h1.video-title',
    '.video-info-title h1',
    '.bpx-player-top-title',
    '[class*="mediainfo_mediaTitle"]',
    '#viewbox_report .title',
    'h1[title]',
  ],
  upPanel: [
    '.up-panel-container',
    '.up-info-container',
    '.up-info',
    '.upinfo',
  ],
  toolbar: [
    '#arc_toolbar_report',
    '.video-toolbar-container',
  ],
  metadata: [
    '.video-info-meta',
  ],
  description: [
    '#v_desc',
    '.video-desc-container',
  ],
  tags: [
    '.video-tag-container',
    '#v_tag',
  ],
  danmakuInput: [
    '.bpx-player-sending-bar',
    '.bilibili-player-video-sendbar',
    '.bilibili-player-video-inputbar',
  ],
  danmakuFocusable: [
    '.danmaku-wrap .bui-collapse-header',
    '.danmaku-box .bui-collapse-header',
    '.danmaku-wrap .bpx-player-dm-setting-left',
    '.danmaku-box .bpx-player-dm-setting-left',
  ],
  comment: [
    '#comment-module',
    '#comment-body',
    '#commentapp',
    '.commentapp',
    '.comment-container',
    '.bili-comment-container',
    '.bb-comment',
  ],
  danmaku: [
    '#danmukuBox',
    '[class*="DanmukuBox_wrap"]',
    '.danmaku-box',
    '.danmaku-wrap',
  ],
  playlist: [
    // Watch Later and Favorites use this inner list. Their `.playlist-container`
    // is the page-level layout and must stay outside the widescreen sidebar.
    '.action-list-container',
    '[class*="eplist_ep_list_wrapper"]',
    '#eplist_module',
    '[class*="numberList_wrapper"]',
    '[class*="imageList_wrap"]',
    '.video-pod',
    '.video-pod__body',
    '.multi-page',
    '.multi-page-v1',
    '.base-video-sections-v1',
    '.video-sections-v1',
    '.video-sections-content-list',
  ],
  playlistControls: [
    '.auto-play',
    '.continuous-btn',
  ],
  recommend: [
    '[class*="recommend_wrap"]',
    '.recommend-list-v1',
    '.recommend-list',
    '.rec-list',
    '.next-play',
  ],
}

export const SIDEBAR_RELEVANT_SELECTOR = [
  ...selectors.player,
  ...selectors.title,
  ...selectors.upPanel,
  ...selectors.toolbar,
  ...selectors.description,
  ...selectors.tags,
  ...selectors.danmakuInput,
  ...selectors.danmaku,
  ...selectors.comment,
  ...selectors.playlist,
  ...selectors.playlistControls,
  ...selectors.recommend,
].join(',')
