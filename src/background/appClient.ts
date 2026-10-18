import browser from 'webextension-polyfill'

import type { AppClientEndpoint, AppClientErrorKind, AppClientParamValue, AppClientRequest, AppClientResponse } from '~/constants/appClient'
import { APP_CLIENT_APP_KEY, APP_CLIENT_PORT, APP_CLIENT_REQUEST_TIMEOUT_MS } from '~/constants/appClient'
import { waitWithSignal, withRequestDeadline } from '~/utils/abort'
import { appSign } from '~/utils/appSign'

type AppClientProfile = 'login' | 'feed' | 'account'

interface AppClientEndpointConfig {
  url: string
  method: 'GET' | 'POST'
  form: boolean
  profile: AppClientProfile
}

const APP_CLIENT_APP_SECRET = 'b5475a8825547a4fc26c7d518eaaa02e'
const APP_CLIENT_REFERER = 'https://www.bilibili.com'
const DART_USER_AGENT = 'Dart/3.6 (dart:io)'
const HD_USER_AGENT = 'Mozilla/5.0 BiliDroid/2.0.1 (bbcallen@gmail.com) os/android model/android_hd mobi_app/android_hd build/2001100 channel/master innerVer/2001100 osVer/15 network/2'
const APP_BASE_HEADERS: Readonly<Record<string, string>> = {
  'env': 'prod',
  'app-key': 'android64',
  'x-bili-aurora-zone': 'sh001',
}
const APP_CLIENT_BUVID_STORAGE_KEY = 'appClientBuvid'

const APP_CLIENT_ENDPOINTS: Readonly<Record<AppClientEndpoint, AppClientEndpointConfig>> = {
  qrcodeAuthCode: { url: 'https://passport.bilibili.com/x/passport-tv-login/qrcode/auth_code', method: 'POST', form: false, profile: 'login' },
  qrcodePoll: { url: 'https://passport.bilibili.com/x/passport-tv-login/qrcode/poll', method: 'POST', form: false, profile: 'login' },
  refreshTokenV3: { url: 'https://passport.bilibili.com/api/v3/oauth2/refresh_token', method: 'POST', form: true, profile: 'login' },
  refreshTokenV2: { url: 'https://passport.bilibili.com/api/v2/oauth2/refresh_token', method: 'POST', form: true, profile: 'login' },
  feedIndex: { url: 'https://app.bilibili.com/x/v2/feed/index', method: 'GET', form: false, profile: 'feed' },
  feedDislike: { url: 'https://app.bilibili.com/x/feed/dislike', method: 'GET', form: false, profile: 'account' },
  feedDislikeCancel: { url: 'https://app.bilibili.com/x/feed/dislike/cancel', method: 'GET', form: false, profile: 'account' },
}

const APP_CLIENT_HEADER_RULES = [
  { id: 1002, regexFilter: '^https://passport\\.bilibili\\.com/(?:x/passport-tv-login/qrcode/(?:auth_code|poll)|api/v[23]/oauth2/refresh_token)(?:\\?|$)', method: 'post', userAgent: DART_USER_AGENT },
  { id: 1003, regexFilter: '^https://app\\.bilibili\\.com/x/v2/feed/index\\?', method: 'get', userAgent: HD_USER_AGENT },
  { id: 1004, regexFilter: '^https://app\\.bilibili\\.com/x/feed/dislike(?:/cancel)?\\?', method: 'get', userAgent: DART_USER_AGENT },
] as const
const APP_CLIENT_HEADER_RULE_PRIORITY = 3

let headerRulesTask: Promise<void> | undefined
let buvidTask: Promise<string> | undefined

function getExtensionInitiatorHost() {
  return new URL(browser.runtime.getURL('')).host
}

