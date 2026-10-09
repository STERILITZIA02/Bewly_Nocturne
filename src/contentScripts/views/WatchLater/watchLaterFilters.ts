import type { List as VideoItem } from '~/models/video/watchLater'
import type { VideoWatchState } from '~/utils/videoVisitRecord'
import { getWatchLaterAuthor } from '~/utils/watchLaterList'

export type WatchLaterStatusFilter = 'all' | 'unstarted' | 'watching' | 'completed' | 'unknown'
export type WatchLaterDurationFilter = 'all' | 'short' | 'medium' | 'long'

export function watchLaterPlaybackState(item: VideoItem, local?: VideoWatchState): Exclude<WatchLaterStatusFilter, 'all'> {
  if (item.progress === -1)
    return 'completed'
  if (Number.isFinite(item.progress) && item.progress! >= 0)
    return item.progress === 0 ? 'unstarted' : 'watching'
  if (local?.status === 'played')
    return local.completed ? 'completed' : 'watching'
  return 'unknown'
}

export function filterWatchLaterItems(items: VideoItem[], query: string, status: WatchLaterStatusFilter, duration: WatchLaterDurationFilter, readLocal: (item: VideoItem) => VideoWatchState | undefined) {
  const keyword = query.normalize('NFKC').trim().toLocaleLowerCase()
  return items.filter((item) => {
    if (keyword && !`${item.title} ${getWatchLaterAuthor(item).name ?? ''}`.normalize('NFKC').toLocaleLowerCase().includes(keyword))
      return false
    if (status !== 'all') {
      const serverProgress = item.progress === -1 || (Number.isFinite(item.progress) && item.progress! >= 0)
      if (watchLaterPlaybackState(item, serverProgress ? undefined : readLocal(item)) !== status)
        return false
    }
    if (duration === 'all')
      return true
    return item.duration > 0 && (duration === 'short' ? item.duration <= 600 : duration === 'medium' ? item.duration > 600 && item.duration <= 1800 : item.duration > 1800)
  })
}
