import LOADING_RING_CSS from '~/styles/loadingRing.scss?inline'
import SKELETON_CSS from '~/styles/skeleton.scss?inline'
import { LOADING_FADE_DURATION, LOADING_ROOT_ID, MOBILE_BREAKPOINT } from '~/utils/bewlyWidescreen/constants'
import { CARD_LAYOUT_PROPERTIES, playbackLetterbox, playbackRailHeadGlass, playbackRailTopPadding, playbackRecommendationSkeleton, playbackTopBarRule } from '~/utils/bewlyWidescreen/styles/cardLayout'
import { injectCSS } from '~/utils/main'
import { reducedMotionCss } from '~/utils/reducedMotion'

export function injectLoadingStyle() {
  return injectCSS(`
    ${SKELETON_CSS}
    ${LOADING_RING_CSS}
    ${playbackRailTopPadding(`#${LOADING_ROOT_ID}`, '.bewly-widescreen-loading-skeleton-sidebar')}
    ${playbackRailHeadGlass(`#${LOADING_ROOT_ID}`, '.bewly-widescreen-loading-skeleton-sidebar')}
    ${playbackLetterbox(`#${LOADING_ROOT_ID}`)}
    ${playbackRecommendationSkeleton(`#${LOADING_ROOT_ID}`)}
    #${LOADING_ROOT_ID} {
      position: fixed;
      inset: 0;
      z-index: var(--bew-z-widescreen-loading);
      overflow: hidden;
      color: var(--bew-text-2, #61666d);
      background: var(--bew-bg, #f6f7f8);
      font-family: var(--bew-fonts-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
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
      background: var(--bewly-widescreen-letterbox);
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-block {
      display: block;
      flex: 0 0 auto;
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-player-mark {
      --bew-loading-ring-size: var(--bewly-widescreen-player-ring-size);
      position: absolute;
      top: 50%;
      left: 50%;
      color: var(--bewly-widescreen-player-ring-color);
      translate: -50% -50%;
    }

    /* The Bewly header's glass controls (the overlay covers the real ones):
       the logo, search and history navigation from the window's left, the
       page group over the video pane's top-right corner. */
    #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-top-bar {
      display: none;
      position: absolute;
      inset: 0 0 auto;
      z-index: 2;
      height: var(--bew-top-bar-height);
      pointer-events: none;
    }

    ${playbackTopBarRule(`#${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-top-bar`, 'display: block;')}

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-top-bar-start {
      position: absolute;
      top: var(--bew-home-logo-block-start);
      left: var(--bew-home-logo-inline-start);
      display: flex;
      gap: var(--bew-top-bar-section-gap);
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-top-bar-tools {
      position: absolute;
      top: var(--bew-home-logo-block-start);
      right: calc(100% - var(--bewly-widescreen-card-width) + var(--bewly-widescreen-card-inset));
    }

    #${LOADING_ROOT_ID}[data-sidebar-position="left"] .bewly-widescreen-loading-skeleton-top-bar-tools {
      right: var(--bewly-widescreen-card-inset);
    }

    /* Circles for one slot, capsules for several, like the header's glass. */
    #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-top-bar-control {
      box-sizing: border-box;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--bew-space-2);
      min-width: var(--bew-top-bar-primary-control-height);
      height: var(--bew-top-bar-primary-control-height);
      padding-inline: calc((var(--bew-top-bar-primary-control-height) - var(--bew-control-height)) / 2 - var(--bew-hairline));
      background: var(--bew-elevated-alt-solid);
      border: var(--bew-hairline) solid var(--bew-edge-color);
      border-radius: var(--bew-pill-radius);
      corner-shape: var(--bew-corner-shape-capsule);
      box-shadow: var(--bew-glass-shadow);
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-top-bar-slot {
      display: grid;
      place-items: center;
      width: var(--bew-control-height);
      height: var(--bew-control-height);
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-icon {
      width: var(--bew-icon-size-md);
      height: var(--bew-icon-size-md);
      border-radius: var(--bew-radius-tiny);
      corner-shape: var(--bew-corner-shape);
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-top-bar-control--logo .bewly-widescreen-loading-skeleton-icon {
      width: var(--bew-icon-size-lg);
      height: var(--bew-icon-size-lg);
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-controls {
      position: absolute;
      right: var(--bewly-widescreen-card-inset);
      bottom: var(--bewly-widescreen-card-inset);
      left: var(--bewly-widescreen-card-inset);
      z-index: 1;
      box-sizing: border-box;
      display: grid;
      gap: var(--bew-space-2);
      padding: var(--bew-space-3);
      background: var(--bew-elevated-alt-solid);
      border: var(--bew-hairline) solid var(--bew-edge-color);
      border-radius: var(--bewly-widescreen-shell-radius);
      corner-shape: var(--bew-corner-shape);
      box-shadow: var(--bew-shadow-2);
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-progress {
      width: 100%;
      height: var(--bew-space-1);
      border-radius: var(--bew-pill-radius);
      corner-shape: var(--bew-corner-shape-capsule);
    }

    #${LOADING_ROOT_ID} :is(
      .bewly-widescreen-loading-skeleton-player-controls,
      .bewly-widescreen-loading-skeleton-danmaku-controls
    ) {
      display: flex;
      align-items: center;
      gap: var(--bew-space-3);
      min-width: 0;
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-player-controls {
      min-height: var(--bew-control-height);
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-danmaku-controls {
      min-height: var(--bew-control-height);
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-circle {
      width: var(--bew-icon-size-md);
      height: var(--bew-icon-size-md);
      border-radius: 50%;
      corner-shape: var(--bew-corner-shape-round, round);
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-time {
      width: calc(var(--bew-space-12) + var(--bew-space-6));
      height: var(--bew-space-3);
      border-radius: var(--bew-radius-tiny);
      corner-shape: var(--bew-corner-shape);
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-spacer {
      min-width: var(--bew-space-2);
      flex: 1 1 auto;
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-control-label {
      width: var(--bew-space-8);
      height: var(--bew-space-3);
      border-radius: var(--bew-radius-tiny);
      corner-shape: var(--bew-corner-shape);
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-control-label--wide {
      width: calc(var(--bew-space-12) + var(--bew-space-6));
    }

    /* The hairline between the app's and the danmaku controls. */
    #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-divider {
      flex: none;
      width: var(--bew-hairline);
      height: var(--bew-space-5);
      background: var(--bew-separator-color);
    }

    /* The danmaku field with its send button inside the far end. */
    #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-input {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: flex-end;
      min-width: var(--bew-space-12);
      height: var(--bew-control-height);
      flex: 1 1 auto;
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-input-field {
      position: absolute;
      inset: 0;
      border-radius: var(--bew-pill-radius);
      corner-shape: var(--bew-corner-shape-capsule);
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-send {
      position: relative;
      width: var(--bew-control-height-sm);
      height: var(--bew-control-height-sm);
      margin-inline-end: var(--bew-space-1);
      border-radius: 50%;
      corner-shape: var(--bew-corner-shape-round, round);
    }

    /* A hairline between the video and the column, the same edge as the
       page rails beside the content. */
    @media (min-width: ${MOBILE_BREAKPOINT + 1}px) {
      #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-sidebar {
        border-inline-start: var(--bew-glass-edge-width) solid var(--bew-glass-edge-color);
      }

      #${LOADING_ROOT_ID}[data-sidebar-position="left"] .bewly-widescreen-loading-skeleton-sidebar {
        border-inline-start: 0;
        border-inline-end: var(--bew-glass-edge-width) solid var(--bew-glass-edge-color);
      }
    }

    /* The column: the tabs on the head's glass band, then (one space-3
       below the band's hairline, as the panels start) the info card and
       the recommendations, both on the content line. */
    #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-sidebar {
      position: relative;
      display: flex;
      flex-direction: column;
      grid-area: rail;
      box-sizing: border-box;
      min-width: 0;
      min-height: 0;
      padding-inline: var(--bewly-widescreen-page-padding);
      overflow: hidden;
      isolation: isolate;
      background: transparent;
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-tabs {
      position: relative;
      z-index: 2;
      display: flex;
      flex: none;
      height: var(--bewly-widescreen-rail-tabs-height);
      margin-bottom: calc(var(--bewly-widescreen-rail-head-inset) + var(--bew-space-3));
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-tab {
      display: flex;
      flex: 1 1 0;
      align-items: center;
      justify-content: center;
      gap: var(--bew-space-1);
      min-width: 0;
      border-radius: var(--bew-interactive-radius);
      corner-shape: var(--bew-corner-shape);
    }

    /* The overview opens: the selected tab's plate. */
    #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-tab:first-child {
      background: var(--bewly-widescreen-control-selected-bg);
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-tab-icon {
      width: var(--bew-icon-size-sm);
      height: var(--bew-icon-size-sm);
      border-radius: 50%;
      corner-shape: var(--bew-corner-shape-round, round);
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-tab-label {
      width: var(--bew-space-8);
      height: var(--bew-space-3);
      border-radius: var(--bew-radius-tiny);
      corner-shape: var(--bew-corner-shape);
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-info {
      display: flex;
      flex: none;
      flex-direction: column;
      min-width: 0;
      min-height: 0;
      overflow: hidden;
    }

    /* The info card (layout.ts), with the section break below it that the
       real info's height includes. Its spacing is the card's: title to meta
       8, meta to author 16, author to actions 12, actions to description 16. */
    #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-sidebar-top {
      display: flex;
      flex: none;
      flex-direction: column;
      min-height: 0;
      margin-bottom: var(--bew-space-6);
      padding: var(--bew-space-4);
      overflow: hidden;
      border: var(--bew-hairline) solid var(--bew-edge-color);
      border-radius: var(--bew-surface-radius);
      corner-shape: var(--bew-corner-shape);
      background: var(--bew-elevated-over-page);
      box-shadow: var(--bew-shadow-1);
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-info-head {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: start;
      gap: var(--bew-space-3);
    }

    #${LOADING_ROOT_ID} :is(
      .bewly-widescreen-loading-skeleton-title,
      .bewly-widescreen-loading-skeleton-description,
      .bewly-widescreen-loading-skeleton-media-info
    ) {
      display: grid;
      align-content: start;
      gap: var(--bew-space-2);
      min-width: 0;
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-toggle {
      width: var(--bew-control-item-height);
      height: var(--bew-control-item-height);
      margin-top: calc((var(--bew-line-height-heading) - var(--bew-control-item-height)) / 2);
      border-radius: var(--bew-interactive-radius);
      corner-shape: var(--bew-corner-shape);
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-line {
      width: 100%;
      height: var(--bew-space-3);
      border-radius: var(--bew-radius-tiny);
      corner-shape: var(--bew-corner-shape);
    }

    /* Heading lines (17/22), the second one short. */
    #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-line--title {
      height: var(--bew-space-4);
      margin-block: calc((var(--bew-line-height-heading) - var(--bew-space-4)) / 2);
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-title {
      gap: 0;
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-line--title + .bewly-widescreen-loading-skeleton-line--title {
      width: 60%;
    }

    /* One caption line box (11/14), 8 below the title. */
    #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-line--meta {
      width: 56%;
      height: var(--bew-space-2);
      margin-block: calc(var(--bew-space-2) + (var(--bew-line-height-caption) - var(--bew-space-2)) / 2) calc((var(--bew-line-height-caption) - var(--bew-space-2)) / 2);
    }

    /* Avatar, name over sign, then charge and follow at the right edge. */
    #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-owner {
      display: grid;
      grid-template-columns: var(--bew-control-height-lg) minmax(0, 1fr) auto auto;
      align-items: center;
      gap: var(--bew-space-1) var(--bew-space-2);
      min-width: 0;
      margin-top: var(--bew-space-4);
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-avatar {
      grid-area: 1 / 1 / span 2;
      width: var(--bew-control-height-lg);
      height: var(--bew-control-height-lg);
      margin-right: var(--bew-space-1);
      border-radius: 50%;
      corner-shape: var(--bew-corner-shape-round, round);
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-line--owner {
      grid-area: 1 / 2;
      align-self: end;
      width: 40%;
      min-width: var(--bew-space-10);
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-line--owner-sign {
      grid-area: 2 / 2;
      align-self: start;
      width: 72%;
      height: var(--bew-space-2);
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-owner .bewly-widescreen-loading-skeleton-owner-action {
      grid-area: 1 / 3 / span 2;
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-owner .bewly-widescreen-loading-skeleton-owner-action--wide {
      grid-column: 4;
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-owner-action {
      width: calc(var(--bew-space-12) + var(--bew-space-2));
      height: var(--bew-control-height);
      border-radius: var(--bew-interactive-radius);
      corner-shape: var(--bew-corner-shape);
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-owner-action--wide {
      width: calc(var(--bew-space-12) * 2 + var(--bew-space-2));
    }

    /* Five equal pills across the row; bangumi adds the square "more". */
    #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-actions {
      display: grid;
      grid-template-columns: repeat(5, minmax(0, 1fr));
      gap: var(--bew-space-1);
      margin-top: var(--bew-space-3);
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-actions[data-more] {
      grid-template-columns: repeat(5, minmax(0, 1fr)) var(--bew-control-height);
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-action {
      height: var(--bew-control-height);
      border-radius: var(--bew-interactive-radius);
      corner-shape: var(--bew-corner-shape);
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-description {
      margin-top: var(--bew-space-4);
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-line--description-short {
      width: 82%;
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-tags {
      display: flex;
      flex-wrap: wrap;
      gap: var(--bew-space-2);
      margin-top: var(--bew-space-3);
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-tag {
      width: calc(var(--bew-space-12) + var(--bew-space-1));
      height: var(--bew-control-item-height);
      border-radius: var(--bew-pill-radius);
      corner-shape: var(--bew-corner-shape-capsule);
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-tag:nth-child(even) {
      width: calc(var(--bew-space-12) + var(--bew-space-6));
    }

    /* Bangumi: the poster (layout.ts, mediainfo_mediaCover) beside the
       series, its counts, the synopsis and the channel / follow buttons. */
    #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-media {
      display: flex;
      align-items: flex-start;
      gap: var(--bew-space-3);
      margin-top: var(--bew-space-2);
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-poster {
      flex: none;
      width: calc(var(--bew-space-12) * 1.5);
      aspect-ratio: 3 / 4;
      border-radius: var(--bew-thumb-radius);
      corner-shape: var(--bew-corner-shape);
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-media-info {
      flex: 1;
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-line--series {
      width: 48%;
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-media-info > .bewly-widescreen-loading-skeleton-line--meta {
      margin-block: 0;
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-media-buttons {
      display: flex;
      gap: var(--bew-space-2);
      margin-top: var(--bew-space-2);
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
      font-weight: var(--bew-font-weight-regular, 400);
      background: var(--bew-fill-2, rgb(0 0 0 / 8%));
      border: var(--bew-hairline, 1px) solid var(--bew-edge-color, rgb(127 127 127 / 12%));
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

    ${reducedMotionCss(`#${LOADING_ROOT_ID}, #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-block`, 'transition:none;animation:none;')}

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

      /* The video spans the window, so the page group sits at its right. */
      #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-top-bar-tools,
      #${LOADING_ROOT_ID}[data-sidebar-position="left"] .bewly-widescreen-loading-skeleton-top-bar-tools {
        right: var(--bewly-widescreen-card-inset);
      }

      /* Narrow, the labelled controls and most of the app's fold away. */
      #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-control-label,
      #${LOADING_ROOT_ID} .bewly-widescreen-loading-skeleton-danmaku-controls > .bewly-widescreen-loading-skeleton-circle:nth-child(-n + 3) {
        display: none;
      }
    }
  `)
}
