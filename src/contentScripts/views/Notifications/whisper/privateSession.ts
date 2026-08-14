import type { PrivateSession } from '~/background/privateMessage/types'

export type RawSessionReference = Readonly<PrivateSession>

export type PrivateSessionKind
  = | 'user'
    | 'official-assistant'
    | 'unfollowed-user'
    | 'intercepted-user'
    | 'fan-group'
    | 'system'
    | 'unsupported'

export type OfficialAssistantType
  = | 'streamer-assistant'
    | 'up-assistant'
    | 'payment-assistant'
    | 'customer-service'
    | 'official-assistant'

export interface PrivateSessionCapabilities {
  canReadNative: boolean
  canAck: boolean
  canSendText: boolean
  canSendImage: boolean
  canOpenProfile: boolean
  canOpenOriginal: boolean
  canPin: boolean
  canMute: boolean
  canRemove: boolean
}

export interface DisplayPrivateSession {
  key: string
  talkerId: string
  sessionType: number
  name: string
  avatar: string
  summary: string
  timestamp: number
  unreadCount: number
  ackSeqno: string
  maxSeqno: string
  pinned: boolean
  muted: boolean
  followed: boolean
  kind: PrivateSessionKind
  systemMessageType: number
  assistantType: OfficialAssistantType | null
  capabilities: PrivateSessionCapabilities
  original: RawSessionReference
}

export type PrivateSessionFilter = 'all' | 'unread' | 'pinned'
export type PrivateSessionTypeFilter = 'all' | 'user' | 'official-assistant' | 'other'

export interface PrivateSessionFilterOptions {
  filter: PrivateSessionFilter
  typeFilter: PrivateSessionTypeFilter
  query: string
}

export interface PrivateUserCard {
  avatar: string
  mid: string
  name: string
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function asString(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : ''
}

function normalizeHttpUrl(value: unknown): string {
  if (typeof value !== 'string' || !value)
    return ''
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : ''
  }
  catch {
    return ''
  }
}

export function extractPrivateUserCards(response: unknown): PrivateUserCard[] {
  const root = asRecord(response)
  if (root?.code !== 0)
    return []

  const data = root.data
  const dataRecord = asRecord(data)
  const rawCards = Array.isArray(data)
    ? data
    : Array.isArray(dataRecord?.cards)
      ? dataRecord.cards
      : dataRecord
        ? Object.values(dataRecord)
        : []
  return rawCards.flatMap((rawCard) => {
    const card = asRecord(rawCard)
    const mid = asString(card?.mid)
    if (!card || !mid)
      return []
    return [{
      mid,
      name: asString(card.name),
      avatar: normalizeHttpUrl(card.face ?? card.avatar),
    }]
  })
}

function summarizePrivateMessage(session: PrivateSession): string {
  const content = session.last_msg?.content?.trim() ?? ''
  if (!content)
    return ''

  try {
    const parsed = JSON.parse(content) as unknown
    const record = asRecord(parsed)
    const summary = asString(record?.content ?? record?.text).trim()
    return summary
  }
  catch {
    return content.startsWith('{') || content.startsWith('[') ? '' : content
  }
}

function classifyPrivateSession(session: PrivateSession): PrivateSessionKind {
  if (session.session_type !== 1)
    return session.session_type === 2 ? 'fan-group' : 'unsupported'
  if (session.system_msg_type > 0)
    return 'official-assistant'
  if (session.system_msg_type !== 0)
    return 'unsupported'
  if (session.is_intercept !== 0)
    return 'intercepted-user'
  if (session.can_fold !== 0 || session.is_follow === 0)
    return 'unfollowed-user'
  return 'user'
}

export function getOfficialAssistantType(systemMessageType: number): OfficialAssistantType | null {
  if (systemMessageType <= 0)
    return null
  if (systemMessageType === 1)
    return 'streamer-assistant'
  if (systemMessageType === 7)
    return 'up-assistant'
  if (systemMessageType === 8)
    return 'customer-service'
  if (systemMessageType === 9)
    return 'payment-assistant'
  return 'official-assistant'
}

function createPrivateSessionCapabilities(kind: PrivateSessionKind): PrivateSessionCapabilities {
  const isNativeReadable = kind === 'user' || kind === 'official-assistant'
  return {
    canReadNative: isNativeReadable,
    canAck: isNativeReadable,
    canSendText: false,
    canSendImage: false,
    canOpenProfile: kind === 'user',
    canOpenOriginal: true,
    canPin: false,
    canMute: false,
    canRemove: false,
  }
}

