import type { LiveSubCategory, SearchCategory } from '../types'

const SEARCH_CATEGORIES: readonly SearchCategory[] = ['all', 'video', 'bangumi', 'media_ft', 'user', 'live', 'article']
const LIVE_SUB_CATEGORIES: readonly LiveSubCategory[] = ['all', 'live_room', 'live_user']
const USER_ORDERS = ['', 'fans', 'fans_desc', 'level', 'level_desc'] as const
const USER_TYPES = [0, 1, 2, 3] as const

function parseStringEnum<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return value != null && allowed.includes(value as T) ? value as T : fallback
}

function parseNumberEnum<T extends number>(value: string | null, allowed: readonly T[], fallback: T): T {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && allowed.includes(parsed as T) ? parsed as T : fallback
}

export function parseSearchPage(value: string | null) {
  const page = Number(value)
  return Number.isSafeInteger(page) && page >= 1 ? page : 1
}

export function parseSearchUrlState(params: URLSearchParams) {
  return {
    category: parseStringEnum(params.get('category'), SEARCH_CATEGORIES, 'all'),
    page: parseSearchPage(params.get('pn')),
    userOrder: parseStringEnum(params.get('user_order'), USER_ORDERS, ''),
    userType: parseNumberEnum(params.get('user_type'), USER_TYPES, 0),
    liveSubCategory: parseStringEnum(params.get('search_type'), LIVE_SUB_CATEGORIES, 'all'),
  }
}

export function buildSearchResultsUrl(pathname: string, params: URLSearchParams, hash: string) {
  const query = params.toString()
  return `${pathname}${query ? `?${query}` : ''}${hash}`
}
