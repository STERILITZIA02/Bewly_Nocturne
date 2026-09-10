// https://github.com/SocialSisterYi/bilibili-API-collect/blob/e379d904c2753fa30e9083f59016f07e89d19467/docs/login/login_info.md#%E5%AF%BC%E8%88%AA%E6%A0%8F%E7%94%A8%E6%88%B7%E4%BF%A1%E6%81%AF
import type { Media as FavoriteMedia } from '~/models/video/favorite'

export interface UserInfo {
  face: string // avatar
  level_info: {
    current_level: number
    current_min: number
    current_exp: number
    next_exp: number
  }
  mid: number
  money: number // 硬幣
  uname: string // username
  vip: {
    status: number // 1 is vip
    due_date: number
  }
  wallet: {
    mid: number
    bcoin_balance: number // b幣
    coupon_balance: number // 每个月可领数量
  }
  wbi_img: {
    img_url: string
    sub_url: string
  }
  is_senior_member: boolean
}

/**
 * Number of follower, following and published posts by user
 */
export interface UserStat {
  dynamic_count: number
  follower: number
  following: number
}

// https://github.com/SocialSisterYi/bilibili-API-collect/blob/63da4454309e2599269125e24a6940b1feecedef/message/msg.md#%E6%9C%AA%E8%AF%BB%E6%B6%88%E6%81%AF%E6%95%B0
export interface UnReadMessage {
  at: number
  chat: number
  like: number
  reply: number
  sys_msg: number
  up: number
}

export interface UnReadDm {
  // https://api.vc.bilibili.com/session_svr/v1/session_svr/single_unread?build=0&mobi_app=web&unread_type=0
  unfollow_unread: number
  follow_unread: number
  unfollow_push_msg: number
  dustbin_push_msg: number
  dustbin_unread: number
  biz_msg_unfollow_unread: number
  biz_msg_follow_unread: number
}

export interface FavoriteCategory {
  id: number
  fid: number
  mid: number
  attr: number
  title: string
  fav_state: number
  media_count: number
}

// Both views consume the same resource/list DTO, including attr and original media type.
export type FavoriteResource = FavoriteMedia

export interface PopupVisibleState {
  channels: boolean
  userPanel: boolean
  notifications: boolean
  moments: boolean
  favorites: boolean
  history: boolean
  watchLater: boolean
  upload: boolean
  more: boolean
}

export interface TopBarItemElements {
  [key: string]: Ref<HTMLElement | undefined>
}

export interface TopBarTransformers {
  [key: string]: Ref<any>
}

// B币领取状态相关类型定义
export interface PrivilegeItem {
  type: number
  state: number // 0：未兑换 1：已兑换 2：未完成（若需要完成）
  expire_time: number
  vip_type: number
  next_receive_days: number
  period_end_unix: number
}

export interface PrivilegeInfo {
  list: PrivilegeItem[]
  is_vip: boolean
  vip_status: number
  vip_type: number
}
