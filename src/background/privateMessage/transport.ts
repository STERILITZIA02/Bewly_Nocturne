import type Browser from 'webextension-polyfill'

import { FIREFOX_CONTAINER_COOKIE_HEADER, serializeCookiesForUrl } from '../firefoxCookies'
import { addWbiSign, initWbiKeys } from '../wbiSign'
import {
  createPrivateMessageErrorResponse,
  isPrivateMessageWbiUnavailableError,
  PrivateMessageWbiUnavailableError,
} from './errors'
import { parsePrivateMessageResponse } from './losslessJson'
import type {
  PrivateMessageApiResponse,
  PrivateMessageEndpointName,
  PrivateMessageRequestParams,
} from './types'

interface PrivateMessageSigningDependencies {
  addWbiSign: typeof addWbiSign
  initWbiKeys: typeof initWbiKeys
}

export interface PrivateMessageRequest {
  endpointName: PrivateMessageEndpointName
  params: PrivateMessageRequestParams
  url: string
}

interface PrivateMessageRequestDependencies {
  fetch: typeof fetch
  signParams: typeof signPrivateMessageParams
}

const DEFAULT_SIGNING_DEPENDENCIES: PrivateMessageSigningDependencies = {
  addWbiSign,
  initWbiKeys,
}

const DEFAULT_REQUEST_DEPENDENCIES: PrivateMessageRequestDependencies = {
  fetch: globalThis.fetch.bind(globalThis),
  signParams: signPrivateMessageParams,
}

export async function signPrivateMessageParams(
  params: PrivateMessageRequestParams,
  dependencies: PrivateMessageSigningDependencies = DEFAULT_SIGNING_DEPENDENCIES,
): Promise<PrivateMessageRequestParams> {
  let initialized = false
  try {
    initialized = await dependencies.initWbiKeys()
  }
  catch {
    throw new PrivateMessageWbiUnavailableError()
  }

  if (!initialized)
    throw new PrivateMessageWbiUnavailableError()

  const signed = dependencies.addWbiSign({ ...params }) as PrivateMessageRequestParams
  if (typeof signed.wts !== 'number' || typeof signed.w_rid !== 'string' || !signed.w_rid)
    throw new PrivateMessageWbiUnavailableError()

  return signed
}

function appendRequestParams(url: string, params: PrivateMessageRequestParams): string {
  const requestUrl = new URL(url)
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '')
      requestUrl.searchParams.set(key, String(value))
  }
  return requestUrl.toString()
}

async function getFirefoxContainerCookieHeader(
  sender: Browser.Runtime.MessageSender | undefined,
  requestUrl: string,
): Promise<string> {
  // eslint-disable-next-line node/prefer-global/process
  if (!process.env.FIREFOX || !sender?.tab?.id)
    return ''

  const browser = await import('webextension-polyfill').then(module => module.default)
  const tab = await browser.tabs.get(sender.tab!.id!)
  const cookies = await browser.cookies.getAll({
    storeId: tab.cookieStoreId || 'default',
  })
  return serializeCookiesForUrl(cookies, requestUrl)
}

export async function requestPrivateMessage(
  request: PrivateMessageRequest,
  dependencies: Partial<PrivateMessageRequestDependencies> = {},
  sender?: Browser.Runtime.MessageSender,
): Promise<PrivateMessageApiResponse> {
  return requestSignedPrivateMessage(request, 'GET', dependencies, sender)
}

export async function requestPrivateMessageForm(
  request: PrivateMessageRequest,
  dependencies: Partial<PrivateMessageRequestDependencies> = {},
  sender?: Browser.Runtime.MessageSender,
): Promise<PrivateMessageApiResponse> {
  return requestSignedPrivateMessage(request, 'POST', dependencies, sender)
}

async function requestSignedPrivateMessage(
  request: PrivateMessageRequest,
  method: 'GET' | 'POST',
  dependencies: Partial<PrivateMessageRequestDependencies>,
  sender?: Browser.Runtime.MessageSender,
): Promise<PrivateMessageApiResponse> {
  const runtimeDependencies = {
    ...DEFAULT_REQUEST_DEPENDENCIES,
    ...dependencies,
  }

  try {
    const signedParams = await runtimeDependencies.signParams(request.params)
    const requestUrl = method === 'GET'
      ? appendRequestParams(request.url, signedParams)
      : request.url
    const headers: Record<string, string> = {
      Referer: 'https://message.bilibili.com/',
    }
    if (method === 'POST')
      headers['Content-Type'] = 'application/x-www-form-urlencoded'
    const cookieHeader = await getFirefoxContainerCookieHeader(sender, requestUrl)
    if (cookieHeader)
      headers[FIREFOX_CONTAINER_COOKIE_HEADER] = cookieHeader

    const response = await runtimeDependencies.fetch(requestUrl, {
      method,
      body: method === 'POST'
        ? new URLSearchParams(
            Object.entries(signedParams).flatMap(([key, value]) => (
              value === undefined || value === '' ? [] : [[key, String(value)]]
            )),
          ).toString()
        : undefined,
      credentials: 'include',
      headers,
    })
    return await parsePrivateMessageResponse(response, request.endpointName)
  }
  catch (error) {
    return createPrivateMessageErrorResponse(
      isPrivateMessageWbiUnavailableError(error) ? 'wbi-unavailable' : 'network',
      request.endpointName,
    )
  }
}
