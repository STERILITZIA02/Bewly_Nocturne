import { watch } from 'vue'
import browser from 'webextension-polyfill'

import type { AppClientEndpoint, AppClientRequest } from '~/constants/appClient'
import { APP_CLIENT_APP_KEY, APP_CLIENT_ID, APP_CLIENT_QR_PARAMS } from '~/constants/appClient'
import type { AppAuthTokens } from '~/logic/appAuthStorage'
import { appAuthTokens, isCompatibleAppAuth, nextAppAuthGeneration, resetAppAuthTokens } from '~/logic/appAuthStorage'

import { waitWithSignal } from './abort'
import { createBooleanSingleFlight, resolveAppAccessTokenFreshness } from './appAuthTokenPolicy'
import type { AppClientCallOptions } from './appClient'
import { AppClientError, requestAppClientData } from './appClient'

export function revokeAccessKey() {
  resetAppAuthTokens()
}

export interface AppAuthSnapshot {
  accessToken: string
  generation: number
  mid: number | null
}

export function captureAppAuth(): AppAuthSnapshot | null {
  const tokens = appAuthTokens.value
  if (!tokens.accessToken || !isCompatibleAppAuth(tokens))
    return null
  return { accessToken: tokens.accessToken, generation: tokens.generation, mid: tokens.mid }
}

export function isAppAuthCurrent(snapshot: AppAuthSnapshot | null): boolean {
  const tokens = appAuthTokens.value
  return !!snapshot && tokens.generation === snapshot.generation && Boolean(tokens.accessToken) && isCompatibleAppAuth(tokens)
}

export function requestAppClient<T = any>(endpoint: AppClientEndpoint, params: AppClientRequest['params'], options: AppClientCallOptions = {}): Promise<T> {
  return requestAppClientData<T>(endpoint, params, options)
}

interface PollLoginTokenPayload {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  mid?: number
  token_info?: {
    access_token?: string
    refresh_token?: string
    expires_in?: number
    mid?: number
  }
  refresh_token_info?: {
    expires_in?: number
  }
}

interface QRCodeResponse<T> {
  code: number
  message?: string
  data?: T
}

const APP_TOKEN_REFRESH_ENDPOINTS: AppClientEndpoint[] = ['refreshTokenV3', 'refreshTokenV2']

const runAppAccessTokenRefreshSingleFlight = createBooleanSingleFlight()

function normalizeMid(value: unknown): number | null {
  const mid = Number(value)
  return Number.isSafeInteger(mid) && mid > 0 ? mid : null
}

export function saveAppAuthTokens(payload: PollLoginTokenPayload, expectedGeneration?: number): boolean {
  if (expectedGeneration !== undefined && appAuthTokens.value.generation !== expectedGeneration && appAuthTokens.value.accessToken)
    return false
  const tokenInfo = payload.token_info || {}
  const refreshInfo = payload.refresh_token_info || {}

  const accessToken = payload.access_token || tokenInfo.access_token || ''
  const refreshToken = payload.refresh_token || tokenInfo.refresh_token || ''
  if (!accessToken)
    return false
  const expiresIn = tokenInfo.expires_in ?? payload.expires_in ?? null
  const refreshExpiresIn = refreshInfo.expires_in ?? null

  appAuthTokens.value = {
    client: APP_CLIENT_ID,
    appKey: APP_CLIENT_APP_KEY,
    generation: nextAppAuthGeneration(),
    accessToken,
    refreshToken,
    accessTokenExpiresAt: expiresIn ? Date.now() + expiresIn * 1000 : null,
    refreshTokenExpiresAt: refreshExpiresIn ? Date.now() + refreshExpiresIn * 1000 : null,
    mid: normalizeMid(payload.mid ?? tokenInfo.mid),
    lastUpdatedAt: Date.now(),
  }
  return true
}

async function isPersistedRefreshSourceCurrent(source: AppAuthTokens) {
  try {
    const stored = await browser.storage.local.get('appAuthTokens')
    const raw = stored.appAuthTokens
    const persisted: Partial<AppAuthTokens> | undefined
      = typeof raw === 'string' ? JSON.parse(raw) : raw
    return persisted?.refreshToken === source.refreshToken
      && persisted?.lastUpdatedAt === source.lastUpdatedAt
      && persisted?.generation === source.generation
  }
  catch {
    return false
  }
}

interface RefreshTokenResponse {
  code: number
  message?: string
  data?: {
    token_info?: {
      access_token?: string
      refresh_token?: string
      expires_in?: number
      mid?: number
    }
    refresh_token_info?: {
      expires_in?: number
    }
  }
}

