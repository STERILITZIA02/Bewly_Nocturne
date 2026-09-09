import type { RecommendationMode } from '~/logic/storage'
import { appAuthTokens, settings } from '~/logic/storage'
import { hasValidAppAuthTokens } from '~/utils/authProvider'

import { requestAppAuthorization } from './appAuthorizationCoordinator'

export function getRecommendationModeOptions(t: (key: string) => string): { label: string, value: RecommendationMode }[] {
  return [
    { label: 'Web', value: 'web' },
    { label: t('settings.recommendation_mode_web_no_cookie'), value: 'webNoCookie' },
    { label: 'App', value: 'app' },
  ]
}

export function selectRecommendationMode(mode: RecommendationMode) {
  if (settings.value.recommendationMode !== mode)
    settings.value.recommendationMode = mode
  if (mode === 'app' && !hasValidAppAuthTokens())
    requestAppAuthorization(appAuthTokens.value.accessToken)
}
