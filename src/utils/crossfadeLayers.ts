/**
 * A stacked crossfade, bottom to top. Showing a picture fades it in over the
 * ones beneath, which stay drawn until it is opaque; pictures above it fade
 * out from wherever they are drawn, so a quick switch (or a switch back) never
 * jumps. Once every fade has finished only the shown picture stays a layer.
 */
export interface CrossfadeFade {
  index: number
  to: 0 | 1
}

/** Null when `index` is already the shown picture. */
export function showCrossfadeLayer(layers: readonly number[], shown: number, index: number) {
  const position = layers.indexOf(index)
  if (position >= 0 && index === shown)
    return null
  if (position < 0)
    return { layers: [...layers, index], fades: [{ index, to: 1 }] as CrossfadeFade[] }
  return {
    layers: [...layers],
    fades: [
      { index, to: 1 },
      ...layers.slice(position + 1).map(above => ({ index: above, to: 0 })),
    ] as CrossfadeFade[],
  }
}

/** A fade covers only the opacity still to travel, at the full fade's speed. */
export function getCrossfadeDuration(full: number, from: number, to: number) {
  return full * Math.min(1, Math.abs(to - from))
}
