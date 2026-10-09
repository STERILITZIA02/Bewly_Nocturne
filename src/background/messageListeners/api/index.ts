import browser from 'webextension-polyfill'

import type { ApiPortResponse } from '~/constants/apiRequest'
import { API_REQUEST_PORT, CANCELLABLE_API_FUNCTIONS } from '~/constants/apiRequest'
import { onMessage } from '~/utils/messaging'

import API_MESSAGE_SERVER_SETTINGS from '../../messageServerSettings'
import API_PRIVATE_MESSAGE from '../../privateMessage'
import { apiListenerFactory } from '../../utils'
import API_ANIME from './anime'
import API_AUTH from './auth'
import API_FAVORITE from './favorite'
import API_HISTORY from './history'
import API_LIVE from './live'
import API_MOMENT from './moment'
import API_NOTIFICATION from './notification'
import API_RANKING from './ranking'
import API_SEARCH from './search'
import API_USER from './user'
import API_VIDEO from './video'
import API_WATCHLATER from './watchLater'

export const API_COLLECTION = {
  AUTH: API_AUTH,
  ANIME: API_ANIME,
  HISTORY: API_HISTORY,
  FAVORITE: API_FAVORITE,
  MOMENT: API_MOMENT,
  NOTIFICATION: API_NOTIFICATION,
  MESSAGE_SERVER_SETTINGS: API_MESSAGE_SERVER_SETTINGS,
  PRIVATE_MESSAGE: API_PRIVATE_MESSAGE,
  RANKING: API_RANKING,
  SEARCH: API_SEARCH,
  USER: API_USER,
  VIDEO: API_VIDEO,
  WATCHLATER: API_WATCHLATER,
  LIVE: API_LIVE,

  [Symbol.iterator]() {
    return Object.values(this).values()
  },
}

// Merge all API objects into one
const FullAPI = Object.assign({}, ...API_COLLECTION)
// Create a message listener for each API
const handleMessage = apiListenerFactory(FullAPI)
const cancellableFunctions = new Set<string>(CANCELLABLE_API_FUNCTIONS)

export function setupApiMsgListeners() {
  // 为每个API设置webext-bridge消息监听器
  Object.keys(FullAPI).forEach((apiName) => {
    onMessage(apiName, handleMessage)
  })

  browser.runtime.onConnect.addListener((port) => {
    if (port.name !== API_REQUEST_PORT)
      return
    const controller = new AbortController()
    let connected = true
    const disconnect = () => {
      connected = false
      controller.abort()
      port.onMessage.removeListener(onRequest)
      port.onDisconnect.removeListener(disconnect)
    }
    const respond = (response: ApiPortResponse) => {
      if (!connected)
        return
      try {
        port.postMessage(response)
      }
      catch { disconnect() }
    }
    function onRequest(value: unknown) {
      const message = value as { type?: string, data?: { contentScriptQuery?: string }, deadline?: number }
      port.onMessage.removeListener(onRequest)
      const definition = Object.hasOwn(FullAPI, message?.type ?? '') ? FullAPI[message.type!] : undefined
      // Only explicit reads may be cancelled. The anonymous function rebuilds its
      // endpoint/parameter allowlist internally and always omits credentials.
      const readable = definition && (typeof definition === 'function'
        ? cancellableFunctions.has(message.type ?? '')
        : definition._fetch.method.toLowerCase() === 'get')
      if (!readable || message.data?.contentScriptQuery !== message.type) {
        respond({ ok: false, error: { name: 'TypeError', message: 'Invalid cancellable API read' } })
        return
      }
      void handleMessage(message.data, port.sender, { signal: controller.signal, deadline: message.deadline }).then(
        data => respond({ ok: true, data }),
        error => respond({ ok: false, error: {
          name: error?.name || 'Error',
          message: error?.message || String(error),
          code: error?.code,
          isRiskControl: error?.isRiskControl,
        } }),
      )
    }
    port.onDisconnect.addListener(disconnect)
    port.onMessage.addListener(onRequest)
  })
}
