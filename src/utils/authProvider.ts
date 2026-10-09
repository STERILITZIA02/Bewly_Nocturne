import { watch } from 'vue'
import browser from 'webextension-polyfill'

import type { AppAuthTokens } from '~/logic/appAuthStorage'
import { appAuthTokens, resetAppAuthTokens } from '~/logic/appAuthStorage'

import { waitWithSignal, withRequestDeadline } from './abort'
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
  const read = async (requestSignal: AbortSignal) => {
    const response = await waitWithSignal(fetch(url, { ...init, signal: requestSignal }), requestSignal)
    if (!response.ok)
      throw new Error(`Authorization HTTP ${response.status}`)
    return await waitWithSignal(response.json(), requestSignal) as T
  }
  return signal ? read(signal) : withRequestDeadline(read, {}, AUTH_REQUEST_TIMEOUT_MS)
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

async function refreshAppTokens(source: AppAuthTokens): Promise<boolean> {
  const tokens = { ...source }
  const { accessToken, refreshToken, lastUpdatedAt } = tokens
  if (!accessToken || !refreshToken)
    return false
  const isCurrent = () => appAuthTokens.value === source
    && Object.entries(tokens).every(([key, value]) => appAuthTokens.value[key as keyof AppAuthTokens] === value)
  const controller = new AbortController()
  const stop = watch(appAuthTokens, () => {
    if (!isCurrent())
      controller.abort()
  }, { deep: true, flush: 'sync' })

  try {
    return await withRequestDeadline(async (signal) => {
      const ts = Math.floor(Date.now() / 1000)
      const basePayload = {
        access_token: accessToken,
        refresh_token: refreshToken,
        ts: ts.toString(),
      }

      for (const endpoint of APP_TOKEN_REFRESH_ENDPOINTS) {
        try {
          signal.throwIfAborted()
          if (!isCurrent())
            return false
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
          }, signal)

          if (data.code !== 0 || !data.data)
            continue

          const tokenInfo = data.data.token_info || {}
          const refreshInfo = data.data.refresh_token_info || {}

          if (
            !isCurrent()
            || !await waitWithSignal(isPersistedRefreshSourceCurrent(refreshToken, lastUpdatedAt), signal)
            || !isCurrent()
          ) {
            return false
          }

          signal.throwIfAborted()
          const nextAccessToken = tokenInfo.access_token || tokens.accessToken
          const nextRefreshToken = tokenInfo.refresh_token || tokens.refreshToken
          const expiresIn = tokenInfo.expires_in ?? null
          const refreshExpiresIn = refreshInfo.expires_in ?? null

          stop()
          appAuthTokens.value = {
            accessToken: nextAccessToken,
            refreshToken: nextRefreshToken,
            accessTokenExpiresAt: expiresIn ? Date.now() + expiresIn * 1000 : null,
            refreshTokenExpiresAt: refreshExpiresIn ? Date.now() + refreshExpiresIn * 1000 : tokens.refreshTokenExpiresAt,
            mid: tokenInfo.mid ?? tokens.mid,
            lastUpdatedAt: Date.now(),
          }
          return true
        }
        catch (error) {
          signal.throwIfAborted()
          console.error('刷新 APP access_token 失败:', error)
          // A transport/body failure can follow a committed token rotation.
          // Only an explicit negative response may try the alternate endpoint.
          return false
        }
      }

      return false
    }, { signal: controller.signal }, AUTH_REQUEST_TIMEOUT_MS)
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
  return runAppAccessTokenRefreshSingleFlight(() => refreshAppTokens(source), source, source.lastUpdatedAt)
}

export async function ensureFreshAppAccessToken(
  bufferMs = 10 * 60 * 1000,
): Promise<boolean> {
  const tokens = appAuthTokens.value
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

  const refreshed = await refreshAppAccessToken()
  if (refreshed)
    return true
  // A proactive refresh can fail because of a transient network/backend error.
  // Keep using an access token that is still valid instead of forcing the user
  // into authorization before the actual expiry boundary.
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
  const { accessToken, refreshToken, refreshTokenExpiresAt } = appAuthTokens.value
  if (!accessToken || !refreshToken)
    return false

  if (refreshTokenExpiresAt && refreshTokenExpiresAt < Date.now() + bufferMs)
    return false

  return true
}

export function pollTVLoginQRCode(authCode: string, signal?: AbortSignal): Promise<QRCodeResponse<PollLoginTokenPayload>> {
  const url = 'https://passport.bilibili.com/x/passport-tv-login/qrcode/poll'

  return withRequestDeadline(requestSignal => requestAuthJson(url, {
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
  }, requestSignal), { signal }, AUTH_REQUEST_TIMEOUT_MS)
}

export function getTVLoginQRCode(signal?: AbortSignal): Promise<QRCodeResponse<{ url: string, auth_code: string }>> {
  const url = 'https://passport.bilibili.com/x/passport-tv-login/qrcode/auth_code'

  return withRequestDeadline(requestSignal => requestAuthJson(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
    },
    body: tvSignSearchParams({
      appkey: TVAppKey.appkey,
      local_id: '0',
      ts: '0',
    }),
  }, requestSignal), { signal }, AUTH_REQUEST_TIMEOUT_MS)
}
