import { getBilibiliImageResourceKey } from './bilibiliUrl'
import { normalizeMomentRemoteUrl } from './momentUrl'

/** One gallery never holds more than this many images. */
export const IMAGE_VIEWER_MAX_IMAGES = 100
/** Upper zoom bound in image pixels per screen pixel (400%). */
export const IMAGE_VIEWER_MAX_SCALE = 4
/** One button press or key press zooms by this factor. */
export const IMAGE_VIEWER_ZOOM_STEP = 1.25

export interface ImageViewerSize { width: number, height: number }
export interface ImageViewerPoint { x: number, y: number }
export interface ImageViewerRect { left: number, top: number, width: number, height: number }

/** The free area the fitted image centres in; chrome floats over the rest. */
export interface ImageViewerSafeArea extends ImageViewerRect {}

export interface ImageViewerGallery { urls: string[], index: number }

function isOriginalImageUrl(url: string) {
  return /\.(?:gif|jpe?g|png)$/i.test(url.split(/[?#]/, 1)[0])
}

/** The form a gallery stores an image URL in; callers compare against it. */
export function normalizeImageViewerUrl(value: unknown) {
  if (typeof value !== 'string')
    return ''
  const url = value.trim()
  // Local drafts (object URLs) are shown as they are; remote images go https.
  return url.startsWith('blob:') ? url : normalizeMomentRemoteUrl(url)
}

/**
 * One entry per Bilibili image resource, preferring the original-format URL
 * when a gallery lists both an original and a resized copy. The requested
 * index is mapped through the de-duplication so it still points at the image
 * that was clicked.
 */
export function normalizeImageViewerGallery(value: unknown, requestedIndex: unknown): ImageViewerGallery {
  const urls: string[] = []
  const urlIndexes = new Map<string, number>()
  const sourceIndexes: number[] = []
  if (Array.isArray(value)) {
    value.forEach((raw, sourceIndex) => {
      const url = normalizeImageViewerUrl(raw)
      if (!url)
        return
      const key = url.startsWith('blob:') ? url : getBilibiliImageResourceKey(url)
      const existing = urlIndexes.get(key)
      if (existing !== undefined) {
        sourceIndexes[sourceIndex] = existing
        if (isOriginalImageUrl(url) && !isOriginalImageUrl(urls[existing]))
          urls[existing] = url
        return
      }
      urlIndexes.set(key, urls.length)
      sourceIndexes[sourceIndex] = urls.length
      urls.push(url)
    })
  }
  const limited = urls.slice(0, IMAGE_VIEWER_MAX_IMAGES)
  const requested = Number(requestedIndex)
  const mapped = Number.isInteger(requested) ? sourceIndexes[requested] : undefined
  const index = mapped ?? (Number.isFinite(requested) ? requested : 0)
  return { urls: limited, index: Math.min(limited.length - 1, Math.max(0, Math.trunc(index))) }
}

export function wrapImageViewerIndex(index: number, count: number) {
  return count ? ((index % count) + count) % count : 0
}

/** The image's on-screen box size before scaling, after a quarter-turn rotation. */
export function getRotatedSize(natural: ImageViewerSize, rotation: number): ImageViewerSize {
  return Math.abs(rotation / 90) % 2 === 1
    ? { width: natural.height, height: natural.width }
    : natural
}

/** Fits the image inside the safe area without enlarging it past its pixels. */
export function getFitScale(natural: ImageViewerSize, safe: ImageViewerSize, rotation = 0) {
  const rotated = getRotatedSize(natural, rotation)
  if (!rotated.width || !rotated.height || !safe.width || !safe.height)
    return 1
  return Math.min(1, safe.width / rotated.width, safe.height / rotated.height)
}

export function getMaxScale(fit: number) {
  return Math.max(IMAGE_VIEWER_MAX_SCALE, fit)
}

export function clampScale(scale: number, fit: number) {
  return Math.min(getMaxScale(fit), Math.max(fit, scale))
}

/** The scale a double click or the "actual size" control goes to from the fitted view. */
export function getDetailScale(fit: number) {
  return Math.min(getMaxScale(fit), fit < 1 ? Math.max(1, fit * 2) : 2)
}

/**
 * Pan limits for the image centred at `center`: an image larger than the
 * viewport may move until an edge reaches the viewport edge; a smaller one
 * may move within the viewport. Both cases reduce to the same interval.
 */
export function getPanBounds(natural: ImageViewerSize, viewport: ImageViewerSize, center: ImageViewerPoint, scale: number, rotation: number) {
  const rotated = getRotatedSize(natural, rotation)
  const width = rotated.width * scale
  const height = rotated.height * scale
  const axis = (size: number, extent: number, origin: number) => {
    const a = extent - origin - size / 2
    const b = size / 2 - origin
    return { min: Math.min(a, b), max: Math.max(a, b) }
  }
  return { x: axis(width, viewport.width, center.x), y: axis(height, viewport.height, center.y) }
}

export function clampPan(pan: ImageViewerPoint, bounds: ReturnType<typeof getPanBounds>): ImageViewerPoint {
  return {
    x: Math.min(bounds.x.max, Math.max(bounds.x.min, pan.x)),
    y: Math.min(bounds.y.max, Math.max(bounds.y.min, pan.y)),
  }
}

/** Past a pan limit the image follows at a third of the pointer distance. */
export function resistPan(pan: ImageViewerPoint, bounds: ReturnType<typeof getPanBounds>): ImageViewerPoint {
  const resist = (value: number, min: number, max: number) => (
    value < min ? min + (value - min) / 3 : value > max ? max + (value - max) / 3 : value
  )
  return { x: resist(pan.x, bounds.x.min, bounds.x.max), y: resist(pan.y, bounds.y.min, bounds.y.max) }
}

/**
 * Keeps the image point under `point` (relative to the image centre's resting
 * position) in place while the scale changes.
 */
export function zoomPanAt(pan: ImageViewerPoint, scale: number, nextScale: number, point: ImageViewerPoint): ImageViewerPoint {
  const ratio = nextScale / scale
  return { x: point.x - (point.x - pan.x) * ratio, y: point.y - (point.y - pan.y) * ratio }
}

/**
 * The transform and clip that make the fitted image cover `origin` exactly,
 * as an `object-fit: cover` thumbnail does, for the open and close morph.
 * `fitted` is the image's resting on-screen box; `natural` is its pixel size.
 */
export function getOriginMorph(origin: ImageViewerRect, fitted: ImageViewerRect, natural: ImageViewerSize, originRadius: number) {
  const cover = Math.max(origin.width / fitted.width, origin.height / fitted.height)
  const scaleOnScreen = fitted.width / natural.width * cover
  const visibleWidth = origin.width / scaleOnScreen
  const visibleHeight = origin.height / scaleOnScreen
  const insetX = Math.max(0, (natural.width - visibleWidth) / 2)
  const insetY = Math.max(0, (natural.height - visibleHeight) / 2)
  return {
    dx: origin.left + origin.width / 2 - (fitted.left + fitted.width / 2),
    dy: origin.top + origin.height / 2 - (fitted.top + fitted.height / 2),
    scale: cover,
    clip: `inset(${insetY}px ${insetX}px round ${originRadius / scaleOnScreen}px)`,
  }
}

/** True when the rectangle is at least partly on screen and large enough to morph into. */
export function isUsableOrigin(rect: ImageViewerRect | undefined, viewport: ImageViewerSize): rect is ImageViewerRect {
  return Boolean(rect && rect.width > 4 && rect.height > 4
    && rect.left < viewport.width && rect.top < viewport.height
    && rect.left + rect.width > 0 && rect.top + rect.height > 0)
}
