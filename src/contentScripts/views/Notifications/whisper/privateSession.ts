import type { PrivateSession } from '~/background/privateMessage/types'

export type RawSessionReference = Readonly<PrivateSession>

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
  const rawCards = root?.code === 0 && Array.isArray(root.data) ? root.data : []
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

export function collectPrivateSessionUids(sessions: PrivateSession[]): string[] {
  const seen = new Set<string>()
  const uids: string[] = []
  for (const session of sessions) {
    if (session.session_type !== 1 || !session.talker_id || seen.has(session.talker_id))
      continue
    seen.add(session.talker_id)
    uids.push(session.talker_id)
  }
  return uids
}

export function transformPrivateSessions(
  sessions: PrivateSession[],
  userCardsResponse: unknown,
): DisplayPrivateSession[] {
  const cards = new Map(extractPrivateUserCards(userCardsResponse).map(card => [card.mid, card]))
  const seen = new Set<string>()
  const result: DisplayPrivateSession[] = []

  for (const session of sessions) {
    const talkerId = session.talker_id
    if (!talkerId || seen.has(talkerId))
      continue
    seen.add(talkerId)

    const card = cards.get(talkerId)
    result.push({
      key: `${session.session_type}:${talkerId}`,
      talkerId,
      sessionType: session.session_type,
      name: card?.name || session.group_name || '',
      avatar: card?.avatar || normalizeHttpUrl(session.group_cover),
      summary: summarizePrivateMessage(session),
      timestamp: session.session_ts,
      unreadCount: Math.max(0, session.unread_count || 0),
      ackSeqno: session.ack_seqno,
      maxSeqno: session.max_seqno,
      pinned: session.top_ts > 0,
      muted: session.is_dnd !== 0,
      followed: session.is_follow !== 0,
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
  return (
    session.sessionType === 1
    && session.followed
    && session.original.can_fold === 0
    && session.original.group_type === 0
  )
}

export function normalizePrivateSessionLocale(locale: string): string {
  return locale === 'jyut' ? 'zh-HK' : locale
}
