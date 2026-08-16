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
  PrivateMessageFormRequest,
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

export interface SignedPrivateMessageFormRequest {
  endpointName: PrivateMessageEndpointName
  body: PrivateMessageRequestParams
  url: string
}

export interface PrivateMessageFormTransportRequest extends PrivateMessageFormRequest {
  endpointName: PrivateMessageEndpointName
}

interface PrivateMessageRequestDependencies {
  fetch: typeof fetch
  signParams: typeof signPrivateMessageParams
}

interface PrivateImageUploadDependencies {
  fetch: typeof fetch
}

const DEFAULT_SIGNING_DEPENDENCIES: PrivateMessageSigningDependencies = {
  addWbiSign,
  initWbiKeys,
}

const DEFAULT_REQUEST_DEPENDENCIES: PrivateMessageRequestDependencies = {
  fetch: globalThis.fetch.bind(globalThis),
  signParams: signPrivateMessageParams,
}

const DEFAULT_IMAGE_UPLOAD_DEPENDENCIES: PrivateImageUploadDependencies = {
  fetch: globalThis.fetch.bind(globalThis),
}

export interface PrivateImageUploadRequest {
  endpointName: 'uploadPrivateImage'
  form: FormData
  url: string
}

export interface PrivateMessageSendDiagnostic {
  endpoint: string
  httpStatus: number
  apiCode: number
  responseContentType: string
  riskControl: boolean
  queryFieldNames: string[]
  bodyFieldNames: string[]
  devIdMatches: boolean
  transport: 'signed-query-form-body'
}

interface PrivateMessageSendDiagnosticInput {
  apiResponse: PrivateMessageApiResponse
  body: PrivateMessageRequestParams
  endpointName: PrivateMessageEndpointName
  query: PrivateMessageRequestParams
  responseContentType: string
  responseStatus: number
  url: string
}

function getEndpointWithoutQuery(url: string): string {
  try {
    const parsed = new URL(url)
    return `${parsed.origin}${parsed.pathname}`
  }
  catch {
    return ''
  }
}

export function createPrivateMessageSendDiagnostic(
  input: PrivateMessageSendDiagnosticInput,
): PrivateMessageSendDiagnostic {
  return {
    endpoint: getEndpointWithoutQuery(input.url),
    httpStatus: input.responseStatus,
    apiCode: input.apiResponse.code,
    responseContentType: input.responseContentType,
    riskControl: input.apiResponse.bewlyError?.kind === 'risk-control'
      || input.responseStatus === 403
      || input.responseStatus === 412,
    queryFieldNames: Object.keys(input.query).sort(),
    bodyFieldNames: Object.keys(input.body).sort(),
    devIdMatches: input.query.w_dev_id === input.body['msg[dev_id]'],
    transport: 'signed-query-form-body',
  }
}

