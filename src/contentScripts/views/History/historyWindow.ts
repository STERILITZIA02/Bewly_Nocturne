import type { List as HistoryItem } from '~/models/history/history'

export interface HistoryDayGroup { key: string, label: string, items: HistoryItem[] }
export type HistoryWindowCell
  = | { kind: 'heading', key: string, groupKey: string, label: string, first: boolean, expanded: boolean }
    | { kind: 'item', key: string, item: HistoryItem, date: string }
    | { kind: 'padding', key: string }

export function historyItemKey(item: HistoryItem) {
  return `${item.history.business}:${item.history.oid}:${item.kid}:${item.view_at}`
}

export function historyDayKey(item: HistoryItem) {
  const date = new Date(item.view_at * 1000)
  return Number.isFinite(date.getTime()) ? `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}` : 'unknown'
}

/**
 * Heading rows span all columns. Alignment cells occupy metric slots only,
 * so dates and cards share the existing window and stable per-item anchors.
 */
export function createHistoryWindow(groups: HistoryDayGroup[], columns: number, collapsed: ReadonlySet<string> = new Set()): HistoryWindowCell[] {
  const cells: HistoryWindowCell[] = []
  const count = Number.isFinite(columns) ? Math.max(1, Math.floor(columns)) : 1
  const occurrences = new Map<string, number>()
  function pad(key: string) {
    while (cells.length % count)
      cells.push({ kind: 'padding', key: `${key}:padding:${cells.length % count}` })
  }
  for (const group of groups) {
    if (!group.items.length)
      continue
    cells.push({ kind: 'heading', key: `date:${group.key}`, groupKey: group.key, label: group.label, first: cells.length === 0, expanded: !collapsed.has(group.key) })
    pad(`date:${group.key}`)
    if (collapsed.has(group.key))
      continue
    for (const item of group.items) {
      const identity = historyItemKey(item)
      const occurrence = occurrences.get(identity) ?? 0
      occurrences.set(identity, occurrence + 1)
      cells.push({ kind: 'item', key: `item:${identity}${occurrence ? `:${occurrence}` : ''}`, item, date: group.label })
    }
    pad(`end:${group.key}`)
  }
  return cells
}
