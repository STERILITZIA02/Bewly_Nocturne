import { BEWLY_WIDESCREEN_CONTROLS_HIDDEN_CLASS } from '~/constants/globalEvents'
import LOADING_RING_CSS from '~/styles/loadingRing.scss?inline'
import SEGMENT_CONTROL_CSS from '~/styles/segmentControl.scss?inline'
import SEGMENT_LIQUID_INDICATOR_CSS from '~/styles/segmentLiquidIndicator.scss?inline'
import SEND_BUTTON_CSS from '~/styles/sendButton.scss?inline'
import SKELETON_CSS from '~/styles/skeleton.scss?inline'
import { ACTION_ANIMATION_ATTRIBUTE, BODY_CLASS, COMMENT_COMPOSER_HEIGHT_PROPERTY, COMMENT_COMPOSER_HOST_CLASS, DANMAKU_GLASS_CLASS, DANMAKU_SOURCE_HOST_CLASS, DANMAKU_SURFACE_SELECTOR, EPISODE_SECTION_CLASS, FILL_TOGGLE_CLASS, HIDDEN_NATIVE_PLAYER_CONTROL_SELECTORS, HIGH_ENERGY_PROGRESS_PIN_SELECTOR, HOST_ZOOMING_ATTRIBUTE, MOBILE_BREAKPOINT, NATIVE_LIGHT_OFF_CONTROL_SELECTORS, NATIVE_MUSIC_ENTRY_SELECTOR, NATIVE_PLAYER_ANCESTOR_CLASS, NATIVE_PLAYER_CLASS, PLAYER_DISPLAY_MODE_ATTRIBUTE, PLAYER_ZOOMING_ATTRIBUTE, PLAYLIST_RECOMMENDATION_FOOTER_SELECTOR, ROOT_ID, VIEWER_COUNT_MIRRORED_ATTRIBUTE } from '~/utils/bewlyWidescreen/constants'
import { CARD_LAYOUT_PROPERTIES } from '~/utils/bewlyWidescreen/styles/cardLayout'
import { DANMAKU_SENDER_ORDER_BUTTON_CLASS, DANMAKU_SENDER_ORDER_CLASS } from '~/utils/danmakuSenderOrder'
import { injectCSS } from '~/utils/main'
import { PHOTO_VIEWER_SELECTOR } from '~/utils/photoViewer'

/**
 * The one solid surface every player popover shares: control menus and
 * tooltips, the danmaku mode and settings panels, and the feedback panel.
 */
const PLAYER_POPOVER_SURFACE = `background: var(--bew-elevated-alt-solid) !important;
      border: 1px solid var(--bew-surface-border-color) !important;
      border-radius: var(--bew-popover-radius) !important;
      corner-shape: var(--bew-corner-shape);
      box-shadow: var(--bew-popover-surface-shadow) !important;
      backdrop-filter: none !important;`

