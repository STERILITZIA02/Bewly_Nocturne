import { buildSearchApiRequest, parseAnonymousSearchRequest, SEARCH_API_DEFINITIONS } from '~/constants/searchApi'

import type { APIMAP } from '../../utils'
import { AHS, doRequest } from '../../utils'

async function requestAnonymousSearch(message: Record<string, unknown>) {
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
  getDefaultSearchRecommendation: {
    url: 'https://api.bilibili.com/x/web-interface/wbi/search/default',
    _fetch: {
      method: 'get',
    },
    params: {},
    afterHandle: AHS.J_D,
  },
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
