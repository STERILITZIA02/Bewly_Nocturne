// 对于fetch的常见后处理
// 1. 直接返回data
// 2. json化后返回data

import type Browser from 'webextension-polyfill'
import browser from 'webextension-polyfill'

import type { ReadRequestOptions } from '~/utils/abort'
import { waitWithSignal, withRequestDeadline } from '~/utils/abort'

import type { WbiKeyOptions } from './wbiSign'
import { addWbiSign, clearWbiKeys, getWbiKeys, initWbiKeys, isBilibiliNavUrl, needsWbiSign, storeWbiKeys } from './wbiSign'

export class ApiRiskControlError extends Error {
  constructor(message: string = '检测到风控页面，API返回了HTML而不是JSON') {
    super(message)
    this.name = 'ApiRiskControlError'
  }
}

type FetchAfterHandler
  = | ((data: Response) => unknown | Promise<unknown>)
    | ((data: unknown) => unknown | Promise<unknown>)

async function toJsonHandler(data: unknown): Promise<unknown> {
  if (!(data instanceof Response))
    throw new TypeError('Expected a fetch Response')
  const contentType = data.headers.get('content-type')

  // 检测是否返回了HTML（风控页面）
  if (contentType && contentType.includes('text/html')) {
    throw new ApiRiskControlError()
  }

  const text = await data.text()
  try {
    return JSON.parse(text)
  }
  catch (error) {
    // 如果JSON解析失败，可能也是风控页面
    if (text.trim().startsWith('<!DOCTYPE') || text.trim().startsWith('<html')) {
      throw new ApiRiskControlError()
    }
    throw error
  }
}

function isTerminatedRead(error: unknown) {
  const name = error && typeof error === 'object' && 'name' in error ? error.name : undefined
  return name === 'AbortError' || name === 'TimeoutError'
}
function toData(data: unknown): unknown {
  return data
}

// 定义后处理流
const AHS: {
  J_D: FetchAfterHandler[]
} = {
  J_D: [toJsonHandler, toData],
}

interface Message {
  contentScriptQuery: string
  [key: string]: unknown
}

interface _FETCH {
  querySerializer?: (params: URLSearchParams) => string
  method: 'get' | 'post'
  headers?: Record<string, string>
  body?: Record<string, unknown>
  bodySerializer?: (body: Record<string, unknown>) => BodyInit
  credentials?: RequestCredentials
  strictParams?: boolean
}

interface API {
  url: string
  _fetch: _FETCH
  params?: Record<string, unknown>
  afterHandle: FetchAfterHandler[]
}
// 重载API 可以为函数
type APIFunction = (message: Message, sender?: Browser.Runtime.MessageSender, request?: ReadRequestOptions) => unknown | Promise<unknown>
export type APIType = API | APIFunction
interface APIMAP {
  [key: string]: APIType
}

const navReads = new Map<string, { promise: Promise<unknown>, expires: number }>()

function readSharedNav(message: Message, api: API, sender?: Browser.Runtime.MessageSender, options?: ReadRequestOptions) {
  return withRequestDeadline(async (signal) => {
    const cookie = await waitWithSignal(browser.cookies.get({ url: api.url, name: 'DedeUserID' }), signal)
    const mid = cookie?.value ?? ''
    const key = `${Boolean(sender?.tab?.incognito ?? browser.extension?.inIncognitoContext)}:${mid}`
    let entry = navReads.get(key)
    if (!entry || (entry.expires > 0 && entry.expires <= Date.now())) {
      const next = { promise: Promise.resolve<unknown>(undefined), expires: 0 }
      next.promise = withRequestDeadline(async (ownerSignal) => {
        const value = await doRequest(message, api, { signal: ownerSignal })
        const response = value as { code?: number, data?: { mid?: number, isLogin?: boolean } }
        const current = await waitWithSignal(browser.cookies.get({ url: api.url, name: 'DedeUserID' }), ownerSignal)
        ownerSignal.throwIfAborted()
        if (response.code === 0 && response.data?.isLogin && String(response.data.mid) === mid && current?.value === mid)
          next.expires = Date.now() + 5_000
        else if (navReads.get(key) === next)
          navReads.delete(key)
        return value
      }).catch((error) => {
        if (navReads.get(key) === next)
          navReads.delete(key)
        throw error
      })
      navReads.set(key, next)
      entry = next
      for (const [id, cached] of navReads) {
        if (cached.expires && cached.expires <= Date.now())
          navReads.delete(id)
      }
    }
    return waitWithSignal(entry.promise, signal)
  }, options)
}
// 工厂函数API_LISTENER_FACTORY
function apiListenerFactory(API_MAP: APIMAP) {
  return async (data: unknown, sender?: Browser.Runtime.MessageSender, request?: ReadRequestOptions) => {
    if (!data || typeof data !== 'object' || Array.isArray(data))
      return console.error('Invalid API message')
    const typedMessage = data as Message
    const contentScriptQuery = typedMessage.contentScriptQuery
    // 检测是否有contentScriptQuery
    if (!contentScriptQuery || !Object.hasOwn(API_MAP, contentScriptQuery))
      return console.error(`Cannot find this contentScriptQuery: ${contentScriptQuery}`)
    if (typeof API_MAP[contentScriptQuery] === 'function')
      return (API_MAP[contentScriptQuery] as APIFunction)(typedMessage, sender, request)

    const api = API_MAP[contentScriptQuery] as API

    if (isBilibiliNavUrl(api.url) && api._fetch.method === 'get')
      return readSharedNav(typedMessage, api, sender, request)
    return await doRequest(typedMessage, api, request)
  }
}

