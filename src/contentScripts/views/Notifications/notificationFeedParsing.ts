import type { NotificationApiResponse } from '~/background/notificationJson'

import type { NotificationErrorKind } from './composables/notificationFeedState'
import type { DisplayNotification } from './notification'
import {
  asNotificationRecord,
  toNotificationIdentifier,
  transformAtNotification,
  transformLikeNotification,
  transformReplyNotification,
} from './notification'
import type { NativeNotificationSection } from './notificationSections'

export interface NotificationPageParams {
  id?: string
  reply_time?: number
  at_time?: number
  like_time?: number
}

export interface NotificationPageResult {
  items: DisplayNotification[]
  cursorId: string
  cursorTime: number
  noMore: boolean
}

export interface NotificationPageParseResult {
  page?: NotificationPageResult
  errorKind?: NotificationErrorKind
}

export function classifyApiError(response: NotificationApiResponse): NotificationErrorKind | null {
  if (response.bewlyError)
    return response.bewlyError.kind
  if (response.code === 0)
    return null
  if (response.code === -101)
    return 'login-required'
  if (response.code === -412 || response.code === -403)
    return 'risk-control'
  return 'api-error'
}

export function dedupeNotifications(items: DisplayNotification[]): DisplayNotification[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (seen.has(item.id))
      return false
    seen.add(item.id)
    return true
  })
}

export function parseCursorResult(
  cursor: Record<string, unknown>,
  items: DisplayNotification[],
): NotificationPageResult | null {
  const cursorTime = typeof cursor.time === 'number' && Number.isFinite(cursor.time)
    ? cursor.time
    : 0
  const cursorId = toNotificationIdentifier(cursor.id)
  const noMore = cursor.is_end === true || cursor.is_end === 1
  if (!noMore && (!cursorId || cursorTime <= 0))
    return null

  return { items, cursorId, cursorTime, noMore }
}

export function parseReplyPage(data: Record<string, unknown>): NotificationPageResult | null {
  const cursor = asNotificationRecord(data.cursor)
  const rawItems = data.items
  if (!cursor || (rawItems !== undefined && rawItems !== null && !Array.isArray(rawItems)))
    return null

  const lastViewAt = typeof data.last_view_at === 'number' && Number.isFinite(data.last_view_at)
    ? data.last_view_at
    : 0
  const items = dedupeNotifications((Array.isArray(rawItems) ? rawItems : [])
    .map(transformReplyNotification)
    .filter((item): item is DisplayNotification => item !== null)
    .map(item => ({
      ...item,
      unread: item.timestamp > lastViewAt,
    })))

  return parseCursorResult(cursor, items)
}

export function parseAtPage(data: Record<string, unknown>): NotificationPageResult | null {
  const cursor = asNotificationRecord(data.cursor)
  const rawItems = data.items
  if (!cursor || (rawItems !== undefined && rawItems !== null && !Array.isArray(rawItems)))
    return null

  const lastViewAt = typeof data.last_view_at === 'number' && Number.isFinite(data.last_view_at)
    ? data.last_view_at
    : 0
  const items = dedupeNotifications((Array.isArray(rawItems) ? rawItems : [])
    .map(transformAtNotification)
    .filter((item): item is DisplayNotification => item !== null)
    .map(item => ({
      ...item,
      unread: item.timestamp > lastViewAt,
    })))

  return parseCursorResult(cursor, items)
}

export function mergeLikeItems(
  latestItems: DisplayNotification[],
  totalItems: DisplayNotification[],
): DisplayNotification[] {
  const totalById = new Map(totalItems.map(item => [item.id, item]))
  const consumed = new Set<string>()
  const mergedLatest = latestItems.map((latestItem) => {
    consumed.add(latestItem.id)
    const totalItem = totalById.get(latestItem.id)
    return totalItem
      ? { ...latestItem, ...totalItem, unread: latestItem.unread }
      : latestItem
  })

  return dedupeNotifications([
    ...mergedLatest,
    ...totalItems.filter(item => !consumed.has(item.id)),
  ])
}

export function parseLikePage(data: Record<string, unknown>): NotificationPageResult | null {
  const latest = asNotificationRecord(data.latest)
  const total = asNotificationRecord(data.total)
  const cursor = asNotificationRecord(total?.cursor)
  const rawLatestItems = latest?.items
  const rawTotalItems = total?.items
  if (
    !total
    || !cursor
    || (rawLatestItems !== undefined && rawLatestItems !== null && !Array.isArray(rawLatestItems))
    || (rawTotalItems !== undefined && rawTotalItems !== null && !Array.isArray(rawTotalItems))
  ) {
    return null
  }

  const lastViewAt = typeof latest?.last_view_at === 'number' && Number.isFinite(latest.last_view_at)
    ? latest.last_view_at
    : 0
  const latestItems = dedupeNotifications((Array.isArray(rawLatestItems) ? rawLatestItems : [])
    .map(transformLikeNotification)
    .filter((item): item is DisplayNotification => item !== null)
    .map(item => ({
      ...item,
      unread: lastViewAt === 0 || item.timestamp > lastViewAt,
    })))
  const totalItems = dedupeNotifications((Array.isArray(rawTotalItems) ? rawTotalItems : [])
    .map(transformLikeNotification)
    .filter((item): item is DisplayNotification => item !== null)
    .map(item => ({ ...item, unread: false })))

  return parseCursorResult(cursor, mergeLikeItems(latestItems, totalItems))
}

export function parseNotificationPage(
  section: NativeNotificationSection,
  value: unknown,
): NotificationPageParseResult {
  const response = asNotificationRecord(value) as NotificationApiResponse | null
  if (!response || typeof response.code !== 'number')
    return { errorKind: 'invalid-response' }

  const apiError = classifyApiError(response)
  if (apiError)
    return { errorKind: apiError }

  const data = asNotificationRecord(response.data)
  if (!data)
    return { errorKind: 'invalid-response' }

  const page = section === 'reply'
    ? parseReplyPage(data)
    : section === 'at'
      ? parseAtPage(data)
      : parseLikePage(data)
  return page ? { page } : { errorKind: 'invalid-response' }
}

export function buildNextPageParams(
  section: NativeNotificationSection,
  cursorId: string,
  cursorTime: number,
): NotificationPageParams {
  if (section === 'reply')
    return { id: cursorId, reply_time: cursorTime }
  if (section === 'at')
    return { id: cursorId, at_time: cursorTime }
  return { id: cursorId, like_time: cursorTime }
}
