export const VERTICAL_ZOOM_MAP_HEIGHT = 160

/** All dimensions are CSS pixels in the native player's padding box. */
export function getVerticalZoomGeometry(input: {
  width: number
  height: number
  aspect: number
  zoomed: boolean
  side: 'left' | 'right'
  gap: number
  buttonWidth: number
  buttonHeight: number
  bottom: number
  toolbarBottom: number
}) {
  const { width, height, aspect, zoomed, side, gap, buttonWidth, buttonHeight, bottom, toolbarBottom } = input
  const frameWidth = Math.min(width, height * (zoomed ? 1 : aspect))
  const blackWidth = Math.max(0, (width - frameWidth) / 2)
  const usableWidth = Math.max(0, (blackWidth >= 48 + gap * 2 ? blackWidth : width) - gap * 2)
  const top = Math.max(gap, Math.min(Math.max(gap * 4, toolbarBottom + gap), bottom - buttonHeight))
  const mapTop = top + buttonHeight + gap
  const mapHeight = Math.max(0, Math.min(VERTICAL_ZOOM_MAP_HEIGHT, bottom - mapTop, usableWidth / aspect))
  const mapWidth = Math.min(usableWidth, Math.max(48, Math.min(96, mapHeight * aspect)))
  const columnWidth = Math.max(buttonWidth, mapWidth)
  return {
    side,
    left: side === 'left' ? gap : Math.max(gap, width - gap - columnWidth),
    top,
    mapTop,
    mapHeight,
    mapWidth,
    buttonAvailable: width >= buttonWidth + gap * 2 && top >= toolbarBottom + gap && top + buttonHeight <= bottom,
    mapAvailable: mapHeight >= 48 && mapWidth >= 48,
  }
}
