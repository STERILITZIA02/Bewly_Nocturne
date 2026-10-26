import type { HistoryGroupInterval } from '~/logic/storage'
import type { List as HistoryItem } from '~/models/history/history'

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

export function historyDayKey(item: HistoryItem) {
  const date = new Date(item.view_at * 1000)
  return Number.isFinite(date.getTime()) ? dayKeyOf(date) : 'unknown'
}

/** Groups in the order the (sorted) records first reach them. */
export function groupHistoryItems(items: readonly HistoryItem[], interval: HistoryGroupInterval): HistoryGroup[] {
  const hours = INTERVAL_HOURS[interval]
  const groups = new Map<string, HistoryGroup>()
  for (const item of items) {
    const date = new Date(item.view_at * 1000)
    const valid = Number.isFinite(date.getTime())
    const dayKey = valid ? dayKeyOf(date) : 'unknown'
    const hour = valid ? Math.floor(date.getHours() / hours) * hours : 0
    const key = !valid || hours === 24 ? dayKey : `${dayKey}T${hour}`
    let group = groups.get(key)
    if (!group) {
      group = { key, dayKey, start: valid ? new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour) : null, hours, items: [] }
      groups.set(key, group)
    }
    group.items.push(item)
  }
  return [...groups.values()]
}

/** The hours a group covers, as `08:00–16:00`; empty for a whole day. */
export function historyGroupHours(group: HistoryGroup) {
  if (!group.start || group.hours === 24)
    return ''
  const hour = group.start.getHours()
  const format = (value: number) => `${String(value).padStart(2, '0')}:00`
  return `${format(hour)}–${format(hour + group.hours)}`
}
