import type { NotificationApiResponse } from '~/background/notificationJson'
import { debugLog } from '~/utils/debug'

import type { NotificationPageParams } from './notificationFeedParsing'
import {
  buildSystemPageResponse,
  classifyApiError,
  parseSystemHistoryPage,
  parseSystemInitialPage,
} from './notificationFeedParsing'

interface SystemNotificationPageDependencies {
  fetchUnified: () => Promise<unknown>
  fetchUser: () => Promise<unknown>
  fetchHistory: (cursor: string) => Promise<unknown>
  markRead: (cursor: string) => Promise<unknown>
}

function asNotificationApiResponse(value: unknown): NotificationApiResponse | null {
  return value !== null
    && typeof value === 'object'
    && typeof Reflect.get(value, 'code') === 'number'
    ? value as NotificationApiResponse
    : null
}

function invalidSystemResponse(): NotificationApiResponse {
  return { code: 0, data: null }
}

function reportSystemResponse(
  endpointName: 'unified' | 'user' | 'history' | 'update-cursor',
  response: NotificationApiResponse | null,
) {
  if (!import.meta.env?.DEV)
    return

  const data = response?.data
  const dataRecord = data !== null && typeof data === 'object' && !Array.isArray(data)
    ? data as Record<string, unknown>
    : null
  const itemCount = Array.isArray(data)
    ? data.length
    : Array.isArray(dataRecord?.system_notify_list)
      ? dataRecord.system_notify_list.length
      : null

  debugLog('[Bewly Nocturne][System notifications] response', {
    endpointName,
    code: response?.code ?? null,
    errorKind: response?.bewlyError?.kind ?? null,
    httpStatus: response?.bewlyError?.httpStatus ?? null,
    dataShape: Array.isArray(data) ? 'array' : data === null ? 'null' : typeof data,
    itemCount,
  })
}

export function createSystemNotificationPageFetcher(
  dependencies: SystemNotificationPageDependencies,
) {
  return async (params?: NotificationPageParams): Promise<unknown> => {
    if (params?.cursor) {
      const response = asNotificationApiResponse(await dependencies.fetchHistory(params.cursor))
      reportSystemResponse('history', response)
      if (!response || classifyApiError(response))
        return response ?? invalidSystemResponse()
      const page = parseSystemHistoryPage(response)
      return page ? buildSystemPageResponse(page) : invalidSystemResponse()
    }

    const [unifiedValue, userValue] = await Promise.all([
      dependencies.fetchUnified(),
      dependencies.fetchUser(),
    ])
    const unifiedResponse = asNotificationApiResponse(unifiedValue)
    const userResponse = asNotificationApiResponse(userValue)
    reportSystemResponse('unified', unifiedResponse)
    reportSystemResponse('user', userResponse)
    if (!unifiedResponse || !userResponse)
      return invalidSystemResponse()
    if (classifyApiError(unifiedResponse))
      return unifiedResponse
    if (classifyApiError(userResponse))
      return userResponse

    const page = parseSystemInitialPage(unifiedResponse, userResponse)
    if (!page)
      return invalidSystemResponse()
    if (page.readCursor) {
      const readResponse = asNotificationApiResponse(await dependencies.markRead(page.readCursor))
      reportSystemResponse('update-cursor', readResponse)
      if (!readResponse)
        return invalidSystemResponse()
      if (classifyApiError(readResponse))
        return readResponse
    }
    return buildSystemPageResponse(page, Boolean(page.readCursor))
  }
}
