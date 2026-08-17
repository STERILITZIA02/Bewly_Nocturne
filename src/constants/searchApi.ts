export const SEARCH_TYPES = [
  'all',
  'video',
  'media_bangumi',
  'media_ft',
  'bili_user',
  'live',
  'live_room',
  'live_user',
  'article',
] as const

export type SearchType = typeof SEARCH_TYPES[number]

interface SearchRequestBase {
  searchType: SearchType
  keyword: string
  page?: number
  pageSize?: number
}

export interface AllSearchRequest extends SearchRequestBase {
  searchType: 'all'
  context?: string
  webRollPage?: number
}

export interface VideoSearchRequest extends SearchRequestBase {
  searchType: 'video'
  context?: string
  filters?: {
    order?: string
    duration?: number
    categoryId?: string | number
    pubtimeBegin?: number
    pubtimeEnd?: number
  }
}

export interface UserSearchRequest extends SearchRequestBase {
  searchType: 'bili_user'
  filters?: {
    order?: string
    orderSort?: number
    userType?: number
  }
}

export interface OrderedSearchRequest extends SearchRequestBase {
  searchType: 'live' | 'live_room' | 'live_user' | 'article'
  filters?: {
    order?: string
  }
}

export interface PgcSearchRequest extends SearchRequestBase {
  searchType: 'media_bangumi' | 'media_ft'
}

export type SearchRequest
  = | AllSearchRequest
    | VideoSearchRequest
    | UserSearchRequest
    | OrderedSearchRequest
    | PgcSearchRequest

export interface SearchApiDefinition {
  url: string
  searchType: SearchType
  params: Record<string, unknown>
}

const SEARCH_ALL_URL = 'https://api.bilibili.com/x/web-interface/wbi/search/all/v2'
const SEARCH_TYPE_URL = 'https://api.bilibili.com/x/web-interface/wbi/search/type'

export const SEARCH_API_DEFINITIONS = {
  searchAll: {
    url: SEARCH_ALL_URL,
    searchType: 'all',
    params: {
      keyword: '',
      page: 1,
      page_size: 20,
      context: undefined as string | undefined,
      web_roll_page: undefined as number | undefined,
    },
  },
  searchVideo: {
    url: SEARCH_TYPE_URL,
    searchType: 'video',
    params: {
      search_type: 'video',
      keyword: '',
      page: 1,
      page_size: 20,
      order: undefined as string | undefined,
      duration: undefined as number | undefined,
      category_id: undefined as string | number | undefined,
      pubtime_begin_s: undefined as number | undefined,
      pubtime_end_s: undefined as number | undefined,
      context: undefined as string | undefined,
    },
  },
  searchBangumi: {
    url: SEARCH_TYPE_URL,
    searchType: 'media_bangumi',
    params: {
      search_type: 'media_bangumi',
      keyword: '',
      page: 1,
      page_size: 20,
    },
  },
  searchMediaFt: {
    url: SEARCH_TYPE_URL,
    searchType: 'media_ft',
    params: {
      search_type: 'media_ft',
      keyword: '',
      page: 1,
      page_size: 20,
    },
  },
  searchUser: {
    url: SEARCH_TYPE_URL,
    searchType: 'bili_user',
    params: {
      search_type: 'bili_user',
      keyword: '',
      page: 1,
      page_size: 20,
      order: undefined as string | undefined,
      order_sort: undefined as number | undefined,
      user_type: undefined as number | undefined,
    },
  },
  searchLive: {
    url: SEARCH_TYPE_URL,
    searchType: 'live',
    params: {
      search_type: 'live',
      keyword: '',
      page: 1,
      page_size: 20,
      order: undefined as string | undefined,
    },
  },
  searchLiveRoom: {
    url: SEARCH_TYPE_URL,
    searchType: 'live_room',
    params: {
      search_type: 'live_room',
      keyword: '',
      page: 1,
      page_size: 20,
      order: undefined as string | undefined,
    },
  },
  searchLiveUser: {
    url: SEARCH_TYPE_URL,
    searchType: 'live_user',
    params: {
      search_type: 'live_user',
      keyword: '',
      page: 1,
      page_size: 20,
      order: undefined as string | undefined,
    },
  },
  searchArticle: {
    url: SEARCH_TYPE_URL,
    searchType: 'article',
    params: {
      search_type: 'article',
      keyword: '',
      page: 1,
      page_size: 20,
      order: undefined as string | undefined,
    },
  },
} satisfies Record<string, SearchApiDefinition>

export type SearchApiMethod = keyof typeof SEARCH_API_DEFINITIONS

export interface BuiltSearchApiRequest {
  method: SearchApiMethod
  url: string
  params: Record<string, string | number>
}

const SEARCH_METHOD_BY_TYPE: Record<SearchType, SearchApiMethod> = {
  all: 'searchAll',
  video: 'searchVideo',
  media_bangumi: 'searchBangumi',
  media_ft: 'searchMediaFt',
  bili_user: 'searchUser',
  live: 'searchLive',
  live_room: 'searchLiveRoom',
  live_user: 'searchLiveUser',
  article: 'searchArticle',
}