function reportPrivateMessageSendDiagnostic(input: PrivateMessageSendDiagnosticInput) {
  if (import.meta.env?.DEV)
    console.debug('[Bewly private-message transport]', createPrivateMessageSendDiagnostic(input))
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

export function requestPrivateMessageForm(
  request: PrivateMessageRequest,
  dependencies?: Partial<PrivateMessageRequestDependencies>,
  sender?: Browser.Runtime.MessageSender,
): Promise<PrivateMessageApiResponse>
export function requestPrivateMessageForm(
  request: PrivateMessageFormTransportRequest,
  dependencies?: Partial<PrivateMessageRequestDependencies>,
  sender?: Browser.Runtime.MessageSender,
): Promise<PrivateMessageApiResponse>
export async function requestPrivateMessageForm(
  request: PrivateMessageRequest | PrivateMessageFormTransportRequest,
  dependencies: Partial<PrivateMessageRequestDependencies> = {},
  sender?: Browser.Runtime.MessageSender,
): Promise<PrivateMessageApiResponse> {
  if ('params' in request)
    return requestSignedPrivateMessage(request, 'POST', dependencies, sender)

  const runtimeDependencies = {
    ...DEFAULT_REQUEST_DEPENDENCIES,
    ...dependencies,
  }
  const requestUrl = appendRequestParams(request.url, request.query)
  try {
    const headers: Record<string, string> = {
      Referer: 'https://message.bilibili.com/',
      'Content-Type': 'application/x-www-form-urlencoded',
    }
    const cookieHeader = await getFirefoxContainerCookieHeader(sender, requestUrl)
    if (cookieHeader)
      headers[FIREFOX_CONTAINER_COOKIE_HEADER] = cookieHeader

    const response = await runtimeDependencies.fetch(requestUrl, {
      method: 'POST',
      body: serializeRequestParams(request.body),
      credentials: 'include',
      headers,
    })
    const apiResponse = await parsePrivateMessageResponse(response, request.endpointName)
    if (request.endpointName === 'sendPrivateMessage') {
      reportPrivateMessageSendDiagnostic({
        apiResponse,
        body: request.body,
        endpointName: request.endpointName,
        query: request.query,
        responseContentType: response.headers.get('content-type') || '',
        responseStatus: response.status,
        url: request.url,
      })
    }
    return apiResponse
  }
  catch {
    const apiResponse = createPrivateMessageErrorResponse('network', request.endpointName)
    if (request.endpointName === 'sendPrivateMessage') {
      reportPrivateMessageSendDiagnostic({
        apiResponse,
        body: request.body,
        endpointName: request.endpointName,
        query: request.query,
        responseContentType: '',
        responseStatus: 0,
        url: request.url,
      })
    }
    return apiResponse
  }
}

export async function buildPrivateMessageFormRequest(
  url: string,
  body: PrivateMessageRequestParams,
  signParams: typeof signPrivateMessageParams = signPrivateMessageParams,
): Promise<PrivateMessageFormRequest> {
  const senderId = body['msg[sender_uid]']
  const receiverId = body['msg[receiver_id]']
  const devId = body['msg[dev_id]']
  if (
    typeof senderId !== 'string'
    || typeof receiverId !== 'string'
    || typeof devId !== 'string'
    || !senderId
    || !receiverId
    || !devId
  ) {
    throw new TypeError('private-message form identity fields are required')
  }

  const identityQuery = {
    w_sender_uid: senderId,
    w_receiver_id: receiverId,
    w_dev_id: devId,
  }
  const signed = await signParams(identityQuery)
  if (typeof signed.wts !== 'number' || typeof signed.w_rid !== 'string' || !signed.w_rid)
    throw new PrivateMessageWbiUnavailableError()

  return {
    url,
    body: { ...body },
    query: {
      ...identityQuery,
      wts: signed.wts,
      w_rid: signed.w_rid,
    },
  }
}

export async function requestSignedPrivateMessageForm(
  request: SignedPrivateMessageFormRequest,
  dependencies: Partial<PrivateMessageRequestDependencies> = {},
  sender?: Browser.Runtime.MessageSender,
): Promise<PrivateMessageApiResponse> {
  const runtimeDependencies = {
    ...DEFAULT_REQUEST_DEPENDENCIES,
    ...dependencies,
  }
  try {
    const formRequest = await buildPrivateMessageFormRequest(
      request.url,
      request.body,
      runtimeDependencies.signParams,
    )
    return await requestPrivateMessageForm({
      endpointName: request.endpointName,
      ...formRequest,
    }, runtimeDependencies, sender)
  }
  catch (error) {
    return createPrivateMessageErrorResponse(
      isPrivateMessageWbiUnavailableError(error) ? 'wbi-unavailable' : 'invalid-response',
      request.endpointName,
    )
  }
}

export async function requestPrivateImageUpload(
  request: PrivateImageUploadRequest,
  dependencies: Partial<PrivateImageUploadDependencies> = {},
  sender?: Browser.Runtime.MessageSender,
  signal?: AbortSignal,
): Promise<PrivateMessageApiResponse> {
  const runtimeDependencies = {
    ...DEFAULT_IMAGE_UPLOAD_DEPENDENCIES,
    ...dependencies,
  }
  try {
    const headers: Record<string, string> = {
      Referer: 'https://www.bilibili.com/',
    }
    const cookieHeader = await getFirefoxContainerCookieHeader(sender, request.url)
    if (cookieHeader)
      headers[FIREFOX_CONTAINER_COOKIE_HEADER] = cookieHeader
    const response = await runtimeDependencies.fetch(request.url, {
      method: 'POST',
      body: request.form,
      credentials: 'include',
      headers,
      signal,
    })
    return await parsePrivateMessageResponse(response, request.endpointName)
  }
  catch {
    return createPrivateMessageErrorResponse('network', request.endpointName)
  }
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
      body: method === 'POST' ? serializeRequestParams(signedParams) : undefined,
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

function serializeRequestParams(params: PrivateMessageRequestParams): string {
  return new URLSearchParams(
    Object.entries(params).flatMap(([key, value]) => (
      value === undefined || value === '' ? [] : [[key, String(value)]]
    )),
  ).toString()
}