export function collectPrivateSessionUids(sessions: PrivateSession[]): string[] {
  const seen = new Set<string>()
  const uids: string[] = []
  for (const session of sessions) {
    if (
      session.session_type !== 1
      || session.system_msg_type > 0
      || !session.talker_id
      || seen.has(session.talker_id)
    ) {
      continue
    }
    seen.add(session.talker_id)
    uids.push(session.talker_id)
  }
  return uids
}

export function transformPrivateSessions(
  sessions: PrivateSession[],
  userCardsResponse: unknown | readonly unknown[],
  getFallbackName: (talkerId: string) => string = talkerId => talkerId,
): DisplayPrivateSession[] {
  const cardResponses = Array.isArray(userCardsResponse) ? userCardsResponse : [userCardsResponse]
  const cards = new Map(
    cardResponses.flatMap(extractPrivateUserCards).map(card => [card.mid, card]),
  )
  const seen = new Set<string>()
  const result: DisplayPrivateSession[] = []

  for (const session of sessions) {
    const talkerId = session.talker_id
    const key = `${session.session_type}:${talkerId}`
    if (!talkerId || seen.has(key))
      continue
    seen.add(key)

    const card = cards.get(talkerId)
    const accountInfo = session.account_info
    const kind = classifyPrivateSession(session)
    result.push({
      key,
      talkerId,
      sessionType: session.session_type,
      name: accountInfo?.name || card?.name || session.group_name || getFallbackName(talkerId),
      avatar: normalizeHttpUrl(accountInfo?.pic_url) || card?.avatar || normalizeHttpUrl(session.group_cover),
      summary: summarizePrivateMessage(session),
      timestamp: session.session_ts,
      unreadCount: Math.max(0, session.unread_count || 0),
      ackSeqno: session.ack_seqno,
      maxSeqno: session.max_seqno,
      pinned: session.top_ts > 0,
      muted: session.is_dnd !== 0,
      followed: session.is_follow !== 0,
      kind,
      systemMessageType: session.system_msg_type,
      assistantType: kind === 'official-assistant'
        ? getOfficialAssistantType(session.system_msg_type)
        : null,
      capabilities: createPrivateSessionCapabilities(kind),
      original: session,
    })
  }

  return result
}

export function mergePrivateSessions(
  current: DisplayPrivateSession[],
  incoming: DisplayPrivateSession[],
): DisplayPrivateSession[] {
  const incomingIds = new Set(incoming.map(item => item.key))
  return [
    ...incoming,
    ...current.filter(item => !incomingIds.has(item.key)),
  ]
}

export function appendPrivateSessions(
  current: DisplayPrivateSession[],
  incoming: DisplayPrivateSession[],
): DisplayPrivateSession[] {
  const incomingByKey = new Map(incoming.map(item => [item.key, item]))
  const currentKeys = new Set(current.map(item => item.key))
  return [
    ...current.map(item => incomingByKey.get(item.key) ?? item),
    ...incoming.filter(item => !currentKeys.has(item.key)),
  ]
}

export function getPrivateSessionTimeBounds(
  items: DisplayPrivateSession[],
): { newestSessionTs: number, oldestSessionTs: number } {
  const timestamps = items
    .map(item => item.timestamp)
    .filter(timestamp => Number.isFinite(timestamp) && timestamp > 0)
  return {
    newestSessionTs: timestamps.length > 0 ? Math.max(...timestamps) : 0,
    oldestSessionTs: timestamps.length > 0 ? Math.min(...timestamps) : 0,
  }
}

export function filterPrivateSessions(
  items: DisplayPrivateSession[],
  options: PrivateSessionFilterOptions,
): DisplayPrivateSession[] {
  const query = options.query.trim().toLocaleLowerCase()
  return items.filter((item) => {
    if (options.filter === 'unread' && item.unreadCount <= 0)
      return false
    if (options.filter === 'pinned' && !item.pinned)
      return false
    if (options.typeFilter === 'user' && item.kind !== 'user')
      return false
    if (options.typeFilter === 'official-assistant' && item.kind !== 'official-assistant')
      return false
    if (
      options.typeFilter === 'other'
      && (item.kind === 'user' || item.kind === 'official-assistant')
    ) {
      return false
    }
    return !query || item.name.toLocaleLowerCase().includes(query)
  })
}

export function getPrivateSessionProfileUrl(session: DisplayPrivateSession): string {
  if (!session.capabilities.canOpenProfile || !/^\d+$/.test(session.talkerId))
    return ''
  return `https://space.bilibili.com/${session.talkerId}`
}

export function isNativePrivateSession(session: DisplayPrivateSession): boolean {
  return session.capabilities.canReadNative
}

export function normalizePrivateSessionLocale(locale: string): string {
  return locale === 'jyut' ? 'zh-HK' : locale
}
