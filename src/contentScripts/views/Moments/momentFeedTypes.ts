export type MomentFilter = 'all' | 'video' | 'draw' | 'pgc' | 'article'

/** Plain text (WORD) and image posts with or without text (DRAW). */
const TEXT_IMAGE_DYNAMIC_TYPES = new Set(['DYNAMIC_TYPE_WORD', 'DYNAMIC_TYPE_DRAW'])

/**
 * The feed API has no text-and-image type, so `draw` reads the full feed and
 * keeps only those posts. Forwards, videos, live, series and articles are left
 * out, whatever they embed.
 */
export function isClientFilteredMomentType(filter: MomentFilter) {
  return filter === 'draw'
}

export function getMomentFeedApiType(filter: MomentFilter) {
  return isClientFilteredMomentType(filter) ? 'all' : filter
}

export function keepsMomentItem(filter: MomentFilter, item: { type?: string }) {
  return !isClientFilteredMomentType(filter) || TEXT_IMAGE_DYNAMIC_TYPES.has(String(item.type))
}
