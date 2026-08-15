import { buildOriginalNotificationUrl } from '~/utils/notificationRoute'

import type { NativeNotificationSection } from './notificationSections'

export interface DisplayNotificationActor {
  id: string
  name: string
  avatar: string
}

export interface DisplayNotification {
  id: string
  section: NativeNotificationSection
  actors: DisplayNotificationActor[]
  actorCount: number
  actionTextKey: string
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

export function asNotificationRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === 'object' ? value as UnknownRecord : null
}

export function toNotificationText(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

export function toNotificationIdentifier(value: unknown): string {
  if (typeof value === 'string')
    return value
  if (typeof value === 'number' && Number.isFinite(value))
    return String(value)
  return ''
}

export function toNotificationTimestamp(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0)
    return 0

  return Number.isFinite(new Date(value * 1000).getTime()) ? value : 0
}

export function sanitizeNotificationUrl(value: unknown): string {
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

function transformActor(raw: unknown): DisplayNotificationActor | null {
  const actor = asNotificationRecord(raw)
  if (!actor)
    return null

  const id = toNotificationIdentifier(actor.mid || actor.id)
  const name = toNotificationText(actor.nickname) || toNotificationText(actor.uname) || toNotificationText(actor.name)
  const avatar = sanitizeNotificationUrl(actor.avatar || actor.face)
  return id || name || avatar ? { id, name, avatar } : null
}

function transformActors(raw: unknown): DisplayNotificationActor[] {
  if (!Array.isArray(raw))
    return []

  const seen = new Set<string>()
  const actors: DisplayNotificationActor[] = []
  for (const value of raw) {
    const actor = transformActor(value)
    if (!actor)
      continue

    const key = actor.id || `${actor.name}:${actor.avatar}`
    if (seen.has(key))
      continue
    seen.add(key)
    actors.push(actor)
    if (actors.length === 3)
      break
  }
  return actors
}

function toActorCount(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.max(Math.trunc(value), fallback)
    : fallback
}

export function transformReplyNotification(raw: unknown): DisplayNotification | null {
  const record = asNotificationRecord(raw)
  if (!record)
    return null

  const id = toNotificationIdentifier(record.id)
  if (!id)
    return null

  const user = asNotificationRecord(record.user)
  const item = asNotificationRecord(record.item)

  return {
    id,
    section: 'reply',
    actors: [{
      id: toNotificationIdentifier(user?.mid),
      name: toNotificationText(user?.nickname) || toNotificationText(user?.uname) || toNotificationText(user?.name),
      avatar: sanitizeNotificationUrl(user?.avatar || user?.face),
    }],
    actorCount: 1,
    actionTextKey: 'notifications.native.actions.reply',
    body: toNotificationText(item?.source_content) || toNotificationText(record.message),
    quote: toNotificationText(item?.target_reply_content),
    sourceTitle: toNotificationText(item?.title) || toNotificationText(item?.desc) || toNotificationText(item?.business),
    sourceImage: sanitizeNotificationUrl(item?.image),
    sourceUrl: sanitizeNotificationUrl(item?.uri),
    originalUrl: buildOriginalNotificationUrl('reply'),
    timestamp: toNotificationTimestamp(record.reply_time),
    unread: record.unread === true,
  }
}

export function transformAtNotification(raw: unknown): DisplayNotification | null {
  const record = asNotificationRecord(raw)
  if (!record)
    return null

  const id = toNotificationIdentifier(record.id)
  if (!id)
    return null

  const actor = transformActor(record.user)
  const item = asNotificationRecord(record.item)

  return {
    id,
    section: 'at',
    actors: actor ? [actor] : [],
    actorCount: 1,
    actionTextKey: 'notifications.native.actions.at',
    body: toNotificationText(item?.source_content) || toNotificationText(record.message),
    quote: toNotificationText(item?.target_reply_content),
    sourceTitle: toNotificationText(item?.title) || toNotificationText(item?.desc) || toNotificationText(item?.business),
    sourceImage: sanitizeNotificationUrl(item?.image),
    sourceUrl: sanitizeNotificationUrl(item?.uri),
    originalUrl: buildOriginalNotificationUrl('at'),
    timestamp: toNotificationTimestamp(record.at_time),
    unread: record.unread === true,
  }
}

export function transformLikeNotification(raw: unknown): DisplayNotification | null {
  const record = asNotificationRecord(raw)
  if (!record)
    return null

  const id = toNotificationIdentifier(record.id)
  if (!id)
    return null

  const actors = transformActors(record.users)
  const actorCount = toActorCount(record.counts, actors.length || 1)
  const item = asNotificationRecord(record.item)

  return {
    id,
    section: 'love',
    actors,
    actorCount,
    actionTextKey: actorCount > 1
      ? 'notifications.native.actions.love_multiple'
      : 'notifications.native.actions.love',
    body: toNotificationText(item?.target_reply_content) || toNotificationText(item?.source_content),
    quote: '',
    sourceTitle: toNotificationText(item?.title) || toNotificationText(item?.desc) || toNotificationText(item?.business),
    sourceImage: sanitizeNotificationUrl(item?.image),
    sourceUrl: sanitizeNotificationUrl(item?.uri),
    originalUrl: buildOriginalNotificationUrl('love'),
    timestamp: toNotificationTimestamp(record.like_time),
    unread: record.unread === true,
  }
}
