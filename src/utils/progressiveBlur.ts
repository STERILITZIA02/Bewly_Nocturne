/**
 * Gradient ("progressive") blur, as in iOS scroll edges: the blur radius itself
 * decays away from the edge, so content sharpens smoothly with no boundary.
 *
 * One backdrop-filter layer under a gradient mask cannot do this: it only mixes
 * the sharp image with a fixed-strength blurred copy, so the blurred region
 * keeps a visible rectangular edge. Instead layers are stacked: each doubles
 * the radius while its mask window shrinks toward the edge, and each layer's
 * backdrop is the previous layer's result, so blur accumulates near the edge
 * and falls to under a pixel at the far end.
 *
 * This is the only place allowed to pair backdropFilter with a mask
 * (enforced by scripts/maskedBlurPolicy.ts).
 *
 * The layers must not sit inside a backdrop root (an ancestor with
 * backdrop-filter, filter or mask): they would then see only that ancestor's
 * own paint, not the page behind it, and the band would show as a rectangle.
 * Put a glass surface on a background layer beside the content instead
 * (see `.context-menu-container::before`, `.settings-content__surface`).
 * A superellipse overflow clip on an ancestor also makes Chromium discard the
 * masks. Let the surface, scrolling content and blur layers clip themselves.
 */

/** Where the blur is strongest: an edge, or the centre fading outward (radial). */
export type ProgressiveBlurEdge = 'top' | 'bottom' | 'center'

export const PROGRESSIVE_BLUR_LAYER_COUNT = 5

const BACKDROP_ROOT_PROPERTIES = ['backdrop-filter', 'filter', 'mask-image', 'mask-border-source', 'clip-path']
const BACKDROP_ROOT_WILL_CHANGE = new Set([...BACKDROP_ROOT_PROPERTIES, 'mask', 'mask-border', 'opacity', 'mix-blend-mode'])

/** Development integration check; no observers or per-frame style reads. */
export function getProgressiveBlurAncestorIssue(style: Pick<CSSStyleDeclaration, 'getPropertyValue'>) {
  const read = (property: string) => style.getPropertyValue(property).trim()
  for (const property of BACKDROP_ROOT_PROPERTIES) {
    const value = read(property)
    if (value && value !== 'none')
      return property
  }
  if (Number.parseFloat(read('opacity')) < 1)
    return 'opacity'
  if (read('mix-blend-mode') && read('mix-blend-mode') !== 'normal')
    return 'mix-blend-mode'
  if (read('will-change').split(',').some(value => BACKDROP_ROOT_WILL_CHANGE.has(value.trim())))
    return 'will-change'

  const shape = read('corner-shape')
  const clips = ['overflow-x', 'overflow-y'].some(property => /^(?:hidden|clip|auto|scroll)$/.test(read(property)))
  const rounded = ['top-left', 'top-right', 'bottom-left', 'bottom-right'].some(corner => Number.parseFloat(read(`border-${corner}-radius`)) > 0)
  if (shape && !/^(?:round|superellipse\(1\))$/.test(shape) && clips && rounded)
    return 'corner-shape + overflow clipping'
}

// Radii 1, 2, 4, 8, 16 combine to about 18 × the unit (√Σr²), so the stack
// reaches the requested radius at the edge.
const STACK_SPREAD = 18

/**
 * `radius` is any CSS length; it defaults to the global frosted-glass radius.
 * `saturate` boosts colour on the widest layer only, for a blur that is itself
 * the surface (the top bar). Over glass it would tint the band and outline it.
 */
export function createProgressiveBlurLayers(edge: ProgressiveBlurEdge, radius = 'var(--bew-glass-blur-radius)', saturate = false) {
  const shape = edge === 'center' ? 'radial-gradient(closest-side' : `linear-gradient(${edge === 'top' ? 'to bottom' : 'to top'}`
  return Array.from({ length: PROGRESSIVE_BLUR_LAYER_COUNT }, (_, index) => {
    const solid = ((PROGRESSIVE_BLUR_LAYER_COUNT - 1 - index) / PROGRESSIVE_BLUR_LAYER_COUNT) * 100
    const fade = ((PROGRESSIVE_BLUR_LAYER_COUNT - index) / PROGRESSIVE_BLUR_LAYER_COUNT) * 100
    const mask = `${shape}, #000 0, #000 ${solid}%, transparent ${fade}%)`
    const blur = `blur(calc(${radius} * ${+(2 ** index / STACK_SPREAD).toFixed(4)}))`
    // Saturation only on the widest layer, so it does not compound.
    const filter = saturate && index === 0 ? `${blur} saturate(180%)` : blur
    return {
      backdropFilter: filter,
      WebkitBackdropFilter: filter,
      maskImage: mask,
      WebkitMaskImage: mask,
    }
  })
}
