import browser from 'webextension-polyfill'

import { buildSearchApiRequest, parseAnonymousSearchRequest, SEARCH_API_DEFINITIONS } from '~/constants/searchApi'
import type { SearchRecommendationResponse } from '~/models/search/defaultRecommendation'
import type { ReadRequestOptions } from '~/utils/abort'
import { waitWithSignal, withRequestDeadline } from '~/utils/abort'

import type { API, APIMAP } from '../../utils'
import { AHS, doRequest } from '../../utils'

const DEFAULT_SEARCH_TTL_MS = 10 * 60_000
const DEFAULT_SEARCH_CACHE_LIMIT = 16
const DEFAULT_SEARCH_STORAGE_KEY = `defaultSearchRecommendation:v1${browser.extension?.inIncognitoContext ? ':private' : ''}`
const defaultSearchCache = new Map<string, { value: SearchRecommendationResponse, expires: number }>()
const defaultSearchRequests = new Map<string, { promise: Promise<SearchRecommendationResponse>, controller: AbortController, consumers: number, settled: boolean }>()
let cacheLoaded: Promise<void> | undefined
let cachePersisted = Promise.resolve()
const defaultSearchApi = {
  url: 'https://api.bilibili.com/x/web-interface/wbi/search/default',
  _fetch: { method: 'get' },
  params: {},
  afterHandle: AHS.J_D,
} satisfies API

function isDefaultSearchResponse(value: unknown): value is SearchRecommendationResponse {
  const response = value as SearchRecommendationResponse | undefined
  return response?.code === 0 && (typeof response.data?.name === 'string' || typeof response.data?.show_name === 'string')
}

async function restoreDefaultSearchCache() {
  try {
    const stored = (await withRequestDeadline(signal => waitWithSignal(browser.storage?.session?.get(DEFAULT_SEARCH_STORAGE_KEY) ?? Promise.resolve({}), signal), {}, 1500))?.[DEFAULT_SEARCH_STORAGE_KEY]
    if (!stored || typeof stored !== 'object')
      return
    for (const [key, entry] of Object.entries(stored).slice(-DEFAULT_SEARCH_CACHE_LIMIT)) {
      const cached = entry as { value: unknown, expires: number }
      if (cached && Number.isFinite(cached.expires) && cached.expires > Date.now() && isDefaultSearchResponse(cached.value))
        defaultSearchCache.set(key, { value: cached.value, expires: cached.expires })
    }
  }
  catch { /* Memory cache remains available when session storage is unavailable. */ }
}

function persistDefaultSearchCache() {
  cachePersisted = cachePersisted.then(async () => {
    await browser.storage?.session?.set({ [DEFAULT_SEARCH_STORAGE_KEY]: Object.fromEntries(defaultSearchCache) })
  }).catch(() => {})
  return cachePersisted
}

async function getDefaultSearchRecommendation(_message: Record<string, unknown> = {}, sender?: browser.Runtime.MessageSender, options?: ReadRequestOptions) {
  return withRequestDeadline(signal => readDefaultSearchRecommendation(sender, signal), options)
}

async function readDefaultSearchRecommendation(sender: browser.Runtime.MessageSender | undefined, signal: AbortSignal) {
  const request = async (signal: AbortSignal) => await doRequest({ contentScriptQuery: 'getDefaultSearchRecommendation' }, defaultSearchApi, { signal }) as SearchRecommendationResponse
  // This endpoint is requested with credentials; do not share its result across accounts/private windows.
  let mid: string
  try {
    mid = (await waitWithSignal(browser.cookies.get({ url: defaultSearchApi.url, name: 'DedeUserID' }), signal))?.value ?? ''
  }
  catch {
    signal.throwIfAborted()
    return request(signal)
  }
  await waitWithSignal(cacheLoaded ??= restoreDefaultSearchCache(), signal)
  signal.throwIfAborted()
  const key = JSON.stringify([sender?.tab?.incognito ?? false, mid])
  const now = Date.now()
  for (const [id, cached] of defaultSearchCache) {
    if (cached.expires <= now)
      defaultSearchCache.delete(id)
  }
  const cached = defaultSearchCache.get(key)
  if (cached)
    return cached.value
  let pending = defaultSearchRequests.get(key)
  if (!pending) {
    const controller = new AbortController()
    const entry = { controller, consumers: 0, settled: false, promise: undefined! as Promise<SearchRecommendationResponse> }
    entry.promise = withRequestDeadline(async (ownerSignal) => {
      const value = await request(ownerSignal)
      let currentMid: string | undefined
      try {
        currentMid = (await waitWithSignal(browser.cookies.get({ url: defaultSearchApi.url, name: 'DedeUserID' }), ownerSignal))?.value ?? ''
      }
      catch { /* Do not cache a response whose account can no longer be confirmed. */ }
      ownerSignal.throwIfAborted()
      if (currentMid === mid && isDefaultSearchResponse(value)) {
        defaultSearchCache.set(key, { value, expires: Date.now() + DEFAULT_SEARCH_TTL_MS })
        while (defaultSearchCache.size > DEFAULT_SEARCH_CACHE_LIMIT)
          defaultSearchCache.delete(defaultSearchCache.keys().next().value!)
        void persistDefaultSearchCache()
      }
      return value
    }, { signal: controller.signal }).finally(() => {
      entry.settled = true
      if (defaultSearchRequests.get(key) === entry)
        defaultSearchRequests.delete(key)
    })
    pending = entry
    defaultSearchRequests.set(key, pending)
  }
  pending.consumers++
  try {
    return await waitWithSignal(pending.promise, signal)
  }
  finally {
    pending.consumers--
    if (!pending.consumers && !pending.settled) {
      pending.controller.abort()
      if (defaultSearchRequests.get(key) === pending)
        defaultSearchRequests.delete(key)
    }
  }
}

