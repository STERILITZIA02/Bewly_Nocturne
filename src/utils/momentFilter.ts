import type { Settings } from '~/logic/storage'

export interface MomentFilterCandidate {
  isUpRecommendation?: boolean
  isChargeExclusive?: boolean
  isVideoReservation?: boolean
  isLiveReservation?: boolean
  isLive?: boolean
  isForward?: boolean
  isRegularVideo?: boolean
  isDraw?: boolean
  isUgcSeason?: boolean
  isPgc?: boolean
  isArticle?: boolean
}

type FilterSettings = Pick<Settings, 'momentsEnableKeywordFilter' | 'momentsBlockedKeywords'
  | 'momentsFilterUpRecommendation' | 'momentsHideChargeExclusive' | 'momentsHideVideoReservation'
  | 'momentsHideLiveReservation' | 'momentsHideLiveDynamics' | 'momentsHideForwardDynamics'
  | 'momentsHideVideoDynamics' | 'momentsHideDrawDynamics' | 'momentsHideUgcSeasonDynamics'
  | 'momentsHidePgcDynamics' | 'momentsHideArticleDynamics'>

/** Compile once when the rules change. Unknown fields never imply a type. */
export function createMomentFilter(config: FilterSettings) {
  const keywords = config.momentsEnableKeywordFilter
    ? [...new Set(String(config.momentsBlockedKeywords ?? '').split(/[\n,，;；]+/).map(word => word.trim().toLocaleLowerCase()).filter(Boolean))]
    : []
  const common: Array<keyof MomentFilterCandidate> = []
  if (config.momentsFilterUpRecommendation)
    common.push('isUpRecommendation')
  if (config.momentsHideChargeExclusive)
    common.push('isChargeExclusive')
  if (config.momentsHideVideoReservation)
    common.push('isVideoReservation')
  if (config.momentsHideLiveReservation)
    common.push('isLiveReservation')
  if (config.momentsHideLiveDynamics)
    common.push('isLive')
  const types: Array<keyof MomentFilterCandidate> = []
  if (config.momentsHideDrawDynamics)
    types.push('isDraw')
  if (config.momentsHideUgcSeasonDynamics)
    types.push('isUgcSeason')
  if (config.momentsHidePgcDynamics)
    types.push('isPgc')
  if (config.momentsHideArticleDynamics)
    types.push('isArticle')
  const hideForward = config.momentsHideForwardDynamics
  const hideVideo = config.momentsHideVideoDynamics
  return {
    keywords,
    active: Boolean(keywords.length || common.length || types.length || hideForward || hideVideo),
    passes(item: MomentFilterCandidate, text = '') {
      if (keywords.length) {
        const searchable = text.toLocaleLowerCase()
        if (keywords.some(word => searchable.includes(word)))
          return false
      }
      if (common.some(field => item[field] === true))
        return false
      // Reservation/live/charge apply to forwarded originals too. All other
      // content types describe the outer post, not an embedded video card.
      if (item.isForward)
        return !hideForward
      if (hideVideo && item.isRegularVideo && !item.isPgc && !item.isUgcSeason)
        return false
      return !types.some(field => item[field] === true)
    },
  }
}
