import { VIDEO_CARD_MIN_WIDTH } from '~/constants/layout'

export { GRID_BREAKPOINTS } from '~/constants/layout'

/**
 * The default width at which a manually selected two-column list falls back
 * to one column when automatic switching is enabled.
 */
export const MOBILE_LIST_LAYOUT_BREAKPOINT = 640

/** Keep the user-configurable breakpoint in a range that still produces usable cards. */
export const MIN_LIST_LAYOUT_BREAKPOINT = 320
export const MAX_LIST_LAYOUT_BREAKPOINT = 1200

export function normalizeListLayoutBreakpoint(value: unknown): number {
  if (value == null || (typeof value === 'string' && value.trim() === ''))
    return MOBILE_LIST_LAYOUT_BREAKPOINT

  if (typeof value !== 'number' && typeof value !== 'string')
    return MOBILE_LIST_LAYOUT_BREAKPOINT

  const normalized = Number(value)
  if (!Number.isFinite(normalized))
    return MOBILE_LIST_LAYOUT_BREAKPOINT

  return Math.min(
    MAX_LIST_LAYOUT_BREAKPOINT,
    Math.max(MIN_LIST_LAYOUT_BREAKPOINT, Math.round(normalized)),
  )
}

export type ListGridLayout = 'twoColumns' | 'oneColumn'

/** Same rule as the CSS `auto-fill` grid: as many minimum-width covers as fit. */
export function getAdaptiveGridColumnCount(width: number, gap: number): number {
  return Math.max(1, Math.floor((width + gap) / (VIDEO_CARD_MIN_WIDTH + gap)))
}

export function getListGridColumnCount(
  layout: ListGridLayout,
  viewportWidth: number,
  autoSwitch: boolean,
  breakpoint: number = MOBILE_LIST_LAYOUT_BREAKPOINT,
): number {
  if (layout === 'oneColumn')
    return 1

  if (!autoSwitch)
    return 2

  const switchBreakpoint = normalizeListLayoutBreakpoint(breakpoint)
  return Number.isFinite(viewportWidth) && viewportWidth >= switchBreakpoint ? 2 : 1
}
