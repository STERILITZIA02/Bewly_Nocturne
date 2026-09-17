import browser from 'webextension-polyfill'

import { appAuthTokens, defaultAppAuthTokens, resetAppAuthTokens } from '~/logic/appAuthStorage'

import { createBooleanSingleFlight, resolveAppAccessTokenFreshness } from './appAuthTokenPolicy'
import { appSign } from './appSign'

export function revokeAccessKey() {
  resetAppAuthTokens()
}

// https://socialsisteryi.github.io/bilibili-API-collect/docs/misc/sign/APPKey.html#appkey
export const TVAppKey = {
  appkey: '4409e2ce8ffd12b8',
  appsec: '59b43e04ad6965f34319062b478f83dd',
}

// https://github.com/magicdawn/bilibili-app-recommend/blob/e91722cc076fe65b98116fb0248236851ae6e1dc/src/utility/access-key/tv-qrcode/api.ts#L8
export function tvSignSearchParams(params: Record<string, any>) {
  const sign = appSign(params, TVAppKey.appkey, TVAppKey.appsec)
  return new URLSearchParams({
    ...params,
    sign,
  })
}

export function getTvSign(params: Record<string, any>) {
  return appSign(params, TVAppKey.appkey, TVAppKey.appsec)
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

const APP_TOKEN_REFRESH_ENDPOINTS = [
  'https://passport.bilibili.com/api/v3/oauth2/refresh_token',
  'https://passport.bilibili.com/api/v2/oauth2/refresh_token',
]

const AUTH_REQUEST_TIMEOUT_MS = 15_000

async function requestAuthJson<T>(url: string, init: RequestInit, signal?: AbortSignal): Promise<T> {
  const controller = new AbortController()
  const abort = () => controller.abort(signal?.reason)
  if (signal?.aborted)
    abort()
  else
    signal?.addEventListener('abort', abort, { once: true })
  const timer = setTimeout(() => controller.abort(new DOMException('Authorization request timed out', 'TimeoutError')), AUTH_REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(url, { ...init, signal: controller.signal })
    if (!response.ok)
      throw new Error(`Authorization HTTP ${response.status}`)
    return await response.json() as T
  }
  finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', abort)
  }
}

interface QRCodeResponse<T> {
  code: number
  message?: string
  data?: T
}

const runAppAccessTokenRefreshSingleFlight = createBooleanSingleFlight()

export function saveAppAuthTokens(payload: PollLoginTokenPayload) {
  const tokenInfo = payload.token_info || {}
  const refreshInfo = payload.refresh_token_info || {}

  const accessToken = payload.access_token || tokenInfo.access_token || ''
  const refreshToken = payload.refresh_token || tokenInfo.refresh_token || ''
  const expiresIn = tokenInfo.expires_in ?? payload.expires_in ?? null
  const refreshExpiresIn = refreshInfo.expires_in ?? null
  const mid = payload.mid ?? tokenInfo.mid ?? null

  appAuthTokens.value = {
    accessToken,
    refreshToken,
    accessTokenExpiresAt: expiresIn ? Date.now() + expiresIn * 1000 : null,
    refreshTokenExpiresAt: refreshExpiresIn ? Date.now() + refreshExpiresIn * 1000 : null,
    mid: mid ?? null,
    lastUpdatedAt: Date.now(),
  }
}

