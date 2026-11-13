// @unocss-include
// `searchKind`: the type is also a choice of the Moments search's own type
// filter, so the rail's funnel menu lists it only there.
export const MOMENT_TYPE_FILTER_OPTIONS = [
  { setting: 'momentsHideVideoDynamics', labelKey: 'settings.moments_filter_video_dynamic', icon: 'i-tabler-player-play', searchKind: 'video' },
  { setting: 'momentsHideDrawDynamics', labelKey: 'settings.moments_filter_draw_dynamic', icon: 'i-tabler-photo', searchKind: 'draw' },
  { setting: 'momentsHideUgcSeasonDynamics', labelKey: 'settings.moments_filter_ugc_season_dynamic', icon: 'i-tabler-stack' },
  { setting: 'momentsHideForwardDynamics', labelKey: 'settings.moments_filter_forward_dynamic', icon: 'i-tabler-repeat', searchKind: 'forward' },
  { setting: 'momentsHidePgcDynamics', labelKey: 'settings.moments_filter_pgc_dynamic', icon: 'i-tabler-device-tv' },
  { setting: 'momentsHideArticleDynamics', labelKey: 'settings.moments_filter_article_dynamic', icon: 'i-tabler-news', searchKind: 'article' },
  { setting: 'momentsFilterUpRecommendation', labelKey: 'settings.moments_filter_up_recommendation_short', icon: 'i-tabler-sparkles' },
  { setting: 'momentsHideChargeExclusive', labelKey: 'settings.moments_filter_charge_dynamic', icon: 'i-tabler-battery-charging' },
  { setting: 'momentsHideVideoReservation', labelKey: 'settings.moments_filter_video_reservation', icon: 'i-tabler-calendar-time' },
  { setting: 'momentsHideLiveReservation', labelKey: 'settings.moments_filter_live_reservation', icon: 'i-tabler-calendar-event' },
  { setting: 'momentsHideLiveDynamics', labelKey: 'settings.moments_filter_live_dynamic', icon: 'i-tabler-broadcast', searchKind: 'live' },
] as const
