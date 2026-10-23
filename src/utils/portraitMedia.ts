/**
 * Portrait media is at least as tall as it is wide (≥ 1:1): portrait videos and
 * live rooms, tall images. Cards mark it with `data-bewly-portrait`. Moment
 * cards whose top picture is portrait take its colour below it (user request);
 * other cards carry the marker for later designs.
 */

/**
 * A portrait picture on a moment card shows its upper part clearly: at least a
 * landscape video cover's height (it is ≥ 1:1, so always) and at most this many
 * card widths. Below that the card takes the picture's colour (user request).
 */
export const PORTRAIT_MAX_CLEAR_HEIGHT = 1.2

/** `ratio` is width / height. */
export function isPortraitRatio(ratio: number | null | undefined) {
  return typeof ratio === 'number' && Number.isFinite(ratio) && ratio > 0 && ratio <= 1
}

/** Bilibili `dimension`: `rotate` 1 means width and height are swapped. */
export function isPortraitDimension(dimension: { width?: number, height?: number, rotate?: number } | null | undefined) {
  const { width = 0, height = 0, rotate = 0 } = dimension ?? {}
  if (!(width > 0 && height > 0))
    return false
  return rotate === 1 ? width >= height : height >= width
}
