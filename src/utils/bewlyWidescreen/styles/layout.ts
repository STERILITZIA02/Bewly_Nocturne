import { BEWLY_WIDESCREEN_CONTROLS_HIDDEN_CLASS } from '~/constants/globalEvents'
import { BODY_CLASS, DANMAKU_GLASS_CLASS, DANMAKU_SOURCE_HOST_CLASS, DANMAKU_SURFACE_SELECTOR, EPISODE_SECTION_CLASS, HIDDEN_NATIVE_PLAYER_CONTROL_SELECTORS, HIGH_ENERGY_PROGRESS_PIN_SELECTOR, MOBILE_BREAKPOINT, NATIVE_LIGHT_OFF_CONTROL_SELECTORS, NATIVE_PLAYER_CLASS, PLAYLIST_RECOMMENDATION_FOOTER_SELECTOR, ROOT_ID, SIDEBAR_MAX_VIEWPORT_PERCENT } from '~/utils/bewlyWidescreen/constants'
import { WIDESCREEN_SIDEBAR_DEFAULT_MAX_WIDTH, WIDESCREEN_SIDEBAR_MIN_WIDTH, WIDESCREEN_SIDEBAR_RESIZE_MAX_WIDTH } from '~/utils/bewlyWidescreenPolicy'
import { injectCSS } from '~/utils/main'
import { PHOTO_VIEWER_SELECTOR } from '~/utils/photoViewer'

