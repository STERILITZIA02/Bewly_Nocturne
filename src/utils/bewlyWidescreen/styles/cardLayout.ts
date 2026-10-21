import { WIDESCREEN_SIDEBAR_MIN_WIDTH } from '~/utils/bewlyWidescreenPolicy'

/**
 * Split geometry shared by the playback shell (declared on body, so the native
 * player and its controls inherit it) and by the loading skeleton.
 *
 * The video pane is about half the window wide and runs the full height,
 * flush with the window's edges and square-cornered; the player letterboxes
 * the video in it. It narrows when the column beside it would drop below its
 * minimum width. The floating controls keep their own corners, inset by the
 * card inset from the pane's sides and bottom.
 *
 * The column beside it holds the info on top, then the tabs and the panels,
 * inside the page padding; the panels scroll down to the window's bottom edge.
 */
export const CARD_LAYOUT_PROPERTIES = `
      --bewly-widescreen-shell-radius: var(--bew-modal-radius, 24px);
      --bewly-widescreen-card-inset: var(--bew-space-3, 12px);
      --bewly-widescreen-page-padding: var(--bew-space-6, 24px);
      --bewly-widescreen-card-width: min(50vw, calc(100vw - ${WIDESCREEN_SIDEBAR_MIN_WIDTH}px));`
