export interface CollectedFavoriteSeasonsResult {
  code: number
  message: string
  ttl: number
  data: CollectedFavoriteSeasonsData
}

export interface CollectedFavoriteSeasonsData {
  count: number
  list: CollectedFavoriteSeason[]
  has_more: boolean
}

export interface CollectedFavoriteSeason {
  id: number
  fid: number
  mid: number
  attr: number
  attr_desc: string
  title: string
  cover: string
  upper: {
    mid: number
    name: string
    face: string
    jump_link: string
  }
  cover_type: number
  intro: string
  ctime: number
  mtime: number
  state: number
  fav_state: number
  media_count: number
  view_count: number
  vt: number
  is_top: boolean
  recent_fav: null
  play_switch: number
  type: FavoriteSource['type']
  link: string
  bvid: string
  is_kid_playlist: boolean
  kid_playlist_desc: string
}

export interface FavoriteSeasonResourcesResult {
  code: number
  message: string
  ttl: number
  data: FavoriteSeasonResourcesData
}

export interface FavoriteSeasonResourcesData {
  info: FavoriteSeasonInfo
  medias: FavoriteSeasonMedia[]
}

export interface FavoriteSeasonInfo {
  id: number
  season_type: number
  title: string
  cover: string
  upper: {
    mid: number
    name: string
  }
  cnt_info: {
    collect: number
    play: number
    danmaku: number
    vt: number
  }
  media_count: number
  intro: string
  enable_vt: number
}

export interface FavoriteSeasonMedia {
  type?: number
  attr?: number
  intro?: string
  page?: number
  fav_time?: number
  ctime?: number
  link?: string
  bv_id?: string
  id: number
  title: string
  cover: string
  duration: number
  pubtime: number
  bvid: string
  upper: {
    mid: number
    name: string
    /** fav/season/list 通常不返回；由客户端按 mid 补全 */
    face?: string
  }
  cnt_info: {
    collect: number
    play: number
    danmaku: number
    vt: number
  }
  enable_vt: number
  vt_display: string
  is_self_view: boolean
}
/** Directory source kind, independent of a resource's media type. */
export interface FavoriteSource {
  /** 11: id is media_id; 21: id is season_id. */
  type: 11 | 21
  id: number
}
