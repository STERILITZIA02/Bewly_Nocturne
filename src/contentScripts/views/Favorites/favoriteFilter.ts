import type { Media as FavoriteItem } from '~/models/video/favorite'

import { matchesFavoriteQuery } from './favoriteSearch'

export interface FavoriteFilterQuery {
  mids: number[]
  tids: number[]
}

export interface FavoritePartitionOption {
  tid: number
  name: string
  count: number
}

export interface FavoriteUploaderOption {
  mid: number
  name: string
  face?: string
  count: number
}

export interface FavoriteFilterRecord {
  item: FavoriteItem
  sourceId: number
  tid: number | null
}

// The search field's text is the title condition; the funnel adds a partition
// and the uploader strip an uploader.
export const EMPTY_FAVORITE_FILTER: FavoriteFilterQuery = Object.freeze({ mids: [], tids: [] }) as FavoriteFilterQuery

function uniqueSortedIds(values: readonly unknown[]): number[] {
  return [...new Set(values.map(Number).filter(value => Number.isSafeInteger(value) && value !== 0))].sort((a, b) => a - b)
}

export function normalizeFavoriteFilterQuery(value: Partial<FavoriteFilterQuery> | null | undefined): FavoriteFilterQuery {
  return {
    mids: uniqueSortedIds(value?.mids ?? []).filter(mid => mid > 0),
    tids: uniqueSortedIds(value?.tids ?? []),
  }
}

export function isFavoriteFilterActive(query: FavoriteFilterQuery): boolean {
  return query.mids.length > 0 || query.tids.length > 0
}

export function getFavoriteFilterKey(query: FavoriteFilterQuery): string {
  return JSON.stringify([query.mids, query.tids])
}

export function isSameFavoriteFilter(left: FavoriteFilterQuery, right: FavoriteFilterQuery): boolean {
  return getFavoriteFilterKey(left) === getFavoriteFilterKey(right)
}

export function compileFavoriteFilter(query: FavoriteFilterQuery, normalQuery: string) {
  const mids = new Set(query.mids)
  const tids = new Set(query.tids)
  const searchText = normalQuery.trim()
  return (record: FavoriteFilterRecord): boolean => {
    if (mids.size && !mids.has(Number(record.item.upper?.mid)))
      return false
    if (tids.size && (record.tid === null || !tids.has(record.tid)))
      return false
    return !searchText || matchesFavoriteQuery(searchText, record.item.title, record.item.upper?.name)
  }
}

export function getFavoriteFilterRecordKey(sourceId: number, resourceKey: string): string {
  return `${sourceId}:${resourceKey}`
}

export function parseFavoritePartitions(response: unknown): FavoritePartitionOption[] | null {
  if (!response || typeof response !== 'object')
    return null
  const value = response as { code?: unknown, data?: unknown }
  if (value.code !== 0 || (value.data !== null && !Array.isArray(value.data)))
    return null
  return (value.data ?? []).flatMap((entry) => {
    const record = entry as { tid?: unknown, name?: unknown, count?: unknown }
    const tid = Number(record.tid)
    const count = Number(record.count)
    if (!Number.isSafeInteger(tid) || tid === 0 || typeof record.name !== 'string' || !Number.isSafeInteger(count) || count < 0)
      return []
    return [{ tid, name: record.name, count }]
  })
}

export function mergeFavoritePartitions(groups: readonly FavoritePartitionOption[][]): FavoritePartitionOption[] {
  const merged = new Map<number, FavoritePartitionOption>()
  for (const group of groups) {
    for (const option of group) {
      const existing = merged.get(option.tid)
      merged.set(option.tid, existing ? { ...existing, count: existing.count + option.count } : { ...option })
    }
  }
  return [...merged.values()].sort((a, b) => b.count - a.count || a.tid - b.tid)
}

export function collectFavoriteUploaders(items: Iterable<FavoriteItem>, limit = 60): FavoriteUploaderOption[] {
  const uploaders = new Map<number, FavoriteUploaderOption>()
  for (const item of items) {
    const mid = Number(item.upper?.mid)
    if (!Number.isSafeInteger(mid) || mid <= 0)
      continue
    const existing = uploaders.get(mid)
    if (existing)
      existing.count++
    else
      uploaders.set(mid, { mid, name: item.upper.name || String(mid), face: item.upper.face || undefined, count: 1 })
  }
  return [...uploaders.values()].sort((a, b) => b.count - a.count || a.mid - b.mid).slice(0, limit)
}
