import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import { createMomentFilter } from '../src/utils/momentFilter'
import { detectMomentPromotion } from '../src/utils/momentPromotion'
import { loadSourceModule } from './sourceModuleHarness'

export function registerMomentsMaintenanceChecks(check, { Vue, compileComponent, flush }) {
  check('comment tails: root, nested and native replies end successfully without reintroducing load-more', async () => {
    const { normalizeMomentCommentPage, normalizeMomentCommentRepliesPage } = await import('../src/components/MomentCard/commentUtils')
    const { normalizeNativeCommentReplyPage } = await import('../src/utils/commentReplyRequest')
    const { createMomentCommentThreadController } = await import('../src/utils/momentCommentThread')
    const comment = { rpid_str: '10', member: { mid: 1 }, content: { message: 'fixture' } }
    for (const normalize of [normalizeMomentCommentPage, normalizeMomentCommentRepliesPage]) {
      for (const replies of [[], null]) {
        const tail = normalize({ code: 0, data: { page: { num: 3, size: 8, count: 80 }, cursor: { is_end: false }, replies, root: { replies: [comment] } } }, 3, 8)
        assert.equal(tail.hasMore, false, 'empty tail wins over stale totals and root previews')
      }
      assert.equal(normalize({ code: 0, data: { cursor: { is_end: 1 }, replies: [comment] } }, 1, 1).hasMore, false)
      assert.equal(normalize({ code: 0, data: { page: { count: 0, acount: 100 }, replies: [comment] } }, 1, 1).hasMore, false)
      assert.equal(normalize({ code: 0, data: { page: { acount: 100 }, replies: [comment] } }, 1, 8).hasMore, false, 'acount cannot extend root pagination')
      assert.throws(() => normalize({ code: -1, data: { replies: [] } }, 1, 8))
      assert.throws(() => normalize({ code: 0, data: null }, 1, 8))
    }
    const identity = { context: 'fixture', account: 'guest', oid: '1', type: 17, root: '10', sort: 1, pageSize: 20 }
    const nativeTail = normalizeNativeCommentReplyPage({ code: 0, data: { replies: null, page: { num: 2, size: 20, count: 100 } } }, { requestId: '1', identity, page: 2 })
    assert.equal(nativeTail.totalPages, 2)
    let calls = 0
    const threads = createMomentCommentThreadController({ getIdentity: () => 'fixture', fetchPage: async () => {
      calls++
      return { items: [], hasMore: false, nextPage: 2 }
    } })
    threads.seed('10', [], 100)
    await threads.loadMore('10')
    threads.seed('10', [], 100)
    await threads.loadMore('10')
    assert.equal(calls, 1, 'stale parent count cannot reopen a completed reply thread')
    threads.dispose()
  })
  const liveResponse = (hosts = ['https://a.example.com', 'https://b.example.com']) => ({ code: 0, data: { live_status: 1, playurl_info: { playurl: { stream: [{ protocol_name: 'http_hls', format: [{ format_name: 'fmp4', codec: [{ codec_name: 'avc', current_qn: 250, base_url: '/live/index.m3u8?', url_info: hosts.map(host => ({ host, extra: 'token=fixture' })) }] }] }] } } } })
  check('live sources: HLS/fMP4-only rooms, codec compatibility, bounded backups and malformed responses', async () => {
    const { getLivePreviewSources } = await import('../src/utils/livePreviewSources')
    assert.deepEqual(getLivePreviewSources({ code: 19001012 }), [])
    const response = liveResponse()
    assert.deepEqual(getLivePreviewSources(response), ['https://a.example.com/live/index.m3u8?token=fixture', 'https://b.example.com/live/index.m3u8?token=fixture'])
    assert.equal(getLivePreviewSources(liveResponse(Array.from({ length: 8 }, (_, i) => `https://a${i}.example.com`))).length, 3)
    response.data.playurl_info.playurl.stream[0].format[0].codec[0].codec_name = 'hevc'
    assert.deepEqual(getLivePreviewSources(response), [])
    for (const value of [null, {}, { code: 0, data: null }, { code: 0, data: { playurl_info: { playurl: { stream: [{}] } } } }])
      assert.deepEqual(getLivePreviewSources(value), [])
    const locked = liveResponse()
    locked.data.is_locked = true
    assert.deepEqual(getLivePreviewSources(locked), [])
    const mixed = liveResponse()
    const format = mixed.data.playurl_info.playurl.stream[0].format[0]
    mixed.data.playurl_info.playurl.stream[0].format.unshift({ ...format, format_name: 'ts', codec: [{ ...format.codec[0], base_url: '/older/live.m3u8?' }] })
    mixed.data.playurl_info.playurl.stream.push({ protocol_name: 'http_stream', format: [{ ...format, format_name: 'flv', codec: [{ ...format.codec[0], base_url: '/live.flv?' }] }] })
    const mixedSources = getLivePreviewSources(mixed)
    assert.deepEqual(mixedSources.map(url => new URL(url).pathname), ['/live/index.m3u8', '/older/live.m3u8', '/live.flv'], 'prefer fMP4 and keep transport diversity inside the three-source cap')
  })

  check('live preview: failed transport switches finite backups; exhausted/API failures stay open without polling', async () => {
    const hidden = Object.getOwnPropertyDescriptor(document, 'hidden')
    Object.defineProperty(document, 'hidden', { configurable: true, value: false })
    const players = []
    let response = liveResponse()
    let reads = 0
    const timers = new Map()
    let timerId = 0
    class Hls {
      static isSupported() { return true }
      static Events = { MANIFEST_PARSED: 'manifest', ERROR: 'error' }
      static ErrorTypes = { MEDIA_ERROR: 'mediaError', NETWORK_ERROR: 'networkError' }
      handlers = new Map()
      constructor() { players.push(this) }
      on(name, fn) { this.handlers.set(name, fn) }
      loadSource(url) { this.url = url }
      attachMedia() {}
      destroy() { this.destroyed = true }
    }
    const { useMomentPreviews } = await loadSourceModule('../src/contentScripts/views/Moments/useMomentPreviews.ts', {
      'vue': Vue,
      '~/constants/mediaPreview': await import('../src/constants/mediaPreview'),
      '~/logic': { settings: Vue.ref({ momentsEnableLivePreview: true }) },
      '~/utils/api': { default: { live: { getLivePreviewInfo: async () => {
        reads++
        return response
      } } } },
      '~/utils/hls': { loadHlsModule: async () => ({ default: Hls }) },
      '~/utils/flv': { loadFlvModule: () => assert.fail('HLS-only rooms do not need FLV') },
      '~/utils/livePreviewSources': await import('../src/utils/livePreviewSources'),
      '~/utils/mediaResources': await import('../src/utils/mediaResources'),
      '~/utils/momentUrl': await import('../src/utils/momentUrl'),
      '~/utils/previewMediaSession': await import('../src/utils/previewMediaSession'),
    }, { setTimeout: (callback) => {
      timers.set(++timerId, callback)
      return timerId
    }, clearTimeout: id => timers.delete(id) })
    const scope = Vue.effectScope()
    const previews = scope.run(() => useMomentPreviews(() => 1))
    const moment = { id: 'sidebar-live:42', roomId: 42, isLive: true, isVideo: false }
    const video = document.body.appendChild(document.createElement('video'))
    video.load = () => {}
    video.pause = () => {}
    video.play = async () => {}
    try {
      await previews.handleMediaEnter(moment)
      previews.bindPreviewVideo(video, moment)
      await flush()
      assert.equal(timers.size, 1)
      const timeout = [...timers.values()][0]
      timers.clear()
      timeout()
      assert.equal(previews.hoveredMediaId.value, moment.id)
      assert.ok(previews.previewUrls[moment.id].includes('b.example.com'))
      previews.bindPreviewVideo(video, moment)
      await flush()
      assert.equal(players[0].destroyed, true)
      players[0].handlers.get('error')('error', { fatal: true })
      assert.equal(previews.previewState.value, 'loading', 'old transport cannot fail its replacement')
      players[1].handlers.get('error')('error', { fatal: true })
      assert.equal(previews.previewState.value, 'error')
      assert.equal(previews.hoveredMediaId.value, moment.id)
      assert.equal(previews.previewUrls[moment.id], undefined)
      assert.equal(players[1].destroyed, true)
      assert.equal(timers.size, 0, 'exhausted previews leave no readiness timer')
      await previews.handleMediaEnter(moment)
      assert.equal(reads, 1, 'focus changes inside the failed preview cannot loop requests')
      previews.handleMediaLeave(moment)
      assert.equal(previews.hoveredMediaId.value, '')
      response = { code: 19001012 }
      await previews.handleMediaEnter(moment)
      assert.equal(reads, 2)
      assert.equal(previews.previewState.value, 'error')
      assert.equal(previews.hoveredMediaId.value, moment.id)
    }
    finally {
      scope.stop()
      video.remove()
      if (hidden)
        Object.defineProperty(document, 'hidden', hidden)
      else delete document.hidden
    }
  })

  const article = (text, fields = {}) => ({ type: 'DYNAMIC_TYPE_ARTICLE', modules: { module_dynamic: { major: { article: { title: '文章', desc: text } }, ...fields } } })
  check('moment promotion: text, image and opus posts share filtering; nested forwards inspect each caption without merging unrelated evidence', async () => {
    const { createMomentAdapter } = await import('../src/contentScripts/views/Moments/momentAdapter')
    const mapper = createMomentAdapter(key => key, (_id, count) => Number(count) || 0)
    const filter = createMomentFilter({ blockAds: true })
    const text = '美团搜【668899】，领取外卖优惠券'
    const post = (type, content) => ({ type, modules: { module_dynamic: { desc: { text: content } } } })
    const forward = (orig, text = '转发动态') => ({ ...post('DYNAMIC_TYPE_FORWARD', text), orig })
    for (const type of ['DYNAMIC_TYPE_WORD', 'DYNAMIC_TYPE_DRAW']) {
      const original = post(type, text)
      for (const raw of [original, forward(original), forward(forward(original)), forward(post(type, '正常正文'), text)]) {
        const result = mapper.mapMoment(raw)
        assert.equal(result.momentPromotion.kind, 'commerce')
        assert.equal(filter.passes(result), false)
      }
      const warning = mapper.mapMoment(forward(original, '这是广告骗局，大家不要买，转发提醒避雷。'))
      assert.equal(warning.momentPromotion.kind, 'suspected')
      assert.equal(filter.passes(warning), true)
    }
    const richOnly = { type: 'DYNAMIC_TYPE_WORD', modules: { module_dynamic: { desc: { rich_text_nodes: [{ text: '美团搜' }, { text: '【668899】' }, { text: '领取外卖优惠券' }] } } } }
    assert.equal(detectMomentPromotion(richOnly).kind, 'commerce')
    const opus = { type: 'DYNAMIC_TYPE_DRAW', modules: { module_dynamic: { major: { type: 'MAJOR_TYPE_OPUS', opus: { summary: { text } } } } } }
    assert.equal(detectMomentPromotion(opus).kind, 'commerce')
    assert.notEqual(detectMomentPromotion(forward(post('DYNAMIC_TYPE_WORD', '搜索【668899】是一个文本格式例子。'), '我研究美团的外卖优惠券机制。'))?.kind, 'commerce')
    assert.equal(detectMomentPromotion(post('DYNAMIC_TYPE_DRAW', '周末点了美团外卖，拍了几张照片。')), undefined)
    assert.equal(detectMomentPromotion(post('DYNAMIC_TYPE_WORD', '点击链接购买，使用优惠码享专属优惠。')).kind, 'suspected')
    const cycle = forward(null)
    cycle.orig = cycle
    assert.equal(detectMomentPromotion(cycle), undefined)
    let deep = post('DYNAMIC_TYPE_WORD', '普通正文')
    for (let i = 0; i < 1000; i++)
      deep = forward(deep)
    assert.equal(detectMomentPromotion(deep), undefined)
  })
  check('article promotion: screenshot coupon and checkout messages are filtered without goods nodes or author blacklists', async () => {
    const { createMomentAdapter } = await import('../src/contentScripts/views/Moments/momentAdapter')
    const mapper = createMomentAdapter(key => key, (_id, count) => Number(count) || 0)
    const samples = [
      '大漏！大牌Jeep 冲锋衣！专柜一件一千多！今天71到手马上断码！\n大牌吉普冲锋衣！专柜一件一千多！ 评论区随机抽一位粉丝补贴50买零食 今天带你们零头价撸！！ Jeep吉普.户外冲锋衣💰71 马上断码！马上断码！马上断码！ 1Copy这条信息打开|🍑宝( CZ005 ZyhoTqUOYxS)/ 1Copy这条信息打开|🍑宝( CZ005 ZyhoTqUOYxS)/ [图片]',
      '新百伦大漏！69捡漏价，目前尺码不多了！\n新百伦休闲鞋活动划算了，69元就能带走！！ 评论区随机抽一位粉丝补贴50买零食 各种爆款都有，潮流百搭 这个价格入手一个不亏，难得有好价活动！！ 1Copy这条信息桃宝1(EuukTNlSGWJ):// CA1831 1Copy这条信息桃宝1(EuukTNlSGWJ):// CA1831',
      '每天吃外卖都只花了几块钱！室友点外卖秘籍终于被我问到了！\n美団和闪购25-25的券。快去美団嗖：332211\n看我薅到的战果！',
      '记下密令【122122】，顿顿个位数吃外卖！\n家人们，我这阵子奶茶外卖就没断过，室友都以为我家里拆迁了。\n真相很简单——122122\n美团和淘宝闪购去搜这个数字。18的无门槛、25减24大量有！',
      '直接拍八盒！！加购物车任选8盒到手29！！\n快！！白象拌面方便面！！仅💰3块多/盒！！速！！\n腹制整段➡去陶丨宝买65( HU926 ZJxfTraTU6w(://',
    ]
    const filter = createMomentFilter({ blockAds: true })
    for (const [index, text] of samples.entries()) {
      const classic = article(text)
      const opus = { id_str: String(index), type: 'DYNAMIC_TYPE_WORD', basic: { comment_type: 12 }, modules: { module_dynamic: { major: { type: 'MAJOR_TYPE_OPUS', opus: { title: text.split('\n')[0], summary: { text } } } } } }
      for (const raw of [classic, opus, { type: 'DYNAMIC_TYPE_FORWARD', orig: opus, modules: {} }]) {
        const mapped = mapper.mapMoment(raw)
        assert.equal(mapped.momentPromotion?.kind, 'commerce', text)
        assert.equal(filter.passes(mapped), false)
        assert.equal(createMomentFilter({ blockAds: false }).passes(mapped), true)
      }
    }
  })

  check('article promotion: common text-only referrals support obfuscation, named codes, comment coupons and attributed commissions', () => {
    const positives = [
      '美団APP搜：好吃888，每日大额外卖红包！',
      '京东app嗖【一起冲红包】直接领29-20神券，亲测有效！',
      '淘宝闪购搜〖餐餐有喜〗，领取隐藏外卖券，每天可领。',
      '美团首页搜索【６６８８９９】，大额神券每天领！',
      '淘\u200B宝闪购输入【551122】，领取外卖红包。',
      '長按複製，打開淘寶領券，券後19.9元，￥AbC123xyZ￥',
      '手淘长按Fu制整段，优惠券到手价29元，￥abC123xyZ￥',
      '外卖大额优惠券，传送门在评论区置顶，快去领券！',
      '限时秒杀，券后9.9元！点击评论区置顶链接下单！',
      '小黄车领券，满99减30，直接拍下。',
      '通过我的专属链接下单，返佣10%，粉丝专属折扣。',
      '購買時輸入我的優惠碼，可享粉絲專屬折扣。',
      'Copy这条信息打开🍑寶（ CZ005 AbcDEF123xy）/，69元包邮！',
      '複製到桃寶1(AbcDEF123xy):// 限时39元，马上断码！',
      'Jeep冲锋衣71到手，Copy这条信息打开|🍑宝( CZ005 ZyhoTqUOYxS)/',
      '💰71，Copy到桃宝( CZ005 ZyhoTqUOYxS)/',
    ]
    for (const text of positives)
      assert.equal(detectMomentPromotion(article(text))?.kind, 'commerce', text)
    const negatives = [
      '美团和淘宝发布财报，外卖业务增长，平台补贴影响利润。',
      'RTX 5070 登上 Steam 显卡榜首，这是一份自愿参与的月度调查。',
      '淘宝售价299元的键盘实测，本文比较噪音和延迟。',
      '先登录游戏输入兑换码AB123456，领取角色和原石奖励。',
      '我去美团工作了，2026年继续研究外卖行业。',
      '评论区置顶链接领取源码，免费开源，无需购买。',
      '这张优惠券无法使用，评论区有人遇到相同的问题吗？',
      'Jeep 冲锋衣和新百伦鞋实测，71元和69元的做工有什么区别。',
      'Copy this code (AbcDEF123xy):// 是我在研究的自定义协议，和桃宝无关。',
    ]
    for (const text of negatives)
      assert.notEqual(detectMomentPromotion(article(text))?.kind, 'commerce', text)
    for (const text of ['警惕外卖口令骗局：美团搜【551122】领券，不要相信。', '揭秘返佣话术：通过我的链接下单，返利20元。'])
      assert.equal(detectMomentPromotion(article(text))?.kind, 'suspected', text)
  })
  check('article promotion: structural goods/ad evidence differs from conservative text hints and normal discussion stays readable', () => {
    const known = detectMomentPromotion({ ...article('正文'), is_ad: 1 })
    assert.deepEqual(known, { kind: 'advertisement', reason: 'api' })
    const goods = detectMomentPromotion(article('正文', { additional: { type: 'ADDITIONAL_TYPE_GOODS', goods: { items: [{ id: 1 }] } } }))
    assert.equal(goods.kind, 'commerce')
    assert.equal(detectMomentPromotion(article('正文', { desc: { rich_text_nodes: [{ type: 'RICH_TEXT_NODE_TYPE_GOODS' }] } })).kind, 'commerce')
    const suspected = detectMomentPromotion(article('点击链接购买，使用优惠码享专属优惠。'))
    assert.equal(suspected.kind, 'suspected')
    assert.equal(detectMomentPromotion(article('本篇由某品牌提供赞助。')).kind, 'suspected')
    assert.equal(detectMomentPromotion(article('广告声明：无广告。这是一份独立测评。')), undefined)
    assert.equal(detectMomentPromotion(article('广告设计史：商业合作与带货的社会影响。')), undefined)
    assert.equal(detectMomentPromotion(article('这个产品售价 299 元，这是我们测得的数据。')), undefined)
    assert.equal(detectMomentPromotion({ ...article('点击链接购买，使用优惠码'), type: 'DYNAMIC_TYPE_AV' }), undefined)
    assert.equal(detectMomentPromotion(null), undefined)
    const filter = createMomentFilter({ blockAds: true })
    assert.equal(filter.passes({ momentPromotion: known }), false)
    assert.equal(filter.passes({ momentPromotion: goods }), false)
    assert.equal(filter.passes({ momentPromotion: suspected }), true)
    assert.equal(createMomentFilter({ blockAds: false }).passes({ momentPromotion: known }), true)
  })

  check('article promotion: forwarded article evidence survives mapping without classifying ordinary video posts', async () => {
    const { createMomentAdapter } = await import('../src/contentScripts/views/Moments/momentAdapter')
    const mapper = createMomentAdapter(key => key, (_id, count) => Number(count) || 0)
    const source = { ...article('点击链接购买，使用优惠码'), id_str: 'original' }
    const result = mapper.mapMoment({ id_str: 'forward', type: 'DYNAMIC_TYPE_FORWARD', orig: source, modules: { module_author: { mid: 1 } } })
    assert.equal(result.momentPromotion.kind, 'suspected')
    assert.equal(result.isForward, true)
  })

  check('Moments retirement: settings/import cleanup and the current source have no retained group manager', async () => {
    const { removeRetiredSettings, RETIRED_LOCAL_STORAGE_KEYS } = await import('../src/constants/retiredSettings')
    const old = { momentsEnableWantedFilter: true, momentsEnableLivePreview: true }
    removeRetiredSettings(old)
    assert.deepEqual(old, { momentsEnableLivePreview: true })
    assert.ok(RETIRED_LOCAL_STORAGE_KEYS.includes('momentsWantedUsers'))
    assert.ok(RETIRED_LOCAL_STORAGE_KEYS.includes('momentsPinnedUsers'))
    for (const file of ['../src/contentScripts/views/Moments/Moments.vue', '../src/components/Settings/PluginComponentsAndPages/Moments/Moments.vue', '../src/components/Settings/searchCatalog.ts']) {
      const source = await readFile(new URL(file, import.meta.url), 'utf8')
      assert.doesNotMatch(source, /WantedUsersManager|momentsWantedUsers|momentsPinnedUsers|wanted-users/)
    }
  })

  check('sidebar live hover: one shared preview owner, keyboard entry, offscreen release and stable room link', async () => {
    let observer
    const entered = []
    const left = []
    const previews = {
      hoveredMediaId: Vue.ref(''),
      previewUrls: Vue.reactive({}),
      previewState: Vue.ref('loading'),
      previewGeneration: Vue.ref(1),
      handleMediaEnter(media) {
        if (this.hoveredMediaId.value === media.id)
          return
        entered.push(media.roomId)
        this.hoveredMediaId.value = media.id
        this.previewState.value = 'loading'
      },
      handleMediaLeave(media) {
        left.push(media.roomId)
        if (this.hoveredMediaId.value === media.id)
          this.hoveredMediaId.value = ''
      },
    }
    const Row = await compileComponent('../src/contentScripts/views/Moments/MomentsLiveRow.vue', {
      '@vueuse/core': { useIntersectionObserver: (_root, callback) => {
        observer = callback
        return { stop() {} }
      } },
      'vue-i18n': { useI18n: () => ({ t: key => key }) },
      '~/components/MomentCard/MomentVideoPreview.vue': { default: { render: () => null } },
    })
    const host = document.body.appendChild(document.createElement('div'))
    const app = Vue.createApp({ render: () => Vue.h(Row, { user: { room_id: '42', uname: 'Live fixture', title: 'Room', face: '' }, previews }) })
    app.mount(host)
    const row = host.querySelector('.moments-live-row')
    const reveal = host.querySelector('.moments-live-row__reveal')
    assert.equal(reveal.getAttribute('data-expanded'), 'false')
    assert.equal(reveal.hasAttribute('inert'), true)
    row.dispatchEvent(new MouseEvent('mouseenter'))
    await flush()
    assert.deepEqual(entered, [42])
    assert.ok(host.querySelector('.moments-live-row__preview'))
    assert.equal(host.querySelector('.moments-live-row__reveal'), reveal, 'expand the existing box instead of inserting an already-sized preview')
    assert.equal(reveal.getAttribute('data-expanded'), 'true')
    assert.equal(reveal.hasAttribute('inert'), false)
    assert.equal(host.querySelector('a').href, 'https://live.bilibili.com/42')
    assert.equal(host.querySelector('.moments-live-row__badge').parentElement, host.querySelector('.moments-live-row__link'))
    previews.previewState.value = 'error'
    await flush()
    assert.equal(reveal.getAttribute('data-expanded'), 'true')
    assert.ok(host.querySelector('.moments-live-row__error button'))
    assert.equal(reveal.querySelector('[data-bew-skeleton]'), null)
    host.querySelector('.moments-live-row__error button').click()
    await flush()
    assert.equal(entered.length, 2, 'retry is explicit and does not navigate to the room')
    observer([{ isIntersecting: false }])
    await flush()
    assert.equal(reveal.getAttribute('data-expanded'), 'false')
    assert.equal(reveal.hasAttribute('inert'), true)
    assert.equal(reveal.getAttribute('aria-hidden'), 'true')
    assert.equal(reveal.querySelector('[data-bew-skeleton]'), null)
    row.dispatchEvent(new FocusEvent('focusin'))
    await flush()
    assert.equal(entered.length, 3)
    app.unmount()
    assert.ok(left.length >= 2)
    host.remove()
  })
}
