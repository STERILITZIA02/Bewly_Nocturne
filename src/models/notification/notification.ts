export interface RawNotificationApiResponse<T> {
  code: number
  message: string
  ttl?: number
  data: T
}

export interface RawNotificationUser {
  mid?: string
  nickname?: string
  avatar?: string
  [key: string]: unknown
}

export interface RawNotificationSubject {
  business?: string
  business_id?: string
  type?: number | string
  subject_id?: string
  source_id?: string
  root_id?: string
  target_id?: string
  item_id?: string
  source_content?: string
  target_reply_content?: string
  title?: string
  desc?: string
  image?: string
  uri?: string
  hide_reply_button?: boolean
  at_details?: unknown[]
  danmu?: {
    aid?: string
    progress?: number
    [key: string]: unknown
  }
  [key: string]: unknown
}

export interface RawNotificationItem {
  id: string
  user?: RawNotificationUser
  users?: RawNotificationUser[]
  item?: RawNotificationSubject
  counts?: number
  is_multi?: number
  reply_time?: number
  at_time?: number
  like_time?: number
  notice_state?: number
  like_state?: number
  [key: string]: unknown
}

export interface RawNotificationCursor {
  id?: string
  time?: number
  is_end?: boolean
  [key: string]: unknown
}

export interface RawNotificationFeedData {
  cursor?: RawNotificationCursor
  items?: RawNotificationItem[]
  last_view_at?: number
  [key: string]: unknown
}

export interface RawLikeNotificationFeedData {
  latest?: {
    last_view_at?: number
    items?: RawNotificationItem[]
    [key: string]: unknown
  }
  total?: {
    cursor?: RawNotificationCursor
    items?: RawNotificationItem[]
    [key: string]: unknown
  }
  [key: string]: unknown
}

export interface RawSystemNotification {
  id: string
  cursor?: string
  title?: string
  time_at?: number
  content?: string
  [key: string]: unknown
}

export interface RawSystemNotificationData {
  system_notify_list?: RawSystemNotification[]
  cursor?: string
  has_more?: number
  [key: string]: unknown
}

export interface RawPrivateAccountInfo {
  uid?: string
  name?: string
  pic_url?: string
  [key: string]: unknown
}

export interface RawPrivateMessage {
  msg_key: string
  msg_seqno: string
  sender_uid: string
  receiver_id: string
  receiver_type: number
  msg_type: number
  msg_status: number
  timestamp: number
  content: string
  msg_source?: number
  notify_code?: string
  new_face_version?: number
  [key: string]: unknown
}

export interface RawPrivateSession {
  session_ts: string
  max_seqno: string
  talker_id: string
  session_type: number
  last_msg?: RawPrivateMessage
  system_msg_type?: number
  account_info?: RawPrivateAccountInfo
  group_cover?: string
  group_name?: string
  unread_count?: number
  biz_msg_unread_count?: number
  is_dnd?: number
  new_push_msg?: number
  is_follow?: number
  is_intercept?: number
  is_trust?: number
  top_ts?: string
  ack_ts?: string
  canal_token?: string
  [key: string]: unknown
}

export interface RawPrivateSessionsData {
  session_list?: RawPrivateSession[]
  has_more?: number
  [key: string]: unknown
}

export interface RawPrivateMessageHistoryData {
  messages?: RawPrivateMessage[]
  max_seqno?: string
  min_seqno?: string
  has_more?: number
  e_infos?: unknown[]
  [key: string]: unknown
}

export interface RawPrivateMessageSendData {
  msg_key: string
  [key: string]: unknown
}

export interface RawMessageSettings {
  msg_notify?: number
  ai_intercept?: number
  should_receive_group?: number
  is_group_fold?: number
  receive_unfollow_msg?: number
  show_unfollowed_msg?: number
  set_comment?: number
  set_at?: number
  set_like?: number
  followed_reply?: number
  keys_reply?: number
  recv_reply?: number
  voyage_reply?: number
  anti_harassment?: {
    open?: number
    show?: number
    flow_me_open?: number
    me_flow_open?: number
    expire_date?: string
    [key: string]: unknown
  }
  [key: string]: unknown
}

export interface RawAutoReplyText {
  id?: string
  type?: number
  reply?: string
  title?: string
  key1?: string
  key2?: string
  [key: string]: unknown
}

export interface RawBlockWord {
  id?: string
  content: string
  [key: string]: unknown
}

export interface RawBlockWordsData {
  words?: RawBlockWord[]
  max_words_size?: number
  max_word_length?: number
  [key: string]: unknown
}

export interface RawPrivateImageUploadData {
  image_url?: string
  image_width?: number
  image_height?: number
  [key: string]: unknown
}
