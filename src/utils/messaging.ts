import browser from 'webextension-polyfill'

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
      return handler(message.data, sender)
    }
    // 返回 false 或 undefined 表示不处理此消息
    return false
  })
}
