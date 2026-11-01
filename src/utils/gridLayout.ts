export type ListGridLayout = 'twoColumns' | 'oneColumn'

/**
 * Same rule as the CSS `auto-fill` grid: as many minimum-width covers as fit.
 * `minWidth` is VIDEO_CARD_MIN_WIDTH on this display (`uiPx`).
 */
export function getAdaptiveGridColumnCount(width: number, gap: number, minWidth: number): number {
  return Math.max(1, Math.floor((width + gap) / (minWidth + gap)))
}

export function getListGridColumnCount(
  layout: ListGridLayout,
  containerWidth: number,
  gap: number,
  minWidth: number,
): number {
  if (layout === 'oneColumn')
    return 1

  // A list uses the same minimum usable card width as the adaptive grid.
  return containerWidth >= minWidth * 2 + gap ? 2 : 1
}
