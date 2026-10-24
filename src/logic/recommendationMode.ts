import type { RecommendationModeOption } from '~/logic/storage'
import { appAuthTokens, settings } from '~/logic/storage'
import { hasValidAppAuthTokens } from '~/utils/authProvider'

import { requestAppAuthorization } from './appAuthorizationCoordinator'
import { getAppAuthIdentity } from './appAuthStorage'

export function getRecommendationModeOptions(t: (key: string) => string): { label: string, value: RecommendationModeOption }[] {
  return [
    { label: 'Web', value: 'web' },
    { label: t('settings.recommendation_mode_web_no_cookie'), value: 'webNoCookie' },
    { label: t('settings.recommendation_mode_app_single'), value: 'appSingle' },
    { label: t('settings.recommendation_mode_app_double'), value: 'appDouble' },
  ]
}

export function getRecommendationModeOption(): RecommendationModeOption {
  return settings.value.recommendationMode === 'app'
    ? settings.value.appRecommendationColumn === 1 ? 'appSingle' : 'appDouble'
    : settings.value.recommendationMode
}

export function getRecommendationRequestIdentity(): string {
  return settings.value.recommendationMode === 'app'
    ? `app:${settings.value.appRecommendationColumn}:${getAppAuthIdentity()}`
    : settings.value.recommendationMode
}

export function selectRecommendationMode(option: RecommendationModeOption) {
  const mode = option === 'appSingle' || option === 'appDouble' ? 'app' : option
  const column = mode === 'app' ? option === 'appSingle' ? 1 : 2 : settings.value.appRecommendationColumn
  if (settings.value.recommendationMode !== mode || settings.value.appRecommendationColumn !== column)
    settings.value = { ...settings.value, recommendationMode: mode, appRecommendationColumn: column }
  if (mode === 'app' && !hasValidAppAuthTokens())
    requestAppAuthorization(appAuthTokens.value.accessToken)
}
