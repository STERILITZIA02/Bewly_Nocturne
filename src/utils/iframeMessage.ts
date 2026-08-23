import { isContentScriptTargetUrl } from '~/constants/contentScript'

type IframeMessageTarget = Pick<HTMLIFrameElement, 'contentWindow' | 'getAttribute'>

interface IframeMessagingReadyState {
  contentWindow: Window
  expectedOrigin: string
}

const iframeMessagingReadyStates = new WeakMap<object, IframeMessagingReadyState>()

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (Object.prototype.toString.call(value) !== '[object Object]')
    return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === null || prototype === Object.prototype
}

function getHttpOrigin(value: string, baseUrl?: string): string | undefined {
  try {
    const url = baseUrl ? new URL(value, baseUrl) : new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:')
      return undefined
    return url.origin
  }
  catch {
    return undefined
  }
}

export function getIframeExpectedOrigin(
  iframe: Pick<HTMLIFrameElement, 'getAttribute'> | null | undefined,
  baseUrl = globalThis.location?.href,
): string | undefined {
  const src = iframe?.getAttribute('src')?.trim()
  if (!src || src === 'about:blank')
    return undefined
  return getHttpOrigin(src, baseUrl)
}

export function markIframeReadyForMessaging(
  iframe: IframeMessageTarget | null | undefined,
  baseUrl = globalThis.location?.href,
): boolean {
  const expectedOrigin = getIframeExpectedOrigin(iframe, baseUrl)
  if (!iframe?.contentWindow || !expectedOrigin || typeof iframe !== 'object')
    return false
  iframeMessagingReadyStates.set(iframe, {
    contentWindow: iframe.contentWindow,
    expectedOrigin,
  })
  return true
}

export function isIframeReadyForMessaging(
  iframe: IframeMessageTarget | null | undefined,
  baseUrl = globalThis.location?.href,
): boolean {
  const expectedOrigin = getIframeExpectedOrigin(iframe, baseUrl)
  if (!iframe?.contentWindow || !expectedOrigin)
    return false

  try {
    const currentLocation = iframe.contentWindow.location
    return currentLocation.href !== 'about:blank' && currentLocation.origin === expectedOrigin
  }
  catch {
    if (typeof iframe !== 'object')
      return false
    const readyState = iframeMessagingReadyStates.get(iframe)
    return readyState?.contentWindow === iframe.contentWindow
      && readyState.expectedOrigin === expectedOrigin
  }
}

export function getIframeMessageData(
  event: Pick<MessageEvent<unknown>, 'data' | 'origin' | 'source'>,
  iframe: IframeMessageTarget | null | undefined,
  baseUrl = globalThis.location?.href,
): Record<string, unknown> | undefined {
  const expectedOrigin = getIframeExpectedOrigin(iframe, baseUrl)
  if (!expectedOrigin
    || event.source !== iframe?.contentWindow
    || event.origin !== expectedOrigin
    || !isPlainObject(event.data)) {
    return undefined
  }
  return event.data
}

export function postMessageToIframe(
  iframe: IframeMessageTarget | null | undefined,
  message: unknown,
  baseUrl = globalThis.location?.href,
): boolean {
  const expectedOrigin = getIframeExpectedOrigin(iframe, baseUrl)
  if (!iframe?.contentWindow || !expectedOrigin || !isIframeReadyForMessaging(iframe, baseUrl))
    return false
  try {
    iframe.contentWindow.postMessage(message, expectedOrigin)
    return true
  }
  catch {
    // The iframe may still be on its inherited initial about:blank document.
    return false
  }
}

export function getAllowedParentOrigin(referrer = document.referrer): string | undefined {
  if (!isContentScriptTargetUrl(referrer))
    return undefined
  return getHttpOrigin(referrer)
}

export function getParentMessageData(
  event: Pick<MessageEvent<unknown>, 'data' | 'origin' | 'source'>,
  allowedTypes: readonly string[],
): Record<string, unknown> | undefined {
  const expectedOrigin = getAllowedParentOrigin()
  if (window.parent === window
    || !expectedOrigin
    || event.source !== window.parent
    || event.origin !== expectedOrigin
    || !isPlainObject(event.data)
    || typeof event.data.type !== 'string'
    || !allowedTypes.includes(event.data.type)) {
    return undefined
  }
  return event.data
}

export function postMessageToParent(message: unknown): boolean {
  const expectedOrigin = getAllowedParentOrigin()
  if (window.parent === window || !expectedOrigin)
    return false
  window.parent.postMessage(message, expectedOrigin)
  return true
}
