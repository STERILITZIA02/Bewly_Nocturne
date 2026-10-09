import browser from 'webextension-polyfill'

import type { ApiPortResponse } from '~/constants/apiRequest'
import { API_REQUEST_PORT } from '~/constants/apiRequest'
import { READ_REQUEST_TIMEOUT_MS, withRequestDeadline } from '~/utils/abort'

export interface Message<T = any> {
  type: string
  data: T
}

export type MessageHandler<T = any, R = any> = (
  data: T,
  sender?: browser.Runtime.MessageSender,
) => R | Promise<R>

const EXTENSION_CONTEXT_INVALIDATED_MESSAGE = 'Extension context invalidated.'

export function isExtensionContextInvalidatedError(error: unknown): boolean {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase()
  return message.includes('extension context invalidated')
    || message.includes('cannot read properties of undefined (reading \'sendmessage\')')
    // 扩展重载后旧内容脚本访问 browser.runtime.getURL 等资源 API 同样属失效态
    || message.includes('cannot read properties of undefined (reading \'geturl\')')
    || message.includes('message channel closed before a response was received')
    || message.includes('message port closed before a response was received')
    || message.includes('receiving end does not exist')
}

function formatRuntimeError(error: unknown): string {
  if (error instanceof Error)
    return error.message || error.name
  if (typeof error === 'string')
    return error
  try {
    return JSON.stringify(error) ?? String(error)
  }
  catch {
    return String(error)
  }
}

function toRuntimeListenerError(error: unknown): Error {
  // Chromium's native message transport requires a native Error rejection.
  // DOMException does not qualify, even where it inherits Error.prototype.
  if (error instanceof Error && !(typeof DOMException !== 'undefined' && error instanceof DOMException))
    return error
  const details = error && typeof error === 'object' ? error as { message?: unknown, name?: unknown } : undefined
  const normalized = new Error(typeof details?.message === 'string'
    ? details.message
    : typeof error === 'string' ? error : 'Runtime message handler failed')
  if (typeof details?.name === 'string' && details.name)
    normalized.name = details.name
  return normalized
}

export function reportRuntimeFailure(context: string, error: unknown): boolean {
  if (isExtensionContextInvalidatedError(error))
    return false
  console.warn(`[Bewly Nocturne] ${context}: ${formatRuntimeError(error)}`)
  return true
}

function getRuntime(): typeof browser.runtime | undefined {
  try {
    return browser.runtime
  }
  catch {
    return undefined
  }
}

export function getExtensionAssetUrl(path: string): string {
  const runtime = getRuntime()
  if (!runtime?.getURL)
    return ''

  try {
    return runtime.getURL(path)
  }
  catch {
    return ''
  }
}

/**
 * 从 content script 发送消息到 background
 */
export async function sendMessage<T = any, R = any>(type: string, data?: T): Promise<R> {
  const message: Message<T> = { type, data: data as T }
  const runtime = getRuntime()
  if (!runtime?.sendMessage)
    throw new Error(EXTENSION_CONTEXT_INVALIDATED_MESSAGE)

  try {
    return await runtime.sendMessage(message)
  }
  catch (error) {
    if (isExtensionContextInvalidatedError(error))
      throw new Error(EXTENSION_CONTEXT_INVALIDATED_MESSAGE)
    throw error
  }
}

/** A read owns one port; abort/unload disconnects it and aborts the background fetch. */
export async function sendAbortableApiMessage(type: string, data: unknown, signal?: AbortSignal): Promise<any> {
  const deadline = Date.now() + READ_REQUEST_TIMEOUT_MS
  try {
    return await withRequestDeadline(requestSignal => new Promise((resolve, reject) => {
      const runtime = getRuntime()
      if (!runtime?.connect)
        throw new Error(EXTENSION_CONTEXT_INVALIDATED_MESSAGE)
      const port = runtime.connect({ name: API_REQUEST_PORT })
      let settled = false
      function finish(error?: unknown, value?: unknown) {
        if (settled)
          return
        settled = true
        requestSignal.removeEventListener('abort', abort)
        port.onMessage.removeListener(respond)
        port.onDisconnect.removeListener(disconnect)
        try {
          port.disconnect()
        }
        catch { /* An invalidated port still has to settle its consumer. */ }
        if (error)
          reject(error)
        else
          resolve(value)
      }
      function abort() {
        finish(requestSignal.reason)
      }
      function disconnect() {
        finish(new Error(port.error?.message || runtime?.lastError?.message || 'Extension message port closed before a response was received'))
      }
      function respond(value: unknown) {
        const response = value as ApiPortResponse
        if (!response || typeof response.ok !== 'boolean' || (!response.ok && typeof response.error?.message !== 'string')) {
          finish(new TypeError('Invalid API read response'))
          return
        }
        if (response.ok)
          finish(undefined, response.data)
        else
          finish(Object.assign(new Error(response.error.message), response.error))
      }
      port.onMessage.addListener(respond)
      port.onDisconnect.addListener(disconnect)
      requestSignal.addEventListener('abort', abort, { once: true })
      if (requestSignal.aborted) {
        abort()
      }
      else {
        try {
          port.postMessage({ type, data, deadline })
        }
        catch (error) { finish(error) }
      }
    }), { signal, deadline })
  }
  catch (error) {
    if (isExtensionContextInvalidatedError(error))
      throw new Error(EXTENSION_CONTEXT_INVALIDATED_MESSAGE)
    throw error
  }
}

/**
 * 在 background 中监听来自 content script 的消息
 */
export function onMessage<T = any, R = any>(
  type: string,
  handler: MessageHandler<T, R>,
): void {
  const runtime = getRuntime()
  if (!runtime?.onMessage)
    return

  runtime.onMessage.addListener((message: any, sender: browser.Runtime.MessageSender) => {
    if (message?.type === type) {
      try {
        const response = handler(message.data, sender)
        if (response && typeof (response as PromiseLike<R>).then === 'function') {
          return Promise.resolve(response).catch((error: unknown) => {
            throw toRuntimeListenerError(error)
          })
        }
        return response
      }
      catch (error) {
        throw toRuntimeListenerError(error)
      }
    }
    // 返回 false 或 undefined 表示不处理此消息
    return false
  })
}
