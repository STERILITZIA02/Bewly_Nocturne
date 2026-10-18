import { serializeFavoriteCover } from '~/utils/favoriteFolderForm'

import type { APIMAP } from '../../utils'
import { AHS } from '../../utils'

const API_FAVORITE = {
  getFavoriteFolderInfo: {
    url: 'https://api.bilibili.com/x/v3/fav/folder/info',
    _fetch: { method: 'get' },
    params: { media_id: 0 },
    afterHandle: AHS.J_D,
  },
  createFavoriteFolder: {
    url: 'https://api.bilibili.com/x/v3/fav/folder/add',
    _fetch: {
      method: 'post',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: { title: '', intro: '', cover: '', privacy: 0, csrf: '' },
    },
    params: {},
    afterHandle: AHS.J_D,
  },
  uploadFavoriteCover: {
    url: 'https://api.bilibili.com/x/upload/web/image',
    _fetch: {
      method: 'post',
      strictParams: true,
      body: { bytes: [] as number[], mimeType: '', fileName: '', csrf: '' },
      bodySerializer: serializeFavoriteCover,
    },
    params: {},
    afterHandle: AHS.J_D,
  },
  sortFavoriteFolders: {
    url: 'https://api.bilibili.com/x/v3/fav/folder/sort',
    _fetch: { method: 'post' },
    params: { sort: '', csrf: '' },
    afterHandle: AHS.J_D,
  },
  cleanFavoriteFolder: {
    url: 'https://api.bilibili.com/x/v3/fav/resource/clean',
    _fetch: {
      method: 'post',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: { media_id: 0, platform: 'web', csrf: '' },
    },
    params: {},
    afterHandle: AHS.J_D,
  },
  likeFavoriteFolder: {
    url: 'https://api.bilibili.com/x/v3/fav/thump/up',
    _fetch: { method: 'post' },
    params: { rid: 0, thumb_type: 1, type: 11, up_mid: 0, csrf: '' },
    afterHandle: AHS.J_D,
  },
  favCollectedFavoriteFolder: {
    url: 'https://api.bilibili.com/x/v3/fav/folder/fav',
    _fetch: { method: 'post' },
    params: { media_id: 0, csrf: '' },
    afterHandle: AHS.J_D,
  },
  // https://github.com/SocialSisterYi/bilibili-API-collect/blob/master/docs/fav/info.md#%E8%8E%B7%E5%8F%96%E6%8C%87%E5%AE%9A%E7%94%A8%E6%88%B7%E5%88%9B%E5%BB%BA%E7%9A%84%E6%89%80%E6%9C%89%E6%94%B6%E8%97%8F%E5%A4%B9%E4%BF%A1%E6%81%AF
  getFavoriteCategories: {
    url: 'https://api.bilibili.com/x/v3/fav/folder/created/list-all',
    _fetch: {
      method: 'get',
    },
    params: {
      up_mid: '',
      type: undefined as number | undefined,
      rid: undefined as number | undefined,
    },
    afterHandle: AHS.J_D,
  },
  updateVideoFavorites: {
    url: 'https://api.bilibili.com/x/v3/fav/resource/deal',
    _fetch: {
      method: 'post',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: { rid: 0, type: 2, add_media_ids: '', del_media_ids: '', platform: 'web', csrf: '' },
    },
    params: {},
    afterHandle: AHS.J_D,
  },
  getFavoritePartitions: {
    url: 'https://api.bilibili.com/x/v3/fav/resource/partition',
    _fetch: {
      method: 'get',
    },
    params: {
      up_mid: '',
      media_id: 0,
    },
    afterHandle: AHS.J_D,
  },
  // 原站公开收藏夹读取契约：tests/fixtures/favorites/native-space-contract.json。
  getFavoriteResources: {
    url: 'https://api.bilibili.com/x/v3/fav/resource/list',
    _fetch: {
      method: 'get',
    },
    params: {
      media_id: -1,
      pn: 1,
      ps: 20,
      keyword: '',
      order: 'mtime',
      type: 0,
      tid: 0,
      platform: 'web',
    },
    afterHandle: AHS.J_D,
  },
  getCollectedFavoriteSeasons: {
    url: 'https://api.bilibili.com/x/v3/fav/folder/collected/list',
    _fetch: {
      method: 'get',
    },
    params: {
      pn: 1,
      ps: 50,
      up_mid: '',
      platform: 'web',
      web_location: '333.1387',
    },
    afterHandle: AHS.J_D,
  },
  getFavoriteSeasonResources: {
    url: 'https://api.bilibili.com/x/space/fav/season/list',
    _fetch: {
      method: 'get',
    },
    params: {
      season_id: -1,
      pn: 1,
      ps: 40,
      web_location: '333.1387',
    },
    afterHandle: AHS.J_D,
  },
  // 图文收藏列表（官方收藏页同源）
  // 参见 polymer 空间图文：docs/opus/space.md，收藏态路径为 opus/feed/fav
  getFavoriteArticles: {
    url: 'https://api.bilibili.com/x/polymer/web-dynamic/v1/opus/feed/fav',
    _fetch: {
      method: 'get',
    },
    params: {
      page: 1,
      page_size: 20,
      offset: '',
      timezone_offset: -480,
      web_location: '333.1387',
    },
    afterHandle: AHS.J_D,
  },
  getFavoriteTopics: {
    url: 'https://api.bilibili.com/x/topic/web/fav/list',
    _fetch: { method: 'get' },
    params: { page_num: 1, page_size: 24 },
    afterHandle: AHS.J_D,
  },
  getFavoriteCourses: {
    url: 'https://api.bilibili.com/pugv/app/web/favorite/page',
    _fetch: { method: 'get' },
    // The space client supplies this context; rule 7 provides its GET origin/referrer.
    params: { mid: '', pn: 1, ps: 20, web_location: '333.1387' },
    afterHandle: AHS.J_D,
  },
  // https://github.com/SocialSisterYi/bilibili-API-collect/blob/master/docs/fav/action.md#%E6%89%B9%E9%87%8F%E5%88%A0%E9%99%A4%E5%86%85%E5%AE%B9
  patchDelFavoriteResources: {
    url: 'https://api.bilibili.com/x/v3/fav/resource/batch-del',
    _fetch: {
      method: 'post',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: {
        resources: '',
        media_id: 0,
        platform: 'web',
        csrf: '',
      },
    },
    params: {},
    afterHandle: AHS.J_D,
  },
  moveFavoriteResources: {
    url: 'https://api.bilibili.com/x/v3/fav/resource/move',
    _fetch: {
      method: 'post',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: {
        resources: '',
        src_media_id: 0,
        tar_media_id: 0,
        mid: '',
        platform: 'web',
        csrf: '',
      },
    },
    params: {},
    afterHandle: AHS.J_D,
  },
  copyFavoriteResources: {
    url: 'https://api.bilibili.com/x/v3/fav/resource/copy',
    _fetch: {
      method: 'post',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: {
        resources: '',
        src_media_id: 0,
        tar_media_id: 0,
        mid: '',
        platform: 'web',
        csrf: '',
      },
    },
    params: {},
    afterHandle: AHS.J_D,
  },
  // https://github.com/SocialSisterYi/bilibili-API-collect/blob/master/docs/fav/action.md#%E4%BF%AE%E6%94%B9%E6%94%B6%E8%97%8F%E5%A4%B9
  editFavoriteFolder: {
    url: 'https://api.bilibili.com/x/v3/fav/folder/edit',
    _fetch: {
      method: 'post',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: {
        media_id: 0,
        title: '',
        intro: '',
        cover: '',
        privacy: 0,
        platform: 'web',
        csrf: '',
      },
    },
    params: {},
    afterHandle: AHS.J_D,
  },
  // 删除收藏夹，media_ids 支持逗号拼接批量删除
  delFavoriteFolder: {
    url: 'https://api.bilibili.com/x/v3/fav/folder/del',
    _fetch: {
      method: 'post',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: {
        media_ids: '',
        platform: 'web',
        csrf: '',
      },
    },
    params: {},
    afterHandle: AHS.J_D,
  },
  // 取消订阅公开收藏夹；原站版本与参数依据见 favorites/native-space-contract.json。
  unfavCollectedFavoriteFolder: {
    url: 'https://api.bilibili.com/x/v3/fav/folder/unfav',
    _fetch: { method: 'post' },
    params: { media_id: 0, csrf: '' },
    afterHandle: AHS.J_D,
  },
  // 原站 bB 与公开夹 rE 均通过 query 提交取消订阅及 CSRF，来源 ID 不可互换。
  unfavFavoriteSeason: {
    url: 'https://api.bilibili.com/x/v3/fav/season/unfav',
    _fetch: { method: 'post' },
    params: { season_id: 0, platform: 'web', csrf: '' },
    afterHandle: AHS.J_D,
  },
} satisfies APIMAP

export default API_FAVORITE
