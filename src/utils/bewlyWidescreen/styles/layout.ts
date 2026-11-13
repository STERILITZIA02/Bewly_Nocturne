import { BEWLY_WIDESCREEN_CONTROLS_HIDDEN_ATTRIBUTE } from '~/constants/globalEvents'
import LOADING_RING_CSS from '~/styles/loadingRing.scss?inline'
import PLAYBACK_TEXT_CSS from '~/styles/playbackText.scss?inline'
import SEGMENT_CONTROL_CSS from '~/styles/segmentControl.scss?inline'
import SEGMENT_LIQUID_INDICATOR_CSS from '~/styles/segmentLiquidIndicator.scss?inline'
import SEND_BUTTON_CSS from '~/styles/sendButton.scss?inline'
import SKELETON_CSS from '~/styles/skeleton.scss?inline'
import { ACTION_ANIMATION_ATTRIBUTE, ACTION_ROLL_CLASS, BODY_CLASS, COMMENT_COMPOSER_HEIGHT_PROPERTY, COMMENT_COMPOSER_HOST_CLASS, COVER_FIELD_PROPERTY, COVER_TONE_PROPERTY, DANMAKU_GLASS_CLASS, DANMAKU_SOURCE_HOST_CLASS, DANMAKU_SURFACE_SELECTOR, DISCLOSURE_CHEVRON_MASK, DISCLOSURE_TOGGLE_CLASS, EPISODE_SECTION_CLASS, FILL_TOGGLE_CLASS, HIDDEN_NATIVE_PLAYER_CONTROL_SELECTORS, HIGH_ENERGY_PROGRESS_PIN_SELECTOR, HOST_ZOOMING_ATTRIBUTE, INFO_FOLDING_PARTS, LETTERBOX_ATTRIBUTE, LETTERBOX_VEIL_PROPERTY, MOBILE_BREAKPOINT, NATIVE_DIALOG_CHECK_CLASS, NATIVE_DIALOG_FIELD_CLASS, NATIVE_DIALOG_NUMERAL_CLASS, NATIVE_DIALOG_TITLE_CLASS, NATIVE_LIGHT_OFF_CONTROL_SELECTORS, NATIVE_MUSIC_ENTRY_SELECTOR, NATIVE_PLAYER_ANCESTOR_CLASS, NATIVE_PLAYER_CLASS, PGC_RECOMMEND_LIST_CLASS, PGC_SECTION_ATTRIBUTE, PLAYER_DISPLAY_MODE_ATTRIBUTE, PLAYER_ZOOMING_ATTRIBUTE, PLAYLIST_RECOMMENDATION_FOOTER_SELECTOR, RAIL_HEAD_TONE_ATTRIBUTE, RAISED_MORE_MENU_CLASS, ROOT_ID, VIEWER_COUNT_MIRRORED_ATTRIBUTE } from '~/utils/bewlyWidescreen/constants'
import { CARD_LAYOUT_PROPERTIES, playbackLetterbox, playbackRailHeadGlass, playbackRailTopPadding, playbackRecommendationSkeleton, playbackTopBarRule } from '~/utils/bewlyWidescreen/styles/cardLayout'
import { LOADING_RING_MASK } from '~/utils/loadingRing'
import { injectCSS } from '~/utils/main'
import { PHOTO_VIEWER_SELECTOR } from '~/utils/photoViewer'
import { reducedMotionCss } from '~/utils/reducedMotion'

/**
 * The one solid surface every player popover shares: control menus and
 * tooltips, the danmaku mode and settings panels, and the feedback panel.
 */
const PLAYER_POPOVER_SURFACE = `background: var(--bew-elevated-alt-solid) !important;
      border: var(--bew-hairline, 1px) solid var(--bew-edge-color) !important;
      border-radius: var(--bew-surface-radius) !important;
      corner-shape: var(--bew-corner-shape);
      box-shadow: var(--bew-popover-surface-shadow) !important;
      backdrop-filter: none !important;
      color: var(--bew-text-1) !important;
      font-family: var(--bew-fonts-ui) !important;
      font-size: var(--bew-font-size-control) !important;
      font-weight: var(--bew-font-weight-regular) !important;
      line-height: var(--bew-line-height-control) !important;`

// A native dialog window, as the app's (modalWindow.scss surface).
const PLAYER_DIALOG_SURFACE = `background: var(--bew-elevated-solid) !important;
      border: var(--bew-hairline, 1px) solid var(--bew-edge-color) !important;
      border-radius: var(--bew-modal-radius) !important;
      corner-shape: var(--bew-corner-shape);
      box-shadow: var(--bew-shadow-4) !important;
      backdrop-filter: none !important;`

// Column counts Bilibili's episode grid may set inline (repeat(n, 56px)).
const EPISODE_GRID_COLUMN_COUNTS = [3, 4, 5, 6, 7, 8, 9, 10]

// A field: Bpx's inputs and selects on the field tokens.
const FIELD_SURFACE = `box-sizing: border-box !important;
      height: var(--bew-control-height-sm) !important;
      padding: 0 var(--bew-space-2) !important;
      border: 1px solid var(--bew-field-edge-color) !important;
      border-radius: var(--bew-interactive-radius) !important;
      corner-shape: var(--bew-corner-shape);
      background: var(--bew-input-bg) !important;
      color: var(--bew-text-1) !important;
      font-size: var(--bew-font-size-control) !important;
      line-height: calc(var(--bew-control-height-sm) - 2px) !important;
      transition: border-color var(--bew-duration-fast) var(--bew-ease-standard);`

// A plain button: no fill and no outline at rest; hover lays a fill under it
// (the plain close button's token).
const PLAIN_BUTTON = `display: inline-flex !important;
      align-items: center;
      gap: var(--bew-space-1);
      border: 0 !important;
      border-radius: var(--bew-interactive-radius) !important;
      corner-shape: var(--bew-corner-shape);
      background: transparent !important;
      color: var(--bew-text-2) !important;
      cursor: pointer;
      transition:
        color var(--bew-duration-fast) var(--bew-ease-standard),
        background-color var(--bew-duration-fast) var(--bew-ease-standard);`

const PLAIN_BUTTON_HOVER = `background: var(--bew-hover-bg) !important;
      color: var(--bew-text-1) !important;`

const PLAYER_CONTROLS = `body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .bpx-player-control-wrap`
// One form vocabulary for subtitles, playback settings, volume and danmaku.
// The native controls retain their state, measurements and event handlers.
const BPX_FORMS = `:is(${PLAYER_CONTROLS} .bpx-player-ctrl-btn, ${DANMAKU_SURFACE_SELECTOR} .bpx-player-dm-setting-box, #${ROOT_ID} .bewly-widescreen-panel-danmaku)`

