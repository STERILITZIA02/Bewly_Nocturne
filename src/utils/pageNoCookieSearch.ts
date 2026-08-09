import { matchesPageBridgeMessage, PAGE_BRIDGE_MESSAGE, PAGE_BRIDGE_PROTOCOL } from '~/constants/pageBridge'
import type { SearchApiMethod } from '~/constants/searchApi'
import { SEARCH_API_DEFINITIONS } from '~/constants/searchApi'
import { waitForPageBridgeChannelId } from '~/utils/pageBridgeChannel'

interface PageSearchResponse {
  ok?: boolean
  status?: number
  response?: unknown
  error?: string
}

const RESPONSE_TIMEOUT_MS = 15000
let requestSeq = 0

export function isPageNoCookieSearchMethod(method: string): method is SearchApiMethod {
  return method in SEARCH_API_DEFINITIONS
}

export function requestPageNoCookieSearch(method: SearchApiMethod, options?: Record<string, unknown>): Promise<any> {
  const url = buildSearchUrl(method, options)
  return requestPageFetch(url)
}

function buildSearchUrl(method: SearchApiMethod, options: Record<string, unknown> = {}) {
  const definition = SEARCH_API_DEFINITIONS[method]
  const params: Record<string, unknown> = {
    ...definition.params,
    ...options,
  }

  const urlParams = new URLSearchParams()

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '')
      urlParams.append(key, String(value))
  })

  const query = urlParams.toString()
  return query ? `${definition.url}?${query}` : definition.url
}

async function requestPageFetch(url: string): Promise<any> {
  const channelId = await waitForPageBridgeChannelId()
  return new Promise((resolve, reject) => {
    const requestId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${++requestSeq}-${Math.random()}`
    const timer = window.setTimeout(() => {
      cleanup()
      reject(new Error('Page no-cookie search request timed out'))
    }, RESPONSE_TIMEOUT_MS)

    function cleanup() {
      window.clearTimeout(timer)
      window.removeEventListener('message', handleMessage)
    }

    function handleMessage(event: MessageEvent) {
      if (event.source !== window)
        return

      if (!matchesPageBridgeMessage(event.data, {
        channelId,
        type: PAGE_BRIDGE_MESSAGE.NO_COOKIE_SEARCH_RESPONSE,
        requestId,
      }) || typeof event.data.data !== 'object' || event.data.data === null) {
        return
      }

      cleanup()

      const response = event.data.data as PageSearchResponse
      if (response.error) {
        reject(new Error(response.error))
        return
      }

      if (typeof response.ok !== 'boolean' || !Number.isFinite(response.status)) {
        reject(new Error('Invalid page no-cookie search response'))
        return
      }

      resolve(response.response)
    }

    window.addEventListener('message', handleMessage)
    window.postMessage({
      protocol: PAGE_BRIDGE_PROTOCOL,
      channelId,
      type: PAGE_BRIDGE_MESSAGE.NO_COOKIE_SEARCH_REQUEST,
      requestId,
      data: { method: 'GET', url },
    }, '*')
  })
}