function doRequest(message: Message, api: API, request?: ReadRequestOptions) {
  if (api._fetch.method.toLowerCase() === 'get')
    return withRequestDeadline(signal => performApiRequest(message, api, signal), request)
  return performApiRequest(message, api)
}

async function performApiRequest(message: Message, api: API, signal?: AbortSignal) {
  try {
    const { contentScriptQuery: _contentScriptQuery, ...rest } = message

    let { _fetch, url, params = {}, afterHandle } = api
    const { method, headers = {}, body, bodySerializer, querySerializer, credentials = 'include' } = _fetch as _FETCH
    const isGET = method.toLocaleLowerCase() === 'get'
    // merge params and body
    const targetParams: Record<string, unknown> = { ...params }
    const targetBody: Record<string, unknown> = { ...body }
    Object.keys(rest).forEach((key) => {
      if (body && body[key] !== undefined)
        targetBody[key] = rest[key]
      if (Object.hasOwn(params, key) || ((!body || body[key] === undefined) && !_fetch.strictParams))
        targetParams[key] = rest[key]
    })

    const baseUrl = url
    const needsWbi = needsWbiSign(url)
    const wbiKeyOptions: WbiKeyOptions = { noCookie: credentials === 'omit' }
    const captureAuthenticatedMid = async () => {
      if (wbiKeyOptions.noCookie)
        return ''
      const cookie = await waitWithSignal(browser.cookies.get({
        url: 'https://www.bilibili.com/',
        name: 'DedeUserID',
      }).catch(() => null), signal)
      signal?.throwIfAborted()
      const mid = cookie?.value.trim() ?? ''
      if (wbiKeyOptions.mid !== undefined && wbiKeyOptions.mid !== mid)
        throw new DOMException('Request account changed', 'AbortError')
      wbiKeyOptions.mid = mid
      return wbiKeyOptions.mid
    }
    if (needsWbi || isBilibiliNavUrl(baseUrl))
      await captureAuthenticatedMid()

    // 如果需要WBI签名但没有密钥，主动获取密钥
    if (needsWbi && !getWbiKeys(wbiKeyOptions)) {
      try {
        await waitWithSignal(initWbiKeys(wbiKeyOptions), signal)
      }
      catch (error) {
        signal?.throwIfAborted()
        if (isTerminatedRead(error))
          throw error
        // 获取密钥失败，继续执行（降级到无签名请求）
        console.error('[doRequest] Failed to fetch WBI keys:', error)
      }
    }

    // 内部函数：执行实际请求
    const performRequest = async (useWbi: boolean) => {
      signal?.throwIfAborted()
      if (needsWbi)
        await captureAuthenticatedMid()
      signal?.throwIfAborted()
      let requestUrl = baseUrl
      let requestParams: Record<string, unknown> = { ...targetParams }

      // 为需要WBI签名的API添加签名
      if (needsWbi && useWbi) {
        requestParams = addWbiSign(requestParams, wbiKeyOptions)
      }
      // generate params
      if (Object.keys(requestParams).length) {
        const urlParams = new URLSearchParams()
        for (const key in requestParams) {
          const value = requestParams[key]
          // 过滤空值参数：undefined、null、空字符串
          // 保留数字 0 和布尔值 false
          if (value !== undefined && value !== null && value !== '') {
            urlParams.append(key, String(value))
          }
        }
        requestUrl += `?${querySerializer ? querySerializer(urlParams) : urlParams.toString()}`
      }

      // generate body
      let requestBody: BodyInit | undefined
      if (!isGET) {
        if (bodySerializer) {
          requestBody = bodySerializer(targetBody)
        }
        else if (headers['Content-Type']?.includes('application/x-www-form-urlencoded')) {
          const formBody = new URLSearchParams()
          for (const [key, value] of Object.entries(targetBody)) {
            if (value !== undefined && value !== null)
              formBody.append(key, String(value))
          }
          requestBody = formBody
        }
        else {
          requestBody = JSON.stringify(targetBody)
        }
      }

      const requestHeaders = { ...headers }

      // 添加Referer以防止风控
      if (!requestHeaders.Referer) {
        requestHeaders.Referer = 'https://www.bilibili.com/'
      }

      // 对于UP主空间相关的API，设置正确的Referer
      if (requestUrl.includes('/x/space/wbi/arc/search') && targetParams.mid) {
        requestHeaders.Referer = `https://space.bilibili.com/${targetParams.mid}/`
      }

      // get cant take body
      const fetchOpt: RequestInit = {
        method,
        headers: requestHeaders,
        credentials,
        signal,
      }
      if (!isGET)
        fetchOpt.body = requestBody

      return fetch(requestUrl, fetchOpt)
    }

    // 标记是否已经尝试过无 WBI 重试
    let hasTriedWithoutWbi = false
    let hasRefreshedWbiKeys = false

    function isWbiSignatureRejected(response: unknown): boolean {
      return Boolean(
        response
        && typeof response === 'object'
        && 'code' in response
        && response.code === -403,
      )
    }

    // 执行完整请求流程的函数（包括响应处理）
    const executeFullRequest = async (useWbi: boolean) => {
      const response = await performRequest(useWbi)
      signal?.throwIfAborted()

      // 如果是获取用户信息的API，在响应后存储WBI密钥
      if (isBilibiliNavUrl(baseUrl)) {
        const clonedResponse = response.clone()

        try {
          const data = await waitWithSignal(clonedResponse.json(), signal) as {
            code?: number
            data?: { wbi_img?: { img_url?: string, sub_url?: string } }
          }

          if (data.code === 0 && data.data?.wbi_img) {
            const { img_url, sub_url } = data.data.wbi_img
            if (img_url && sub_url) {
              const responseMid = wbiKeyOptions.mid
              const currentMid = await captureAuthenticatedMid()
              if (wbiKeyOptions.noCookie || currentMid === responseMid)
                storeWbiKeys(img_url, sub_url, wbiKeyOptions)
            }
          }
        }
        catch (error) {
          signal?.throwIfAborted()
          if (isTerminatedRead(error))
            throw error
          // 忽略错误
        }
      }

      // 执行 afterHandle 处理
      let handledResponse: unknown = response
      for (const func of afterHandle) {
        const invoke = func as (data: unknown) => unknown | Promise<unknown>
        handledResponse = await waitWithSignal(Promise.resolve(invoke(handledResponse)), signal)
        signal?.throwIfAborted()
      }

      return handledResponse
    }

    // 执行请求的包装函数，支持 WBI 降级重试
    const executeRequestWithRetry = async () => {
      try {
        // 首次请求（使用 WBI 签名，如果需要）
        let response = await executeFullRequest(true)

        // WBI 密钥可能在缓存有效期内被服务端轮换。收到 -403 时强制刷新一次，
        // 避免把签名失效误判成业务侧的访问权限不足。
        if (isGET && needsWbi && !hasRefreshedWbiKeys && isWbiSignatureRejected(response)) {
          hasRefreshedWbiKeys = true
          await captureAuthenticatedMid()
          clearWbiKeys(wbiKeyOptions)
          const refreshed = await waitWithSignal(initWbiKeys(wbiKeyOptions), signal)
          if (refreshed)
            response = await executeFullRequest(true)
        }

        return response
      }
      catch (error) {
        signal?.throwIfAborted()
        if (isTerminatedRead(error))
          throw error
        // 如果使用了 WBI 签名且失败，尝试不带 WBI 签名重试
        if (isGET && needsWbi && !(error instanceof ApiRiskControlError) && !hasTriedWithoutWbi) {
          hasTriedWithoutWbi = true
          return await executeFullRequest(false)
        }
        throw error
      }
    }

    url = baseUrl + (Object.keys(targetParams).length ? '?...' : '')

    // 执行请求并进行统一错误处理
    return executeRequestWithRetry().catch((error) => {
      signal?.throwIfAborted()
      if (isTerminatedRead(error))
        throw error
      if (error instanceof ApiRiskControlError) {
        // 返回统一的风控错误格式
        const riskError = new Error(error.message)
        Object.assign(riskError, {
          code: -412,
          isRiskControl: true,
        })
        throw riskError
      }
      // 其他错误也返回统一格式
      const apiError = new Error(error.message || '请求失败')
      Object.assign(apiError, {
        code: -1,
        originalError: error.toString(),
      })
      throw apiError
    })
  }
  catch (e) {
    signal?.throwIfAborted()
    if (isTerminatedRead(e))
      throw e
    if (e instanceof Error && (e as Error & { isRiskControl?: boolean }).isRiskControl)
      return Promise.reject(e)

    const initError = new Error(e instanceof Error ? e.message : '请求初始化失败')
    Object.assign(initError, {
      code: -1,
      originalError: e instanceof Error ? e.toString() : String(e),
    })
    return Promise.reject(initError)
  }
}

export {
  type _FETCH,
  AHS,
  type API,
  apiListenerFactory,
  type APIMAP,
  doRequest,
  type FetchAfterHandler,
  type Message,
  toData,
  toJsonHandler,
}
