export const MOMENTS_SCROLL_BOUNDARY_TOLERANCE_PX = 2

interface HorizontalScrollStateInput {
  scrollLeft: number
  scrollWidth: number
  clientWidth: number
  tolerance?: number
}

interface MomentGridGeometryInput {
  containerWidth: number
  preferredColumns: number
  minCardWidth: number
  gap: number
  maxColumns?: number
}

interface MomentCardWidthInput {
  gridClientWidth: number
  columns: number
  gap: number
}

interface MomentsSidebarVisibilityInput {
  layoutWidth: number
  sidebarWidth: number
  gap: number
  minMainWidth: number
  hasContent: boolean
}

export function resolveHorizontalScrollState(input: HorizontalScrollStateInput) {
  const tolerance = Math.max(0, input.tolerance ?? MOMENTS_SCROLL_BOUNDARY_TOLERANCE_PX)
  const maxScrollLeft = Math.max(0, input.scrollWidth - input.clientWidth)
  const scrollLeft = Math.min(maxScrollLeft, Math.max(0, input.scrollLeft))
  return {
    canScrollLeft: scrollLeft > tolerance,
    canScrollRight: maxScrollLeft - scrollLeft > tolerance,
  }
}

export function resolveMomentGridColumnCount(input: MomentGridGeometryInput): number {
  const preferredColumns = Math.max(1, Math.floor(input.preferredColumns))
  const maxColumns = Math.max(1, Math.floor(input.maxColumns ?? 3))
  const cappedPreferredColumns = Math.min(preferredColumns, maxColumns)
  const fittingColumns = Math.floor((Math.max(0, input.containerWidth) + input.gap) / (input.minCardWidth + input.gap))
  return Math.max(1, Math.min(cappedPreferredColumns, fittingColumns || 1))
}

export function resolveMomentCardWidth(input: MomentCardWidthInput): number {
  const columns = Math.max(1, Math.floor(input.columns))
  const usableWidth = Math.max(0, input.gridClientWidth - input.gap * (columns - 1))
  return usableWidth / columns
}

export function resolveVirtualSpacerSize(accumulatedSize: number, gap: number): number {
  return accumulatedSize > 0 ? Math.max(0, accumulatedSize - gap) : 0
}

export function shouldShowMomentsSidebar(input: MomentsSidebarVisibilityInput): boolean {
  if (!input.hasContent)
    return false
  const requiredWidth = input.sidebarWidth + input.gap + input.minMainWidth
  return input.layoutWidth >= requiredWidth
}
