import type { HistoryGroupInterval } from '~/logic/storage'
import type { List as HistoryItem } from '~/models/history/history'

import type { HistorySortOrder } from './historyFilters'

export const HISTORY_GROUP_INTERVALS: readonly HistoryGroupInterval[] = ['hour', 'period', 'day']
const INTERVAL_HOURS: Record<HistoryGroupInterval, number> = { hour: 1, period: 8, day: 24 }

export interface HistoryGroup {
  key: string
  /** The day the group falls on, for the day strip. */
  dayKey: string
  /** Local start of the group, null for records without a valid time. */
  start: Date | null
  hours: number
  items: HistoryItem[]
}

export function historyItemKey(item: HistoryItem) {
  return `${item.history.business}:${item.history.oid}:${item.kid}:${item.view_at}`
}

function dayKeyOf(date: Date) {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`
}

function describeGroup(item: HistoryItem, interval: HistoryGroupInterval): Omit<HistoryGroup, 'items'> {
  const hours = INTERVAL_HOURS[interval]
  const date = new Date(item.view_at * 1000)
  const valid = Number.isFinite(date.getTime())
  const dayKey = valid ? dayKeyOf(date) : 'unknown'
  const hour = valid ? Math.floor(date.getHours() / hours) * hours : 0
  return { key: !valid || hours === 24 ? dayKey : `${dayKey}T${hour}`, dayKey, start: valid ? new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour) : null, hours }
}

/** The timeline sends committed additions/removals; untouched groups keep their arrays. */
export function createHistoryGroupIndex() {
  const groups = new Map<string, HistoryGroup>()
  const records = new Map<string, { item: HistoryItem, group: string }>()
  const resources = new Map<string, Set<string>>()
  let interval: HistoryGroupInterval = 'day'
  let order: HistorySortOrder = 'newest'
  let ordered: HistoryGroup[] = []
  const resourceKey = (item: HistoryItem) => `${item.history.business}_${item.history.oid}`
  // Stable sort plus a left-first merge keeps equal timestamps in source order.
  const compare = (a: HistoryItem, b: HistoryItem) => (order === 'oldest' ? a.view_at - b.view_at : b.view_at - a.view_at) || 0
  function publish() {
    const retained = ordered.flatMap(group => groups.get(group.key) ?? [])
    if (retained.length === groups.size) {
      ordered = retained
      return ordered
    }
    const previousKeys = new Set(retained.map(group => group.key))
    const added = [...groups.values()].filter(group => !previousKeys.has(group.key)).sort((a, b) => compare(a.items[0], b.items[0]))
    const next: HistoryGroup[] = []
    let left = 0
    let right = 0
    while (left < retained.length && right < added.length)
      next.push(compare(retained[left].items[0], added[right].items[0]) <= 0 ? retained[left++] : added[right++])
    next.push(...retained.slice(left), ...added.slice(right))
    ordered = next
    return ordered
  }
  function append(items: readonly HistoryItem[]) {
    if (!items.length)
      return ordered
    const additions = new Map<string, HistoryItem[]>()
    for (const item of items) {
      const key = historyItemKey(item)
      if (records.has(key))
        continue
      const info = describeGroup(item, interval)
      if (!groups.has(info.key))
        groups.set(info.key, { ...info, items: [] })
      records.set(key, { item, group: info.key })
      const resource = resourceKey(item)
      const keys = resources.get(resource) ?? new Set<string>()
      keys.add(key)
      resources.set(resource, keys)
      const pending = additions.get(info.key) ?? []
      pending.push(item)
      additions.set(info.key, pending)
    }
    for (const [key, added] of additions) {
      const group = groups.get(key)!
      added.sort(compare)
      if (!group.items.length || compare(group.items.at(-1)!, added[0]) <= 0) {
        groups.set(key, { ...group, items: [...group.items, ...added] })
        continue
      }
      if (compare(added.at(-1)!, group.items[0]) < 0) {
        groups.set(key, { ...group, items: [...added, ...group.items] })
        continue
      }
      const merged: HistoryItem[] = []
      let left = 0
      let right = 0
      while (left < group.items.length && right < added.length)
        merged.push(compare(group.items[left], added[right]) <= 0 ? group.items[left++] : added[right++])
      merged.push(...group.items.slice(left), ...added.slice(right))
      groups.set(key, { ...group, items: merged })
    }
    return additions.size ? publish() : ordered
  }
  function remove(keys: readonly string[]) {
    const affected = new Set<string>()
    for (const key of keys) {
      for (const recordKey of resources.get(key) ?? []) {
        const record = records.get(recordKey)!
        affected.add(record.group)
        records.delete(recordKey)
      }
      resources.delete(key)
    }
    for (const key of affected) {
      const group = groups.get(key)!
      const items = group.items.filter(item => records.has(historyItemKey(item)))
      if (items.length)
        groups.set(key, { ...group, items })
      else groups.delete(key)
    }
    return affected.size ? publish() : ordered
  }
  return {
    append,
    remove,
    get(key: string) {
      const id = resources.get(key)?.values().next().value
      return id ? records.get(id)?.item : undefined
    },
    reset(items: readonly HistoryItem[], nextInterval: HistoryGroupInterval, nextOrder: HistorySortOrder) {
      groups.clear()
      records.clear()
      resources.clear()
      interval = nextInterval
      order = nextOrder
      ordered = []
      return append(items)
    },
  }
}

/** The hours a group covers, as `08:00–16:00`; empty for a whole day. */
export function historyGroupHours(group: HistoryGroup) {
  if (!group.start || group.hours === 24)
    return ''
  const hour = group.start.getHours()
  const format = (value: number) => `${String(value).padStart(2, '0')}:00`
  return `${format(hour)}–${format(hour + group.hours)}`
}