async function requestAnonymousSearch(message: Record<string, unknown>, _sender?: browser.Runtime.MessageSender, options?: ReadRequestOptions) {
  const request = parseAnonymousSearchRequest(message.request)
  const builtRequest = buildSearchApiRequest(request)

  return await doRequest(
    { contentScriptQuery: 'anonymousSearch' },
    {
      url: builtRequest.url,
      _fetch: {
        method: 'get',
        credentials: 'omit',
        strictParams: true,
      },
      params: builtRequest.params,
      afterHandle: AHS.J_D,
    },
    options,
  )
}

const API_SEARCH = {
  getSearchSuggestion: {
    url: 'https://s.search.bilibili.com/main/suggest',
    _fetch: {
      method: 'get',
    },
    params: {
      term: '',
      highlight: '',
    },
    afterHandle: AHS.J_D,
  },
  getDefaultSearchRecommendation,
  getHotSearchList: {
    url: 'https://api.bilibili.com/x/web-interface/wbi/search/square',
    _fetch: {
      method: 'get',
    },
    params: {
      limit: 50,
      platform: 'web',
    },
    afterHandle: AHS.J_D,
  },
  // 综合搜索
  searchAll: {
    ...SEARCH_API_DEFINITIONS.searchAll,
    _fetch: {
      method: 'get',
      strictParams: true,
    },
    afterHandle: AHS.J_D,
  },
  // 视频搜索
  searchVideo: {
    ...SEARCH_API_DEFINITIONS.searchVideo,
    _fetch: {
      method: 'get',
      strictParams: true,
    },
    afterHandle: AHS.J_D,
  },
  // 番剧搜索
  searchBangumi: {
    ...SEARCH_API_DEFINITIONS.searchBangumi,
    _fetch: {
      method: 'get',
      strictParams: true,
    },
    afterHandle: AHS.J_D,
  },
  // 影视搜索
  searchMediaFt: {
    ...SEARCH_API_DEFINITIONS.searchMediaFt,
    _fetch: {
      method: 'get',
      strictParams: true,
    },
    afterHandle: AHS.J_D,
  },
  // 用户搜索
  searchUser: {
    ...SEARCH_API_DEFINITIONS.searchUser,
    _fetch: {
      method: 'get',
      strictParams: true,
    },
    afterHandle: AHS.J_D,
  },
  // 直播搜索
  searchLive: {
    ...SEARCH_API_DEFINITIONS.searchLive,
    _fetch: {
      method: 'get',
      strictParams: true,
    },
    afterHandle: AHS.J_D,
  },
  // 直播间搜索（仅直播间）
  searchLiveRoom: {
    ...SEARCH_API_DEFINITIONS.searchLiveRoom,
    _fetch: {
      method: 'get',
      strictParams: true,
    },
    afterHandle: AHS.J_D,
  },
  // 主播搜索
  searchLiveUser: {
    ...SEARCH_API_DEFINITIONS.searchLiveUser,
    _fetch: {
      method: 'get',
      strictParams: true,
    },
    afterHandle: AHS.J_D,
  },
  // 专栏搜索
  searchArticle: {
    ...SEARCH_API_DEFINITIONS.searchArticle,
    _fetch: {
      method: 'get',
      strictParams: true,
    },
    afterHandle: AHS.J_D,
  },
  // 去个性化搜索只接受类型化 request；endpoint、参数白名单与匿名 WBI
  // scope 均在 background 内部确定，content/page 无法传入任意 URL。
  anonymousSearch: requestAnonymousSearch,
} satisfies APIMAP

export default API_SEARCH
