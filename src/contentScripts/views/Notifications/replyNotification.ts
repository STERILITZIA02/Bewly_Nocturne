import { buildOriginalNotificationUrl } from '~/utils/notificationRoute'

export interface DisplayReplyNotification {
  id: string
  actor: {
    id: string
    name: string
    avatar: string
  }
  body: string
  quote: string
  sourceTitle: string
  sourceImage: string
  sourceUrl: string
  originalUrl: string
  timestamp: number
  unread: boolean
}

type UnknownRecord = Record<string, unknown>

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === 'object' ? value as UnknownRecord : null
}

function toText(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function toIdentifier(value: unknown): string {
  if (typeof value === 'string')
    return value
  if (typeof value === 'number' && Number.isFinite(value))
    return String(value)
  return ''
}

function toTimestamp(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0)
    return 0

  return Number.isFinite(new Date(value * 1000).getTime()) ? value : 0
}

export function sanitizeReplyUrl(value: unknown): string {
  if (typeof value !== 'string' || !value.trim())
    return ''

  try {
    const normalized = value.startsWith('//') ? `https:${value}` : value
    const url = new URL(normalized, 'https://www.bilibili.com/')
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : ''
  }
  catch {
    return ''
  }
}

export function transformReplyNotification(raw: unknown): DisplayReplyNotification | null {
  const record = asRecord(raw)
  if (!record)
    return null

  const id = toIdentifier(record.id)
  if (!id)
    return null

  const user = asRecord(record.user)
  const item = asRecord(record.item)
  const timestamp = toTimestamp(record.reply_time)

  return {
    id,
    actor: {
      id: toIdentifier(user?.mid),
      name: toText(user?.nickname) || toText(user?.uname) || toText(user?.name),
      avatar: sanitizeReplyUrl(user?.avatar || user?.face),
    },
    body: toText(item?.source_content) || toText(record.message),
    quote: toText(item?.target_reply_content),
    sourceTitle: toText(item?.title) || toText(item?.desc) || toText(item?.business),
    sourceImage: sanitizeReplyUrl(item?.image),
    sourceUrl: sanitizeReplyUrl(item?.uri),
    originalUrl: buildOriginalNotificationUrl('reply'),
    timestamp,
    unread: record.unread === true,
  }
}
