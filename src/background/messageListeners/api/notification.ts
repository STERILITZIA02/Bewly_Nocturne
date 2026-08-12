import { parseReplyNotificationResponse } from '../../notificationJson'
import type { APIMAP } from '../../utils'
import { AHS } from '../../utils'

const API_NOTIFICATION = {
  getUnreadMsg: {
    url: 'https://api.bilibili.com/x/msgfeed/unread',
    _fetch: {
      method: 'get',
    },
    params: {
      build: 0,
      mobi_app: 'web',
    },
    afterHandle: AHS.J_D,
  },
  getUnreadDm: {
    url: 'https://api.vc.bilibili.com/session_svr/v1/session_svr/single_unread',
    _fetch: {
      method: 'get',
    },
    params: {
      build: 0,
      mobi_app: 'web',
      unread_type: 0,
    },
    afterHandle: AHS.J_D,
  },
  // Verified against the current message-pc client: the first page omits the
  // cursor, later pages send string `id` plus numeric `reply_time`, and this
  // authenticated GET owns the Reply read side effect (no CSRF/notice POST).
  getReplyNotifications: {
    url: 'https://api.bilibili.com/x/msgfeed/reply',
    _fetch: {
      method: 'get',
    },
    params: {
      platform: 'web',
      build: 0,
      mobi_app: 'web',
      id: undefined as string | undefined,
      reply_time: undefined as number | undefined,
    },
    afterHandle: [parseReplyNotificationResponse],
  },
} satisfies APIMAP

export default API_NOTIFICATION
