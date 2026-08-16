import type Browser from 'webextension-polyfill'

import { FIREFOX_CONTAINER_COOKIE_HEADER, serializeCookiesForUrl } from '../firefoxCookies'
import type {
  MessageServerSettingsApiResponse,
  MessageServerSettingsEndpointName,
  MessageServerSettingsErrorKind,
  MessageServerSettingsRequest,
} from './types'

interface MessageServerSettingsTransportDependencies {
  fetch: typeof fetch
}

const DEFAULT_DEPENDENCIES: MessageServerSettingsTransportDependencies = {
  fetch: globalThis.fetch.bind(globalThis),
}

function errorResponse(
  kind: MessageServerSettingsErrorKind,
  endpointName: MessageServerSettingsEndpointName,
  httpStatus = 0,
  apiCode?: number,
): MessageServerSettingsApiResponse<null> {
  return {
    code: apiCode ?? (kind === 'login-required' ? -101 : kind === 'risk-control' ? -412 : -1),
    data: null,
    bewlyError: {
      kind,
      endpointName,
      httpStatus,
      apiCode,
    },
  }
}

function classifyApiCode(code: number): MessageServerSettingsErrorKind {
  if (code === -101)
    return 'login-required'
  if (code === -403 || code === -412)
    return 'risk-control'
  return 'api-error'
}

async function getFirefoxCookieHeader(
  sender: Browser.Runtime.MessageSender | undefined,
  requestUrl: string,
): Promise<string> {
  // eslint-disable-next-line node/prefer-global/process
  if (!process.env.FIREFOX || !sender?.tab?.id)
    return ''
  const browser = await import('webextension-polyfill').then(module => module.default)
  const tab = await browser.tabs.get(sender.tab.id)
  const cookies = await browser.cookies.getAll({ storeId: tab.cookieStoreId || 'default' })
  return serializeCookiesForUrl(cookies, requestUrl)
}

function appendParams(url: string, params: Record<string, string | number | undefined> = {}) {
  const requestUrl = new URL(url)
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined)
      requestUrl.searchParams.set(key, String(value))
  }
  return requestUrl.toString()
}

async function parseResponse(
  response: Response,
  endpointName: MessageServerSettingsEndpointName,
): Promise<MessageServerSettingsApiResponse> {
  let text = ''
  try {
    text = await response.text()
  }
  catch {
    return errorResponse('network', endpointName, response.status)
  }

  if (response.status === 401 || /passport|login/i.test(response.url))
    return errorResponse('login-required', endpointName, response.status)
  if (response.status === 403 || response.status === 412)
    return errorResponse('risk-control', endpointName, response.status)
  if (response.status >= 500)
    return errorResponse('server-error', endpointName, response.status)
  if (
    response.headers.get('content-type')?.includes('text/html')
    || /^\s*</.test(text)
  ) {
    return errorResponse('invalid-response', endpointName, response.status)
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  }
  catch {
    return errorResponse('invalid-response', endpointName, response.status)
  }
  if (!parsed || typeof parsed !== 'object' || !Object.hasOwn(parsed, 'code'))
    return errorResponse('invalid-response', endpointName, response.status)
  const raw = parsed as { code?: unknown, data?: unknown }
  if (typeof raw.code !== 'number')
    return errorResponse('invalid-response', endpointName, response.status)
  if (!response.ok || raw.code !== 0)
    return errorResponse(classifyApiCode(raw.code), endpointName, response.status, raw.code)
  return { code: 0, data: raw.data ?? null }
}

export async function requestMessageServerSettings(
  request: MessageServerSettingsRequest,
  dependencies: Partial<MessageServerSettingsTransportDependencies> = {},
  sender?: Browser.Runtime.MessageSender,
): Promise<MessageServerSettingsApiResponse> {
  const runtimeDependencies = { ...DEFAULT_DEPENDENCIES, ...dependencies }
  const requestUrl = appendParams(request.url, request.params)
  try {
    const headers: Record<string, string> = {
      Referer: 'https://message.bilibili.com/',
    }
    const cookieHeader = await getFirefoxCookieHeader(sender, requestUrl)
    if (cookieHeader)
      headers[FIREFOX_CONTAINER_COOKIE_HEADER] = cookieHeader
    if (request.method === 'POST')
      headers['Content-Type'] = 'application/x-www-form-urlencoded'
    const response = await runtimeDependencies.fetch(requestUrl, {
      method: request.method,
      body: request.method === 'POST'
        ? new URLSearchParams(Object.entries(request.body ?? {}).map(([key, value]) => [key, String(value)]))
        : undefined,
      credentials: 'include',
      headers,
    })
    return await parseResponse(response, request.endpointName)
  }
  catch {
    return errorResponse('network', request.endpointName)
  }
}
