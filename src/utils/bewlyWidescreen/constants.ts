import { PLAYER_MODE_CONTROL_SELECTORS } from '~/utils/playerMedia'

export const ROOT_ID = 'bewly-widescreen-root'

export const LOADING_ROOT_ID = 'bewly-widescreen-loading'

export const BODY_CLASS = 'bewly-widescreen-active'

export const NATIVE_PLAYER_CLASS = 'bewly-widescreen-native-player'
export const NATIVE_PLAYER_ANCESTOR_CLASS = 'bewly-widescreen-player-ancestor'
/**
 * Display mode and zoom state ride on the elements that use them (the native
 * player, the shell, the backdrop, the Bewly host), never on <body>: there a
 * class change restyles the whole Bilibili document, costing a dropped frame
 * burst at the start and end of every zoom.
 */
export const PLAYER_DISPLAY_MODE_ATTRIBUTE = 'data-bewly-display-mode'
export const PLAYER_ZOOMING_ATTRIBUTE = 'data-bewly-zooming'
export const HOST_ZOOMING_ATTRIBUTE = 'data-bewly-widescreen-zooming'
export const FILL_TOGGLE_CLASS = 'bewly-widescreen-fill-toggle'
/** Marks Bilibili's like / coin / favourite animation containers in the toolbar. */
export const ACTION_ANIMATION_ATTRIBUTE = 'data-bewly-action-animation'
export const ACTION_ANIMATION_SELECTOR = [
  '.video-toolbar-left-item :is([class*="anim"], [class*="Anim"]):not(.video-toolbar-item-icon, .video-like-icon, .video-share-icon)',
  '.toolbar-left-item-wrap > :is([class*="anim"], [class*="Anim"])',
].join(', ')
/** Host of the app's comment composer docked in the comment panel. */
export const COMMENT_COMPOSER_HOST_CLASS = 'bewly-widescreen-comment-composer'
/** The docked composer's measured height, which the comment panel keeps clear at its end. */
export const COMMENT_COMPOSER_HEIGHT_PROPERTY = '--bewly-widescreen-composer-height'
export const PGC_MEDIA_INFO_SELECTOR = '[class*="mediainfo_mediaInfoWrap"]'
export const PGC_TOOLBAR_SELECTOR = `.player-left-components > .toolbar, #${ROOT_ID} .bewly-widescreen-action-slot > .toolbar`
export const PGC_REACT_BRIDGE_ATTRIBUTE = 'data-bewly-react-bridge'
export const PGC_PAGINATED_PLAYLIST_SELECTOR = '[class*="PaginatedEpList_root"]'
export const NANO_DANMAKU_INPUT_SELECTOR = '[class*="NanoPlayer_nonoPlayerSendingBar"]'

export const EMPTY_CLASS = 'bewly-widescreen-empty'

export const DANMAKU_SKELETON_CLASS = 'bewly-widescreen-danmaku-skeleton'

export const DANMAKU_SOURCE_CLASS = 'bewly-widescreen-danmaku-source'

export const DANMAKU_SOURCE_HOST_CLASS = 'bewly-widescreen-danmaku-source-host'

export const DANMAKU_GLASS_CLASS = 'bewly-widescreen-danmaku-glass'

export const DANMAKU_SURFACE_SELECTOR = `:is(#${ROOT_ID} .bewly-widescreen-danmaku-dock, body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .${DANMAKU_SOURCE_HOST_CLASS})`

export const EPISODE_SECTION_CLASS = 'bewly-widescreen-episode-section'

/** Marks the native viewer count while the info's meta line shows it (syncViewerCount). */
export const VIEWER_COUNT_MIRRORED_ATTRIBUTE = 'data-bewly-viewers-mirrored'

export const NATIVE_MUSIC_ENTRY_SELECTOR = '#bgm-entry'

export const EPISODE_ITEM_SELECTOR = '.video-pod__item, .multi-page__item, .page-item, .list-item, .episode-item, .section-item, .collect-item'

export const PLAYLIST_RECOMMENDATION_FOOTER_SELECTOR = '.rec-footer'

export const NATIVE_LIGHT_OFF_CONTROL_SELECTORS = [
  '.bpx-player-ctrl-setting-lightoff',
  '.bilibili-player-video-btn-setting-right-others-content-lightoff',
  '.squirtle-lightoff',
] as const

export const PLAYLIST_AUTO_EXPAND_THRESHOLD = 24

export const MOBILE_BREAKPOINT = 900

export const LOADING_FADE_DURATION = 240

export const LOADING_EXIT_DELAY = 5000

export const PREPARED_LOADING_TIMEOUT = 30_000

export const READY_POLL_INTERVAL = 100

export const READY_POLL_FAST_DURATION = 5000

export const READY_STABILITY_DELAY = 160

export const TRANSFER_SETTLE_DELAY = 1200

export const PAGE_READY_FALLBACK_DELAY = 3000

/** After the shell commits, reveal it even if native controls never settle. */
export const INITIAL_REVEAL_TIMEOUT = 4000

export const SIDEBAR_HYDRATION_FAST_DURATION = 1500

export const SIDEBAR_HYDRATION_FAST_INTERVAL = 100

export const SIDEBAR_HYDRATION_INTERVAL = 250

/** Cadence while the failure notice shows and late native nodes may still arrive. */
export const SIDEBAR_HYDRATION_RECOVERY_INTERVAL = 1000

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

export const HIDDEN_NATIVE_PLAYER_CONTROL_SELECTORS = Object.values(PLAYER_MODE_CONTROL_SELECTORS).flat()

export const NATIVE_PLAYER_CONTROL_SURFACE_SELECTOR = [
  '.bpx-player-control-wrap',
  '.bilibili-player-video-control-wrap',
  '.bilibili-player-video-control',
  '.squirtle-controller',
].join(',')

export const HIGH_ENERGY_PROGRESS_SELECTOR = '.bpx-player-pbp'

export const HIGH_ENERGY_PROGRESS_PIN_SELECTOR = '.bpx-player-pbp-pin'

export const MUTUALLY_EXCLUSIVE_PLAYER_CONTROL_SELECTOR = HIDDEN_NATIVE_PLAYER_CONTROL_SELECTORS.join(',')

export const selectors = {
  player: [
    '#bilibili-player-wrap',
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
    PGC_TOOLBAR_SELECTOR,
  ],
  mediaInfo: [PGC_MEDIA_INFO_SELECTOR],
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
    NANO_DANMAKU_INPUT_SELECTOR,
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
    PGC_PAGINATED_PLAYLIST_SELECTOR,
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

export const SIDEBAR_CONTENT_SELECTOR = [
  NATIVE_MUSIC_ENTRY_SELECTOR,
  ...selectors.title,
  ...selectors.upPanel,
  ...selectors.mediaInfo,
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

export const SIDEBAR_RELEVANT_SELECTOR = [...selectors.player, SIDEBAR_CONTENT_SELECTOR].join(',')
