import { formatLocalCalendarDate, parseLocalCalendarDate, toLocalDate } from '~/contentScripts/views/SearchResults/utils/localDate'

/** Bilibili's search categories, in the native tab order. */
export const SEARCH_SCOPES = ['all', 'video', 'bangumi', 'media_ft', 'live', 'article', 'user'] as const
export type SearchScope = typeof SEARCH_SCOPES[number]

export const SEARCH_VIDEO_ORDERS = ['', 'click', 'pubdate', 'dm', 'stow'] as const
export const SEARCH_VIDEO_DURATIONS = [0, 1, 2, 3, 4] as const
export const SEARCH_TIME_RANGES = ['all', 'day', 'week', 'halfyear'] as const
export type SearchTimeRange = typeof SEARCH_TIME_RANGES[number] | 'custom'

/** Video filters; `tids` is the partition filter Bilibili is rebuilding (0: none). */
export interface SearchVideoFilters {
  order: string
  duration: number
  timeRange: string
  customStartDate: string
  customEndDate: string
  tids: number
}

export const EMPTY_SEARCH_VIDEO_FILTERS: Readonly<SearchVideoFilters> = { order: '', duration: 0, timeRange: 'all', customStartDate: '', customEndDate: '', tids: 0 }

/** Bewly result-page parameters of the video filters. */
export const SEARCH_VIDEO_FILTER_PARAMS = ['order', 'duration', 'time_range', 'pubtime_begin', 'pubtime_end', 'tids'] as const

export function hasSearchVideoFilters(filters: SearchVideoFilters): boolean {
  return Boolean(filters.order || filters.duration || filters.tids || filters.timeRange !== 'all')
}

function positiveInteger(value: string | null): number {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0
}

export function readSearchVideoFilters(params: URLSearchParams): SearchVideoFilters {
  const order = params.get('order') ?? ''
  const duration = Number(params.get('duration'))
  const timeRange = params.get('time_range') ?? 'all'
  const start = params.get('pubtime_begin') ?? ''
  const end = params.get('pubtime_end') ?? ''
  const custom = timeRange === 'custom' && Boolean(parseLocalCalendarDate(start) || parseLocalCalendarDate(end))
  return {
    order: (SEARCH_VIDEO_ORDERS as readonly string[]).includes(order) ? order : '',
    duration: (SEARCH_VIDEO_DURATIONS as readonly number[]).includes(duration) ? duration : 0,
    timeRange: custom ? 'custom' : (SEARCH_TIME_RANGES as readonly string[]).includes(timeRange) ? timeRange : 'all',
    customStartDate: custom ? start : '',
    customEndDate: custom ? end : '',
    tids: positiveInteger(params.get('tids')),
  }
}

function writeSearchVideoFilters(params: URLSearchParams, filters: SearchVideoFilters) {
  const values: Record<typeof SEARCH_VIDEO_FILTER_PARAMS[number], string | number> = {
    order: filters.order,
    duration: filters.duration,
    time_range: filters.timeRange === 'all' ? '' : filters.timeRange,
    pubtime_begin: filters.timeRange === 'custom' ? filters.customStartDate : '',
    pubtime_end: filters.timeRange === 'custom' ? filters.customEndDate : '',
    tids: filters.tids,
  }
  for (const [key, value] of Object.entries(values)) {
    if (value)
      params.set(key, String(value))
    else
      params.delete(key)
  }
}

/** Publication window in Unix seconds; presets count back from now, custom dates cover whole local days. */
export function getSearchPubtimeRange(filters: Pick<SearchVideoFilters, 'timeRange' | 'customStartDate' | 'customEndDate'>): { pubtimeBegin?: number, pubtimeEnd?: number } {
  const now = Math.floor(Date.now() / 1000)
  if (filters.timeRange === 'custom') {
    const start = parseLocalCalendarDate(filters.customStartDate)
    const end = parseLocalCalendarDate(filters.customEndDate)
    if (!start && !end)
      return {}
    let begin = start ? Math.floor(toLocalDate(start).getTime() / 1000) : 0
    let finish = now
    if (end) {
      const endDate = toLocalDate(end)
      endDate.setHours(23, 59, 59, 999)
      finish = Math.floor(endDate.getTime() / 1000)
    }
    if (begin > finish)
      [begin, finish] = [finish, begin]
    return { pubtimeBegin: begin, pubtimeEnd: finish }
  }
  const days = { day: 1, week: 7, halfyear: 180 }[filters.timeRange]
  return days ? { pubtimeBegin: now - days * 24 * 3600, pubtimeEnd: now } : {}
}

/**
 * Bewly's search results URL for a keyword, scope and video filters. The
 * combined results do not take video filters, so a filtered "all" search opens
 * the video results, as the native combined page sorts its videos.
 */
