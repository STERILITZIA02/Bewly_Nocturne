export const PAGE_BRIDGE_PROTOCOL = 'bewly:v1'

export const PAGE_BRIDGE_MESSAGE = {
  SETTINGS_REQUEST: 'settings:request',
  SETTINGS_UPDATE: 'settings:update',
} as const

export type PageBridgeMessageType = typeof PAGE_BRIDGE_MESSAGE[keyof typeof PAGE_BRIDGE_MESSAGE]

export interface PageBridgeMessage {
  protocol: typeof PAGE_BRIDGE_PROTOCOL
  channelId: string
  type: PageBridgeMessageType
  data?: unknown
}

export interface PageBridgeMessageMatch {
  channelId: string
  type: PageBridgeMessageType
}

export interface PageBridgeEventMatch extends PageBridgeMessageMatch {
  origin: string
  source: MessageEventSource
}

interface PageBridgeMessageTarget {
  postMessage: (message: unknown, targetOrigin: string) => void
}

export function getPageBridgeTargetOrigin(
  origin = globalThis.location?.origin,
): string | undefined {
  if (!origin || origin === 'null')
    return undefined
  try {
    const parsed = new URL(origin)
    if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || parsed.origin !== origin)
      return undefined
    return origin
  }
  catch {
    return undefined
  }
}

export function postPageBridgeMessage(
  target: PageBridgeMessageTarget,
  message: PageBridgeMessage,
  origin = globalThis.location?.origin,
): boolean {
  const targetOrigin = getPageBridgeTargetOrigin(origin)
  if (!targetOrigin)
    return false
  try {
    target.postMessage(message, targetOrigin)
    return true
  }
  catch {
    // The document may become detached between validating its origin and posting.
    return false
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (Object.prototype.toString.call(value) !== '[object Object]')
    return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === null || prototype === Object.prototype
}

function isPageBridgeMessageType(value: unknown): value is PageBridgeMessageType {
  return value === PAGE_BRIDGE_MESSAGE.SETTINGS_REQUEST
    || value === PAGE_BRIDGE_MESSAGE.SETTINGS_UPDATE
}

export function isPageBridgeMessage(value: unknown): value is PageBridgeMessage {
  if (!isPlainObject(value)
    || value.protocol !== PAGE_BRIDGE_PROTOCOL
    || typeof value.channelId !== 'string'
    || value.channelId.length === 0
    || value.channelId.length > 128
    || !isPageBridgeMessageType(value.type)) {
    return false
  }

  return value.type === PAGE_BRIDGE_MESSAGE.SETTINGS_REQUEST
    ? value.data === undefined
    : Object.prototype.hasOwnProperty.call(value, 'data')
}

export function matchesPageBridgeMessage(
  value: unknown,
  expected: PageBridgeMessageMatch,
): value is PageBridgeMessage {
  return isPageBridgeMessage(value)
    && value.channelId === expected.channelId
    && value.type === expected.type
}

export function matchesPageBridgeEvent(
  event: Pick<MessageEvent<unknown>, 'data' | 'origin' | 'source'>,
  expected: PageBridgeEventMatch,
): event is MessageEvent<PageBridgeMessage> {
  return event.source === expected.source
    && event.origin === expected.origin
    && matchesPageBridgeMessage(event.data, expected)
}

export function createPageBridgeChannelId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`
}
