export const WIDE_MOMENT_CARD_MIN_WIDTH = 880

export interface WideMomentLayoutCandidate {
  additional?: { isVote?: boolean } | null
  forward?: unknown
  images: readonly unknown[]
  isChargeExclusive: boolean
  isLive: boolean
  isVideo: boolean
}

export function supportsWideMomentCardLayout(moment: WideMomentLayoutCandidate): boolean {
  if (moment.isChargeExclusive || moment.forward || moment.additional?.isVote || moment.images.length > 1)
    return false
  return moment.isVideo || moment.isLive || moment.images.length === 1
}

export function shouldUseWideMomentCardLayout(
  moment: WideMomentLayoutCandidate,
  cardWidth: number,
): boolean {
  return cardWidth >= WIDE_MOMENT_CARD_MIN_WIDTH && supportsWideMomentCardLayout(moment)
}
