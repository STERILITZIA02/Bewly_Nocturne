import type { List as HistoryItem } from '~/models/history/history'

export type HistoryContentFilter = 'all' | 'archive' | 'pgc' | 'live' | 'article'
export type HistorySortOrder = 'newest' | 'oldest'
export interface HistoryFilters {
  duration: 'all' | 'short' | 'medium' | 'long' | 'extraLong'
  period: 'all' | 'today' | 'yesterday' | 'week' | 'custom'
  startDate: string
  endDate: string
  device: 'all' | 'pc' | 'phone' | 'tablet' | 'tv'
}
export function createHistoryFilters(): HistoryFilters {
  return { duration: 'all', period: 'all', startDate: '', endDate: '', device: 'all' }
}
export function hasHistoryFilters(filters: HistoryFilters) {
  return filters.duration !== 'all' || filters.period !== 'all' || filters.device !== 'all'
}

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

export function historyRangeBounds(filters: HistoryFilters, now = new Date()): ReturnType<typeof historyDateBounds> | null {
  if (filters.period === 'all')
    return undefined
  if (filters.period !== 'custom') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const end = new Date(start)
    end.setDate(end.getDate() + (filters.period === 'yesterday' ? 0 : 1))
    start.setDate(start.getDate() - (filters.period === 'week' ? 6 : filters.period === 'yesterday' ? 1 : 0))
    return { start: start.getTime() / 1000, end: end.getTime() / 1000 - 1 }
  }
  const start = filters.startDate ? historyDateBounds(filters.startDate) : undefined
  const end = filters.endDate ? historyDateBounds(filters.endDate) : undefined
  if ((filters.startDate && !start) || (filters.endDate && !end) || (start && end && start.start > end.end))
    return null
  return { start: start?.start ?? -Infinity, end: end?.end ?? Infinity }
}

const HISTORY_DEVICE_CODES = { pc: [2], phone: [1, 3, 5, 7], tablet: [4, 6], tv: [33] } as const
export function matchesHistoryFilters(item: HistoryItem, type: HistoryContentFilter, bounds?: ReturnType<typeof historyDateBounds>, filters?: HistoryFilters) {
  const business = item.history.business
  if (filters?.device && filters.device !== 'all' && !(HISTORY_DEVICE_CODES[filters.device] as readonly number[]).includes(item.history.dt))
    return false
  if (filters?.duration && filters.duration !== 'all') {
    const duration = item.duration
    if (!['archive', 'pgc'].includes(business) || !Number.isFinite(duration) || duration <= 0)
      return false
    if (!(filters.duration === 'short' ? duration <= 600 : filters.duration === 'medium' ? duration > 600 && duration <= 1800 : filters.duration === 'long' ? duration > 1800 && duration <= 3600 : duration > 3600))
      return false
  }
  return (type === 'all' || business === type || (type === 'article' && business === 'article-list'))
    && (!bounds || (item.view_at >= bounds.start && item.view_at <= bounds.end))
}

export function sortHistoryItems(items: readonly HistoryItem[], order: HistorySortOrder) {
  return [...items].sort((a, b) => order === 'oldest' ? a.view_at - b.view_at : b.view_at - a.view_at)
}
