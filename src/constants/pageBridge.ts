export const PAGE_BRIDGE_PROTOCOL = 'bewly:v1'

export const PAGE_BRIDGE_MESSAGE = {
  SETTINGS_REQUEST: 'settings:request',
  SETTINGS_UPDATE: 'settings:update',
} as const

export interface PageBridgeMessage {
  protocol: typeof PAGE_BRIDGE_PROTOCOL
  channelId: string
  type: string
  requestId?: string
  data?: unknown
}

interface PageBridgeMessageMatch {
  channelId: string
  type: string
  requestId?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function isPageBridgeMessage(value: unknown): value is PageBridgeMessage {
  return isRecord(value)
    && value.protocol === PAGE_BRIDGE_PROTOCOL
    && typeof value.channelId === 'string'
    && typeof value.type === 'string'
    && (value.requestId === undefined || typeof value.requestId === 'string')
}

export function matchesPageBridgeMessage(value: unknown, expected: PageBridgeMessageMatch): value is PageBridgeMessage {
  return isPageBridgeMessage(value)
    && value.channelId === expected.channelId
    && value.type === expected.type
    && (expected.requestId === undefined || value.requestId === expected.requestId)
}

export function createPageBridgeChannelId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`
}
