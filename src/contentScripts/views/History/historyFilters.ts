import type { List as HistoryItem } from '~/models/history/history'

export type HistoryContentFilter = 'all' | 'archive' | 'pgc' | 'live' | 'article'

export function historyDateBounds(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match)
    return undefined
  const [, year, month, day] = match.map(Number)
  const start = new Date(year, month - 1, day)
  if (start.getFullYear() !== year || start.getMonth() !== month - 1 || start.getDate() !== day)
    return undefined
  return { start: Math.floor(start.getTime() / 1000), end: Math.floor(new Date(year, month - 1, day + 1).getTime() / 1000) - 1 }
}

export function matchesHistoryFilters(item: HistoryItem, type: HistoryContentFilter, bounds?: ReturnType<typeof historyDateBounds>) {
  const business = item.history.business
  return (type === 'all' || business === type || (type === 'article' && business === 'article-list'))
    && (!bounds || (item.view_at >= bounds.start && item.view_at <= bounds.end))
}
