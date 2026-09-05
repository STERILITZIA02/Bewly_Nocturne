import type { ThreePointV2 } from '~/models/video/appForYou'

export interface Video {
  id: number
  duration?: number
  durationStr?: string
  title: string
  desc?: string
  cover: string

  /** `author` for individual submissions by UP; `authorList` for collaborative submissions by UP */
  author?: Author | Author[]

  view?: number
  viewStr?: string
  danmaku?: number
  danmakuStr?: string
  like?: number
  likeStr?: string

  publishedTimestamp?: number
  capsuleText?: string

  bvid?: string
  aid?: number
  // used for live
  roomid?: number
  epid?: number
  goto?: string
  param?: string
  /** After set the `url`, clicking the video will navigate to this url. It won't be affected by aid, bvid or epid */
  url?: string
  /** Better to provide cid, otherwise video preview will need to call another API to get it */
  cid?: number

  followed?: boolean
  liveStatus?: number
  trackId?: string

  /** Non-interactive labels such as recommendation reasons or status badges. */
  displayTags?: string[]
  /** Video content tags that open a corresponding search. */
  searchableTags?: string[]
  /** Legacy adapter input. Normalized as non-interactive before rendering. */
  tag?: string | string[]
  rank?: number
  type?: 'horizontal' | 'vertical' | 'bangumi' | 'ketang'
  threePointV2: ThreePointV2[]

  badge?: {
    bgColor: string
    color: string
    iconUrl?: string
    text: string
  }
}

export interface Author {
  name?: string
  /** After set the `authorUrl`, clicking the author's name or avatar will navigate to this url. It won't be affected by mid */
  authorUrl?: string
  authorFace: string
  followed?: boolean | undefined
  mid?: number
}

// 预处理的显示数据，减少模板中的计算
export interface VideoCardDisplayData extends Video {
  author: Required<Pick<Author, 'name' | 'authorFace' | 'followed' | 'mid'>>
  bvid: string
}
