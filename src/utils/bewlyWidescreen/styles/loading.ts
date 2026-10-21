import LOADING_RING_CSS from '~/styles/loadingRing.scss?inline'
import SKELETON_CSS from '~/styles/skeleton.scss?inline'
import { LOADING_FADE_DURATION, LOADING_ROOT_ID, MOBILE_BREAKPOINT } from '~/utils/bewlyWidescreen/constants'
import { CARD_LAYOUT_PROPERTIES } from '~/utils/bewlyWidescreen/styles/cardLayout'
import { injectCSS } from '~/utils/main'

export function injectLoadingStyle() {
  return injectCSS(`
    ${SKELETON_CSS}
    ${LOADING_RING_CSS}
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
      ${CARD_LAYOUT_PROPERTIES}
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

    /* Same grid as the playback shell: the flush video pane, then the column. */
    #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-stage {
      position: relative;
      display: grid;
      grid-template-columns: var(--bewly-widescreen-card-width) minmax(0, 1fr);
      grid-template-rows: minmax(0, 1fr);
      grid-template-areas: "player rail";
      box-sizing: border-box;
      width: 100%;
      height: 100%;
      padding: 0;
      overflow: hidden;
    }

    #${LOADING_ROOT_ID}[data-sidebar-position="left"] .bewly-widescreen-loading-skeleton-stage {
      grid-template-columns: minmax(0, 1fr) var(--bewly-widescreen-card-width);
      grid-template-areas: "rail player";
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-player {
      position: relative;
      grid-area: player;
      min-width: 0;
      min-height: 0;
      overflow: hidden;
      background: var(--bew-player-canvas, #000);
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-block {
      display: block;
      flex: 0 0 auto;
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-player-mark {
      --bew-loading-ring-size: var(--bew-space-12, 48px);
      position: absolute;
      top: 50%;
      left: 50%;
      color: rgb(255 255 255 / 72%);
      translate: -50% -50%;
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-controls {
      position: absolute;
      right: var(--bewly-widescreen-card-inset);
      bottom: var(--bewly-widescreen-card-inset);
      left: var(--bewly-widescreen-card-inset);
      z-index: 1;
      box-sizing: border-box;
      display: grid;
      gap: var(--bew-space-2, 8px);
      padding: var(--bew-space-3, 12px);
      background: var(--bew-elevated-alt-solid);
      border: 1px solid var(--bew-surface-border-color);
      border-radius: var(--bewly-widescreen-shell-radius);
      corner-shape: var(--bew-corner-shape);
      box-shadow: var(--bew-shadow-2);
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

    /* Like the real column: the info, the tabs, then the list down to the
       window's bottom edge with the composer docked above it. */
    #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-sidebar {
      position: relative;
      display: flex;
      flex-direction: column;
      gap: var(--bew-space-3, 12px);
      grid-area: rail;
      box-sizing: border-box;
      min-width: 0;
      min-height: 0;
      padding: var(--bewly-widescreen-page-padding) var(--bewly-widescreen-page-padding) calc(var(--bewly-widescreen-page-padding) + var(--bew-space-3, 12px));
      overflow: hidden;
      background: transparent;
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-info {
      display: flex;
      flex: 0 1 auto;
      flex-direction: column;
      min-width: 0;
      min-height: 0;
      max-height: 45%;
      overflow: hidden;
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-sidebar-top {
      display: grid;
      align-content: start;
      flex: 1 1 auto;
      gap: var(--bew-space-2, 8px);
      min-height: 0;
      padding: 0 0 var(--bew-space-3, 12px);
      overflow: hidden;
      background: transparent;
    }

    #${LOADING_ROOT_ID} :is(
      .bewly-widescreen-loading-skeleton-title,
      .bewly-widescreen-loading-skeleton-description
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

    /* Two rows like the real block: the author with charge and follow at the
       right edge, then the action chips. */
    #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-author-actions {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: var(--bew-space-3);
      margin-block: var(--bew-space-2);
    }

    /* Avatar, name over sign, then charge and follow on the same line. */
    #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-owner {
      display: grid;
      grid-template-columns: var(--bew-control-height-lg, 40px) minmax(0, 1fr) auto auto;
      align-items: center;
      gap: var(--bew-space-1) var(--bew-space-2);
      min-width: 0;
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-avatar {
      grid-row: span 2;
      width: var(--bew-control-height-lg, 40px);
      height: var(--bew-control-height-lg, 40px);
      margin-right: var(--bew-space-1);
      border-radius: 50%;
      corner-shape: var(--bew-corner-shape-round, round);
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-line--owner {
      grid-area: 1 / 2;
      width: 60%;
      min-width: var(--bew-space-10, 40px);
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-line--owner-sign {
      grid-area: 2 / 2;
      width: 80%;
      height: var(--bew-space-2, 8px);
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-owner-action {
      grid-row: 1 / span 2;
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-owner-action {
      width: calc(var(--bew-space-10, 40px) + var(--bew-space-8, 32px));
      height: var(--bew-control-height);
      border-radius: var(--bew-interactive-radius, 8px);
      corner-shape: var(--bew-corner-shape);
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-owner-action--wide {
      width: calc(var(--bew-space-12, 48px) * 2);
      margin-left: 0;
    }

    /* Four count chips and the square watch-later chip. */
    #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-stats {
      display: grid;
      grid-template-columns: repeat(4, calc(var(--bew-space-12, 48px) + var(--bew-space-6, 24px))) var(--bew-control-height, 36px);
      justify-content: start;
      gap: var(--bew-space-2, 8px);
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-stat {
      height: var(--bew-control-height);
      border-radius: var(--bew-interactive-radius, 8px);
      corner-shape: var(--bew-corner-shape);
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-line--description-short {
      width: 82%;
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-tabs {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      align-items: center;
      flex: 0 0 auto;
      gap: var(--bew-space-8, 32px);
      min-height: var(--bew-control-height, 36px);
      padding: 0 var(--bew-space-6, 24px);
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-tab {
      height: var(--bew-space-3, 12px);
      border-radius: var(--bew-radius-sm, 4px);
      corner-shape: var(--bew-corner-shape);
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-list {
      flex: 1 1 0;
      min-height: 0;
      display: grid;
      place-items: center;
      overflow: hidden;
      color: var(--bew-text-3);
      background: transparent;
      --bew-loading-ring-size: var(--bew-icon-size-xl, 32px);
    }

    /* Same box as the docked composer: two text lines, the tool row and the
       composer surface's padding and border. */
    #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-composer {
      flex: 0 0 auto;
      margin-top: auto;
      height: calc(
        var(--bew-line-height-body, 24px) * 2 + var(--bew-space-1, 4px) * 2 + var(--bew-space-2, 8px)
        + var(--bew-control-height-sm, 28px) + var(--bew-space-3, 12px) * 2 + 2px
      );
      border-radius: var(--bew-composer-radius, 32px);
      corner-shape: var(--bew-corner-shape);
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
      font-weight: var(--bew-font-weight-medium, 500);
      background: var(--bew-fill-2, rgb(0 0 0 / 8%));
      border: 1px solid var(--bew-surface-border-color, rgb(127 127 127 / 12%));
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
      outline: var(--bew-focus-ring, 1px solid CanvasText);
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
      #${LOADING_ROOT_ID} {
        --bewly-widescreen-page-padding: var(--bew-space-3, 12px);
      }

      #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-stage,
      #${LOADING_ROOT_ID}[data-sidebar-position="left"] .bewly-widescreen-loading-skeleton-stage {
        grid-template-columns: minmax(0, 1fr);
        grid-template-rows: auto minmax(0, 1fr);
        grid-template-areas:
          "player"
          "rail";
      }

      #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-player {
        aspect-ratio: 16 / 9;
      }

      #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-info {
        max-height: 28dvh;
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
