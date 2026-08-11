import type Browser from 'webextension-polyfill'
import browser from 'webextension-polyfill'

import type { RawNotificationApiResponse, RawPrivateImageUploadData, RawPrivateMessageSendData } from '../../../models/notification/notification'
import { FIREFOX_CONTAINER_COOKIE_HEADER, serializeCookiesForUrl } from '../../firefoxCookies'
import { parseLosslessNotificationResponse } from '../../notificationJson'
import type { APIMAP, Message } from '../../utils'
import { addWbiSign, clearWbiKeys, getWbiKeys, initWbiKeys } from '../../wbiSign'

const API_ORIGIN = 'https://api.bilibili.com'
const IM_API_ORIGIN = 'https://api.vc.bilibili.com'
const MESSAGE_ORIGIN = 'https://message.bilibili.com'
const FORM_HEADERS = {
  'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
}
const IM_FORM_HEADERS = {
  ...FORM_HEADERS,
  Referer: `${MESSAGE_ORIGIN}/`,
}
const WEB_PARAMS = {
  build: 0,
  mobi_app: 'web',
}
const LOSSLESS_RESPONSE = [parseLosslessNotificationResponse]

interface SendPrivateMessageRequest extends Message {
  sender_uid: string
  receiver_id: string
  receiver_type: number
  msg_type: number
  content: string
  new_face_version: number
  csrf: string
  canal_token?: string
  dev_id?: string
}

interface UploadPrivateMessageImageRequest extends Message {
  dataUrl: string
  fileName: string
  mimeType: string
  csrf: string
}

const imDeviceIds = new Map<string, string>()

function getImDeviceId(senderUid: string, providedDeviceId?: string): string {
  if (providedDeviceId) {
    imDeviceIds.set(senderUid, providedDeviceId)
    return providedDeviceId
  }

  const cached = imDeviceIds.get(senderUid)
  if (cached)
    return cached

  const deviceId = crypto.randomUUID().toUpperCase()
  imDeviceIds.set(senderUid, deviceId)
  return deviceId
}

async function createRequestHeaders(
  requestUrl: string,
  sender?: Browser.Runtime.MessageSender,
): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    Referer: `${MESSAGE_ORIGIN}/`,
  }

  // eslint-disable-next-line node/prefer-global/process
  if (process.env.FIREFOX && sender?.tab?.id) {
    const tab = await browser.tabs.get(sender.tab.id)
    const cookies = await browser.cookies.getAll({
      storeId: tab.cookieStoreId || 'default',
    })
    const cookieHeader = serializeCookiesForUrl(cookies, requestUrl)
    if (cookieHeader)
      headers[FIREFOX_CONTAINER_COOKIE_HEADER] = cookieHeader
  }

  return headers
}

async function sendPrivateMessage(
  message: SendPrivateMessageRequest,
  sender?: Browser.Runtime.MessageSender,
): Promise<RawNotificationApiResponse<RawPrivateMessageSendData>> {
  const {
    sender_uid,
    receiver_id,
    receiver_type,
    msg_type,
    content,
    new_face_version,
    csrf,
    canal_token,
    dev_id,
  } = message
  const deviceId = getImDeviceId(sender_uid, dev_id)
  const endpoint = `${IM_API_ORIGIN}/web_im/v1/web_im/send_msg`

  if (!getWbiKeys())
    await initWbiKeys()

  const performRequest = async (): Promise<RawNotificationApiResponse<RawPrivateMessageSendData>> => {
    const requestUrl = new URL(endpoint)
    const signedParams = addWbiSign({
      w_sender_uid: sender_uid,
      w_receiver_id: receiver_id,
      w_dev_id: deviceId,
    })
    Object.entries(signedParams).forEach(([key, value]) => {
      requestUrl.searchParams.set(key, String(value))
    })

    const msg = {
      sender_uid,
      receiver_id,
      receiver_type,
      msg_type,
      msg_status: 0,
      content,
      new_face_version,
      dev_id: deviceId,
      timestamp: Math.floor(Date.now() / 1000),
      canal_token,
    }
    const body = new URLSearchParams({
      from_firework: '0',
      build: '0',
      mobi_app: 'web',
      csrf,
    })
    Object.entries(msg).forEach(([key, value]) => {
      if (value !== undefined)
        body.set(`msg[${key}]`, String(value))
    })

    const headers = await createRequestHeaders(requestUrl.href, sender)
    const response = await fetch(requestUrl, {
      method: 'POST',
      headers: {
        ...headers,
        ...FORM_HEADERS,
      },
      body,
      credentials: 'include',
    })
    return await parseLosslessNotificationResponse(response) as RawNotificationApiResponse<RawPrivateMessageSendData>
  }

  let result = await performRequest()
  if (result && typeof result === 'object' && 'code' in result && result.code === -403) {
    clearWbiKeys()
    if (await initWbiKeys())
      result = await performRequest()
  }
  return result
}