async function isPersistedRefreshSourceCurrent(refreshToken: string, lastUpdatedAt: number | null) {
  try {
    const stored = await browser.storage.local.get('appAuthTokens')
    const raw = stored.appAuthTokens
    const persisted: typeof appAuthTokens.value | undefined
      = typeof raw === 'string' ? JSON.parse(raw) : raw
    return persisted?.refreshToken === refreshToken
      && persisted?.lastUpdatedAt === lastUpdatedAt
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

export async function refreshAppAccessToken(): Promise<boolean> {
  const { accessToken, refreshToken, lastUpdatedAt } = appAuthTokens.value
  if (!accessToken || !refreshToken)
    return false

  const ts = Math.floor(Date.now() / 1000)
  const basePayload = {
    access_token: accessToken,
    refresh_token: refreshToken,
    ts: ts.toString(),
  }

  for (const endpoint of APP_TOKEN_REFRESH_ENDPOINTS) {
    try {
      const payload = { ...basePayload }
      const sign = appSign({ ...payload }, TVAppKey.appkey, TVAppKey.appsec)
      const body = new URLSearchParams({
        ...payload,
        appkey: TVAppKey.appkey,
        sign,
      })

      const data = await requestAuthJson<RefreshTokenResponse>(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        },
        body,
      })

      if (data.code !== 0 || !data.data)
        continue

      const tokenInfo = data.data.token_info || {}
      const refreshInfo = data.data.refresh_token_info || {}

      if (
        appAuthTokens.value.accessToken !== accessToken
        || appAuthTokens.value.refreshToken !== refreshToken
        || !await isPersistedRefreshSourceCurrent(refreshToken, lastUpdatedAt)
      ) {
        return false
      }

      const nextAccessToken = tokenInfo.access_token || appAuthTokens.value.accessToken
      const nextRefreshToken = tokenInfo.refresh_token || appAuthTokens.value.refreshToken
      const expiresIn = tokenInfo.expires_in ?? null
      const refreshExpiresIn = refreshInfo.expires_in ?? null

      appAuthTokens.value = {
        accessToken: nextAccessToken,
        refreshToken: nextRefreshToken,
        accessTokenExpiresAt: expiresIn ? Date.now() + expiresIn * 1000 : null,
        refreshTokenExpiresAt: refreshExpiresIn ? Date.now() + refreshExpiresIn * 1000 : appAuthTokens.value.refreshTokenExpiresAt,
        mid: tokenInfo.mid ?? appAuthTokens.value.mid,
        lastUpdatedAt: Date.now(),
      }
      return true
    }
    catch (error) {
      console.error('刷新 APP access_token 失败:', error)
    }
  }

  return false
}

function refreshAppAccessTokenSingleFlight(): Promise<boolean> {
  return runAppAccessTokenRefreshSingleFlight(refreshAppAccessToken)
}

export async function ensureFreshAppAccessToken(
  bufferMs = 10 * 60 * 1000,
): Promise<boolean> {
  const freshness = resolveAppAccessTokenFreshness(
    appAuthTokens.value,
    Date.now(),
    bufferMs,
  )
  if (freshness === 'missing')
    return false
  if (freshness === 'refresh-expired') {
    resetAppAuthTokens()
    return false
  }
  if (freshness === 'valid')
    return true

  const refreshed = await refreshAppAccessTokenSingleFlight()
  if (refreshed)
    return true
  // A proactive refresh can fail because of a transient network/backend error.
  // Keep using an access token that is still valid instead of forcing the user
  // into authorization before the actual expiry boundary.
  const accessTokenExpiresAt = appAuthTokens.value.accessTokenExpiresAt
  return Boolean(appAuthTokens.value.accessToken)
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
  return refreshAppAccessTokenSingleFlight()
}

export function isAppAccessTokenInvalidResponse(value: unknown): boolean {
  return typeof value === 'object'
    && value !== null
    && 'code' in value
    && value.code === 62011
}

export function hasValidAppAuthTokens(bufferMs = 5 * 60 * 1000) {
  const { accessToken, refreshToken, refreshTokenExpiresAt } = appAuthTokens.value
  if (!accessToken || !refreshToken)
    return false

  if (refreshTokenExpiresAt && refreshTokenExpiresAt < Date.now() + bufferMs)
    return false

  return true
}

export function clearAppAuthTokens() {
  appAuthTokens.value = { ...defaultAppAuthTokens }
}

export function pollTVLoginQRCode(authCode: string, signal?: AbortSignal): Promise<QRCodeResponse<PollLoginTokenPayload>> {
  const url = 'https://passport.bilibili.com/x/passport-tv-login/qrcode/poll'

  return requestAuthJson(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
    },
    body: tvSignSearchParams({
      appkey: TVAppKey.appkey,
      auth_code: authCode,
      local_id: '0',
      ts: '0',
    }),
  }, signal)
}

export function getTVLoginQRCode(signal?: AbortSignal): Promise<QRCodeResponse<{ url: string, auth_code: string }>> {
  const url = 'https://passport.bilibili.com/x/passport-tv-login/qrcode/auth_code'

  return requestAuthJson(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
    },
    body: tvSignSearchParams({
      appkey: TVAppKey.appkey,
      local_id: '0',
      ts: '0',
    }),
  }, signal)
}
