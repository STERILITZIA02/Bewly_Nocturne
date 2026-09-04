import { serializeMomentVoteBody } from '../../momentVoteSerializer'
import type { APIMAP } from '../../utils'
import { AHS } from '../../utils'

const API_MOMENT = {
  getMomentVote: {
    url: 'https://api.bilibili.com/x/vote/vote_info',
    _fetch: { method: 'get', strictParams: true },
    params: { vote_id: '' },
    afterHandle: AHS.J_D,
  },
  submitMomentVote: {
    url: 'https://api.bilibili.com/x/vote/do_vote',
    _fetch: {
      method: 'post',
      strictParams: true,
      headers: { 'Content-Type': 'application/json' },
      body: {
        vote_id: 0,
        votes: [] as number[],
        voter_uid: 0,
        status: 0,
        op_bit: 0,
        dynamic_id: '',
        csrf: '',
        csrf_token: '',
      },
      bodySerializer: serializeMomentVoteBody,
    },
    params: { csrf: '' },
    afterHandle: AHS.J_D,
  },
  getTopBarNewMomentsCount: {
    url: 'https://api.bilibili.com/x/web-interface/dynamic/entrance',
    _fetch: {
      method: 'get',
    },
    params: {},
    afterHandle: AHS.J_D,
  },
  getTopBarMoments: {
    url: 'https://api.bilibili.com/x/polymer/web-dynamic/v1/feed/nav',
    _fetch: {
      method: 'get',
    },
    params: {
      type: 'video',
      update_baseline: '',
      offset: '',
    },
    afterHandle: AHS.J_D,
  },
  getTopBarLiveMoments: {
    url: 'https://api.live.bilibili.com/xlive/web-ucenter/v1/xfetter/FeedList',
    _fetch: {
      method: 'get',
    },
    params: {
      page: 1,
      pagesize: 10,
    },
    afterHandle: AHS.J_D,
  },
  getMoments: {
    url: 'https://api.bilibili.com/x/polymer/web-dynamic/v1/feed/all',
    _fetch: {
      method: 'get',
    },
    params: {
      type: 'all',
      offset: '',
      update_baseline: '',
      // itemOpusStyle: 图文/纯文字走 opus 结构；listOnlyfans: 充电专属列表字段
      features: 'itemOpusStyle,listOnlyfans,opusBigCover,onlyfansVote,decorationCard,onlyfansAssetsV2,forwardListHidden,ugcDelete,onlyfansQaCard',
    },
    afterHandle: AHS.J_D,
  },
  getMomentsPortal: {
    url: 'https://api.bilibili.com/x/polymer/web-dynamic/v1/portal',
    _fetch: {
      method: 'get',
    },
    params: {
      up_list_more: 1,
      web_location: '333.1365',
    },
    afterHandle: AHS.J_D,
  },
  getMomentDetail: {
    url: 'https://api.bilibili.com/x/polymer/web-dynamic/v1/detail',
    _fetch: {
      method: 'get',
    },
    params: {
      id: '',
      features: 'itemOpusStyle,listOnlyfans,opusBigCover,onlyfansVote,decorationCard,onlyfansAssetsV2,htmlNewStyle',
    },
    afterHandle: AHS.J_D,
  },
  getMomentComments: {
    url: 'https://api.bilibili.com/x/v2/reply',
    _fetch: {
      method: 'get',
    },
    params: {
      type: 1,
      oid: '' as string | number,
      sort: 0,
      nohot: 0,
      pn: 1,
      ps: 8,
    },
    afterHandle: AHS.J_D,
  },
  getMomentCommentReplies: {
    url: 'https://api.bilibili.com/x/v2/reply/reply',
    _fetch: {
      method: 'get',
    },
    params: {
      type: 1,
      oid: '' as string | number,
      root: '',
      pn: 1,
      ps: 20,
    },
    afterHandle: AHS.J_D,
  },
  getMomentEmotes: {
    url: 'https://api.bilibili.com/x/emote/user/panel/web',
    _fetch: {
      method: 'get',
    },
    params: {
      business: 'dynamic',
    },
    afterHandle: AHS.J_D,
  },
  searchMomentTopics: {
    url: 'https://app.bilibili.com/x/topic/pub/search',
    _fetch: {
      method: 'get',
    },
    params: {
      keywords: '',
      content: '',
      page_size: 10,
      page_num: 1,
      web_location: '333.1365',
    },
    afterHandle: AHS.J_D,
  },
  // Current Web publishing traffic uses CSRF + JSON and x-bili-device-req-json here.
  // It does not send x-bili-web-req-json or require client-side WBI signing.
  checkMomentCreate: {
    url: 'https://api.bilibili.com/x/dynamic/feed/create/submit_check',
    _fetch: {
      method: 'post',
      headers: {
        'Content-Type': 'application/json',
      },
      body: {
        content: {} as Record<string, unknown>,
        pics: [] as unknown[],
        attach_card: null as null,
        scene: 4,
        create_option: {} as Record<string, unknown>,
      },
    },
    params: {
      platform: 'web',
      csrf: '',
      'x-bili-device-req-json': '{"platform":"web","device":"pc","spmid":"333.1365"}',
    },
    afterHandle: AHS.J_D,
  },
  createMoment: {
    url: 'https://api.bilibili.com/x/dynamic/feed/create/dyn',
    _fetch: {
      method: 'post',
      headers: {
        'Content-Type': 'application/json',
      },
      body: {
        dyn_req: {} as Record<string, unknown>,
        web_repost_src: {} as Record<string, unknown>,
      },
    },
    params: {
      platform: 'web',
      csrf: '',
      'x-bili-device-req-json': '{"platform":"web","device":"pc","spmid":"333.1365"}',
    },
    afterHandle: AHS.J_D,
  },
  setMomentCommentLike: {
    url: 'https://api.bilibili.com/x/v2/reply/action',
    _fetch: {
      method: 'post',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      },
      body: {
        oid: '' as string | number,
        type: 1,
        rpid: '',
        action: 1 as 0 | 1,
        csrf: '',
      },
    },
    afterHandle: AHS.J_D,
  },

  setMomentLike: {
    url: 'https://api.bilibili.com/x/dynamic/feed/dyn/thumb',
    _fetch: {
      method: 'post',
      headers: {
        'Content-Type': 'application/json',
      },
      body: {
        dyn_id_str: '',
        up: 1,
        spmid: '333.1369.0.0',
        from_spmid: '333.999.0.0',
      },
    },
    params: {
      csrf: '',
    },
    afterHandle: AHS.J_D,
  },
  reserveMoment: {
    url: 'https://api.bilibili.com/x/space/reserve',
    _fetch: {
      method: 'post',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      },
      body: {
        sid: '',
        csrf: '',
      },
    },
    afterHandle: AHS.J_D,
  },
  cancelMomentReservation: {
    url: 'https://api.bilibili.com/x/space/reserve/cancel',
    _fetch: {
      method: 'post',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      },
      body: {
        sid: '',
        csrf: '',
      },
    },
    afterHandle: AHS.J_D,
  },
  getMomentsByUp: {
    url: 'https://api.bilibili.com/x/polymer/web-dynamic/v1/feed/all',
    _fetch: {
      method: 'get',
    },
    params: {
      host_mid: '',
      type: 'all',
      offset: '',
      update_baseline: '',
      page: 1,
      platform: 'web',
      // itemOpusStyle: 图文/纯文字走 opus 结构；listOnlyfans: 充电专属列表字段
      features: 'itemOpusStyle,listOnlyfans,opusBigCover,onlyfansVote,decorationCard,onlyfansAssetsV2,forwardListHidden,ugcDelete,onlyfansQaCard',
      web_location: '333.1365',
    },
    afterHandle: AHS.J_D,
  },
  getUserMoments: {
    url: 'https://api.bilibili.com/x/polymer/web-dynamic/v1/feed/space',
    _fetch: {
      method: 'get',
    },
    params: {
      host_mid: '',
      offset: '',
      features: 'itemOpusStyle',
    },
    afterHandle: AHS.J_D,
  },
  getMomentsUpdate: {
    url: 'https://api.bilibili.com/x/polymer/web-dynamic/v1/feed/all/update',
    _fetch: {
      method: 'get',
    },
    params: {
      type: 'video',
      offset: '',
      update_baseline: '0',
    },
    afterHandle: AHS.J_D,
  },
} satisfies APIMAP

export default API_MOMENT