async function uploadPrivateMessageImage(
  message: UploadPrivateMessageImageRequest,
  sender?: Browser.Runtime.MessageSender,
): Promise<RawNotificationApiResponse<RawPrivateImageUploadData>> {
  const endpoint = `${API_ORIGIN}/x/dynamic/feed/draw/upload_bfs`
  const dataResponse = await fetch(message.dataUrl)
  const sourceBlob = await dataResponse.blob()
  const imageBlob = sourceBlob.type === message.mimeType
    ? sourceBlob
    : new Blob([sourceBlob], { type: message.mimeType })
  const body = new FormData()
  body.append('file_up', imageBlob, message.fileName)
  body.append('biz', 'im')
  body.append('csrf', message.csrf)

  const headers = await createRequestHeaders(endpoint, sender)
  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body,
    credentials: 'include',
  })
  return await parseLosslessNotificationResponse(response) as RawNotificationApiResponse<RawPrivateImageUploadData>
}

const API_NOTIFICATION = {
  getUnreadMsg: {
    url: `${API_ORIGIN}/x/msgfeed/unread`,
    _fetch: { method: 'get' },
    params: { ...WEB_PARAMS },
    afterHandle: LOSSLESS_RESPONSE,
  },
  getUnreadDm: {
    url: `${IM_API_ORIGIN}/session_svr/v1/session_svr/single_unread`,
    _fetch: { method: 'get' },
    params: { ...WEB_PARAMS, unread_type: 0 },
    afterHandle: LOSSLESS_RESPONSE,
  },
  getSupportGroupUnread: {
    url: `${IM_API_ORIGIN}/session_svr/v1/session_svr/my_group_unread`,
    _fetch: { method: 'get' },
    params: { ...WEB_PARAMS },
    afterHandle: LOSSLESS_RESPONSE,
  },
  getReplyNotifications: {
    url: `${API_ORIGIN}/x/msgfeed/reply`,
    _fetch: { method: 'get' },
    params: {
      ...WEB_PARAMS,
      platform: 'web',
      id: undefined as string | undefined,
      reply_time: undefined as number | undefined,
    },
    afterHandle: LOSSLESS_RESPONSE,
  },
  getAtNotifications: {
    url: `${API_ORIGIN}/x/msgfeed/at`,
    _fetch: { method: 'get' },
    params: {
      ...WEB_PARAMS,
      platform: 'web',
      id: undefined as string | undefined,
      at_time: undefined as number | undefined,
    },
    afterHandle: LOSSLESS_RESPONSE,
  },
  getLikeNotifications: {
    url: `${API_ORIGIN}/x/msgfeed/like`,
    _fetch: { method: 'get' },
    params: {
      ...WEB_PARAMS,
      platform: 'web',
      id: undefined as string | undefined,
      like_time: undefined as number | undefined,
    },
    afterHandle: LOSSLESS_RESPONSE,
  },
  getUnifiedSystemNotifications: {
    url: `${MESSAGE_ORIGIN}/x/sys-msg/query_unified_notify`,
    _fetch: { method: 'get' },
    params: { ...WEB_PARAMS, page_size: 10 },
    afterHandle: LOSSLESS_RESPONSE,
  },
  getUserSystemNotifications: {
    url: `${MESSAGE_ORIGIN}/x/sys-msg/query_user_notify`,
    _fetch: { method: 'get' },
    params: { ...WEB_PARAMS, page_size: 20 },
    afterHandle: LOSSLESS_RESPONSE,
  },
  getSystemNotificationList: {
    url: `${MESSAGE_ORIGIN}/x/sys-msg/query_notify_list`,
    _fetch: { method: 'get' },
    params: {
      ...WEB_PARAMS,
      cursor: '' as string,
      data_type: 1,
    },
    afterHandle: LOSSLESS_RESPONSE,
  },
  updateSystemNotificationCursor: {
    url: `${MESSAGE_ORIGIN}/x/sys-msg/update_cursor`,
    _fetch: { method: 'get' },
    params: {
      ...WEB_PARAMS,
      cursor: '' as string,
      has_up: 0,
    },
    afterHandle: LOSSLESS_RESPONSE,
  },
  deleteNotification: {
    url: `${API_ORIGIN}/x/msgfeed/del`,
    _fetch: {
      method: 'post',
      headers: FORM_HEADERS,
      body: {
        tp: 0,
        id: '' as string,
        csrf: '' as string,
        ...WEB_PARAMS,
      },
    },
    afterHandle: LOSSLESS_RESPONSE,
  },
  updateNotificationNotice: {
    url: `${API_ORIGIN}/x/msgfeed/notice`,
    _fetch: {
      method: 'post',
      headers: FORM_HEADERS,
      body: {
        tp: 0,
        notice_state: 0,
        id: '' as string,
        platform: 'web',
        csrf: '' as string,
        ...WEB_PARAMS,
      },
    },
    afterHandle: LOSSLESS_RESPONSE,
  },
  replyNotificationLike: {
    url: `${API_ORIGIN}/x/v2/reply/action`,
    _fetch: {
      method: 'post',
      headers: FORM_HEADERS,
      body: {
        scene: 'msg',
        from: 'im-reply',
        oid: '' as string,
        type: 1,
        rpid: '' as string,
        action: 1,
        csrf: '' as string,
        ...WEB_PARAMS,
      },
    },
    afterHandle: LOSSLESS_RESPONSE,
  },
  directMessageNotificationLike: {
    url: `${API_ORIGIN}/x/v2/dm/thumbup/add`,
    _fetch: {
      method: 'post',
      headers: FORM_HEADERS,
      body: {
        oid: '' as string,
        dmid: '' as string,
        op: 1,
        csrf: '' as string,
        ...WEB_PARAMS,
      },
    },
    afterHandle: LOSSLESS_RESPONSE,
  },
  replyDirectMessageNotification: {
    url: `${API_ORIGIN}/x/v2/dm/post`,
    _fetch: {
      method: 'post',
      headers: FORM_HEADERS,
      body: {
        msg: '' as string,
        oid: '' as string,
        type: 1,
        aid: '' as string,
        progress: 0,
        rnd: 0,
        color: 16777215,
        fontsize: 25,
        pool: 0,
        mode: 1,
        plat: 1,
        csrf: '' as string,
        ...WEB_PARAMS,
      },
    },
    afterHandle: LOSSLESS_RESPONSE,
  },
  replyNotification: {
    url: `${API_ORIGIN}/x/v2/reply/add`,
    _fetch: {
      method: 'post',
      headers: FORM_HEADERS,
      body: {
        oid: '' as string,
        type: 1,
        message: '' as string,
        scene: 'msg',
        plat: 1,
        from: 'im-reply',
        root: undefined as string | undefined,
        parent: undefined as string | undefined,
        csrf: '' as string,
        ...WEB_PARAMS,
      },
    },
    afterHandle: LOSSLESS_RESPONSE,
  },
  getSessions: {
    url: `${IM_API_ORIGIN}/session_svr/v1/session_svr/get_sessions`,
    _fetch: { method: 'get' },
    params: {
      ...WEB_PARAMS,
      session_type: 1,
      group_fold: 1,
      unfollow_fold: 1,
      sort_rule: 2,
      begin_ts: undefined as string | undefined,
      end_ts: undefined as string | undefined,
      size: 20,
    },
    afterHandle: LOSSLESS_RESPONSE,
  },
  getNewSessions: {
    url: `${IM_API_ORIGIN}/session_svr/v1/session_svr/new_sessions`,
    _fetch: { method: 'get' },
    params: {
      ...WEB_PARAMS,
      begin_ts: '' as string | number,
      session_type: 1,
      group_fold: 1,
      unfollow_fold: 1,
      sort_rule: 1,
    },
    afterHandle: LOSSLESS_RESPONSE,
  },
  ackSessions: {
    url: `${IM_API_ORIGIN}/session_svr/v1/session_svr/ack_sessions`,
    _fetch: { method: 'get' },
    params: {
      ...WEB_PARAMS,
      begin_ts: '' as string | number,
    },
    afterHandle: LOSSLESS_RESPONSE,
  },
  getSessionDetail: {
    url: `${IM_API_ORIGIN}/session_svr/v1/session_svr/session_detail`,
    _fetch: { method: 'get' },
    params: {
      talker_id: '' as string,
      session_type: 1 as string | number,
    },
    afterHandle: LOSSLESS_RESPONSE,
  },
  getSessionHistory: {
    url: `${IM_API_ORIGIN}/svr_sync/v1/svr_sync/fetch_session_msgs`,
    _fetch: { method: 'get' },
    params: {
      ...WEB_PARAMS,
      size: 20,
      session_type: 1 as string | number,
      talker_id: '' as string,
      begin_seqno: undefined as string | undefined,
      end_seqno: undefined as string | undefined,
      sender_device_id: '1',
    },
    afterHandle: LOSSLESS_RESPONSE,
  },
  updateSessionAck: {
    url: `${IM_API_ORIGIN}/session_svr/v1/session_svr/update_ack`,
    _fetch: {
      method: 'post',
      headers: IM_FORM_HEADERS,
      body: {
        talker_id: '' as string,
        session_type: 1 as string | number,
        ack_seqno: '' as string,
        csrf: '' as string,
        ...WEB_PARAMS,
      },
    },
    afterHandle: LOSSLESS_RESPONSE,
  },
  setSessionTop: {
    url: `${IM_API_ORIGIN}/session_svr/v1/session_svr/set_top`,
    _fetch: {
      method: 'post',
      headers: IM_FORM_HEADERS,
      body: {
        talker_id: '' as string,
        session_type: 1 as string | number,
        op_type: 1,
        csrf: '' as string,
        ...WEB_PARAMS,
      },
    },
    afterHandle: LOSSLESS_RESPONSE,
  },
  setSessionDoNotDisturb: {
    url: `${IM_API_ORIGIN}/link_setting/v1/link_setting/set_msg_dnd`,
    _fetch: {
      method: 'post',
      headers: IM_FORM_HEADERS,
      body: {
        uid: '' as string,
        dnd_uid: undefined as string | undefined,
        dnd_group_id: undefined as string | undefined,
        setting: 1,
        csrf: '' as string,
        ...WEB_PARAMS,
      },
    },
    afterHandle: LOSSLESS_RESPONSE,
  },
  removeSession: {
    url: `${IM_API_ORIGIN}/session_svr/v1/session_svr/remove_session`,
    _fetch: {
      method: 'post',
      headers: IM_FORM_HEADERS,
      body: {
        talker_id: '' as string,
        session_type: 1 as string | number,
        csrf: '' as string,
        ...WEB_PARAMS,
      },
    },
    afterHandle: LOSSLESS_RESPONSE,
  },
  fetchMessageDetail: {
    url: `${IM_API_ORIGIN}/x/im/sync_msg_svr/v1/fetch_msg_detail`,
    _fetch: {
      method: 'post',
      headers: IM_FORM_HEADERS,
      body: {
        talker_id: '' as string,
        session_type: 1 as string | number,
        msg_details: '' as string,
        csrf: '' as string,
        ...WEB_PARAMS,
      },
    },
    afterHandle: LOSSLESS_RESPONSE,
  },
  getMessageSettings: {
    url: `${IM_API_ORIGIN}/link_setting/v1/link_setting/get`,
    _fetch: { method: 'get' },
    params: {
      ...WEB_PARAMS,
      msg_notify: 1,
      show_unfollowed_msg: 1,
    },
    afterHandle: LOSSLESS_RESPONSE,
  },
  setMessageSettings: {
    url: `${IM_API_ORIGIN}/link_setting/v1/link_setting/set`,
    _fetch: {
      method: 'post',
      headers: IM_FORM_HEADERS,
      body: {
        msg_notify: undefined as number | undefined,
        ai_intercept: undefined as number | undefined,
        should_receive_group: undefined as number | undefined,
        is_group_fold: undefined as number | undefined,
        receive_unfollow_msg: undefined as number | undefined,
        show_unfollowed_msg: undefined as number | undefined,
        set_comment: undefined as number | undefined,
        set_at: undefined as number | undefined,
        set_like: undefined as number | undefined,
        followed_reply: undefined as number | undefined,
        keys_reply: undefined as number | undefined,
        recv_reply: undefined as number | undefined,
        voyage_reply: undefined as number | undefined,
        csrf: '' as string,
        ...WEB_PARAMS,
      },
    },
    afterHandle: LOSSLESS_RESPONSE,
  },
  getSystemMessageSettings: {
    url: `${IM_API_ORIGIN}/link_setting/v1/link_setting/get_sys_setting`,
    _fetch: { method: 'get' },
    params: { ...WEB_PARAMS },
    afterHandle: LOSSLESS_RESPONSE,
  },
  setAntiHarassmentSettings: {
    url: `${IM_API_ORIGIN}/link_setting/v1/link_setting/set_anti_harassment`,
    _fetch: {
      method: 'post',
      headers: IM_FORM_HEADERS,
      body: {
        open: 0,
        show: 1,
        flow_me_open: 0,
        me_flow_open: 0,
        csrf: '' as string,
      },
    },
    afterHandle: LOSSLESS_RESPONSE,
  },
  getAutoReplyTexts: {
    url: `${IM_API_ORIGIN}/x/im/auto_reply/get_reply_text`,
    _fetch: { method: 'get' },
    params: {
      ...WEB_PARAMS,
      'type[]': 1,
    },
    afterHandle: LOSSLESS_RESPONSE,
  },
  setAutoReplyText: {
    url: `${IM_API_ORIGIN}/x/im/auto_reply/set_reply_text`,
    _fetch: {
      method: 'post',
      headers: IM_FORM_HEADERS,
      body: {
        type: 1,
        reply: '' as string,
        id: undefined as string | undefined,
        title: undefined as string | undefined,
        key1: undefined as string | undefined,
        key2: undefined as string | undefined,
        csrf: '' as string,
        ...WEB_PARAMS,
      },
    },
    afterHandle: LOSSLESS_RESPONSE,
  },
  deleteAutoReplyText: {
    url: `${IM_API_ORIGIN}/x/im/auto_reply/del_reply_text`,
    _fetch: {
      method: 'post',
      headers: IM_FORM_HEADERS,
      body: {
        id: '' as string,
        csrf: '' as string,
        ...WEB_PARAMS,
      },
    },
    afterHandle: LOSSLESS_RESPONSE,
  },
  getBlockWords: {
    url: `${IM_API_ORIGIN}/x/im/link_setting/get_block_words`,
    _fetch: { method: 'get' },
    params: { ...WEB_PARAMS },
    afterHandle: LOSSLESS_RESPONSE,
  },
  addBlockWord: {
    url: `${IM_API_ORIGIN}/x/im/link_setting/add_block_word`,
    _fetch: {
      method: 'post',
      headers: IM_FORM_HEADERS,
      body: {
        content: '' as string,
        csrf: '' as string,
      },
    },
    afterHandle: LOSSLESS_RESPONSE,
  },
  deleteBlockWord: {
    url: `${IM_API_ORIGIN}/x/im/link_setting/del_block_word`,
    _fetch: {
      method: 'post',
      headers: IM_FORM_HEADERS,
      body: {
        content: '' as string,
        csrf: '' as string,
      },
    },
    afterHandle: LOSSLESS_RESPONSE,
  },
  getAntiDisturb: {
    url: `${IM_API_ORIGIN}/x/im/anti_disturb/get_disturb`,
    _fetch: { method: 'get' },
    params: { scene: 1 },
    afterHandle: LOSSLESS_RESPONSE,
  },
  setAntiDisturb: {
    url: `${IM_API_ORIGIN}/x/im/anti_disturb/set_disturb`,
    _fetch: {
      method: 'post',
      headers: IM_FORM_HEADERS,
      body: {
        id: 0,
        is_open: 0,
        csrf: '' as string,
      },
    },
    afterHandle: LOSSLESS_RESPONSE,
  },
  sendPrivateMessage,
  uploadPrivateMessageImage,
} satisfies APIMAP

export default API_NOTIFICATION
