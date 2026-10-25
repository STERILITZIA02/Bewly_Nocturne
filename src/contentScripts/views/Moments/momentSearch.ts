import type { DisplayMoment } from '~/components/MomentCard/types'

/**
 * The rail's search over the moments feed. The feed API has no keyword or
 * date query, so it filters the posts it reads: loaded ones at once, further
 * pages as the filtered feed scans on.
 */
export type MomentKind = 'all' | 'original' | 'forward' | 'video' | 'draw' | 'live' | 'article'
export type MomentTimeRange = 'all' | 'day' | 'week' | 'month' | 'year'
export interface MomentSearch {
  keyword: string
  kind: MomentKind
  time: MomentTimeRange
}

export const MOMENT_KINDS: MomentKind[] = ['all', 'original', 'forward', 'video', 'draw', 'live', 'article']
export const MOMENT_TIME_RANGES: MomentTimeRange[] = ['all', 'day', 'week', 'month', 'year']
export const EMPTY_MOMENT_SEARCH: MomentSearch = { keyword: '', kind: 'all', time: 'all' }

/**
 * Content kinds describe the post itself: a repost is only "repost", whatever
 * it quotes. Text and images are the original posts of no other kind, as in
 * the rail's text-and-images category.
 */
function isMomentKind(moment: DisplayMoment, kind: MomentKind) {
  if (kind === 'all')
    return true
  if (kind === 'forward' || moment.isForward)
    return kind === 'forward' && moment.isForward
  const video = moment.isVideo || moment.isPgc
  switch (kind) {
    case 'video': return video
    case 'live': return moment.isLive
    case 'article': return moment.isArticle
    case 'draw': return !video && !moment.isLive && !moment.isArticle
    default: return true
  }
}

const RANGE_DAYS: Record<Exclude<MomentTimeRange, 'all'>, number> = { day: 1, week: 7, month: 30, year: 365 }

export function isMomentSearchActive(search: MomentSearch) {
  return Boolean(search.keyword) || search.kind !== 'all' || search.time !== 'all'
}

/** The oldest publish time (Unix seconds) the range keeps; 0 keeps everything. */
export function getMomentSearchCutoff(search: MomentSearch, now = Date.now()) {
  return search.time === 'all' ? 0 : Math.floor(now / 1000) - RANGE_DAYS[search.time] * 86_400
}

/** Every space-separated word must appear (case-insensitive) in the post's text. */
export function matchesMomentSearch(moment: DisplayMoment, search: MomentSearch, text: () => string, cutoff: number) {
  if (!isMomentKind(moment, search.kind))
    return false
  if (cutoff && moment.publishedAt < cutoff)
    return false
  const words = search.keyword.toLocaleLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length)
    return true
  const haystack = text().toLocaleLowerCase()
  return words.every(word => haystack.includes(word))
}