export function injectLayoutStyle() {
  return injectCSS(`
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
      --bewly-widescreen-danmaku-bar-bg: var(--bew-elevated-alt);
      --bewly-widescreen-aux-controls-width: calc(var(--bew-control-height, 36px) * 4 + var(--bew-space-2, 8px) * 4);
      --bewly-widescreen-shell-radius: var(--bew-modal-radius, 24px);
      --bewly-widescreen-controls-glass-inset: 10%;
      --bewly-widescreen-controls-glass-bottom: var(--bew-space-8, 32px);
      --bewly-widescreen-controls-opacity: 1;
      --bewly-widescreen-controls-glass-height: calc(
        var(--bewly-widescreen-bottom-controls-height) + var(--bewly-widescreen-controls-block-padding, 12px)
      );
      overflow: hidden !important;
      background: var(--bew-dark-page-bg) !important;
    }

    body.${BODY_CLASS}.${BEWLY_WIDESCREEN_CONTROLS_HIDDEN_CLASS} {
      --bewly-widescreen-controls-opacity: 0;
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
      --bewly-widescreen-sidebar-bg: var(--bew-elevated-alt);
      --bewly-widescreen-surface-bg: var(--bew-elevated);
      --bewly-widescreen-text-primary: var(--bew-text-1, #18191c);
      --bewly-widescreen-text-secondary: var(--bew-text-2, #61666d);
      --bewly-widescreen-text-muted: var(--bew-text-3, #9499a0);
      --bewly-widescreen-sidebar-border: var(--bew-surface-border-color);
      --bewly-widescreen-divider: var(--bew-border-color);
      --bewly-widescreen-control-bg: var(--bew-fill-1);
      --bewly-widescreen-control-hover-bg: var(--bew-fill-2);
      --bewly-widescreen-sidebar-floating-inset: var(--bew-popover-card-gap, var(--bew-space-4, 16px));
      --bewly-widescreen-sidebar-resize-accent: var(--bew-text-1, #fff);
      --bew-comment-expand-all-display: none;
      --bewly-widescreen-sidebar-user-width: clamp(
        ${WIDESCREEN_SIDEBAR_MIN_WIDTH}px,
        26vw,
        ${WIDESCREEN_SIDEBAR_DEFAULT_MAX_WIDTH}px
      );
      --bewly-widescreen-sidebar-full-width: clamp(
        ${WIDESCREEN_SIDEBAR_MIN_WIDTH}px,
        var(--bewly-widescreen-sidebar-user-width),
        min(${WIDESCREEN_SIDEBAR_RESIZE_MAX_WIDTH}px, ${SIDEBAR_MAX_VIEWPORT_PERCENT}vw)
      );
      --bewly-widescreen-sidebar-reserved-width: calc(
        var(--bewly-widescreen-sidebar-full-width) + var(--bewly-widescreen-sidebar-floating-inset) * 2
      );
      --bewly-widescreen-layout-aspect: 1.7777778;
      --bewly-widescreen-danmaku-bar-bg: var(--bew-elevated-alt);
      --bewly-widescreen-sidebar-panel-width: var(--bewly-widescreen-sidebar-full-width);

      --bewly-widescreen-center-offset: 0px;
      --bewly-widescreen-aux-controls-width: calc(var(--bew-control-height, 36px) * 4 + var(--bew-space-2, 8px) * 4);
    }

    /* The native player is a body child, not a descendant of the Bewly overlay.
       Keep its progress tokens on the shared widescreen owner so both themes inherit them. */
    body.${BODY_CLASS} {
      --bewly-widescreen-progress-track: color-mix(in srgb, var(--bew-text-1) 32%, transparent);
      --bewly-widescreen-progress-buffer: color-mix(in srgb, var(--bew-text-1) 44%, transparent);
      --bewly-widescreen-progress-played: var(--bew-theme-color);
      --bewly-widescreen-progress-glow: none;
    }

    html:not(.dark) #${ROOT_ID},
    html:not(.dark) body.${BODY_CLASS} {
      --bewly-widescreen-sidebar-resize-accent: var(--bew-theme-color, #00aeec);
    }

    html.dark body.${BODY_CLASS} {
      --bewly-widescreen-progress-played: #fff;
      --bewly-widescreen-progress-glow: 0 0 4px rgb(255 255 255 / 85%), 0 0 8px rgb(255 255 255 / 45%);
    }

    #${ROOT_ID} * {
      box-sizing: border-box;
    }

    #${ROOT_ID} .bewly-widescreen-stage {
      display: grid;
      grid-template-columns: minmax(0, 100vw) 0;
      width: 100%;
      height: 100dvh;
      overflow: hidden;
    }

    #${ROOT_ID} .bewly-widescreen-player-slot {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: stretch;
      position: relative;
      min-width: 0;
      min-height: 0;
      padding: 0;
      background: transparent;
      overflow: hidden;
      gap: 0;
      isolation: isolate;
      z-index: 0;
      grid-column: 1;
      grid-row: 1;
      pointer-events: none;
    }

    #${ROOT_ID} .bewly-widescreen-player-frame {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      min-width: 0;
      min-height: 0;
      height: auto;
      flex: 1 1 0;
      overflow: hidden;
      pointer-events: none;
    }

    #${ROOT_ID} .bewly-widescreen-player-frame > * {
      width: 100% !important;
      max-width: 100% !important;
      height: 100% !important;
      max-height: 100% !important;
      aspect-ratio: auto !important;
      margin: 0 !important;
      flex: 0 1 auto;
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
      overflow: hidden !important;
      background: var(--bew-player-canvas) !important;
      clip-path: none !important;
    }

    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} > #bilibili-player,
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

    /* 仅反制对整个 wrap 的 display:none 空闲隐藏，壳层内部布局不动 */
    body.${BODY_CLASS}:not(.${BEWLY_WIDESCREEN_CONTROLS_HIDDEN_CLASS}) .${NATIVE_PLAYER_CLASS} :is(
      .bpx-player-container[data-ctrl-hidden] .bpx-player-control-wrap,
      .bpx-player-container.bpx-state-no-cursor .bpx-player-control-wrap,
      .bpx-player-control-wrap[hidden]
    ) {
      display: block !important;
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
      opacity: var(--bewly-widescreen-controls-opacity, 0) !important;
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
      -webkit-backdrop-filter: none !important;
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
      -webkit-backdrop-filter: none !important;
    }

    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} :is(
      .bpx-player-control-wrap .bpx-player-ctrl-btn,
      .bpx-player-control-wrap .bpx-player-ctrl-btn *,
      .bpx-player-control-wrap .bpx-player-ctrl-quality,
      .bpx-player-control-wrap .bpx-player-ctrl-quality *,
      .bpx-player-control-wrap [class*="-ctrl-"],
      .bpx-player-control-wrap [class*="-ctrl-"] *,
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

    /* 控制栏全部图标统一为文字前景色，覆盖未知填充（三角播放/音量/小窗/截图/设置等） */
    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} :is(
      .bpx-player-control-wrap,
      .bilibili-player-video-control-wrap,
      .bilibili-player-video-control,
      .squirtle-controller
    ) :is(svg, svg *) {
      fill: currentColor !important;
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
      box-shadow: var(--bewly-widescreen-progress-glow) !important;
    }

    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} ${HIGH_ENERGY_PROGRESS_PIN_SELECTOR} {
      display: none !important;
    }

    /* 画质/音质/倍速/音量/播放设置等弹窗统一为弹幕设置同款实色表面并适配文字 */
    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .bpx-player-control-wrap :is(
      [class*="panel"],
      [class*="menu"],
      [class*="popup"],
      [class*="box"]
    ):not(svg):not([class*="-item"]):not([class*="-btn"]):not([class*="-icon"]):not(.bpx-player-ctrl-btn):not(:where([class*="box"] *)),
    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .bpx-player-control-wrap .bpx-player-ctrl-setting-menu,
    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .bpx-player-control-wrap .bpx-player-ctrl-pip-tip {
      background: var(--bew-elevated-alt-solid) !important;
      border: 1px solid var(--bew-surface-border-color) !important;
      border-radius: var(--bew-popover-radius) !important;
      corner-shape: var(--bew-corner-shape);
      box-shadow: var(--bew-popover-surface-shadow) !important;
      backdrop-filter: none !important;
      -webkit-backdrop-filter: none !important;
      color: var(--bew-text-1) !important;
    }

    /* The settings box is only a positioning owner. Its inner menu is the one
       visual surface, matching the quality selector without a nested dark plate. */
    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .bpx-player-control-wrap .bpx-player-ctrl-setting-box {
      background: transparent !important;
      border: 0 !important;
      box-shadow: none !important;
      backdrop-filter: none !important;
      -webkit-backdrop-filter: none !important;
    }

    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .bpx-player-control-wrap .bpx-player-ctrl-setting-menu :is(
      .bpx-player-ctrl-setting-menu-left,
      .bpx-player-ctrl-setting-menu-right
    ) {
      background: transparent !important;
    }

    /* 弹窗后代文字/选项：原生白字类名逐个未覆盖，统一强制主题前景 + 交互态 */
    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .bpx-player-control-wrap :is(
      [class*="panel"],
      [class*="menu"],
      [class*="popup"],
      [class*="box"]
    ) :is(span, div, li, a, p, i) {
      color: var(--bew-text-1) !important;
    }
    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .bpx-player-control-wrap [class*="box"] :is(
      [class*="item"],
      [class*="option"]
    ):hover {
      background: var(--bew-fill-1) !important;
    }
    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .bpx-player-control-wrap :is(
      .bpx-state-active,
      [class*="active"]
    ):not(svg) {
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
      -webkit-backdrop-filter: none !important;
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
      border: 1px solid var(--bew-surface-border-color) !important;
      border-radius: var(--bewly-widescreen-shell-radius) !important;
      corner-shape: var(--bew-corner-shape);
      box-shadow: var(--bew-shadow-edge-glow-1) !important;
      backdrop-filter: var(--bew-filter-glass-1) !important;
      -webkit-backdrop-filter: var(--bew-filter-glass-1) !important;
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
      opacity: var(--bewly-widescreen-controls-opacity, 0) !important;
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
      background: var(--bew-elevated-alt-solid) !important;
      border: 1px solid var(--bew-surface-border-color) !important;
      border-radius: var(--bew-popover-radius) !important;
      corner-shape: var(--bew-corner-shape);
      box-shadow: var(--bew-popover-surface-shadow) !important;
      backdrop-filter: none !important;
      -webkit-backdrop-filter: none !important;
      color: var(--bew-text-1) !important;
      font-size: var(--bew-font-size-caption, 12px) !important;
      font-weight: var(--bew-font-weight-regular, 400) !important;
      line-height: var(--bew-line-height-caption, 16px) !important;
      white-space: nowrap;
    }

    body.${BODY_CLASS} .bpx-player-tooltip-title,
    body.${BODY_CLASS} .bpx-player-tooltip-area {
      color: inherit !important;
      background: transparent !important;
      border: 0 !important;
      border-radius: 0 !important;
      box-shadow: none !important;
      backdrop-filter: none !important;
      -webkit-backdrop-filter: none !important;
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
      -webkit-backdrop-filter: none !important;
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
      -webkit-backdrop-filter: none !important;
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
      -webkit-backdrop-filter: none !important;
      font-size: var(--bew-font-size-caption, 12px) !important;
      line-height: var(--bew-line-height-caption, 16px) !important;
      white-space: nowrap;
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
      -webkit-backdrop-filter: none !important;
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
      -webkit-backdrop-filter: none !important;
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
      outline: var(--bew-space-0-5, 2px) solid var(--bew-theme-focus-ring, var(--bew-theme-color));
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
      -webkit-backdrop-filter: none !important;
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

    /* 控制栏收起时的底部细进度条：Bewly 播放页中永远禁用 */
    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} [class*="shadow-progress"],
    body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} .befilter-progress-area {
      display: none !important;
      content: none !important;
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
      -webkit-backdrop-filter: none !important;
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
      border-color: var(--bew-theme-color) !important;
      box-shadow:
        0 0 0 var(--bew-space-0-5, 2px) var(--bew-theme-color-20),
        var(--bew-shadow-2),
        var(--bew-shadow-edge-glow-1) !important;
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
      background: var(--bew-elevated-alt-solid) !important;
      border: 1px solid var(--bew-surface-border-color) !important;
      border-radius: var(--bew-popover-radius) !important;
      corner-shape: var(--bew-corner-shape);
      box-shadow: var(--bew-popover-surface-shadow) !important;
      backdrop-filter: none !important;
      -webkit-backdrop-filter: none !important;
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

    ${DANMAKU_SURFACE_SELECTOR} .bpx-player-dm-btn-send {
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      min-width: var(--bew-space-12, 48px) !important;
      height: var(--bew-control-height, 36px) !important;
      padding: 0 var(--bew-space-3, 12px) !important;
      flex: 0 0 auto !important;
      margin: 0 !important;
      color: var(--bew-on-theme-color) !important;
      background: var(--bew-theme-color) !important;
      border: 0 !important;
      border-radius: var(--bew-radius-full) !important;
      corner-shape: var(--bew-corner-shape-round);
      font-size: var(--bew-font-size-control, 13px) !important;
      font-weight: var(--bew-font-weight-semibold, 600) !important;
      line-height: var(--bew-line-height-control, 18px) !important;
      transition: background-color var(--bew-duration-fast, 150ms) var(--bew-ease-standard, ease);
    }

    ${DANMAKU_SURFACE_SELECTOR} .bpx-player-dm-btn-send:hover {
      background: var(--bew-theme-color-80) !important;
    }

    ${DANMAKU_SURFACE_SELECTOR} .bpx-player-dm-setting-wrap {
      display: none !important;
      position: absolute !important;
      top: auto !important;
      right: auto !important;
      bottom: calc(100% + var(--bew-space-2, 8px)) !important;
      left: 50% !important;
      z-index: var(--bew-z-popover) !important;
      max-width: calc(100vw - var(--bew-space-8, 32px)) !important;
      margin: 0 !important;
      translate: -50% 0 !important;
      transform: none !important;
    }

    ${DANMAKU_SURFACE_SELECTOR} .bpx-player-dm-setting[aria-expanded="true"] > .bpx-player-dm-setting-wrap {
      display: block !important;
    }

    ${DANMAKU_SURFACE_SELECTOR} .bpx-player-dm-setting-box {
      max-width: 100% !important;
      max-height: calc(
        100dvh
        - var(--bew-control-height, 36px)
        - var(--bew-space-12, 48px)
      ) !important;
      color: var(--bew-text-1) !important;
      background: var(--bew-elevated-alt-solid) !important;
      border: 1px solid var(--bew-surface-border-color) !important;
      border-radius: var(--bew-popover-radius) !important;
      corner-shape: var(--bew-corner-shape);
      box-shadow: var(--bew-popover-surface-shadow) !important;
      backdrop-filter: none !important;
      -webkit-backdrop-filter: none !important;
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
      color: var(--bew-theme-color) !important;
    }

    ${DANMAKU_SURFACE_SELECTOR} .bpx-player-dm-setting-box .bui-progress-wrap {
      background: var(--bew-fill-2) !important;
    }

    ${DANMAKU_SURFACE_SELECTOR} .bpx-player-dm-setting-box .bui-progress-bar {
      background: var(--bew-theme-color) !important;
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

    #${ROOT_ID} .player-wrap *:not(.bili-danmaku-x-guide, .bili-danmaku-x-guide *),
    #${ROOT_ID} .bpx-player-container *:not(.bili-danmaku-x-guide, .bili-danmaku-x-guide *),
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
    }

    #${ROOT_ID} .bili-danmaku-x-guide:not(.bili-danmaku-x-guide-followed) .bili-danmaku-x-guide-follow:hover,
    #${ROOT_ID} .bili-danmaku-x-guide-electric:hover {
      background: color-mix(in srgb, var(--bew-theme-color, #00aeec) 82%, white) !important;
    }

    #${ROOT_ID} .bili-danmaku-x-guide-three {
      display: none !important;
    }

    #${ROOT_ID} .bili-danmaku-x-guide-cyc > span {
      filter: var(--bewly-widescreen-action-canvas-filter, none) !important;
    }

    #${ROOT_ID} .player-wrap > *,
    #${ROOT_ID} .bpx-player-container > * {
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

    #${ROOT_ID} .bewly-widescreen-sidebar {
      position: relative;
      display: flex;
      flex-direction: column;
      justify-self: end;
      align-self: center;
      width: var(--bewly-widescreen-sidebar-panel-width);
      height: calc(100dvh - var(--bewly-widescreen-sidebar-floating-inset) * 2);
      margin: var(--bewly-widescreen-sidebar-floating-inset);
      min-width: 0;
      min-height: 0;
      isolation: isolate;
      background: transparent;
      color: var(--bewly-widescreen-text-primary);
      border: 1px solid var(--bew-surface-border-color);
      border-radius: var(--bewly-widescreen-shell-radius);
      corner-shape: var(--bew-corner-shape);
      box-shadow: var(--bew-shadow-3), var(--bew-shadow-edge-glow-1);
      backdrop-filter: none;
      -webkit-backdrop-filter: none;
      overflow: hidden;
      visibility: hidden;
      pointer-events: none;
      --bewly-widescreen-sidebar-offset: var(--bewly-widescreen-sidebar-reserved-width);
      transform: translate3d(var(--bewly-widescreen-sidebar-offset), 0, 0);
      transition:
        transform var(--bew-duration-moderate, 300ms) var(--bew-ease-standard, ease),
        visibility 0s linear var(--bew-duration-moderate, 300ms),
        border-color var(--bew-duration-fast, 150ms) var(--bew-ease-standard, ease),
        box-shadow var(--bew-duration-fast, 150ms) var(--bew-ease-standard, ease);
      will-change: transform;
      backface-visibility: hidden;
      z-index: 2;
      grid-column: 2;
      grid-row: 1;
    }

    #${ROOT_ID} .bewly-widescreen-sidebar::before {
      content: "";
      position: absolute;
      inset: 0;
      z-index: -1;
      border-radius: inherit;
      corner-shape: inherit;
      background: var(--bew-elevated-alt);
      backdrop-filter: var(--bew-filter-glass-1);
      -webkit-backdrop-filter: var(--bew-filter-glass-1);
      pointer-events: none;
    }

    #${ROOT_ID} .bewly-widescreen-sidebar-resizer {
      position: absolute;
      top: 0;
      bottom: 0;
      left: 0;
      z-index: 4;
      width: var(--bew-space-6, 24px);
      outline: none;
      cursor: ew-resize;
      touch-action: none;
    }

    #${ROOT_ID}[data-sidebar-position="left"] .bewly-widescreen-sidebar-resizer {
      right: 0;
      left: auto;
    }

    #${ROOT_ID} .bewly-widescreen-sidebar-resizer::before {
      content: "";
      position: absolute;
      top: 50%;
      left: 0;
      width: var(--bew-space-0-5, 2px);
      height: var(--bew-space-12, 48px);
      border-radius: var(--bew-radius-full);
      background: var(--bewly-widescreen-divider);
      opacity: 0;
      transform: translateY(-50%);
      transition:
        opacity var(--bew-duration-fast, 150ms) var(--bew-ease-standard, ease),
        background-color var(--bew-duration-fast, 150ms) var(--bew-ease-standard, ease);
    }

    #${ROOT_ID}[data-sidebar-position="left"] .bewly-widescreen-sidebar-resizer::before {
      right: 0;
      left: auto;
    }

    #${ROOT_ID} .bewly-widescreen-sidebar-resizer:hover::before,
    #${ROOT_ID} .bewly-widescreen-sidebar-resizer:focus-visible::before {
      background: var(--bew-theme-color, #00aeec);
      opacity: 1;
    }

    #${ROOT_ID}[data-sidebar-resizing="true"] .bewly-widescreen-sidebar {
      border-color: var(--bewly-widescreen-sidebar-resize-accent);
      border-width: var(--bew-space-0-5, 2px);
      box-shadow:
        0 0 var(--bew-space-6, 24px) color-mix(in oklab, var(--bewly-widescreen-sidebar-resize-accent) 42%, transparent),
        var(--bew-shadow-3),
        var(--bew-shadow-edge-glow-1);
    }

    #${ROOT_ID}[data-sidebar-resizing="true"] .bewly-widescreen-sidebar-resizer::before {
      background: var(--bewly-widescreen-sidebar-resize-accent);
      opacity: 1;
    }

    #${ROOT_ID}[data-sidebar-resizing="true"],
    #${ROOT_ID}[data-sidebar-resizing="true"] * {
      cursor: ew-resize !important;
      user-select: none !important;
    }

    #${ROOT_ID}[data-sidebar-layout="expanded"] .bewly-widescreen-sidebar,
    #${ROOT_ID}[data-sidebar-hover-expanded="true"] .bewly-widescreen-sidebar,
    #${ROOT_ID}[data-centered="true"] .bewly-widescreen-sidebar {
      visibility: visible;
      pointer-events: auto;
      transform: translate3d(0, 0, 0);
      transition-delay: 0s;
    }

    #${ROOT_ID}[data-sidebar-position="left"] .bewly-widescreen-stage {
      grid-template-columns: 0 minmax(0, 100vw);
    }

    #${ROOT_ID}[data-sidebar-position="left"] .bewly-widescreen-player-slot {
      grid-column: 2;
    }

    #${ROOT_ID}[data-sidebar-position="left"] .bewly-widescreen-sidebar {
      justify-self: start;
      grid-column: 1;
      --bewly-widescreen-sidebar-offset: calc(0px - var(--bewly-widescreen-sidebar-reserved-width));
    }

    #${ROOT_ID}[data-centered="true"] .bewly-widescreen-stage {
      grid-template-columns: minmax(0, 100vw) 0;
    }

    #${ROOT_ID}[data-sidebar-position="left"][data-centered="true"] .bewly-widescreen-stage {
      grid-template-columns: 0 minmax(0, 100vw);
    }

    #${ROOT_ID}[data-centered="true"] .bewly-widescreen-player-frame {
      align-items: center;
      justify-content: flex-start;
    }

    #${ROOT_ID}[data-sidebar-position="left"][data-centered="true"] .bewly-widescreen-player-frame {
      justify-content: flex-end;
    }

    #${ROOT_ID}[data-centered="true"] .bewly-widescreen-player-frame > * {
      width: calc(100vw - var(--bewly-widescreen-sidebar-reserved-width)) !important;
      max-width: calc(100vw - var(--bewly-widescreen-sidebar-reserved-width)) !important;
      flex: 0 0 calc(100vw - var(--bewly-widescreen-sidebar-reserved-width));
    }

    #${ROOT_ID}[data-centered="true"] .bpx-player-video-area,
    #${ROOT_ID}[data-centered="true"] .bilibili-player-video-area {
      translate: var(--bewly-widescreen-center-offset) 0 !important;
    }

    body.${BODY_CLASS}:has(#${ROOT_ID}[data-centered="true"])
      .${NATIVE_PLAYER_CLASS}
      .bpx-player-video-area,
    body.${BODY_CLASS}:has(#${ROOT_ID}[data-centered="true"])
      .${NATIVE_PLAYER_CLASS}
      .bilibili-player-video-area {
      translate: var(--bewly-widescreen-center-offset) 0 !important;
    }

    #${ROOT_ID} .bewly-widescreen-sidebar-toggle {
      position: absolute;
      right: 0;
      top: 50%;
      z-index: 3;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: var(--bew-control-height, 36px);
      height: var(--bew-control-height-lg, 40px);
      padding: 0;
      border: 1px solid var(--bew-surface-border-color);
      border-radius: var(--bew-interactive-radius, 8px) 0 0 var(--bew-interactive-radius, 8px);
      corner-shape: var(--bew-corner-shape);
      color: var(--bew-text-1);
      background: var(--bew-elevated-alt-solid);
      box-shadow: var(--bew-shadow-2), var(--bew-shadow-edge-glow-1);
      backdrop-filter: none;
      -webkit-backdrop-filter: none;
      cursor: pointer;
      font-size: var(--bew-font-size-control, 13px);
      font-weight: var(--bew-font-weight-semibold, 600);
      line-height: var(--bew-line-height-control, 18px);
      opacity: 0;
      pointer-events: none;
      transform: translateY(-50%);
      transition:
        opacity var(--bew-duration-fast, 150ms) var(--bew-ease-standard, ease),
        background-color var(--bew-duration-fast, 150ms) var(--bew-ease-standard, ease),
        border-color var(--bew-duration-fast, 150ms) var(--bew-ease-standard, ease);
    }

    #${ROOT_ID}[data-sidebar-position="left"] .bewly-widescreen-sidebar-toggle {
      right: auto;
      left: 0;
      border-radius: 0 var(--bew-interactive-radius, 8px) var(--bew-interactive-radius, 8px) 0;
    }

    #${ROOT_ID}[data-sidebar-layout="expanded"] .bewly-widescreen-sidebar-toggle,
    #${ROOT_ID}[data-sidebar-hover-expanded="true"] .bewly-widescreen-sidebar-toggle,
    #${ROOT_ID}[data-centered="true"] .bewly-widescreen-sidebar-toggle {
      right: calc(
        var(--bewly-widescreen-sidebar-full-width)
        + var(--bewly-widescreen-sidebar-floating-inset)
        + var(--bew-space-2, 8px)
      );
      border-radius: var(--bew-interactive-radius, 8px);
    }

    #${ROOT_ID}[data-sidebar-position="left"][data-sidebar-layout="expanded"] .bewly-widescreen-sidebar-toggle,
    #${ROOT_ID}[data-sidebar-position="left"][data-sidebar-hover-expanded="true"] .bewly-widescreen-sidebar-toggle,
    #${ROOT_ID}[data-sidebar-position="left"][data-centered="true"] .bewly-widescreen-sidebar-toggle {
      right: auto;
      left: calc(
        var(--bewly-widescreen-sidebar-full-width)
        + var(--bewly-widescreen-sidebar-floating-inset)
        + var(--bew-space-2, 8px)
      );
      border-radius: var(--bew-interactive-radius, 8px);
    }

    #${ROOT_ID}[data-sidebar-toggle-visible="true"][data-pointer-active="true"] .bewly-widescreen-sidebar-toggle,
    #${ROOT_ID}[data-sidebar-toggle-visible="true"] .bewly-widescreen-sidebar-toggle:hover,
    #${ROOT_ID}[data-sidebar-toggle-visible="true"] .bewly-widescreen-sidebar-toggle:focus-visible {
      opacity: 1;
      pointer-events: auto;
    }

    #${ROOT_ID} .bewly-widescreen-sidebar-toggle:hover {
      background: var(--bew-theme-color, #00aeec);
      border-color: var(--bew-theme-color, #00aeec);
    }

    #${ROOT_ID} .bewly-widescreen-sidebar-top {
      position: relative;
      z-index: 1;
      display: flex;
      flex-direction: column;
      flex: 0 0 auto;
      min-height: 0;
      max-height: 52%;
      overflow-x: hidden;
      overflow-y: auto;
      overscroll-behavior: contain;
      scrollbar-gutter: stable;
      padding: var(--bew-space-2) var(--bew-space-3);
      border-bottom: 1px solid var(--bewly-widescreen-divider);
      background: var(--bewly-widescreen-surface-bg);
    }

    #${ROOT_ID} .bewly-widescreen-toolbar {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: var(--bew-space-3);
      margin-bottom: var(--bew-space-2);
    }

    #${ROOT_ID} .bewly-widescreen-title-group {
      display: flex;
      flex: 1 1 auto;
      flex-direction: column;
      min-width: 0;
      gap: var(--bew-space-2, 8px);
    }

    #${ROOT_ID} .bewly-widescreen-close {
      position: relative;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: 0;
      border-radius: 50%;
      width: var(--bew-control-height-sm);
      height: var(--bew-control-height-sm);
      padding: 0;
      color: var(--bewly-widescreen-text-secondary);
      background: var(--bewly-widescreen-control-bg);
      cursor: pointer;
      font-size: 0;
      line-height: 1;
      flex: 0 0 auto;
    }

    #${ROOT_ID} .bewly-widescreen-close::before,
    #${ROOT_ID} .bewly-widescreen-close::after {
      content: "";
      position: absolute;
      width: var(--bew-font-size-control);
      height: var(--bew-space-0-5);
      border-radius: var(--bew-radius-full);
      background: currentColor;
      transform: rotate(45deg);
    }

    #${ROOT_ID} .bewly-widescreen-close::after {
      transform: rotate(-45deg);
    }

    #${ROOT_ID} .bewly-widescreen-close:hover {
      color: var(--bewly-widescreen-text-primary);
      background: var(--bewly-widescreen-control-hover-bg);
    }

    #${ROOT_ID} .bewly-widescreen-title {
      display: block;
      overflow: visible;
      margin: 0;
      color: var(--bewly-widescreen-text-primary);
      font-size: var(--bew-font-size-heading);
      font-weight: var(--bew-font-weight-semibold, 600);
      line-height: var(--bew-line-height-heading);
      overflow-wrap: anywhere;
      white-space: normal;
    }

    #${ROOT_ID} .bewly-widescreen-metadata-slot {
      position: relative;
      z-index: 1;
      flex: 0 0 auto;
      min-width: 0;
      min-height: 0;
      color: var(--bewly-widescreen-text-secondary);
    }

    #${ROOT_ID} .bewly-widescreen-metadata-slot:empty {
      display: none;
    }

    #${ROOT_ID} .bewly-widescreen-metadata-slot .video-info-meta,
    #${ROOT_ID} .bewly-widescreen-metadata-slot .video-info-detail-list {
      display: flex !important;
      align-items: center !important;
      flex-wrap: wrap !important;
      position: static !important;
      inset: auto !important;
      width: 100% !important;
      height: auto !important;
      min-height: 0 !important;
      margin: 0 !important;
      transform: none !important;
      gap: var(--bew-space-1) var(--bew-space-3) !important;
      color: inherit !important;
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

    #${ROOT_ID} .bewly-widescreen-action-slot {
      min-height: 0;
      margin-top: var(--bew-space-1);
      container-type: inline-size;
      overflow: visible;
    }

    #${ROOT_ID} .bewly-widescreen-fallback-stats {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: var(--bew-space-1);
      width: 100%;
    }

    #${ROOT_ID} .bewly-widescreen-fallback-stat {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--bew-space-1);
      min-width: 0;
      min-height: var(--bew-control-height-sm);
      padding: 0 var(--bew-space-1);
      overflow: hidden;
      color: var(--bewly-widescreen-text-secondary);
      background: var(--bewly-widescreen-control-bg);
      border-radius: var(--bew-interactive-radius);
      corner-shape: var(--bew-corner-shape);
      font-size: var(--bew-font-size-caption);
      font-weight: var(--bew-font-weight-medium);
      line-height: var(--bew-line-height-caption);
      text-overflow: ellipsis;
      white-space: nowrap;
      transition:
        color var(--bew-duration-fast) var(--bew-ease-standard),
        background-color var(--bew-duration-fast) var(--bew-ease-standard);
    }

    #${ROOT_ID} .bewly-widescreen-fallback-stat:hover {
      color: var(--bew-theme-color);
      background: var(--bewly-widescreen-control-hover-bg);
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
      color: var(--bew-theme-color);
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
      font-weight: var(--bew-font-weight-semibold);
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
      margin-top: var(--bew-space-2);
    }

    #${ROOT_ID} .bewly-widescreen-action-slot:empty {
      display: none;
    }

    #${ROOT_ID} .bewly-widescreen-description-slot {
      margin-top: var(--bew-space-2);
      padding-top: var(--bew-space-2);
      border-top: 1px solid var(--bewly-widescreen-divider);
      color: var(--bewly-widescreen-text-primary);
    }

    #${ROOT_ID} .bewly-widescreen-description-slot:empty {
      display: none;
    }

    #${ROOT_ID} .bewly-widescreen-tags-slot {
      margin-top: var(--bew-space-2, 8px);
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

    #${ROOT_ID} .bewly-widescreen-description-slot.is-empty {
      display: none;
    }

    #${ROOT_ID} .bewly-widescreen-description-slot .video-desc-container {
      width: 100% !important;
      margin: 0 !important;
    }

    #${ROOT_ID} .bewly-widescreen-description-slot .basic-desc-info {
      height: auto !important;
      color: var(--bewly-widescreen-text-secondary) !important;
      font-size: var(--bew-font-size-control, 13px) !important;
      line-height: var(--bew-line-height-control, 18px) !important;
      overflow: hidden !important;
      overflow-wrap: anywhere;
      word-break: break-word !important;
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
      color: var(--bew-theme-color, #00aeec) !important;
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
      color: var(--bew-theme-color, #00aeec);
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
      margin: 0 var(--bew-space-3, 12px) 0 0 !important;
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
      min-width: 0 !important;
      margin: 0 !important;
      padding: 0 var(--bew-space-2, 8px) !important;
      border: 0 !important;
      border-radius: var(--bew-interactive-radius) !important;
      color: var(--bewly-widescreen-text-secondary) !important;
      background: transparent !important;
      font-size: var(--bew-font-size-control, 13px) !important;
      line-height: var(--bew-line-height-control, 18px) !important;
      min-height: var(--bew-control-height-sm, 28px) !important;
      white-space: nowrap !important;
      text-align: center !important;
      transition:
        color var(--bew-duration-fast, 150ms) var(--bew-ease-standard, ease),
        background-color var(--bew-duration-fast, 150ms) var(--bew-ease-standard, ease);
    }

    #${ROOT_ID} .bewly-widescreen-action-slot .toolbar-left-item-wrap > .video-toolbar-left-item {
      flex: 0 1 auto !important;
    }

    #${ROOT_ID} .bewly-widescreen-action-slot .video-toolbar-left-item [class*="anim"],
    #${ROOT_ID} .bewly-widescreen-action-slot .video-toolbar-left-item [class*="Anim"],
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
      color: var(--bew-theme-color, #00aeec) !important;
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

    #${ROOT_ID} .bewly-widescreen-action-slot .video-toolbar-left-item [class*="anim"] svg,
    #${ROOT_ID} .bewly-widescreen-action-slot .video-toolbar-left-item [class*="Anim"] svg,
    #${ROOT_ID} .bewly-widescreen-action-slot .toolbar-left-item-wrap > [class*="anim"] svg,
    #${ROOT_ID} .bewly-widescreen-action-slot .toolbar-left-item-wrap > [class*="Anim"] svg {
      width: 100% !important;
      height: 100% !important;
      color: var(--bew-theme-color, #00aeec) !important;
    }

    #${ROOT_ID} .bewly-widescreen-action-slot .video-toolbar-left-item [class*="anim"] [stroke],
    #${ROOT_ID} .bewly-widescreen-action-slot .video-toolbar-left-item [class*="Anim"] [stroke],
    #${ROOT_ID} .bewly-widescreen-action-slot .toolbar-left-item-wrap > [class*="anim"] [stroke],
    #${ROOT_ID} .bewly-widescreen-action-slot .toolbar-left-item-wrap > [class*="Anim"] [stroke] {
      stroke: var(--bew-theme-color, #00aeec) !important;
    }

    #${ROOT_ID} .bewly-widescreen-action-slot .video-toolbar-left-item [class*="anim"] [fill]:not([fill="none"]),
    #${ROOT_ID} .bewly-widescreen-action-slot .video-toolbar-left-item [class*="Anim"] [fill]:not([fill="none"]),
    #${ROOT_ID} .bewly-widescreen-action-slot .toolbar-left-item-wrap > [class*="anim"] [fill]:not([fill="none"]),
    #${ROOT_ID} .bewly-widescreen-action-slot .toolbar-left-item-wrap > [class*="Anim"] [fill]:not([fill="none"]) {
      fill: var(--bew-theme-color, #00aeec) !important;
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

    #${ROOT_ID} .bewly-widescreen-action-slot .video-share-info {
      display: inline-flex !important;
      align-items: center !important;
      margin-left: 0 !important;
    }

    #${ROOT_ID} .bewly-widescreen-action-slot .video-share-info-text {
      display: inline !important;
      margin-left: 0 !important;
    }

    #${ROOT_ID} .bewly-widescreen-action-slot .video-toolbar-left-item:hover,
    #${ROOT_ID} .bewly-widescreen-action-slot .video-toolbar-right-item:hover {
      color: var(--bew-theme-color, #00aeec) !important;
      background: var(--bewly-widescreen-control-hover-bg) !important;
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
      color: var(--bew-theme-color, #00aeec) !important;
      fill: var(--bew-theme-color, #00aeec) !important;
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
      margin-left: var(--bew-space-3, 12px) !important;
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
      width: auto !important;
      min-width: var(--bew-control-height-sm, 28px) !important;
      height: var(--bew-control-height-sm, 28px) !important;
    }

    #${ROOT_ID} .bewly-widescreen-action-slot .video-toolbar-right-item.bewly-watch-later-btn:hover {
      color: var(--bewly-widescreen-text-primary) !important;
    }

    #${ROOT_ID} .bewly-widescreen-action-slot .video-toolbar-right-item.bewly-watch-later-btn.is-active:hover {
      color: var(--bew-theme-color, #00aeec) !important;
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

    #${ROOT_ID} .bewly-widescreen-tabs {
      position: relative;
      z-index: 1;
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      flex: 0 0 auto;
      height: var(--bew-control-height-lg);
      background: var(--bewly-widescreen-surface-bg);
      border-bottom: 1px solid var(--bewly-widescreen-divider);
    }

    #${ROOT_ID} .bewly-widescreen-tab {
      position: relative;
      border: 0;
      color: var(--bewly-widescreen-text-secondary);
      background: transparent;
      cursor: pointer;
      font-size: var(--bew-font-size-control);
      font-weight: var(--bew-font-weight-semibold);
      line-height: var(--bew-line-height-control);
    }

    #${ROOT_ID} .bewly-widescreen-tab.is-active {
      color: var(--bew-theme-color, #00aeec);
    }

    #${ROOT_ID} .bewly-widescreen-tab.is-active::after {
      content: "";
      position: absolute;
      left: 50%;
      bottom: 0;
      width: var(--bew-space-6);
      height: var(--bew-space-0-5);
      border-radius: var(--bew-radius-sm) var(--bew-radius-sm) 0 0;
      background: var(--bew-theme-color, #00aeec);
      transform: translateX(-50%);
    }

    #${ROOT_ID} .bewly-widescreen-panels {
      position: relative;
      z-index: 0;
      flex: 1 1 0;
      min-height: 0;
      overflow: hidden;
      background: var(--bewly-widescreen-sidebar-bg);
    }

    #${ROOT_ID} .bewly-widescreen-panel {
      position: relative;
      width: 100%;
      height: 100%;
      overflow: auto;
      overscroll-behavior: contain;
      padding: var(--bew-space-2) var(--bew-space-2) var(--bew-space-4);
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
      outline: var(--bew-space-0-5) solid var(--bew-theme-color);
      outline-offset: var(--bew-space-0-5);
    }

    #${ROOT_ID} .bewly-widescreen-panel-comment,
    #${ROOT_ID} .bewly-widescreen-panel-danmaku {
      background: var(--bewly-widescreen-sidebar-bg);
    }

    #${ROOT_ID} .bewly-widescreen-panel-danmaku {
      position: relative;
      padding: 0;
      overflow: hidden;
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

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bui-collapse-header {
      flex: 0 0 auto;
      display: flex !important;
      align-items: center !important;
      height: auto !important;
      min-height: var(--bew-control-height-lg, 40px) !important;
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

    #${ROOT_ID} .bewly-widescreen-panel-danmaku .bui-collapse-body {
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
      padding: var(--bew-space-3, 12px) var(--bew-space-4, 16px) var(--bew-space-4, 16px);
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
      background: var(--bew-skeleton);
      animation: bewly-widescreen-skeleton-shimmer 1.4s ease-in-out infinite alternate;
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

    @keyframes bewly-widescreen-skeleton-shimmer {
      to {
        opacity: 0.48;
      }
    }

    /* B 站表情面板可能向上展开；只在打开期间允许它越过评论面板边界。 */
    #${ROOT_ID} .bewly-widescreen-panels[data-bewly-comment-emoji-open],
    #${ROOT_ID} .bewly-widescreen-panel[data-bewly-comment-emoji-open] {
      overflow: visible;
    }

    #${ROOT_ID} .bewly-widescreen-panel[hidden] {
      display: none !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel > * {
      width: 100% !important;
      max-width: 100% !important;
      margin-left: 0 !important;
      margin-right: 0 !important;
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
      -webkit-backdrop-filter: none;
      cursor: pointer;
      font-family: var(--bew-font-family);
      font-size: var(--bew-font-size-control, 13px);
      font-weight: var(--bew-font-weight-semibold, 600);
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
      border-radius: var(--bew-interactive-radius) !important;
      corner-shape: var(--bew-corner-shape);
      white-space: nowrap !important;
      transition:
        color var(--bew-duration-fast, 150ms) var(--bew-ease-standard, ease),
        background-color var(--bew-duration-fast, 150ms) var(--bew-ease-standard, ease),
        border-color var(--bew-duration-fast, 150ms) var(--bew-ease-standard, ease);
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist .subscribe-btn:hover {
      color: var(--bew-theme-color) !important;
      background: var(--bew-theme-color-20) !important;
      border-color: var(--bew-theme-color) !important;
    }

    #${ROOT_ID} .bewly-widescreen-playlist-toggle:focus-visible {
      outline: var(--bew-space-0-5, 2px) solid var(--bew-theme-focus-ring, var(--bew-theme-color));
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
      overscroll-behavior: contain;
      scrollbar-gutter: stable;
      transition:
        max-height var(--bew-duration-moderate, 300ms) var(--bew-ease-standard, ease),
        opacity var(--bew-duration-moderate, 300ms) var(--bew-ease-standard, ease),
        margin var(--bew-duration-moderate, 300ms) var(--bew-ease-standard, ease);
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist.is-episode-section-collapsed .${EPISODE_SECTION_CLASS} {
      max-height: 0 !important;
      margin-bottom: 0 !important;
      opacity: 0;
      overflow: hidden !important;
      pointer-events: none;
      scrollbar-gutter: auto;
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist .pod-expand-btn,
    #${ROOT_ID} .bewly-widescreen-panel-playlist ${PLAYLIST_RECOMMENDATION_FOOTER_SELECTOR} {
      display: none !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel .video-page-card-small {
      width: 100% !important;
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

    #${ROOT_ID} .bewly-widescreen-empty {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 25%;
      color: var(--bewly-widescreen-text-muted);
      font-size: var(--bew-font-size-body);
    }

    @media (prefers-reduced-motion: reduce) {
      body.${BODY_CLASS} .${NATIVE_PLAYER_CLASS} :is(
        .bpx-player-control-wrap,
        .bilibili-player-video-control-wrap,
        .bilibili-player-video-control,
        .squirtle-controller
      ),
      body.${BODY_CLASS} .${DANMAKU_GLASS_CLASS},
      #${ROOT_ID} .bewly-widescreen-sidebar,
      ${DANMAKU_SURFACE_SELECTOR},
      #${ROOT_ID} .bewly-widescreen-sidebar-toggle,
      #${ROOT_ID} .bewly-widescreen-playlist-toggle::after,
      #${ROOT_ID} .bewly-widescreen-panel-playlist .${EPISODE_SECTION_CLASS},
      #${ROOT_ID} .bewly-widescreen-danmaku-skeleton__block {
        transition: none;
        animation: none;
      }
    }

    @media (max-width: ${MOBILE_BREAKPOINT}px) {
      body.${BODY_CLASS} {
        --bewly-widescreen-controls-glass-inset: var(--bew-space-4, 16px);
      }

      #${ROOT_ID} {
        --bewly-widescreen-sidebar-panel-width: 100vw;
      }

      #${ROOT_ID} .bewly-widescreen-stage,
      #${ROOT_ID}[data-sidebar-position="left"] .bewly-widescreen-stage,
      #${ROOT_ID}[data-centered="true"] .bewly-widescreen-stage,
      #${ROOT_ID}[data-sidebar-position="left"][data-centered="true"] .bewly-widescreen-stage {
        grid-template-columns: 1fr;
        grid-template-rows: minmax(0, 56dvh) minmax(0, 44dvh);
      }

      #${ROOT_ID} .bewly-widescreen-player-slot {
        grid-column: 1;
        grid-row: 1;
        padding: 0;
      }

      ${DANMAKU_SURFACE_SELECTOR} {
        padding-inline: var(--bew-space-4, 16px) !important;
      }

      #${ROOT_ID} .bewly-widescreen-sidebar {
        grid-column: 1;
        grid-row: 2;
        width: 100%;
        height: 100%;
        margin: 0;
        border-radius: 0;
        visibility: visible;
        pointer-events: auto;
        transform: none;
        transition: none;
        box-shadow: none;
      }

      #${ROOT_ID} .bewly-widescreen-sidebar-toggle,
      #${ROOT_ID} .bewly-widescreen-sidebar-resizer {
        display: none;
      }

      #${ROOT_ID} .bewly-widescreen-player-frame > *,
      #${ROOT_ID}[data-centered="true"] .bewly-widescreen-player-frame > * {
        width: 100% !important;
        max-width: 100% !important;
        max-height: 100% !important;
        flex-basis: auto;
      }

      #${ROOT_ID}[data-centered="true"] .bpx-player-video-area,
      #${ROOT_ID}[data-centered="true"] .bilibili-player-video-area {
        translate: none !important;
      }
    }
  `)
}
