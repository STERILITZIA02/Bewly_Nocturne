export interface HistorySearchResult {
  code: number
  message: string
  ttl: number
  data: Data
}

export interface Data {
  has_more: boolean
  page: Page
  list: List[]
}

export interface List {
  title: string
  long_title: string
  cover: string
  covers: null
  uri: string
  history: History
  videos: number
  author_name: string
  author_face: string
  author_mid: number
  view_at: number
  progress: number
  badge: string
  show_title: string
  duration: number
  total: number
  new_desc: string
  is_finish: number
  is_fav: number
  kid: number
  tag_name: string
  live_status: number
}

export interface History {
  oid: number
  epid: number
  bvid: string
  page: number
  cid: number
  part: string
  business: string
  dt: number
}

export interface Page {
  pn: number
  total: number
}