const SEARCH_TYPE_SET = new Set<string>(SEARCH_TYPES)

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function positiveInteger(value: unknown, fallback: number): number {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback
}

function finiteNumber(value: unknown): number | undefined {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

/** Runtime boundary used by the dedicated anonymous-search message handler. */
export function parseAnonymousSearchRequest(value: unknown): SearchRequest {
  if (!isRecord(value)
    || typeof value.searchType !== 'string'
    || !SEARCH_TYPE_SET.has(value.searchType)
    || typeof value.keyword !== 'string'
    || !value.keyword.trim()) {
    throw new TypeError('Invalid anonymous search request')
  }

  const base = {
    searchType: value.searchType as SearchType,
    keyword: value.keyword.trim(),
    page: positiveInteger(value.page, 1),
    pageSize: positiveInteger(value.pageSize, 20),
  }
  const filters = isRecord(value.filters) ? value.filters : {}

  switch (base.searchType) {
    case 'all':
      return {
        ...base,
        searchType: 'all',
        ...(stringValue(value.context) ? { context: stringValue(value.context) } : {}),
        ...(value.webRollPage !== undefined
          ? { webRollPage: positiveInteger(value.webRollPage, base.page) }
          : {}),
      }
    case 'video':
      return {
        ...base,
        searchType: 'video',
        ...(stringValue(value.context) ? { context: stringValue(value.context) } : {}),
        filters: {
          ...(stringValue(filters.order) ? { order: stringValue(filters.order) } : {}),
          ...(finiteNumber(filters.duration) !== undefined ? { duration: finiteNumber(filters.duration) } : {}),
          ...(typeof filters.categoryId === 'string' || typeof filters.categoryId === 'number'
            ? { categoryId: filters.categoryId }
            : {}),
          ...(finiteNumber(filters.pubtimeBegin) !== undefined ? { pubtimeBegin: finiteNumber(filters.pubtimeBegin) } : {}),
          ...(finiteNumber(filters.pubtimeEnd) !== undefined ? { pubtimeEnd: finiteNumber(filters.pubtimeEnd) } : {}),
        },
      }
    case 'bili_user':
      return {
        ...base,
        searchType: 'bili_user',
        filters: {
          ...(stringValue(filters.order) ? { order: stringValue(filters.order) } : {}),
          ...(finiteNumber(filters.orderSort) !== undefined ? { orderSort: finiteNumber(filters.orderSort) } : {}),
          ...(finiteNumber(filters.userType) !== undefined ? { userType: finiteNumber(filters.userType) } : {}),
        },
      }
    case 'live':
    case 'live_room':
    case 'live_user':
    case 'article':
      return {
        ...base,
        searchType: base.searchType,
        filters: {
          ...(stringValue(filters.order) ? { order: stringValue(filters.order) } : {}),
        },
      } as OrderedSearchRequest
    case 'media_bangumi':
    case 'media_ft':
      return {
        ...base,
        searchType: base.searchType,
      } as PgcSearchRequest
  }
}

function assignNonEmpty(
  params: Record<string, string | number>,
  key: string,
  value: string | number | undefined,
) {
  if (value !== undefined && value !== '')
    params[key] = value
}

/** Build the exact endpoint and allowlisted wire parameters for one search category. */
export function buildSearchApiRequest(input: SearchRequest): BuiltSearchApiRequest {
  const request = parseAnonymousSearchRequest(input)
  const method = SEARCH_METHOD_BY_TYPE[request.searchType]
  const definition = SEARCH_API_DEFINITIONS[method]
  const params: Record<string, string | number> = {
    keyword: request.keyword,
    page: request.page ?? 1,
    page_size: request.pageSize ?? 20,
  }

  if (request.searchType !== 'all')
    params.search_type = request.searchType

  switch (request.searchType) {
    case 'all':
      assignNonEmpty(params, 'context', request.context)
      assignNonEmpty(params, 'web_roll_page', request.webRollPage)
      break
    case 'video':
      assignNonEmpty(params, 'order', request.filters?.order)
      assignNonEmpty(params, 'duration', request.filters?.duration)
      assignNonEmpty(params, 'category_id', request.filters?.categoryId)
      assignNonEmpty(params, 'pubtime_begin_s', request.filters?.pubtimeBegin)
      assignNonEmpty(params, 'pubtime_end_s', request.filters?.pubtimeEnd)
      assignNonEmpty(params, 'context', request.context)
      break
    case 'bili_user':
      assignNonEmpty(params, 'order', request.filters?.order)
      assignNonEmpty(params, 'order_sort', request.filters?.orderSort)
      assignNonEmpty(params, 'user_type', request.filters?.userType)
      break
    case 'live':
    case 'live_room':
    case 'live_user':
    case 'article':
      assignNonEmpty(params, 'order', request.filters?.order)
      break
    case 'media_bangumi':
    case 'media_ft':
      break
  }

  return {
    method,
    url: definition.url,
    params,
  }
}
