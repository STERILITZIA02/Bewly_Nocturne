import browser from 'webextension-polyfill'

import { appAuthTokens, resetAppAuthTokens } from '~/logic/appAuthStorage'
import { refreshAppAccessToken } from '~/utils/authProvider'

const TOKEN_FRESHNESS_ALARM = 'bewly-app-auth-token-freshness'
const CHECK_INTERVAL_MINUTES = 5
const REFRESH_BUFFER = 10 * 60 * 1000
const APP_AUTH_TOKENS_KEY = 'appAuthTokens'

let initialized = false
let refreshPromise: Promise<void> | null = null

async function ensureFreshTokens() {
  if (refreshPromise)
    return refreshPromise

  refreshPromise = (async () => {
    const tokens = appAuthTokens.value
    if (!tokens.accessToken || !tokens.refreshToken)
      return

    if (tokens.refreshTokenExpiresAt && tokens.refreshTokenExpiresAt <= Date.now()) {
      console.warn('[Bewly Nocturne] APP refresh token 已过期，清除授权。')
      resetAppAuthTokens()
      return
    }

    if (!tokens.accessTokenExpiresAt || tokens.accessTokenExpiresAt > Date.now() + REFRESH_BUFFER)
      return

    const ok = await refreshAppAccessToken()
    if (!ok)
      console.warn('[Bewly Nocturne] APP access token 刷新失败，请重新授权。')
  })().finally(() => {
    refreshPromise = null
  })

  return refreshPromise
}

function handleAlarm(alarm: browser.Alarms.Alarm) {
  if (alarm.name === TOKEN_FRESHNESS_ALARM)
    void ensureFreshTokens()
}

function handleStartup() {
  void ensureFreshTokens()
}

function handleInstalled() {
  void ensureFreshTokens()
}

function handleStorageChanged(changes: Record<string, browser.Storage.StorageChange>, areaName: string) {
  if (areaName === 'local' && changes[APP_AUTH_TOKENS_KEY])
    void ensureFreshTokens()
}

export function setupAppAuthScheduler() {
  if (initialized)
    return

  initialized = true
  browser.alarms.onAlarm.addListener(handleAlarm)
  browser.runtime.onStartup.addListener(handleStartup)
  browser.runtime.onInstalled.addListener(handleInstalled)
  browser.storage.onChanged.addListener(handleStorageChanged)
  void browser.alarms.create(TOKEN_FRESHNESS_ALARM, {
    delayInMinutes: CHECK_INTERVAL_MINUTES,
    periodInMinutes: CHECK_INTERVAL_MINUTES,
  })
  void ensureFreshTokens()
}

export function teardownAppAuthScheduler() {
  if (!initialized)
    return

  initialized = false
  browser.alarms.onAlarm.removeListener(handleAlarm)
  browser.runtime.onStartup.removeListener(handleStartup)
  browser.runtime.onInstalled.removeListener(handleInstalled)
  browser.storage.onChanged.removeListener(handleStorageChanged)
  void browser.alarms.clear(TOKEN_FRESHNESS_ALARM)
}
