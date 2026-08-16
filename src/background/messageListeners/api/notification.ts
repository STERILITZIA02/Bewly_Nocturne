import {
  parseAtNotificationResponse,
  parseLikeNotificationResponse,
  parseReplyNotificationResponse,
  parseSystemHistoryNotificationResponse,
  parseSystemReadResponse,
  parseSystemUnifiedNotificationResponse,
  parseSystemUserNotificationResponse,
} from '../../notificationJson'
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
  // The current message-pc client uses the first authenticated GET as the At
  // category read mutation; subsequent pages send string `id` plus `at_time`.
  getAtNotifications: {
    url: 'https://api.bilibili.com/x/msgfeed/at',
    _fetch: {
      method: 'get',
    },
    params: {
      platform: 'web',
      build: 0,
      mobi_app: 'web',
      id: undefined as string | undefined,
      at_time: undefined as number | undefined,
    },
    afterHandle: [parseAtNotificationResponse],
  },
  // Like keeps `latest` and `total` groups, but only `total.cursor` drives the
  // original client's next request. Its first GET also owns category read.
  getLikeNotifications: {
    url: 'https://api.bilibili.com/x/msgfeed/like',
    _fetch: {
      method: 'get',
    },
    params: {
      platform: 'web',
      build: 0,
      mobi_app: 'web',
      id: undefined as string | undefined,
      like_time: undefined as number | undefined,
    },
    afterHandle: [parseLikeNotificationResponse],
  },
  // The current message-pc release loads two independent first-page sources,
  // then merges them by cursor before using the single legacy history stream.
  getSystemUnifiedNotifications: {
    url: 'https://message.bilibili.com/x/sys-msg/query_unified_notify',
    _fetch: {
      method: 'get',
      headers: {
        Referer: 'https://message.bilibili.com/',
      },
    },
    params: {
      page_size: 10,
      build: 0,
      mobi_app: 'web',
    },
    afterHandle: [parseSystemUnifiedNotificationResponse],
  },
  getSystemUserNotifications: {
    url: 'https://message.bilibili.com/x/sys-msg/query_user_notify',
    _fetch: {
      method: 'get',
      headers: {
        Referer: 'https://message.bilibili.com/',
      },
    },
    params: {
      page_size: 20,
      build: 0,
      mobi_app: 'web',
    },
    afterHandle: [parseSystemUserNotificationResponse],
  },
  getSystemNotificationHistory: {
    url: 'https://message.bilibili.com/x/sys-msg/query_notify_list',
    _fetch: {
      method: 'get',
      headers: {
        Referer: 'https://message.bilibili.com/',
      },
    },
    params: {
      cursor: '' as string,
      data_type: 1,
      build: 0,
      mobi_app: 'web',
    },
    afterHandle: [parseSystemHistoryNotificationResponse],
  },
  // System does not gain a local read shortcut. The first-page adapter only
  // publishes success after this real message-pc update_cursor GET succeeds.
  markSystemNotificationsRead: {
    url: 'https://message.bilibili.com/x/sys-msg/update_cursor',
    _fetch: {
      method: 'get',
      headers: {
        Referer: 'https://message.bilibili.com/',
      },
    },
    params: {
      cursor: '' as string,
      has_up: 0,
      build: 0,
      mobi_app: 'web',
    },
    afterHandle: [parseSystemReadResponse],
  },
} satisfies APIMAP

export default API_NOTIFICATION
