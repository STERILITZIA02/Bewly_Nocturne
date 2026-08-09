/** Keep these values aligned one-to-one with src/styles/_breakpoints.scss. */
export const GRID_BREAKPOINTS = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  xxl: 1536,
} as const

export const LAYOUT_BREAKPOINTS = {
  mobileMax: GRID_BREAKPOINTS.md - 1,
  compactMax: GRID_BREAKPOINTS.xl - 1,
} as const