function installHeaderRules(): Promise<void> {
  headerRulesTask ??= browser.declarativeNetRequest.updateSessionRules({
    removeRuleIds: APP_CLIENT_HEADER_RULES.map(rule => rule.id),
    addRules: APP_CLIENT_HEADER_RULES.map(rule => ({
      id: rule.id,
      priority: APP_CLIENT_HEADER_RULE_PRIORITY,
      action: {
        type: 'modifyHeaders',
        requestHeaders: [
          { header: 'user-agent', operation: 'set', value: rule.userAgent },
          { header: 'referer', operation: 'set', value: APP_CLIENT_REFERER },
          { header: 'origin', operation: 'remove' },
          { header: 'sec-ch-ua', operation: 'remove' },
          { header: 'sec-ch-ua-mobile', operation: 'remove' },
          { header: 'sec-ch-ua-platform', operation: 'remove' },
        ],
      },
      condition: {
        regexFilter: rule.regexFilter,
        initiatorDomains: [getExtensionInitiatorHost()],
        requestMethods: [rule.method],
        resourceTypes: ['xmlhttprequest'],
      },
    })) as browser.DeclarativeNetRequest.Rule[],
  }).catch((error: unknown) => {
    headerRulesTask = undefined
    throw error
  })
  return headerRulesTask
}

function generateBuvid(): string {
  const hex = Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('').toUpperCase()
  return `XY${hex[2]}${hex[12]}${hex[22]}${hex}`
}

function getAppBuvid(): Promise<string> {
  buvidTask ??= browser.storage.local.get(APP_CLIENT_BUVID_STORAGE_KEY).then(async (stored) => {
    const value = stored[APP_CLIENT_BUVID_STORAGE_KEY]
    if (typeof value === 'string' && /^XY[0-9A-F]{35}$/.test(value))
      return value
    const buvid = generateBuvid()
    await browser.storage.local.set({ [APP_CLIENT_BUVID_STORAGE_KEY]: buvid })
    return buvid
  }).catch((error: unknown) => {
    buvidTask = undefined
    throw error
  })
  return buvidTask
}

function genAuroraEid(mid: number): string {
  const key = 'ad1va46a7lza'
  const bytes = Array.from(`${mid}`, (char, index) => char.charCodeAt(0) ^ key.charCodeAt(index % key.length))
  return btoa(String.fromCharCode(...bytes)).replace(/=/g, '')
}

async function getRequestHeaders(profile: AppClientProfile, mid: number | null, signal: AbortSignal): Promise<Record<string, string>> {
  const accountHeaders: Record<string, string> = profile === 'login' || !mid
    ? { ...APP_BASE_HEADERS }
    : { ...APP_BASE_HEADERS, 'x-bili-mid': `${mid}`, 'x-bili-aurora-eid': genAuroraEid(mid) }
  if (profile !== 'feed')
    return { 'User-Agent': DART_USER_AGENT, ...accountHeaders }
  return {
    'buvid': await waitWithSignal(getAppBuvid(), signal),
    'fp_local': '1'.repeat(64),
    'fp_remote': '1'.repeat(64),
    'session_id': '11111111',
    'User-Agent': HD_USER_AGENT,
    'x-bili-trace-id': '11111111111111111111111111111111:1111111111111111:0:0',
    'bili-http-engine': 'cronet',
    ...accountHeaders,
  }
}

function sanitizeParams(params: unknown): Record<string, string> | null {
  if (!params || typeof params !== 'object' || Array.isArray(params))
    return null
  const payload: Record<string, string> = {}
  for (const [key, value] of Object.entries(params as Record<string, AppClientParamValue>)) {
    if (!/^[a-z_]\w*$/i.test(key) || key === 'appkey' || key === 'sign')
      return null
    if (value === undefined || value === null || value === '')
      continue
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean')
      return null
    payload[key] = String(value)
  }
  return payload
}

function signParams(params: Record<string, string>): URLSearchParams {
  const payload = { ...params }
  payload.ts ||= Math.floor(Date.now() / 1000).toString()
  const sign = appSign(payload, APP_CLIENT_APP_KEY, APP_CLIENT_APP_SECRET)
  return new URLSearchParams({ ...payload, sign })
}

