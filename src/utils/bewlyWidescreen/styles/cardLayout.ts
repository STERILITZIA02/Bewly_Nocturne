import { MOBILE_BREAKPOINT } from '~/utils/bewlyWidescreen/constants'
import { WIDESCREEN_SIDEBAR_MIN_WIDTH } from '~/utils/bewlyWidescreenPolicy'
import { EFFECTIVE_TOP_BAR_SOURCE_ATTRIBUTE } from '~/utils/effectiveTopBarSource'
import { isInIframe } from '~/utils/main'

export function playbackTopBarRule(selector: string, declarations: string) {
  if (isInIframe())
    return ''
  return `html[${EFFECTIVE_TOP_BAR_SOURCE_ATTRIBUTE}="bewly"] ${selector} { ${declarations} }`
}

/**
 * Beside the video the Bewly header only spans the video pane, so the column's
 * tabs sit in the header's row, as far from the window's top as its glass
 * controls. With the column on the left the header crosses it, and the column
 * starts below the header. The offset is kept in --bewly-widescreen-rail-head-top
 * for the head's glass band (playbackRailHeadGlass).
 */
export function playbackRailTopPadding(root: string, rail: string) {
  return `${root} ${rail} {
    --bewly-widescreen-rail-head-top: var(--bewly-widescreen-page-padding);
    padding-top: var(--bewly-widescreen-rail-head-top);
  }

  @media (min-width: ${MOBILE_BREAKPOINT + 1}px) {
    ${playbackTopBarRule(`${root} ${rail}`, '--bewly-widescreen-rail-head-top: var(--bewly-widescreen-rail-head-inset);')}
    ${playbackTopBarRule(`${root}[data-sidebar-position="left"] ${rail}`, '--bewly-widescreen-rail-head-top: calc(var(--bew-top-bar-height, 64px) + var(--bewly-widescreen-page-padding));')}
  }`
}

/**
 * The column's head, everything above the panels' hairline (the top offset,
 * the tabs and the gap under them, --bewly-widescreen-rail-head-height), is
 * one clear glass band (user-specified 2026-11-05): the shared glass filter
 * (--bew-filter-glass-1, which follows the global blur strength and is none
 * with frosted glass off) with no tint, so the band itself keeps the
 * column's color. The panels reach up behind it, so content scrolled up
 * shows through it, blurred; the hairline is the band's lower edge. It sits
 * over the panels and under the tabs, inside the column's isolation. The
 * danmaku panel's own pinned head continues it (layout.ts).
 */
export function playbackRailHeadGlass(root: string, rail: string) {
  return `${root} ${rail} {
    --bewly-widescreen-rail-head-height: calc(var(--bewly-widescreen-rail-head-top) + var(--bewly-widescreen-rail-tabs-height) + var(--bewly-widescreen-rail-head-inset));
  }

  ${root} ${rail}::before {
    content: "";
    position: absolute;
    inset: 0 0 auto;
    z-index: 1;
    box-sizing: content-box;
    height: var(--bewly-widescreen-rail-head-height);
    border-bottom: var(--bew-hairline, 1px) solid var(--bew-separator-color);
    backdrop-filter: var(--bew-filter-glass-1);
    pointer-events: none;
  }`
}

/**
 * Split geometry shared by the playback shell (declared on body, so the native
 * player and its controls inherit it) and by the loading skeleton.
 *
 * The video pane is two thirds of the window wide (the column beside it a third) and reaches the window's
 * top edge behind the floating header; the player letterboxes
 * the video in it. It narrows when the column beside it would drop below its
 * minimum width. The floating controls keep their own corners, inset by the
 * card inset from the pane's sides and bottom.
 *
 * The column beside it holds the tabs above the active panel,
 * inside the page padding; the panels scroll down to the window's bottom edge.
 */
/**
 * Beside the column the letterbox is part of the page: grey in the light theme
 * (user-specified), the black player canvas in the dark one.
 */
export function playbackLetterbox(root: string) {
  return `:root:not(.dark) ${root} {
    --bewly-widescreen-letterbox: color-mix(in srgb, var(--bew-neutral-fg) 22%, var(--bew-neutral-bg));
  }`
}

export const CARD_LAYOUT_PROPERTIES = `
      --bewly-widescreen-letterbox: var(--bew-player-canvas);
      --bewly-widescreen-shell-radius: var(--bew-modal-radius, 24px);
      --bewly-widescreen-card-inset: var(--bew-space-3, 12px);
      --bewly-widescreen-page-padding: var(--bew-space-6, 24px);
      /* The column's tabs sit as far from the window's top, and from the
         panels' hairline below them, as the header's glass controls are from
         the window's top. */
      --bewly-widescreen-rail-head-inset: calc((var(--bew-top-bar-height, 64px) - var(--bew-top-bar-primary-control-height, 46px)) / 2);
      --bewly-widescreen-rail-tabs-height: var(--bew-control-height-sm, 28px);
      --bewly-widescreen-card-width: min(calc(100vw * 2 / 3), calc(100vw - ${WIDESCREEN_SIDEBAR_MIN_WIDTH}px));`
