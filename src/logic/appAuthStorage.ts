import { watch } from 'vue'

import { useStorageLocal } from '~/composables/useStorageLocal'
import { APP_CLIENT_APP_KEY, APP_CLIENT_ID } from '~/constants/appClient'

export interface AppAuthTokens {
  client: string
  appKey: string
  generation: number
  accessToken: string
  refreshToken: string
  accessTokenExpiresAt: number | null
  refreshTokenExpiresAt: number | null
  mid: number | null
  lastUpdatedAt: number | null
}

export const defaultAppAuthTokens: AppAuthTokens = {
  client: '',
  appKey: '',
  generation: 0,
  accessToken: '',
  refreshToken: '',
  accessTokenExpiresAt: null,
  refreshTokenExpiresAt: null,
  mid: null,
  lastUpdatedAt: null,
}

export const appAuthTokens = useStorageLocal<AppAuthTokens>('appAuthTokens', defaultAppAuthTokens, { mergeDefaults: true, writeDefaults: false })

const legacyAccessKey = useStorageLocal('accessKey', '')

export function isCompatibleAppAuth(tokens: Pick<AppAuthTokens, 'client' | 'appKey'>): boolean {
  return tokens.client === APP_CLIENT_ID && tokens.appKey === APP_CLIENT_APP_KEY
}

export function getAppAuthIdentity(tokens: AppAuthTokens = appAuthTokens.value): string {
  return tokens.accessToken && isCompatibleAppAuth(tokens) ? `${tokens.client}:${tokens.generation}:${tokens.mid ?? ''}` : ''
}

export function nextAppAuthGeneration(): number {
  const current = Number(appAuthTokens.value.generation)
  return (Number.isSafeInteger(current) && current >= 0 ? current : 0) + 1
}

export function resetAppAuthTokens() {
  appAuthTokens.value = { ...defaultAppAuthTokens, generation: nextAppAuthGeneration() }
  legacyAccessKey.value = ''
}

watch(
  () => legacyAccessKey.value,
  (value) => {
    if (value)
      legacyAccessKey.value = ''
  },
  { immediate: true },
)

watch(
  () => [appAuthTokens.value.accessToken, appAuthTokens.value.client, appAuthTokens.value.appKey] as const,
  ([accessToken]) => {
    if (accessToken && !isCompatibleAppAuth(appAuthTokens.value))
      resetAppAuthTokens()
  },
  { immediate: true },
)
