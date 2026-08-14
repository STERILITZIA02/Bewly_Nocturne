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
  capabilities: PrivateSessionCapabilities
  original: RawSessionReference
}

export type PrivateSessionFilter = 'all' | 'unread' | 'pinned'

export interface PrivateSessionFilterOptions {
  filter: PrivateSessionFilter
  query: string
}

interface PrivateUserCard {
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

function extractPrivateUserCards(response: unknown): PrivateUserCard[] {
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
  if (session.is_intercept !== 0)
    return 'intercepted-user'
  if (session.can_fold !== 0 || session.is_follow === 0)
    return 'unfollowed-user'
  return 'user'
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
    if (!talkerId || seen.has(talkerId))
      continue
    seen.add(talkerId)

    const card = cards.get(talkerId)
    const accountInfo = session.account_info
    const kind = classifyPrivateSession(session)
    result.push({
      key: `${session.session_type}:${talkerId}`,
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
  const incomingIds = new Set(incoming.map(item => item.talkerId))
  return [
    ...incoming,
    ...current.filter(item => !incomingIds.has(item.talkerId)),
  ]
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
    return !query || item.name.toLocaleLowerCase().includes(query)
  })
}

export function isNativePrivateSession(session: DisplayPrivateSession): boolean {
  return session.capabilities.canReadNative
}

export function normalizePrivateSessionLocale(locale: string): string {
  return locale === 'jyut' ? 'zh-HK' : locale
}
