import { LOADING_FADE_DURATION, LOADING_ROOT_ID, MOBILE_BREAKPOINT } from '~/utils/bewlyWidescreen/constants'
import { injectCSS } from '~/utils/main'

export function injectLoadingStyle() {
  return injectCSS(`
    #${LOADING_ROOT_ID} {
      position: fixed;
      inset: 0;
      z-index: var(--bew-z-widescreen-loading);
      overflow: hidden;
      color: var(--bew-text-2, #61666d);
      background: var(--bew-bg, #f6f7f8);
      font-family: var(--bew-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
      opacity: 1;
      transition: opacity ${LOADING_FADE_DURATION}ms ease;
    }

    html.dark #${LOADING_ROOT_ID} {
      color: var(--bew-text-2, #c9ccd0);
      background: var(--bew-bg, #17181a);
    }

    #${LOADING_ROOT_ID}.is-leaving {
      opacity: 0;
      pointer-events: none;
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-content {
      position: relative;
      width: 100%;
      height: 100%;
      font-size: var(--bew-font-size-control, 13px);
      line-height: var(--bew-line-height-control, 18px);
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-status {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-stage {
      position: relative;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: var(--bew-player-canvas, #000);
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-player {
      position: absolute;
      inset: 0;
      overflow: hidden;
      background: var(--bew-player-canvas, #000);
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-block {
      display: block;
      flex: 0 0 auto;
      background: var(--bew-skeleton, rgb(131 131 145 / 30%));
      background-image: linear-gradient(
        100deg,
        transparent 18%,
        color-mix(in oklab, var(--bew-text-1) 10%, transparent) 38%,
        transparent 58%
      );
      background-position: 180% 0;
      background-size: 220% 100%;
      animation: bewly-widescreen-loading-shimmer 1.6s var(--bew-ease-in-out, ease-in-out) infinite;
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-player-mark {
      position: absolute;
      top: 46%;
      left: 50%;
      width: var(--bew-space-12, 48px);
      height: var(--bew-space-12, 48px);
      border-radius: 50%;
      corner-shape: var(--bew-corner-shape-round, round);
      opacity: 0.46;
      transform: translate(-50%, -50%);
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-controls {
      position: absolute;
      right: 10%;
      bottom: var(--bew-space-8, 32px);
      left: 10%;
      z-index: 1;
      display: grid;
      gap: var(--bew-space-2, 8px);
      padding: var(--bew-space-3, 12px);
      background: var(--bew-elevated-alt);
      border: 1px solid var(--bew-surface-border-color);
      border-radius: var(--bew-modal-radius, 24px);
      corner-shape: var(--bew-corner-shape);
      box-shadow: var(--bew-shadow-2), var(--bew-shadow-edge-glow-1);
      backdrop-filter: var(--bew-filter-glass-1);
      -webkit-backdrop-filter: var(--bew-filter-glass-1);
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-progress {
      width: 100%;
      height: var(--bew-space-1, 4px);
      border-radius: var(--bew-radius-full);
      corner-shape: var(--bew-corner-shape-round, round);
    }

    #${LOADING_ROOT_ID} :is(
      .bewly-widescreen-loading-skeleton-player-controls,
      .bewly-widescreen-loading-skeleton-danmaku-controls
    ) {
      display: flex;
      align-items: center;
      gap: var(--bew-space-2, 8px);
      min-width: 0;
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-player-controls {
      min-height: var(--bew-control-height-sm, 28px);
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-danmaku-controls {
      min-height: var(--bew-control-height, 36px);
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-circle {
      width: var(--bew-control-height-sm, 28px);
      height: var(--bew-control-height-sm, 28px);
      border-radius: 50%;
      corner-shape: var(--bew-corner-shape-round, round);
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-time {
      width: calc(var(--bew-space-12, 48px) + var(--bew-space-3, 12px));
      height: var(--bew-space-3, 12px);
      border-radius: var(--bew-radius-sm, 4px);
      corner-shape: var(--bew-corner-shape);
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-spacer {
      min-width: var(--bew-space-2, 8px);
      flex: 1 1 auto;
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-control-label {
      width: var(--bew-space-10, 40px);
      height: var(--bew-space-3, 12px);
      border-radius: var(--bew-radius-sm, 4px);
      corner-shape: var(--bew-corner-shape);
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-viewers {
      width: calc(var(--bew-space-12, 48px) + var(--bew-space-6, 24px));
      height: var(--bew-control-height, 36px);
      border-radius: var(--bew-radius-full);
      corner-shape: var(--bew-corner-shape-round, round);
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-input {
      min-width: var(--bew-space-12, 48px);
      height: var(--bew-control-height, 36px);
      flex: 1 1 auto;
      border-radius: var(--bew-radius-full);
      corner-shape: var(--bew-corner-shape-round, round);
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-send {
      width: var(--bew-space-12, 48px);
      height: var(--bew-control-height, 36px);
      border-radius: var(--bew-radius-full);
      corner-shape: var(--bew-corner-shape-round, round);
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-sidebar {
      position: absolute;
      top: var(--bew-space-4, 16px);
      right: var(--bew-space-4, 16px);
      bottom: var(--bew-space-4, 16px);
      z-index: 2;
      display: flex;
      flex-direction: column;
      width: clamp(320px, 26vw, 520px);
      min-height: 0;
      overflow: hidden;
      background: var(--bew-elevated-alt);
      border: 1px solid var(--bew-surface-border-color);
      border-radius: var(--bew-modal-radius, 24px);
      corner-shape: var(--bew-corner-shape);
      box-shadow: var(--bew-shadow-3), var(--bew-shadow-edge-glow-1);
      backdrop-filter: var(--bew-filter-glass-1);
      -webkit-backdrop-filter: var(--bew-filter-glass-1);
    }

    #${LOADING_ROOT_ID}[data-sidebar-layout="compact"] .bewly-widescreen-loading-skeleton-sidebar {
      display: none;
    }

    #${LOADING_ROOT_ID}[data-sidebar-position="left"] .bewly-widescreen-loading-skeleton-sidebar {
      right: auto;
      left: var(--bew-space-4, 16px);
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-sidebar-top {
      display: grid;
      gap: var(--bew-space-2, 8px);
      padding: var(--bew-space-3, 12px);
      border-bottom: 1px solid var(--bew-border-color);
    }

    #${LOADING_ROOT_ID} :is(
      .bewly-widescreen-loading-skeleton-title,
      .bewly-widescreen-loading-skeleton-description,
      .bewly-widescreen-loading-skeleton-list-content
    ) {
      display: grid;
      gap: var(--bew-space-2, 8px);
      min-width: 0;
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-line {
      width: 100%;
      height: var(--bew-space-3, 12px);
      border-radius: var(--bew-radius-sm, 4px);
      corner-shape: var(--bew-corner-shape);
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-line--title {
      height: var(--bew-space-5, 20px);
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-line--title-short {
      width: 72%;
      height: var(--bew-space-5, 20px);
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-line--meta {
      width: 46%;
      height: var(--bew-space-2, 8px);
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-owner {
      display: flex;
      align-items: center;
      gap: var(--bew-space-2, 8px);
      min-width: 0;
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-avatar {
      width: var(--bew-control-height-lg, 40px);
      height: var(--bew-control-height-lg, 40px);
      border-radius: 50%;
      corner-shape: var(--bew-corner-shape-round, round);
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-line--owner {
      width: 28%;
      min-width: var(--bew-space-10, 40px);
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-owner-action {
      width: calc(var(--bew-space-10, 40px) + var(--bew-space-8, 32px));
      height: var(--bew-control-height-sm, 28px);
      margin-left: auto;
      border-radius: var(--bew-interactive-radius, 8px);
      corner-shape: var(--bew-corner-shape);
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-owner-action--wide {
      width: calc(var(--bew-space-12, 48px) * 2);
      margin-left: 0;
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-stats {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: var(--bew-space-1, 4px);
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-stat {
      height: var(--bew-control-height-sm, 28px);
      border-radius: var(--bew-interactive-radius, 8px);
      corner-shape: var(--bew-corner-shape);
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-line--description-short {
      width: 82%;
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-tabs {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: var(--bew-space-8, 32px);
      padding: var(--bew-space-3, 12px) var(--bew-space-6, 24px);
      border-bottom: 1px solid var(--bew-border-color);
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-tab {
      height: var(--bew-space-3, 12px);
      border-radius: var(--bew-radius-sm, 4px);
      corner-shape: var(--bew-corner-shape);
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-list {
      display: grid;
      gap: var(--bew-space-4, 16px);
      min-height: 0;
      padding: var(--bew-space-4, 16px);
      overflow: hidden;
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-list-row {
      display: grid;
      grid-template-columns: var(--bew-space-8, 32px) minmax(0, 1fr);
      align-items: start;
      gap: var(--bew-space-2, 8px);
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-list-avatar {
      width: var(--bew-space-8, 32px);
      height: var(--bew-space-8, 32px);
      border-radius: 50%;
      corner-shape: var(--bew-corner-shape-round, round);
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-line--list-short {
      width: 62%;
    }

    @keyframes bewly-widescreen-loading-shimmer {
      to {
        background-position: -180% 0;
      }
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-exit {
      position: fixed;
      top: var(--bew-space-4, 16px);
      right: var(--bew-space-4, 16px);
      z-index: 3;
      box-sizing: border-box;
      min-width: calc(var(--bew-control-height, 36px) + var(--bew-control-height, 36px));
      min-height: var(--bew-control-item-height, 28px);
      padding: 0 var(--bew-space-3, 12px);
      color: var(--bew-text-1, #18191c);
      font: inherit;
      font-weight: var(--bew-font-weight-semibold, 600);
      background: var(--bew-fill-2, rgb(0 0 0 / 8%));
      border: 1px solid var(--bew-surface-border-color, #d1d2d4);
      border-radius: var(--bew-interactive-radius, 8px);
      cursor: pointer;
    }

    html.dark #${LOADING_ROOT_ID} .bewly-widescreen-loading-exit {
      color: var(--bew-text-1, #fff);
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-exit:hover {
      background: var(--bew-fill-3, rgb(0 0 0 / 12%));
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-exit:focus-visible {
      outline: var(--bew-space-0-5, 2px) solid var(--bew-theme-color, #00aeec);
      outline-offset: var(--bew-space-0-5, 2px);
    }

    @media (prefers-reduced-motion: reduce) {
      #${LOADING_ROOT_ID},
      #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-block {
        transition: none;
        animation: none;
      }
    }

    @media (max-width: ${MOBILE_BREAKPOINT}px) {
      #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-stage {
        display: grid;
        grid-template-rows: minmax(0, 56dvh) minmax(0, 44dvh);
      }

      #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-player {
        position: relative;
        inset: auto;
        grid-row: 1;
      }

      #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-controls {
        right: var(--bew-space-4, 16px);
        bottom: var(--bew-space-4, 16px);
        left: var(--bew-space-4, 16px);
      }

      #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-sidebar,
      #${LOADING_ROOT_ID}[data-sidebar-layout="compact"] .bewly-widescreen-loading-skeleton-sidebar {
        position: relative;
        inset: auto;
        grid-row: 2;
        display: flex;
        width: 100%;
        border-right: 0;
        border-bottom: 0;
        border-left: 0;
        border-radius: 0;
        box-shadow: none;
      }

      #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-control-label:nth-last-child(-n + 3),
      #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-danmaku-controls > .bewly-widescreen-loading-skeleton-circle:nth-child(4),
      #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-danmaku-controls > .bewly-widescreen-loading-skeleton-circle:nth-child(5),
      #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-danmaku-controls > .bewly-widescreen-loading-skeleton-circle:nth-child(6) {
        display: none;
      }
    }
  `)
}
