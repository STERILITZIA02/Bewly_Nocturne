import { buildBewlyNotificationUrl } from './notificationRoute'

export type PrivateConversationSessionType = 1 | 2

export interface PrivateConversationRoute {
  talkerId: string
  sessionType: PrivateConversationSessionType
}

export const PRIVATE_CONVERSATION_ROUTE_PARAMS = {
  talkerId: 'notificationTalker',
  sessionType: 'notificationSessionType',
} as const

export const PRIVATE_CONVERSATION_HISTORY_STATE_KEY = 'bewlyPrivateConversation'

const KNOWN_PRIVATE_SESSION_TYPES = new Set<PrivateConversationSessionType>([1, 2])
const DECIMAL_IDENTIFIER_PATTERN = /^\d+$/
const PRIVATE_CONVERSATION_BASE_URL = buildBewlyNotificationUrl('whisper')

function toUrl(url: string | URL): URL | null {
  try {
    return url instanceof URL ? new URL(url.href) : new URL(url)
  }
  catch {
    return null
  }
}

export function isPrivateConversationSessionType(value: unknown): value is PrivateConversationSessionType {
  return typeof value === 'number'
    && Number.isSafeInteger(value)
    && KNOWN_PRIVATE_SESSION_TYPES.has(value as PrivateConversationSessionType)
}

function parseSessionType(value: string | null): PrivateConversationSessionType | null {
  if (!value || !DECIMAL_IDENTIFIER_PATTERN.test(value))
    return null
  const sessionType = Number(value)
  return isPrivateConversationSessionType(sessionType)
    ? sessionType as PrivateConversationSessionType
    : null
}

function parseTalkerId(value: string | null): string | null {
  return value && DECIMAL_IDENTIFIER_PATTERN.test(value) ? value : null
}

export function parsePrivateConversationRoute(
  url: string | URL,
): PrivateConversationRoute | null {
  const parsedUrl = toUrl(url)
  if (
    !parsedUrl
    || parsedUrl.searchParams.get('page') !== 'Notifications'
    || parsedUrl.searchParams.get('notificationView') !== 'whisper'
  ) {
    return null
  }

  const talkerId = parseTalkerId(
    parsedUrl.searchParams.get(PRIVATE_CONVERSATION_ROUTE_PARAMS.talkerId),
  )
  const sessionType = parseSessionType(
    parsedUrl.searchParams.get(PRIVATE_CONVERSATION_ROUTE_PARAMS.sessionType),
  )
  return talkerId && sessionType !== null ? { talkerId, sessionType } : null
}

export function buildPrivateConversationUrl(route: PrivateConversationRoute): string {
  const talkerId = parseTalkerId(route.talkerId)
  const sessionType = parseSessionType(String(route.sessionType))
  if (!talkerId || sessionType === null)
    return PRIVATE_CONVERSATION_BASE_URL

  const url = new URL(PRIVATE_CONVERSATION_BASE_URL)
  url.searchParams.set(PRIVATE_CONVERSATION_ROUTE_PARAMS.talkerId, talkerId)
  url.searchParams.set(PRIVATE_CONVERSATION_ROUTE_PARAMS.sessionType, String(sessionType))
  return url.toString()
}

export function clearPrivateConversationRoute(url: string | URL): string {
  const parsedUrl = toUrl(url) ?? new URL(PRIVATE_CONVERSATION_BASE_URL)
  parsedUrl.searchParams.delete(PRIVATE_CONVERSATION_ROUTE_PARAMS.talkerId)
  parsedUrl.searchParams.delete(PRIVATE_CONVERSATION_ROUTE_PARAMS.sessionType)
  return parsedUrl.toString()
}

export function createPrivateConversationHistoryState(state: unknown): Record<string, unknown> {
  const currentState = state && typeof state === 'object'
    ? state as Record<string, unknown>
    : {}
  return {
    ...currentState,
    [PRIVATE_CONVERSATION_HISTORY_STATE_KEY]: true,
  }
}

export function isPrivateConversationHistoryState(state: unknown): boolean {
  return Boolean(
    state
    && typeof state === 'object'
    && (state as Record<string, unknown>)[PRIVATE_CONVERSATION_HISTORY_STATE_KEY] === true,
  )
}

export function clearPrivateConversationHistoryState(state: unknown): Record<string, unknown> {
  const currentState = state && typeof state === 'object'
    ? { ...state as Record<string, unknown> }
    : {}
  delete currentState[PRIVATE_CONVERSATION_HISTORY_STATE_KEY]
  return currentState
}