export function injectLayoutStyle() {
  return injectCSS(`
    ${SKELETON_CSS}
    ${LOADING_RING_CSS}
    ${SEGMENT_CONTROL_CSS}
    ${SEGMENT_LIQUID_INDICATOR_CSS}
    ${SEND_BUTTON_CSS}
    /* The anchored box is read only by the player itself. Without inheritance a
       resize or mode switch restyles one element, not the whole Bpx tree. */
    @property --bewly-widescreen-player-top { syntax: '*'; inherits: false; }
    @property --bewly-widescreen-player-left { syntax: '*'; inherits: false; }
    @property --bewly-widescreen-player-width { syntax: '*'; inherits: false; }
    @property --bewly-widescreen-player-height { syntax: '*'; inherits: false; }
    /* Read only by the comment panel's own padding (commentComposer.ts). */
    @property ${COMMENT_COMPOSER_HEIGHT_PROPERTY} { syntax: '*'; inherits: false; }

    body.${BODY_CLASS} {
      --bewly-widescreen-inputbar-height: calc(
        var(--bew-control-height, 36px) + var(--bew-space-2, 8px)
      );
      --bewly-widescreen-bottom-controls-height: calc(
        var(--bewly-widescreen-inputbar-height, 44px) + var(--bew-space-4, 16px) + 1px
      );
      --bewly-widescreen-controls-block-padding: calc(
        (var(--bewly-widescreen-bottom-controls-height) - var(--bew-control-height, 36px)) / 2
      );
      --bewly-widescreen-danmaku-bar-bg: var(--bew-glass-tint);
      --bewly-widescreen-aux-controls-width: calc(var(--bew-control-height, 36px) * 5 + var(--bew-space-2, 8px) * 5);
      ${CARD_LAYOUT_PROPERTIES}
      --bewly-widescreen-controls-glass-inset: 10%;
      --bewly-widescreen-controls-glass-bottom: var(--bew-space-8, 32px);
      /* Only the zoom overrides this (on the player and #bewly). Hiding sets
         opacity: 0 on each control surface instead: an inherited value
         changing on <body> restyles the whole page on every auto-hide. */
      --bewly-widescreen-controls-opacity: 1;
      --bewly-widescreen-controls-glass-height: calc(
        var(--bewly-widescreen-bottom-controls-height) + var(--bewly-widescreen-controls-block-padding, 12px)
      );
      overflow: hidden !important;
      background: var(--bew-dark-page-bg) !important;
    }

    /* Mode state lives on the player and the shell, never on <body>; see
       PLAYER_DISPLAY_MODE_ATTRIBUTE. */
    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS}[${PLAYER_DISPLAY_MODE_ATTRIBUTE}="card"],
    #${ROOT_ID}[data-display-mode="card"] .bewly-widescreen-danmaku-dock {
      --bewly-widescreen-controls-glass-inset: var(--bewly-widescreen-card-inset);
      --bewly-widescreen-controls-glass-bottom: var(--bewly-widescreen-card-inset);
    }

    /* The zoom scales the whole player. Controls leave at once and return at
       the settled size instead of scaling (and blurring) with the video. */
    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS}[${PLAYER_ZOOMING_ATTRIBUTE}],
    body.${BODY_CLASS} #bewly[${HOST_ZOOMING_ATTRIBUTE}] {
      --bewly-widescreen-controls-opacity: 0;
    }

    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS}[${PLAYER_ZOOMING_ATTRIBUTE}] {
      transform-origin: 0 0 !important;
    }

    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS}[${PLAYER_ZOOMING_ATTRIBUTE}] :is(
      .bpx-player-control-wrap,
      .bilibili-player-video-control-wrap,
      .bilibili-player-video-control,
      .squirtle-controller,
      .${DANMAKU_GLASS_CLASS},
      .${DANMAKU_SOURCE_HOST_CLASS}
    ) {
      transition: none !important;
    }

    /* Covers the native page under the player: page background beside the
       pane, player canvas behind the filled video, crossfading with the zoom. */
    body.${BODY_CLASS} > .bewly-widescreen-backdrop {
      position: fixed;
      inset: 0;
      z-index: calc(var(--bew-z-widescreen) - 3);
      background-color: var(--bew-player-canvas);
      transition: background-color var(--bew-duration-moderate, 300ms) var(--bew-ease-standard, ease);
    }

    body.${BODY_CLASS} > .bewly-widescreen-backdrop[data-display-mode="card"] {
      background-color: var(--bew-bg);
    }

    /* The pane's canvas. The player covers it at rest; while the video zooms
       out of the pane, the scaled player is only as tall as its picture, and
       this keeps the letterbox above and below it in place. */
    body.${BODY_CLASS} > .bewly-widescreen-backdrop::before {
      content: "";
      position: absolute;
      inset-block: 0;
      left: 0;
      width: var(--bewly-widescreen-card-width);
      background-color: var(--bew-player-canvas);
    }

    body.${BODY_CLASS} > .bewly-widescreen-backdrop[data-sidebar-position="left"]::before {
      right: 0;
      left: auto;
    }

    body.${BODY_CLASS} #bewly {
      position: relative;
      z-index: calc(var(--bew-z-widescreen) + 1);
    }

    /* Bilibili teleports native interaction surfaces directly under body. Keep
       them above the Bewly Playback Page instead of letting their legacy
       2000/10102 layers hide behind the widescreen shell. */
    body.${BODY_CLASS} > :is(
      .usercard-wrap,
      bili-user-profile,
      .van-popover.van-followed,
      .bili-dialog-m,
      .video-share-popover
    ) {
      z-index: var(--bew-z-hud) !important;
    }

    body.${BODY_CLASS} > :is(${PHOTO_VIEWER_SELECTOR}) {
      z-index: var(--bew-z-hud) !important;
    }

    body.${BODY_CLASS} > ${NATIVE_MUSIC_ENTRY_SELECTOR} {
      position: fixed !important;
      top: calc(var(--bew-top-bar-height) + var(--bew-space-4)) !important;
      right: var(--bew-space-4) !important;
      bottom: var(--bew-space-4) !important;
      left: auto !important;
      height: auto !important;
      max-width: calc(100vw - var(--bew-space-4) * 2);
      z-index: var(--bew-z-hud) !important;
      pointer-events: none;
    }

    body.${BODY_CLASS} > ${NATIVE_MUSIC_ENTRY_SELECTOR} #musicApp {
      height: 100% !important;
      max-width: 100%;
      pointer-events: auto;
    }

    body.${BODY_CLASS} .bili-header,
    body.${BODY_CLASS} .fixed-sidenav-storage,
    body.${BODY_CLASS} .mini-player-window {
      display: none !important;
    }

    ${HIDDEN_NATIVE_PLAYER_CONTROL_SELECTORS
      .map(selector => `body.${BODY_CLASS} ${selector}`)
      .join(',\n    ')} {
      display: none !important;
    }

    /* The follow widget over the video repeats the author row beside it. */
    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} :is(.bpx-player-top-left-follow, .bpx-player-top-follow),
    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .bpx-player-top-issue,
    ${NATIVE_LIGHT_OFF_CONTROL_SELECTORS
      .map(selector => `body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} ${selector}`)
      .join(',\n    ')} {
      display: none !important;
    }

    #${ROOT_ID} {
      position: fixed;
      inset: 0;
      z-index: var(--bew-z-widescreen);
      color: var(--bew-text-1);
      background: transparent;
      font-family: var(--bew-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
      pointer-events: none;
      --bewly-widescreen-sidebar-bg: transparent;
      --bewly-widescreen-text-primary: var(--bew-text-1, #18191c);
      --bewly-widescreen-text-secondary: var(--bew-text-2, #61666d);
      --bewly-widescreen-text-muted: var(--bew-text-3, #9499a0);
      --bewly-widescreen-sidebar-border: var(--bew-surface-border-color);
      --bewly-widescreen-divider: var(--bew-border-color);
      --bewly-widescreen-control-bg: var(--bew-fill-1);
      --bewly-widescreen-control-hover-bg: var(--bew-fill-2);
      --bew-comment-expand-all-display: none;
      --bewly-widescreen-danmaku-bar-bg: var(--bew-glass-tint);
      --bewly-widescreen-aux-controls-width: calc(var(--bew-control-height, 36px) * 5 + var(--bew-space-2, 8px) * 5);
    }

    /* The native player is a body child, not a descendant of the Bewly overlay.
       Keep its progress tokens on the shared widescreen owner so both themes inherit them. */
    body.${BODY_CLASS} {
      --bewly-widescreen-progress-track: color-mix(in srgb, var(--bew-text-1) 32%, transparent);
      --bewly-widescreen-progress-buffer: color-mix(in srgb, var(--bew-text-1) 44%, transparent);
      --bewly-widescreen-progress-played: var(--bew-theme-color);
    }

    html.dark body.${BODY_CLASS} {
      --bewly-widescreen-progress-played: #fff;
    }

    /* Only our shell owns this box model. Native controls, guides and ending
       panels retain the dimensions expected by their original components. */
    #${ROOT_ID},
    #${ROOT_ID} :where([class^="bewly-widescreen-"], [class*=" bewly-widescreen-"]) {
      box-sizing: border-box;
    }

    /* During the zoom the player passes over the shell's fading panels. The
       shell returns on top afterwards; filled, it holds only the idle progress. */
    #${ROOT_ID}[data-zooming="true"] {
      z-index: calc(var(--bew-z-widescreen) - 2);
    }

    /* Two panes: the video flush with the window's edges, the column beside
       it keeping the page padding itself. */
    #${ROOT_ID} .bewly-widescreen-stage {
      display: grid;
      grid-template-columns: var(--bewly-widescreen-card-width) minmax(0, 1fr);
      grid-template-rows: minmax(0, 1fr);
      grid-template-areas: "player rail";
      width: 100%;
      height: 100dvh;
      padding: 0;
      overflow: hidden;
    }

    #${ROOT_ID}[data-sidebar-position="left"] .bewly-widescreen-stage {
      grid-template-columns: minmax(0, 1fr) var(--bewly-widescreen-card-width);
      grid-template-areas: "rail player";
    }

    #${ROOT_ID} .bewly-widescreen-player-slot {
      display: flex;
      flex-direction: column;
      position: relative;
      min-width: 0;
      min-height: 0;
      padding: 0;
      background: transparent;
      isolation: isolate;
      z-index: 0;
      grid-area: player;
      pointer-events: none;
    }

    /* Layout box of the video pane, square and the window's full height. The
       native player is anchored to it (it is not a descendant) and
       letterboxes the video in it. */
    #${ROOT_ID} .bewly-widescreen-player-frame {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      flex: 1 1 auto;
      width: 100%;
      min-width: 0;
      min-height: 0;
      overflow: hidden;
      pointer-events: none;
    }

    /* Reserved for future pane icons: a fixed, empty row at the pane's
       top-left, inset like the controls, where Bilibili's follow widget sat.
       It paints nothing and lets clicks through; icons placed in it opt in
       with their own pointer-events. Filled, the pane is gone, so it hides. */
    #${ROOT_ID} .bewly-widescreen-player-toolbar {
      position: absolute;
      top: var(--bewly-widescreen-card-inset);
      left: var(--bewly-widescreen-card-inset);
      z-index: 1;
      display: flex;
      align-items: center;
      gap: var(--bew-space-2);
      width: calc(var(--bew-control-height) * 4 + var(--bew-space-2) * 3);
      height: var(--bew-control-height);
      pointer-events: none;
    }

    #${ROOT_ID}:is([data-display-mode="fill"], [data-zooming="true"]) .bewly-widescreen-player-toolbar {
      visibility: hidden;
    }

    #${ROOT_ID} .bewly-widescreen-player-frame > :not(.bewly-widescreen-idle-progress) {
      width: 100% !important;
      max-width: 100% !important;
      height: 100% !important;
      max-height: 100% !important;
      aspect-ratio: auto !important;
      margin: 0 !important;
      flex: 0 1 auto;
    }

    /* The player stays in its native event tree. Only its actual ancestor
       chain loses containing blocks/clipping while the anchored shell owns geometry. */
    body.${BODY_CLASS} .${NATIVE_PLAYER_ANCESTOR_CLASS} {
      position: static !important;
      transform: none !important;
      translate: none !important;
      scale: none !important;
      rotate: none !important;
      perspective: none !important;
      filter: none !important;
      backdrop-filter: none !important;
      contain: none !important;
      content-visibility: visible !important;
      overflow: visible !important;
      clip-path: none !important;
      isolation: auto !important;
      z-index: auto !important;
    }

    /* Unhydrated native right-column modules stay mounted for their own data
       and event ownership, but never paint through the standalone player shell.
       A transferred node naturally leaves this scope and becomes visible. */
    body.${BODY_CLASS} .${NATIVE_PLAYER_ANCESTOR_CLASS} :is(.right-container, .plp-r),
    body.${BODY_CLASS} .${NATIVE_PLAYER_ANCESTOR_CLASS} :is(.right-container, .plp-r) * {
      visibility: hidden !important;
    }

    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} {
      position: fixed !important;
      top: var(--bewly-widescreen-player-top) !important;
      left: var(--bewly-widescreen-player-left) !important;
      z-index: calc(var(--bew-z-widescreen) - 1) !important;
      width: var(--bewly-widescreen-player-width) !important;
      max-width: var(--bewly-widescreen-player-width) !important;
      height: var(--bewly-widescreen-player-height) !important;
      max-height: var(--bewly-widescreen-player-height) !important;
      margin: 0 !important;
      padding: 0 !important;
      min-width: 0 !important;
      min-height: 0 !important;
      aspect-ratio: auto !important;
      overflow: hidden !important;
      background: var(--bew-player-canvas) !important;
    }

    /* Outside the zoom, nothing native clips or rounds the anchored player:
       both the pane and the filled video are square. The zoom animates the
       clip, so it must not be overridden by an important declaration while
       it runs. */
    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS}:not([${PLAYER_ZOOMING_ATTRIBUTE}]) {
      clip-path: none !important;
    }

    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} {
      border-radius: 0 !important;
    }

    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} > #bilibili-player,
    body.${BODY_CLASS} #bilibili-player-wrap.${NATIVE_PLAYER_CLASS} :is(
      [class*="video_playerInner"], #bilibili-player, .big-nano-player,
      [class*="NanoPlayer_nonoPlayerContainer"], [class*="NanoPlayer_nonoPlayerPrimaryArea"], [class*="NanoPlayer_nanoDocker"]
    ),
    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} > #bilibiliPlayer,
    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .bpx-docker-major,
    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .bpx-player-container,
    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .bpx-player-primary-area,
    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .bpx-player-video-area,
    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .bpx-player-video-wrap,
    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .bilibili-player-video-area,
    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .bilibili-player-video-wrap {
      width: 100% !important;
      max-width: 100% !important;
      height: 100% !important;
      max-height: 100% !important;
    }

    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .bpx-player-container {
      inset: auto !important;
      transform: none !important;
    }

    body.${BODY_CLASS} #bilibili-player-wrap.${NATIVE_PLAYER_CLASS} [class*="video_playerInner"] {
      position: absolute !important;
      inset: 0 !important;
      padding: 0 !important;
      margin: 0 !important;
    }

    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} :is(
      .bpx-player-control-wrap,
      .bilibili-player-video-control-wrap,
      .bilibili-player-video-control,
      .squirtle-controller
    ) {
      right: var(--bewly-widescreen-controls-glass-inset) !important;
      bottom: calc(
        var(--bewly-widescreen-controls-glass-bottom) + var(--bewly-widescreen-bottom-controls-height)
      ) !important;
      left: var(--bewly-widescreen-controls-glass-inset) !important;
      width: auto !important;
      transition: opacity var(--bew-duration-moderate, 300ms) var(--bew-ease-standard, ease) !important;
      will-change: opacity;
    }

    /* 收起统一交给 BEWLY_WIDESCREEN_CONTROLS_HIDDEN_CLASS，忽略原生独立收起。
       常显只在非隐藏态生效，避免与统一隐藏规则发生 !important 级联战 */
    body.${BODY_CLASS}:not(.${BEWLY_WIDESCREEN_CONTROLS_HIDDEN_CLASS}) .${NATIVE_PLAYER_CLASS} :is(
      .bpx-player-control-wrap,
      .bilibili-player-video-control-wrap,
      .bilibili-player-video-control,
      .squirtle-controller
    ) {
      opacity: var(--bewly-widescreen-controls-opacity, 0) !important;
      visibility: visible !important;
      pointer-events: auto !important;
    }

    /* 显式反超原生空闲隐藏链（data-ctrl-hidden / bpx-state-no-cursor），
       原生隐藏只能由统一 BEWLY_WIDESCREEN_CONTROLS_HIDDEN_CLASS 表达 */
    body.${BODY_CLASS}:not(.${BEWLY_WIDESCREEN_CONTROLS_HIDDEN_CLASS}) .${NATIVE_PLAYER_CLASS} :is(
      .bpx-player-container[data-ctrl-hidden] .bpx-player-control-wrap,
      .bpx-player-container.bpx-state-no-cursor .bpx-player-control-wrap,
      .bpx-player-container[data-ctrl-hidden] .bpx-player-control-top,
      .bpx-player-container[data-ctrl-hidden] .bpx-player-control-bottom,
      .bpx-player-container.bpx-state-no-cursor .bpx-player-control-top,
      .bpx-player-container.bpx-state-no-cursor .bpx-player-control-bottom
    ) {
      opacity: 1 !important;
      visibility: visible !important;
      transform: none !important;
      pointer-events: auto !important;
    }

    /* Hidden controls must still participate in measurement before reveal.
       Only the outer wrap is displayed; opacity and pointer ownership stay unified. */
    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} :is(
      .bpx-player-control-wrap,
      .bpx-player-container[data-ctrl-hidden] .bpx-player-control-wrap,
      .bpx-player-container.bpx-state-no-cursor .bpx-player-control-wrap,
      .bpx-player-control-wrap[hidden]
    ) {
      display: block !important;
    }

    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} :is(.bpx-player-control-top, .bpx-player-control-bottom) {
      transform: none !important;
    }

    /* 原生底部渐变遮罩（180px repeat-x 暗化层）：禁用，悬浮卡只保留自己的玻璃表面 */
    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .bpx-player-control-mask {
      display: none !important;
      background: none !important;
    }

    body.${BODY_CLASS}.${BEWLY_WIDESCREEN_CONTROLS_HIDDEN_CLASS} .${NATIVE_PLAYER_CLASS} :is(
      .bpx-player-control-wrap,
      .bilibili-player-video-control-wrap,
      .bilibili-player-video-control,
      .squirtle-controller
    ) {
      transform: none !important;
      opacity: 0 !important;
      pointer-events: none !important;
    }

    /* 共用悬浮玻璃卡：原生控制栏去掉自带底色/渐变并提升到玻璃卡上方，
       文字与单色图标跟随主题前景，保留彩色图标语义 */
    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} :is(
      .bpx-player-control-wrap,
      .bilibili-player-video-control-wrap,
      .bilibili-player-video-control,
      .squirtle-controller
    ) {
      z-index: var(--bew-z-popover) !important;
      color: var(--bew-text-1) !important;
      background: transparent !important;
      background-image: none !important;
      text-shadow: none !important;
    }

    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} :is(
      .bpx-player-control-wrap,
      .bilibili-player-video-control-wrap,
      .bilibili-player-video-control,
      .squirtle-controller
    ) :is(.bpx-player-control-top, .bpx-player-control-bottom) {
      background: transparent !important;
    }

    /* 整个悬浮卡统一模糊与表面：清除控制栏家族（含进度区）自带的
       深色渐变 / backdrop 模糊层；仅移除 background-image，保留进度轨道纯色 */
    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} :is(
      .bpx-player-control-wrap,
      .bpx-player-control-top,
      .bpx-player-control-bottom,
      .bpx-player-progress-wrap,
      .bilibili-player-video-control-wrap,
      .bilibili-player-video-control,
      .squirtle-controller,
      .squirtle-controller > *
    ) {
      background-image: none !important;
      backdrop-filter: none !important;
    }

    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} :is(
      .bpx-player-control-wrap,
      .bpx-player-control-top,
      .bpx-player-control-bottom,
      .bilibili-player-video-control-wrap,
      .bilibili-player-video-control,
      .squirtle-controller
    )::before,
    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} :is(
      .bpx-player-control-wrap,
      .bpx-player-control-top,
      .bpx-player-control-bottom,
      .bilibili-player-video-control-wrap,
      .bilibili-player-video-control,
      .squirtle-controller
    )::after {
      background-image: none !important;
      backdrop-filter: none !important;
    }

    /* Every "-ctrl-" element and popup lives inside a control button, so
       \`.bpx-player-ctrl-btn *\` reaches them. Class-substring selectors stay in
       the subject: above it they make any class change restyle whole subtrees
       (see scripts/cssInvalidation.ts). */
    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} :is(
      .bpx-player-control-wrap .bpx-player-ctrl-btn,
      .bpx-player-control-wrap .bpx-player-ctrl-btn *,
      .bpx-player-control-wrap [class*="-ctrl-"],
      .bpx-player-control-wrap .bpx-player-progress-popup,
      .bpx-player-control-wrap .bpx-player-progress-popup :is(span, div, li, a, p, i),
      .bilibili-player-video-control-wrap .bilibili-player-video-btn,
      .bilibili-player-video-control-wrap .bilibili-player-video-btn *,
      .squirtle-controller .squirtle-controller-left *,
      .squirtle-controller .squirtle-controller-right *,
      .squirtle-controller .squirtle-progress-wrap *
    ) {
      color: var(--bew-text-1) !important;
    }

    /* bpx 主题变量族主动接管：图标/文字/提示/辅助面板背景随 --bew-* 主题 */
    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} :is(
      .bpx-player-container,
      .bilibili-player,
      .squirtle-video-wrap
    ) {
      --bpx-primary-color: var(--bew-text-1);
      --bpx-primary-bgcolor: transparent;
      --bpx-fn-color: var(--bew-text-1);
      --bpx-fn-hover-color: var(--bew-text-1);
      --bpx-tooltip-color: var(--bew-text-1);
      --bpx-tooltip-bgcolor: var(--bew-elevated-alt-solid);
      --bpx-aux-header-bg: var(--bew-elevated-alt-solid);
      --bpx-aux-content-bg: var(--bew-elevated-alt-solid);
    }

    /* Preserve fill="none" and stroke="none"; painting every SVG descendant
       changes native outlined icons and the sound-settings switch geometry. */
    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} :is(
      .bpx-player-control-wrap,
      .bilibili-player-video-control-wrap,
      .bilibili-player-video-control,
      .squirtle-controller
    ) :is(svg:not([fill="none"]), svg [fill]:not([fill="none"])) {
      fill: currentColor !important;
    }

    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} :is(
      .bpx-player-control-wrap,
      .bilibili-player-video-control-wrap,
      .bilibili-player-video-control,
      .squirtle-controller
    ) svg [stroke]:not([stroke="none"]) {
      stroke: currentColor !important;
    }

    /* 原生空闲隐藏 (data-ctrl-hidden) 会连带把进度条本体压成 visibility:hidden /
       背景透明；统一显隐接管后须补回可见性（否则任何着色都不画） */
    body.${BODY_CLASS}:not(.${BEWLY_WIDESCREEN_CONTROLS_HIDDEN_CLASS}) .${NATIVE_PLAYER_CLASS} :is(
      .bpx-player-progress-wrap,
      .bpx-player-progress-wrap *
    ) {
      visibility: visible !important;
    }

    /* 进度条（实测 DOM）：轨道 = schedule 容器本体，缓冲 = schedule-buffer，
       已播放 = schedule-current；thumb 拖拽头完全不触碰 */
    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .bpx-player-progress-wrap :is(
      .bpx-player-progress,
      .bpx-player-progress-schedule
    ) {
      background: var(--bewly-widescreen-progress-track) !important;
      box-shadow: none !important;
    }
    /* 部分播放器版本把可见细线画在伪元素上，覆盖同一轨道表面 */
    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .bpx-player-progress-wrap :is(
      .bpx-player-progress-schedule::before,
      .bpx-player-progress-schedule::after,
      .bpx-player-progress-schedule-wrap::before,
      .bpx-player-progress-schedule-wrap::after
    ) {
      background: var(--bewly-widescreen-progress-track) !important;
      background-color: var(--bewly-widescreen-progress-track) !important;
      box-shadow: none !important;
    }
    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .bpx-player-progress-wrap
      .bpx-player-progress-schedule-buffer {
      background: var(--bewly-widescreen-progress-buffer) !important;
      box-shadow: none !important;
    }
    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .bpx-player-progress-wrap
      .bpx-player-progress-schedule-current {
      background: var(--bewly-widescreen-progress-played) !important;
      border-color: var(--bewly-widescreen-progress-played) !important;
      box-shadow: none !important;
    }

    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} ${HIGH_ENERGY_PROGRESS_PIN_SELECTOR} {
      display: none !important;
    }

    /* 画质/音质/倍速/音量/播放设置等弹窗统一为弹幕设置同款实色表面并适配文字 */
    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .bpx-player-control-wrap .bpx-player-ctrl-btn > :is(
      [class*="panel"],
      [class*="menu"],
      [class*="popup"],
      [class*="box"]
    ):not(svg):not([class*="-item"]):not([class*="-btn"]):not([class*="-icon"]),
    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .bpx-player-control-wrap .bpx-player-ctrl-quality-menu-wrap > .bpx-player-ctrl-quality-menu,
    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .bpx-player-control-wrap .bpx-player-progress-popup,
    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .bpx-player-control-wrap .bpx-player-ctrl-setting-menu,
    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .bpx-player-control-wrap .bpx-player-ctrl-pip-tip {
      ${PLAYER_POPOVER_SURFACE}
      color: var(--bew-text-1) !important;
    }

    /* The settings box is only a positioning owner. Its inner menu is the one
       visual surface, matching the quality selector without a nested dark plate. */
    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .bpx-player-control-wrap .bpx-player-ctrl-setting-box {
      background: transparent !important;
      border: 0 !important;
      box-shadow: none !important;
      backdrop-filter: none !important;
    }

    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .bpx-player-control-wrap .bpx-player-ctrl-setting-menu :is(
      .bpx-player-ctrl-setting-menu-left,
      .bpx-player-ctrl-setting-menu-right
    ) {
      background: transparent !important;
    }

    /* Popup text is covered by the control-button rule above. */
    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .bpx-player-control-wrap :is(
      .bpx-player-ctrl-setting-box,
      .bpx-player-ctrl-volume-box
    ) :is(
      [class*="item"],
      [class*="option"]
    ):hover {
      background: var(--bew-fill-1) !important;
    }
    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .bpx-player-control-wrap :is(
      .bpx-state-active,
      [class*="active"]
    ):not(svg) {
      color: var(--bew-text-1) !important;
    }

    /* Player feedback, opened by the docked help button. The native panel
       (.b-back-panel) sits over the video, outside the control wrap, so it
       takes the shared popover surface here: a left-aligned title row, option
       rows with neutral radios, inputs on the shared input tokens and the
       accent submit button. Text inherits the panel colour; only the classes
       Bilibili colours itself are re-pointed, by class, so no rule here keys
       on a bare element type across the page. */
    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .b-back-panel {
      ${PLAYER_POPOVER_SURFACE}
      box-sizing: border-box;
      overflow: hidden;
      color: var(--bew-text-1) !important;
      font-size: var(--bew-font-size-control) !important;
      line-height: var(--bew-line-height-control) !important;
    }

    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .b-back-panel :is(
      .b-back-content-success-title,
      .b-back-content-fail-title,
      .b-back-content-test-title,
      .b-back-content-test-fail-title,
      .b-back-content-test-success-title,
      .b-back-content-test-success-circle-wrap
    ) {
      color: var(--bew-text-1) !important;
    }

    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .b-back-panel :is(
      .b-back-content-success-tips-wrap,
      .b-back-content-fail-tips-wrap,
      .b-back-content-test-success-tips
    ) {
      color: var(--bew-text-3) !important;
    }

    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .b-back-panel .b-back-title {
      display: flex;
      align-items: center;
      height: var(--bew-space-12);
      padding: 0 var(--bew-space-12) 0 var(--bew-space-4);
      border-bottom: 1px solid var(--bew-border-color) !important;
      font-size: var(--bew-font-size-title) !important;
      font-weight: var(--bew-font-weight-medium);
      line-height: var(--bew-line-height-title) !important;
      text-align: left !important;
    }

    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .b-back-panel-close {
      display: flex !important;
      align-items: center;
      justify-content: center;
      top: calc((var(--bew-space-12) - var(--bew-control-height-sm)) / 2) !important;
      right: calc((var(--bew-space-12) - var(--bew-control-height-sm)) / 2) !important;
      width: var(--bew-control-height-sm) !important;
      height: var(--bew-control-height-sm) !important;
      border-radius: var(--bew-interactive-radius);
      corner-shape: var(--bew-corner-shape);
      fill: var(--bew-text-2) !important;
      transition:
        background-color var(--bew-duration-fast, 150ms) var(--bew-ease-standard, ease),
        fill var(--bew-duration-fast, 150ms) var(--bew-ease-standard, ease);
    }

    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .b-back-panel-close > svg {
      width: var(--bew-icon-size-sm);
      height: var(--bew-icon-size-sm);
    }

    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .b-back-panel-close:hover {
      background: var(--bew-fill-1);
      fill: var(--bew-text-1) !important;
    }

    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .b-back-panel .b-back-content-default {
      margin: var(--bew-space-3) var(--bew-space-4) var(--bew-space-4) !important;
      font-size: inherit !important;
    }

    /* Two columns of option rows; the absolutely placed tip still overlays them. */
    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .b-back-panel .b-back-content-tabmenu {
      display: grid !important;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--bew-space-1);
      height: auto !important;
      margin-inline: calc(var(--bew-space-2) * -1);
    }

    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .b-back-panel .b-back-tabmenu-list {
      --bewly-feedback-radio-size: var(--bew-icon-size-xs, 14px);
      float: none !important;
      width: auto !important;
      height: var(--bew-control-height-sm) !important;
      margin: 0 !important;
      padding: 0 var(--bew-space-2) 0 calc(var(--bew-space-2) * 2 + var(--bewly-feedback-radio-size)) !important;
      border-radius: var(--bew-interactive-radius);
      corner-shape: var(--bew-corner-shape);
      color: var(--bew-text-2) !important;
      line-height: var(--bew-control-height-sm) !important;
      transition:
        background-color var(--bew-duration-fast, 150ms) var(--bew-ease-standard, ease),
        color var(--bew-duration-fast, 150ms) var(--bew-ease-standard, ease);
    }

    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .b-back-panel .b-back-tabmenu-list:hover {
      background: var(--bew-fill-1);
      color: var(--bew-text-1) !important;
    }

    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .b-back-panel .b-back-tabmenu-list.b-back-show {
      color: var(--bew-text-1) !important;
    }

    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .b-back-panel .b-back-tabmenu-list::before,
    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .b-back-panel .b-back-tabmenu-list.b-back-show::after {
      position: absolute;
      top: 50% !important;
      box-sizing: border-box;
      border-radius: 50%;
      corner-shape: var(--bew-corner-shape-round, round);
      translate: 0 -50%;
    }

    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .b-back-panel .b-back-tabmenu-list::before {
      left: var(--bew-space-2) !important;
      width: var(--bewly-feedback-radio-size) !important;
      height: var(--bewly-feedback-radio-size) !important;
      border: 1.5px solid var(--bew-text-3) !important;
      transition: border-color var(--bew-duration-fast, 150ms) var(--bew-ease-standard, ease);
    }

    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .b-back-panel .b-back-tabmenu-list.b-back-show::before {
      border-color: var(--bew-text-1) !important;
    }

    /* The chosen radio's dot: a quarter of the ring's inner diameter on each side. */
    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .b-back-panel .b-back-tabmenu-list.b-back-show::after {
      left: calc(var(--bew-space-2) + var(--bewly-feedback-radio-size) / 4) !important;
      width: calc(var(--bewly-feedback-radio-size) / 2) !important;
      height: calc(var(--bewly-feedback-radio-size) / 2) !important;
      margin: 0 !important;
      background: var(--bew-text-1) !important;
    }

    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .b-back-panel :is(.b-back-tabmenu-tip, .b-back-tooltip) {
      ${PLAYER_POPOVER_SURFACE}
      color: var(--bew-text-1) !important;
    }

    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .b-back-panel .b-back-contact-information {
      align-items: center;
      gap: var(--bew-space-3);
      margin-top: var(--bew-space-3);
    }

    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .b-back-panel .b-back-contact-information-tip {
      flex: none;
      color: var(--bew-text-2) !important;
    }

    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .b-back-panel :is(.b-back-input, .b-back-contact-information-input) {
      box-sizing: border-box;
      flex: 1 1 auto;
      min-width: 0;
      height: var(--bew-control-height-sm) !important;
      padding: 0 var(--bew-space-2) !important;
      color: var(--bew-text-1) !important;
      background: var(--bew-input-bg) !important;
      border: 1px solid var(--bew-input-border-color) !important;
      border-radius: var(--bew-interactive-radius) !important;
      corner-shape: var(--bew-corner-shape);
      font: inherit !important;
      outline: none;
      transition: border-color var(--bew-duration-fast, 150ms) var(--bew-ease-standard, ease);
    }

    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .b-back-panel :is(.b-back-input, .b-back-contact-information-input):hover {
      border-color: var(--bew-input-border-color-hover) !important;
    }

    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .b-back-panel :is(.b-back-input, .b-back-contact-information-input):focus {
      border-color: var(--bew-focus-ring-color) !important;
    }

    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .b-back-panel :is(.b-back-input, .b-back-contact-information-input)::placeholder {
      color: var(--bew-text-3);
    }

    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .b-back-panel :is(.b-back-input-overrange, .b-back-type-error) {
      color: var(--bew-error-color) !important;
    }

    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .b-back-panel .b-back-submit-wrap {
      justify-content: center;
      height: auto !important;
      margin-top: var(--bew-space-4) !important;
      padding: var(--bew-space-4) 0 0 !important;
      border: 0 !important;
      border-top: 1px solid var(--bew-border-color) !important;
    }

    /* The panel's one primary action keeps the accent; disabled, it is neutral. */
    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .b-back-panel :is(.b-back-submit, .b-back-content-fail-resubmit, .b-back-content-test-submit, .b-back-content-test-fail-submit, .b-back-content-test-success-submit, .b-back-content-test-speedtest, .b-back-content-test-fail-speedtest) {
      box-sizing: border-box;
      display: inline-flex !important;
      align-items: center;
      justify-content: center;
      min-width: calc(var(--bew-space-12) * 2);
      height: var(--bew-control-height-sm) !important;
      padding: 0 var(--bew-space-4) !important;
      color: var(--bew-on-accent-solid) !important;
      background: var(--bew-accent-solid) !important;
      border: 0 !important;
      border-radius: var(--bew-interactive-radius) !important;
      corner-shape: var(--bew-corner-shape);
      font-weight: var(--bew-font-weight-medium);
      line-height: var(--bew-control-height-sm) !important;
      transition:
        filter var(--bew-duration-fast, 150ms) var(--bew-ease-standard, ease),
        scale var(--bew-duration-fast, 150ms) var(--bew-ease-standard, ease);
    }

    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .b-back-panel :is(.b-back-submit, .b-back-content-fail-resubmit, .b-back-content-test-submit, .b-back-content-test-fail-submit, .b-back-content-test-success-submit, .b-back-content-test-speedtest, .b-back-content-test-fail-speedtest):not(.disable):hover {
      filter: brightness(1.08);
    }

    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .b-back-panel :is(.b-back-submit, .b-back-content-fail-resubmit, .b-back-content-test-submit, .b-back-content-test-fail-submit, .b-back-content-test-success-submit, .b-back-content-test-speedtest, .b-back-content-test-fail-speedtest):not(.disable):active {
      scale: 0.97;
    }

    /* Secondary (speed test) and unavailable actions are neutral. */
    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .b-back-panel :is(.b-back-content-test-speedtest, .b-back-content-test-fail-speedtest) {
      color: var(--bew-text-1) !important;
      background: var(--bew-fill-1) !important;
    }

    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .b-back-panel :is(.b-back-content-test-speedtest, .b-back-content-test-fail-speedtest):hover {
      background: var(--bew-fill-2) !important;
      filter: none;
    }

    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .b-back-panel :is(.b-back-submit.disable, .b-back-content-fail-resubmit:not(.b-back-show)) {
      color: var(--bew-text-3) !important;
      background: var(--bew-fill-1) !important;
      cursor: not-allowed;
    }

    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .b-back-panel .b-back-version-wrap {
      justify-content: center;
      gap: var(--bew-space-4);
      margin-top: var(--bew-space-3) !important;
    }

    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .b-back-panel .b-back-version-wrap a {
      margin: 0 !important;
      color: var(--bew-text-3) !important;
      font-size: var(--bew-font-size-caption) !important;
      line-height: var(--bew-line-height-caption) !important;
      transition: color var(--bew-duration-fast, 150ms) var(--bew-ease-standard, ease);
    }

    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .b-back-panel .b-back-version-wrap a:hover {
      color: var(--bew-text-1) !important;
    }

    /* Result and speed-test views: links read as links. */
    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .b-back-panel :is(.b-back-content-success-tips-wrap, .b-back-content-fail-tips-wrap, .b-back-content-test-success-tips) a {
      color: var(--bew-theme-foreground) !important;
    }

    /* 弹幕设置/弹幕样式弹窗文字颜色适配浅色模式（含后代选项与交互态） */
    ${DANMAKU_SURFACE_SELECTOR} .bpx-player-dm-setting-box,
    ${DANMAKU_SURFACE_SELECTOR} .bpx-player-dm-setting-box :is(span, div, li, a, p, i),
    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .bpx-player-mode-selection-container,
    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .bpx-player-mode-selection-container :is(span, div, li, a, p, i) {
      color: var(--bew-text-1) !important;
    }

    /* Keep the player bounds stable while the bottom surfaces reveal. Changing
       flex height here moves the native hover boundary and creates an enter / leave loop. */
    ${DANMAKU_SURFACE_SELECTOR} {
      box-sizing: border-box !important;
      position: absolute !important;
      right: var(--bewly-widescreen-controls-glass-inset) !important;
      bottom: var(--bewly-widescreen-controls-glass-bottom) !important;
      left: var(--bewly-widescreen-controls-glass-inset) !important;
      display: flex !important;
      align-items: center !important;
      width: auto !important;
      max-width: 100% !important;
      height: var(--bewly-widescreen-bottom-controls-height) !important;
      max-height: var(--bewly-widescreen-bottom-controls-height) !important;
      min-height: var(--bewly-widescreen-bottom-controls-height) !important;
      margin: 0 !important;
      padding: var(--bew-space-2, 8px) !important;
      color: var(--bew-text-1) !important;
      background: transparent !important;
      border: 0 !important;
      box-shadow: none !important;
      backdrop-filter: none !important;
      isolation: auto !important;
      --bpx-dmsend-switch-icon: var(--bew-text-1);
      opacity: var(--bewly-widescreen-controls-opacity, 0) !important;
      transform: none !important;
      transition:
        border-color var(--bew-duration-normal, 200ms) var(--bew-ease-standard, ease),
        opacity var(--bew-duration-moderate, 300ms) var(--bew-ease-standard, ease),
        background-color var(--bew-duration-normal, 200ms) var(--bew-ease-standard, ease);
      will-change: opacity;
      pointer-events: auto !important;
      overflow: visible !important;
      z-index: 4 !important;
    }

    ${DANMAKU_SURFACE_SELECTOR}::before,
    ${DANMAKU_SURFACE_SELECTOR}::after {
      content: none !important;
      display: none !important;
    }

    /* 统一悬浮玻璃卡：包住原生控制栏（含进度行）与底部弹幕控制区。
       高度由 JS 测量原生控制栏后写入 --bewly-widescreen-controls-glass-height。 */
    body.${BODY_CLASS} .${DANMAKU_GLASS_CLASS} {
      box-sizing: border-box !important;
      position: absolute !important;
      right: var(--bewly-widescreen-controls-glass-inset) !important;
      bottom: var(--bewly-widescreen-controls-glass-bottom) !important;
      left: var(--bewly-widescreen-controls-glass-inset) !important;
      width: auto !important;
      height: var(--bewly-widescreen-controls-glass-height) !important;
      z-index: calc(var(--bew-z-popover) - 1) !important;
      background: var(--bewly-widescreen-danmaku-bar-bg) !important;
      border: 1px solid var(--bew-glass-border-color) !important;
      border-radius: var(--bewly-widescreen-shell-radius) !important;
      corner-shape: var(--bew-corner-shape);
      box-shadow: none !important;
      backdrop-filter: var(--bew-filter-glass-1) !important;
      background-clip: padding-box !important;
      opacity: var(--bewly-widescreen-controls-opacity, 0) !important;
      transform: none !important;
      transition: opacity var(--bew-duration-moderate, 300ms) var(--bew-ease-standard, ease);
      will-change: opacity;
      pointer-events: none !important;
    }

    #${ROOT_ID}[data-player-controls-hidden="true"] .bewly-widescreen-danmaku-dock,
    body.${BODY_CLASS}.${BEWLY_WIDESCREEN_CONTROLS_HIDDEN_CLASS} .${DANMAKU_GLASS_CLASS},
    body.${BODY_CLASS}.${BEWLY_WIDESCREEN_CONTROLS_HIDDEN_CLASS}
      ${DANMAKU_SURFACE_SELECTOR}.${DANMAKU_SOURCE_HOST_CLASS} {
      opacity: 0 !important;
      transform: none !important;
      pointer-events: none !important;
    }

    #${ROOT_ID} .bewly-widescreen-danmaku-dock {
      padding: 0 !important;
      background: transparent !important;
      border: 0 !important;
      pointer-events: none !important;
    }

    ${DANMAKU_SURFACE_SELECTOR}.${DANMAKU_SOURCE_HOST_CLASS} {
      z-index: var(--bew-z-popover) !important;
      font-family: var(--bew-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif) !important;
    }

    /* 只让最外层提示承担表面，匹配截图按钮的单层 Tooltip。 */
    body.${BODY_CLASS} .bpx-player-tooltip-item,
    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .bewly-player-tooltip,
    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .bpx-player-ctrl-pip-tip {
      box-sizing: border-box !important;
      z-index: var(--bew-z-hud) !important;
      padding: var(--bew-space-1, 4px) var(--bew-space-2, 8px) !important;
      ${PLAYER_POPOVER_SURFACE}
      color: var(--bew-text-1) !important;
      font-size: var(--bew-font-size-caption, 12px) !important;
      font-weight: var(--bew-font-weight-regular, 400) !important;
      line-height: var(--bew-line-height-caption, 16px) !important;
      white-space: nowrap;
    }

    /* The fill control stands in for the hidden native wide / web / full
       buttons and draws its Tabler glyph in the native icon box. Bpx sizes
       that box from its SVG and zeroes the font size, so the mask icon's
       intrinsic 1.2em would collapse; the box takes the button's height and
       the glyph a fixed icon size instead. */
    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .${FILL_TOGGLE_CLASS} .bpx-player-ctrl-btn-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      height: 100%;
    }

    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .${FILL_TOGGLE_CLASS}__icon {
      flex: none;
      width: var(--bew-icon-size-md, 20px);
      height: var(--bew-icon-size-md, 20px);
    }

    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .${FILL_TOGGLE_CLASS}:focus-visible {
      outline: var(--bew-focus-ring, 1px solid CanvasText);
      outline-offset: calc(-1 * var(--bew-space-0-5, 2px));
      border-radius: var(--bew-interactive-radius, 8px);
    }

    body.${BODY_CLASS} .bpx-player-tooltip-title,
    body.${BODY_CLASS} .bpx-player-tooltip-area {
      color: inherit !important;
      background: transparent !important;
      border: 0 !important;
      border-radius: 0 !important;
      box-shadow: none !important;
      backdrop-filter: none !important;
    }

    body.${BODY_CLASS} .bpx-player-tooltip-title {
      padding: 0 !important;
      font: inherit !important;
      line-height: inherit !important;
    }

    ${DANMAKU_SURFACE_SELECTOR}:empty {
      display: none;
    }

    ${DANMAKU_SURFACE_SELECTOR} .bpx-player-sending-bar,
    ${DANMAKU_SURFACE_SELECTOR} .bilibili-player-video-sendbar,
    ${DANMAKU_SURFACE_SELECTOR} .bilibili-player-video-inputbar {
      position: relative !important;
      display: flex !important;
      align-items: center !important;
      gap: var(--bew-space-2, 8px) !important;
      left: auto !important;
      right: auto !important;
      top: auto !important;
      bottom: auto !important;
      width: 100% !important;
      max-width: 100% !important;
      height: var(--bew-control-height, 36px) !important;
      min-height: var(--bew-control-height, 36px) !important;
      margin: 0 !important;
      padding: 0 !important;
      color: var(--bew-text-1) !important;
      background: transparent !important;
      border: 0 !important;
      border-radius: 0 !important;
      transform: none !important;
      box-shadow: none !important;
      backdrop-filter: none !important;
      overflow: visible !important;
      z-index: auto !important;
    }

    ${DANMAKU_SURFACE_SELECTOR} :is(
      .bpx-player-sending-bar,
      .bilibili-player-video-sendbar,
      .bilibili-player-video-inputbar
    )::before,
    ${DANMAKU_SURFACE_SELECTOR} :is(
      .bpx-player-sending-bar,
      .bilibili-player-video-sendbar,
      .bilibili-player-video-inputbar
    )::after {
      content: none !important;
      display: none !important;
    }

    ${DANMAKU_SURFACE_SELECTOR} .bpx-player-video-inputbar {
      background: var(--bew-elevated-alt-solid) !important;
      border: 1px solid var(--bew-surface-border-color) !important;
      box-shadow: var(--bew-popover-surface-shadow) !important;
      backdrop-filter: none !important;
      background-clip: padding-box !important;
    }

    ${DANMAKU_SURFACE_SELECTOR} .bpx-player-video-info {
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      height: var(--bew-control-height, 36px) !important;
      min-height: var(--bew-control-height, 36px) !important;
      margin: 0 !important;
      padding: 0 var(--bew-space-3, 12px) !important;
      color: var(--bew-on-overlay-color) !important;
      background: var(--bew-overlay-background) !important;
      border: 0 !important;
      border-radius: var(--bew-badge-radius) !important;
      corner-shape: var(--bew-corner-shape-round);
      box-shadow: none !important;
      backdrop-filter: none !important;
      font-size: var(--bew-font-size-caption, 12px) !important;
      line-height: var(--bew-line-height-caption, 16px) !important;
      white-space: nowrap;
    }

    /* With the card the viewer count reads in the info's meta line
       (syncViewerCount); the bar keeps only controls. */
    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS}[${PLAYER_DISPLAY_MODE_ATTRIBUTE}="card"] ${DANMAKU_SURFACE_SELECTOR} .bpx-player-video-info[${VIEWER_COUNT_MIRRORED_ATTRIBUTE}] {
      display: none !important;
    }

    ${DANMAKU_SURFACE_SELECTOR} .bpx-player-dm-root {
      display: flex !important;
      align-items: center !important;
      gap: var(--bew-space-2, 8px) !important;
      margin-left: var(--bewly-widescreen-aux-controls-width) !important;
      min-width: 0;
      flex: 1 1 auto;
      background: transparent !important;
    }

    ${DANMAKU_SURFACE_SELECTOR} :is(.bpx-player-dm-switch, .bpx-player-dm-setting) {
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      position: relative !important;
      width: var(--bew-control-height, 36px) !important;
      height: var(--bew-control-height, 36px) !important;
      margin: 0 !important;
      padding: 0 !important;
      flex: 0 0 var(--bew-control-height, 36px) !important;
      color: var(--bew-text-1) !important;
      background: transparent !important;
      border: 0 !important;
      border-radius: 50% !important;
      corner-shape: var(--bew-corner-shape-round);
      box-shadow: none !important;
      cursor: pointer;
      font-size: var(--bew-icon-size-md, 20px) !important;
      line-height: 1 !important;
      transition:
        color var(--bew-duration-moderate, 300ms) var(--bew-ease-standard, ease),
        background-color var(--bew-duration-moderate, 300ms) var(--bew-ease-standard, ease),
        transform var(--bew-duration-moderate, 300ms) var(--bew-ease-emphasized, ease);
    }

    ${DANMAKU_SURFACE_SELECTOR} :is(.bpx-player-dm-switch, .bpx-player-dm-setting):hover {
      color: var(--bew-text-1) !important;
      background: var(--bew-fill-2) !important;
      border: 0 !important;
      box-shadow: none !important;
      transform: none !important;
    }

    ${DANMAKU_SURFACE_SELECTOR} :is(.bpx-player-dm-switch, .bpx-player-dm-setting):active {
      background: var(--bew-fill-3) !important;
      border: 0 !important;
      box-shadow: none !important;
      transform: none !important;
    }

    ${DANMAKU_SURFACE_SELECTOR} :is(.bpx-player-dm-setting, .bpx-player-video-btn-dm):has(
      .bpx-player-dm-setting-wrap,
      .bpx-player-mode-selection-container.active
    ) {
      transform: none !important;
    }

    ${DANMAKU_SURFACE_SELECTOR} .bpx-player-video-btn-dm:hover,
    ${DANMAKU_SURFACE_SELECTOR} .bpx-player-video-btn-dm:active {
      transform: none !important;
    }

    ${DANMAKU_SURFACE_SELECTOR} .bpx-player-dm-switch > *,
    ${DANMAKU_SURFACE_SELECTOR} .bpx-player-dm-setting > :not(.bpx-player-dm-setting-wrap, .bpx-player-dm-setting-box) {
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      position: absolute !important;
      top: 50% !important;
      right: auto !important;
      bottom: auto !important;
      left: 50% !important;
      z-index: 1;
      margin: 0 !important;
      translate: -50% -50% !important;
      transform: none !important;
      width: var(--bew-icon-size-md, 20px) !important;
      height: var(--bew-icon-size-md, 20px) !important;
      padding: 0 !important;
      flex: 0 0 auto;
    }

    /* Keep the settings popover outside the button's backdrop root. */
    ${DANMAKU_SURFACE_SELECTOR} .bpx-player-dm-setting {
      backdrop-filter: none !important;
    }

    ${DANMAKU_SURFACE_SELECTOR} .bpx-player-dm-setting::before {
      content: "";
      position: absolute;
      inset: 0;
      z-index: 0;
      border-radius: inherit;
      corner-shape: var(--bew-corner-shape-round);
      background: transparent !important;
      backdrop-filter: none !important;
      pointer-events: none;
    }

    ${DANMAKU_SURFACE_SELECTOR} :is(.bpx-player-dm-switch, .bpx-player-dm-setting) svg {
      position: static !important;
      inset: auto !important;
      display: block;
      width: var(--bew-icon-size-md, 20px) !important;
      height: var(--bew-icon-size-md, 20px) !important;
      margin: 0 !important;
      translate: none !important;
      transform: none !important;
    }

    ${DANMAKU_SURFACE_SELECTOR} .bpx-player-dm-switch > .bui-area {
      position: absolute !important;
      inset: 0 !important;
      width: 100% !important;
      height: 100% !important;
      background: transparent !important;
      border: 0 !important;
      box-shadow: none !important;
      translate: none !important;
      transform: none !important;
    }

    ${DANMAKU_SURFACE_SELECTOR} .bpx-player-dm-switch .bui-danmaku-switch-input {
      position: absolute !important;
      inset: 0 !important;
      width: 100% !important;
      height: 100% !important;
      margin: 0 !important;
      cursor: pointer;
    }

    ${DANMAKU_SURFACE_SELECTOR} .bpx-player-dm-switch .bui-danmaku-switch-label {
      position: absolute !important;
      inset: 0 !important;
      width: 100% !important;
      height: 100% !important;
      margin: 0 !important;
      padding: 0 !important;
      background: transparent !important;
      border: 0 !important;
      box-shadow: none !important;
    }

    ${DANMAKU_SURFACE_SELECTOR} .bpx-player-dm-switch :is(
      .bui-danmaku-switch-on,
      .bui-danmaku-switch-middle,
      .bui-danmaku-switch-off
    ) {
      position: absolute !important;
      inset: 0 !important;
      width: 100% !important;
      height: 100% !important;
      margin: 0 !important;
      padding: 0 !important;
      background: transparent !important;
      border: 0 !important;
      box-shadow: none !important;
      outline: 0 !important;
      line-height: 0 !important;
    }

    ${DANMAKU_SURFACE_SELECTOR} .bpx-player-dm-switch :is(
      .bui-danmaku-switch-on,
      .bui-danmaku-switch-middle,
      .bui-danmaku-switch-off
    ) svg {
      position: absolute !important;
      top: 50% !important;
      right: auto !important;
      bottom: auto !important;
      left: 50% !important;
      translate: -50% -50% !important;
      transform: none !important;
    }

    ${DANMAKU_SURFACE_SELECTOR} .bpx-player-dm-switch:focus-visible,
    ${DANMAKU_SURFACE_SELECTOR} .bpx-player-dm-setting:focus-visible,
    ${DANMAKU_SURFACE_SELECTOR} .bpx-player-dm-switch:has(.bui-danmaku-switch-input:focus-visible) {
      outline: var(--bew-focus-ring, 1px solid CanvasText);
      outline-offset: var(--bew-space-0-5, 2px);
    }

    /* 弹幕输入条：全圆角胶囊，高于其他弹幕控制按钮（36）一个 space-2（44）
       内部件 36px 同心嵌套（22 半径 - 4 内边距 = 18 半径） */
    ${DANMAKU_SURFACE_SELECTOR} .bpx-player-video-inputbar {
      display: flex !important;
      align-items: center !important;
      height: var(--bewly-widescreen-inputbar-height, 44px) !important;
      min-width: 0 !important;
      flex: 1 1 auto !important;
      gap: var(--bew-space-1, 4px) !important;
      padding-inline: var(--bew-space-1, 4px) !important;
      color: var(--bew-text-1) !important;
      background: transparent !important;
      backdrop-filter: none !important;
      border-radius: var(--bew-radius-full) !important;
      corner-shape: var(--bew-corner-shape-round);
      overflow: visible !important;
      transition:
        border-color var(--bew-duration-fast, 150ms) var(--bew-ease-standard, ease),
        box-shadow var(--bew-duration-fast, 150ms) var(--bew-ease-standard, ease);
    }

    /* 风格按钮（A）嵌入输入框左半圆；发送按钮全圆角嵌右缘 */
    ${DANMAKU_SURFACE_SELECTOR} .bpx-player-video-inputbar .bpx-player-dm-setting {
      order: -1 !important;
      margin: 0 !important;
    }

    /* 弹幕礼仪链接移除 */
    ${DANMAKU_SURFACE_SELECTOR} :is(
      .bpx-player-sending-bar,
      .bilibili-player-video-sendbar,
      .bilibili-player-video-inputbar
    ) a {
      display: none !important;
    }

    /* The optional Bewly indicator follows the shared controls owner; native
       shadow-progress must not create a second indicator beneath it. */
    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} [class*="shadow-progress"],
    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .befilter-progress-area {
      display: none !important;
      content: none !important;
    }

    #${ROOT_ID} .bewly-widescreen-idle-progress {
      position: absolute;
      inset: auto 0 0;
      height: var(--bew-space-0-5);
      z-index: 1;
      pointer-events: none;
      background: var(--bew-fill-2);
    }

    #${ROOT_ID} .bewly-widescreen-idle-progress[hidden] {
      display: none;
    }

    #${ROOT_ID} .bewly-widescreen-idle-progress > div {
      height: 100%;
      background: var(--bew-theme-color);
      transform: scaleX(0);
      transform-origin: left;
    }

    ${DANMAKU_SURFACE_SELECTOR} .bpx-player-video-inputbar::before {
      content: "" !important;
      position: absolute !important;
      inset: 0 !important;
      z-index: 0 !important;
      display: block !important;
      width: auto !important;
      height: auto !important;
      border-radius: inherit !important;
      corner-shape: inherit;
      background: var(--bew-elevated-alt-solid) !important;
      backdrop-filter: none !important;
      background-clip: padding-box !important;
      pointer-events: none !important;
    }

    ${DANMAKU_SURFACE_SELECTOR} .bpx-player-video-inputbar > * {
      position: relative !important;
      z-index: 1 !important;
    }

    ${DANMAKU_SURFACE_SELECTOR} :is(
      .bpx-player-video-info,
      .bpx-player-dm-switch,
      .bpx-player-dm-setting,
      .bpx-player-video-btn-dm,
      .bpx-player-video-inputbar,
      .bpx-player-dm-input,
      .bpx-player-dm-btn-send
    ) {
      opacity: 1 !important;
      filter: none !important;
    }

    ${DANMAKU_SURFACE_SELECTOR} :is(
      .bpx-player-dm-switch,
      .bpx-player-dm-setting,
      .bpx-player-video-btn-dm
    ) {
      color: var(--bew-text-1) !important;
    }

    ${DANMAKU_SURFACE_SELECTOR} :is(
      .bpx-player-dm-switch,
      .bpx-player-dm-setting,
      .bpx-player-video-btn-dm
    ) :is(svg, svg *) {
      color: var(--bew-text-1) !important;
      opacity: 1 !important;
    }

    ${DANMAKU_SURFACE_SELECTOR} :is(
      .bpx-player-dm-switch,
      .bpx-player-dm-setting,
      .bpx-player-video-btn-dm
    ) :is([fill]:not([fill="none"])) {
      fill: currentColor !important;
    }

    ${DANMAKU_SURFACE_SELECTOR} :is(
      .bpx-player-dm-switch,
      .bpx-player-dm-setting,
      .bpx-player-video-btn-dm
    ) :is([stroke]:not([stroke="none"])) {
      stroke: currentColor !important;
    }

    ${DANMAKU_SURFACE_SELECTOR} .bpx-player-video-inputbar:focus-within {
      border-color: var(--bew-focus-ring-color) !important;
      box-shadow:
        var(--bew-focus-shadow, 0 0 0 1px CanvasText),
        var(--bew-shadow-2) !important;
    }

    ${DANMAKU_SURFACE_SELECTOR} .bpx-player-video-inputbar-wrap {
      min-width: 0 !important;
      flex: 1 1 auto !important;
      background: transparent !important;
      border: 0 !important;
      border-radius: inherit !important;
    }

    ${DANMAKU_SURFACE_SELECTOR} .bpx-player-mode-selection-container {
      display: none !important;
      z-index: var(--bew-z-popover) !important;
      background: transparent !important;
      border-radius: var(--bew-popover-radius) !important;
      corner-shape: var(--bew-corner-shape);
      box-shadow: none !important;
    }

    ${DANMAKU_SURFACE_SELECTOR} .bpx-player-mode-selection-container.active {
      display: block !important;
    }

    ${DANMAKU_SURFACE_SELECTOR} .bpx-player-mode-selection-panel {
      color: var(--bew-text-1) !important;
      ${PLAYER_POPOVER_SURFACE}
      background-clip: padding-box !important;
      overflow: hidden !important;
    }

    ${DANMAKU_SURFACE_SELECTOR} .bpx-player-dm-input {
      height: var(--bew-control-height, 36px) !important;
      padding: 0 var(--bew-space-2, 8px) !important;
      background: transparent !important;
      border: 0 !important;
      color: var(--bew-text-1) !important;
      font-family: var(--bew-font-family) !important;
      font-size: var(--bew-font-size-control, 13px) !important;
      font-weight: var(--bew-font-weight-regular, 400) !important;
      line-height: var(--bew-line-height-control, 18px) !important;
    }

    ${DANMAKU_SURFACE_SELECTOR} .bpx-player-dm-input::placeholder {
      color: var(--bew-text-3) !important;
      opacity: 1;
    }

    ${DANMAKU_SURFACE_SELECTOR} .bpx-player-dm-setting-wrap {
      display: none !important;
      position: absolute !important;
      top: var(--bew-dm-popover-top, auto) !important;
      right: auto !important;
      bottom: auto !important;
      left: var(--bew-dm-popover-left, 0) !important;
      z-index: var(--bew-z-popover) !important;
      max-width: var(--bew-dm-popover-max-width, calc(100vw - var(--bew-space-8, 32px))) !important;
      margin: 0 !important;
      translate: none !important;
      transform: none !important;
    }

    ${DANMAKU_SURFACE_SELECTOR} .bpx-player-dm-setting[aria-expanded="true"] > .bpx-player-dm-setting-wrap {
      display: block !important;
    }

    ${DANMAKU_SURFACE_SELECTOR} .bpx-player-dm-setting-wrap::after {
      content: "";
      position: absolute;
      top: var(--bew-dm-popover-bridge-top, 100%);
      left: 0;
      width: 100%;
      height: var(--bew-space-2, 8px);
    }

    ${DANMAKU_SURFACE_SELECTOR} .bpx-player-dm-setting-box {
      max-width: 100% !important;
      max-height: var(--bew-dm-popover-max-height, calc(
        100dvh
        - var(--bew-control-height, 36px)
        - var(--bew-space-12, 48px)
      )) !important;
      color: var(--bew-text-1) !important;
      ${PLAYER_POPOVER_SURFACE}
      background-clip: padding-box !important;
      overflow-x: hidden !important;
      overflow-y: auto !important;
      overscroll-behavior: contain;
    }

    ${DANMAKU_SURFACE_SELECTOR} .bpx-player-dm-setting-box .bui-panel-wrap {
      height: auto !important;
      min-height: 0 !important;
      background: transparent !important;
    }

    ${DANMAKU_SURFACE_SELECTOR} .bpx-player-dm-setting-box :is(
      .bui-panel-move,
      .bui-panel-item,
      .bpx-player-dm-setting-left,
      .bpx-player-dm-setting-right
    ) {
      height: auto !important;
      min-height: 0 !important;
    }

    ${DANMAKU_SURFACE_SELECTOR} .bpx-player-dm-setting-left-more {
      display: flex !important;
      align-items: center !important;
      min-height: var(--bew-control-height-sm, 28px) !important;
      padding-top: var(--bew-space-2, 8px) !important;
      padding-bottom: var(--bew-space-2, 8px) !important;
    }

    /* Native BUI keeps both pages in one translated row. Only the active page
       contributes height; bottom alignment otherwise leaves a blank header on
       the shorter advanced page. Widths and native navigation stay untouched. */
    ${DANMAKU_SURFACE_SELECTOR} .bpx-player-dm-setting-box .bui-panel-move {
      align-items: flex-start !important;
    }

    ${DANMAKU_SURFACE_SELECTOR} .bpx-player-dm-setting-box .bui-panel-item:not(.bui-panel-item-active) {
      height: 0 !important;
    }

    /* Bpx 的 bui-dark 子控件会在亮色主题继续硬编码白色。只覆盖图标与
       滑杆几何，保留颜色选择器本身的真实色样。 */
    ${DANMAKU_SURFACE_SELECTOR} .bpx-player-dm-setting-box :is(
      .bpx-player-block-filter-image,
      .bpx-player-block-advanced-more,
      .bui-checkbox-icon-default
    ),
    ${DANMAKU_SURFACE_SELECTOR} .bpx-player-mode-selection-panel .selection-icon {
      color: var(--bew-text-2) !important;
    }

    ${DANMAKU_SURFACE_SELECTOR} .bpx-player-dm-setting-box :is(
      .bpx-player-block-filter-image,
      .bpx-player-block-advanced-more,
      .bui-checkbox-icon-default,
      .bui-checkbox-icon-selected
    ) :is(svg, svg *),
    ${DANMAKU_SURFACE_SELECTOR} .bpx-player-mode-selection-panel .selection-icon :is(svg, svg *) {
      fill: currentColor !important;
    }

    ${DANMAKU_SURFACE_SELECTOR} .bpx-player-dm-setting-box :is(
      .bpx-player-block-filter-type.active,
      .bpx-player-block-filter-type.bpx-state-active,
      .bui-checkbox-icon-selected
    ),
    ${DANMAKU_SURFACE_SELECTOR} .bpx-player-mode-selection-panel .selection-span.active .selection-icon {
      color: var(--bew-text-1) !important;
    }

    ${DANMAKU_SURFACE_SELECTOR} .bpx-player-dm-setting-box .bui-progress-wrap {
      background: var(--bew-fill-2) !important;
    }

    ${DANMAKU_SURFACE_SELECTOR} .bpx-player-dm-setting-box .bui-progress-bar {
      background: var(--bew-theme-color) !important;
      /* Let the thumb's native z-index sit above the sibling tick layer. */
      z-index: auto !important;
    }

    ${DANMAKU_SURFACE_SELECTOR} .bpx-player-dm-setting-box .bui-progress-dot {
      background: var(--bew-elevated-solid) !important;
      border: 1px solid var(--bew-theme-color) !important;
      box-shadow: var(--bew-shadow-1) !important;
    }

    ${DANMAKU_SURFACE_SELECTOR} .bpx-player-dm-setting-box .bui-progress-lab {
      background: var(--bew-text-3) !important;
    }

    ${DANMAKU_SURFACE_SELECTOR} .bpx-player-dm-setting-left-block {
      overflow: visible !important;
    }

    ${DANMAKU_SURFACE_SELECTOR} .bpx-player-dm-setting-left-block-content {
      height: var(--bew-space-12, 48px) !important;
      min-height: var(--bew-space-12, 48px) !important;
      overflow: visible !important;
    }

    ${DANMAKU_SURFACE_SELECTOR} .bpx-player-dm-setting-right {
      padding-top: var(--bew-space-3, 12px) !important;
    }

    ${DANMAKU_SURFACE_SELECTOR} .bpx-player-dm-setting-right-more {
      display: flex !important;
      align-items: center !important;
      gap: var(--bew-space-1, 4px) !important;
      min-height: var(--bew-space-8, 32px) !important;
      line-height: var(--bew-line-height-control, 18px) !important;
    }

    ${DANMAKU_SURFACE_SELECTOR} .bpx-player-dm-setting-right-more > .bpx-common-svg-icon {
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      width: var(--bew-icon-size-md, 20px) !important;
      height: var(--bew-icon-size-md, 20px) !important;
      margin: 0 !important;
      flex: 0 0 var(--bew-icon-size-md, 20px) !important;
      line-height: 0 !important;
    }

    ${DANMAKU_SURFACE_SELECTOR} .bpx-player-dm-setting-right-more > .bpx-common-svg-icon svg {
      display: block !important;
      width: var(--bew-icon-size-md, 20px) !important;
      height: var(--bew-icon-size-md, 20px) !important;
    }

    ${DANMAKU_SURFACE_SELECTOR} .bpx-player-dm-setting-right-more-text {
      display: inline-flex !important;
      align-items: center !important;
      height: var(--bew-icon-size-md, 20px) !important;
      line-height: var(--bew-line-height-control, 18px) !important;
    }

    #${ROOT_ID} #playerWrap,
    #${ROOT_ID} #bilibili-player,
    #${ROOT_ID} #bilibiliPlayer,
    #${ROOT_ID} .bpx-player-container,
    #${ROOT_ID} .player-wrap {
      position: relative !important;
      left: auto !important;
      top: auto !important;
      transform: none !important;
      box-shadow: none !important;
      filter: none !important;
      border: 0 !important;
      border-radius: 0 !important;
      outline: 0 !important;
      background: var(--bew-player-canvas) !important;
      overflow: hidden !important;
    }

    #${ROOT_ID} #playerWrap::before,
    #${ROOT_ID} #playerWrap::after,
    #${ROOT_ID} .bpx-player-container::before,
    #${ROOT_ID} .bpx-player-container::after,
    #${ROOT_ID} .player-wrap::before,
    #${ROOT_ID} .player-wrap::after {
      box-shadow: none !important;
      filter: none !important;
    }

    #${ROOT_ID} #bilibili-player-placeholder,
    #${ROOT_ID} .bpx-player-primary-area,
    #${ROOT_ID} .bpx-player-video-area,
    #${ROOT_ID} .bpx-player-video-wrap,
    #${ROOT_ID} .bilibili-player-video-wrap,
    #${ROOT_ID} .bilibili-player-video-area {
      border-top-color: transparent !important;
      border-bottom-color: transparent !important;
      box-shadow: none !important;
      filter: none !important;
      outline: 0 !important;
    }

    #${ROOT_ID} .player-wrap {
      clip-path: inset(1px 0 1px 0);
    }

    #${ROOT_ID} .player-wrap .bpx-player-shadow-progress-area,
    #${ROOT_ID} .player-wrap .bpx-player-video-area::before,
    #${ROOT_ID} .player-wrap .bpx-player-video-area::after,
    #${ROOT_ID} .player-wrap .bpx-player-primary-area::before,
    #${ROOT_ID} .player-wrap .bpx-player-primary-area::after {
      content: none !important;
      display: none !important;
      box-shadow: none !important;
      filter: none !important;
      border: 0 !important;
    }

    #${ROOT_ID} .bili-danmaku-x-guide:not(.bili-danmaku-x-guide-followed) .bili-danmaku-x-guide-follow,
    #${ROOT_ID} .bili-danmaku-x-guide-electric {
      background: var(--bew-theme-color, #00aeec) !important;
      color: var(--bew-on-theme-color) !important;
    }

    #${ROOT_ID} .bili-danmaku-x-guide:not(.bili-danmaku-x-guide-followed) .bili-danmaku-x-guide-follow:hover,
    #${ROOT_ID} .bili-danmaku-x-guide-electric:hover {
      background: var(--bew-theme-color, #00aeec) !important;
      color: var(--bew-on-theme-color) !important;
    }

    #${ROOT_ID} .bili-danmaku-x-guide-three > span.bili-danmaku-x-active svg {
      fill: var(--bew-text-1) !important;
    }

    #${ROOT_ID} .bili-danmaku-x-guide-cyc > span {
      filter: var(--bewly-widescreen-action-canvas-filter, none) !important;
    }

    #${ROOT_ID} .player-wrap > .bpx-player-container,
    #${ROOT_ID} .bpx-player-container > .bpx-player-primary-area {
      border-radius: 0 !important;
    }

    #${ROOT_ID} #bilibili-player,
    #${ROOT_ID} #bilibiliPlayer,
    #${ROOT_ID} .bpx-player-container {
      width: 100% !important;
      height: 100% !important;
    }

    #${ROOT_ID} .bpx-player-primary-area,
    #${ROOT_ID} .bpx-player-video-area,
    #${ROOT_ID} .bpx-player-video-wrap,
    #${ROOT_ID} .bilibili-player-video-area,
    #${ROOT_ID} .bilibili-player-video-wrap {
      width: 100% !important;
      max-width: 100% !important;
      height: 100% !important;
      max-height: 100% !important;
    }

    /* The column beside the pane is layout only: no surface, border, radius,
       shadow or glass; the content sits straight on the page. The info heads
       it, then the tabs, then the panels, which run down to the window's
       bottom edge and scroll under the docked composer. Every line starts at
       one content line, the page padding in from the column's edges. */
    #${ROOT_ID} .bewly-widescreen-sidebar {
      --bewly-widescreen-rail-bottom: calc(var(--bewly-widescreen-page-padding) + var(--bew-space-3));
      position: relative;
      z-index: 2;
      display: flex;
      flex-direction: column;
      grid-area: rail;
      min-width: 0;
      min-height: 0;
      padding: var(--bewly-widescreen-page-padding) var(--bewly-widescreen-page-padding) 0;
      gap: var(--bew-space-3);
      isolation: isolate;
      background: transparent;
      color: var(--bewly-widescreen-text-primary);
      overflow: hidden;
      pointer-events: auto;
      transition: opacity var(--bew-duration-moderate, 300ms) var(--bew-ease-standard, ease);
    }

    /* As tall as its content up to just under half the column; longer
       descriptions scroll inside it, so the panels keep most of the height. */
    #${ROOT_ID} .bewly-widescreen-info {
      position: relative;
      display: flex;
      flex: 0 1 auto;
      flex-direction: column;
      min-width: 0;
      min-height: 0;
      max-height: 45%;
      padding: 0;
    }

    /* Filling the window shows only the video. The column only fades with the
       zoom: an inherited change (visibility, pointer-events) would restyle the
       whole comment tree on its first frame. It becomes inert once the zoom
       settles (syncDisplayModeAttributes), which also lets clicks reach the
       player. */
    #${ROOT_ID}[data-display-mode="fill"] .bewly-widescreen-sidebar {
      opacity: 0;
    }

    #${ROOT_ID}[data-display-mode="fill"] .bewly-widescreen-idle-progress {
      position: fixed;
    }

    #${ROOT_ID}[data-zooming="true"] .bewly-widescreen-idle-progress {
      visibility: hidden;
    }

    #${ROOT_ID} .bewly-widescreen-sidebar-top {
      position: relative;
      z-index: 1;
      display: flex;
      flex-direction: column;
      gap: var(--bew-space-2);
      flex: 1 1 auto;
      min-height: 0;
      overflow-x: hidden;
      overflow-y: auto;
      overscroll-behavior: contain;
      scrollbar-gutter: stable;
      /* The scroller reaches one space-1 past the content line on both sides,
         so hover fills and focus rings at the content line are not clipped. */
      margin-inline: calc(var(--bew-space-1) * -1);
      padding: 0 var(--bew-space-1) var(--bew-space-3);
      background: transparent;
    }

    #${ROOT_ID} .bewly-widescreen-toolbar {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: var(--bew-space-3);
    }

    #${ROOT_ID} .bewly-widescreen-title-group {
      display: flex;
      flex: 1 1 auto;
      flex-direction: column;
      min-width: 0;
      gap: var(--bew-space-2, 8px);
    }

    #${ROOT_ID} .bewly-widescreen-title {
      display: block;
      overflow: visible;
      margin: 0;
      color: var(--bewly-widescreen-text-primary);
      font-size: var(--bew-font-size-heading);
      font-weight: var(--bew-font-weight-regular, 400);
      line-height: var(--bew-line-height-heading);
      overflow-wrap: anywhere;
      white-space: normal;
      /* Without its half-leading above, the title sits the page padding below
         the window's top edge, the distance that also frames its side. */
      text-box: trim-start text;
    }

    /* One caption line: views, danmaku, date, then the live viewer count. */
    #${ROOT_ID} .bewly-widescreen-metadata-slot {
      position: relative;
      z-index: 1;
      display: flex;
      flex: 0 0 auto;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--bew-space-1) var(--bew-space-3);
      min-width: 0;
      min-height: 0;
      color: var(--bew-text-3);
      font-size: var(--bew-font-size-caption);
      font-variant-numeric: tabular-nums;
      line-height: var(--bew-line-height-caption);
    }

    /* Tabler glyphs for items Bilibili draws no icon for (date, viewers),
       sized like the native meta icons. */
    #${ROOT_ID} .bewly-widescreen-metadata-icon {
      width: var(--bew-icon-size-sm);
      height: var(--bew-icon-size-sm);
      flex: 0 0 auto;
    }

    #${ROOT_ID} .bewly-widescreen-metadata-slot:empty {
      display: none;
    }

    #${ROOT_ID}[data-page-kind="pgc"] .bewly-widescreen-metadata-slot [class*="mediainfo_mediaInfoWrap"] {
      display: flex !important;
      align-items: flex-start !important;
      gap: var(--bew-space-3) !important;
      width: 100% !important;
      min-width: 0 !important;
      height: auto !important;
      min-height: 0 !important;
      padding: var(--bew-space-2) 0 !important;
      border: 0 !important;
      overflow: visible !important;
    }

    #${ROOT_ID}[data-page-kind="pgc"] [class*="mediainfo_mediaCover"] {
      flex: 0 0 calc(var(--bew-space-12) * 1.5) !important;
      width: calc(var(--bew-space-12) * 1.5) !important;
      height: auto !important;
      aspect-ratio: 3 / 4;
      margin: 0 !important;
      border-radius: var(--bew-media-radius) !important;
      corner-shape: var(--bew-corner-shape);
      overflow: hidden;
    }

    #${ROOT_ID}[data-page-kind="pgc"] [class*="mediainfo_mediaRight"] {
      flex: 1;
      min-width: 0 !important;
      height: auto !important;
      min-height: 0 !important;
    }

    #${ROOT_ID}[data-page-kind="pgc"] [class*="mediainfo_mediaCover"] > picture,
    #${ROOT_ID}[data-page-kind="pgc"] [class*="mediainfo_mediaCover"] > picture > img {
      display: block !important;
      width: 100% !important;
      height: 100% !important;
      object-fit: cover !important;
    }

    #${ROOT_ID}[data-page-kind="pgc"] [class*="mediainfo_mediaTitle"] {
      height: auto !important;
      padding-right: 0 !important;
      margin-bottom: var(--bew-space-1) !important;
      color: var(--bew-text-1) !important;
      font-size: var(--bew-font-size-title) !important;
      line-height: var(--bew-line-height-title) !important;
      font-weight: var(--bew-font-weight-medium) !important;
      white-space: normal !important;
    }

    #${ROOT_ID}[data-page-kind="pgc"] [class*="mediainfo_mediaDesc"] {
      height: auto !important;
      margin-bottom: var(--bew-space-1) !important;
      color: var(--bew-text-2) !important;
      font-size: var(--bew-font-size-caption) !important;
      line-height: var(--bew-line-height-caption) !important;
      overflow-wrap: anywhere;
    }

    /* Keep the native two-line description/expand geometry and its event root. */
    #${ROOT_ID}[data-page-kind="pgc"] [class*="mediainfo_media_desc_section"] {
      margin-bottom: var(--bew-space-1) !important;
      color: var(--bew-text-2) !important;
      flex-shrink: 0;
    }

    #${ROOT_ID}[data-page-kind="pgc"] :is([class*="mediainfo_bottomBar"], [class*="mediainfo_mediaToolbar"]) {
      display: flex !important;
      position: static !important;
      align-items: center !important;
      flex-wrap: wrap !important;
      gap: var(--bew-space-2) !important;
      width: auto !important;
      margin-top: var(--bew-space-2) !important;
    }

    #${ROOT_ID}[data-page-kind="pgc"] :is([class*="follow_followOptions"], [class*="share_shareMenu"]) {
      color: var(--bew-text-1) !important;
      background: var(--bew-elevated-solid) !important;
      border-radius: var(--bew-popover-radius) !important;
      backdrop-filter: none !important;
      z-index: 2;
    }

    #${ROOT_ID}[data-page-kind="pgc"] .bewly-widescreen-author-actions {
      display: block;
    }

    #${ROOT_ID}[data-page-kind="pgc"] .bewly-widescreen-action-slot :is(.toolbar, .toolbar-left, .toolbar-right) {
      display: flex !important;
      align-items: center !important;
      flex-wrap: wrap !important;
      gap: var(--bew-space-2) !important;
      width: auto !important;
      min-width: 0 !important;
      margin: 0 !important;
    }

    #${ROOT_ID}[data-page-kind="pgc"] .bewly-widescreen-action-slot :is(.toolbar-left, .toolbar-right) > * {
      min-height: var(--bew-control-height-sm) !important;
      color: var(--bew-text-2) !important;
      font-size: var(--bew-font-size-control) !important;
      line-height: var(--bew-line-height-control) !important;
    }

    #${ROOT_ID}[data-page-kind="pgc"] .bewly-widescreen-action-slot :is(.toolbar-left, .toolbar-right) > *:hover {
      color: var(--bew-text-1) !important;
    }

    #${ROOT_ID} .bewly-widescreen-metadata-slot .video-info-meta,
    #${ROOT_ID} .bewly-widescreen-metadata-slot .video-info-detail-list {
      display: flex !important;
      align-items: center !important;
      flex-wrap: wrap !important;
      position: static !important;
      inset: auto !important;
      width: auto !important;
      height: auto !important;
      min-height: 0 !important;
      margin: 0 !important;
      transform: none !important;
      gap: var(--bew-space-1) var(--bew-space-3) !important;
      color: inherit !important;
      font-size: var(--bew-font-size-caption) !important;
      line-height: var(--bew-line-height-caption) !important;
    }

    /* Bilibili sizes the date and declarations at 13px and the counts at 12;
       the whole line is one caption. */
    #${ROOT_ID} .bewly-widescreen-metadata-slot :is(.item, .view-text, .dm-text, .pubdate-ip-text, .argue-text, .copyright-text) {
      font-size: var(--bew-font-size-caption) !important;
      line-height: var(--bew-line-height-caption) !important;
    }

    #${ROOT_ID} .bewly-widescreen-metadata-slot .item {
      display: inline-flex !important;
      align-items: center !important;
      gap: var(--bew-space-1) !important;
      margin: 0 !important;
      color: inherit !important;
      white-space: nowrap;
    }

    #${ROOT_ID} .bewly-widescreen-metadata-slot svg {
      width: var(--bew-icon-size-sm) !important;
      height: var(--bew-icon-size-sm) !important;
      color: currentColor !important;
    }

    /* Two full-width rows: who made it (with charge and follow anchored at
       the column's right edge), then what you can do with it. One rhythm
       frames the block: 16px after the meta line, 12px between the rows,
       16px before the description. */
    #${ROOT_ID} .bewly-widescreen-author-actions {
      display: flex;
      flex-direction: column;
      align-items: stretch;
      gap: var(--bew-space-3);
      min-width: 0;
      margin-block: var(--bew-space-2);
    }

    #${ROOT_ID} .bewly-widescreen-action-slot {
      flex: 0 0 auto;
      min-width: 0;
      min-height: 0;
      overflow: visible;
      font-variant-numeric: tabular-nums;
    }

    #${ROOT_ID} .bewly-widescreen-fallback-stats {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: var(--bew-space-2);
      width: 100%;
    }

    #${ROOT_ID} .bewly-widescreen-fallback-stat {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--bew-space-1);
      min-width: 0;
      min-height: var(--bew-control-height);
      padding: 0 var(--bew-space-1);
      overflow: hidden;
      color: var(--bewly-widescreen-text-secondary);
      background: var(--bewly-widescreen-control-bg);
      border-radius: var(--bew-interactive-radius);
      corner-shape: var(--bew-corner-shape);
      font-size: var(--bew-font-size-control);
      font-weight: var(--bew-font-weight-medium);
      line-height: var(--bew-line-height-control);
      text-overflow: ellipsis;
      white-space: nowrap;
      transition:
        color var(--bew-duration-fast) var(--bew-ease-standard),
        background-color var(--bew-duration-fast) var(--bew-ease-standard);
    }

    #${ROOT_ID} .bewly-widescreen-fallback-stat-icon {
      width: var(--bew-icon-size-sm);
      height: var(--bew-icon-size-sm);
      flex: 0 0 var(--bew-icon-size-sm);
    }

    #${ROOT_ID} .bewly-widescreen-fallback-stat-label {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    #${ROOT_ID} .bewly-widescreen-fallback-owner {
      display: flex;
      align-items: center;
      min-width: 0;
    }

    #${ROOT_ID} .bewly-widescreen-fallback-owner-link {
      display: inline-flex;
      align-items: center;
      min-width: 0;
      gap: var(--bew-space-2);
      padding: var(--bew-space-1);
      color: var(--bewly-widescreen-text-primary);
      border-radius: var(--bew-interactive-radius);
      corner-shape: var(--bew-corner-shape);
      text-decoration: none;
      transition:
        color var(--bew-duration-fast) var(--bew-ease-standard),
        background-color var(--bew-duration-fast) var(--bew-ease-standard);
    }

    #${ROOT_ID} .bewly-widescreen-fallback-owner-link:hover {
      color: var(--bew-theme-foreground);
      background: var(--bewly-widescreen-control-hover-bg);
    }

    #${ROOT_ID} .bewly-widescreen-fallback-owner-avatar {
      width: var(--bew-control-height-lg);
      height: var(--bew-control-height-lg);
      flex: 0 0 var(--bew-control-height-lg);
      border-radius: 50%;
      corner-shape: var(--bew-corner-shape-round);
      object-fit: cover;
    }

    #${ROOT_ID} .bewly-widescreen-fallback-owner-name {
      min-width: 0;
      overflow: hidden;
      font-size: var(--bew-font-size-title);
      font-weight: var(--bew-font-weight-medium);
      line-height: var(--bew-line-height-title);
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    #${ROOT_ID} .bewly-widescreen-up-slot:empty {
      display: none;
    }

    #${ROOT_ID} .bewly-widescreen-up-slot:not(:empty) {
      position: relative;
      z-index: 0;
      flex: 0 0 auto;
      min-width: 0;
    }

    #${ROOT_ID} .bewly-widescreen-action-slot:empty {
      display: none;
    }

    #${ROOT_ID} .bewly-widescreen-description-card {
      display: flex;
      flex-direction: column;
      gap: var(--bew-space-3);
      min-width: 0;
    }

    #${ROOT_ID} .bewly-widescreen-description-card:has(> .bewly-widescreen-description-slot:empty):has(> .bewly-widescreen-tags-slot:empty),
    #${ROOT_ID} .bewly-widescreen-description-card:has(> .bewly-widescreen-description-slot.is-empty):has(> .bewly-widescreen-tags-slot:empty) {
      display: none;
    }

    #${ROOT_ID} .bewly-widescreen-description-slot {
      color: var(--bewly-widescreen-text-primary);
    }

    #${ROOT_ID} .bewly-widescreen-description-slot:empty {
      display: none;
    }

    #${ROOT_ID} .bewly-widescreen-tags-slot:empty {
      display: none;
    }

    #${ROOT_ID} .bewly-widescreen-tags-slot .video-tag-container {
      margin: 0 !important;
      padding: 0 !important;
      border: 0 !important;
      background: transparent !important;
      box-shadow: none !important;
    }

    #${ROOT_ID} .bewly-widescreen-tags-slot .tag-panel {
      display: flex !important;
      flex-wrap: wrap !important;
      gap: var(--bew-space-2, 8px) !important;
      height: auto !important;
      max-height: none !important;
      overflow: visible !important;
    }

    #${ROOT_ID} .bewly-widescreen-tags-slot .tag-panel .tag {
      float: none !important;
      margin: 0 !important;
    }

    /* Every tag is the same quiet chip; the topic keeps only its leading mark. */
    #${ROOT_ID} .bewly-widescreen-tags-slot :is(.ordinary-tag, .topic-tag, .bgm-tag) > .tag-link {
      display: inline-flex !important;
      align-items: center !important;
      gap: var(--bew-space-1) !important;
      height: var(--bew-control-height-sm) !important;
      padding: 0 var(--bew-space-3) !important;
      color: var(--bew-text-2) !important;
      background: var(--bew-fill-1) !important;
      border: 0 !important;
      border-radius: var(--bew-badge-radius) !important;
      corner-shape: var(--bew-corner-shape-round);
      font-size: var(--bew-font-size-control) !important;
      font-weight: var(--bew-font-weight-regular) !important;
      line-height: var(--bew-line-height-control) !important;
      transition:
        background-color var(--bew-duration-fast) var(--bew-ease-standard),
        color var(--bew-duration-fast) var(--bew-ease-standard);
    }

    #${ROOT_ID} .bewly-widescreen-tags-slot :is(.ordinary-tag, .topic-tag, .bgm-tag) > .tag-link > svg {
      width: var(--bew-icon-size-xs) !important;
      height: var(--bew-icon-size-xs) !important;
      flex: 0 0 auto;
      margin: 0 !important;
      color: var(--bew-text-3) !important;
    }

    #${ROOT_ID} .bewly-widescreen-tags-slot :is(.ordinary-tag, .topic-tag, .bgm-tag) > .tag-link > svg:last-child:not(:first-child) {
      display: none !important;
    }

    #${ROOT_ID} .bewly-widescreen-tags-slot :is(.ordinary-tag, .topic-tag, .bgm-tag) > .tag-link :is(.tag-txt, span) {
      color: inherit !important;
      font: inherit !important;
    }

    #${ROOT_ID} .bewly-widescreen-tags-slot :is(.ordinary-tag, .topic-tag, .bgm-tag) > .tag-link:is(:hover, :focus-visible) {
      background: var(--bew-fill-2) !important;
      color: var(--bew-text-1) !important;
    }

    #${ROOT_ID} .bewly-widescreen-tags-slot :is(.ordinary-tag, .topic-tag, .bgm-tag) > .tag-link:active {
      background: var(--bew-fill-3) !important;
      color: var(--bew-text-1) !important;
    }

    #${ROOT_ID} .bewly-widescreen-tags-slot .tag-link:focus-visible {
      outline: var(--bew-focus-ring, 1px solid CanvasText);
      outline-offset: 2px;
      border-radius: var(--bew-badge-radius);
    }

    #${ROOT_ID} .bewly-widescreen-description-slot.is-empty {
      display: none;
    }

    #${ROOT_ID} .bewly-widescreen-description-slot .video-desc-container {
      width: 100% !important;
      margin: 0 !important;
    }

    /* Reading text: the description and the comments share the body size. */
    #${ROOT_ID} .bewly-widescreen-description-slot .basic-desc-info {
      height: auto !important;
      color: var(--bewly-widescreen-text-secondary) !important;
      font-size: var(--bew-font-size-body, 15px) !important;
      line-height: var(--bew-line-height-body, 24px) !important;
      overflow: hidden !important;
      overflow-wrap: anywhere;
      word-break: break-word !important;
    }

    #${ROOT_ID} .bewly-widescreen-description-slot .basic-desc-info .desc-info-text {
      font-size: inherit !important;
      line-height: inherit !important;
    }

    #${ROOT_ID} .bewly-widescreen-description-slot.is-expanded .video-desc-container,
    #${ROOT_ID} .bewly-widescreen-description-slot.is-expanded #v_desc {
      height: auto !important;
      max-height: none !important;
      overflow: visible !important;
    }

    #${ROOT_ID} .bewly-widescreen-description-slot.is-expanded .basic-desc-info {
      display: block !important;
      height: auto !important;
      max-height: none !important;
      overflow: visible !important;
      -webkit-line-clamp: unset !important;
      -webkit-box-orient: initial !important;
    }

    #${ROOT_ID} .bewly-widescreen-description-slot.is-collapsed .basic-desc-info {
      display: -webkit-box !important;
      height: calc(var(--bew-line-height-control, 18px) + var(--bew-line-height-control, 18px)) !important;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
    }

    #${ROOT_ID} .bewly-widescreen-description-slot .video-desc-container > .toggle-btn {
      display: none !important;
    }

    #${ROOT_ID} .bewly-widescreen-description-slot.is-collapsed .subtitle-maker-list {
      display: none !important;
    }

    #${ROOT_ID} .bewly-widescreen-description-slot.is-expanded .subtitle-maker-list {
      display: block !important;
    }

    #${ROOT_ID} .bewly-widescreen-description-slot .subtitle-maker-list {
      padding-top: var(--bew-space-2) !important;
      color: var(--bewly-widescreen-text-secondary) !important;
      font-size: var(--bew-font-size-control, 13px) !important;
      line-height: var(--bew-line-height-control, 18px) !important;
    }

    #${ROOT_ID} .bewly-widescreen-description-slot a {
      color: var(--bew-theme-foreground) !important;
    }

    #${ROOT_ID} .bewly-widescreen-fallback-description {
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 3;
      margin: 0;
      overflow: hidden;
      color: var(--bewly-widescreen-text-secondary);
      font-size: var(--bew-font-size-control);
      line-height: var(--bew-line-height-control);
      overflow-wrap: anywhere;
      white-space: pre-wrap;
      word-break: break-word;
    }

    #${ROOT_ID} .bewly-widescreen-fallback-category {
      display: inline-flex;
      align-items: center;
      min-height: var(--bew-control-height-sm);
      padding: 0 var(--bew-space-3);
      color: var(--bewly-widescreen-text-secondary);
      background: var(--bewly-widescreen-control-bg);
      border-radius: var(--bew-badge-radius);
      corner-shape: var(--bew-corner-shape-round);
      font-size: var(--bew-font-size-caption);
      font-weight: var(--bew-font-weight-medium);
      line-height: var(--bew-line-height-caption);
    }

    #${ROOT_ID} .bewly-widescreen-description-toggle {
      display: block;
      margin-top: var(--bew-space-1);
      padding: 0;
      border: 0;
      color: var(--bewly-widescreen-text-secondary);
      background: transparent;
      cursor: pointer;
      font: inherit;
      font-size: var(--bew-font-size-control, 13px);
      line-height: var(--bew-line-height-control, 18px);
    }

    #${ROOT_ID} .bewly-widescreen-description-toggle:hover {
      color: var(--bew-text-1);
    }

    #${ROOT_ID} .bewly-widescreen-description-toggle[hidden] {
      display: none !important;
    }

    #${ROOT_ID} .bewly-widescreen-action-slot .video-toolbar-container,
    #${ROOT_ID} .bewly-widescreen-action-slot #arc_toolbar_report {
      display: flex !important;
      align-items: center !important;
      justify-content: flex-start !important;
      width: 100% !important;
      min-width: 0 !important;
      height: auto !important;
      margin: 0 !important;
      padding: 0 !important;
      border: 0 !important;
      background: transparent !important;
      box-shadow: none !important;
      overflow: visible !important;
    }

    #${ROOT_ID} .bewly-widescreen-action-slot #arc_toolbar_report {
      flex-wrap: nowrap;
      gap: 0;
    }

    #${ROOT_ID} .bewly-widescreen-action-slot .video-toolbar-left {
      display: block !important;
      min-width: 0 !important;
      flex: 0 1 auto !important;
      overflow: visible !important;
    }

    #${ROOT_ID} .bewly-widescreen-action-slot .video-toolbar-left-main {
      display: flex !important;
      align-items: center !important;
      width: auto !important;
      min-width: 0 !important;
      overflow: visible !important;
    }

    #${ROOT_ID} .bewly-widescreen-action-slot .toolbar-left-item-wrap {
      display: flex !important;
      position: relative !important;
      min-width: 0 !important;
      width: auto !important;
      margin: 0 var(--bew-space-2) 0 0 !important;
      overflow: visible !important;
    }

    #${ROOT_ID} .bewly-widescreen-action-slot .toolbar-left-item-wrap:last-child {
      margin-right: 0 !important;
    }

    #${ROOT_ID} .bewly-widescreen-action-slot .video-toolbar-left-item,
    #${ROOT_ID} .bewly-widescreen-action-slot .video-toolbar-right-item,
    #${ROOT_ID} .bewly-widescreen-action-slot .bewly-watch-later-btn {
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      gap: var(--bew-space-1) !important;
      position: relative !important;
      flex: 0 1 auto !important;
      width: auto !important;
      min-width: 0 !important;
      margin: 0 !important;
      padding: 0 var(--bew-space-3, 12px) 0 var(--bew-space-2, 8px) !important;
      border: 0 !important;
      border-radius: var(--bew-interactive-radius) !important;
      corner-shape: var(--bew-corner-shape);
      color: var(--bewly-widescreen-text-secondary) !important;
      /* Neutral chips like charge and the tags; the accent stays on follow. */
      background: var(--bewly-widescreen-control-bg) !important;
      font-size: var(--bew-font-size-control, 13px) !important;
      line-height: var(--bew-line-height-control, 18px) !important;
      font-weight: var(--bew-font-weight-medium) !important;
      min-height: var(--bew-control-height, 36px) !important;
      white-space: nowrap !important;
      text-align: center !important;
      cursor: pointer;
      transition:
        color var(--bew-duration-fast, 150ms) var(--bew-ease-standard, ease),
        background-color var(--bew-duration-fast, 150ms) var(--bew-ease-standard, ease),
        scale var(--bew-duration-fast, 150ms) var(--bew-ease-standard, ease);
    }

    /* A press settles the chip a little; the release springs it back. */
    #${ROOT_ID} .bewly-widescreen-action-slot :is(.video-toolbar-left-item, .video-toolbar-right-item, .bewly-watch-later-btn):active,
    #${ROOT_ID} .bewly-widescreen-up-slot .upinfo-btn-panel > .default-btn:active {
      scale: 0.97;
    }

    #${ROOT_ID} .bewly-widescreen-action-slot .toolbar-left-item-wrap > .video-toolbar-left-item {
      flex: 0 1 auto !important;
    }

    #${ROOT_ID} .bewly-widescreen-action-slot .video-toolbar-left-item [class*="anim"]:not(.video-toolbar-item-icon, .video-like-icon, .video-share-icon),
    #${ROOT_ID} .bewly-widescreen-action-slot .video-toolbar-left-item [class*="Anim"]:not(.video-toolbar-item-icon, .video-like-icon, .video-share-icon),
    #${ROOT_ID} .bewly-widescreen-action-slot .video-toolbar-left-item > canvas,
    #${ROOT_ID} .bewly-widescreen-action-slot .toolbar-left-item-wrap > canvas,
    #${ROOT_ID} .bewly-widescreen-action-slot .toolbar-left-item-wrap > .svga-center,
    #${ROOT_ID} .bewly-widescreen-action-slot .toolbar-left-item-wrap > [class*="anim"]:not(.selfdef-triple-anime),
    #${ROOT_ID} .bewly-widescreen-action-slot .toolbar-left-item-wrap > [class*="Anim"]:not(.selfdef-triple-anime) {
      position: absolute !important;
      inset: auto !important;
      left: var(--bewly-action-anchor-x, 50%) !important;
      top: var(--bewly-action-anchor-y, 50%) !important;
      margin: 0 !important;
      translate: -50% -50% !important;
      color: var(--bew-text-1) !important;
      pointer-events: none !important;
      z-index: 2 !important;
    }

    #${ROOT_ID} .bewly-widescreen-action-slot .video-toolbar-left-item .svga-top,
    #${ROOT_ID} .bewly-widescreen-action-slot .video-toolbar-left > .selfdef-triple-anime {
      position: absolute !important;
      left: var(--bewly-action-anchor-x, 50%) !important;
      translate: -50% 0 !important;
      pointer-events: none !important;
    }

    #${ROOT_ID} .bewly-widescreen-action-slot .video-toolbar-left-item > canvas {
      filter: var(--bewly-widescreen-action-canvas-filter, none) !important;
      opacity: 0.96 !important;
    }

    /* Animation containers are tagged by actionEffects (ACTION_ANIMATION_ATTRIBUTE). */
    #${ROOT_ID} .bewly-widescreen-action-slot [${ACTION_ANIMATION_ATTRIBUTE}] svg {
      width: 100% !important;
      height: 100% !important;
      color: var(--bew-text-1) !important;
    }

    #${ROOT_ID} .bewly-widescreen-action-slot [${ACTION_ANIMATION_ATTRIBUTE}] [stroke] {
      stroke: var(--bew-text-1) !important;
    }

    #${ROOT_ID} .bewly-widescreen-action-slot [${ACTION_ANIMATION_ATTRIBUTE}] [fill]:not([fill="none"]) {
      fill: var(--bew-text-1) !important;
    }

    #${ROOT_ID} .bewly-widescreen-action-slot .video-share,
    #${ROOT_ID} .bewly-widescreen-action-slot .video-share-wrap,
    #${ROOT_ID} .bewly-widescreen-action-slot .video-share-wrap > span,
    #${ROOT_ID} .bewly-widescreen-action-slot #share-btn-outer {
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      gap: var(--bew-space-1) !important;
      min-width: 0 !important;
    }

    #${ROOT_ID} .bewly-widescreen-action-slot .video-share-wrap {
      flex: 0 1 auto !important;
    }

    /* Bilibili sizes the share count box for its longest label; the chip
       hugs the count like the others. */
    #${ROOT_ID} .bewly-widescreen-action-slot .video-share-info {
      display: inline-flex !important;
      align-items: center !important;
      width: auto !important;
      min-width: 0 !important;
      margin-left: 0 !important;
    }

    #${ROOT_ID} .bewly-widescreen-action-slot .video-share-info-text {
      position: static !important;
      display: inline !important;
      margin-left: 0 !important;
    }

    #${ROOT_ID} .bewly-widescreen-action-slot .video-toolbar-left-item:hover,
    #${ROOT_ID} .bewly-widescreen-action-slot .video-toolbar-right-item:hover {
      color: var(--bew-text-1) !important;
      background: var(--bewly-widescreen-control-hover-bg) !important;
    }

    /* Liked, coined, collected and saved chips sit on the shared selected surface. */
    #${ROOT_ID} .bewly-widescreen-action-slot :is(.video-toolbar-left-item, .video-toolbar-right-item):is(.on, .active, .liked, .collected, .is-active) {
      background: var(--bew-selected-bg) !important;
    }

    #${ROOT_ID} .bewly-widescreen-action-slot .on,
    #${ROOT_ID} .bewly-widescreen-action-slot .active,
    #${ROOT_ID} .bewly-widescreen-action-slot .liked,
    #${ROOT_ID} .bewly-widescreen-action-slot .collected,
    #${ROOT_ID} .bewly-widescreen-action-slot .is-active,
    #${ROOT_ID} .bewly-widescreen-action-slot .video-like.on,
    #${ROOT_ID} .bewly-widescreen-action-slot .video-like.on *,
    #${ROOT_ID} .bewly-widescreen-action-slot .video-like.liked,
    #${ROOT_ID} .bewly-widescreen-action-slot .video-like.liked *,
    #${ROOT_ID} .bewly-widescreen-action-slot .video-coin.on,
    #${ROOT_ID} .bewly-widescreen-action-slot .video-coin.on *,
    #${ROOT_ID} .bewly-widescreen-action-slot .video-fav.on,
    #${ROOT_ID} .bewly-widescreen-action-slot .video-fav.on *,
    #${ROOT_ID} .bewly-widescreen-action-slot .video-fav.collected,
    #${ROOT_ID} .bewly-widescreen-action-slot .video-fav.collected * {
      color: var(--bew-text-1) !important;
      fill: var(--bew-text-1) !important;
    }

    #${ROOT_ID} .bewly-widescreen-action-slot .video-toolbar-item-icon,
    #${ROOT_ID} .bewly-widescreen-action-slot .bewly-watch-later-btn__icon {
      width: var(--bew-icon-size-md, 20px) !important;
      height: var(--bew-icon-size-md, 20px) !important;
      margin-right: 0 !important;
      flex: 0 0 auto !important;
      font-size: var(--bew-icon-size-md, 20px) !important;
    }

    #${ROOT_ID} .bewly-widescreen-action-slot .video-like-icon {
      width: var(--bew-icon-size-md, 20px) !important;
      height: var(--bew-icon-size-md, 20px) !important;
    }

    #${ROOT_ID} .bewly-widescreen-action-slot .video-toolbar-item-text,
    #${ROOT_ID} .bewly-widescreen-action-slot .video-like-info,
    #${ROOT_ID} .bewly-widescreen-action-slot .video-coin-info,
    #${ROOT_ID} .bewly-widescreen-action-slot .video-fav-info,
    #${ROOT_ID} .bewly-widescreen-action-slot .video-share-info {
      display: inline-flex !important;
      align-items: center !important;
      margin-left: 0 !important;
      white-space: nowrap !important;
    }

    #${ROOT_ID} .bewly-widescreen-action-slot .video-toolbar-right {
      display: flex !important;
      align-items: center !important;
      flex: 0 0 auto !important;
      margin-left: var(--bew-space-2) !important;
      padding: 0 !important;
      background: transparent !important;
      border: 0 !important;
      box-shadow: none !important;
    }

    #${ROOT_ID} .bewly-widescreen-action-slot .video-toolbar-right > :not(.bewly-watch-later-btn) {
      display: none !important;
    }

    #${ROOT_ID} .bewly-widescreen-action-slot .bewly-watch-later-btn {
      display: inline-flex !important;
      width: var(--bew-control-height, 36px) !important;
      min-width: var(--bew-control-height, 36px) !important;
      height: var(--bew-control-height, 36px) !important;
      padding: 0 !important;
    }

    #${ROOT_ID} .bewly-widescreen-action-slot .video-toolbar-right-item.bewly-watch-later-btn:hover {
      color: var(--bewly-widescreen-text-primary) !important;
    }

    #${ROOT_ID} .bewly-widescreen-action-slot .video-toolbar-right-item.bewly-watch-later-btn.is-active:hover {
      color: var(--bew-text-1) !important;
    }

    #${ROOT_ID} .bewly-widescreen-sidebar-top .up-panel-container,
    #${ROOT_ID} .bewly-widescreen-sidebar-top .up-info-container,
    #${ROOT_ID} .bewly-widescreen-sidebar-top .up-info,
    #${ROOT_ID} .bewly-widescreen-sidebar-top .upinfo {
      width: 100% !important;
      margin: 0 !important;
      padding: 0 !important;
      background: transparent !important;
      box-shadow: none !important;
    }

    #${ROOT_ID} .bewly-widescreen-up-slot .up-panel-container,
    #${ROOT_ID} .bewly-widescreen-up-slot .up-info-container,
    #${ROOT_ID} .bewly-widescreen-up-slot .up-info,
    #${ROOT_ID} .bewly-widescreen-up-slot .upinfo {
      position: relative !important;
      inset: auto !important;
      padding-top: 0 !important;
      padding-bottom: 0 !important;
      transform: none !important;
    }

    /* Keep the native author, follow, charge and message nodes and handlers. */
    /* Avatar, then the name over a one-line sign, then charge and follow on
       the same line. */
    #${ROOT_ID} .bewly-widescreen-up-slot .up-info-container {
      display: flex !important;
      align-items: center !important;
      height: auto !important;
      min-height: 0 !important;
      gap: var(--bew-space-3) !important;
    }

    #${ROOT_ID} .bewly-widescreen-up-slot .up-info--left {
      flex: 0 0 var(--bew-control-height-lg) !important;
      margin: 0 !important;
    }

    #${ROOT_ID} .bewly-widescreen-up-slot :is(.up-avatar-wrap, .up-avatar, .bili-avatar) {
      width: var(--bew-control-height-lg) !important;
      height: var(--bew-control-height-lg) !important;
    }

    #${ROOT_ID} .bewly-widescreen-up-slot .bili-avatar-img {
      width: 100% !important;
      height: 100% !important;
    }

    #${ROOT_ID} .bewly-widescreen-up-slot .up-info--right {
      display: flex !important;
      flex: 1 1 0 !important;
      flex-direction: row !important;
      flex-wrap: wrap !important;
      align-items: center !important;
      width: auto !important;
      min-width: 0 !important;
      margin: 0 !important;
      gap: var(--bew-space-2) var(--bew-space-3) !important;
    }

    /* The name and sign take the row's free width (the sign ellipsizes into
       it); charge and follow keep the right edge, wrapping under the name
       only when the name would drop below about three avatars wide. */
    #${ROOT_ID} .bewly-widescreen-up-slot .up-info__detail {
      flex: 1 1 calc(var(--bew-space-12) * 3) !important;
      width: auto !important;
    }

    #${ROOT_ID} .bewly-widescreen-up-slot .up-info__btn-panel {
      flex: 0 0 auto !important;
      margin-left: auto !important;
    }

    #${ROOT_ID} .bewly-widescreen-up-slot :is(.up-info__detail, .up-info__btn-panel, .up-detail) {
      height: auto !important;
      min-width: 0 !important;
      margin: 0 !important;
    }

    #${ROOT_ID} .bewly-widescreen-up-slot .up-detail-top {
      height: auto !important;
      min-height: var(--bew-line-height-title) !important;
      gap: var(--bew-space-2) !important;
      align-items: center !important;
      flex-wrap: wrap !important;
    }

    #${ROOT_ID} .bewly-widescreen-up-slot .up-name {
      font-size: var(--bew-font-size-title) !important;
      font-weight: var(--bew-font-weight-medium) !important;
      line-height: var(--bew-line-height-title) !important;
    }

    #${ROOT_ID} .bewly-widescreen-up-slot :is(.send-msg, .up-description) {
      margin: 0 !important;
      font-size: var(--bew-font-size-caption) !important;
      line-height: var(--bew-line-height-caption) !important;
      color: var(--bew-text-3) !important;
    }

    #${ROOT_ID} .bewly-widescreen-up-slot .send-msg:hover {
      color: var(--bew-text-1) !important;
    }

    #${ROOT_ID} .bewly-widescreen-up-slot .up-description {
      display: block !important;
      height: auto !important;
      max-width: 100% !important;
      overflow: hidden !important;
      text-overflow: ellipsis !important;
      white-space: nowrap !important;
    }

    #${ROOT_ID} .bewly-widescreen-up-slot .upinfo-btn-panel {
      height: auto !important;
      display: flex !important;
      flex-wrap: nowrap !important;
      gap: var(--bew-space-2) !important;
    }

    #${ROOT_ID} .bewly-widescreen-up-slot .upinfo-btn-panel > .default-btn {
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      flex: 0 1 auto !important;
      width: auto !important;
      max-width: 100% !important;
      height: var(--bew-control-height) !important;
      margin: 0 !important;
      padding: 0 var(--bew-space-4) !important;
      border-radius: var(--bew-interactive-radius) !important;
      corner-shape: var(--bew-corner-shape);
      font-size: var(--bew-font-size-control) !important;
      font-weight: var(--bew-font-weight-medium) !important;
      line-height: var(--bew-line-height-control) !important;
      transition:
        background-color var(--bew-duration-fast, 150ms) var(--bew-ease-standard, ease),
        filter var(--bew-duration-fast, 150ms) var(--bew-ease-standard, ease),
        scale var(--bew-duration-fast, 150ms) var(--bew-ease-standard, ease) !important;
    }

    /* Follow keeps its accent and only brightens a touch on hover. */
    #${ROOT_ID} .bewly-widescreen-up-slot .upinfo-btn-panel > .follow-btn.not-follow:hover {
      filter: brightness(1.08);
    }

    /* Charging is a secondary action: a neutral filled button beside the
       accent follow button, not Bilibili's pink outline. */
    #${ROOT_ID} .bewly-widescreen-up-slot .upinfo-btn-panel > .default-btn:not(.follow-btn) {
      color: var(--bew-text-1) !important;
      background: var(--bew-fill-1) !important;
      border: 0 !important;
    }

    #${ROOT_ID} .bewly-widescreen-up-slot .upinfo-btn-panel > .default-btn:not(.follow-btn) :is(svg, i) {
      color: currentColor !important;
    }

    #${ROOT_ID} .bewly-widescreen-up-slot .upinfo-btn-panel > .default-btn:not(.follow-btn) [fill]:not([fill="none"]) {
      fill: currentColor !important;
    }

    #${ROOT_ID} .bewly-widescreen-up-slot .upinfo-btn-panel > .default-btn:not(.follow-btn) [stroke]:not([stroke="none"]) {
      stroke: currentColor !important;
    }

    #${ROOT_ID} .bewly-widescreen-up-slot .upinfo-btn-panel > .default-btn:not(.follow-btn):hover {
      background: var(--bew-fill-2) !important;
    }

    #${ROOT_ID} .bewly-widescreen-up-slot .follow-btn-inner {
      width: auto !important;
      height: auto !important;
      line-height: inherit !important;
    }

    /* A track selector like the home tabs: the app teleports the sliding
       indicator into it (PlaybackRailTabsIndicator.vue). It sits between the
       info and the panels. */
    #${ROOT_ID} .bewly-widescreen-tabs {
      position: relative;
      z-index: 2;
      display: flex;
      flex: 0 0 auto;
      margin: 0;
    }

    #${ROOT_ID} .bewly-widescreen-tab {
      flex: 1 1 0;
      min-width: 0;
    }

    /* Without the app (no indicator yet, or none in this document) the
       selected tab paints the plate itself. */
    #${ROOT_ID} .bewly-widescreen-tabs:not(:has(> .bew-liquid-indicator)) > .bewly-widescreen-tab[data-active="true"] {
      background: var(--bew-liquid-indicator-bg);
      box-shadow: var(--bew-liquid-indicator-shadow);
    }

    /* The tabs, the panel content and the composer share one content line
       (the column's padding). The scrollers reach one space-1 past it, so
       row hover fills and focus rings are not clipped. */
    #${ROOT_ID} .bewly-widescreen-panels {
      position: relative;
      z-index: 0;
      flex: 1 1 0;
      min-height: 0;
      margin-inline: calc(var(--bew-space-1) * -1);
      overflow: hidden;
      background: transparent;
    }

    #${ROOT_ID} .bewly-widescreen-panel {
      position: relative;
      width: 100%;
      height: 100%;
      overflow: auto;
      overscroll-behavior: contain;
      padding: var(--bew-space-3) var(--bew-space-1) var(--bewly-widescreen-rail-bottom);
    }

    #${ROOT_ID} .bewly-widescreen-empty.bewly-widescreen-panel-error {
      position: absolute;
      inset: 0;
      z-index: var(--bew-z-base-overlay);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: var(--bew-space-3);
      padding: var(--bew-space-4);
      background: var(--bewly-widescreen-sidebar-bg);
      color: var(--bew-text-2);
      font-size: var(--bew-font-size-control);
      line-height: var(--bew-line-height-control);
      text-align: center;
    }

    #${ROOT_ID} .bewly-widescreen-panel-error button {
      min-height: var(--bew-control-height);
      padding: 0 var(--bew-space-3);
      border: 1px solid var(--bew-surface-border-color);
      border-radius: var(--bew-interactive-radius);
      background: var(--bew-elevated);
      color: var(--bew-text-1);
      cursor: pointer;
    }

    #${ROOT_ID} .bewly-widescreen-panel-error button:hover {
      background: var(--bew-fill-1);
    }

    #${ROOT_ID} .bewly-widescreen-panel-error button:focus-visible {
      outline: var(--bew-focus-ring, 1px solid CanvasText);
      outline-offset: var(--bew-space-0-5);
    }

    #${ROOT_ID} .bewly-widescreen-panel-comment {
      --bew-comment-replies-mask-bg: color-mix(in oklab, var(--bewly-widescreen-sidebar-bg), transparent 15%);
    }

    /* The app's comment composer (commentComposer.ts) is pinned beside the
       panels, outside the scroller: the list scrolls under it to the window
       edge, and its end stops the composer's measured height above it, so
       neither overscroll nor a growing list moves it. Native comment boxes
       inside stay hidden (MAIN). */
    #${ROOT_ID} .${COMMENT_COMPOSER_HOST_CLASS} {
      position: absolute;
      right: var(--bew-space-1);
      bottom: var(--bewly-widescreen-rail-bottom);
      left: var(--bew-space-1);
      z-index: 3;
      display: block;
    }

    #${ROOT_ID} .bewly-widescreen-panels:has(> .bewly-widescreen-panel-comment[hidden]) > .${COMMENT_COMPOSER_HOST_CLASS} {
      display: none;
    }

    #${ROOT_ID} .bewly-widescreen-panels:has(> .${COMMENT_COMPOSER_HOST_CLASS}) > .bewly-widescreen-panel-comment {
      padding-bottom: calc(var(--bewly-widescreen-rail-bottom) + var(${COMMENT_COMPOSER_HEIGHT_PROPERTY}, 0px) + var(--bew-space-3));
    }

    #${ROOT_ID} .bewly-widescreen-panel-comment,
    #${ROOT_ID} .bewly-widescreen-panel-danmaku {
      background: var(--bewly-widescreen-sidebar-bg);
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku {
      position: relative;
      padding: 0 var(--bew-space-1) var(--bewly-widescreen-rail-bottom);
      overflow: hidden;
      container-type: size;
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .danmaku-box,
    #${ROOT_ID} .bewly-widescreen-panel-danmaku .danmaku-wrap,
    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-docker,
    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-auxiliary,
    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-collapse,
    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bui-collapse-wrap {
      width: 100% !important;
      height: 100% !important;
      min-height: 0 !important;
      background: var(--bewly-widescreen-sidebar-bg) !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-docker {
      display: flex !important;
      flex-direction: column !important;
      height: 100% !important;
      min-height: 0 !important;
      overflow: hidden !important;
      background: var(--bewly-widescreen-sidebar-bg) !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-collapse,
    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bui-collapse-wrap {
      display: flex !important;
      flex-direction: column;
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bui-collapse-wrap {
      position: relative;
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bui-collapse-header {
      flex: 0 0 auto;
      display: flex !important;
      align-items: center !important;
      height: auto !important;
      min-height: var(--bew-control-height-lg, 40px) !important;
      /* Reserve room for the native history label and its horizontal padding. */
      padding-inline-end: calc(var(--bew-font-size-control) * 8 + var(--bew-space-4) * 2) !important;
      background: var(--bewly-widescreen-sidebar-bg) !important;
      border-bottom-color: var(--bewly-widescreen-divider) !important;
      pointer-events: none;
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bui-collapse-arrow {
      display: none !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-filter {
      pointer-events: auto;
    }

    /* The list title, the first column and its header start on the column's
       content line instead of Bpx's 16px indent. */
    #${ROOT_ID} .bewly-widescreen-panel-danmaku :is(.bpx-player-filter, .bpx-player-dm-btn-time, .dm-info-time) {
      padding-left: 0 !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bui-collapse-body {
      /* The history footer remains in the native list tree; its containing
         block is the collapse wrapper so list mode and delegated clicks survive. */
      position: static !important;
      display: block !important;
      width: 100% !important;
      height: auto !important;
      min-height: 0 !important;
      flex: 1 1 0 !important;
      overflow: hidden;
      background: var(--bewly-widescreen-sidebar-bg) !important;
      transform: none !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-wraplist {
      display: flex !important;
      width: 100% !important;
      height: 100% !important;
      min-height: 0 !important;
      flex-direction: column;
      background: var(--bewly-widescreen-sidebar-bg) !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-filter-wrap.bpx-player-dm {
      display: flex !important;
      height: 100% !important;
      min-height: 0 !important;
      flex: 1 1 auto;
      flex-direction: column;
      background: var(--bewly-widescreen-sidebar-bg) !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-dm-management,
    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-dm-function,
    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-dm-btn-footer {
      flex: 0 0 auto;
      background: var(--bewly-widescreen-sidebar-bg) !important;
    }

    /* The sender column added to the native header (syncDanmakuSenderOrderButton):
       a header cell like its neighbours, before the send time. */
    #${ROOT_ID} .bewly-widescreen-panel-danmaku .${DANMAKU_SENDER_ORDER_BUTTON_CLASS} {
      position: relative;
      flex: none;
      height: 32px;
      margin: 0;
      padding: 0 calc(var(--bew-space-4) + 2px) 0 6px;
      border: 0;
      border-radius: var(--bew-interactive-radius);
      background: transparent;
      color: var(--bpx-aux-content-font2, var(--bew-text-2));
      font: inherit;
      font-size: var(--bew-font-size-caption);
      line-height: 32px;
      cursor: pointer;
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .${DANMAKU_SENDER_ORDER_BUTTON_CLASS} > * {
      pointer-events: none;
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .${DANMAKU_SENDER_ORDER_BUTTON_CLASS}:hover {
      color: var(--bew-text-1);
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .${DANMAKU_SENDER_ORDER_BUTTON_CLASS}:focus-visible {
      outline: var(--bew-focus-ring, 1px solid CanvasText);
      outline-offset: calc(var(--bew-space-0-5) * -1);
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .${DANMAKU_SENDER_ORDER_CLASS} .${DANMAKU_SENDER_ORDER_BUTTON_CLASS} [class$="-dm-btn-icon"] {
      display: block;
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-dm-btn-footer {
      position: absolute !important;
      top: 0;
      right: 0;
      bottom: auto;
      display: flex;
      align-items: center;
      width: auto !important;
      height: var(--bew-control-height-lg) !important;
      margin: 0 !important;
      padding: 0 !important;
      border: 0 !important;
      z-index: 1;
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-dm-btn-history {
      position: relative;
      width: auto !important;
      height: var(--bew-control-height-sm) !important;
      padding: 0 var(--bew-space-2) !important;
      border: 0 !important;
      border-radius: var(--bew-interactive-radius);
      background: var(--bew-fill-1) !important;
      color: var(--bew-text-2) !important;
      font-size: var(--bew-font-size-control) !important;
      line-height: var(--bew-control-height-sm) !important;
      white-space: nowrap;
      cursor: pointer;
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-dm-btn-history:hover {
      background: var(--bew-fill-2) !important;
      color: var(--bew-text-1) !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-dm-btn-history:focus-visible {
      outline: var(--bew-focus-ring, 1px solid CanvasText);
      outline-offset: var(--bew-space-0-5);
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-dm-btn-history .bpx-player-date-picker {
      top: calc(100% + var(--bew-space-2)) !important;
      right: 0 !important;
      bottom: auto !important;
      left: auto !important;
      max-height: calc(100cqh - var(--bew-control-height-lg) - var(--bew-space-4));
      overflow-y: auto;
      overscroll-behavior: contain;
      background: var(--bew-elevated-solid) !important;
      border-radius: var(--bew-popover-radius);
      color: var(--bew-text-1);
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-dm-wrap {
      position: relative !important;
      height: auto !important;
      min-height: 0 !important;
      flex: 1 1 auto;
      overflow: hidden;
      background: var(--bewly-widescreen-sidebar-bg) !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-dm-container,
    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bui-long-list-wrap {
      height: 100% !important;
      min-height: 0 !important;
      background: var(--bewly-widescreen-sidebar-bg) !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bui-long-list-list {
      background: var(--bewly-widescreen-sidebar-bg) !important;
    }

    #${ROOT_ID} .bewly-widescreen-danmaku-skeleton {
      position: absolute;
      inset: 0;
      z-index: 3;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      padding: var(--bew-space-3, 12px) var(--bew-space-1, 4px) var(--bew-space-4, 16px);
      background: transparent;
      pointer-events: none;
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku:has(.bewly-widescreen-danmaku-skeleton)
      .bpx-player-dm-load-status {
      visibility: hidden !important;
      background: transparent !important;
    }

    #${ROOT_ID} .bewly-widescreen-danmaku-skeleton__rows {
      display: grid;
      gap: var(--bew-space-3, 12px);
    }

    #${ROOT_ID} .bewly-widescreen-danmaku-skeleton__row {
      display: grid;
      grid-template-columns: var(--bew-space-10, 40px) minmax(0, 1fr) calc(var(--bew-space-8, 32px) * 2);
      align-items: center;
      gap: var(--bew-space-3, 12px);
      min-height: var(--bew-line-height-caption, 16px);
    }

    #${ROOT_ID} .bewly-widescreen-danmaku-skeleton__block {
      display: block;
      height: var(--bew-space-3, 12px);
      border-radius: var(--bew-radius-sm);
      corner-shape: var(--bew-corner-shape);
    }

    #${ROOT_ID} .bewly-widescreen-danmaku-skeleton__time {
      width: 80%;
    }

    #${ROOT_ID} .bewly-widescreen-danmaku-skeleton__content {
      width: 88%;
    }

    #${ROOT_ID} .bewly-widescreen-danmaku-skeleton__row:nth-child(3n + 2) .bewly-widescreen-danmaku-skeleton__content {
      width: 68%;
    }

    #${ROOT_ID} .bewly-widescreen-danmaku-skeleton__row:nth-child(3n) .bewly-widescreen-danmaku-skeleton__content {
      width: 96%;
    }

    /* B 站表情面板可能向上展开；只在打开期间允许它越过评论面板边界。 */
    #${ROOT_ID} .bewly-widescreen-panels[data-bewly-comment-emoji-open],
    #${ROOT_ID} .bewly-widescreen-panel[data-bewly-comment-emoji-open] {
      overflow: visible;
    }

    #${ROOT_ID} .bewly-widescreen-panel[hidden] {
      display: none !important;
    }

    /* Border-box, so native padding (the collection box's) stays inside the
       column instead of pushing its right edge past the panel. */
    #${ROOT_ID} .bewly-widescreen-panel > * {
      box-sizing: border-box !important;
      width: 100% !important;
      max-width: 100% !important;
      margin-left: 0 !important;
      margin-right: 0 !important;
    }

    /* The collection sits on the page like the rest of the column: no grey
       box, aligned to the column's edges. */
    #${ROOT_ID} .bewly-widescreen-panel-playlist .video-pod {
      padding-inline: 0 !important;
      background: transparent !important;
      border-radius: 0 !important;
    }

    /* The episode list scrolls inside this body: it reaches one space-1 past
       the content line like the panel, so the rows' hover fills fit. */
    #${ROOT_ID} .bewly-widescreen-panel-playlist .video-pod__body {
      box-sizing: border-box !important;
      width: calc(100% + var(--bew-space-1) * 2) !important;
      margin-inline: calc(var(--bew-space-1) * -1) !important;
      padding-inline: var(--bew-space-1) !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist .video-pod__list {
      margin: 0 !important;
      padding: 0 !important;
    }

    /* B 站的选集组件会继承普通视频页的固定高度。Bewly 播放页中由整个
       选集面板负责滚动，列表便可以使用直到视口底部的全部剩余空间。 */
    #${ROOT_ID} .bewly-widescreen-panel-playlist {
      overflow-y: auto;
      scrollbar-gutter: stable;
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist .video-pod__header .header-bottom > .right {
      display: flex !important;
      align-items: center !important;
      width: auto !important;
      min-width: max-content !important;
      flex: 0 0 auto !important;
      gap: var(--bew-space-2, 8px) !important;
    }

    #${ROOT_ID} .bewly-widescreen-playlist-toggle {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: auto !important;
      min-height: var(--bew-control-height-sm, 28px);
      flex: 0 0 auto;
      margin: 0;
      padding: 0 var(--bew-space-2, 8px);
      color: var(--bew-text-2);
      background: transparent;
      border: 1px solid var(--bew-surface-border-color);
      border-radius: var(--bew-interactive-radius);
      corner-shape: var(--bew-corner-shape);
      box-shadow: none;
      backdrop-filter: none;
      cursor: pointer;
      font-family: var(--bew-font-family);
      font-size: var(--bew-font-size-control, 13px);
      font-weight: var(--bew-font-weight-medium, 500);
      line-height: var(--bew-line-height-control, 18px);
      transition:
        color var(--bew-duration-fast, 150ms) var(--bew-ease-standard, ease),
        background-color var(--bew-duration-fast, 150ms) var(--bew-ease-standard, ease);
    }

    #${ROOT_ID} .bewly-widescreen-playlist-toggle[hidden] {
      display: none !important;
    }

    #${ROOT_ID} .bewly-widescreen-playlist-toggle::after {
      content: "";
      width: var(--bew-space-2, 8px);
      height: var(--bew-space-2, 8px);
      margin-left: var(--bew-space-2, 8px);
      border-right: var(--bew-space-0-5, 2px) solid currentColor;
      border-bottom: var(--bew-space-0-5, 2px) solid currentColor;
      transform: rotate(45deg);
      transition: transform var(--bew-duration-moderate, 300ms) var(--bew-ease-standard, ease);
    }

    #${ROOT_ID} .bewly-widescreen-playlist-toggle[aria-expanded="true"]::after {
      transform: rotate(225deg);
    }

    #${ROOT_ID} .bewly-widescreen-playlist-toggle:hover {
      color: var(--bew-text-1);
      background: var(--bew-fill-2);
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist .subscribe-btn {
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      width: auto !important;
      min-width: max-content !important;
      min-height: var(--bew-control-height-sm, 28px) !important;
      padding: 0 var(--bew-space-2, 8px) !important;
      flex: 0 0 auto !important;
      color: var(--bew-text-2) !important;
      background: transparent !important;
      border: 1px solid var(--bew-surface-border-color) !important;
      border-radius: var(--bew-interactive-radius) !important;
      corner-shape: var(--bew-corner-shape);
      font-size: var(--bew-font-size-control, 13px) !important;
      font-weight: var(--bew-font-weight-medium, 500) !important;
      line-height: var(--bew-line-height-control, 18px) !important;
      white-space: nowrap !important;
      transition:
        color var(--bew-duration-fast, 150ms) var(--bew-ease-standard, ease),
        background-color var(--bew-duration-fast, 150ms) var(--bew-ease-standard, ease);
    }

    /* Same neutral outline as the collapse toggle beside it. */
    #${ROOT_ID} .bewly-widescreen-panel-playlist .subscribe-btn:hover {
      color: var(--bew-text-1) !important;
      background: var(--bew-fill-2) !important;
    }

    #${ROOT_ID} .bewly-widescreen-playlist-toggle:focus-visible {
      outline: var(--bew-focus-ring, 1px solid CanvasText);
      outline-offset: var(--bew-space-0-5, 2px);
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist .video-pod,
    #${ROOT_ID} .bewly-widescreen-panel-playlist .video-pod__body,
    #${ROOT_ID} .bewly-widescreen-panel-playlist .video-pod__list,
    #${ROOT_ID} .bewly-widescreen-panel-playlist .multi-page,
    #${ROOT_ID} .bewly-widescreen-panel-playlist .multi-page-v1,
    #${ROOT_ID} .bewly-widescreen-panel-playlist .cur-list,
    #${ROOT_ID} .bewly-widescreen-panel-playlist .list-box,
    #${ROOT_ID} .bewly-widescreen-panel-playlist .base-video-sections-v1,
    #${ROOT_ID} .bewly-widescreen-panel-playlist .video-sections-v1,
    #${ROOT_ID} .bewly-widescreen-panel-playlist .video-sections-content-list,
    #${ROOT_ID} .bewly-widescreen-panel-playlist #eplist_module,
    #${ROOT_ID} .bewly-widescreen-panel-playlist [class*="eplist_ep_list_wrapper"],
    #${ROOT_ID} .bewly-widescreen-panel-playlist [class*="numberList_wrapper"],
    #${ROOT_ID} .bewly-widescreen-panel-playlist [class*="imageList_wrap"] {
      height: auto !important;
      min-height: 0 !important;
      max-height: none !important;
      overflow: visible !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel [class*="PaginatedEpList_root"],
    #${ROOT_ID} .bewly-widescreen-panel [class*="eplist_ep_list_wrapper"],
    #${ROOT_ID} .bewly-widescreen-panel [class*="recommend_wrap"],
    #${ROOT_ID} .bewly-widescreen-panel #danmukuBox,
    #${ROOT_ID} .bewly-widescreen-panel [class*="DanmukuBox_wrap"],
    #${ROOT_ID} .bewly-widescreen-panel #comment-module,
    #${ROOT_ID} .bewly-widescreen-panel #comment-body {
      position: relative !important;
      left: auto !important;
      right: auto !important;
      top: auto !important;
      bottom: auto !important;
      transform: none !important;
      width: 100% !important;
      max-width: 100% !important;
      margin: 0 0 var(--bew-space-3) !important;
      z-index: auto !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel [class*="numberList_wrapper"],
    #${ROOT_ID} .bewly-widescreen-panel [class*="imageList_wrap"] {
      width: 100% !important;
      max-width: 100% !important;
    }

    /* Keep only the marked episode section internally scrollable. The panel
       itself remains the outer scroll fallback for recommendations and other
       sidebar content; nested playlist containers stay overflow-visible. */
    #${ROOT_ID} .bewly-widescreen-panel-playlist.${EPISODE_SECTION_CLASS},
    #${ROOT_ID} .bewly-widescreen-panel-playlist .${EPISODE_SECTION_CLASS} {
      height: auto !important;
      max-height: min(52dvh, var(--bew-widescreen-episode-max-height)) !important;
      opacity: 1;
      overflow-x: hidden !important;
      overflow-y: auto !important;
      scrollbar-gutter: stable;
      transition:
        max-height var(--bew-duration-moderate, 300ms) var(--bew-ease-standard, ease),
        opacity var(--bew-duration-moderate, 300ms) var(--bew-ease-standard, ease),
        margin var(--bew-duration-moderate, 300ms) var(--bew-ease-standard, ease);
    }

    /* 选集滚到顶部或底部后把剩余滚动交给外侧侧栏面板；面板自身保持 contain，
       不会继续带动底层页面。只放开选集真正的滚动区，覆盖 B 站原生的 contain。 */
    #${ROOT_ID} .bewly-widescreen-panel-playlist .${EPISODE_SECTION_CLASS},
    #${ROOT_ID} .bewly-widescreen-panel-playlist [class*="EpisodeVirtualList_scroll"] {
      overscroll-behavior: auto !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist.is-episode-section-collapsed .${EPISODE_SECTION_CLASS} {
      max-height: 0 !important;
      margin-bottom: 0 !important;
      opacity: 0;
      overflow: hidden !important;
      pointer-events: none;
      scrollbar-gutter: auto;
    }

    /* The modern PGC directory owns its virtual scrollports and item metrics.
       Keep its header, section/page tabs and sort controls together, without
       introducing a second constrained scrollport around the native lists. */
    #${ROOT_ID} .bewly-widescreen-panel-playlist [class*="PaginatedEpList_root"].${EPISODE_SECTION_CLASS} {
      max-height: none !important;
      overflow: visible !important;
    }
    #${ROOT_ID} .bewly-widescreen-panel-playlist.is-episode-section-collapsed [class*="PaginatedEpList_root"].${EPISODE_SECTION_CLASS} {
      display: none !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist [class*="EpisodeVirtualList_gridRow"] {
      justify-content: start !important;
      column-gap: var(--bew-space-3, 12px) !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist .pod-expand-btn,
    #${ROOT_ID} .bewly-widescreen-panel-playlist ${PLAYLIST_RECOMMENDATION_FOOTER_SELECTOR} {
      display: none !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel .video-page-card-small {
      width: 100% !important;
    }

    /* One row for every list in the column: the collection's videos and the
       recommendations share the thumbnail, type, spacing and states. A row
       reaches one space-1 past the content line, so its hover fill frames
       the thumbnail concentrically. The playing row is the selected surface
       with the accent marker instead of Bilibili's coloured title and GIF. */
    #${ROOT_ID} .bewly-widescreen-panel-playlist {
      --bewly-widescreen-row-thumb-width: calc(var(--bew-space-10) * 3);
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist :is(.video-pod__item, .video-page-card-small) {
      margin: 0 0 var(--bew-space-1) !important;
      padding: 0 !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist :is(.normal-base-item, .simple-base-item, .video-page-card-small .card-box) {
      display: flex !important;
      align-items: flex-start !important;
      gap: var(--bew-space-3) !important;
      height: auto !important;
      margin: 0 calc(var(--bew-space-1) * -1) !important;
      padding: var(--bew-space-1) !important;
      background: transparent !important;
      border-radius: calc(var(--bew-media-radius) + var(--bew-space-1)) !important;
      corner-shape: var(--bew-corner-shape);
      transition: background-color var(--bew-duration-fast, 150ms) var(--bew-ease-standard, ease);
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist .simple-base-item {
      align-items: center !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist :is(.normal-base-item, .simple-base-item, .video-page-card-small .card-box):hover {
      background: var(--bew-hover-bg) !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist :is(.normal-base-item .cover, .video-page-card-small .pic-box) {
      position: relative !important;
      flex: 0 0 var(--bewly-widescreen-row-thumb-width) !important;
      width: var(--bewly-widescreen-row-thumb-width) !important;
      height: auto !important;
      aspect-ratio: 16 / 9;
      margin: 0 !important;
      border-radius: var(--bew-media-radius) !important;
      corner-shape: var(--bew-corner-shape);
      overflow: hidden !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist .normal-base-item .cover .cover-img,
    #${ROOT_ID} .bewly-widescreen-panel-playlist .video-page-card-small .pic-box :is(.pic, .framepreview-box, .video-awesome-img, .b-img, picture, img) {
      width: 100% !important;
      height: 100% !important;
      object-fit: cover;
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist :is(.normal-base-item .info, .video-page-card-small .info) {
      display: flex !important;
      flex: 1 1 auto !important;
      flex-direction: column !important;
      gap: var(--bew-space-1) !important;
      min-width: 0 !important;
      height: auto !important;
      margin: 0 !important;
      padding: 0 !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist :is(.normal-base-item, .simple-base-item, .video-page-card-small) .title {
      display: -webkit-box !important;
      height: auto !important;
      max-height: none !important;
      margin: 0 !important;
      overflow: hidden !important;
      color: var(--bew-text-1) !important;
      font-size: var(--bew-font-size-control) !important;
      font-weight: var(--bew-font-weight-regular) !important;
      line-height: var(--bew-line-height-control) !important;
      white-space: normal !important;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist :is(.normal-base-item .stats, .video-page-card-small :is(.upname, .playinfo)) {
      display: flex !important;
      align-items: center !important;
      gap: var(--bew-space-1) var(--bew-space-2) !important;
      height: auto !important;
      margin: 0 !important;
      color: var(--bew-text-3) !important;
      font-size: var(--bew-font-size-caption) !important;
      font-variant-numeric: tabular-nums;
      line-height: var(--bew-line-height-caption) !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist :is(.normal-base-item .stats, .video-page-card-small :is(.upname, .playinfo)) svg {
      width: var(--bew-icon-size-xs) !important;
      height: var(--bew-icon-size-xs) !important;
      flex: 0 0 auto;
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist .video-page-card-small .upname :is(a, .name) {
      color: inherit !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist .video-page-card-small .upname a:hover {
      color: var(--bew-text-1) !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist :is(.normal-base-item, .simple-base-item).active {
      background: var(--bew-selected-bg) !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist :is(.normal-base-item, .simple-base-item).active :is(.title, .title *) {
      color: var(--bew-text-1) !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist :is(.normal-base-item, .simple-base-item) .playing-gif {
      display: none !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist :is(.normal-base-item, .simple-base-item).active .title::before {
      content: "";
      display: inline-block;
      width: calc(var(--bew-space-1) * 1.5);
      height: calc(var(--bew-space-1) * 1.5);
      margin-inline-end: var(--bew-space-1);
      vertical-align: middle;
      background: var(--bew-accent-marker);
      border-radius: 50%;
      corner-shape: var(--bew-corner-shape-round);
    }

    /* The recommendation list's header is a section title like the
       collection's and the comment header; its autoplay switch label is a
       caption beside it. */
    #${ROOT_ID} .bewly-widescreen-panel-playlist .rec-title .title-txt {
      color: var(--bew-text-1) !important;
      font-size: var(--bew-font-size-title) !important;
      font-weight: var(--bew-font-weight-medium) !important;
      line-height: var(--bew-line-height-title) !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist .rec-title .continuous-btn .txt {
      color: var(--bew-text-3) !important;
      font-size: var(--bew-font-size-caption) !important;
      line-height: var(--bew-line-height-caption) !important;
    }

    /* Durations on thumbnails are captions too. */
    #${ROOT_ID} .bewly-widescreen-panel-playlist .pic-box .duration {
      font-size: var(--bew-font-size-caption) !important;
      font-variant-numeric: tabular-nums;
      line-height: var(--bew-line-height-caption) !important;
    }

    /* The collection's header reads as the group's label. */
    #${ROOT_ID} .bewly-widescreen-panel-playlist .video-pod__header {
      margin: 0 !important;
      padding: 0 0 var(--bew-space-3) !important;
      background: transparent !important;
      border: 0 !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist .video-pod__header .header-top .title {
      color: var(--bew-text-1) !important;
      font-size: var(--bew-font-size-title) !important;
      font-weight: var(--bew-font-weight-medium) !important;
      line-height: var(--bew-line-height-title) !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist .video-pod__header :is(.amt, .header-bottom > .left) {
      color: var(--bew-text-3) !important;
      font-size: var(--bew-font-size-caption) !important;
      font-variant-numeric: tabular-nums;
      line-height: var(--bew-line-height-caption) !important;
    }

    /* Recommendations after a collection: a second group of the same rows,
       under a hairline and its own label (the root sets the localized text). */
    #${ROOT_ID} .bewly-widescreen-panel-playlist .video-pod ~ :is(.recommend-list-v1, .recommend-list) {
      margin-top: var(--bew-space-3) !important;
      padding-top: var(--bew-space-4) !important;
      border-top: 1px solid var(--bew-border-color) !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist .video-pod ~ :is(.recommend-list-v1, .recommend-list)::before {
      content: var(--bewly-widescreen-up-next-label, none);
      display: block;
      margin-bottom: var(--bew-space-3);
      color: var(--bew-text-2);
      font-size: var(--bew-font-size-control);
      font-weight: var(--bew-font-weight-medium);
      line-height: var(--bew-line-height-control);
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist :is(.recommend-list-v1, .recommend-list, .rec-list) {
      margin-inline: 0 !important;
      padding-inline: 0 !important;
    }

    /* Switching tabs fades the incoming panel in; nothing moves. */
    #${ROOT_ID} .bewly-widescreen-panel:not([hidden]) {
      transition: opacity var(--bew-duration-fast, 150ms) var(--bew-ease-standard, ease);
    }

    @starting-style {
      #${ROOT_ID} .bewly-widescreen-panel:not([hidden]) {
        opacity: 0;
      }
    }

    #${ROOT_ID} .bewly-widescreen-panel-comment .reply-item,
    #${ROOT_ID} .bewly-widescreen-panel-comment .sub-reply-item,
    #${ROOT_ID} .bewly-widescreen-panel-comment .root-reply-container,
    #${ROOT_ID} .bewly-widescreen-panel-comment .sub-reply-container {
      padding-left: 0 !important;
      padding-right: 0 !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-comment .content-warp,
    #${ROOT_ID} .bewly-widescreen-panel-comment .reply-content-container,
    #${ROOT_ID} .bewly-widescreen-panel-comment .sub-reply-content {
      min-width: 0 !important;
      margin-left: var(--bew-space-2) !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-comment .user-info,
    #${ROOT_ID} .bewly-widescreen-panel-comment .sub-user-info {
      min-width: 0 !important;
      max-width: 100% !important;
      flex-wrap: wrap !important;
      gap: var(--bew-space-1) var(--bew-space-2) !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-comment .reply-time,
    #${ROOT_ID} .bewly-widescreen-panel-comment .sub-reply-time,
    #${ROOT_ID} .bewly-widescreen-panel-comment .reply-time-location {
      white-space: nowrap !important;
      font-size: var(--bew-font-size-caption) !important;
    }

    #${ROOT_ID} .bewly-widescreen-empty.bewly-widescreen-panel-skeleton {
      display: grid;
      align-content: start;
      gap: var(--bew-space-4);
      padding: var(--bew-space-4);
    }
    #${ROOT_ID} .bewly-widescreen-panel-skeleton__row {
      display: flex;
      align-items: flex-start;
      gap: var(--bew-space-3);
      width: 100%;
    }
    #${ROOT_ID} .bewly-widescreen-panel-skeleton__leading {
      width: var(--bew-space-8);
      height: var(--bew-space-8);
      flex: none;
      border-radius: var(--bew-radius-full);
    }
    #${ROOT_ID} .bewly-widescreen-panel-skeleton__content {
      flex: 1;
      min-width: 0;
      height: var(--bew-space-12);
      border-radius: var(--bew-radius-sm);
    }
    #${ROOT_ID} [data-kind="playlist"] .bewly-widescreen-panel-skeleton__leading {
      border-radius: var(--bew-radius-sm);
    }

    #${ROOT_ID} .bewly-widescreen-empty {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 25%;
      color: var(--bewly-widescreen-text-muted);
      font-size: var(--bew-font-size-body);
    }

    /* Comments loading: one ring over the panel. It closes on arrival, then
       fades off the list that is already laid out beneath it. */
    #${ROOT_ID} .bewly-widescreen-empty.bewly-widescreen-panel-loading {
      position: absolute;
      inset: 0;
      z-index: 2;
      min-height: 0;
      background: var(--bew-bg);
      pointer-events: none;
      --bew-loading-ring-size: var(--bew-icon-size-xl, 32px);
      transition: opacity var(--bew-duration-fast, 150ms) var(--bew-ease-standard, ease);
    }

    #${ROOT_ID} .bewly-widescreen-panel-loading.is-leaving {
      opacity: 0;
    }

    @media (max-height: 800px) and (min-width: ${MOBILE_BREAKPOINT + 1}px) {
      #${ROOT_ID} .bewly-widescreen-title {
        font-size: var(--bew-font-size-title);
        line-height: var(--bew-line-height-title);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} :is(
        .bpx-player-control-wrap,
        .bilibili-player-video-control-wrap,
        .bilibili-player-video-control,
        .squirtle-controller
      ),
      body.${BODY_CLASS} .${DANMAKU_GLASS_CLASS},
      body.${BODY_CLASS} > .bewly-widescreen-backdrop,
      #${ROOT_ID} :is(.bewly-widescreen-info, .bewly-widescreen-sidebar, .bewly-widescreen-panel, .bewly-widescreen-panel-loading),
      #${ROOT_ID} .bewly-widescreen-tags-slot :is(.ordinary-tag, .topic-tag, .bgm-tag) > .tag-link,
      ${DANMAKU_SURFACE_SELECTOR},
      #${ROOT_ID} .bewly-widescreen-playlist-toggle::after,
      #${ROOT_ID} .bewly-widescreen-panel-playlist .${EPISODE_SECTION_CLASS},
      #${ROOT_ID} .bewly-widescreen-danmaku-skeleton__block {
        transition: none;
        animation: none;
      }

      #${ROOT_ID} .bewly-widescreen-action-slot :is(.video-toolbar-left-item, .video-toolbar-right-item, .bewly-watch-later-btn):active,
      #${ROOT_ID} .bewly-widescreen-up-slot .upinfo-btn-panel > .default-btn:active {
        scale: none;
      }

      body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .b-back-panel :is(.b-back-submit, .b-back-content-fail-resubmit, .b-back-content-test-submit, .b-back-content-test-fail-submit, .b-back-content-test-success-submit, .b-back-content-test-speedtest, .b-back-content-test-fail-speedtest):active {
        scale: none;
      }
    }

    /* One column: the 16:9 video pane across the top, then the column with
       its info capped, the tabs and the panels taking the remaining height. */
    @media (max-width: ${MOBILE_BREAKPOINT}px) {
      body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS}[${PLAYER_DISPLAY_MODE_ATTRIBUTE}="fill"],
      #${ROOT_ID}[data-display-mode="fill"] .bewly-widescreen-danmaku-dock {
        --bewly-widescreen-controls-glass-inset: var(--bew-space-4, 16px);
      }

      #${ROOT_ID} {
        --bewly-widescreen-page-padding: var(--bew-space-3, 12px);
      }

      #${ROOT_ID} .bewly-widescreen-stage,
      #${ROOT_ID}[data-sidebar-position="left"] .bewly-widescreen-stage {
        grid-template-columns: minmax(0, 1fr);
        grid-template-rows: auto minmax(0, 1fr);
        grid-template-areas:
          "player"
          "rail";
      }

      /* The pane is exactly 16:9, so the zooming player covers it alone. */
      #${ROOT_ID} .bewly-widescreen-player-frame {
        flex: 0 0 auto;
        aspect-ratio: 16 / 9;
      }

      body.${BODY_CLASS} > .bewly-widescreen-backdrop::before {
        display: none;
      }

      #${ROOT_ID} .bewly-widescreen-info {
        max-height: 28dvh;
      }

      ${DANMAKU_SURFACE_SELECTOR} {
        padding-inline: var(--bew-space-4, 16px) !important;
      }
    }
  `)
}
