export interface DisplayRichTextSegment {
  type: 'text' | 'emoji' | 'link'
  text: string
  imageUrl?: string
  url?: string
  size?: number
}

export interface DisplayForwardVideo {
  title: string
  cover: string
  duration: string
  play: string
  danmaku: string
  url: string
  aid?: number | string
  bvid?: string
}

export interface WatchLaterTarget {
  aid?: number | string
  bvid?: string
  epid?: number
}

export interface DisplayAdditional {
  title: string
  desc: string
  cover: string
  action: string
  url: string
  isUpRecommendation: boolean
  isVideoReservation: boolean
  isLiveReservation: boolean
  isVote: boolean
  voteId?: string
  voteEndTime: number
  reservationId?: string
  reservationTotal?: number
  isReserved?: boolean
}

export interface DisplayMoment {
  id: string
  author: { mid: string, name: string, face: string }
  publishedAt: number
  title: string
  text: string
  /** 视频正文来自动态/投稿简介回退，而非 UP 单独发布的动态正文。 */
  descInherited?: boolean
  richText: DisplayRichTextSegment[]
  images: string[]
  /** 与 images 按索引对齐的宽高比；未知项为 null。 */
  imageRatios?: Array<number | null>
  time: string
  likeCount: number
  isLiked: boolean
  isLikeDisabled: boolean
  commentCount: number
  forwardCount: number
  /** 评论 API 的权威 oid，来自动态 basic.comment_id_str */
  commentId?: string
  /** 评论 API 的权威 type，来自动态 basic.comment_type */
  commentType?: number
  /** 动态列表接口附带的评论互动摘要（type = 1） */
  hotComment?: {
    text: string
    richText: DisplayRichTextSegment[]
  }
  url: string
  isVideo: boolean
  /** 普通视频动态（不含合集订阅） */
  isRegularVideo: boolean
  /** 合集视频动态 */
  isUgcSeason: boolean
  /** 图文动态 */
  isDraw: boolean
  /** 追番追剧类 PGC 动态 */
  isPgc: boolean
  isLive: boolean
  /** 充电专属动态（未解锁时列表可能无正文/图片） */
  isChargeExclusive: boolean
  /** 转发动态：详情不做图片左置分栏，快速直出 */
  isForward: boolean
  /** 专栏动态：详情走专栏布局（可有目录） */
  isArticle: boolean
  /** 是否带有“UP主的推荐”附加信息，用于整条动态过滤 */
  isUpRecommendation: boolean
  /** 是否为视频预约动态，用于整条动态过滤 */
  isVideoReservation: boolean
  /** 是否为直播预约动态，用于整条动态过滤 */
  isLiveReservation: boolean
  chargeBadge?: string
  chargeHint?: string
  chargeCover?: string
  mediaMeta: string
  liveArea: string
  livePopularity: string
  roomId?: number
  duration: string
  videoPlay: string
  videoDanmaku: string
  aid?: number | string
  bvid?: string
  epid?: number
  videoUrl?: string
  additional?: DisplayAdditional
  forward?: {
    id: string
    url: string
    authorMid: string
    isArticle: boolean
    author: string
    title: string
    text: string
    fallback: string
    /** 转发原动态的图片，用于在嵌套卡片中保持原卡片形态 */
    images?: string[]
    imageRatios?: Array<number | null>
    video?: DisplayForwardVideo
  }
}
