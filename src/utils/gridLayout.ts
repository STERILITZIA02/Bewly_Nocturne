import { VIDEO_CARD_MIN_WIDTH } from '~/constants/layout'

export type ListGridLayout = 'twoColumns' | 'oneColumn'

/** Same rule as the CSS `auto-fill` grid: as many minimum-width covers as fit. */
export function getAdaptiveGridColumnCount(width: number, gap: number): number {
  return Math.max(1, Math.floor((width + gap) / (VIDEO_CARD_MIN_WIDTH + gap)))
}

export function getListGridColumnCount(
  layout: ListGridLayout,
  containerWidth: number,
  gap: number,
): number {
  if (layout === 'oneColumn')
    return 1

  // A list uses the same minimum usable card width as the adaptive grid.
  return containerWidth >= VIDEO_CARD_MIN_WIDTH * 2 + gap ? 2 : 1
}
