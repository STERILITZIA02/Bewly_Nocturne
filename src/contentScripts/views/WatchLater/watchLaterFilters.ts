import type { List as VideoItem } from '~/models/video/watchLater'
import { parseLocalCalendarDate } from '~/utils/localDate'
import type { VideoWatchState } from '~/utils/videoVisitRecord'
import { getWatchLaterAuthor } from '~/utils/watchLaterList'

export type WatchLaterStatusFilter = 'all' | 'unstarted' | 'watching' | 'completed' | 'unknown'
export type WatchLaterDurationFilter = 'all' | 'short' | 'medium' | 'long' | 'extraLong'
export type WatchLaterSortOrder = 'newest' | 'oldest'
export type WatchLaterAddedFilter = 'all' | 'custom'
export interface WatchLaterFilters {
  progress: 'all' | 'unstarted'
  added: WatchLaterAddedFilter
  startDate: string
  endDate: string
  duration: WatchLaterDurationFilter
}
export function createWatchLaterFilters(): WatchLaterFilters {
  return { progress: 'all', added: 'all', startDate: '', endDate: '', duration: 'all' }
}
export function hasWatchLaterFilters(filters: WatchLaterFilters): boolean {
  return filters.progress !== 'all' || filters.added !== 'all' || filters.duration !== 'all'
}

export function watchLaterAddedBounds(filters: Pick<WatchLaterFilters, 'added' | 'startDate' | 'endDate'>): { start: number, end: number } | null {
  if (filters.added === 'all')
    return { start: -Infinity, end: Infinity }
  const start = filters.startDate ? parseLocalCalendarDate(filters.startDate) : undefined
  const end = filters.endDate ? parseLocalCalendarDate(filters.endDate) : undefined
  if ((filters.startDate && !start) || (filters.endDate && !end) || (start && end && start > end))
    return null
    // Calendar days, not 24-hour offsets: local DST boundaries can be shorter/longer.
  return {
    start: start ? start.getTime() / 1000 : -Infinity,
    end: end ? new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1).getTime() / 1000 : Infinity,
  }
}

export function sortWatchLaterItems(items: VideoItem[], order: WatchLaterSortOrder): VideoItem[] {
  return [...items].sort((a, b) => {
    const aTime = Number.isFinite(a.add_at) && a.add_at > 0 ? a.add_at : null
    const bTime = Number.isFinite(b.add_at) && b.add_at > 0 ? b.add_at : null
    // Missing add times are unknown; publication dates are not substitutes.
    if (aTime === null || bTime === null)
      return aTime === bTime ? 0 : aTime === null ? 1 : -1
    return order === 'oldest' ? aTime - bTime : bTime - aTime
  })
}

export function watchLaterPlaybackState(item: VideoItem, local?: VideoWatchState): Exclude<WatchLaterStatusFilter, 'all'> {
  if (item.progress === -1)
    return 'completed'
  if (Number.isFinite(item.progress) && item.progress! >= 0)
    return item.progress === 0 ? 'unstarted' : 'watching'
  if (local?.status === 'played')
    return local.completed ? 'completed' : 'watching'
  return 'unknown'
}

export function filterWatchLaterItems(items: VideoItem[], query: string, status: WatchLaterStatusFilter, duration: WatchLaterDurationFilter, readLocal: (item: VideoItem) => VideoWatchState | undefined, added?: Pick<WatchLaterFilters, 'added' | 'startDate' | 'endDate'>) {
  const keyword = query.normalize('NFKC').trim().toLocaleLowerCase()
  const bounds = added ? watchLaterAddedBounds(added) : undefined
  return items.filter((item) => {
    if (keyword && !`${item.title} ${getWatchLaterAuthor(item).name ?? ''}`.normalize('NFKC').toLocaleLowerCase().includes(keyword))
      return false
    if (status !== 'all') {
      const serverProgress = item.progress === -1 || (Number.isFinite(item.progress) && item.progress! >= 0)
      const state = watchLaterPlaybackState(item, serverProgress ? undefined : readLocal(item))
      if (state !== status)
        return false
    }
    if (added?.added !== undefined && added.added !== 'all' && (!bounds || !Number.isFinite(item.add_at) || item.add_at <= 0 || item.add_at < bounds.start || item.add_at >= bounds.end))
      return false
    if (duration === 'all')
      return true
    return item.duration > 0 && (duration === 'short' ? item.duration <= 600 : duration === 'medium' ? item.duration > 600 && item.duration <= 1800 : duration === 'long' ? item.duration > 1800 && item.duration <= 3600 : item.duration > 3600)
  })
}
