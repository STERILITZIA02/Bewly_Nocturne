export const PRIVATE_MESSAGE_ENDPOINTS = {
  uploadPrivateImage: 'https://api.bilibili.com/x/dynamic/feed/draw/upload_bfs',
  getPrivateSessions: 'https://api.vc.bilibili.com/session_svr/v1/session_svr/get_sessions',
  getNewPrivateSessions: 'https://api.vc.bilibili.com/session_svr/v1/session_svr/new_sessions',
  getPrivateUserCards: 'https://api.vc.bilibili.com/account/v1/user/cards',
  getPrivateMessages: 'https://api.vc.bilibili.com/svr_sync/v1/svr_sync/fetch_session_msgs',
  ackPrivateSession: 'https://api.vc.bilibili.com/session_svr/v1/session_svr/update_ack',
  sendPrivateMessage: 'https://api.vc.bilibili.com/web_im/v1/web_im/send_msg',
} as const

export type PrivateMessageEndpointName = keyof typeof PRIVATE_MESSAGE_ENDPOINTS

export type PrivateMessageTransportErrorKind
  = | 'login-required'
    | 'risk-control'
    | 'server-error'
    | 'network'
    | 'invalid-response'
    | 'api-error'
    | 'wbi-unavailable'

export interface PrivateMessageTransportError {
  kind: PrivateMessageTransportErrorKind
  endpointName: PrivateMessageEndpointName
  httpStatus: number
  redirected: boolean
  finalHost: string
  apiCode?: number
}

export interface PrivateMessageApiResponse<T = unknown> {
  code: number
  data: T
  bewlyError?: PrivateMessageTransportError
}

export type PrivateMessageRequestParams = Record<string, string | number | boolean | undefined>

export type PrivateMessageSigningPolicy = 'required' | 'preferred'

export const PRIVATE_MESSAGE_SIGNING_POLICIES = {
  getPrivateSessions: 'preferred',
  getNewPrivateSessions: 'preferred',
  getPrivateUserCards: 'preferred',
  getPrivateMessages: 'preferred',
  ackPrivateSession: 'preferred',
  sendPrivateMessage: 'required',
} as const satisfies Partial<Record<PrivateMessageEndpointName, PrivateMessageSigningPolicy>>

export interface PrivateMessageFormRequest {
  url: string
  query: PrivateMessageRequestParams
  body: PrivateMessageRequestParams
}

export interface PrivateMessage {
  sender_uid: string
  receiver_type: number
  receiver_id: string
  msg_type: number
  content: string
  msg_seqno: string
  timestamp: number
  at_uids: unknown[]
  msg_key: string
  msg_status: number
  notify_code: string
  new_face_version: number
  msg_source: number
  [key: string]: unknown
}

export interface PrivateSession {
  talker_id: string
  session_type: number
  at_seqno: number
  top_ts: number
  group_name: string
  group_cover: string
  is_follow: number
  is_dnd: number
  ack_seqno: string
  ack_ts: number
  session_ts: number
  unread_count: number
  last_msg: PrivateMessage | null
  group_type: number
  can_fold: number
  status: number
  max_seqno: string
  new_push_msg: number
  setting: unknown
  is_guardian: number
  is_intercept: number
  is_trust: number
  system_msg_type: number
  account_info: {
    name: string
    pic_url: string
  } | null
  live_status: number
  biz_msg_unread_count: number
  [key: string]: unknown
}

export interface PrivateSessionsData {
  session_list: PrivateSession[]
  has_more: number
  [key: string]: unknown
}

export interface GetPrivateSessionsOptions {
  endTs?: number
}

export interface GetNewPrivateSessionsOptions {
  beginTs: number
}

export interface PrivateMessagesData {
  messages: PrivateMessage[]
  e_infos: unknown[]
  has_more: number
  min_seqno: string
  max_seqno: string
  [key: string]: unknown
}

export interface GetPrivateMessagesOptions {
  talkerId: string
  endSeqno?: string
  size?: number
}

export interface AckPrivateSessionOptions {
  talkerId: string
  ackSeqno: string
  csrf: string
}

export interface SendPrivateMessageOptions {
  senderId: string
  talkerId: string
  text: string
  csrf: string
  devId?: string
}

export interface UploadedPrivateImage {
  url: string
  width: number
  height: number
  size: number
  imageType: string
}

export interface PrivateImageUploadPayload {
  requestId: string
  fileName: string
  mimeType: string
  bytes: number[]
  csrf: string
}

export interface SendPrivateImageMessageOptions {
  senderId: string
  talkerId: string
  csrf: string
  uploaded: UploadedPrivateImage
  devId?: string
}

export interface PrivateSendData {
  msg_key?: string
  [key: string]: unknown
}