export function injectLayoutStyle() {
  return injectCSS(`
    ${SKELETON_CSS}
    ${LOADING_RING_CSS}
    ${SEGMENT_CONTROL_CSS}
    ${SEGMENT_LIQUID_INDICATOR_CSS}
    ${SEND_BUTTON_CSS}
    ${PLAYBACK_TEXT_CSS}
    ${playbackRailTopPadding(`#${ROOT_ID}`, '.bewly-widescreen-sidebar')}
    ${playbackRailHeadGlass(`#${ROOT_ID}`, '.bewly-widescreen-sidebar')}
    /* Bpx anchors the whole top row here; the music overlay is its sibling. */
    ${playbackTopBarRule(
      `.${NATIVE_PLAYER_CLASS}[${PLAYER_DISPLAY_MODE_ATTRIBUTE}="card"] :is(.bpx-player-top-wrap, .bpx-player-music-wrap)`,
      'top: var(--bew-top-bar-height, 64px) !important;',
    )}
    /* Scrolling danmaku start below the top bar. Only the lane layer moves (the
       engine lays its lanes out from this box on resize); the mask layer stays
       aligned with the picture. */
    ${playbackTopBarRule(
      `.${NATIVE_PLAYER_CLASS}[${PLAYER_DISPLAY_MODE_ATTRIBUTE}="card"] .bpx-player-row-dm-wrap`,
      'top: var(--bew-top-bar-height, 64px) !important; height: calc(100% - var(--bew-top-bar-height, 64px)) !important;',
    )}
    /* A listening stage lays out below the header that floats over the picture. */
    ${playbackTopBarRule(
      `.${NATIVE_PLAYER_CLASS}[${PLAYER_DISPLAY_MODE_ATTRIBUTE}="card"] > .bewly-listen-stage`,
      '--bewly-listen-top: var(--bew-top-bar-height, 64px);',
    )}
    /* The anchored box is read only by the player itself. Without inheritance a
       resize or mode switch restyles one element, not the whole Bpx tree. */
    @property --bewly-widescreen-player-top { syntax: '*'; inherits: false; }
    @property --bewly-widescreen-player-left { syntax: '*'; inherits: false; }
    @property --bewly-widescreen-player-width { syntax: '*'; inherits: false; }
    @property --bewly-widescreen-player-height { syntax: '*'; inherits: false; }
    /* Read only by the comment panel's own padding (commentComposer.ts). */
    @property ${COMMENT_COMPOSER_HEIGHT_PROPERTY} { syntax: '*'; inherits: false; }
    /* Read by the player and the backdrop's canvas only; a colour, so a new
       cover's tone eases in. */
    @property ${COVER_TONE_PROPERTY} { syntax: '<color>'; inherits: false; initial-value: transparent; }
    @property ${COVER_FIELD_PROPERTY} { syntax: '*'; inherits: false; }
    @property ${LETTERBOX_VEIL_PROPERTY} { syntax: '<color>'; inherits: false; initial-value: transparent; }

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
      --bewly-widescreen-aux-controls-width: calc(var(--bew-control-height, 36px) * 4 + var(--bew-space-2, 8px) * 4);
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
      background-color: var(--bewly-widescreen-letterbox);
    }

    /* The pane's letterbox (playbackLetterbox). */
    ${playbackLetterbox(`body.${BODY_CLASS}`)}
    ${playbackRecommendationSkeleton(`#${ROOT_ID}`)}

    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS}[${PLAYER_DISPLAY_MODE_ATTRIBUTE}="card"] {
      background: var(--bewly-widescreen-letterbox) !important;
    }

    /* The letterbox blends the cover's own colours, as the listening stage does
       (user-specified): its blurred field under a veil of the average colour,
       over that colour and the plain letterbox until they are read. The dark
       theme lays a shade over it instead of a black band. The video area
       paints it: a black native box sits between it and the player.

       Filling the window or the screen, the video keeps the black player
       canvas: a veil of it over the same layers, a registered colour, so the
       letterbox crosses between the cover's colours and black with the zoom
       (and with native fullscreen) instead of cutting (user-specified
       2026-11-10). The video area carries the mode itself, set as the zoom
       starts; the player's own mode waits for the settled frame. */
    html.dark body.${BODY_CLASS} {
      --bewly-widescreen-cover-shade: rgb(0 0 0 / 55%);
    }

    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .bpx-player-video-area {
      background:
        linear-gradient(var(${LETTERBOX_VEIL_PROPERTY}) 0 0),
        linear-gradient(var(--bewly-widescreen-cover-shade, transparent) 0 0),
        linear-gradient(color-mix(in srgb, var(${COVER_TONE_PROPERTY}) 30%, transparent) 0 0),
        var(${COVER_FIELD_PROPERTY}, none) center / cover no-repeat,
        linear-gradient(var(${COVER_TONE_PROPERTY}) 0 0) var(--bewly-widescreen-letterbox) !important;
      transition:
        ${COVER_TONE_PROPERTY} var(--bew-duration-moderate, 300ms) var(--bew-ease-standard, ease),
        ${LETTERBOX_VEIL_PROPERTY} var(--bew-duration-moderate, 300ms) var(--bew-ease-standard, ease);
    }

    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .bpx-player-video-area[${LETTERBOX_ATTRIBUTE}="canvas"],
    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .bpx-player-container[data-screen="full"] .bpx-player-video-area {
      ${LETTERBOX_VEIL_PROPERTY}: var(--bew-player-canvas, #000);
    }

    body.${BODY_CLASS} > .bewly-widescreen-backdrop::before {
      ${COVER_TONE_PROPERTY}: inherit;
      ${COVER_FIELD_PROPERTY}: inherit;
      background:
        linear-gradient(var(${LETTERBOX_VEIL_PROPERTY}) 0 0),
        linear-gradient(var(--bewly-widescreen-cover-shade, transparent) 0 0),
        linear-gradient(color-mix(in srgb, var(${COVER_TONE_PROPERTY}) 30%, transparent) 0 0),
        var(${COVER_FIELD_PROPERTY}, none) center / cover no-repeat,
        linear-gradient(var(${COVER_TONE_PROPERTY}) 0 0) var(--bewly-widescreen-letterbox);
      transition: ${LETTERBOX_VEIL_PROPERTY} var(--bew-duration-moderate, 300ms) var(--bew-ease-standard, ease);
    }

    body.${BODY_CLASS} > .bewly-widescreen-backdrop[data-display-mode="fill"]::before {
      ${LETTERBOX_VEIL_PROPERTY}: var(--bew-player-canvas, #000);
    }

    @media (prefers-reduced-motion: reduce) {
      body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .bpx-player-video-area,
      body.${BODY_CLASS} > .bewly-widescreen-backdrop::before {
        transition: none;
      }
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

    /* Bangumi's dialogs use separate fixed wrappers (z 10000–10030).
       Raise the whole wrapper, including its backdrop, above the shell. */
    body.${BODY_CLASS} :is(
      [class*="modalWrapper_mask"],
      [class*="dialogcoin_coin_dialog_mask"],
      [class*="DialogCollect_dialogWrap"],
      [class*="short_short_review_masker"],
      [class*="dialog___dialog_masker"]
    ) {
      z-index: var(--bew-z-hud) !important;
    }

    /* Bangumi's dialogs (coin, rating) read as the app's dialog windows
       (modalWindow.scss): the page dims under the modal backdrop; the window
       is the solid modal surface with the close button 8px from its top and
       right corner, concentric; subheading titles; neutral option cards (the
       chosen one on the selected fill, hover on the hover fill; the border
       does not change); fields on the input tokens; the shared checkbox; the
       one primary button the accent solid, neutral while unavailable; notes
       caption text-3. Their class-less parts are marked (actionEffects.ts
       markNativeDialog). */
    body.${BODY_CLASS} :is([class*="modalWrapper_mask"], [class*="dialogcoin_coin_dialog_mask"], [class*="short_short_review_masker"]) {
      background: var(--bew-modal-backdrop) !important;
    }

    body.${BODY_CLASS} :is([class*="dialogcoin_coin_operated"], [class*="short_short_review_content"]) {
      ${PLAYER_DIALOG_SURFACE}
      overflow: hidden;
      color: var(--bew-text-1) !important;
      font-family: var(--bew-fonts-ui) !important;
    }

    body.${BODY_CLASS} :is([class*="dialogcoin_icon_close"], [class*="short_dialog_close"]) {
      top: var(--bew-space-2) !important;
      right: var(--bew-space-2) !important;
      display: grid !important;
      place-items: center;
      width: var(--bew-control-height) !important;
      height: var(--bew-control-height) !important;
      border-radius: calc(var(--bew-modal-radius) - var(--bew-space-2)) !important;
      corner-shape: var(--bew-corner-shape);
      color: var(--bew-text-2) !important;
      cursor: pointer;
      transition:
        color var(--bew-duration-fast) var(--bew-ease-standard),
        background-color var(--bew-duration-fast) var(--bew-ease-standard);
    }

    body.${BODY_CLASS} :is([class*="dialogcoin_icon_close"], [class*="short_dialog_close"]):hover {
      color: var(--bew-text-1) !important;
      background: var(--bew-hover-bg) !important;
    }

    body.${BODY_CLASS} [class*="dialogcoin_coin_title"] {
      height: auto !important;
      margin: 0 !important;
      padding: var(--bew-space-5) calc(var(--bew-control-height) + var(--bew-space-3)) 0 !important;
      color: var(--bew-text-1) !important;
      font-size: var(--bew-font-size-subheading) !important;
      line-height: var(--bew-line-height-subheading) !important;
      font-weight: var(--bew-font-weight-regular) !important;
    }

    body.${BODY_CLASS} .${NATIVE_DIALOG_NUMERAL_CLASS} {
      margin-inline: var(--bew-space-1);
      color: inherit !important;
      font-size: inherit !important;
      line-height: inherit !important;
      font-variant-numeric: tabular-nums;
    }

    body.${BODY_CLASS} [class*="dialogcoin_mc__"] {
      display: flex !important;
      justify-content: center;
      gap: var(--bew-space-3);
      height: auto !important;
      padding: var(--bew-space-5) var(--bew-space-5) 0 !important;
    }

    body.${BODY_CLASS} [class*="dialogcoin_mc_box"] {
      margin: 0 !important;
      border: var(--bew-hairline, 1px) solid var(--bew-edge-color) !important;
      border-radius: var(--bew-surface-radius) !important;
      corner-shape: var(--bew-corner-shape);
      background: transparent !important;
      cursor: pointer;
      transition: background-color var(--bew-duration-fast) var(--bew-ease-standard);
    }

    body.${BODY_CLASS} [class*="dialogcoin_mc_box"]:hover {
      background: var(--bew-hover-bg) !important;
    }

    body.${BODY_CLASS} [class*="dialogcoin_mc_box"][class*="dialogcoin_on"] {
      background: var(--bew-selected-bg) !important;
    }

    body.${BODY_CLASS} [class*="dialogcoin_c_num"] {
      top: var(--bew-space-2) !important;
      left: var(--bew-space-3) !important;
      height: auto !important;
      color: var(--bew-text-2) !important;
      font-size: var(--bew-font-size-caption) !important;
      line-height: var(--bew-line-height-caption) !important;
    }

    body.${BODY_CLASS} [class*="dialogcoin_like_checkbox"] {
      margin: var(--bew-space-3) 0 0 !important;
      padding-inline: var(--bew-space-5) !important;
      color: var(--bew-text-2) !important;
      font-size: var(--bew-font-size-callout) !important;
      line-height: var(--bew-line-height-callout) !important;
    }

    body.${BODY_CLASS} .${NATIVE_DIALOG_CHECK_CLASS} {
      box-sizing: border-box;
      width: var(--bew-icon-size-xs) !important;
      height: var(--bew-icon-size-xs) !important;
      margin-right: var(--bew-space-1) !important;
      vertical-align: -0.2em;
      border: 1px solid var(--bew-field-edge-color);
      border-radius: var(--bew-radius-tiny);
      corner-shape: var(--bew-corner-shape);
      background: transparent !important;
    }

    body.${BODY_CLASS} :checked + .${NATIVE_DIALOG_CHECK_CLASS} {
      border-color: transparent;
      background: var(--bew-theme-color) var(--bew-theme-checkmark-image) no-repeat 50% / 80% !important;
    }

    body.${BODY_CLASS} [class*="dialogcoin_coin_bottom"] {
      height: auto !important;
      padding: var(--bew-space-5) var(--bew-space-5) var(--bew-space-4) !important;
    }

    body.${BODY_CLASS} [class*="dialogcoin_coin_btn"] {
      display: flex !important;
      align-items: center;
      justify-content: center;
      width: fit-content !important;
      min-width: calc(var(--bew-space-12) * 3);
      height: var(--bew-control-height) !important;
      margin: 0 auto !important;
      padding: 0 var(--bew-space-4) !important;
      color: var(--bew-on-accent-solid) !important;
      background: var(--bew-accent-solid) !important;
      border: 0 !important;
      border-radius: var(--bew-interactive-radius) !important;
      corner-shape: var(--bew-corner-shape);
      font-size: var(--bew-font-size-control) !important;
      line-height: var(--bew-line-height-control) !important;
      transition: background-color var(--bew-duration-fast) var(--bew-ease-standard);
    }

    body.${BODY_CLASS} [class*="dialogcoin_coin_btn"]:hover {
      background: color-mix(in srgb, var(--bew-accent-solid) 88%, var(--bew-neutral-fg)) !important;
    }

    body.${BODY_CLASS} [class*="dialogcoin_tips"] {
      margin: var(--bew-space-3) 0 0 !important;
      color: var(--bew-text-3) !important;
      font-size: var(--bew-font-size-caption) !important;
      line-height: var(--bew-line-height-caption) !important;
    }

    /* The rating dialog: the poster and the title, the stars, a field for
       the short review, and its submit button beside the long-review link. */
    body.${BODY_CLASS} [class*="short_review_header_wrap"] {
      padding: var(--bew-space-5) var(--bew-space-5) var(--bew-space-4) !important;
    }

    body.${BODY_CLASS} [class*="header_media_img"] img {
      border-radius: var(--bew-thumb-radius) !important;
      corner-shape: var(--bew-corner-shape);
      box-shadow: var(--bew-media-shadow);
    }

    body.${BODY_CLASS} .${NATIVE_DIALOG_TITLE_CLASS} {
      margin: 0 !important;
      color: var(--bew-text-1) !important;
      font-size: var(--bew-font-size-subheading) !important;
      line-height: var(--bew-line-height-subheading) !important;
      font-weight: var(--bew-font-weight-regular) !important;
    }

    body.${BODY_CLASS} [class*="header_rate_tip"] {
      margin-top: var(--bew-space-1) !important;
      color: var(--bew-text-2) !important;
      font-size: var(--bew-font-size-callout) !important;
      line-height: var(--bew-line-height-callout) !important;
    }

    body.${BODY_CLASS} [class*="header_rate_wrap"] {
      margin-top: var(--bew-space-3) !important;
    }

    body.${BODY_CLASS} [class*="short_review_body_wrap"] {
      margin-inline: var(--bew-space-5) !important;
      padding: var(--bew-space-2) !important;
      border: 1px solid var(--bew-field-edge-color) !important;
      border-radius: var(--bew-interactive-radius) !important;
      corner-shape: var(--bew-corner-shape);
      background: var(--bew-input-bg) !important;
      transition: border-color var(--bew-duration-fast) var(--bew-ease-standard);
    }

    body.${BODY_CLASS} [class*="short_review_body_wrap"]:hover {
      border-color: var(--bew-field-edge-color-hover) !important;
    }

    body.${BODY_CLASS} .${NATIVE_DIALOG_FIELD_CLASS} {
      padding: 0 !important;
      color: var(--bew-text-1) !important;
      background: transparent !important;
      font-family: inherit !important;
      font-size: var(--bew-font-size-body) !important;
      line-height: var(--bew-line-height-body) !important;
    }

    body.${BODY_CLASS} [class*="short_tip"] {
      color: var(--bew-text-3) !important;
      font-size: var(--bew-font-size-caption) !important;
      line-height: var(--bew-line-height-caption) !important;
      font-variant-numeric: tabular-nums;
    }

    /* Actions sit at the window's end, the button last (modalWindow.scss). */
    body.${BODY_CLASS} [class*="short_review_footer"] {
      flex-direction: row-reverse;
      justify-content: flex-start !important;
      align-items: center;
      gap: var(--bew-space-4);
      padding: var(--bew-space-4) var(--bew-space-5) var(--bew-space-5) !important;
    }

    body.${BODY_CLASS} [class*="short_mr_btn"] {
      height: var(--bew-control-height) !important;
      min-width: calc(var(--bew-space-12) * 2) !important;
      padding: 0 var(--bew-space-4) !important;
      color: var(--bew-text-3) !important;
      background: var(--bew-fill-1) !important;
      border: 0 !important;
      border-radius: var(--bew-interactive-radius) !important;
      corner-shape: var(--bew-corner-shape);
      font-size: var(--bew-font-size-control) !important;
      line-height: var(--bew-control-height) !important;
      transition: background-color var(--bew-duration-fast) var(--bew-ease-standard);
    }

    body.${BODY_CLASS} [class*="short_mr_btn"][class*="short_active"] {
      color: var(--bew-on-accent-solid) !important;
      background: var(--bew-accent-solid) !important;
    }

    body.${BODY_CLASS} [class*="short_mr_btn"][class*="short_active"]:hover {
      background: color-mix(in srgb, var(--bew-accent-solid) 88%, var(--bew-neutral-fg)) !important;
    }

    body.${BODY_CLASS} [class*="short_mr_long_review"] {
      color: var(--bew-theme-foreground) !important;
      font-size: var(--bew-font-size-callout) !important;
      line-height: var(--bew-line-height-callout) !important;
    }

    /* Popper places the video share popover from the share chip, whose
       neighbours' widths spring on hover, so its next update (the copy
       click) moved it sideways. It hangs from the action row's right end
       instead (the column's content line), as on bangumi. */
    body.${BODY_CLASS} > .video-share-popover {
      right: var(--bewly-widescreen-page-padding) !important;
      left: auto !important;
    }

    @media (min-width: ${MOBILE_BREAKPOINT + 1}px) {
      body.${BODY_CLASS} > .bewly-widescreen-backdrop[data-sidebar-position="left"] ~ .video-share-popover {
        right: calc(var(--bewly-widescreen-card-width) + var(--bewly-widescreen-page-padding)) !important;
      }
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

    /* The follow widget over the video repeats the author row beside it; a
       bangumi episode's title, and the dark gradient Bpx lays under it on
       hover, repeat the info card's title. */
    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} :is(.bpx-player-top-left-follow, .bpx-player-top-follow, .bpx-player-top-title, .bpx-player-top-mask),
    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .bpx-player-top-issue,
    ${NATIVE_LIGHT_OFF_CONTROL_SELECTORS
      .map(selector => `body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} ${selector}`)
      .join(',\n    ')} {
      display: none !important;
    }

    body.${BODY_CLASS} :is(.${NATIVE_PLAYER_CLASS}.bpx-state-paused, .${NATIVE_PLAYER_CLASS} .bpx-state-paused) .bpx-player-state-wrap {
      inset: 50% auto auto 50% !important;
      translate: -50% -50%;
    }

    /* The player's own loading (first frame, switching, buffering) is the
       shared ring instead of Bpx's TV-and-dots sprite: the same arc as a
       mask, in the skeleton's ring's place and size over the video, so the
       loading overlay hands over to it without a change. */
    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .bpx-player-loading-panel-blur-detail {
      width: var(--bewly-widescreen-player-ring-size);
      height: var(--bewly-widescreen-player-ring-size);
      transform: none;
      background: var(--bewly-widescreen-player-ring-color);
      -webkit-mask: ${LOADING_RING_MASK} center / contain no-repeat;
      mask: ${LOADING_RING_MASK} center / contain no-repeat;
      animation: bew-loading-ring-spin var(--bew-loading-ring-spin-duration, 900ms) linear infinite;
    }

    #${ROOT_ID} {
      position: fixed;
      inset: 0;
      z-index: var(--bew-z-widescreen);
      color: var(--bew-text-1);
      background: transparent;
      font-family: var(--bew-fonts-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
      pointer-events: none;
      --bewly-widescreen-sidebar-bg: transparent;
      /* The column's translucent selected fill (CARD_LAYOUT_PROPERTIES). The
         indicator's tokens are resolved on :root, so they are set here too. */
      --bew-selected-bg: var(--bewly-widescreen-control-selected-bg);
      --bew-segment-item-active-bg: var(--bewly-widescreen-control-selected-bg);
      --bew-segment-item-active-shadow: none;
      --bew-liquid-indicator-bg: var(--bewly-widescreen-control-selected-bg);
      --bew-liquid-indicator-shadow: none;
      --bew-comment-expand-all-display: none;
      --bewly-widescreen-danmaku-bar-bg: var(--bew-glass-tint);
      --bewly-widescreen-aux-controls-width: calc(var(--bew-control-height, 36px) * 4 + var(--bew-space-2, 8px) * 4);
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

    /* Layout box of the video pane, square and the stage's full height. The
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

    ${playbackTopBarRule(
      `#${ROOT_ID}[data-display-mode="card"] .bewly-widescreen-player-toolbar`,
      'top: calc(var(--bew-top-bar-height, 64px) + var(--bewly-widescreen-card-inset));',
    )}

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

    /* 收起统一交给播放器上的 BEWLY_WIDESCREEN_CONTROLS_HIDDEN_ATTRIBUTE，忽略原生独立收起。
       常显只在非隐藏态生效，避免与统一隐藏规则发生 !important 级联战 */
    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS}:not([${BEWLY_WIDESCREEN_CONTROLS_HIDDEN_ATTRIBUTE}]) :is(
      .bpx-player-control-wrap,
      .bilibili-player-video-control-wrap,
      .bilibili-player-video-control,
      .squirtle-controller
    ) {
      opacity: var(--bewly-widescreen-controls-opacity, 0) !important;
      visibility: visible !important;
      pointer-events: auto !important;
    }

    /* Bpx already lifts bottom-aligned CC via an inline bottom. Set its final
       anchor directly so that lift isn't added to the card clearance. */
    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS}:not([${PLAYER_ZOOMING_ATTRIBUTE}], [${BEWLY_WIDESCREEN_CONTROLS_HIDDEN_ATTRIBUTE}]) :is(
      .bili-subtitle-x-subtitle-panel-position[data-position="bottom"],
      .bpx-player-toast-wrap
    ) {
      bottom: calc(var(--bewly-widescreen-controls-glass-bottom) + var(--bewly-widescreen-controls-glass-height) + var(--bew-space-2, 8px)) !important;
    }

    /* 显式反超原生空闲隐藏链（data-ctrl-hidden / bpx-state-no-cursor），
       原生隐藏只能由统一 BEWLY_WIDESCREEN_CONTROLS_HIDDEN_ATTRIBUTE 表达 */
    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS}:not([${BEWLY_WIDESCREEN_CONTROLS_HIDDEN_ATTRIBUTE}]) :is(
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

    ${PLAYER_CONTROLS} .bpx-player-control-bottom {
      align-items: center !important;
      align-content: center;
      flex-wrap: wrap;
      height: auto !important;
      min-height: calc(var(--bew-control-height) + var(--bew-space-2));
      line-height: var(--bew-line-height-control) !important;
      gap: var(--bew-space-2);
    }

    /* The progress row stays above the buttons when a narrow bar needs two rows.
       The shared controls geometry already measures the wrap's actual height. */
    ${PLAYER_CONTROLS} .bpx-player-control-top {
      top: 0 !important;
      bottom: auto !important;
    }

    ${PLAYER_CONTROLS} :is(.bpx-player-control-bottom-left, .bpx-player-control-bottom-right) {
      align-items: center !important;
      column-gap: var(--bew-space-2) !important;
      min-width: 0 !important;
    }

    ${PLAYER_CONTROLS} .bpx-player-control-bottom-right {
      flex: none !important;
      flex-wrap: wrap;
      max-width: 100%;
      row-gap: var(--bew-space-2);
    }

    /* Keep native display/visibility decisions, including the narrow-bar fit.
       Hover bridges no longer move the button out of the shared baseline. */
    ${PLAYER_CONTROLS} :is(.bpx-player-control-bottom-left, .bpx-player-control-bottom-right) > .bpx-player-ctrl-btn {
      box-sizing: border-box !important;
      align-self: center;
      flex-shrink: 0 !important;
      height: var(--bew-control-height) !important;
      margin: 0 !important;
      padding: 0 !important;
      line-height: var(--bew-control-height) !important;
      color: var(--bew-text-1) !important;
      font-weight: var(--bew-font-weight-regular) !important;
    }

    ${PLAYER_CONTROLS} .bpx-player-control-bottom .bpx-player-ctrl-btn:not(
      .bpx-player-ctrl-time, .bpx-player-ctrl-viewpoint, .bpx-player-ctrl-quality,
      .bpx-player-ctrl-playbackrate, .bpx-player-ctrl-subtitle, .bpx-player-ctrl-eplist, .bpx-player-ctrl-flac, .bpx-player-ctrl-dolby
    ) {
      width: var(--bew-control-height) !important;
      flex: 0 0 var(--bew-control-height) !important;
    }

    ${PLAYER_CONTROLS} .bpx-player-ctrl-btn > .bpx-player-ctrl-btn-icon {
      /* Bpx switches paired enter/leave and volume/mute boxes with display.
         Position only their glyphs, without overriding the boxes' display. */
      position: relative;
      height: var(--bew-control-height);
      line-height: var(--bew-control-height);
      margin: 0 !important;
    }

    ${PLAYER_CONTROLS} .bpx-player-ctrl-btn-icon > :is(.bpx-common-svg-icon, .bewly-player-glyph) {
      position: absolute;
      inset: 0;
      margin: auto !important;
    }

    ${PLAYER_CONTROLS} .bpx-player-ctrl-btn-icon > .bpx-common-svg-icon {
      height: var(--bew-icon-size-md) !important;
      vertical-align: middle;
      opacity: 1 !important;
    }

    ${PLAYER_CONTROLS} .bpx-player-ctrl-btn:not(.bpx-player-ctrl-flac, .bpx-player-ctrl-dolby) > .bpx-player-ctrl-btn-icon > .bpx-common-svg-icon {
      width: var(--bew-icon-size-md) !important;
    }

    ${PLAYER_CONTROLS} :is(.bpx-player-ctrl-quality-result, .bpx-player-ctrl-playbackrate-result, .bpx-player-ctrl-subtitle-result, .bpx-player-ctrl-eplist-result, .bpx-player-ctrl-time-label) {
      font-size: var(--bew-font-size-control) !important;
      font-weight: var(--bew-font-weight-regular) !important;
      line-height: var(--bew-control-height) !important;
      text-indent: 0 !important;
      color: var(--bew-text-1) !important;
    }

    ${PLAYER_CONTROLS} .bpx-player-ctrl-btn:is(.bpx-player-ctrl-quality, .bpx-player-ctrl-playbackrate, .bpx-player-ctrl-subtitle, .bpx-player-ctrl-eplist) {
      width: auto !important;
      min-width: var(--bew-control-height) !important;
      /* Match the inset around a centered icon so mixed text/icon gaps agree. */
      padding-inline: calc((var(--bew-control-height) - var(--bew-icon-size-md)) / 2) !important;
      white-space: nowrap;
    }

    /* Bpx hides its episode entry with visibility:hidden + width:0 in normal
       web playback. It must leave flex layout too, or even zero width adds a gap.
       Full/web screens and the native PC app keep the original episode entry. */
    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .bpx-player-container:not(
      [data-screen="full"], [data-screen="web"], .bpx-player-pc-app[data-screen="normal"]
    ) .bpx-player-control-bottom-right > .bpx-player-ctrl-eplist {
      display: none !important;
    }

    /* The native absolute label has no intrinsic width and clips longer times. */
    ${PLAYER_CONTROLS} .bpx-player-ctrl-time {
      width: auto !important;
      min-width: 0 !important;
    }

    ${PLAYER_CONTROLS} .bpx-player-ctrl-time-label {
      position: static;
      width: auto;
    }

    ${PLAYER_CONTROLS} .bpx-player-ctrl-quality :is(.bpx-player-ctrl-quality-result, .bpx-player-ctrl-quality-result-wrap) svg {
      opacity: 1 !important;
    }

    ${PLAYER_CONTROLS} .bpx-player-ctrl-viewpoint-content {
      align-items: center;
      height: var(--bew-control-height);
      margin: 0 !important;
      padding: 0 !important;
    }

    ${PLAYER_CONTROLS} :is(.bpx-player-ctrl-quality-menu-wrap, .bpx-player-ctrl-playbackrate-menu, .bpx-player-ctrl-playbackrate-unlogin, .bpx-player-ctrl-subtitle-box, .bpx-player-ctrl-setting-box, .bpx-player-ctrl-volume-box, .bpx-player-ctrl-viewpoint-menu-wrap, .bpx-player-ctrl-eplist-menu-wrap) {
      bottom: calc(var(--bew-control-height) + var(--bew-space-2)) !important;
    }

    ${PLAYER_CONTROLS} :is(.bpx-player-ctrl-quality, .bpx-player-ctrl-playbackrate, .bpx-player-ctrl-subtitle, .bpx-player-ctrl-setting, .bpx-player-ctrl-volume, .bpx-player-ctrl-viewpoint, .bpx-player-ctrl-eplist):is(:hover, .bpx-state-show)::before {
      content: "";
      position: absolute;
      inset: auto 0 100%;
      height: var(--bew-space-2);
    }

    /* 原生底部渐变遮罩（180px repeat-x 暗化层）：禁用，悬浮卡只保留自己的玻璃表面 */
    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .bpx-player-control-mask {
      display: none !important;
      background: none !important;
    }

    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS}[${BEWLY_WIDESCREEN_CONTROLS_HIDDEN_ATTRIBUTE}] :is(
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
    ) :is(svg:not([fill="none"]), svg [fill]:not([fill="none"])):not(.bui-thumb-dot svg, .bui-thumb-dot svg *) {
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
    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS}:not([${BEWLY_WIDESCREEN_CONTROLS_HIDDEN_ATTRIBUTE}]) :is(
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
    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .bpx-player-control-wrap .bpx-player-ctrl-subtitle-menu,
    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .bpx-player-control-wrap .bpx-player-ctrl-playbackrate-unlogin,
    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .bpx-player-control-wrap .bpx-player-ctrl-pip-bubble-body,
    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .bpx-player-control-wrap .bpx-player-translation-bubble-body,
    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .bpx-player-control-wrap .bpx-player-progress-popup,
    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .bpx-player-control-wrap .bpx-player-ctrl-setting-menu,
    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .bpx-player-control-wrap .bpx-player-ctrl-pip-tip {
      ${PLAYER_POPOVER_SURFACE}
      color: var(--bew-text-1) !important;
    }

    /* The settings box is only a positioning owner. Its inner menu is the one
       visual surface, matching the quality selector without a nested dark plate. */
    ${PLAYER_CONTROLS} :is(.bpx-player-ctrl-setting-box, .bpx-player-ctrl-subtitle-box, .bpx-player-ctrl-quality-menu-wrap > .bpx-player-ctrl-quality-menu) {
      background: transparent !important;
      border: 0 !important;
      box-shadow: none !important;
      backdrop-filter: none !important;
    }

    ${PLAYER_CONTROLS} :is(.bpx-player-ctrl-subtitle-menu-left, .bpx-player-ctrl-subtitle-menu-right, .bpx-player-ctrl-subtitle-menu-origin, .bpx-player-ctrl-subtitle-menu-translation, .bpx-player-ctrl-subtitle-menu-description) {
      background: transparent !important;
    }

    ${PLAYER_CONTROLS} :is(.bpx-player-ctrl-subtitle-menu, .bpx-player-ctrl-setting-menu) .bui-panel-wrap {
      max-height: var(--bew-popover-max-height);
      overflow: hidden auto;
      overscroll-behavior: contain;
    }

    /* During Bpx's page slide no item is active for a moment; keep its inline
       destination height then, so the popup cannot collapse under the pointer. */
    ${PLAYER_CONTROLS} :is(.bpx-player-ctrl-subtitle-menu, .bpx-player-ctrl-setting-menu) .bui-panel-wrap:has(.bui-panel-item-active) {
      height: auto !important;
    }

    ${PLAYER_CONTROLS} :is(.bpx-player-ctrl-subtitle-menu, .bpx-player-ctrl-setting-menu) .bui-panel-move {
      height: auto !important;
      align-items: flex-start !important;
    }

    ${PLAYER_CONTROLS} :is(.bpx-player-ctrl-subtitle-menu, .bpx-player-ctrl-setting-menu) .bui-panel-item {
      height: auto !important;
    }

    ${PLAYER_CONTROLS} :is(.bpx-player-ctrl-subtitle-menu, .bpx-player-ctrl-setting-menu) .bui-panel-item:not(.bui-panel-item-active) {
      height: 0 !important;
      overflow: hidden;
    }

    ${PLAYER_CONTROLS} :is(.bpx-player-ctrl-subtitle-item-flex, .bpx-player-ctrl-subtitle-other-content, .bpx-player-ctrl-setting-others-content) {
      height: auto !important;
      min-height: var(--bew-control-height-sm);
      gap: var(--bew-space-2);
      flex-wrap: wrap;
    }

    ${PLAYER_CONTROLS} .bpx-player-ctrl-setting-others-content .bpx-player-ctrl-setting-checkbox {
      width: auto !important;
      height: auto !important;
      min-height: var(--bew-control-height-sm);
      flex: 1 1 auto;
    }

    ${PLAYER_CONTROLS} :is(.bpx-player-ctrl-subtitle-color, .bpx-player-ctrl-subtitle-fontsize, .bpx-player-ctrl-subtitle-position, .bpx-player-ctrl-subtitle-shadow) {
      height: auto !important;
      flex: 1 1 0;
      min-width: 0;
      margin-right: 0 !important;
    }

    ${PLAYER_CONTROLS} :is(.bpx-player-ctrl-subtitle-title, .bpx-player-ctrl-translation-title, .bpx-player-ctrl-subtitle-major-title, .bpx-player-ctrl-subtitle-minor-title, .bpx-player-ctrl-subtitle-nolan, .bpx-player-ctrl-translation-nolan, .bpx-player-ctrl-translation-feedback, .bpx-player-ctrl-subtitle-fake-switch-text, .bpx-player-ctrl-description-content, .bpx-player-ctrl-translation-other .bpx-player-ctrl-subtitle-other-title) {
      color: var(--bew-text-2) !important;
      opacity: 1 !important;
    }

    ${PLAYER_CONTROLS} :is(.bpx-player-ctrl-subtitle-language-item, .bpx-player-ctrl-translation-language-item, .bpx-player-ctrl-subtitle-close-switch, .bpx-player-ctrl-translation-close-switch, .bpx-player-ctrl-subtitle-setting, .bpx-player-ctrl-playbackrate-menu-item, .bpx-player-ctrl-quality-menu-item, .bpx-player-ctrl-viewpoint-menu-item) {
      border-radius: var(--bew-interactive-radius) !important;
      corner-shape: var(--bew-corner-shape);
      font-size: var(--bew-font-size-control) !important;
      font-weight: var(--bew-font-weight-regular) !important;
    }

    ${PLAYER_CONTROLS} :is(.bpx-player-ctrl-subtitle-language-item-text, .bpx-player-ctrl-translation-language-item-text, .bpx-player-ctrl-subtitle-setting-text, .bpx-player-ctrl-subtitle-opacity-percent) {
      font-size: var(--bew-font-size-control) !important;
    }

    ${PLAYER_CONTROLS} :is(.bpx-player-ctrl-subtitle-language-item, .bpx-player-ctrl-translation-language-item, .bpx-player-ctrl-subtitle-close-switch, .bpx-player-ctrl-translation-close-switch, .bpx-player-ctrl-subtitle-setting, .bpx-player-ctrl-playbackrate-menu-item, .bpx-player-ctrl-quality-menu-item, .bpx-player-ctrl-quality-vip-vision-menu-item, .bpx-player-ctrl-viewpoint-menu-item):hover {
      background: var(--bew-hover-bg) !important;
    }

    ${PLAYER_CONTROLS} :is(.bpx-player-ctrl-subtitle-language-item, .bpx-player-ctrl-translation-language-item, .bpx-player-ctrl-subtitle-close-switch, .bpx-player-ctrl-translation-close-switch, .bpx-player-ctrl-playbackrate-menu-item, .bpx-player-ctrl-quality-menu-item, .bpx-player-ctrl-quality-vip-vision-menu-item).bpx-state-active {
      background: var(--bew-selected-bg) !important;
    }

    ${PLAYER_CONTROLS} :is(.bpx-player-ctrl-subtitle-separator-above, .bpx-player-ctrl-subtitle-separator-bottom, .bpx-player-ctrl-subtitle-settings-footer, .bpx-player-ctrl-translation-separator, .bpx-player-ctrl-description-separator) {
      border-color: var(--bew-separator-color) !important;
      border-width: var(--bew-hairline) !important;
    }

    ${PLAYER_CONTROLS} .bscroll-indicator {
      background: var(--bew-text-3) !important;
      border: 0 !important;
      opacity: 1 !important;
    }

    ${PLAYER_CONTROLS} :is(.bpx-player-ctrl-playbackrate-unlogin-content, .bpx-player-ctrl-subtitle-language-unlogin-content, .bpx-player-ctrl-translation-unlogin-content, .bpx-player-ctrl-quality-menu-feedback) {
      background: var(--bew-fill-1) !important;
      color: var(--bew-text-1) !important;
      border-radius: var(--bew-interactive-radius) !important;
      corner-shape: var(--bew-corner-shape);
    }

    ${PLAYER_CONTROLS} :is(.bpx-player-ctrl-quality-badge-bigvip, .bpx-player-ctrl-quality-badge-embedded, .bpx-player-ctrl-quality-result-trial, .bpx-player-ctrl-quality-vip-vision-badge > span) {
      background: var(--bew-accent-solid) !important;
      color: var(--bew-on-accent-solid) !important;
    }

    ${PLAYER_CONTROLS} :is(.bpx-player-ctrl-quality-badge-needlogin, .bpx-player-ctrl-quality-vip-vision-badge.vip-trialing > span) {
      border-color: var(--bew-field-edge-color) !important;
      background: transparent !important;
      color: var(--bew-text-1) !important;
    }

    ${PLAYER_CONTROLS} :is(.bpx-player-ctrl-quality-result-auto-badge, .bpx-player-ctrl-quality-vip-vision-result-tag) {
      color: var(--bew-text-1) !important;
      background: var(--bew-fill-1) !important;
      border-color: var(--bew-field-edge-color) !important;
      opacity: 1 !important;
    }

    ${PLAYER_CONTROLS} :is(.bpx-player-ctrl-pip-bubble-arrow, .bpx-player-translation-bubble-arrow) {
      border-top-color: var(--bew-elevated-alt-solid) !important;
    }

    ${PLAYER_CONTROLS} :is(.bpx-player-ctrl-pip-bubble-text, .bpx-player-translation-bubble-text) {
      color: var(--bew-text-1) !important;
      font-size: var(--bew-font-size-control) !important;
    }

    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .bpx-player-context-area {
      z-index: var(--bew-z-hud) !important;
    }

    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .bpx-player-contextmenu {
      ${PLAYER_POPOVER_SURFACE}
      box-sizing: border-box;
      padding: var(--bew-popover-padding) !important;
      max-width: calc(100vw - var(--bew-space-4));
      max-height: calc(100dvh - var(--bew-space-4));
      overflow: hidden auto;
      overscroll-behavior: contain;
      text-shadow: none !important;
    }

    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .bpx-player-contextmenu > :is([data-action], [data-id], .bpx-player-disabled, .bpx-player-dm, .bpx-player-context-item-subtitle) {
      box-sizing: border-box;
      min-height: var(--bew-row-height);
      height: auto !important;
      padding: var(--bew-space-2) !important;
      border: 0 !important;
      border-radius: var(--bew-interactive-radius);
      corner-shape: var(--bew-corner-shape);
      color: var(--bew-text-1) !important;
      background: transparent !important;
      font-size: var(--bew-font-size-control) !important;
      line-height: var(--bew-line-height-control) !important;
    }

    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .bpx-player-contextmenu :is(a, .bpx-player-dm-btn > span, .bpx-player-context-item-subtitle-issue) {
      color: inherit !important;
    }

    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .bpx-player-contextmenu > :is([data-action], [data-id], .bpx-player-dm, .bpx-player-context-item-subtitle):not(.bpx-player-disabled):is(:hover, :focus-within) {
      background: var(--bew-hover-bg) !important;
    }

    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .bpx-player-contextmenu .bpx-player-disabled {
      color: var(--bew-text-4) !important;
    }

    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .bpx-player-contextmenu > .bpx-player-active {
      background: var(--bew-selected-bg) !important;
    }

    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .bpx-player-contextmenu :is(.bpx-player-dm, .bpx-player-context-item-subtitle) {
      align-items: center;
      gap: var(--bew-space-2);
    }

    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .bpx-player-contextmenu :is(.bpx-player-dm-text, .bpx-player-context-item-subtitle-text) {
      padding: 0 !important;
      line-height: var(--bew-line-height-control) !important;
    }

    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .bpx-player-contextmenu :is(.bpx-player-dm-btn > span, .bpx-player-context-item-subtitle-issue) {
      height: var(--bew-control-height-sm) !important;
      margin: 0 !important;
      border-radius: var(--bew-interactive-radius) !important;
      corner-shape: var(--bew-corner-shape);
      line-height: var(--bew-control-height-sm) !important;
    }

    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .bpx-player-contextmenu :is(.bpx-player-dm-btn > span, .bpx-player-context-item-subtitle-issue):not(.bpx-player-disabled):hover {
      background: var(--bew-hover-bg) !important;
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
      border-bottom: var(--bew-hairline, 1px) solid var(--bew-separator-color) !important;
      font-size: var(--bew-font-size-title) !important;
      font-weight: var(--bew-font-weight-regular);
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
      border: 1px solid var(--bew-field-edge-color) !important;
      border-radius: var(--bew-interactive-radius) !important;
      corner-shape: var(--bew-corner-shape);
      font: inherit !important;
      outline: none;
      transition: border-color var(--bew-duration-fast, 150ms) var(--bew-ease-standard, ease);
    }

    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .b-back-panel :is(.b-back-input, .b-back-contact-information-input):hover {
      border-color: var(--bew-field-edge-color-hover) !important;
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
      border-top: var(--bew-hairline, 1px) solid var(--bew-separator-color) !important;
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
      font-weight: var(--bew-font-weight-regular);
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
      border: var(--bew-glass-edge-width, 1px) solid var(--bew-glass-edge-color, rgb(230 230 230 / 80%)) !important;
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
    :is(#${ROOT_ID}[data-player-controls-hidden="true"], body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS}[${BEWLY_WIDESCREEN_CONTROLS_HIDDEN_ATTRIBUTE}]) .${DANMAKU_GLASS_CLASS},
    :is(#${ROOT_ID}[data-player-controls-hidden="true"], body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS}[${BEWLY_WIDESCREEN_CONTROLS_HIDDEN_ATTRIBUTE}])
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
      font-family: var(--bew-fonts-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif) !important;
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
      font-size: var(--bew-font-size-caption, 11px) !important;
      font-weight: var(--bew-font-weight-regular, 400) !important;
      line-height: var(--bew-line-height-caption, 14px) !important;
      white-space: nowrap;
    }

    /* The fill control stands in for the hidden native wide / web / full
       buttons; its glyph is sized with the other Bewly controls (videoPlayer.scss). */
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

    body.${BODY_CLASS} .bpx-player-tooltip-item :is(.bpx-player-ctrl-flac-tooltip-icon, .bpx-player-ctrl-dolby-tooltip-icon) {
      background: var(--bew-accent-solid) !important;
      color: var(--bew-on-accent-solid) !important;
      border-radius: var(--bew-pill-radius) !important;
      corner-shape: var(--bew-corner-shape-capsule);
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
      border: var(--bew-hairline, 1px) solid var(--bew-edge-color) !important;
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
      border-radius: var(--bew-pill-radius) !important;
      corner-shape: var(--bew-corner-shape-capsule);
      box-shadow: none !important;
      backdrop-filter: none !important;
      font-size: var(--bew-font-size-caption, 11px) !important;
      line-height: var(--bew-line-height-caption, 14px) !important;
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
      border-radius: var(--bew-pill-radius) !important;
      corner-shape: var(--bew-corner-shape-capsule);
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
      border-radius: var(--bew-surface-radius) !important;
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
      font-family: var(--bew-fonts-ui) !important;
      font-size: var(--bew-font-size-control, 13px) !important;
      font-weight: var(--bew-font-weight-regular, 400) !important;
      line-height: var(--bew-line-height-control, 16px) !important;
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

    /* The block-word and sync buttons: neutral fills with the control tier's
       corners (they sit further in than the popover's corner). */
    ${DANMAKU_SURFACE_SELECTOR} :is(.bpx-player-dm-setting-left-block-add, .bpx-player-dm-setting-left-block-sync) {
      height: var(--bew-control-height-sm) !important;
      border: 0 !important;
      border-radius: var(--bew-interactive-radius) !important;
      corner-shape: var(--bew-corner-shape);
      background: var(--bew-fill-1) !important;
      color: var(--bew-text-1) !important;
      font-size: var(--bew-font-size-control) !important;
      line-height: var(--bew-control-height-sm) !important;
      transition: background-color var(--bew-duration-fast) var(--bew-ease-standard);
    }

    ${DANMAKU_SURFACE_SELECTOR} :is(.bpx-player-dm-setting-left-block-add, .bpx-player-dm-setting-left-block-sync):hover {
      background: var(--bew-fill-2) !important;
    }

    ${DANMAKU_SURFACE_SELECTOR} .bpx-player-dm-setting-box .bui-progress-wrap {
      background: var(--bew-fill-4) !important;
    }

    ${DANMAKU_SURFACE_SELECTOR} .bpx-player-dm-setting-box .bui-progress-bar {
      background: var(--bew-text-1) !important;
      /* Let the thumb's native z-index sit above the sibling tick layer. */
      z-index: auto !important;
    }

    ${DANMAKU_SURFACE_SELECTOR} .bpx-player-dm-setting-box .bui-progress-dot {
      background: var(--bew-elevated-solid) !important;
      border: 1px solid var(--bew-text-1) !important;
      box-shadow: var(--bew-shadow-1) !important;
    }

    ${DANMAKU_SURFACE_SELECTOR} .bpx-player-dm-setting-box .bui-progress-lab {
      background: var(--bew-text-3) !important;
    }

    ${DANMAKU_SURFACE_SELECTOR} .bpx-player-dm-setting-box .bui-progress-step::before {
      background: var(--bew-text-3) !important;
    }

    ${DANMAKU_SURFACE_SELECTOR} .bpx-player-dm-setting-left-more {
      border-top-color: var(--bew-separator-color) !important;
    }

    ${DANMAKU_SURFACE_SELECTOR} :is(.bpx-player-dm-setting-left-dmDensity, .bpx-player-dm-setting-density) {
      background: var(--bew-fill-1) !important;
    }

    ${DANMAKU_SURFACE_SELECTOR} .bpx-player-dm-setting-density.active {
      background: var(--bew-selected-bg) !important;
      color: var(--bew-text-1) !important;
    }

    ${DANMAKU_SURFACE_SELECTOR} .bpx-player-dm-setting-density::after {
      background: var(--bew-separator-color) !important;
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
      line-height: var(--bew-line-height-control, 16px) !important;
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
      line-height: var(--bew-line-height-control, 16px) !important;
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
       shadow or glass; the content sits straight on the page. The tabs head
       the panels, which run down to the window's
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
      padding-inline: var(--bewly-widescreen-page-padding);
      padding-bottom: 0;
      gap: var(--bewly-widescreen-rail-head-inset);
      isolation: isolate;
      /* The column is frosted over the cover's own colours (user-approved
         2026-11-12, deepened 2026-11-13), so it belongs to the video beside
         it: the page's colour lies over the video area's blurred colour field
         and lets --bewly-widescreen-rail-blend of it through; the average
         tone stands in until the field is read. Both are written on the
         column itself (syncCoverTone) and are transparent until read, so the
         column starts as the page. The blend stops where tertiary text still
         reads at 4.5:1 on the darkest cover (light theme, 14%) and on the
         palest (dark theme, 16%). Opaque surfaces in the column lay the flat
         tint, and so does the column itself with frosted glass off. */
      --bewly-widescreen-rail-blend: 14%;
      --bewly-widescreen-rail-tint: color-mix(in srgb, var(${COVER_TONE_PROPERTY}) var(--bewly-widescreen-rail-blend), transparent);
      background:
        linear-gradient(color-mix(in srgb, var(--bew-bg) calc(100% - var(--bewly-widescreen-rail-blend)), transparent) 0 0),
        var(${COVER_FIELD_PROPERTY}, none) center / cover no-repeat,
        linear-gradient(var(${COVER_TONE_PROPERTY}) 0 0);
      color: var(--bew-text-1);
      overflow: hidden;
      pointer-events: auto;
      transition:
        opacity var(--bew-duration-moderate, 300ms) var(--bew-ease-standard, ease),
        ${COVER_TONE_PROPERTY} var(--bew-duration-moderate, 300ms) var(--bew-ease-standard, ease);
    }

    html.dark #${ROOT_ID} .bewly-widescreen-sidebar {
      --bewly-widescreen-rail-blend: 16%;
    }

    :root.disable-frosted-glass #${ROOT_ID} .bewly-widescreen-sidebar {
      background: var(--bewly-widescreen-rail-tint);
    }

    ${reducedMotionCss(`#${ROOT_ID} .bewly-widescreen-sidebar`, 'transition:none;')}

    /* A hairline between the video and the column, the same edge as the
       page rails beside the content. */
    @media (min-width: ${MOBILE_BREAKPOINT + 1}px) {
      #${ROOT_ID} .bewly-widescreen-sidebar {
        border-inline-start: var(--bew-glass-edge-width) solid var(--bew-glass-edge-color);
      }

      #${ROOT_ID}[data-sidebar-position="left"] .bewly-widescreen-sidebar {
        border-inline-start: 0;
        border-inline-end: var(--bew-glass-edge-width) solid var(--bew-glass-edge-color);
      }
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

    /* The rail is flat sections (user-approved 2026-11-12): the info, a
       collection or bangumi's directory, then the recommendations, each
       closed by a hairline that reaches the column's edges with 16px on
       either side of it. The info starts 16px under the head's hairline and
       draws the line below itself; on bangumi the directory's first section
       draws it. */
    #${ROOT_ID} .bewly-widescreen-panel > .bewly-widescreen-sidebar-top {
      position: relative;
      z-index: 1;
      display: flex;
      flex-direction: column;
      gap: var(--bew-space-2);
      box-sizing: border-box !important;
      width: calc(100% + var(--bewly-widescreen-panel-inline) * 2) !important;
      max-width: none !important;
      margin-inline: calc(var(--bewly-widescreen-panel-inline) * -1) !important;
      padding: var(--bew-space-1) var(--bewly-widescreen-panel-inline) var(--bew-space-4);
      border-bottom: var(--bew-hairline, 1px) solid var(--bew-separator-color);
      background: transparent;
    }

    #${ROOT_ID}[data-page-kind="pgc"] .bewly-widescreen-panel > .bewly-widescreen-sidebar-top {
      border-bottom: 0;
    }

    /* Title, metadata, author, actions, description and tags, folding to the
       title: a section on the page like the others, with no surface of its
       own. Its content sits on the rail's content line, like the tabs above. */
    #${ROOT_ID} .bewly-widescreen-info-card {
      display: flex;
      flex-direction: column;
      min-width: 0;
      margin-inline: var(--bew-space-1);
    }

    /* Folded, the card keeps its title and the uploader's row (avatar, name,
       follow and charge, user-specified; on bangumi the poster, series title
       and its channel / follow buttons); the meta line, the message link,
       the signature, the actions and the description close. Each closing
       part animates its height (to and from auto) and the margin that spaces
       it, and is hidden once closed; it clips only while closed or moving, so
       native popovers (share) open out of it. */
    #${ROOT_ID} .bewly-widescreen-info-body,
    #${ROOT_ID} .bewly-widescreen-info-content {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }

    /* A closing part never keeps its content height: as a flex item its
       automatic minimum would hold it open until the fold ends, then let it
       snap shut (the description card did). */
    #${ROOT_ID} .bewly-widescreen-info-card :is(${INFO_FOLDING_PARTS}) {
      interpolate-size: allow-keywords;
      height: auto;
      min-height: 0;
      opacity: 1;
      transition:
        height var(--bew-duration-normal) var(--bew-ease-standard),
        margin var(--bew-duration-normal) var(--bew-ease-standard),
        opacity var(--bew-duration-normal) var(--bew-ease-standard),
        visibility var(--bew-duration-normal) var(--bew-ease-standard);
    }

    #${ROOT_ID} .bewly-widescreen-info-card:is(.is-collapsed, .is-folding) :is(${INFO_FOLDING_PARTS}) {
      overflow: clip;
    }

    #${ROOT_ID} .bewly-widescreen-info-card.is-collapsed :is(${INFO_FOLDING_PARTS}) {
      height: 0 !important;
      margin-block: 0 !important;
      opacity: 0;
      visibility: hidden;
    }

    /* The message link sits beside the name: it only fades. */
    #${ROOT_ID} .bewly-widescreen-info-card.is-collapsed .bewly-widescreen-up-slot .send-msg {
      opacity: 0;
      visibility: hidden;
    }

    #${ROOT_ID} .bewly-widescreen-info-card .bewly-widescreen-up-slot .send-msg {
      transition:
        opacity var(--bew-duration-normal) var(--bew-ease-standard),
        visibility var(--bew-duration-normal) var(--bew-ease-standard);
    }

    /* The rhythm is margins on the parts, so a closed part takes its space
       with it: title to meta 8, meta to author 16, author to actions 12,
       actions to the description 16. */
    #${ROOT_ID} .bewly-widescreen-info-content > .bewly-widescreen-metadata-slot:first-child {
      margin-top: var(--bew-space-2);
    }

    /* The rail's one fold control (disclosureToggle.ts): the info card, a
       collection and each bangumi section. */
    #${ROOT_ID} .${DISCLOSURE_TOGGLE_CLASS} {
      display: grid;
      flex: none;
      place-items: center;
      width: var(--bew-control-item-height);
      height: var(--bew-control-item-height);
      margin: 0;
      padding: 0;
      border: 0;
      border-radius: var(--bew-interactive-radius);
      corner-shape: var(--bew-corner-shape);
      color: var(--bew-text-2);
      background: transparent;
      cursor: pointer;
      transition:
        background-color var(--bew-duration-fast) var(--bew-ease-standard),
        color var(--bew-duration-fast) var(--bew-ease-standard);
    }

    #${ROOT_ID} .${DISCLOSURE_TOGGLE_CLASS}[hidden] {
      display: none;
    }

    #${ROOT_ID} .${DISCLOSURE_TOGGLE_CLASS}:hover {
      color: var(--bew-text-1);
      background: var(--bew-hover-bg);
    }

    #${ROOT_ID} .${DISCLOSURE_TOGGLE_CLASS}:active {
      background: var(--bew-pressed-bg);
    }

    #${ROOT_ID} .${DISCLOSURE_TOGGLE_CLASS}__icon {
      width: var(--bew-icon-size-sm);
      height: var(--bew-icon-size-sm);
      rotate: 180deg;
      transition: rotate var(--bew-duration-normal) var(--bew-ease-standard);
    }

    /* Open, the chevron points the way the content folds (up); folded, the
       way it opens (down). */
    #${ROOT_ID} .${DISCLOSURE_TOGGLE_CLASS}[aria-expanded="false"] > .${DISCLOSURE_TOGGLE_CLASS}__icon {
      rotate: 0deg;
    }

    /* Centred on the title's first line. */
    #${ROOT_ID} .bewly-widescreen-toolbar > .${DISCLOSURE_TOGGLE_CLASS} {
      margin-block: calc((var(--bew-line-height-heading) - var(--bew-control-item-height)) / 2);
    }

    ${reducedMotionCss(`#${ROOT_ID} :is(.bewly-widescreen-info-card :is(${INFO_FOLDING_PARTS}, .send-msg, .bewly-widescreen-author-actions), .${DISCLOSURE_TOGGLE_CLASS}__icon)`, 'transition:none;')}

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
      color: var(--bew-text-1);
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
      padding: 0 !important;
      border: 0 !important;
      overflow: visible !important;
    }

    #${ROOT_ID}[data-page-kind="pgc"] [class*="mediainfo_mediaCover"] {
      flex: 0 0 calc(var(--bew-space-12) * 1.5) !important;
      width: calc(var(--bew-space-12) * 1.5) !important;
      height: auto !important;
      aspect-ratio: 3 / 4;
      position: relative;
      margin: 0 !important;
      border-radius: var(--bew-thumb-radius) !important;
      corner-shape: var(--bew-corner-shape);
      overflow: hidden;
      box-shadow: var(--bew-media-shadow);
    }

    /* The poster's media hairline, drawn over the picture like a cover's. */
    #${ROOT_ID}[data-page-kind="pgc"] [class*="mediainfo_mediaCover"]::after {
      content: "";
      position: absolute;
      inset: 0;
      border: var(--bew-hairline, 1px) solid var(--bew-media-edge-color);
      border-radius: inherit;
      corner-shape: inherit;
      pointer-events: none;
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
      font-weight: var(--bew-font-weight-regular) !important;
      white-space: normal !important;
    }

    /* The play, danmaku and follow counts are the card's meta line, as on a
       video page: caption text-2, tabular. */
    #${ROOT_ID}[data-page-kind="pgc"] :is([class*="mediainfo_statRow"], [class*="mediainfo_statUnit"]) {
      color: var(--bew-text-2) !important;
      font-size: var(--bew-font-size-caption) !important;
      line-height: var(--bew-line-height-caption) !important;
      font-variant-numeric: tabular-nums;
    }

    #${ROOT_ID}[data-page-kind="pgc"] [class*="mediainfo_statRow"] {
      margin-bottom: var(--bew-space-2) !important;
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

    /* The synopsis reads as body text in Bilibili's two-line clamp (its
       geometry and event root stay). "Expand" is the description's own
       toggle, as on a video page: text-2, brightening on hover. */
    #${ROOT_ID}[data-page-kind="pgc"] p[class*="mediainfo_content"] {
      color: var(--bew-text-2) !important;
      font-size: var(--bew-font-size-body) !important;
    }

    #${ROOT_ID}[data-page-kind="pgc"] [class*="mediainfo_ellipsis"] {
      color: var(--bew-text-2) !important;
      background: linear-gradient(var(--bewly-widescreen-rail-tint) 0 0), var(--bew-bg) !important;
      font-size: var(--bew-font-size-body) !important;
      cursor: pointer;
      transition: color var(--bew-duration-fast) var(--bew-ease-standard);
    }

    #${ROOT_ID}[data-page-kind="pgc"] [class*="mediainfo_ellipsis"]:hover {
      color: var(--bew-text-1) !important;
    }

    /* Rating, uploader and the viewer's own stars share one row. The score is
       a key number (text-1, tabular), not an accent. The row's parts differ
       in height (two-line score, avatar, stars), so they sit on its last text
       line (user-specified: bottom-aligned, not centred). */
    #${ROOT_ID}[data-page-kind="pgc"] [class*="mediainfo_bottomBar"] {
      align-items: last baseline !important;
      gap: var(--bew-space-2) var(--bew-space-4) !important;
    }

    #${ROOT_ID}[data-page-kind="pgc"] [class*="mediainfo_score"] {
      color: var(--bew-text-1) !important;
      font-size: var(--bew-font-size-heading) !important;
      line-height: var(--bew-line-height-heading) !important;
      font-variant-numeric: tabular-nums;
    }

    #${ROOT_ID}[data-page-kind="pgc"] [class*="mediainfo_suffix"] {
      margin-left: var(--bew-space-0-5) !important;
      color: var(--bew-text-2) !important;
      font-size: var(--bew-font-size-caption) !important;
    }

    #${ROOT_ID}[data-page-kind="pgc"] [class*="mediainfo_ratingText"] {
      color: var(--bew-text-3) !important;
      font-size: var(--bew-font-size-caption) !important;
      line-height: var(--bew-line-height-caption) !important;
    }

    #${ROOT_ID}[data-page-kind="pgc"] [class*="upinfo_upInfoCard"] {
      margin: 0 !important;
      padding: 0 !important;
      background: transparent !important;
    }

    #${ROOT_ID}[data-page-kind="pgc"] [class*="upinfo_upName"] {
      color: var(--bew-text-1) !important;
      font-size: var(--bew-font-size-control) !important;
    }

    #${ROOT_ID}[data-page-kind="pgc"] [class*="upinfo_btn_follow"] {
      color: var(--bew-theme-foreground) !important;
      font-size: var(--bew-font-size-control) !important;
    }

    #${ROOT_ID}[data-page-kind="pgc"] [class*="score_score"] {
      margin-left: auto !important;
      color: var(--bew-text-2) !important;
      font-size: var(--bew-font-size-caption) !important;
    }

    /* The stars' label gives their row its baseline (a flex row would take
       the last star's bottom), on the stars' 16px line so it stays centred
       beside them. */
    #${ROOT_ID}[data-page-kind="pgc"] [class*="score_scoreText"] {
      align-self: last baseline;
      line-height: var(--bew-line-height-control) !important;
    }

    /* The channel link is a neutral chip; following the series is the
       card's one accent until it is followed, then neutral like "followed". */
    #${ROOT_ID}[data-page-kind="pgc"] :is([class*="mediainfo_btnHome"], [class*="follow_btnFollow"]) {
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      gap: var(--bew-space-1) !important;
      box-sizing: border-box !important;
      height: var(--bew-control-height-sm) !important;
      margin: 0 !important;
      padding: 0 var(--bew-space-3) !important;
      border: 0 !important;
      border-radius: var(--bew-interactive-radius) !important;
      corner-shape: var(--bew-corner-shape);
      color: var(--bew-text-1) !important;
      background: var(--bew-fill-1) !important;
      font-size: var(--bew-font-size-control) !important;
      line-height: var(--bew-line-height-control) !important;
      transition: background-color var(--bew-duration-fast) var(--bew-ease-standard);
    }

    #${ROOT_ID}[data-page-kind="pgc"] :is([class*="mediainfo_btnHome"], [class*="follow_btnFollow"]):hover {
      background: var(--bew-fill-2) !important;
    }

    #${ROOT_ID}[data-page-kind="pgc"] [class*="follow_btnFollow"]:not([class*="follow_followed"]) {
      color: var(--bew-on-accent-solid) !important;
      background: var(--bew-accent-solid) !important;
    }

    /* Followed, the button reads as the series' status in the accent
       (user-specified): its icon and label take the theme foreground, and
       the label is the status its menu marks current (想看 / 观看中 / 已观看,
       data-bewly-follow-status, videoInfo.ts) instead of Bilibili's
       "已追剧", which turns into the wider "取消追剧" on hover. */
    #${ROOT_ID}[data-page-kind="pgc"] [class*="follow_btnFollow"][class*="follow_followed"] {
      color: var(--bew-theme-foreground) !important;
    }

    #${ROOT_ID}[data-page-kind="pgc"] [data-bewly-follow] > svg {
      flex: none;
      width: var(--bew-icon-size-sm) !important;
      height: var(--bew-icon-size-sm) !important;
    }

    #${ROOT_ID}[data-page-kind="pgc"] [data-bewly-follow] > svg path {
      fill: currentColor !important;
    }

    #${ROOT_ID}[data-page-kind="pgc"] [data-bewly-follow-status] > [class*="follow_followText"] {
      display: none !important;
    }

    #${ROOT_ID}[data-page-kind="pgc"] [data-bewly-follow-status]::after {
      content: attr(data-bewly-follow-status);
    }

    #${ROOT_ID}[data-page-kind="pgc"] [class*="mediainfo_btnText"],
    #${ROOT_ID}[data-page-kind="pgc"] [class*="follow_followText"] {
      margin: 0 !important;
      color: inherit !important;
      font-size: inherit !important;
      font-weight: var(--bew-font-weight-regular) !important;
    }

    /* Metadata to actions is 16, as on a video page. */
    #${ROOT_ID}[data-page-kind="pgc"] .bewly-widescreen-author-actions > .bewly-widescreen-action-slot {
      margin-top: 0;
    }

    #${ROOT_ID}[data-page-kind="pgc"] [class*="share_shareMenu"] {
      color: var(--bew-text-1) !important;
      background: var(--bew-elevated-solid) !important;
      border-radius: var(--bew-surface-radius) !important;
      backdrop-filter: none !important;
      z-index: 2;
    }

    /* The follow menu hangs under its button, right edges flush, so it does
       not move with the button's width, on the player popover surface. Its
       box starts at the button's edge and pads the gap, so the pointer stays
       over the button on its way in. It fades and drops in (fast); nothing
       in it moves sideways. */
    #${ROOT_ID}[data-page-kind="pgc"] [data-bewly-follow] > [class*="follow_followOptions"] {
      top: 100% !important;
      right: 0 !important;
      left: auto !important;
      z-index: 2;
      width: max-content !important;
      height: auto !important;
      padding: var(--bew-space-1) 0 0 !important;
      background: transparent !important;
      border: 0 !important;
      border-radius: 0 !important;
      box-shadow: none !important;
      translate: 0 calc(var(--bew-space-1) * -1);
      transition:
        opacity var(--bew-duration-fast) var(--bew-ease-standard),
        translate var(--bew-duration-fast) var(--bew-ease-standard),
        visibility var(--bew-duration-fast) step-end !important;
    }

    #${ROOT_ID}[data-page-kind="pgc"] [data-bewly-follow] > [class*="follow_shown"] {
      translate: none;
      transition:
        opacity var(--bew-duration-fast) var(--bew-ease-standard),
        translate var(--bew-duration-fast) var(--bew-ease-standard),
        visibility 0s !important;
    }

    #${ROOT_ID}[data-page-kind="pgc"] [data-bewly-follow] ul {
      ${PLAYER_POPOVER_SURFACE}
      display: flex !important;
      flex-direction: column;
      margin: 0 !important;
      padding: var(--bew-popover-padding) !important;
      list-style: none;
    }

    #${ROOT_ID}[data-page-kind="pgc"] [data-bewly-follow] li {
      display: flex !important;
      align-items: center;
      box-sizing: border-box;
      height: var(--bew-control-height-sm) !important;
      margin: 0 !important;
      padding: 0 var(--bew-space-3) !important;
      border-radius: var(--bew-interactive-radius) !important;
      corner-shape: var(--bew-corner-shape);
      color: var(--bew-text-1) !important;
      background: transparent;
      font-size: var(--bew-font-size-control) !important;
      line-height: var(--bew-line-height-control) !important;
      white-space: nowrap;
      cursor: pointer;
      transition: background-color var(--bew-duration-fast) var(--bew-ease-standard);
    }

    #${ROOT_ID}[data-page-kind="pgc"] [data-bewly-follow] li:hover {
      background: var(--bew-hover-bg);
    }

    /* The series' current status (Bilibili disables it) is the selected row. */
    #${ROOT_ID}[data-page-kind="pgc"] [data-bewly-follow] li[class*="follow_disabled"] {
      background: var(--bew-selected-bg);
      cursor: default;
    }

    ${reducedMotionCss(`#${ROOT_ID}[data-page-kind="pgc"] [data-bewly-follow] > [class*="follow_followOptions"]`, 'translate: none;')}

    /* Bangumi has no uploader row of its own (it is in the media block), so
       folded, the actions' spacing closes with them. */
    #${ROOT_ID}[data-page-kind="pgc"] .bewly-widescreen-author-actions {
      display: block;
      transition: margin var(--bew-duration-normal) var(--bew-ease-standard);
    }

    #${ROOT_ID}[data-page-kind="pgc"] .bewly-widescreen-info-card.is-collapsed .bewly-widescreen-author-actions {
      margin-top: 0;
    }

    /* Bangumi's actions read like a video's: like, coin, collect, share and
       watch-together are equal neutral chips filling one row, space-1
       apart, and the "more" menu is a square chip at its end. Counts roll
       to their action on hover (actionRolls.ts). */
    #${ROOT_ID}[data-page-kind="pgc"] .bewly-widescreen-action-slot .toolbar {
      display: flex !important;
      align-items: stretch !important;
      gap: var(--bew-space-1) !important;
      width: 100% !important;
      height: auto !important;
      margin: 0 !important;
      padding: 0 !important;
    }

    #${ROOT_ID}[data-page-kind="pgc"] .bewly-widescreen-action-slot .toolbar-left {
      display: flex !important;
      flex: 1 1 0 !important;
      flex-wrap: nowrap !important;
      gap: var(--bew-space-1) !important;
      width: auto !important;
      min-width: min-content !important;
      height: auto !important;
      margin: 0 !important;
    }

    #${ROOT_ID}[data-page-kind="pgc"] .bewly-widescreen-action-slot :is(.toolbar-left, .toolbar-right) > span {
      display: inline-flex !important;
      flex: 1 1 0 !important;
      align-items: center !important;
      justify-content: center !important;
      gap: var(--bew-space-1) !important;
      position: relative !important;
      box-sizing: border-box !important;
      min-width: min-content !important;
      height: var(--bew-control-height) !important;
      margin: 0 !important;
      padding: 0 var(--bew-space-2) !important;
      border-radius: var(--bew-interactive-radius) !important;
      corner-shape: var(--bew-corner-shape);
      color: var(--bew-text-2) !important;
      background: var(--bew-fill-1) !important;
      font-size: var(--bew-font-size-control) !important;
      line-height: var(--bew-line-height-control) !important;
      white-space: nowrap !important;
      cursor: pointer;
      transition:
        color var(--bew-duration-fast) var(--bew-ease-standard),
        background-color var(--bew-duration-fast) var(--bew-ease-standard),
        scale var(--bew-duration-fast) var(--bew-ease-standard);
    }

    #${ROOT_ID}[data-page-kind="pgc"] .bewly-widescreen-action-slot :is(.toolbar-left, .toolbar-right) > span:hover {
      color: var(--bew-text-1) !important;
      background: var(--bew-fill-2) !important;
    }

    #${ROOT_ID}[data-page-kind="pgc"] .bewly-widescreen-action-slot :is(.toolbar-left, .toolbar-right) > span:active {
      scale: 0.97;
    }

    /* Liked, coined and collected: as on a video page, the selected fill with
       the icon and label in the theme foreground, hovered or not. */
    #${ROOT_ID}[data-page-kind="pgc"] .bewly-widescreen-action-slot .toolbar-left > span.on {
      color: var(--bew-theme-foreground) !important;
      background: var(--bew-selected-bg) !important;
    }

    /* Share and watch-together wrap their icon and text once more. */
    #${ROOT_ID}[data-page-kind="pgc"] .bewly-widescreen-action-slot .toolbar-left > span > :is(span, div) {
      display: inline-flex !important;
      align-items: center !important;
      gap: var(--bew-space-1) !important;
      margin: 0 !important;
    }

    #${ROOT_ID}[data-page-kind="pgc"] .bewly-widescreen-action-slot .toolbar-right {
      display: flex !important;
      flex: none !important;
      margin: 0 !important;
    }

    #${ROOT_ID}[data-page-kind="pgc"] .bewly-widescreen-action-slot .toolbar-right > span {
      flex: none !important;
      width: var(--bew-control-height) !important;
      padding: 0 !important;
    }

    #${ROOT_ID}[data-page-kind="pgc"] .bewly-widescreen-action-slot .icon {
      display: inline-grid !important;
      place-items: center;
      flex: none !important;
      width: var(--bew-icon-size-md) !important;
      height: var(--bew-icon-size-md) !important;
      margin: 0 !important;
      color: currentColor !important;
      font-size: var(--bew-icon-size-md) !important;
    }

    #${ROOT_ID}[data-page-kind="pgc"] .bewly-widescreen-action-slot .icon svg {
      width: 100% !important;
      height: 100% !important;
    }

    #${ROOT_ID}[data-page-kind="pgc"] .bewly-widescreen-action-slot .info-text {
      margin: 0 !important;
      color: inherit !important;
      font-size: inherit !important;
      line-height: inherit !important;
    }

    /* Bangumi's "more" menu (watch on phone, watch later) hangs below its
       chip, right edges flush, above the shell, on the player popover surface. */
    .${RAISED_MORE_MENU_CLASS} {
      z-index: calc(var(--bew-z-widescreen) + 2) !important;
      left: auto !important;
      right: var(--bewly-more-menu-right) !important;
    }

    .${RAISED_MORE_MENU_CLASS} [class*="moreTool_popupWrap"] {
      ${PLAYER_POPOVER_SURFACE}
      padding: var(--bew-popover-padding) !important;
    }

    .${RAISED_MORE_MENU_CLASS} [class*="moreTool_toolItem__"] {
      align-items: center !important;
      gap: var(--bew-space-2) !important;
      height: var(--bew-control-height-sm) !important;
      padding: 0 var(--bew-space-2) !important;
      border-radius: var(--bew-interactive-radius) !important;
      corner-shape: var(--bew-corner-shape);
      color: var(--bew-text-1) !important;
      background: transparent !important;
      font-size: var(--bew-font-size-control) !important;
      line-height: var(--bew-line-height-control) !important;
    }

    .${RAISED_MORE_MENU_CLASS} [class*="moreTool_toolItem__"]:hover {
      background: var(--bew-hover-bg) !important;
    }

    .${RAISED_MORE_MENU_CLASS} [class*="moreTool_toolItemIcon"] {
      display: grid !important;
      place-items: center;
      flex: none;
      width: var(--bew-icon-size-sm) !important;
      height: var(--bew-icon-size-sm) !important;
      margin: 0 !important;
      padding: 0 !important;
    }

    /* The menu's only graphics are its items' icons. */
    .${RAISED_MORE_MENU_CLASS} svg {
      width: 100% !important;
      height: 100% !important;
    }

    /* Watch-together is a small panel under its chip on the player popover
       surface: the series title above its two entry cards (Bilibili's own
       artwork), not one wide row. Bilibili centres it under the chip; where
       that crosses the window's edge, actionEffects.ts moves it back inside
       (--bewly-popover-fit-x) before it paints. Its box starts at the chip's
       edge and pads the gap, so the pointer stays over the chip on the way
       in. It fades in; Bilibili's own "transition: all" would also slide
       that correction. */
    #${ROOT_ID}[data-page-kind="pgc"] .bewly-widescreen-action-slot [class*="WatchInfo_watch_more"] {
      top: 100% !important;
      flex-direction: column !important;
      align-items: stretch !important;
      gap: 0 !important;
      width: max-content !important;
      height: auto !important;
      padding: var(--bew-space-1) 0 0 !important;
      background: transparent !important;
      border: 0 !important;
      box-shadow: none !important;
      color: var(--bew-text-1) !important;
      white-space: normal !important;
      cursor: default;
      translate: var(--bewly-popover-fit-x, 0px) 0;
      transition: opacity var(--bew-duration-fast) var(--bew-ease-standard) !important;
    }

    @starting-style {
      #${ROOT_ID}[data-page-kind="pgc"] .bewly-widescreen-action-slot [class*="WatchInfo_watch_more"] {
        opacity: 0;
      }
    }

    #${ROOT_ID}[data-page-kind="pgc"] .bewly-widescreen-action-slot [class*="WatchInfo_watch_more"]::before {
      content: "";
      position: absolute;
      inset: var(--bew-space-1) 0 0;
      z-index: -1;
      ${PLAYER_POPOVER_SURFACE}
    }

    #${ROOT_ID}[data-page-kind="pgc"] .bewly-widescreen-action-slot [class*="WatchInfo_title"] {
      align-self: stretch !important;
      width: auto !important;
      margin: 0 !important;
      padding: var(--bew-space-4) var(--bew-space-4) var(--bew-space-3) !important;
      color: var(--bew-text-1) !important;
      font-size: var(--bew-font-size-title) !important;
      line-height: var(--bew-line-height-title) !important;
      text-align: start !important;
    }

    #${ROOT_ID}[data-page-kind="pgc"] .bewly-widescreen-action-slot [class*="WatchInfo_action_wrap"] {
      display: flex !important;
      gap: var(--bew-space-2) !important;
      margin: 0 !important;
      padding: 0 var(--bew-space-4) var(--bew-space-4) !important;
    }

    #${ROOT_ID}[data-page-kind="pgc"] .bewly-widescreen-action-slot [class*="WatchInfo_watch_action"] {
      display: flex !important;
      flex-direction: column;
      justify-content: center;
      gap: var(--bew-space-1);
      box-sizing: border-box !important;
      margin: 0 !important;
      padding: 0 var(--bew-space-3) !important;
      border-radius: var(--bew-thumb-radius) !important;
      corner-shape: var(--bew-corner-shape);
      cursor: pointer;
    }

    #${ROOT_ID}[data-page-kind="pgc"] .bewly-widescreen-action-slot [class*="WatchInfo_main_title"] {
      margin: 0 !important;
      font-size: var(--bew-font-size-subheading) !important;
      line-height: var(--bew-line-height-subheading) !important;
    }

    #${ROOT_ID}[data-page-kind="pgc"] .bewly-widescreen-action-slot [class*="WatchInfo_sub_title"] {
      margin: 0 !important;
      font-size: var(--bew-font-size-caption) !important;
      line-height: var(--bew-line-height-caption) !important;
    }

    /* Icons follow the chip's text: neutral, or the theme foreground once used. */
    #${ROOT_ID}[data-page-kind="pgc"] .bewly-widescreen-action-slot svg.icon {
      fill: currentColor !important;
    }

    /* Bilibili's share popover is wider than the column and opens 200px left
       of the share chip, past the window's edge. It hangs from the action
       row instead, flush with its right end. */
    #${ROOT_ID}[data-page-kind="pgc"] .bewly-widescreen-action-slot .toolbar-left > .share {
      position: static !important;
    }

    #${ROOT_ID}[data-page-kind="pgc"] .bewly-widescreen-action-slot [class*="Share_share__"] {
      left: auto !important;
      right: 0 !important;
    }

    /* The like / coin / collect / share counts are drawn by the rollers. */
    #${ROOT_ID}[data-page-kind="pgc"] .bewly-widescreen-action-slot :is(.like, .coin, .favorite, .share) .info-text {
      display: none !important;
    }

    /* The triple-press ring circles the chip's icon (actionEffects.ts). */
    #${ROOT_ID}[data-page-kind="pgc"] .bewly-widescreen-action-slot .ringProgress {
      position: absolute !important;
      inset: auto !important;
      left: var(--bewly-action-anchor-x, 50%) !important;
      top: var(--bewly-action-anchor-y, 50%) !important;
      margin: 0 !important;
      translate: -50% -50% !important;
      pointer-events: none !important;
    }

    #${ROOT_ID}[data-page-kind="pgc"] .bewly-widescreen-action-slot :is(.like, .coin, .favorite):is(.on, .active) {
      color: var(--bew-text-1) !important;
      background: var(--bew-selected-bg) !important;
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
      min-width: 0;
      margin-top: var(--bew-space-4);
    }

    #${ROOT_ID} .bewly-widescreen-author-actions > .bewly-widescreen-action-slot {
      margin-top: var(--bew-space-3);
    }

    #${ROOT_ID} .bewly-widescreen-info-content > .bewly-widescreen-description-card {
      margin-top: var(--bew-space-4);
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
      color: var(--bew-text-2);
      background: var(--bew-fill-1);
      border-radius: var(--bew-interactive-radius);
      corner-shape: var(--bew-corner-shape);
      font-size: var(--bew-font-size-control);
      font-weight: var(--bew-font-weight-regular);
      line-height: var(--bew-line-height-control);
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

    /* Truncated fallback text fades at its end (PLAYBACK_TEXT_CSS). */
    #${ROOT_ID} .bewly-widescreen-fallback-stat-label {
      min-width: 0;
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
      color: var(--bew-text-1);
      border-radius: var(--bew-interactive-radius);
      corner-shape: var(--bew-corner-shape);
      text-decoration: none;
      transition:
        color var(--bew-duration-fast) var(--bew-ease-standard),
        background-color var(--bew-duration-fast) var(--bew-ease-standard);
    }

    #${ROOT_ID} .bewly-widescreen-fallback-owner-link:hover {
      color: var(--bew-theme-foreground);
      background: var(--bew-fill-2);
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
      font-size: var(--bew-font-size-title);
      font-weight: var(--bew-font-weight-regular);
      line-height: var(--bew-line-height-title);
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
      color: var(--bew-text-1);
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

    #${ROOT_ID} .bewly-widescreen-tags-slot .tag.not-btn-tag {
      display: block !important;
    }

    #${ROOT_ID} .bewly-widescreen-tags-slot .tag:has(> .show-more-btn) {
      display: none !important;
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
      border-radius: var(--bew-pill-radius) !important;
      corner-shape: var(--bew-corner-shape-capsule);
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
      border-radius: var(--bew-pill-radius);
      corner-shape: var(--bew-corner-shape-capsule);
    }

    #${ROOT_ID} .bewly-widescreen-description-slot.is-empty {
      display: none;
    }

    #${ROOT_ID} .bewly-widescreen-description-slot .video-desc-container {
      width: 100% !important;
      margin: 0 !important;
    }

    /* Reading text: the description and the comments share the body size on
       the reading line height (13/20). */
    #${ROOT_ID} .bewly-widescreen-description-slot .basic-desc-info {
      height: auto !important;
      color: var(--bew-text-2) !important;
      font-size: var(--bew-font-size-body, 13px) !important;
      line-height: var(--bew-line-height-reading, 20px) !important;
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
      height: calc(var(--bew-line-height-reading, 20px) * 2) !important;
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
      color: var(--bew-text-2) !important;
      font-size: var(--bew-font-size-control, 13px) !important;
      line-height: var(--bew-line-height-control, 16px) !important;
    }

    #${ROOT_ID} .bewly-widescreen-description-slot a {
      color: var(--bew-theme-foreground) !important;
    }

    #${ROOT_ID} .bewly-widescreen-fallback-description {
      margin: 0;
      color: var(--bew-text-2);
      font-size: var(--bew-font-size-body);
      line-height: var(--bew-line-height-reading);
      overflow-wrap: anywhere;
      white-space: pre-wrap;
      word-break: break-word;
    }

    #${ROOT_ID} .bewly-widescreen-fallback-category {
      display: inline-flex;
      align-items: center;
      min-height: var(--bew-control-height-sm);
      padding: 0 var(--bew-space-3);
      color: var(--bew-text-2);
      background: var(--bew-fill-1);
      border-radius: var(--bew-pill-radius);
      corner-shape: var(--bew-corner-shape-capsule);
      font-size: var(--bew-font-size-caption);
      font-weight: var(--bew-font-weight-regular);
      line-height: var(--bew-line-height-caption);
    }

    #${ROOT_ID} .bewly-widescreen-description-toggle {
      display: block;
      margin-top: var(--bew-space-1);
      padding: 0;
      border: 0;
      color: var(--bew-text-2);
      background: transparent;
      cursor: pointer;
      font: inherit;
      font-size: var(--bew-font-size-control, 13px);
      line-height: var(--bew-line-height-control, 16px);
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

    /* The five chips (like, coin, collect, share, watch later) fill one row
       in equal widths, space-1 apart (user-specified). A chip never shrinks
       below its content: when one needs more (share's label grows on hover),
       it takes it from the others. The left group holds four chips and the
       three gaps between them, the right group the fifth chip, so every chip
       gets the same share of the free space. */
    #${ROOT_ID} .bewly-widescreen-action-slot :is(.video-toolbar-container, #arc_toolbar_report) {
      --bewly-action-gap: var(--bew-space-1);
      flex-wrap: wrap !important;
      align-items: stretch !important;
      gap: var(--bew-space-2) var(--bewly-action-gap);
    }

    #${ROOT_ID} .bewly-widescreen-action-slot .video-toolbar-left {
      display: flex !important;
      flex-wrap: wrap;
      flex: 4 1 calc(var(--bewly-action-gap) * 3) !important;
      row-gap: var(--bew-space-2);
      width: auto !important;
      min-width: min-content !important;
      overflow: visible !important;
    }

    #${ROOT_ID} .bewly-widescreen-action-slot .video-toolbar-left-main {
      display: flex !important;
      flex: 1 1 100%;
      flex-wrap: nowrap;
      gap: var(--bewly-action-gap);
      align-items: stretch !important;
      width: auto !important;
      min-width: min-content !important;
      overflow: visible !important;
    }

    #${ROOT_ID} .bewly-widescreen-action-slot .video-owner-state {
      flex: 1 1 100%;
      display: flex !important;
      flex-wrap: wrap !important;
      justify-content: flex-start !important;
      gap: var(--bew-space-2) !important;
      width: auto !important;
      margin: var(--bew-space-2) 0 0 !important;
    }

    #${ROOT_ID} .bewly-widescreen-action-slot .video-owner-state-item {
      margin: 0 !important;
    }

    #${ROOT_ID} .bewly-widescreen-action-slot .toolbar-left-item-wrap {
      display: flex !important;
      flex: 1 1 0 !important;
      position: relative !important;
      min-width: min-content !important;
      width: auto !important;
      margin: 0 !important;
      overflow: visible !important;
    }

    #${ROOT_ID} .bewly-widescreen-action-slot .video-toolbar-left-item,
    #${ROOT_ID} .bewly-widescreen-action-slot .video-toolbar-right-item,
    #${ROOT_ID} .bewly-widescreen-action-slot .bewly-watch-later-btn {
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      gap: var(--bew-space-1) !important;
      position: relative !important;
      flex: 1 1 auto !important;
      width: auto !important;
      min-width: min-content !important;
      margin: 0 !important;
      padding: 0 var(--bew-space-2) !important;
      border: 0 !important;
      border-radius: var(--bew-interactive-radius) !important;
      corner-shape: var(--bew-corner-shape);
      color: var(--bew-text-2) !important;
      /* Neutral chips like charge and the tags; the accent stays on follow. */
      background: var(--bew-fill-1) !important;
      font-size: var(--bew-font-size-control, 13px) !important;
      line-height: var(--bew-line-height-control, 16px) !important;
      font-weight: var(--bew-font-weight-regular) !important;
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
      flex: 1 1 auto !important;
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

    /* Animation containers are tagged by actionEffects (ACTION_ANIMATION_ATTRIBUTE). */
    #${ROOT_ID} .bewly-widescreen-action-slot [${ACTION_ANIMATION_ATTRIBUTE}] svg {
      width: 100% !important;
      height: 100% !important;
      filter: var(--bew-action-animation-filter, none) !important;
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
      flex: 1 1 auto !important;
    }

    /* Bilibili turns the share label and icon the theme colour on hover; the
       chip lifts its text to text-1 like the others. */
    #${ROOT_ID} .bewly-widescreen-action-slot .video-share {
      color: inherit !important;
    }

    /* Each chip's count and, on hover, its action name share one line that
       rolls like a wheel (actionRolls.ts). Bilibili's own labels stay as
       the count's source but are not drawn; share's would swap in "click to
       copy" with both texts showing at once. The roller's width springs to
       its text and clips what is outside it. */
    #${ROOT_ID} .bewly-widescreen-action-slot :is(.video-like-info, .video-coin-info, .video-fav-info, .video-share-info) {
      display: none !important;
    }

    #${ROOT_ID} .bewly-widescreen-action-slot .${ACTION_ROLL_CLASS} {
      display: inline-grid;
      grid-template-columns: 100%;
      flex: none;
      overflow: clip;
      white-space: nowrap;
      font-variant-numeric: tabular-nums;
    }

    #${ROOT_ID} .bewly-widescreen-action-slot .${ACTION_ROLL_CLASS}__face {
      grid-area: 1 / 1;
      justify-self: center;
    }

    #${ROOT_ID} .bewly-widescreen-action-slot .video-toolbar-left-item:hover,
    #${ROOT_ID} .bewly-widescreen-action-slot .video-toolbar-right-item:hover {
      color: var(--bew-text-1) !important;
      background: var(--bew-fill-2) !important;
    }

    /* Liked, coined, collected and saved chips sit on the column's selected
       fill, their icon and label in the theme foreground (user-specified: the
       state must show, like a followed series on bangumi pages). */
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
      color: var(--bew-theme-foreground) !important;
      fill: var(--bew-theme-foreground) !important;
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

    #${ROOT_ID} .bewly-widescreen-action-slot .video-toolbar-right {
      display: flex !important;
      align-items: stretch !important;
      flex: 1 1 0 !important;
      min-width: min-content !important;
      margin: 0 !important;
      padding: 0 !important;
      background: transparent !important;
      border: 0 !important;
      box-shadow: none !important;
    }

    #${ROOT_ID} .bewly-widescreen-action-slot .video-toolbar-right > :not(.bewly-watch-later-btn) {
      display: none !important;
    }

    /* Watch later reads like the others: its icon, then its name. */
    #${ROOT_ID} .bewly-widescreen-action-slot .bewly-watch-later-btn {
      display: inline-flex !important;
      flex: 1 1 auto !important;
      width: auto !important;
      height: var(--bew-control-height, 36px) !important;
    }

    #${ROOT_ID} .bewly-widescreen-action-slot .bewly-watch-later-btn__label {
      display: inline !important;
    }

    #${ROOT_ID} .bewly-widescreen-action-slot .video-toolbar-right-item.bewly-watch-later-btn:hover {
      color: var(--bew-text-1) !important;
    }

    /* Saved stays in the theme foreground when hovered, like the other used chips. */
    #${ROOT_ID} .bewly-widescreen-action-slot .video-toolbar-right-item.bewly-watch-later-btn.is-active:hover {
      color: var(--bew-theme-foreground) !important;
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
      font-weight: var(--bew-font-weight-regular) !important;
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
      font-weight: var(--bew-font-weight-regular) !important;
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

    /* Like the settings' track selectors (Logo style), but the track itself is
       clear: no fill and no outline (user-specified), only the sliding plate.
       The rail's tabs are rounded rectangles (interactive radius, the --rect
       variant) one step down (the small control height) and exactly as tall
       as their track, no inset between them (user-specified 2026-11-05). They
       sit on the column head's glass band (playbackRailHeadGlass). */
    #${ROOT_ID} :is(.bewly-widescreen-tabs, .bewly-widescreen-danmaku-views) {
      --bew-segment-surface-background: transparent;
      --bew-control-border-color: transparent;
    }

    #${ROOT_ID} .bewly-widescreen-tabs {
      --bew-control-height: var(--bewly-widescreen-rail-tabs-height);
      --bew-control-padding: 0px;
    }

    #${ROOT_ID} .bewly-widescreen-tab {
      gap: var(--bew-space-1);
    }

    #${ROOT_ID} .bewly-widescreen-tab__icon {
      flex: none;
      width: var(--bew-icon-size-sm);
      height: var(--bew-icon-size-sm);
    }

    /* The count is secondary to the tab's name. */
    #${ROOT_ID} .bewly-widescreen-tab__count {
      color: var(--bew-text-3);
      font-variant-numeric: tabular-nums;
    }

    #${ROOT_ID} .bewly-widescreen-tab__count:empty {
      display: none;
    }

    /* The head is clear glass, so what scrolls under it decides each tab's
       colour: black or white by the picture or surface actually beneath it
       (railHeadTone.ts, user-specified 2026-11-10), whatever the theme. The
       tab list carries the selected tab's, for the plate under it. Without a
       mark (nothing under the head) the theme's own colours stay. */
    #${ROOT_ID} .bewly-widescreen-tab[${RAIL_HEAD_TONE_ATTRIBUTE}] {
      --bew-segment-item-color: color-mix(in srgb, var(--bewly-rail-head-fg) 80%, transparent);
      --bew-segment-item-hover-color: var(--bewly-rail-head-fg);
      --bew-segment-item-hover-current-color: var(--bewly-rail-head-fg);
      --bew-segment-item-active-color: var(--bewly-rail-head-fg);
      --bew-segment-item-current-color: var(--bewly-rail-head-fg);
      --bew-text-3: color-mix(in srgb, var(--bewly-rail-head-fg) 70%, transparent);
    }

    #${ROOT_ID} :is(.bewly-widescreen-tabs, .bewly-widescreen-tab)[${RAIL_HEAD_TONE_ATTRIBUTE}="dark"] {
      --bewly-rail-head-fg: #fff;
    }

    #${ROOT_ID} :is(.bewly-widescreen-tabs, .bewly-widescreen-tab)[${RAIL_HEAD_TONE_ATTRIBUTE}="light"] {
      --bewly-rail-head-fg: #000;
    }

    #${ROOT_ID} .bewly-widescreen-tabs[${RAIL_HEAD_TONE_ATTRIBUTE}] {
      --bew-liquid-indicator-bg: color-mix(in srgb, var(--bewly-rail-head-fg) 14%, transparent);
    }

    #${ROOT_ID} .bewly-widescreen-tab__count {
      transition: color var(--bew-duration-normal) var(--bew-ease-standard);
    }

    /* Without the app (no indicator yet, or none in this document) the
       selected tab paints the plate itself. */
    #${ROOT_ID} .bewly-widescreen-tabs:not(:has(> .bew-liquid-indicator)) > .bewly-widescreen-tab[data-active="true"],
    #${ROOT_ID} .bewly-widescreen-danmaku-views:not(:has(> .bew-liquid-indicator)) > [data-active="true"] {
      background: var(--bew-liquid-indicator-bg);
      box-shadow: var(--bew-liquid-indicator-shadow);
    }

    /* The tabs, the panel content and the composer share one content line
       (the column's padding). The scrollers span the whole column, so section
       hairlines reach its edges; their content box reaches one space-1 past
       the content line, so row hover fills and focus rings are not clipped. */
    #${ROOT_ID} .bewly-widescreen-panels {
      --bewly-widescreen-panel-inline: calc(var(--bewly-widescreen-page-padding) - var(--bew-space-1));
      position: relative;
      z-index: 0;
      flex: 1 1 0;
      min-height: 0;
      margin-inline: calc(var(--bewly-widescreen-page-padding) * -1);
      overflow: hidden;
      background: transparent;
      /* Up behind the column's head (playbackRailHeadGlass), so scrolled
         content passes under its blur and hairline. */
      margin-top: calc(var(--bewly-widescreen-rail-head-height) * -1);
    }

    #${ROOT_ID} .bewly-widescreen-panel {
      position: relative;
      width: 100%;
      height: 100%;
      padding: calc(var(--bewly-widescreen-rail-head-height) + var(--bew-space-3)) var(--bewly-widescreen-panel-inline) var(--bewly-widescreen-rail-bottom);
      scroll-padding-top: var(--bewly-widescreen-rail-head-height);
      /* The column only scrolls vertically (user-specified 2026-11-05): a
         card scaled on hover or a native row wider than the column never
         lets it slide sideways. */
      overflow: hidden auto;
      overscroll-behavior: contain;
    }

    #${ROOT_ID} .bewly-widescreen-empty.bewly-widescreen-panel-error {
      position: absolute;
      inset: var(--bewly-widescreen-rail-head-height) 0 0;
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
      border: var(--bew-hairline, 1px) solid var(--bew-edge-color);
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
      right: var(--bewly-widescreen-page-padding);
      bottom: var(--bewly-widescreen-rail-bottom);
      left: var(--bewly-widescreen-page-padding);
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

    /* The native list spans the panel's full width, one space-1 past the
       content line on each side, so its rows' hover fills fit; its header,
       rows and views pad back in to the line. It runs to the window's bottom
       edge: no input docks in this panel. A head row holds the view segment
       (left) and Bpx's history button (right); the column labels and rows
       below share one set of column widths. */
    #${ROOT_ID} .bewly-widescreen-panel-danmaku {
      /* The view row, as far under the tabs as they are under the window's
         top (the column head's inset), and space-3 before the labels. */
      --bewly-danmaku-head: calc(var(--bew-control-height) + var(--bew-space-3));
      --bewly-danmaku-labels: var(--bew-space-8);
      /* The loading skeleton aligns with the first native list row. */
      --bewly-danmaku-list-top: calc(var(--bewly-widescreen-rail-head-height) + var(--bewly-danmaku-head) + var(--bewly-danmaku-labels));
      --bewly-danmaku-time-width: calc(var(--bew-space-12) + var(--bew-space-3));
      --bewly-danmaku-date-width: calc(var(--bew-space-12) + var(--bew-space-10));
      position: relative;
      /* The list scrolls in Bpx's own scroller, not the panel: the panel's
         content starts under the column's head. */
      padding: var(--bewly-widescreen-rail-head-height) var(--bewly-widescreen-panel-inline) 0;
      overflow: hidden;
      container-type: size;
    }

    /* The panel's pinned head (the view segment and the history button, and
       in the list view the column labels) continues the column's head: one
       glass band (the shared glass filter, no tint) from the column's top
       through the head, with no hairline or second layer between the tabs
       and the view row (user-specified 2026-11-05), and one hairline across
       the whole column at its lower edge. While the panel shows, it draws
       the band in place of the column's (playbackRailHeadGlass). */
    #${ROOT_ID} .bewly-widescreen-sidebar:has(> .bewly-widescreen-panels > .bewly-widescreen-panel-danmaku:not([hidden]))::before {
      display: none;
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku::before {
      content: "";
      position: absolute;
      inset: 0 0 auto;
      z-index: 1;
      box-sizing: content-box;
      height: calc(var(--bewly-widescreen-rail-head-height) + var(--bewly-danmaku-head));
      border-bottom: var(--bew-hairline) solid var(--bew-separator-color);
      backdrop-filter: var(--bew-filter-glass-1);
      pointer-events: none;
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku[data-bewly-danmaku-view="LIST"]::before {
      height: calc(var(--bewly-widescreen-rail-head-height) + var(--bewly-danmaku-head) + var(--bewly-danmaku-labels));
    }

    /* Bpx's view menu as a track segment (danmakuViews.ts) on the head row. */
    #${ROOT_ID} .bewly-widescreen-panel > .bewly-widescreen-danmaku-views {
      position: absolute;
      top: var(--bewly-widescreen-rail-head-height);
      inset-inline-start: calc(var(--bewly-widescreen-panel-inline) + var(--bew-space-1));
      z-index: 2;
      width: auto !important;
    }

    #${ROOT_ID} .bewly-widescreen-danmaku-views[hidden] {
      display: none;
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .danmaku-box,
    #${ROOT_ID} .bewly-widescreen-panel-danmaku .danmaku-wrap,
    #${ROOT_ID} .bewly-widescreen-panel-danmaku [class*="DanmukuBox_wrap"],
    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-docker,
    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-auxiliary,
    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-collapse,
    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bui-collapse-wrap {
      width: 100% !important;
      height: 100% !important;
      min-height: 0 !important;
      background: var(--bewly-widescreen-sidebar-bg) !important;
    }

    /* The panel owns clipping; native ancestors keep the header's overlays. */
    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-docker {
      display: flex !important;
      flex-direction: column !important;
      height: 100% !important;
      min-height: 0 !important;
      overflow: clip visible !important;
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

    /* Bpx's header (its view menu and fold arrow) stays, unseen, under the
       segment that replaces its menu; the body reserves the head row. */
    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bui-collapse-header {
      position: absolute !important;
      inset: 0 0 auto;
      height: var(--bewly-danmaku-head) !important;
      min-height: 0 !important;
      padding: 0 !important;
      border: 0 !important;
      background: var(--bewly-widescreen-sidebar-bg) !important;
      visibility: hidden;
      pointer-events: none;
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bui-collapse-body {
      /* The history footer remains in the native list tree; its containing
         block is the collapse wrapper so list mode and delegated clicks survive. */
      position: static !important;
      display: block !important;
      box-sizing: border-box !important;
      width: 100% !important;
      height: auto !important;
      min-height: 0 !important;
      flex: 1 1 0 !important;
      padding-top: var(--bewly-danmaku-head) !important;
      overflow: clip visible;
      background: var(--bewly-widescreen-sidebar-bg) !important;
      transform: none !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-wraplist {
      display: flex !important;
      width: 100% !important;
      height: 100% !important;
      min-height: 0 !important;
      flex-direction: column;
      overflow: clip visible;
      background: var(--bewly-widescreen-sidebar-bg) !important;
    }

    /* Bpx shows a view of this wrapper (list, block settings, advanced) with an
       inline display: block and hides it by clearing that, so only the shown
       list becomes a column; forcing it would keep it over the other views. */
    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-filter-wrap.bpx-player-dm[style*="display: block"] {
      display: flex !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-filter-wrap.bpx-player-dm {
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
      background: transparent !important;
    }

    /* Column labels are one caption row in text-3 on the head's glass; each
       sorts its column and brightens on hover. */
    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-dm-function {
      position: relative;
      z-index: 2;
      height: var(--bewly-danmaku-labels) !important;
      padding-inline: var(--bew-space-1) !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-dm-function > :is(.bpx-player-dm-btn-time, .bpx-player-dm-btn-dm, .bpx-player-dm-btn-date) {
      color: var(--bew-text-3) !important;
      font-size: var(--bew-font-size-caption) !important;
      line-height: var(--bewly-danmaku-labels) !important;
      transition: color var(--bew-duration-fast) var(--bew-ease-standard);
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-dm-function > :is(.bpx-player-dm-btn-time, .bpx-player-dm-btn-dm, .bpx-player-dm-btn-date):hover {
      color: var(--bew-text-1) !important;
    }

    /* One set of column widths for the labels and the rows: time and send
       date are fixed, the comment takes the rest with a space-3 gutter.
       Bpx's 16px indent and per-cell padding go; the special-danmaku label
       Bpx draws in place of a date takes the date's column. */
    #${ROOT_ID} .bewly-widescreen-panel-danmaku :is(.bpx-player-dm-btn-time, .dm-info-time) {
      box-sizing: border-box !important;
      width: var(--bewly-danmaku-time-width) !important;
      padding: 0 !important;
      flex: none !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku :is(.bpx-player-dm-btn-dm, .dm-info-dm) {
      padding: 0 var(--bew-space-3) 0 0 !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku :is(.bpx-player-dm-btn-date, .dm-info-date) {
      box-sizing: border-box !important;
      width: var(--bewly-danmaku-date-width) !important;
      padding: 0 !important;
      flex: none !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .dm-info-row::after {
      box-sizing: border-box;
      width: var(--bewly-danmaku-date-width) !important;
      flex: none;
      padding: 0 !important;
      text-align: start !important;
      color: var(--bew-text-3) !important;
      font-size: var(--bew-font-size-caption) !important;
    }

    /* Rows reach one space-1 past the content line, so the hover fill frames
       them. The comment is reading text; time and send date are tabular
       captions. Bpx virtualizes by its fixed row height, which stays. */
    #${ROOT_ID} .bewly-widescreen-panel-danmaku .dm-info-row {
      box-sizing: border-box !important;
      padding-inline: var(--bew-space-1) !important;
      border-radius: var(--bew-interactive-radius);
      corner-shape: var(--bew-corner-shape);
      transition: background-color var(--bew-duration-fast) var(--bew-ease-standard);
    }

    /* Code (BAS) danmaku rows lose Bpx's cream fill: their label in the date
       column already names them. */
    #${ROOT_ID} .bewly-widescreen-panel-danmaku .dm-info-row.dm-info-row-code {
      background: transparent !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .dm-info-row:hover {
      background: var(--bew-hover-bg) !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .dm-info-row .dm-info-dm {
      color: var(--bew-text-1) !important;
      font-size: var(--bew-font-size-control) !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .dm-info-row :is(.dm-info-time, .dm-info-date) {
      color: var(--bew-text-3) !important;
      font-size: var(--bew-font-size-caption) !important;
      font-variant-numeric: tabular-nums;
    }

    /* Report and block-sender appear on hover as quiet chips, not accent
       outlines, in place of the send date (or the special-danmaku label). */
    #${ROOT_ID} .bewly-widescreen-panel-danmaku .dm-info-row:hover::after {
      display: none;
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .dm-info-row :is(.dm-info-block-btn, .dm-info-report-btn) {
      align-self: center;
      width: auto !important;
      height: var(--bew-space-5) !important;
      margin: 0 0 0 var(--bew-space-1) !important;
      padding: 0 var(--bew-space-2) !important;
      line-height: var(--bew-space-5) !important;
      border-color: transparent !important;
      /* Nested space-0-5 inside the row's corner. */
      border-radius: calc(var(--bew-interactive-radius) - var(--bew-space-0-5)) !important;
      corner-shape: var(--bew-corner-shape);
      background: var(--bew-fill-1) !important;
      color: var(--bew-text-2) !important;
      font-size: var(--bew-font-size-caption) !important;
      transition:
        color var(--bew-duration-fast) var(--bew-ease-standard),
        background-color var(--bew-duration-fast) var(--bew-ease-standard);
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .dm-info-row :is(.dm-info-block-btn, .dm-info-report-btn):hover {
      background: var(--bew-fill-2) !important;
      color: var(--bew-text-1) !important;
    }

    /* The history button ends the head row: a plain button with a history
       icon (danmakuViews.ts adds it), a standalone control's rounded
       rectangle. */
    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-dm-btn-footer {
      position: absolute !important;
      top: 0;
      right: var(--bew-space-1);
      bottom: auto;
      display: flex;
      align-items: center;
      width: auto !important;
      height: var(--bew-control-height) !important;
      margin: 0 !important;
      padding: 0 !important;
      border: 0 !important;
      z-index: 2;
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-dm-btn-history {
      position: relative;
      ${PLAIN_BUTTON}
      width: auto !important;
      height: var(--bew-control-height-sm) !important;
      padding: 0 var(--bew-space-2) !important;
      font-size: var(--bew-font-size-control) !important;
      line-height: var(--bew-control-height-sm) !important;
      white-space: nowrap;
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-dm-btn-history:hover {
      ${PLAIN_BUTTON_HOVER}
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-dm-btn-history:active {
      background: var(--bew-pressed-bg) !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bewly-danmaku-history-icon {
      flex: none;
      width: var(--bew-icon-size-sm);
      height: var(--bew-icon-size-sm);
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-dm-btn-history:focus-visible {
      outline: var(--bew-focus-ring, 1px solid CanvasText);
      outline-offset: var(--bew-space-0-5);
    }

    /* The history calendar opens under its button, right-aligned (Bpx
       centres it with a translate), on the shared player popover surface. */
    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-dm-btn-history .bpx-player-date-picker {
      top: calc(100% + var(--bew-space-2)) !important;
      right: 0 !important;
      bottom: auto !important;
      left: auto !important;
      max-height: calc(100cqh - var(--bewly-danmaku-head) - var(--bew-space-4));
      overflow-y: auto;
      overscroll-behavior: contain;
      transform: none !important;
      ${PLAYER_POPOVER_SURFACE}
      color: var(--bew-text-1);
      cursor: default;
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-date-picker-header {
      border-bottom: var(--bew-hairline) solid var(--bew-separator-color) !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-date-picker :is(.bpx-player-date-picker-year, .bpx-player-date-picker-month) {
      color: var(--bew-text-1) !important;
      font-size: var(--bew-font-size-control) !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-date-picker-btn {
      color: var(--bew-text-2) !important;
      transition: color var(--bew-duration-fast) var(--bew-ease-standard);
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-date-picker-btn:not(.bpx-player-disabled):hover {
      color: var(--bew-text-1) !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-date-picker-btn.bpx-player-disabled {
      color: var(--bew-text-4) !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-date-picker-btn :is(svg, path) {
      fill: currentColor !important;
    }

    /* Days are plain numerals: dates with history read in text-1 and take a
       hover fill, the chosen one sits on the selected surface. No outlines. */
    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-date-picker-day {
      border-color: transparent !important;
      border-radius: var(--bew-radius-tiny) !important;
      corner-shape: var(--bew-corner-shape);
      color: var(--bew-text-4) !important;
      font-variant-numeric: tabular-nums;
      transition:
        color var(--bew-duration-fast) var(--bew-ease-standard),
        background-color var(--bew-duration-fast) var(--bew-ease-standard);
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-date-picker-week .bpx-player-date-picker-day {
      color: var(--bew-text-3) !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-date-picker-day.day-enable {
      color: var(--bew-text-1) !important;
      cursor: pointer;
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-date-picker-day.day-enable:hover {
      background: var(--bew-hover-bg) !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-date-picker-day.bpx-player-active {
      color: var(--bew-text-1) !important;
      background: var(--bew-selected-bg) !important;
    }

    /* Block settings and advanced danmaku (user-specified, 2026-11-04): flat
       sections on the list's content line, ruled off by hairlines, in the
       form language of the settings window. Video and bangumi pages share
       these rules: both host the same Bpx box in this panel. */
    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-block {
      padding-inline: var(--bew-space-1) !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-block-area {
      display: flex !important;
      flex-direction: column;
      gap: var(--bew-space-3);
      padding: 0 0 var(--bew-space-4) !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-block-area > * {
      margin: 0 !important;
    }

    /* A settings row: the list's switch beside its name, sync at the end. */
    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-block-top {
      display: flex !important;
      align-items: center;
      justify-content: space-between;
      gap: var(--bew-space-3);
      height: auto !important;
      min-height: var(--bew-control-height);
      padding: 0 !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-block-top > :first-child {
      display: inline-flex !important;
      align-items: center;
      gap: var(--bew-space-3);
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-block-label {
      color: var(--bew-text-1) !important;
      font-size: var(--bew-font-size-body) !important;
      font-weight: var(--bew-font-weight-regular) !important;
      line-height: var(--bew-line-height-body) !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-block-sync-btn {
      ${PLAIN_BUTTON}
      height: var(--bew-control-height-sm) !important;
      margin: 0 !important;
      padding: 0 var(--bew-space-2) !important;
      font-size: var(--bew-font-size-control) !important;
      line-height: var(--bew-control-height-sm) !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-block-sync-btn:hover {
      ${PLAIN_BUTTON_HOVER}
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-block-sync-btn:active {
      background: var(--bew-pressed-bg) !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-block-sync-btn > :first-child {
      display: inline-flex !important;
      width: var(--bew-icon-size-sm) !important;
      height: var(--bew-icon-size-sm) !important;
      margin: 0 !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-block-sync-btn :is(svg, path) {
      width: 100%;
      height: 100%;
      fill: currentColor !important;
    }

    /* One field: "add" sits inside the input's end, space-1 in, its corner
       concentric with the field's. */
    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-block-add {
      position: relative;
      display: block !important;
      height: auto !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-block-add-input {
      ${FIELD_SURFACE}
      display: block;
      width: 100% !important;
      height: var(--bew-control-height) !important;
      padding-inline: var(--bew-space-3) calc(var(--bew-space-12) + var(--bew-space-4) + var(--bew-space-3)) !important;
      line-height: calc(var(--bew-control-height) - 2px) !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-block-add-input:hover {
      border-color: var(--bew-field-edge-color-hover) !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-block-add-input::placeholder {
      color: var(--bew-text-4);
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-block-add-btn {
      position: absolute !important;
      top: var(--bew-space-1);
      right: var(--bew-space-1);
      width: auto !important;
      height: auto !important;
    }

    ${BPX_FORMS} .bpx-player-block-add > .bpx-player-block-add-btn .bui-area {
      display: flex !important;
      align-items: center;
      justify-content: center;
      min-width: calc(var(--bew-space-12) + var(--bew-space-4));
      border-radius: calc(var(--bew-interactive-radius) - var(--bew-space-1)) !important;
    }

    /* The list is its own section: the type segment, then the column labels
       and rows, below a hairline. */
    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-block-tab {
      /* 16 above the hairline (the area's 12 gap and this 4), 16 below. */
      margin-top: var(--bew-space-1) !important;
      padding-top: var(--bew-space-4) !important;
      border-top: var(--bew-hairline) solid var(--bew-separator-color);
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-block-tab .bui-tabs-header {
      display: flex !important;
      gap: var(--bew-control-gap);
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-block-tab .bui-tabs-header-item {
      height: var(--bew-control-height-sm) !important;
      margin: 0 !important;
      padding: 0 var(--bew-control-item-padding-x) !important;
      border: 0 !important;
      border-radius: var(--bew-interactive-radius);
      corner-shape: var(--bew-corner-shape);
      color: var(--bew-text-2) !important;
      font-size: var(--bew-font-size-control) !important;
      line-height: var(--bew-control-height-sm) !important;
      transition:
        color var(--bew-duration-fast) var(--bew-ease-standard),
        background-color var(--bew-duration-fast) var(--bew-ease-standard);
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-block-tab .bui-tabs-header-item:not(.bui-tabs-header-item-active):hover {
      color: var(--bew-segment-item-hover-color) !important;
      background: var(--bew-segment-item-hover-bg);
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-block-tab .bui-tabs-header-item-active {
      color: var(--bew-segment-item-active-color) !important;
      background: var(--bew-segment-item-active-bg);
      box-shadow: var(--bew-segment-item-active-shadow);
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-block-list {
      padding: 0 !important;
      border: 0 !important;
      border-radius: 0 !important;
      background: transparent !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-block-list-function {
      height: var(--bew-space-8) !important;
      padding: 0 !important;
      border-bottom: var(--bew-hairline) solid var(--bew-separator-color) !important;
      color: var(--bew-text-3) !important;
      font-size: var(--bew-font-size-caption) !important;
      line-height: var(--bew-space-8) !important;
      background: transparent !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-block-list-function-content {
      padding: 0 !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-block-list-function :is(span, div) {
      color: inherit !important;
      font-size: inherit !important;
      line-height: inherit !important;
    }

    /* Rows like the danmaku list's: control text-1, their state and actions
       caption text-2, a hover fill one space-1 past the content line. */
    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-block-list-item {
      min-height: var(--bew-control-height-sm);
      margin-inline: calc(var(--bew-space-1) * -1) !important;
      padding-inline: var(--bew-space-1) !important;
      border-radius: var(--bew-interactive-radius);
      corner-shape: var(--bew-corner-shape);
      color: var(--bew-text-1) !important;
      font-size: var(--bew-font-size-control) !important;
      transition: background-color var(--bew-duration-fast) var(--bew-ease-standard);
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-block-list-item:hover {
      background: var(--bew-hover-bg);
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-block-list-item :is(.bpx-player-block-list-state, .bpx-player-block-list-delete, .bpx-player-block-list-sync) {
      color: var(--bew-text-2) !important;
      font-size: var(--bew-font-size-caption) !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-block-list-item:empty {
      display: none !important;
    }

    /* Advanced danmaku: three flat groups (look, motion, text and send)
       ruled off by hairlines, space-4 above and below each. Bpx pads its
       first and last rows as well; only the groups space them here. */
    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-adv-danmaku-group-wrap {
      padding: 0 !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-adv-danmaku-group {
      height: auto !important;
      margin: 0 var(--bew-space-1) !important;
      padding: var(--bew-space-4) 0 !important;
      border: 0 !important;
      border-bottom: var(--bew-hairline) solid var(--bew-separator-color) !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-adv-danmaku-group:first-child {
      padding-top: 0 !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-adv-danmaku-group:last-child {
      border-bottom: 0 !important;
    }

    /* A row with a heading is the heading above its controls; a row of
       labelled fields is two columns, so fields line up row to row. */
    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-adv-danmaku-group-row {
      display: flex !important;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--bew-space-2) var(--bew-control-gap);
      height: auto !important;
      margin: 0 0 var(--bew-space-4) !important;
      padding: 0 !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-adv-danmaku-group-row:has(> .bpx-player-adv-danmaku-group-item) {
      display: grid !important;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--bew-space-3) var(--bew-space-4);
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-adv-danmaku-group-row:last-child {
      margin-bottom: 0 !important;
    }

    /* Bpx's float clearfix would be an empty grid row or flex line. */
    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-adv-danmaku-group-row::after {
      content: none !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-adv-danmaku-group-row > * {
      margin: 0 !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-adv-danmaku-group-item {
      display: flex !important;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--bew-space-2);
      width: auto !important;
      min-width: 0;
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-adv-danmaku-title {
      display: flex !important;
      flex-basis: 100%;
      align-items: center;
      gap: var(--bew-space-3);
      margin: 0 !important;
      padding: 0 !important;
      color: var(--bew-text-2) !important;
      font-size: var(--bew-font-size-callout) !important;
      font-weight: var(--bew-font-weight-regular) !important;
      line-height: var(--bew-line-height-callout) !important;
    }

    /* Field labels share one width, five characters, so a column's fields
       start on one line. */
    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-adv-danmaku-group-item > .bpx-player-adv-danmaku-title {
      flex: 0 0 auto;
      min-width: calc(var(--bew-font-size-callout) * 5);
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-adv-danmaku .bui-input .bui-area,
    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-adv-danmaku .bui-select .bui-area,
    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-adv-danmaku .bui-select-wrap {
      height: auto !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-adv-danmaku-checkbox {
      margin: 0 !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-adv-danmaku-spinner {
      flex: none;
      width: calc(var(--bew-space-12) + var(--bew-space-6)) !important;
      height: var(--bew-control-height-sm) !important;
    }

    ${BPX_FORMS} .bpx-player-adv-danmaku-spinner .bui-input-input {
      width: 100% !important;
      padding-right: var(--bew-space-5) !important;
      font-variant-numeric: tabular-nums;
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-adv-danmaku-font-family-select {
      flex: none;
      width: calc(var(--bew-space-10) * 2 + var(--bew-space-2)) !important;
    }

    /* The range's "~" and the position's axes are quiet glyphs. */
    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-adv-danmaku-opacity > span:not([class]),
    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-adv-danmaku-pos-axis {
      color: var(--bew-text-3) !important;
      font-size: var(--bew-font-size-caption) !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-adv-danmaku-color-picker {
      width: auto !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-adv-danmaku-color-picker .bui-color-picker-input {
      width: calc(var(--bew-space-12) * 2) !important;
    }

    ${BPX_FORMS} .bpx-player-adv-danmaku-color-picker .bui-color-picker-input .bui-input-input {
      font-variant-numeric: tabular-nums;
      text-transform: uppercase;
    }

    /* The chosen colour is a square swatch as tall as its field; the
       palette's swatches lift a little under the pointer. */
    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-adv-danmaku-color-picker .bui-color-picker-display {
      width: var(--bew-control-height-sm) !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-adv-danmaku-color-picker .bui-color-picker-option {
      cursor: pointer;
      transition: scale var(--bew-duration-fast) var(--bew-ease-standard);
    }

    @media (hover: hover) and (prefers-reduced-motion: no-preference) {
      #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-adv-danmaku-color-picker .bui-color-picker-option:hover {
        scale: 1.15;
      }
    }

    /* Motion: its ways are a static segment, like the block list's types. */
    ${BPX_FORMS} .bpx-player-adv-danmaku-animation-way > .bui-button .bui-area {
      background: transparent !important;
      color: var(--bew-text-2) !important;
      transition:
        color var(--bew-duration-fast) var(--bew-ease-standard),
        background-color var(--bew-duration-fast) var(--bew-ease-standard);
    }

    ${BPX_FORMS} .bpx-player-adv-danmaku-animation-way > .bui-button:not(.active) .bui-area:hover {
      color: var(--bew-segment-item-hover-color) !important;
      background: var(--bew-segment-item-hover-bg) !important;
    }

    ${BPX_FORMS} .bpx-player-adv-danmaku-animation-way > .bui-button.active .bui-area {
      color: var(--bew-segment-item-active-color) !important;
      background: var(--bew-segment-item-active-bg) !important;
      box-shadow: var(--bew-segment-item-active-shadow);
    }

    /* Position: start and end are rows of their own, label, X, Y and the
       follow button on one line. */
    #${ROOT_ID} .bewly-widescreen-panel-danmaku :is(.bpx-player-adv-danmaku-pos-start, .bpx-player-adv-danmaku-pos-end) {
      display: flex !important;
      flex-basis: 100%;
      align-items: center;
      gap: var(--bew-space-2);
      width: auto !important;
      height: auto !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-adv-danmaku-pos-title {
      min-width: calc(var(--bew-font-size-callout) * 2);
      color: var(--bew-text-2) !important;
      font-size: var(--bew-font-size-callout) !important;
      line-height: var(--bew-line-height-callout) !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-adv-danmaku-pos-axis {
      line-height: var(--bew-line-height-caption) !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku :is(.bpx-player-adv-danmaku-pos-start-follow, .bpx-player-adv-danmaku-pos-end-follow) {
      margin-left: auto !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-adv-danmaku-text-input {
      width: 100% !important;
      height: auto !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-adv-danmaku-showtime-input {
      width: calc(var(--bew-space-12) * 2 + var(--bew-space-2)) !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-adv-danmaku-showtime-input.bui-disabled .bui-input-input {
      color: var(--bew-text-4) !important;
      background: var(--bew-fill-1) !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-adv-danmaku-send {
      display: grid !important;
      grid-template-columns: 1fr 1fr;
      gap: var(--bew-space-2);
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-adv-danmaku-send .bui-button {
      width: auto !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-adv-danmaku .bpx-player-adv-danmaku-send .bui-button .bui-area {
      justify-content: center;
      width: 100% !important;
      height: var(--bew-control-height) !important;
      line-height: var(--bew-control-height) !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-adv-danmaku .bpx-player-adv-danmaku-send-send.bui-button .bui-area {
      background: var(--bew-accent-solid) !important;
      color: var(--bew-on-accent-solid) !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-adv-danmaku .bpx-player-adv-danmaku-send-send.bui-button .bui-area:hover {
      background: color-mix(in srgb, var(--bew-accent-solid) 88%, var(--bew-neutral-fg)) !important;
    }

    /* Without the right to send, Bpx veils the form in its own dark grey;
       the veil takes the page's colour instead. */
    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-adv-danmaku-panel.mask::after {
      background: linear-gradient(var(--bewly-widescreen-rail-tint) 0 0), var(--bew-bg) !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-adv-danmaku-dialog {
      ${PLAYER_POPOVER_SURFACE}
      overflow: hidden;
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-adv-danmaku-dialog :is(.bui-area, .bui-dialog-wrap, .bui-dialog-body, .bpx-player-adv-danmaku-dialog-content, .bpx-player-adv-danmaku-dialog-text, .bpx-player-adv-danmaku-dialog-functions, .bui-dialog-close *) {
      background: transparent !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-adv-danmaku-dialog .bui-dialog-title {
      height: auto !important;
      padding: var(--bew-space-3) var(--bew-space-4) !important;
      border-bottom: var(--bew-hairline) solid var(--bew-separator-color) !important;
      color: var(--bew-text-1) !important;
      font-size: var(--bew-font-size-title) !important;
      font-weight: var(--bew-font-weight-regular) !important;
      line-height: var(--bew-line-height-title) !important;
      text-align: start !important;
      background: transparent !important;
    }

    /* The close × sits space-2 inside the card's corner, so its corner is
       the card's less that inset. */
    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-adv-danmaku-dialog .bui-dialog-close {
      top: var(--bew-space-2) !important;
      right: var(--bew-space-2) !important;
      width: var(--bew-control-height-sm) !important;
      height: var(--bew-control-height-sm) !important;
      ${PLAIN_BUTTON}
      justify-content: center;
      border-radius: calc(var(--bew-surface-radius) - var(--bew-space-2)) !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-adv-danmaku-dialog .bui-dialog-close :is(svg, i) {
      width: var(--bew-icon-size-sm) !important;
      height: var(--bew-icon-size-sm) !important;
      font-size: var(--bew-icon-size-sm) !important;
      color: inherit !important;
      fill: currentColor !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-adv-danmaku-dialog .bui-dialog-close:hover {
      ${PLAIN_BUTTON_HOVER}
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-adv-danmaku-dialog-content {
      display: flex;
      flex-direction: column;
      gap: var(--bew-space-4);
      padding: var(--bew-space-4) !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-adv-danmaku-dialog-text {
      color: var(--bew-text-1) !important;
      font-size: var(--bew-font-size-body) !important;
      line-height: var(--bew-line-height-body) !important;
      white-space: normal !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-adv-danmaku-dialog-functions {
      display: flex !important;
      justify-content: flex-end;
      gap: var(--bew-space-2);
      height: auto !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-adv-danmaku-dialog-function {
      height: var(--bew-control-height-sm) !important;
      margin: 0 !important;
      padding: 0 var(--bew-space-3) !important;
      border: 0 !important;
      border-radius: var(--bew-interactive-radius) !important;
      corner-shape: var(--bew-corner-shape);
      background: var(--bew-fill-1) !important;
      color: var(--bew-text-1) !important;
      font-size: var(--bew-font-size-control) !important;
      line-height: var(--bew-control-height-sm) !important;
      cursor: pointer;
      transition: background-color var(--bew-duration-fast) var(--bew-ease-standard);
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-adv-danmaku-dialog-function:hover {
      background: var(--bew-fill-2) !important;
    }

    /* The confirming action (use coins) is the primary one. */
    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-adv-danmaku-dialog-function:last-child {
      background: var(--bew-accent-solid) !important;
      color: var(--bew-on-accent-solid) !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-adv-danmaku-dialog-function:last-child:hover {
      background: color-mix(in srgb, var(--bew-accent-solid) 88%, var(--bew-neutral-fg)) !important;
    }

    /* Native forms across the control bar and danmaku surfaces share the field tokens and the control tier's
       radius; radio buttons are a static segment; buttons are neutral fills;
       none of them keep Bpx's 2px corners or accent fills. */
    ${BPX_FORMS} .bui-input-input {
      ${FIELD_SURFACE}
    }

    ${BPX_FORMS} textarea.bui-input-input {
      height: auto !important;
      min-height: calc(var(--bew-control-height) * 2) !important;
      padding: var(--bew-space-2) !important;
      line-height: var(--bew-line-height-body) !important;
      resize: vertical;
    }

    ${BPX_FORMS} .bui-input-input:hover {
      border-color: var(--bew-field-edge-color-hover) !important;
    }

    ${BPX_FORMS} .bui-input-input::placeholder {
      color: var(--bew-text-4) !important;
    }

    ${BPX_FORMS} .bui-input-wrap {
      position: relative;
      height: auto !important;
      background: transparent !important;
    }

    ${BPX_FORMS} .bui-input-stepper {
      top: 1px !important;
      right: 1px !important;
      bottom: 1px !important;
      height: auto !important;
      border: 0 !important;
      background: transparent !important;
    }

    ${BPX_FORMS} .bui-input-stepper-half {
      background: transparent !important;
      color: var(--bew-text-3) !important;
    }

    ${BPX_FORMS} .bui-input-stepper-half:hover {
      color: var(--bew-text-1) !important;
    }

    ${BPX_FORMS} .bui-select-border {
      ${FIELD_SURFACE}
      padding: 0 !important;
    }

    ${BPX_FORMS} .bui-select-header {
      height: calc(var(--bew-control-height-sm) - 2px) !important;
      padding-inline: var(--bew-space-2) var(--bew-space-6) !important;
      line-height: calc(var(--bew-control-height-sm) - 2px) !important;
      background: transparent !important;
    }

    ${BPX_FORMS} .bui-select-result {
      color: var(--bew-text-1) !important;
    }

    ${BPX_FORMS} .bui-select-wrap {
      height: var(--bew-control-height-sm) !important;
    }

    ${BPX_FORMS} .bui-select-arrow-down {
      border-top-color: var(--bew-text-2) !important;
    }

    ${BPX_FORMS} .bui-select-unfold .bui-select-list {
      box-shadow: inset 0 0 0 var(--bew-hairline) var(--bew-field-edge-color);
    }

    ${PLAYER_CONTROLS} .bpx-player-ctrl-subtitle-color :is(.bui-select-item, .bui-select-result) > span:first-child {
      box-shadow: inset 0 0 0 var(--bew-hairline) var(--bew-field-edge-color);
    }

    /* The open list keeps Bpx's own frame (it has no open state to key a
       border or shadow on: closed, it is a 0-height box). */
    ${BPX_FORMS} .bui-select-list {
      border-radius: var(--bew-interactive-radius) !important;
      corner-shape: var(--bew-corner-shape);
      background: var(--bew-elevated-alt-solid) !important;
    }

    ${BPX_FORMS} .bui-select-item {
      height: var(--bew-control-height-sm) !important;
      padding: 0 var(--bew-space-2) !important;
      border-radius: var(--bew-interactive-radius);
      corner-shape: var(--bew-corner-shape);
      background: transparent !important;
      color: var(--bew-text-1) !important;
      line-height: var(--bew-control-height-sm) !important;
    }

    ${BPX_FORMS} .bui-select-item:hover {
      background: var(--bew-hover-bg) !important;
    }

    ${BPX_FORMS} .bui-select-item-active {
      background: var(--bew-selected-bg) !important;
    }

    ${BPX_FORMS} .bui-radio-button .bui-radio-group {
      display: inline-flex !important;
      gap: var(--bew-control-gap);
      height: auto !important;
      flex-wrap: wrap;
    }

    ${BPX_FORMS} .bui-radio-button .bui-radio-label {
      box-sizing: border-box;
      min-height: var(--bew-control-height-sm) !important;
      height: auto !important;
      padding: var(--bew-space-1) var(--bew-space-3) !important;
      border: 0 !important;
      border-radius: var(--bew-interactive-radius) !important;
      corner-shape: var(--bew-corner-shape);
      background: transparent !important;
      color: var(--bew-text-2) !important;
      font-size: var(--bew-font-size-control) !important;
      line-height: var(--bew-line-height-control) !important;
      transition:
        color var(--bew-duration-fast) var(--bew-ease-standard),
        background-color var(--bew-duration-fast) var(--bew-ease-standard);
    }

    ${BPX_FORMS} .bui-radio-button .bui-radio-item:hover .bui-radio-label {
      color: var(--bew-segment-item-hover-color) !important;
      background: var(--bew-segment-item-hover-bg) !important;
    }

    ${BPX_FORMS} .bui-radio-button .bui-radio-input:checked + .bui-radio-label {
      color: var(--bew-segment-item-active-color) !important;
      background: var(--bew-segment-item-active-bg) !important;
    }

    ${BPX_FORMS} .bui-button {
      width: auto !important;
      height: auto !important;
    }

    ${BPX_FORMS} .bui-button .bui-area {
      width: auto !important;
      min-height: var(--bew-control-height-sm) !important;
      height: auto !important;
      white-space: normal;
      padding: 0 var(--bew-space-3) !important;
      border: 0 !important;
      border-radius: var(--bew-interactive-radius) !important;
      corner-shape: var(--bew-corner-shape);
      background: var(--bew-fill-1) !important;
      color: var(--bew-text-1) !important;
      font-size: var(--bew-font-size-control) !important;
      line-height: var(--bew-line-height-control) !important;
      transition: background-color var(--bew-duration-fast) var(--bew-ease-standard);
    }

    ${BPX_FORMS} .bui-button .bui-area:hover {
      background: var(--bew-fill-2) !important;
    }

    /* A chosen option button (Bpx paints it with its accent). */
    ${BPX_FORMS} .bui-button.active .bui-area {
      background: var(--bew-selected-bg) !important;
    }

    /* Checkboxes in the rail panel read like the settings popover's:
       neutral glyphs, text-2 unchecked and text-1 checked. */
    ${BPX_FORMS} .bui-checkbox-label {
      display: inline-flex !important;
      align-items: center;
      gap: var(--bew-space-1);
      cursor: pointer;
    }

    ${BPX_FORMS} .bui-checkbox-icon-default {
      color: var(--bew-text-2) !important;
    }

    ${BPX_FORMS} .bui-checkbox-icon-selected {
      color: var(--bew-text-1) !important;
    }

    ${BPX_FORMS} :is(.bui-checkbox-icon-default, .bui-checkbox-icon-selected) :is(svg, path) {
      fill: currentColor !important;
    }

    ${BPX_FORMS} :is(.bui-checkbox-name, .bui-radio-text, .bui-switch-name) {
      color: var(--bew-text-1) !important;
      font-size: var(--bew-font-size-control) !important;
      font-weight: var(--bew-font-weight-regular) !important;
      line-height: var(--bew-line-height-control) !important;
      white-space: normal !important;
    }

    ${BPX_FORMS} .bui-switch-body {
      background: var(--bew-switch-bg) !important;
      box-shadow: inset 0 0 0 var(--bew-hairline) var(--bew-field-edge-color);
    }

    ${BPX_FORMS} .bui-switch-input:checked + .bui-switch-label .bui-switch-body {
      background: var(--bew-text-1) !important;
    }

    ${BPX_FORMS} .bui-switch-dot {
      background: var(--bew-elevated-alt-solid) !important;
      color: var(--bew-text-1) !important;
      fill: currentColor !important;
      box-shadow: var(--bew-shadow-1) !important;
    }

    ${BPX_FORMS} .bui-switch-dot :is(span, svg, path) {
      color: inherit !important;
    }

    ${BPX_FORMS} .bui-slider .bui-bar-wrap {
      background: var(--bew-fill-4) !important;
    }

    ${BPX_FORMS} .bui-slider :is(.bui-bar, .bui-thumb-dot) {
      background: var(--bew-text-1) !important;
    }

    ${BPX_FORMS} .bui-slider .bui-step-dot {
      background: var(--bew-text-3) !important;
    }

    ${BPX_FORMS} .bui-slider .bui-step-name {
      color: var(--bew-text-2) !important;
    }

    ${BPX_FORMS} .bui-thumb-tooltip {
      ${PLAYER_POPOVER_SURFACE}
    }

    ${BPX_FORMS} :is(.bui-disabled .bui-area, .bui-disabled .bui-checkbox-name, .bui-disabled .bui-switch-name, .bui-select-item-disabled) {
      color: var(--bew-text-4) !important;
    }

    ${BPX_FORMS} .bui-disabled :is(.bui-checkbox-icon svg, .bui-switch-dot) {
      color: var(--bew-text-4) !important;
      fill: currentColor !important;
    }

    ${BPX_FORMS} :is(.bui-input-input:focus-visible, .bui-select-header:focus-visible, .bui-checkbox-input:focus-visible + .bui-checkbox-label, .bui-radio-input:focus-visible + .bui-radio-label, .bui-switch-input:focus-visible + .bui-switch-label) {
      background-color: var(--bew-selected-bg) !important;
    }

    ${BPX_FORMS} .bui-color-picker-result {
      display: flex !important;
      gap: var(--bew-space-2);
      height: auto !important;
    }

    ${BPX_FORMS} .bui-color-picker-display {
      height: var(--bew-control-height-sm) !important;
      border: var(--bew-hairline) solid var(--bew-media-edge-color) !important;
      border-radius: var(--bew-interactive-radius) !important;
      corner-shape: var(--bew-corner-shape);
    }

    ${BPX_FORMS} .bui-color-picker-options {
      display: flex !important;
      flex-wrap: wrap;
      gap: var(--bew-space-1);
      margin-top: var(--bew-space-2) !important;
    }

    ${BPX_FORMS} .bui-color-picker-option {
      width: var(--bew-space-5) !important;
      height: var(--bew-space-5) !important;
      margin: 0 !important;
      border: var(--bew-hairline) solid var(--bew-media-edge-color) !important;
      border-radius: var(--bew-radius-tiny) !important;
      corner-shape: var(--bew-corner-shape);
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
      /* Bpx owns height, padding-top and transform for virtual row positions.
         Keep the viewport below the fixed header instead of inserting a spacer. */
      background: var(--bewly-widescreen-sidebar-bg) !important;
    }

    /* Rows where the list's rows will be: below the column's head, the
       panel's head row and the labels, on the rows' content line. Before Bpx's box
       mounts it hangs in the panel itself, which starts at the same top. */
    #${ROOT_ID} .bewly-widescreen-danmaku-skeleton {
      position: absolute;
      inset: 0;
      z-index: 3;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      padding: 0 var(--bew-space-1) var(--bew-space-4);
      background: transparent;
      pointer-events: none;
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku > .bewly-widescreen-danmaku-skeleton {
      padding-top: var(--bewly-danmaku-list-top);
      padding-inline: calc(var(--bewly-widescreen-panel-inline) + var(--bew-space-1));
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku:has(.bewly-widescreen-danmaku-skeleton)
      .bpx-player-dm-load-status {
      visibility: hidden !important;
      background: transparent !important;
    }

    #${ROOT_ID} .bewly-widescreen-danmaku-skeleton__rows {
      display: grid;
    }

    /* Bpx's 24px rows, in the list's three columns. */
    #${ROOT_ID} .bewly-widescreen-danmaku-skeleton__row {
      display: grid;
      grid-template-columns: var(--bewly-danmaku-time-width) minmax(0, 1fr) var(--bewly-danmaku-date-width);
      align-items: center;
      height: var(--bew-space-6);
    }

    #${ROOT_ID} .bewly-widescreen-danmaku-skeleton__block {
      display: block;
      height: var(--bew-space-3, 12px);
      border-radius: var(--bew-radius-tiny);
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

    /* The edge fade's mask would clip the picker where it leaves the panel. */
    #${ROOT_ID} .bewly-widescreen-panel[data-bewly-comment-emoji-open] {
      -webkit-mask-image: none;
      mask-image: none;
    }

    #${ROOT_ID} .bewly-widescreen-panel[hidden] {
      display: none !important;
    }

    /* Border-box, so native padding (the collection box's) stays inside the
       column instead of pushing its right edge past the panel. */
    #${ROOT_ID} .bewly-widescreen-panel > *,
    #${ROOT_ID} .bewly-widescreen-panel-playlist > * {
      box-sizing: border-box !important;
      width: 100% !important;
      max-width: 100% !important;
      margin-left: 0 !important;
      margin-right: 0 !important;
    }

    /* The collection sits on the page like the rest of the column: no grey
       box, its content on the content line. It is its own section under the
       info's hairline, closed by its own, 16px on either side of each. */
    #${ROOT_ID} .bewly-widescreen-panel-playlist .video-pod {
      box-sizing: border-box !important;
      width: calc(100% + var(--bewly-widescreen-panel-inline) * 2) !important;
      max-width: none !important;
      margin-inline: calc(var(--bewly-widescreen-panel-inline) * -1) !important;
      padding: var(--bew-space-4) var(--bewly-widescreen-panel-inline) !important;
      border: 0 !important;
      border-bottom: var(--bew-hairline, 1px) solid var(--bew-separator-color) !important;
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

    #${ROOT_ID} .bewly-widescreen-panel-overview {
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

    #${ROOT_ID} .bewly-widescreen-panel-playlist .subscribe-btn {
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      box-sizing: border-box !important;
      width: auto !important;
      min-width: max-content !important;
      min-height: var(--bew-control-height-sm, 28px) !important;
      padding: 0 var(--bew-space-3, 12px) !important;
      flex: 0 0 auto !important;
      color: var(--bew-text-2) !important;
      background: transparent !important;
      border: var(--bew-hairline, 1px) solid var(--bew-edge-color) !important;
      border-radius: var(--bew-interactive-radius) !important;
      corner-shape: var(--bew-corner-shape);
      font-size: var(--bew-font-size-control, 13px) !important;
      font-weight: var(--bew-font-weight-regular, 400) !important;
      line-height: var(--bew-line-height-control, 16px) !important;
      white-space: nowrap !important;
      transition:
        color var(--bew-duration-fast, 150ms) var(--bew-ease-standard, ease),
        background-color var(--bew-duration-fast, 150ms) var(--bew-ease-standard, ease);
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist .subscribe-btn:hover {
      color: var(--bew-text-1) !important;
      background: var(--bew-hover-bg) !important;
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

    /* Bangumi wraps its comment list in a module with an 18px top padding a
       video page does not have: the sort row starts at the panel's top, as
       on a video page. */
    #${ROOT_ID} .bewly-widescreen-panel #comment-module {
      padding-top: 0 !important;
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

    /* Native lazy loading listens on the inner list, not action-list-container. */
    #${ROOT_ID} .bewly-widescreen-panel-playlist .action-list-container.${EPISODE_SECTION_CLASS} {
      display: flex !important;
      flex-direction: column !important;
      overflow: hidden !important;
      scrollbar-gutter: auto;
    }
    #${ROOT_ID} .bewly-widescreen-panel-playlist .action-list-header,
    #${ROOT_ID} .bewly-widescreen-panel-playlist .action-list-body-top,
    #${ROOT_ID} .bewly-widescreen-panel-playlist .action-list-body > .split-line {
      flex: none !important;
    }
    #${ROOT_ID} .bewly-widescreen-panel-playlist .action-list-body,
    #${ROOT_ID} .bewly-widescreen-panel-playlist .action-list-body-bottom {
      display: flex !important;
      flex: 1 1 auto !important;
      flex-direction: column !important;
      min-height: 0 !important;
      max-height: none !important;
      overflow: hidden !important;
    }
    #${ROOT_ID} .bewly-widescreen-panel-playlist #playlist-video-action-list {
      flex: 1 1 auto !important;
      height: auto !important;
      min-height: 0 !important;
      max-height: none !important;
      overflow-y: auto !important;
      overscroll-behavior: auto !important;
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

    /* Bangumi's directory sits on the page like a collection: each section
       (main episodes, extras) is flat, between hairlines that reach the
       column's edges; its own inner padding already holds the content line. */
    #${ROOT_ID} .bewly-widescreen-panel-playlist [class*="PaginatedEpList_root"].${EPISODE_SECTION_CLASS} {
      width: calc(100% + var(--bewly-widescreen-panel-inline) * 2) !important;
      max-width: none !important;
      margin-inline: calc(var(--bewly-widescreen-panel-inline) * -1) !important;
    }

    /* Each section reaches the column's edges (its hairline with it); its
       parts (header, tabs, list) pad space-4 on either side, as Bilibili's
       do, so the section's own padding puts them on the content line. */
    #${ROOT_ID} .bewly-widescreen-panel-playlist [class*="SectionPanel_panel"] {
      margin: 0 !important;
      padding: 0 calc(var(--bewly-widescreen-panel-inline) + var(--bew-space-1) - var(--bew-space-4)) !important;
      border-top: var(--bew-hairline, 1px) solid var(--bew-separator-color) !important;
      border-radius: 0 !important;
      background: transparent !important;
    }

    /* Bilibili's episode scroller pads 16px on the left and 10px on the
       right; even (space-4), its tiles and rows end on the content line too.
       The space under the list is the scroller's own, so it scrolls down to
       the section's hairline and fades there (playlist.ts marks it). */
    #${ROOT_ID} .bewly-widescreen-panel-playlist [class*="EpisodeVirtualList_scroll"] {
      /* Bilibili's virtual list places its rows at this step (translateY). */
      --bewly-pgc-episode-row: 71px;
      overflow: hidden auto !important;
      padding: var(--bew-space-1) var(--bew-space-4) var(--bew-space-4) !important;
      scroll-padding-block: var(--bew-space-1) var(--bew-space-4);
    }

    /* A section folds to its header with the rail's chevron (playlist.ts
       syncPgcSections), as the info card folds: the tabs and the list close
       their height together. */
    #${ROOT_ID} .bewly-widescreen-panel-playlist [${PGC_SECTION_ATTRIBUTE}] > :is([class*="SectionTabs_wrap"], [class*="PageTabs_container"], [class*="EpisodeVirtualList_scroll"]) {
      interpolate-size: allow-keywords;
      height: auto;
      min-height: 0;
      opacity: 1;
      transition:
        height var(--bew-duration-normal) var(--bew-ease-standard),
        padding-block var(--bew-duration-normal) var(--bew-ease-standard),
        opacity var(--bew-duration-normal) var(--bew-ease-standard),
        visibility var(--bew-duration-normal) var(--bew-ease-standard);
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist [${PGC_SECTION_ATTRIBUTE}="folded"] > :is([class*="SectionTabs_wrap"], [class*="PageTabs_container"], [class*="EpisodeVirtualList_scroll"]) {
      height: 0 !important;
      padding-block: 0 !important;
      overflow: clip !important;
      opacity: 0;
      visibility: hidden;
    }

    ${reducedMotionCss(`#${ROOT_ID} .bewly-widescreen-panel-playlist [${PGC_SECTION_ATTRIBUTE}] > :is([class*="SectionTabs_wrap"], [class*="PageTabs_container"], [class*="EpisodeVirtualList_scroll"])`, 'transition:none;')}

    #${ROOT_ID} .bewly-widescreen-panel-playlist [class*="PaginatedEpList_root"] {
      border-bottom: var(--bew-hairline, 1px) solid var(--bew-separator-color) !important;
      background: transparent !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist [class*="SectionHeader_header"] {
      align-items: center !important;
      padding-inline: var(--bew-space-4) !important;
      background: transparent !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist .${EPISODE_SECTION_CLASS} h3 {
      margin: 0 !important;
      color: var(--bew-text-1) !important;
      font-size: var(--bew-font-size-title) !important;
      line-height: var(--bew-line-height-title) !important;
      font-weight: var(--bew-font-weight-regular) !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist :is([class*="SectionHeader_mode"], [class*="SectionHeader_order"]) {
      display: inline-grid !important;
      place-items: center;
      width: var(--bew-control-height-sm) !important;
      height: var(--bew-control-height-sm) !important;
      padding: 0 !important;
      border: 0 !important;
      border-radius: var(--bew-interactive-radius) !important;
      corner-shape: var(--bew-corner-shape);
      color: var(--bew-text-2) !important;
      background: transparent !important;
      transition:
        color var(--bew-duration-fast) var(--bew-ease-standard),
        background-color var(--bew-duration-fast) var(--bew-ease-standard);
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist :is([class*="SectionHeader_mode"], [class*="SectionHeader_order"]):hover {
      color: var(--bew-text-1) !important;
      background: var(--bew-hover-bg) !important;
    }

    /* Season / range tabs are a standalone segment: rounded rectangles, the
       chosen one on the selected surface. */
    #${ROOT_ID} .bewly-widescreen-panel-playlist :is([class*="SectionTabs_tab"], [class*="PageTabs_tab"]) {
      height: var(--bew-control-height-sm) !important;
      padding: 0 var(--bew-space-3) !important;
      border: 0 !important;
      border-radius: var(--bew-interactive-radius) !important;
      corner-shape: var(--bew-corner-shape);
      color: var(--bew-text-2) !important;
      background: transparent !important;
      font-size: var(--bew-font-size-control) !important;
      line-height: var(--bew-line-height-control) !important;
      white-space: nowrap !important;
      transition:
        color var(--bew-duration-fast) var(--bew-ease-standard),
        background-color var(--bew-duration-fast) var(--bew-ease-standard);
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist :is([class*="SectionTabs_tab"], [class*="PageTabs_tab"]):hover {
      color: var(--bew-text-1) !important;
      background: var(--bew-hover-bg) !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist :is([class*="SectionTabs_active"], [class*="PageTabs_active"]) {
      color: var(--bew-text-1) !important;
      background: var(--bew-selected-bg) !important;
    }

    /* Bilibili's arrow beside the tabs opens a menu listing the same tabs
       again; the section's chevron folds it instead (syncPgcSections), and
       the tab row scrolls under its edge fade. */
    #${ROOT_ID} .bewly-widescreen-panel-playlist :is([class*="SectionTabs_expand"], [class*="PageTabs_expand"]) {
      display: none !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist [class*="SectionTabs_wrap"] {
      padding: 0 var(--bew-space-4) var(--bew-space-2) !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist :is([class*="SectionTabs_scroller"], [class*="PageTabs_wrap"]) {
      gap: var(--bew-space-1) !important;
      padding-right: 0 !important;
      scrollbar-width: none;
    }

    /* Episode numbers fill their row in equal squares-ish tiles, so a whole
       "第十二话" fits; the badge is a small label in the tile's corner. */
    #${ROOT_ID} .bewly-widescreen-panel-playlist [class*="EpisodeVirtualList_gridRow"] {
      justify-content: start !important;
      column-gap: var(--bew-space-2) !important;
    }

    /* Bilibili sets each row's column count inline (repeat(n, 56px)); the
       count stays, the columns share the row. */
    ${EPISODE_GRID_COLUMN_COUNTS.map(count => `#${ROOT_ID} .bewly-widescreen-panel-playlist [class*="EpisodeVirtualList_gridRow"][style*="repeat(${count},"] { grid-template-columns: repeat(${count}, minmax(0, 1fr)) !important; }`).join('\n    ')}

    #${ROOT_ID} .bewly-widescreen-panel-playlist [class*="EpisodeVirtualList_numberItem"] {
      width: auto !important;
      min-width: 0 !important;
      border: 0 !important;
      border-radius: var(--bew-interactive-radius) !important;
      corner-shape: var(--bew-corner-shape);
      color: var(--bew-text-1) !important;
      background: var(--bew-fill-1) !important;
      transition: background-color var(--bew-duration-fast) var(--bew-ease-standard);
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist [class*="EpisodeVirtualList_numberItem"]:hover {
      background: var(--bew-fill-2) !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist [class*="EpisodeVirtualList_numberTitle"] {
      color: inherit !important;
      font-size: var(--bew-font-size-control) !important;
      line-height: var(--bew-line-height-control) !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist [class*="EpisodeVirtualList_numberBadge"] {
      top: var(--bew-space-1) !important;
      right: var(--bew-space-1) !important;
      padding: 0 var(--bew-space-1) !important;
      border-radius: var(--bew-radius-tiny) !important;
      font-size: var(--bew-font-size-caption-2) !important;
      line-height: var(--bew-line-height-caption-2) !important;
    }

    /* List rows are cards that touch: each fills its whole virtual row
       (Bilibili places rows at a fixed step, --bewly-pgc-episode-row), its
       fill wraps the cover with space-1 and so takes the cover's radius plus
       that space, and it reaches space-1 past the content line, so the cover
       stays on it. */
    #${ROOT_ID} .bewly-widescreen-panel-playlist [class*="EpisodeVirtualList_listItem"] {
      box-sizing: border-box !important;
      height: var(--bewly-pgc-episode-row) !important;
      margin: 0 calc(var(--bew-space-1) * -1) !important;
      padding: var(--bew-space-1) !important;
      border-radius: calc(var(--bew-thumb-radius) + var(--bew-space-1)) !important;
      corner-shape: var(--bew-corner-shape);
      transition: background-color var(--bew-duration-fast) var(--bew-ease-standard);
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist [class*="EpisodeVirtualList_listItem"]:hover {
      background: var(--bew-hover-bg) !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist [class*="EpisodeVirtualList_cover"] {
      flex: none !important;
      width: auto !important;
      height: 100% !important;
      aspect-ratio: 16 / 9;
      margin: 0 var(--bew-space-3) 0 0 !important;
      border-radius: var(--bew-thumb-radius) !important;
      corner-shape: var(--bew-corner-shape);
      box-shadow: var(--bew-media-shadow);
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist [class*="EpisodeVirtualList_cover"] img {
      width: 100% !important;
      height: 100% !important;
      object-fit: cover;
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist [class*="EpisodeVirtualList_copy"] {
      color: var(--bew-text-2) !important;
      font-size: var(--bew-font-size-caption) !important;
      line-height: var(--bew-line-height-caption) !important;
    }

    /* Titles are text-1 in every row, the playing one included: it is marked
       by the selected surface, not Bilibili's coloured title. */
    #${ROOT_ID} .bewly-widescreen-panel-playlist .${EPISODE_SECTION_CLASS} strong {
      color: var(--bew-text-1) !important;
      font-size: var(--bew-font-size-control) !important;
      line-height: var(--bew-line-height-control) !important;
      font-weight: var(--bew-font-weight-regular) !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist [class*="EpisodeVirtualList_active"] {
      color: var(--bew-text-1) !important;
      background: var(--bew-selected-bg) !important;
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

    #${ROOT_ID} .bewly-widescreen-panel-playlist :is(.video-pod__item, .video-page-card-small, .video-page-special-card-small) {
      margin: 0 0 var(--bew-space-1) !important;
      padding: 0 !important;
    }

    /* The promoted card heading the recommendations is one more row. */
    #${ROOT_ID} .bewly-widescreen-panel-playlist :is(.normal-base-item, .simple-base-item, :is(.video-page-card-small, .video-page-special-card-small) .card-box) {
      display: flex !important;
      align-items: flex-start !important;
      gap: var(--bew-space-3) !important;
      height: auto !important;
      margin: 0 calc(var(--bew-space-1) * -1) !important;
      padding: var(--bew-space-1) !important;
      background: transparent !important;
      border-radius: calc(var(--bew-thumb-radius) + var(--bew-space-1)) !important;
      corner-shape: var(--bew-corner-shape);
      transition: background-color var(--bew-duration-fast, 150ms) var(--bew-ease-standard, ease);
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist .simple-base-item {
      align-items: center !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist :is(.normal-base-item, .simple-base-item, :is(.video-page-card-small, .video-page-special-card-small) .card-box):hover {
      background: var(--bew-hover-bg) !important;
    }

    /* Thumbnails are framed like every cover (contentCard.media-frame): a
       hairline drawn over the image and the media shadow. */
    #${ROOT_ID} .bewly-widescreen-panel-playlist :is(.normal-base-item .cover, :is(.video-page-card-small, .video-page-special-card-small) .pic-box) {
      position: relative !important;
      flex: 0 0 var(--bewly-widescreen-row-thumb-width) !important;
      width: var(--bewly-widescreen-row-thumb-width) !important;
      height: auto !important;
      aspect-ratio: 16 / 9;
      margin: 0 !important;
      border-radius: var(--bew-thumb-radius) !important;
      corner-shape: var(--bew-corner-shape);
      box-shadow: var(--bew-media-shadow);
      overflow: hidden !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist :is(.normal-base-item .cover, :is(.video-page-card-small, .video-page-special-card-small) .pic-box)::after {
      content: "";
      position: absolute;
      inset: 0;
      z-index: 4;
      border: var(--bew-hairline) solid var(--bew-media-edge-color);
      border-radius: inherit;
      corner-shape: inherit;
      pointer-events: none;
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist .normal-base-item .cover .cover-img,
    #${ROOT_ID} .bewly-widescreen-panel-playlist :is(.video-page-card-small, .video-page-special-card-small) .pic-box :is(.pic, .framepreview-box, .video-awesome-img, .b-img, picture, img) {
      width: 100% !important;
      height: 100% !important;
      object-fit: cover;
    }

    /* Bpx offsets the picture 10px down inside its frame, which shows a grey
       band above it and crops its bottom. */
    #${ROOT_ID} .bewly-widescreen-panel-playlist .video-page-card-small .pic-box .video-awesome-img {
      inset: 0 !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist .video-page-special-card-small .pic-box > .pic {
      display: block !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist :is(.normal-base-item .info, :is(.video-page-card-small, .video-page-special-card-small) .info) {
      display: flex !important;
      flex: 1 1 auto !important;
      flex-direction: column !important;
      gap: var(--bew-space-1) !important;
      min-width: 0 !important;
      height: auto !important;
      margin: 0 !important;
      padding: 0 !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist :is(.normal-base-item, .simple-base-item, .video-page-card-small, .video-page-special-card-small) .title {
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

    /* Caption lines under the title, spaced like the info's meta line: 4px
       from an icon to its value, 12px between values. */
    #${ROOT_ID} .bewly-widescreen-panel-playlist :is(.normal-base-item .stats, .video-page-card-small :is(.upname, .playinfo), .video-page-special-card-small .desc) {
      display: flex !important;
      align-items: center !important;
      gap: var(--bew-space-1) var(--bew-space-3) !important;
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
      margin: 0 !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist .normal-base-item .stats .stat-item,
    #${ROOT_ID} .bewly-widescreen-panel-playlist .video-page-card-small .upname a {
      display: inline-flex !important;
      align-items: center !important;
      gap: var(--bew-space-1) !important;
      margin: 0 !important;
    }

    /* A collection row's info is as tall as its thumbnail: the title at the
       top and the caption line on the thumbnail's bottom edge, so the counts
       line up across rows and columns whatever the title's length. The line
       never wraps: the counts give way first (a count is never split from
       its unit). */
    #${ROOT_ID} .bewly-widescreen-panel-playlist .normal-base-item .info {
      align-self: stretch !important;
      justify-content: space-between !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist .normal-base-item .stats {
      flex-wrap: nowrap !important;
      min-width: 0 !important;
      white-space: nowrap !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist .normal-base-item .stats .stat-item:not(.expand-btn) {
      flex: 0 1 auto !important;
      min-width: 0 !important;
      overflow: hidden !important;
    }

    /* The recommendation's counts are flat icon, value pairs. */
    #${ROOT_ID} .bewly-widescreen-panel-playlist .video-page-card-small .playinfo {
      column-gap: var(--bew-space-1) !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist .video-page-card-small .playinfo svg ~ svg {
      margin-inline-start: var(--bew-space-2) !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist .video-page-card-small .upname :is(a, .name) {
      color: inherit !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist .video-page-card-small .upname a:hover {
      color: var(--bew-text-1) !important;
    }

    /* The collection's episodes keep their rows, two to a line. Long
       collections use Bilibili's virtual list, which positions rows itself. */
    #${ROOT_ID} .bewly-widescreen-panel-playlist .video-pod__list {
      display: grid !important;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      column-gap: var(--bew-space-3);
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist .video-pod__list > .video-pod__item {
      min-width: 0;
    }

    /* A collection with multi-part videos lists one video to a line. All
       videos use the same cover-first card in the left half; only videos
       with parts fill the right half. The list is as tall as the card and
       scrolls inside it (the edge fade is added in playlist.ts). Bilibili folds the parts
       of every video but the playing one (v-show); beside the card they
       always show, so the fold button goes. */
    #${ROOT_ID} .bewly-widescreen-panel-playlist .video-pod__list.section:has(.multi-p) {
      grid-template-columns: minmax(0, 1fr);
      row-gap: var(--bew-space-2);
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist .video-pod__list.section:has(.multi-p) > .video-pod__item,
    #${ROOT_ID} .bewly-widescreen-panel-playlist .multi-p {
      display: grid !important;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      column-gap: var(--bew-space-3);
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist .multi-p {
      grid-column: 1 / -1;
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist .video-pod__list.section:has(.multi-p) .normal-base-item {
      flex-direction: column !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist .video-pod__list.section:has(.multi-p) .normal-base-item .cover {
      flex: none !important;
      width: 100% !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist .video-pod__list.section:has(.multi-p) .normal-base-item .title {
      min-height: calc(var(--bew-line-height-control) * 2) !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist .multi-p > .page-list {
      display: block !important;
      contain: size;
      margin: 0 calc(var(--bew-space-1) * -1) !important;
      padding: 0 !important;
      overflow: hidden auto !important;
      overscroll-behavior: contain;
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist .multi-p .stats .expand-btn {
      display: none !important;
    }

    /* Parts are compact text rows: a collection video's parts beside its
       card, and a multi-part video's own list (.multip), one to a line
       since part titles run long. Row height, interactive corners, the
       title one line in text-2 (text-1 on hover and while playing), the
       duration a caption. The playing part carries the selected surface and
       the marker, not the video's card. */

    #${ROOT_ID} .bewly-widescreen-panel-playlist .video-pod__list.multip.list {
      grid-template-columns: minmax(0, 1fr);
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist :is(.multi-p > .page-list, .video-pod__list.multip) > .simple-base-item {
      gap: var(--bew-space-2) !important;
      min-height: var(--bew-row-height) !important;
      margin: 0 calc(var(--bew-space-1) * -1) !important;
      padding: 0 var(--bew-space-2) !important;
      border-radius: var(--bew-interactive-radius) !important;
    }

    /* The list beside a card already reaches past the column by space-1
       (its scroller would clip the rows' own overhang). */
    #${ROOT_ID} .bewly-widescreen-panel-playlist .multi-p > .page-list > .simple-base-item {
      margin: 0 !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist :is(.multi-p, .video-pod__list.multip) .simple-base-item .title {
      display: flex !important;
      align-items: center !important;
      min-width: 0 !important;
      -webkit-line-clamp: unset;
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist :is(.multi-p, .video-pod__list.multip) .simple-base-item .title::before {
      flex: none;
    }

    /* The native page's hover tints a row's title-txt with the theme colour
       (videoPage.scss); in the rail it follows its row's title. */
    #${ROOT_ID} .bewly-widescreen-panel-playlist .simple-base-item .title-txt {
      color: inherit !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist :is(.multi-p, .video-pod__list.multip) .simple-base-item .title-txt {
      font-size: inherit !important;
      line-height: var(--bew-line-height-control) !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist :is(.multi-p > .page-list, .video-pod__list.multip) > .simple-base-item :is(.title, .title-txt) {
      color: var(--bew-text-2) !important;
      transition: color var(--bew-duration-fast) var(--bew-ease-standard);
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist :is(.multi-p > .page-list, .video-pod__list.multip) > .simple-base-item:is(:hover, .active) :is(.title, .title-txt) {
      color: var(--bew-text-1) !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist :is(.multi-p, .video-pod__list.multip) .simple-base-item .stats {
      flex: none !important;
      margin: 0 !important;
      color: var(--bew-text-3) !important;
      font-size: var(--bew-font-size-caption) !important;
      font-variant-numeric: tabular-nums;
      line-height: var(--bew-line-height-caption) !important;
    }

    /* A multi-part video's tile view: part numbers fill the row in equal
       tiles, like bangumi's episode numbers. */
    #${ROOT_ID} .bewly-widescreen-panel-playlist .video-pod__list.multip.grid {
      grid-template-columns: repeat(auto-fill, minmax(var(--bew-space-12), 1fr));
      gap: var(--bew-space-2);
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist .video-pod__list.multip.grid > .page {
      width: auto !important;
      min-width: 0 !important;
      height: var(--bew-control-height) !important;
      margin: 0 !important;
      border: 0 !important;
      border-radius: var(--bew-interactive-radius) !important;
      corner-shape: var(--bew-corner-shape);
      color: var(--bew-text-1) !important;
      background: var(--bew-fill-1) !important;
      font-size: var(--bew-font-size-control) !important;
      font-variant-numeric: tabular-nums;
      line-height: var(--bew-line-height-control) !important;
      transition: background-color var(--bew-duration-fast) var(--bew-ease-standard);
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist .video-pod__list.multip.grid > .page:hover {
      background: var(--bew-fill-2) !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist .video-pod__list.multip.grid > .page.active {
      background: var(--bew-selected-bg) !important;
    }

    /* The list / tile switch beside a multi-part video's title is a quiet
       icon button, like bangumi's section header buttons. */
    #${ROOT_ID} .bewly-widescreen-panel-playlist .video-pod__header .view-mode {
      display: inline-grid !important;
      place-items: center;
      width: var(--bew-control-height-sm);
      height: var(--bew-control-height-sm);
      margin-inline-start: var(--bew-space-1);
      border-radius: var(--bew-interactive-radius);
      corner-shape: var(--bew-corner-shape);
      color: var(--bew-text-2);
      transition:
        color var(--bew-duration-fast) var(--bew-ease-standard),
        background-color var(--bew-duration-fast) var(--bew-ease-standard);
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist .video-pod__header .view-mode:hover {
      color: var(--bew-text-1);
      background: var(--bew-hover-bg);
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist .video-pod__header .view-mode .icon {
      width: var(--bew-icon-size-sm) !important;
      height: var(--bew-icon-size-sm) !important;
      color: inherit !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist .multi-p > .active:not(:hover) {
      background: transparent !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist .multi-p > .active .title::before {
      content: none !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist .pod-slide .show-more-btn-icon {
      display: none !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist .pod-slide .show-more-btn::before {
      content: "";
      width: var(--bew-icon-size-sm);
      height: var(--bew-icon-size-sm);
      background: currentColor;
      mask: ${DISCLOSURE_CHEVRON_MASK} center / contain no-repeat;
      transition: rotate var(--bew-duration-normal) var(--bew-ease-standard);
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist .pod-slide .show-more-btn.active::before {
      rotate: 180deg;
    }

    ${reducedMotionCss(`#${ROOT_ID} .bewly-widescreen-panel-playlist .pod-slide .show-more-btn::before`, 'transition:none;')}

    /* A collection's section tabs (.pod-slide) are a standalone segment like
       bangumi's season tabs. When they overflow, Bilibili keeps 43px at the
       end for its "more" button (it positions the tabs around that width):
       the tabs fade out under it instead of its grey gradient, the button is
       a quiet chevron square, and its list of every section opens below as a
       player popover with menu rows. */
    #${ROOT_ID} .bewly-widescreen-panel-playlist .video-pod__slide {
      --slide-height: var(--bew-control-height-sm);
      margin: 0 !important;
      padding: 0 0 var(--bew-space-3) !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist .pod-slide .slide-inner .slide-item {
      padding: 0 var(--bew-space-3) !important;
      border: 0 !important;
      border-radius: var(--bew-interactive-radius) !important;
      corner-shape: var(--bew-corner-shape);
      color: var(--bew-text-2) !important;
      background: transparent !important;
      font-size: var(--bew-font-size-control) !important;
      font-weight: var(--bew-font-weight-regular) !important;
      line-height: var(--bew-control-height-sm) !important;
      transition:
        color var(--bew-duration-fast) var(--bew-ease-standard),
        background-color var(--bew-duration-fast) var(--bew-ease-standard) !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist .pod-slide .slide-inner .slide-item + .slide-item {
      margin-inline-start: var(--bew-space-1) !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist .pod-slide .slide-inner .slide-item:hover {
      color: var(--bew-text-1) !important;
      background: var(--bew-hover-bg) !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist .pod-slide .slide-inner .slide-item.active {
      color: var(--bew-text-1) !important;
      background: var(--bew-selected-bg) !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist .pod-slide .slide-item::before {
      content: none !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist .pod-slide:has(> .show-more) .slide-viewport {
      mask-image: linear-gradient(to left, transparent var(--bew-control-height-sm), #000 calc(var(--bew-control-height-sm) + var(--bew-space-4)));
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist .pod-slide .show-more {
      background: transparent !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist .pod-slide .show-more .show-more-btn {
      display: grid !important;
      place-items: center;
      width: var(--bew-control-height-sm) !important;
      height: var(--bew-control-height-sm) !important;
      border-radius: var(--bew-interactive-radius);
      corner-shape: var(--bew-corner-shape);
      color: var(--bew-text-2) !important;
      transition:
        color var(--bew-duration-fast) var(--bew-ease-standard),
        background-color var(--bew-duration-fast) var(--bew-ease-standard);
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist .pod-slide .show-more .show-more-btn:is(:hover, .active) {
      color: var(--bew-text-1) !important;
      background: var(--bew-hover-bg);
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist .pod-slide .pod-slide-more-panel {
      top: calc(var(--slide-height) + var(--bew-space-1)) !important;
      padding: var(--bew-popover-padding) !important;
      ${PLAYER_POPOVER_SURFACE}
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist .pod-slide .pod-slide-more-panel .slide-item {
      height: var(--bew-row-height) !important;
      padding: 0 var(--bew-space-2) !important;
      border-radius: var(--bew-interactive-radius);
      corner-shape: var(--bew-corner-shape);
      color: var(--bew-text-1) !important;
      font-size: var(--bew-font-size-control) !important;
      line-height: var(--bew-row-height) !important;
      transition: background-color var(--bew-duration-fast) var(--bew-ease-standard);
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist .pod-slide .pod-slide-more-panel .slide-item:hover {
      background: var(--bew-hover-bg) !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist .pod-slide .pod-slide-more-panel .slide-item.active {
      background: var(--bew-selected-bg) !important;
    }

    /* The recommendations (Up next) are two columns of video cards like the
       homepage's: the cover on top in the video card ratio and radius, the
       title and caption lines under it, no fill; hover lifts the whole card
       (contentCard.hover-lift). The autoplay pick (.next-play) is the queue's
       first card, not a row of its own: both wrappers dissolve into one grid
       under the "Up next" heading, with no rule between them (user-specified).
       Anything that is not a video card (the heading, the promoted card shown
       only with ad blocking off) spans the row. */
    #${ROOT_ID} .bewly-widescreen-panel-playlist :is(.recommend-list-v1, .recommend-list) {
      display: grid !important;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--bew-space-4) var(--bew-space-3);
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist :is(.next-play, .rec-list) {
      display: contents !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist :is(.recommend-list-v1, .recommend-list) > :not(.next-play, .rec-list),
    #${ROOT_ID} .bewly-widescreen-panel-playlist :is(.next-play, .rec-list) > :not(.video-page-card-small) {
      grid-column: 1 / -1;
      min-width: 0;
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist :is(.next-play, .rec-list) > :is(.video-page-card-small, .video-page-special-card-small) {
      min-width: 0;
      margin: 0 !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist .next-play > .split-line {
      display: none !important;
    }

    /* The heading sits a section title's 12px above the first row, inside
       the grid's 16px row gap. */
    #${ROOT_ID} .bewly-widescreen-panel-playlist .next-play > .rec-title {
      height: auto !important;
      margin: 0 0 calc(var(--bew-space-3) - var(--bew-space-4)) !important;
      padding: 0 !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist :is(.next-play, .rec-list) .video-page-card-small .card-box {
      position: relative;
      flex-direction: column !important;
      align-items: stretch !important;
      gap: var(--bew-space-3) !important;
      margin: 0 !important;
      padding: 0 !important;
      transform-origin: left center;
      transition:
        transform var(--bew-duration-moderate) var(--bew-ease-emphasized),
        z-index 0s linear var(--bew-duration-moderate);
    }

    /* Each column grows away from the panel edge so the lifted card is not
       clipped by the scroller. The autoplay pick takes the first cell, which
       moves every following card over by one column. */
    #${ROOT_ID} .bewly-widescreen-panel-playlist .rec-list > :nth-child(even of .video-page-card-small) .card-box {
      transform-origin: right center;
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist .next-play ~ .rec-list > :nth-child(even of .video-page-card-small) .card-box {
      transform-origin: left center;
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist .next-play ~ .rec-list > :nth-child(odd of .video-page-card-small) .card-box {
      transform-origin: right center;
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist :is(.next-play, .rec-list) .video-page-card-small .card-box:hover {
      background: transparent !important;
    }

    @media (hover: hover) and (pointer: fine) {
      #${ROOT_ID} .bewly-widescreen-panel-playlist :is(.next-play, .rec-list) .video-page-card-small .card-box:hover {
        z-index: 1;
        transform: scale(var(--bew-compact-card-hover-scale));
        transition: transform var(--bew-duration-moderate) var(--bew-ease-emphasized);
      }
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist :is(.next-play, .rec-list) .video-page-card-small .pic-box {
      flex: none !important;
      width: 100% !important;
      aspect-ratio: var(--bew-video-cover-aspect-ratio, 40 / 21);
      border-radius: var(--bew-media-radius) !important;
    }

    /* Watch later is in the card menu, as on every video cover. */
    #${ROOT_ID} .bewly-widescreen-panel-playlist :is(.next-play, .rec-list) .video-page-card-small .watch-later-video {
      display: none !important;
    }

    /* The hover preview fills the cover: Bpx sizes its inline player 190x107
       and rounds it with its own plain corners. It takes the cover's contour
       instead, so the clip matches the picture under it. */
    #${ROOT_ID} .bewly-widescreen-panel-playlist :is(.next-play, .rec-list) .video-page-card-small .v-recommend-inline-player,
    #${ROOT_ID} .bewly-widescreen-panel-playlist :is(.next-play, .rec-list) .video-page-card-small .v-recommend-inline-player :is(.bpx-docker, .bpx-player-container) {
      width: 100% !important;
      height: 100% !important;
      border-radius: inherit !important;
      corner-shape: inherit !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist :is(.next-play, .rec-list) .video-page-card-small .v-recommend-inline-player video {
      object-fit: cover;
    }

    /* Under the title, the uploader and the counts share one caption line,
       as on the homepage's cards; the counts wrap below a long name. The UP
       badge goes: the line's place already says it is the author. */
    #${ROOT_ID} .bewly-widescreen-panel-playlist :is(.next-play, .rec-list) .video-page-card-small .info {
      flex-flow: row wrap !important;
      align-items: center !important;
      gap: var(--bew-space-1) var(--bew-space-3) !important;
      width: 100% !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist :is(.next-play, .rec-list) .video-page-card-small .info > a {
      flex: 1 0 100%;
      min-width: 0;
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist :is(.next-play, .rec-list) .video-page-card-small .upname {
      flex: 0 1 auto !important;
      min-width: 0;
      max-width: 100%;
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist :is(.next-play, .rec-list) .video-page-card-small .upname a {
      max-width: 100%;
    }

    /* Bilibili sizes the name to the line minus the badge's room. */
    #${ROOT_ID} .bewly-widescreen-panel-playlist :is(.next-play, .rec-list) .video-page-card-small .upname .name {
      width: auto !important;
      min-width: 0;
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist :is(.next-play, .rec-list) .video-page-card-small .upname svg {
      display: none !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist :is(.next-play, .rec-list) .video-page-card-small .playinfo {
      flex: none !important;
    }

    ${reducedMotionCss(`#${ROOT_ID} .bewly-widescreen-panel-playlist :is(.next-play, .rec-list) .video-page-card-small .card-box, #${ROOT_ID} .bewly-widescreen-panel-playlist :is(.next-play, .rec-list) .video-page-card-small .card-box:hover`, 'transition:none;transform:none;')}

    /* Bangumi's related recommendations read like a video's (above): two
       columns, the cover on top, the title and caption lines under it, the
       same hover lift growing away from the panel edge. Its heading is the
       title role and the directory's hairline is its top line. */
    #${ROOT_ID} .bewly-widescreen-panel-playlist [class*="recommend_wrap"] {
      box-sizing: border-box !important;
      margin: 0 !important;
      padding: var(--bew-space-4) var(--bew-space-1) 0 !important;
      border-top: 0 !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist [class*="recommend_title"] {
      margin: 0 0 var(--bew-space-3) !important;
      color: var(--bew-text-1) !important;
      font-size: var(--bew-font-size-title) !important;
      line-height: var(--bew-line-height-title) !important;
      font-weight: var(--bew-font-weight-regular) !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist .${PGC_RECOMMEND_LIST_CLASS} {
      display: grid !important;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--bew-space-4) var(--bew-space-3);
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist [class*="RecommendItem_wrap"] {
      position: relative;
      min-width: 0;
      margin: 0 !important;
      padding: 0 !important;
      transform-origin: left center;
      transition:
        transform var(--bew-duration-moderate) var(--bew-ease-emphasized),
        z-index 0s linear var(--bew-duration-moderate);
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist .${PGC_RECOMMEND_LIST_CLASS} > :nth-child(even) {
      transform-origin: right center;
    }

    @media (hover: hover) and (pointer: fine) {
      #${ROOT_ID} .bewly-widescreen-panel-playlist [class*="RecommendItem_wrap"]:hover {
        z-index: 1;
        transform: scale(var(--bew-compact-card-hover-scale));
        transition: transform var(--bew-duration-moderate) var(--bew-ease-emphasized);
      }
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist .${PGC_RECOMMEND_LIST_CLASS} a {
      display: flex !important;
      flex-direction: column !important;
      align-items: stretch !important;
      gap: var(--bew-space-3) !important;
      height: auto !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist [class*="RecommendItem_cover"] {
      position: relative;
      flex: none !important;
      width: 100% !important;
      height: auto !important;
      aspect-ratio: var(--bew-video-cover-aspect-ratio, 40 / 21);
      margin: 0 !important;
      border-radius: var(--bew-media-radius) !important;
      corner-shape: var(--bew-corner-shape);
      overflow: hidden;
      box-shadow: var(--bew-media-shadow);
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist [class*="RecommendItem_cover"]::after {
      content: "";
      position: absolute;
      inset: 0;
      border: var(--bew-hairline, 1px) solid var(--bew-media-edge-color);
      border-radius: inherit;
      corner-shape: inherit;
      pointer-events: none;
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist .${PGC_RECOMMEND_LIST_CLASS} img {
      width: 100% !important;
      height: 100% !important;
      object-fit: cover;
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist [class*="RecommendItem_right_wrap"] {
      width: 100% !important;
      height: auto !important;
      margin: 0 !important;
      padding: 0 !important;
      color: var(--bew-text-2) !important;
      font-size: var(--bew-font-size-caption) !important;
      line-height: var(--bew-line-height-caption) !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist [class*="RecommendItem_title"] {
      height: auto !important;
      margin-bottom: var(--bew-space-1) !important;
      color: var(--bew-text-1) !important;
      font-size: var(--bew-font-size-control) !important;
      line-height: var(--bew-line-height-control) !important;
      font-weight: var(--bew-font-weight-regular) !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist :is([class*="RecommendItem_sub_wrap"], [class*="RecommendItem_showindex"], [class*="RecommendItem_data"]) {
      color: inherit !important;
      font-size: inherit !important;
      line-height: inherit !important;
    }

    ${reducedMotionCss(`#${ROOT_ID} .bewly-widescreen-panel-playlist [class*="RecommendItem_wrap"], #${ROOT_ID} .bewly-widescreen-panel-playlist [class*="RecommendItem_wrap"]:hover`, 'transition:none;transform:none;')}

    #${ROOT_ID} .bewly-widescreen-panel-playlist :is(.normal-base-item, .simple-base-item).active {
      background: var(--bew-selected-bg) !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist :is(.normal-base-item, .simple-base-item).active :is(.title, .title .title-txt) {
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
       collection's and the comment header. */
    #${ROOT_ID} .bewly-widescreen-panel-playlist .rec-title .title-txt {
      color: var(--bew-text-1) !important;
      font-size: var(--bew-font-size-title) !important;
      font-weight: var(--bew-font-weight-regular) !important;
      line-height: var(--bew-line-height-title) !important;
    }

    /* No autoplay switch beside it (user-specified); the setting stays in
       Bpx's own playback settings. */
    #${ROOT_ID} .bewly-widescreen-panel-playlist .rec-title .continuous-btn {
      display: none !important;
    }

    /* Durations on thumbnails are captions too: a text label on the cover
       scrim, one space-1 in from the corner. */
    #${ROOT_ID} .bewly-widescreen-panel-playlist .pic-box .duration {
      right: var(--bew-space-1) !important;
      bottom: var(--bew-space-1) !important;
      height: auto !important;
      padding: 0 var(--bew-space-1) !important;
      border-radius: var(--bew-radius-tiny) !important;
      corner-shape: var(--bew-corner-shape);
      background: var(--bew-cover-scrim) !important;
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
      font-weight: var(--bew-font-weight-regular) !important;
      line-height: var(--bew-line-height-title) !important;
    }

    /* Under the title, one caption line (views, the description popover)
       beside the collapse and subscribe buttons, 8px down. The list below
       needs no rule above it: its edge fades while it scrolls. */
    #${ROOT_ID} .bewly-widescreen-panel-playlist .video-pod__header .header-bottom {
      align-items: center !important;
      margin-top: var(--bew-space-2) !important;
      padding: 0 !important;
      border-bottom: 0 !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist .video-pod__header .header-bottom > .left {
      align-items: center !important;
      gap: var(--bew-space-3) !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist .video-pod__header :is(.amt, .header-bottom > .left, .header-bottom > .left :is(.total-view, .description)) {
      color: var(--bew-text-3) !important;
      font-size: var(--bew-font-size-caption) !important;
      font-variant-numeric: tabular-nums;
      line-height: var(--bew-line-height-caption) !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist .video-pod__header .header-bottom > .left .description {
      gap: var(--bew-space-1) !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist .video-pod__header .header-bottom > .left .description svg {
      width: var(--bew-icon-size-xs) !important;
      height: var(--bew-icon-size-xs) !important;
      margin: 0 !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist .pod-description-popover {
      ${PLAYER_POPOVER_SURFACE}
      color: var(--bew-text-1) !important;
    }

    /* The recommendations are the last section: 16px under the hairline that
       closes the info or the collection. After a collection they have no
       native heading, so the section title is theirs (the root sets the
       localized text). */
    #${ROOT_ID} .bewly-widescreen-panel-playlist :is(.recommend-list-v1, .recommend-list) {
      margin-top: 0 !important;
      padding-top: var(--bew-space-4) !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist .video-pod ~ :is(.recommend-list-v1, .recommend-list)::before {
      content: var(--bewly-widescreen-up-next-label, none);
      display: block;
      grid-column: 1 / -1;
      margin-bottom: calc(var(--bew-space-3) - var(--bew-space-4));
      color: var(--bew-text-1);
      font-size: var(--bew-font-size-title);
      font-weight: var(--bew-font-weight-regular);
      line-height: var(--bew-line-height-title);
    }

    /* The recommendations (their label and the cards) start
       and end on the rail's content line; the panel box reaches space-1 past
       it for rows with a hover fill. */
    #${ROOT_ID} .bewly-widescreen-panel-playlist :is(.recommend-list-v1, .recommend-list) {
      box-sizing: border-box !important;
      margin-inline: 0 !important;
      padding-inline: var(--bew-space-1) !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist .rec-list {
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

    /* The list's placeholder is the recommendations' (cardLayout.ts) on the
       column's content line, one space-1 inside the panel's box. */
    #${ROOT_ID} .bewly-widescreen-empty.bewly-widescreen-panel-skeleton {
      display: block;
      min-height: 0;
      padding: 0 var(--bew-space-1);
    }

    #${ROOT_ID} .bewly-widescreen-empty {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 25%;
      color: var(--bew-text-3);
      font-size: var(--bew-font-size-body);
    }

    /* Comments loading: one ring over the panel. It closes on arrival, then
       fades off the list that is already laid out beneath it. */
    #${ROOT_ID} .bewly-widescreen-empty.bewly-widescreen-panel-loading {
      position: absolute;
      inset: var(--bewly-widescreen-rail-head-height) 0 0;
      z-index: 2;
      min-height: 0;
      background: linear-gradient(var(--bewly-widescreen-rail-tint) 0 0), var(--bew-bg);
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

    ${reducedMotionCss(`body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} :is(
        .bpx-player-control-wrap,
        .bilibili-player-video-control-wrap,
        .bilibili-player-video-control,
        .squirtle-controller
      ),
      body.${BODY_CLASS} .${DANMAKU_GLASS_CLASS},
      body.${BODY_CLASS} > .bewly-widescreen-backdrop,
      #${ROOT_ID} :is(.bewly-widescreen-sidebar, .bewly-widescreen-panel, .bewly-widescreen-panel-loading),
      #${ROOT_ID} .bewly-widescreen-tags-slot :is(.ordinary-tag, .topic-tag, .bgm-tag) > .tag-link,
      ${DANMAKU_SURFACE_SELECTOR},
      #${ROOT_ID} .bewly-widescreen-panel-playlist .${EPISODE_SECTION_CLASS},
      #${ROOT_ID} .bewly-widescreen-danmaku-skeleton__block,
      body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .bpx-player-loading-panel-blur-detail`, 'transition:none;animation:none;')}

    ${reducedMotionCss(`#${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-dm-function > :is(.bpx-player-dm-btn-time, .bpx-player-dm-btn-dm, .bpx-player-dm-btn-date),
      #${ROOT_ID} .bewly-widescreen-panel-danmaku .dm-info-row,
      #${ROOT_ID} .bewly-widescreen-panel-danmaku .dm-info-row :is(.dm-info-block-btn, .dm-info-report-btn),
      #${ROOT_ID} .bewly-widescreen-panel-danmaku :is(.bpx-player-dm-btn-history, .bpx-player-date-picker-btn, .bpx-player-date-picker-day, .bpx-player-block-sync-btn, .bpx-player-block-add-input),
      #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-block-add-btn .bui-button-gray,
      #${ROOT_ID} .bewly-widescreen-panel-danmaku .bpx-player-block-tab .bui-tabs-header-item`, 'transition:none;')}

    ${reducedMotionCss(`#${ROOT_ID} .bewly-widescreen-action-slot :is(.video-toolbar-left-item, .video-toolbar-right-item, .bewly-watch-later-btn):active,
      #${ROOT_ID} .bewly-widescreen-up-slot .upinfo-btn-panel > .default-btn:active`, 'scale:none;')}

    ${reducedMotionCss(`body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .b-back-panel :is(.b-back-submit, .b-back-content-fail-resubmit, .b-back-content-test-submit, .b-back-content-test-fail-submit, .b-back-content-test-success-submit, .b-back-content-test-speedtest, .b-back-content-test-fail-speedtest):active`, 'scale:none;')}

    /* One column: the 16:9 video pane above the tabs and active panel. */
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

      ${DANMAKU_SURFACE_SELECTOR} {
        padding-inline: var(--bew-space-4, 16px) !important;
      }
    }
  `)
}