export function buildPluginSearchResultsUrl(keyword: string, scope: SearchScope = 'all', filters: SearchVideoFilters = EMPTY_SEARCH_VIDEO_FILTERS): string {
  const target = new URL('https://www.bilibili.com/')
  target.searchParams.set('page', 'SearchResults')
  const normalized = keyword.trim()
  if (normalized)
    target.searchParams.set('keyword', normalized)
  const filtered = (scope === 'all' || scope === 'video') && hasSearchVideoFilters(filters)
  const category = filtered ? 'video' : scope
  if (category !== 'all')
    target.searchParams.set('category', category)
  if (filtered)
    writeSearchVideoFilters(target.searchParams, filters)
  return target.toString()
}

/** The native search's video filter parameters for Bewly's (pubtime as Unix seconds). */
export function writeNativeSearchVideoFilters(target: URLSearchParams, source: URLSearchParams) {
  const filters = readSearchVideoFilters(source)
  if (filters.order)
    target.set('order', filters.order)
  if (filters.duration)
    target.set('duration', String(filters.duration))
  if (filters.tids)
    target.set('tids', String(filters.tids))
  const { pubtimeBegin, pubtimeEnd } = getSearchPubtimeRange(filters)
  if (pubtimeBegin !== undefined && pubtimeEnd !== undefined) {
    target.set('pubtime_begin_s', String(pubtimeBegin))
    target.set('pubtime_end_s', String(pubtimeEnd))
  }
}

function readNativeSearchVideoFilters(params: URLSearchParams): SearchVideoFilters {
  const filters = readSearchVideoFilters(params)
  const begin = positiveInteger(params.get('pubtime_begin_s'))
  const end = positiveInteger(params.get('pubtime_end_s'))
  if (!begin && !end)
    return { ...filters, timeRange: 'all' }
  const date = (seconds: number) => {
    const value = new Date(seconds * 1000)
    return formatLocalCalendarDate({ year: value.getFullYear(), month: value.getMonth(), day: value.getDate() })
  }
  return { ...filters, timeRange: 'custom', customStartDate: begin ? date(begin) : '', customEndDate: end ? date(end) : '' }
}

const NATIVE_SEARCH_CATEGORY_BY_PATH: Readonly<Record<string, string>> = {
  article: 'article',
  bangumi: 'bangumi',
  live: 'live',
  media_bangumi: 'bangumi',
  media_ft: 'media_ft',
  movie: 'media_ft',
  pgc: 'media_ft',
  upuser: 'user',
  user: 'user',
  video: 'video',
}

/**
 * Convert a Bilibili native search URL into Bewly Nocturne's built-in search results
 * URL. Returning null leaves unsupported or keyword-less pages untouched.
 */
export function getPluginSearchResultsUrl(value: string): string | null {
  try {
    const sourceUrl = new URL(value)
    if (
      (sourceUrl.protocol !== 'http:' && sourceUrl.protocol !== 'https:')
      || sourceUrl.hostname !== 'search.bilibili.com'
    ) {
      return null
    }

    const keyword = sourceUrl.searchParams.get('keyword')?.trim()
    if (!keyword)
      return null

    const targetUrl = new URL('https://www.bilibili.com/')
    targetUrl.searchParams.set('page', 'SearchResults')
    targetUrl.searchParams.set('keyword', keyword)

    const nativePath = sourceUrl.pathname.split('/').filter(Boolean)[0]?.toLowerCase() ?? 'all'
    const pluginCategory = NATIVE_SEARCH_CATEGORY_BY_PATH[nativePath]
    if (nativePath !== 'all' && !pluginCategory)
      return null
    if (pluginCategory)
      targetUrl.searchParams.set('category', pluginCategory)

    const nativePage = Number(sourceUrl.searchParams.get('page'))
    if (Number.isInteger(nativePage) && nativePage > 1)
      targetUrl.searchParams.set('pn', String(nativePage))

    if (!pluginCategory || pluginCategory === 'video') {
      const filters = readNativeSearchVideoFilters(sourceUrl.searchParams)
      if (hasSearchVideoFilters(filters)) {
        const filtered = new URL(buildPluginSearchResultsUrl(keyword, 'video', filters))
        filtered.searchParams.forEach((value, key) => targetUrl.searchParams.set(key, value))
      }
    }

    if (pluginCategory === 'user') {
      const order = sourceUrl.searchParams.get('order')
      const orderSort = sourceUrl.searchParams.get('order_sort')
      if (order === 'fans' || order === 'level')
        targetUrl.searchParams.set('user_order', orderSort === '1' ? `${order}_desc` : order)

      const userType = Number(sourceUrl.searchParams.get('user_type'))
      if (Number.isInteger(userType) && userType >= 1 && userType <= 3)
        targetUrl.searchParams.set('user_type', String(userType))
    }

    if (pluginCategory === 'live') {
      const searchType = sourceUrl.searchParams.get('search_type')
      if (searchType === 'live_room' || searchType === 'live_user')
        targetUrl.searchParams.set('search_type', searchType)
    }

    return targetUrl.toString()
  }
  catch {
    return null
  }
}
