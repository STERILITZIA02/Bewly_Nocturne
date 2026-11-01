import { MOBILE_BREAKPOINT } from '~/utils/bewlyWidescreen/constants'
import { WIDESCREEN_SIDEBAR_MIN_WIDTH } from '~/utils/bewlyWidescreenPolicy'
import { EFFECTIVE_TOP_BAR_SOURCE_ATTRIBUTE } from '~/utils/effectiveTopBarSource'
import { isInIframe } from '~/utils/main'

export function playbackTopBarRule(selector: string, declarations: string) {
  if (isInIframe())
    return ''
  return `html[${EFFECTIVE_TOP_BAR_SOURCE_ATTRIBUTE}="bewly"] ${selector} { ${declarations} }`
}

export function playbackRailTopPadding(rail: string) {
  return `@media (min-width: ${MOBILE_BREAKPOINT + 1}px) {
    ${playbackTopBarRule(rail, 'padding-top: calc(var(--bew-top-bar-height, 64px) + var(--bewly-widescreen-page-padding));')}
  }`
}

/**
 * Split geometry shared by the playback shell (declared on body, so the native
 * player and its controls inherit it) and by the loading skeleton.
 *
 * The video pane is about half the window wide and reaches the window's
 * top edge behind the floating header; the player letterboxes
 * the video in it. It narrows when the column beside it would drop below its
 * minimum width. The floating controls keep their own corners, inset by the
 * card inset from the pane's sides and bottom.
 *
 * The column beside it holds the tabs above the active panel,
 * inside the page padding; the panels scroll down to the window's bottom edge.
 */
export const CARD_LAYOUT_PROPERTIES = `
      --bewly-widescreen-shell-radius: var(--bew-modal-radius, 24px);
      --bewly-widescreen-card-inset: var(--bew-space-3, 12px);
      --bewly-widescreen-page-padding: var(--bew-space-6, 24px);
      --bewly-widescreen-card-width: min(50vw, calc(100vw - ${WIDESCREEN_SIDEBAR_MIN_WIDTH}px));`
