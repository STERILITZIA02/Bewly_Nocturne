import type { NotificationApiResponse } from '~/background/notificationJson'
import { buildOriginalNotificationUrl } from '~/utils/notificationRoute'

import type { NotificationErrorKind } from './composables/notificationFeedState'
import type {
  DisplayNotification,
  DisplaySystemNotificationSegment,
  InteractionNotification,
  SystemNotification,
} from './notification'
import {
  asNotificationRecord,
  sanitizeNotificationUrl,
  toNotificationIdentifier,
  toNotificationText,
  transformAtNotification,
  transformLikeNotification,
  transformReplyNotification,
} from './notification'
import type { NativeNotificationSection } from './notificationSections'

export interface NotificationPageParams {
  cursor?: string
  id?: string
  reply_time?: number
  at_time?: number
  like_time?: number
}

export interface SystemInitialPageResult extends NotificationPageResult {
  items: SystemNotification[]
  readCursor: string
}

export interface NotificationPageResult {
  items: DisplayNotification[]
  cursorId: string
  cursorTime: number
  noMore: boolean
  serverReadCommitted?: boolean
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

function compareUnsignedIntegerStrings(left: string, right: string): number {
  const normalizedLeft = left.replace(/^0+(?=\d)/, '')
  const normalizedRight = right.replace(/^0+(?=\d)/, '')
  if (normalizedLeft.length !== normalizedRight.length)
    return normalizedLeft.length - normalizedRight.length
  return normalizedLeft.localeCompare(normalizedRight)
}

function toSystemTimestamp(value: unknown): number {
  let milliseconds = 0
  if (typeof value === 'number' && Number.isFinite(value)) {
    milliseconds = value
  }
  else if (typeof value === 'string' && value.trim()) {
    const normalized = value.trim()
    milliseconds = /^\d+(?:\.\d+)?$/.test(normalized)
      ? Number(normalized)
      : Date.parse(normalized)
  }

  if (!Number.isFinite(milliseconds) || milliseconds <= 0)
    return 0

  // The current message client passes `time_at` through `new Date(...)`. The
  // service normally returns milliseconds, while accepting a seconds value is
  // a safe compatibility path for older records and does not affect IDs.
  return Math.floor(milliseconds >= 100_000_000_000 ? milliseconds / 1000 : milliseconds)
}

function appendSystemTextSegment(
  segments: DisplaySystemNotificationSegment[],
  text: string,
) {
  if (!text)
    return
  const previous = segments.at(-1)
  if (previous?.type === 'text')
    previous.text += text
  else
    segments.push({ type: 'text', text })
}

function parseSystemPlainSegments(value: string): DisplaySystemNotificationSegment[] {
  const segments: DisplaySystemNotificationSegment[] = []
  const pattern = /https?:\/\/[^\s<>{}]+|\b(?:BV[0-9A-Za-z]+|av\d+|cv\d+|vc\d+)\b/g
  let cursor = 0
  for (const match of value.matchAll(pattern)) {
    const index = match.index ?? 0
    appendSystemTextSegment(segments, value.slice(cursor, index))
    const raw = match[0]
    const href = raw.startsWith('http')
      ? sanitizeNotificationUrl(raw)
      : raw.startsWith('cv')
        ? sanitizeNotificationUrl(`https://www.bilibili.com/read/${raw}`)
        : raw.startsWith('vc')
          ? sanitizeNotificationUrl(`https://t.bilibili.com/${raw.slice(2)}`)
          : sanitizeNotificationUrl(`https://www.bilibili.com/video/${raw}`)
    if (href)
      segments.push({ type: 'link', text: raw, href })
    else
      appendSystemTextSegment(segments, raw)
    cursor = index + raw.length
  }
  appendSystemTextSegment(segments, value.slice(cursor))
  return segments
}

function unwrapSystemContent(value: string): string | null {
  if (!value.trim().startsWith('{') && !value.trim().startsWith('['))
    return value
  try {
    const parsed = JSON.parse(value)
    const record = asNotificationRecord(parsed)
    return toNotificationText(record?.web) || null
  }
  catch {
    return null
  }
}

export function parseSystemContentSegments(value: string): DisplaySystemNotificationSegment[] {
  const content = unwrapSystemContent(value)
  if (content === null)
    return []
  const segments: DisplaySystemNotificationSegment[] = []
  const legacyPattern = /#\{([^{}]+)\}\{("[^"]*"|[^{}]*)\}/g
  let cursor = 0
  for (const match of content.matchAll(legacyPattern)) {
    const index = match.index ?? 0
    segments.push(...parseSystemPlainSegments(content.slice(cursor, index)))
    const rawTarget = match[2] || ''
    let target = rawTarget
    if (rawTarget.startsWith('"')) {
      try {
        target = JSON.parse(rawTarget)
      }
      catch {
        target = ''
      }
    }
    const href = sanitizeNotificationUrl(target)
    if (href && /^https?:/i.test(target))
      segments.push({ type: 'link', text: match[1] || target, href })
    else
      appendSystemTextSegment(segments, match[0])
    cursor = index + match[0].length
  }
  segments.push(...parseSystemPlainSegments(content.slice(cursor)))
  return segments.length > 0 ? segments : content ? [{ type: 'text', text: content }] : []
}

function transformSystemNotification(raw: unknown): SystemNotification | null {
  const record = asNotificationRecord(raw)
  if (!record)
    return null
  const id = toNotificationIdentifier(record.id)
  const cursor = toNotificationIdentifier(record.cursor)
  const timestamp = toSystemTimestamp(record.time_at)
  if (!id || !cursor)
    return null

  const content = toNotificationText(record.content)
  return {
    kind: 'system',
    id,
    section: 'system',
    cursor,
    title: toNotificationText(record.title),
    content,
    segments: parseSystemContentSegments(content),
    source: '',
    sourceLogo: '',
    timestamp,
    cardTitle: '',
    cardCover: '',
    cardUrl: '',
    originalUrl: buildOriginalNotificationUrl('system'),
    unread: false,
  }
}

function readSystemInitialItems(response: NotificationApiResponse): unknown[] | null {
  if (classifyApiError(response))
    return null
  const data = asNotificationRecord(response.data)
  const rawItems = data?.system_notify_list
  return Array.isArray(rawItems) ? rawItems : null
}

export function parseSystemInitialPage(
  unifiedResponse: NotificationApiResponse,
  userResponse: NotificationApiResponse,
): SystemInitialPageResult | null {
  const unifiedItems = readSystemInitialItems(unifiedResponse)
  const userItems = readSystemInitialItems(userResponse)
  if (!unifiedItems || !userItems)
    return null

  const seen = new Set<string>()
  const items = [...unifiedItems, ...userItems]
    .map(transformSystemNotification)
    .filter((item): item is SystemNotification => item !== null)
    .sort((left, right) => compareUnsignedIntegerStrings(right.cursor, left.cursor))
    .filter((item) => {
      if (seen.has(item.id))
        return false
      seen.add(item.id)
      return true
    })
  if (unifiedItems.length + userItems.length > 0 && items.length === 0)
    return null
  const first = items[0]
  const last = items.at(-1)
  return {
    items,
    cursorId: last?.cursor ?? '',
    cursorTime: 0,
    noMore: items.length === 0,
    readCursor: first?.cursor ?? '',
  }
}

export function parseSystemHistoryPage(
  response: NotificationApiResponse,
): NotificationPageResult | null {
  if (classifyApiError(response) || !Array.isArray(response.data))
    return null
  const items = dedupeNotifications(response.data
    .map(transformSystemNotification)
    .filter((item): item is SystemNotification => item !== null))
  if (response.data.length > 0 && items.length === 0)
    return null
  const last = items.at(-1)
  return {
    items,
    cursorId: last?.kind === 'system' ? last.cursor : '',
    cursorTime: 0,
    noMore: response.data.length === 0,
  }
}

export function buildSystemPageResponse(
  page: NotificationPageResult,
  serverReadCommitted = false,
): NotificationApiResponse {
  return {
    code: 0,
    data: {
      system_native_page: true,
      items: page.items,
      cursor: page.cursorId,
      no_more: page.noMore,
      server_read_committed: serverReadCommitted,
    },
  }
}

function parseSystemNativePage(data: Record<string, unknown>): NotificationPageResult | null {
  if (data.system_native_page !== true || !Array.isArray(data.items))
    return null
  const items = data.items.filter((item): item is SystemNotification => (
    asNotificationRecord(item)?.kind === 'system'
    && asNotificationRecord(item)?.section === 'system'
    && typeof asNotificationRecord(item)?.id === 'string'
    && typeof asNotificationRecord(item)?.cursor === 'string'
  ))
  if (items.length !== data.items.length)
    return null
  const cursorId = toNotificationIdentifier(data.cursor)
  const noMore = data.no_more === true
  if (!noMore && !cursorId)
    return null
  return {
    items,
    cursorId,
    cursorTime: 0,
    noMore,
    serverReadCommitted: data.server_read_committed === true,
  }
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
    .filter((item): item is InteractionNotification => item !== null)
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
    .filter((item): item is InteractionNotification => item !== null)
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
    .filter((item): item is InteractionNotification => item !== null)
    .map(item => ({
      ...item,
      unread: lastViewAt === 0 || item.timestamp > lastViewAt,
    })))
  const totalItems = dedupeNotifications((Array.isArray(rawTotalItems) ? rawTotalItems : [])
    .map(transformLikeNotification)
    .filter((item): item is InteractionNotification => item !== null)
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
      : section === 'love'
        ? parseLikePage(data)
        : parseSystemNativePage(data)
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
  if (section === 'love')
    return { id: cursorId, like_time: cursorTime }
  return { cursor: cursorId }
}