async function refreshAppTokens(source: AppAuthTokens): Promise<boolean> {
  const tokens = { ...source }
  const { accessToken, refreshToken } = tokens
  if (!accessToken || !refreshToken || !isCompatibleAppAuth(tokens))
    return false
  const isCurrent = () => appAuthTokens.value === source
    && Object.entries(tokens).every(([key, value]) => appAuthTokens.value[key as keyof AppAuthTokens] === value)
  const controller = new AbortController()
  const stop = watch(appAuthTokens, () => {
    if (!isCurrent())
      controller.abort()
  }, { deep: true, flush: 'sync' })

  try {
    const payload = {
      access_token: accessToken,
      refresh_token: refreshToken,
      ts: Math.floor(Date.now() / 1000).toString(),
    }
    for (const endpoint of APP_TOKEN_REFRESH_ENDPOINTS) {
      if (!isCurrent())
        return false
      let data: RefreshTokenResponse
      try {
        data = await requestAppClientData<RefreshTokenResponse>(endpoint, payload, { signal: controller.signal })
      }
      catch (error) {
        if (!controller.signal.aborted)
          console.error('刷新 APP access_token 失败:', error)
        if (error instanceof AppClientError && !error.dispatched && !controller.signal.aborted)
          continue
        return false
      }

      if (data.code !== 0 || !data.data)
        continue

      const tokenInfo = data.data.token_info || {}
      const refreshInfo = data.data.refresh_token_info || {}
      if (!isCurrent() || !await waitWithSignal(isPersistedRefreshSourceCurrent(tokens), controller.signal) || !isCurrent())
        return false

      const expiresIn = tokenInfo.expires_in ?? null
      const refreshExpiresIn = refreshInfo.expires_in ?? null
      stop()
      appAuthTokens.value = {
        ...tokens,
        accessToken: tokenInfo.access_token || tokens.accessToken,
        refreshToken: tokenInfo.refresh_token || tokens.refreshToken,
        accessTokenExpiresAt: expiresIn ? Date.now() + expiresIn * 1000 : null,
        refreshTokenExpiresAt: refreshExpiresIn ? Date.now() + refreshExpiresIn * 1000 : tokens.refreshTokenExpiresAt,
        mid: normalizeMid(tokenInfo.mid) ?? tokens.mid,
        lastUpdatedAt: Date.now(),
      }
      return true
    }
    return false
  }
  catch (error) {
    if (!controller.signal.aborted)
      console.error('刷新 APP access_token 失败:', error)
    return false
  }
  finally { stop() }
}

export function refreshAppAccessToken(): Promise<boolean> {
  const source = appAuthTokens.value
  return runAppAccessTokenRefreshSingleFlight(() => refreshAppTokens(source), source, `${source.generation}:${source.lastUpdatedAt}`)
}

export async function ensureFreshAppAccessToken(
  bufferMs = 10 * 60 * 1000,
): Promise<boolean> {
  const tokens = appAuthTokens.value
  if (tokens.accessToken && !isCompatibleAppAuth(tokens)) {
    resetAppAuthTokens()
    return false
  }
  const freshness = resolveAppAccessTokenFreshness(tokens, Date.now(), bufferMs)
  if (freshness === 'missing')
    return false
  if (freshness === 'refresh-expired') {
    resetAppAuthTokens()
    return false
  }
  if (freshness === 'valid')
    return true

  const refreshed = await refreshAppAccessToken()
  if (refreshed)
    return true
  const accessTokenExpiresAt = tokens.accessTokenExpiresAt
  return appAuthTokens.value === tokens && Boolean(tokens.accessToken)
    && (!accessTokenExpiresAt || accessTokenExpiresAt > Date.now())
}

export async function refreshInvalidAppAccessToken(): Promise<boolean> {
  const freshness = resolveAppAccessTokenFreshness(appAuthTokens.value, Date.now(), 0)
  if (freshness === 'missing')
    return false
  if (freshness === 'refresh-expired') {
    resetAppAuthTokens()
    return false
  }
  return refreshAppAccessToken()
}

export function isAppAccessTokenInvalidResponse(value: unknown): boolean {
  return typeof value === 'object'
    && value !== null
    && 'code' in value
    && value.code === 62011
}

export function hasValidAppAuthTokens(bufferMs = 5 * 60 * 1000) {
  const tokens = appAuthTokens.value
  if (!tokens.accessToken || !tokens.refreshToken || !isCompatibleAppAuth(tokens))
    return false

  if (tokens.refreshTokenExpiresAt && tokens.refreshTokenExpiresAt < Date.now() + bufferMs)
    return false

  return true
}

export function pollAppLoginQRCode(authCode: string, signal?: AbortSignal): Promise<QRCodeResponse<PollLoginTokenPayload>> {
  return requestAppClientData('qrcodePoll', { auth_code: authCode, local_id: APP_CLIENT_QR_PARAMS.local_id }, { signal })
}

export function getAppLoginQRCode(signal?: AbortSignal): Promise<QRCodeResponse<{ url: string, auth_code: string }>> {
  return requestAppClientData('qrcodeAuthCode', { ...APP_CLIENT_QR_PARAMS }, { signal })
}
