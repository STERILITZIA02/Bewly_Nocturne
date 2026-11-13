import type { SearchScope } from '~/utils/searchUrl'

export type SearchTag = string | { name?: string, tag_name?: string, style_name?: string }
export interface SearchAuthor { mid?: number, name?: string, uname?: string, face?: string, authorFace?: string }

export interface SearchVideoResult {
  id: number
  aid?: number
  bvid?: string
  cid?: number
  type?: string
  title?: string
  long_title?: string
  pic?: string
  cover?: string
  author?: string | SearchAuthor
  owner?: SearchAuthor
  mid?: number
  upic?: string
  uface?: string
  play?: number
  danmaku?: number
  video_review?: number
  stat?: { view?: number, danmaku?: number }
  pubdate?: number
  duration?: string | number
  duration_seconds?: number
  duration_ms?: string | number
  durationStr?: string
  typename?: string
  episode_count_text?: string
  arcurl?: string
  tag?: string | string[]
  tags?: SearchTag[]
}

export interface SearchEpisodeResult {
  id?: number | string
  ep_id?: number | string
  cid?: number | string
  title?: string
  long_title?: string
  index_title?: string
  name?: string
  url?: string
  link?: string
  cover?: string
  pic?: string
  square_cover?: string
  badge?: string
  badges?: Array<{ text?: string }>
  order?: string | number
  episode?: string | number
  index?: string | number
  episode_index?: string | number
  ep_index?: string | number
  ep_title?: string
}

export interface SearchMediaResult {
  id?: number | string
  season_id?: number
  media_id?: number
  type?: string
  result_type?: string
  title?: string
  url?: string
  goto_url?: string
  cover?: string
  square_cover?: string
  vertical_cover?: string
  horizontal_cover?: string
  styles?: string | SearchTag[]
  style?: SearchTag[]
  areas?: string | SearchTag[]
  evaluate?: string
  desc?: string
  badge?: string
  badges?: Array<{ text?: string }>
  badge_info?: { text?: string, bg_color?: string, bg_color_night?: string }
  season_type_name?: string
  season_title?: string
  season_type?: number
  play?: number
  follow?: number
  stat?: { view?: number }
  media_score?: { score?: number | string }
  score?: number | string
  pubtime?: number
  publish_time?: number
  ctime?: number
  button_text?: string
  eps?: SearchEpisodeResult[] | number | string
  episodes?: unknown[]
  ep_list?: unknown[]
  module_info?: { episodes?: unknown[], modules?: unknown[] }
  modules?: unknown[]
  season?: { episodes?: unknown[] }
  new_ep?: { index_show?: string | unknown[], show?: string }
  index_show?: string
  total_count?: string | number
  total_count_show?: string | number
}

export interface SearchUserResult {
  mid?: number
  uid?: number
  roomid?: number | string
  room_id?: number | string
  uname?: string
  name?: string
  upic?: string
  face?: string
  uface?: string
  usign?: string
  sign?: string
  fans?: number
  attentions?: number
  videos?: number
  level?: number
  gender?: number
  official_verify?: { type?: number, title?: string, desc?: string }
  verify_info?: string
  is_verify?: boolean | number
  is_follow?: boolean | number
  is_live?: number
  live_status?: number
  res?: SearchVideoResult[]
}

export interface SearchArticleResult {
  id: number
  title?: string
  desc?: string
  image_urls?: string[]
  pic?: string
  cover?: string
  author_name?: string
  mid?: number
  view?: number
  like?: number
  reply?: number
  pub_time?: number
  publish_time?: number
  ctime?: number
  category_name?: string
  tags?: SearchTag[]
}

export interface SearchLiveResult {
  type?: string
  roomid: number
  title?: string
  cover?: string
  user_cover?: string
  pic?: string
  uface?: string
  face?: string
  uname?: string
  uid?: number
  online?: number | string
  live_status?: number
  cate_name?: string
  area_name_v2?: string
  area_name?: string
}

export interface SearchActivityResult {
  id?: number | string
  title?: string
  desc?: string
  cover?: string
  url?: string
  link?: string
  card_value?: number | string
  card_type?: number
  pos?: number
  corner?: string
}

export interface SearchGameResult {
  game_base_id?: string | number
  game_icon?: string
  game_link?: string
  game_name?: string
  game_name_v2?: string
  summary?: string
  notice?: string
  recommend_reason?: string
  game_tags?: string[]
  grade?: string | number
  download_num?: string | number
  platform?: string
}

export type { SearchVideoFilters as VideoSearchFilters } from '~/utils/searchUrl'
export type SearchCategory = SearchScope

export interface SearchCategoryOption {
  value: SearchCategory
  label: string
  icon: string
}

export type LiveSubCategory = 'all' | 'live_room' | 'live_user'

export interface UserSearchFilters {
  order: string
  userType: number
}

export interface LiveSearchFilters {
  subCategory: LiveSubCategory
  roomOrder: string
  userOrder: string
}