function failure(kind: AppClientErrorKind, message: string, dispatched: boolean, status?: number): AppClientResponse {
  return { ok: false, error: { kind, message, dispatched, ...(status === undefined ? {} : { status }) } }
}

function abortKind(signal: AbortSignal): AppClientErrorKind {
  const reason = signal.reason
  return reason instanceof DOMException && reason.name === 'TimeoutError' ? 'timeout' : 'aborted'
}

async function executeAppClientRequest(request: AppClientRequest, signal: AbortSignal, state: { dispatched: boolean }): Promise<AppClientResponse> {
  const target = Object.hasOwn(APP_CLIENT_ENDPOINTS, request.endpoint) ? APP_CLIENT_ENDPOINTS[request.endpoint] : undefined
  const params = sanitizeParams(request.params)
  const mid = request.mid == null ? null : Number(request.mid)
  if (!target || !params || (mid !== null && (!Number.isSafeInteger(mid) || mid <= 0)))
    return failure('invalid', 'Invalid APP client request', false)
  try {
    await waitWithSignal(installHeaderRules(), signal)
  }
  catch (error) {
    return signal.aborted ? failure(abortKind(signal), 'APP client request cancelled', false) : failure('rules', error instanceof Error ? error.message : String(error), false)
  }
  let headers: Record<string, string>
  try {
    headers = await getRequestHeaders(target.profile, mid, signal)
  }
  catch (error) {
    return signal.aborted ? failure(abortKind(signal), 'APP client request cancelled', false) : failure('device', error instanceof Error ? error.message : String(error), false)
  }
  if (signal.aborted)
    return failure(abortKind(signal), 'APP client request cancelled', false)
  const signed = signParams(params)
  try {
    state.dispatched = true
    const response = await fetch(target.form ? target.url : `${target.url}?${signed}`, {
      method: target.method,
      credentials: 'omit',
      cache: 'no-store',
      signal,
      headers: target.form ? { ...headers, 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' } : headers,
      body: target.form ? signed : undefined,
    })
    if (!response.ok)
      return failure('http', `HTTP ${response.status}`, true, response.status)
    const data = await waitWithSignal(response.json(), signal)
    return data && typeof data === 'object' ? { ok: true, data } : failure('invalid', 'Invalid APP client response', true)
  }
  catch (error) {
    if (signal.aborted)
      return failure(abortKind(signal), 'APP client request cancelled', true)
    return failure('network', error instanceof Error ? error.message : String(error), true)
  }
}

export function setupAppClient() {
  void installHeaderRules().catch((error: unknown) => console.error('[Bewly Nocturne] Failed to install the APP client header rules:', error))
  browser.runtime.onConnect.addListener((port) => {
    if (port.name !== APP_CLIENT_PORT || port.sender?.id !== browser.runtime.id)
      return
    const controller = new AbortController()
    let connected = true
    const disconnect = () => {
      connected = false
      controller.abort(new DOMException('APP client consumer disconnected', 'AbortError'))
      port.onMessage.removeListener(onRequest)
      port.onDisconnect.removeListener(disconnect)
    }
    const respond = (response: AppClientResponse) => {
      if (!connected)
        return
      try {
        port.postMessage(response)
      }
      catch { disconnect() }
    }
    function onRequest(value: unknown) {
      port.onMessage.removeListener(onRequest)
      const request = value as AppClientRequest
      const state = { dispatched: false }
      void withRequestDeadline(
        signal => executeAppClientRequest(request, signal, state),
        { signal: controller.signal, deadline: request?.deadline },
        APP_CLIENT_REQUEST_TIMEOUT_MS,
      ).then(respond, (error: unknown) => {
        const timedOut = error instanceof DOMException && error.name === 'TimeoutError'
        respond(failure(timedOut ? 'timeout' : 'aborted', error instanceof Error ? error.message : String(error), state.dispatched))
      })
    }
    port.onDisconnect.addListener(disconnect)
    port.onMessage.addListener(onRequest)
  })
}
