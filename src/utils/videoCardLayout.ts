export const VIDEO_CARD_COVER_RATIO_MIN = 30
export const VIDEO_CARD_COVER_RATIO_MAX = 70
export const VIDEO_CARD_COVER_RATIO_STEP = 5

function normalizeFiniteRatio(value: number): number {
  const clamped = Math.min(VIDEO_CARD_COVER_RATIO_MAX, Math.max(VIDEO_CARD_COVER_RATIO_MIN, value))
  return VIDEO_CARD_COVER_RATIO_MIN
    + Math.round((clamped - VIDEO_CARD_COVER_RATIO_MIN) / VIDEO_CARD_COVER_RATIO_STEP) * VIDEO_CARD_COVER_RATIO_STEP
}

export function normalizeVideoCardCoverRatio(value: unknown, fallback: number): number {
  const normalizedFallback = Number.isFinite(fallback) ? normalizeFiniteRatio(fallback) : 50
  const ratio = Number(value)
  return Number.isFinite(ratio) ? normalizeFiniteRatio(ratio) : normalizedFallback
}
