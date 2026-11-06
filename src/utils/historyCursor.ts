import type { Cursor, List as HistoryItem } from '~/models/history/history'

export type HistoryCursor = Pick<Cursor, 'max' | 'view_at' | 'business'>

export function historyReadKey(item: HistoryItem) {
  return `${item.history.business}:${item.history.oid}:${item.view_at}`
}

export function readHistoryCursor(value: Cursor, previous: HistoryCursor, seen: Set<string>, empty: boolean, start?: number) {
  if (!value || !Number.isSafeInteger(value.max) || !Number.isFinite(value.view_at) || typeof value.business !== 'string')
    throw new Error('History cursor unavailable')
  const cursor = { max: value.max, view_at: value.view_at, business: value.business }
  const ended = (empty && value.max === 0 && value.view_at === 0) || (start !== undefined && value.view_at < start)
  const key = JSON.stringify(cursor)
  const stalled = !ended && (key === JSON.stringify(previous) || seen.has(key) || value.view_at <= 0)
  return { cursor, ended, stalled, key }
}
