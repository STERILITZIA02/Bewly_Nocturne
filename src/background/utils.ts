// 对于fetch的常见后处理
// 1. 直接返回data
// 2. json化后返回data

import type Browser from 'webextension-polyfill'
import browser from 'webextension-polyfill'

import { FIREFOX_CONTAINER_COOKIE_HEADER, serializeCookiesForUrl } from './firefoxCookies'
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

  const textResponse = data.clone()
  try {
    return await data.json()
  }
  catch (error) {
    // 如果JSON解析失败，可能也是风控页面
    const text = await textResponse.text()
    if (text.trim().startsWith('<!DOCTYPE') || text.trim().startsWith('<html')) {
      throw new ApiRiskControlError()
    }
    throw error
  }
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
  method: string
  headers?: Record<string, string>
  body?: Record<string, unknown>
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
type APIFunction = (message: Message, sender?: Browser.Runtime.MessageSender) => unknown | Promise<unknown>
export type APIType = API | APIFunction
interface APIMAP {
  [key: string]: APIType
}
// 工厂函数API_LISTENER_FACTORY
function apiListenerFactory(API_MAP: APIMAP) {
  return async (data: unknown, sender?: Browser.Runtime.MessageSender) => {
    if (!data || typeof data !== 'object' || Array.isArray(data))
      return console.error('Invalid API message')
    const typedMessage = data as Message
    const contentScriptQuery = typedMessage.contentScriptQuery
    // 检测是否有contentScriptQuery
    if (!contentScriptQuery || !API_MAP[contentScriptQuery])
      return console.error(`Cannot find this contentScriptQuery: ${contentScriptQuery}`)
    if (typeof API_MAP[contentScriptQuery] === 'function')
      return (API_MAP[contentScriptQuery] as APIFunction)(typedMessage, sender)

    const api = API_MAP[contentScriptQuery] as API

    // eslint-disable-next-line node/prefer-global/process
    if (process.env.FIREFOX && sender && sender.tab?.id) {
      if (api._fetch.credentials === 'omit')
        return await doRequest(typedMessage, api)

      // 获取tab信息以获取正确的cookieStoreId
      const tab = await browser.tabs.get(sender.tab.id)
      const storeId = tab.cookieStoreId || 'default'
      const cookies = await browser.cookies.getAll({ storeId })
      return await doRequest(typedMessage, api, cookies)
    }

    return await doRequest(typedMessage, api)
  }
}

async function doRequest(message: Message, api: API, cookies?: Browser.Cookies.Cookie[]) {
  try {
    const { contentScriptQuery: _contentScriptQuery, ...rest } = message

    let { _fetch, url, params = {}, afterHandle } = api
    const { method, headers = {}, body, credentials = 'include' } = _fetch as _FETCH
    const isGET = method.toLocaleLowerCase() === 'get'
    // merge params and body
    const targetParams: Record<string, unknown> = { ...params }
    const targetBody: Record<string, unknown> = { ...body }
    Object.keys(rest).forEach((key) => {
      if (body && body[key] !== undefined)
        targetBody[key] = rest[key]
      else if (!_fetch.strictParams || Object.hasOwn(params, key))
        targetParams[key] = rest[key]
    })

    const baseUrl = url
    const needsWbi = needsWbiSign(url)
    const wbiKeyOptions = { noCookie: credentials === 'omit' }

    // 如果需要WBI签名但没有密钥，主动获取密钥
    if (needsWbi && !getWbiKeys(wbiKeyOptions)) {
      try {
        await initWbiKeys(wbiKeyOptions)
      }
      catch (error) {
        // 获取密钥失败，继续执行（降级到无签名请求）
        console.error('[doRequest] Failed to fetch WBI keys:', error)
      }
    }

    // 内部函数：执行实际请求
    const performRequest = (useWbi: boolean) => {
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
        requestUrl += `?${urlParams.toString()}`
      }

      // generate body
      let requestBody: BodyInit | undefined
      if (!isGET) {
        if (headers['Content-Type']?.includes('application/x-www-form-urlencoded')) {
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

      // generate cookies
      const requestHeaders = { ...headers }
      if (cookies && credentials !== 'omit') {
        const cookieStr = serializeCookiesForUrl(cookies, requestUrl)
        if (cookieStr)
          requestHeaders[FIREFOX_CONTAINER_COOKIE_HEADER] = cookieStr
      }

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

      // 如果是获取用户信息的API，在响应后存储WBI密钥
      if (isBilibiliNavUrl(baseUrl)) {
        const clonedResponse = response.clone()

        try {
          const data = await clonedResponse.json() as {
            code?: number
            data?: { wbi_img?: { img_url?: string, sub_url?: string } }
          }

          if (data.code === 0 && data.data?.wbi_img) {
            const { img_url, sub_url } = data.data.wbi_img
            if (img_url && sub_url) {
              storeWbiKeys(img_url, sub_url, wbiKeyOptions)
            }
          }
        }
        catch {
          // 忽略错误
        }
      }

      // 执行 afterHandle 处理
      let handledResponse: unknown = response
      for (const func of afterHandle) {
        const invoke = func as (data: unknown) => unknown | Promise<unknown>
        handledResponse = await invoke(handledResponse)
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
        if (needsWbi && !hasRefreshedWbiKeys && isWbiSignatureRejected(response)) {
          hasRefreshedWbiKeys = true
          clearWbiKeys(wbiKeyOptions)
          const refreshed = await initWbiKeys(wbiKeyOptions)
          if (refreshed)
            response = await executeFullRequest(true)
        }

        return response
      }
      catch (error) {
        // 如果使用了 WBI 签名且失败，尝试不带 WBI 签名重试
        if (needsWbi && !hasTriedWithoutWbi) {
          hasTriedWithoutWbi = true
          return await executeFullRequest(false)
        }
        throw error
      }
    }

    url = baseUrl + (Object.keys(targetParams).length ? '?...' : '')

    // 执行请求并进行统一错误处理
    return executeRequestWithRetry().catch((error) => {
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
