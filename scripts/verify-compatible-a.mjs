import assert from 'node:assert/strict'

import { loadSourceFunctions } from './sourceFunctionHarness'
import { loadSourceModule } from './sourceModuleHarness'

export function registerCompatibleAChecks(check, { Vue, flush, compileComponent }) {
  check('A06 protocol: actual API request pipeline sends typed membership reads and form-encoded differences', async () => {
    const calls = []
    const transport = await loadSourceModule('../src/background/utils.ts', {
      'webextension-polyfill': { default: {} },
      '~/utils/abort': await import('../src/utils/abort'),
      './wbiSign': { needsWbiSign: () => false, isBilibiliNavUrl: () => false },
    }, { URLSearchParams, Response, fetch: async (url, init) => {
      calls.push({ url: String(url), init })
      return new Response('{"code":0,"data":{}}', { headers: { 'Content-Type': 'application/json' } })
    } })
    const api = await loadSourceModule('../src/background/messageListeners/api/favorite.ts', {
      '~/utils/favoriteFolderForm': await import('../src/utils/favoriteFolderForm'),
      '../../utils': transport,
    })
    await transport.doRequest({ contentScriptQuery: 'getFavoriteCategories', up_mid: '1', type: 2, rid: 123 }, api.default.getFavoriteCategories)
    assert.equal(new URL(calls[0].url).searchParams.get('rid'), '123')
    assert.equal(new URL(calls[0].url).searchParams.get('type'), '2')
    await transport.doRequest({ contentScriptQuery: 'updateVideoFavorites', rid: 123, add_media_ids: '3,4', del_media_ids: '1', csrf: 'fixture' }, api.default.updateVideoFavorites)
    assert.equal(new URL(calls[1].url).pathname, '/x/v3/fav/resource/deal')
    assert.equal(calls[1].init.method, 'post')
    assert.equal(calls[1].init.credentials, 'include')
    assert.equal(calls[1].init.headers['Content-Type'], 'application/x-www-form-urlencoded')
    const form = new URLSearchParams(String(calls[1].init.body))
    assert.equal(form.get('rid'), '123')
    assert.equal(form.get('type'), '2')
    assert.equal(form.get('add_media_ids'), '3,4')
    assert.equal(form.get('del_media_ids'), '1')
  })
  check('A02 categories: rendered menu keeps actual unread counts when every total-badge reminder is disabled', async () => {
    const counts = await import('../src/utils/notificationBadge')
    const message = { reply: 123, at: 2, like: 8, recv_like: 9, sys_msg: 1, chat: 90 }
    const dm = { follow_unread: 4, unfollow_unread: 5 }
    const config = Object.fromEntries(['showReplyNotificationReminder', 'showAtNotificationReminder', 'showLikeNotificationReminder', 'showSystemNotificationReminder', 'showFollowedPrivateMessageUnreadCount', 'showUnfollowedPrivateMessageUnreadCount'].map(key => [key, false]))
    const component = await compileComponent('../src/components/TopBar/components/pops/NotificationsPop.vue', {
      'vue-i18n': { useI18n: () => ({ t: key => key }) },
      '~/contentScripts/views/Notifications/notificationSections': await import('../src/contentScripts/views/Notifications/notificationSections'),
      '~/enums/appEnums': await import('../src/enums/appEnums'),
      '~/logic': { settings: Vue.ref(config) },
      '~/stores/settingsStore': { useSettingsStore: () => ({ getDockItemIsUseOriginalBiliPage: () => false }) },
      '~/utils/notificationBadge': counts,
      '~/utils/notificationRoute': await import('../src/utils/notificationRoute'),
    })
    const host = document.body.appendChild(document.createElement('div'))
    const app = Vue.createApp(component, { unReadMessage: message, unReadDm: dm })
    app.component('ALink', { setup: (_props, { slots, attrs }) => () => Vue.h('a', attrs, slots.default?.()) })
    try {
      app.mount(host)
      await flush()
      assert.equal(counts.getNotificationBadgeCounts(config, message, dm).total, 0)
      const rendered = [...host.querySelectorAll('.notification-pop__badge')].map(el => Number(el.textContent))
      assert.deepEqual(rendered.sort((a, b) => a - b), [1, 2, 9, 9, 123])
    }
    finally {
      app.unmount()
      host.remove()
    }
  })
  check('A03 envelope: actual guarded channel rejects old documents even with the same WindowProxy and URL', async () => {
    const wire = await import('../src/utils/iframeMessage')
    const href = 'https://www.bilibili.com/video/BV1xx411c7mD'
    const source = { location: { href, origin: 'https://www.bilibili.com' } }
    const frame = { contentWindow: source, getAttribute: () => href }
    wire.markIframeReadyForMessaging(frame)
    const message = { type: 'BEWLY_DRAWER_CLOSE_REQUEST', _bewDocumentId: 'old', _bewSessionId: 'host', _bewRevision: 1 }
    const event = { data: message, source, origin: 'https://www.bilibili.com' }
    wire.setIframeDocumentBinding(frame, { documentId: 'old', sessionId: 'host', revision: 1 })
    assert.equal(wire.getIframeMessageData(event, frame), message)
    wire.setIframeDocumentBinding(frame)
    assert.equal(wire.getIframeMessageData(event, frame), undefined)
    wire.setIframeDocumentBinding(frame, { documentId: 'new', sessionId: 'next-host', revision: 1 })
    assert.equal(wire.getIframeMessageData(event, frame), undefined)
    assert.equal(wire.getIframeMessageData({ ...event, source: {} }, frame), undefined)
    assert.equal(wire.getIframeMessageData({ ...event, origin: 'https://www.bilibili.com.evil.test' }, frame), undefined)
  })
  check('A11 disclosure: cancellation cannot finish the new close or unmount a reopened comment section', async () => {
    const open = Vue.ref(false)
    const frames = new Map()
    const timers = new Map()
    const motions = []
    let sequence = 0
    let drawn = 0
    let natural = 180
    let closed = 0
    let reduced = false
    let resized
    const element = { getBoundingClientRect: () => ({ height: drawn }) }
    const body = { getBoundingClientRect: () => ({ height: natural }) }
    const { useMeasuredDisclosure } = await loadSourceModule('../src/composables/useMeasuredDisclosure.ts', {
      'vue': Vue,
      '@vueuse/core': { useResizeObserver: (_target, callback) => resized = callback },
      '~/utils/motionTiming': await import('../src/utils/motionTiming'),
    }, {
      requestAnimationFrame: (callback) => {
        frames.set(++sequence, callback)
        return sequence
      },
      cancelAnimationFrame: id => frames.delete(id),
      setTimeout: (callback, delay) => {
        timers.set(++sequence, { callback, delay })
        return sequence
      },
      clearTimeout: id => timers.delete(id),
      getComputedStyle: () => ({ getPropertyValue: () => '.2s' }),
      window: { matchMedia: () => ({ matches: reduced }) },
    })
    const frame = async () => {
      await flush()
      const callbacks = [...frames.values()]
      frames.clear()
      callbacks.forEach(callback => callback())
      await flush()
    }
    const scope = Vue.effectScope()
    const context = scope.run(() => useMeasuredDisclosure(Vue.shallowRef(element), Vue.shallowRef(body), open, () => closed++, moving => motions.push(moving)))
    await frame()
    closed = 0
    open.value = true
    await frame()
    assert.equal(context.height.value, 180)
    assert.equal([...timers.values()][0].delay, 300, 'compressed seconds remain milliseconds for settlement')
    drawn = 60
    natural = 480
    resized()
    await frame()
    assert.equal(context.height.value, 480, 'a late comment response redirects the same reveal')
    assert.deepEqual(motions, [true])
    open.value = false
    await frame()
    const event = { type: 'transitioncancel', propertyName: 'height', target: element }
    context.onTransitionEnd(event)
    assert.equal(closed, 0)
    open.value = true
    await frame()
    context.onTransitionEnd({ ...event, type: 'transitionend' })
    assert.equal(closed, 0, 'a queued earlier end cannot finish the redirected animation')
    assert.equal(context.moving.value, true)
    open.value = false
    await frame()
    drawn = 0
    context.onTransitionEnd({ ...event, type: 'transitionend' })
    assert.equal(closed, 1)
    assert.deepEqual(motions, [true, false])
    reduced = true
    open.value = true
    await frame()
    assert.equal(context.height.value, 480)
    assert.equal(context.moving.value, false)
    assert.equal(timers.size, 0)
    resized()
    scope.stop()
    assert.equal(frames.size, 0, 'teardown releases scheduled measurements')
  })
  check('A10 custom rate: explicit application survives native ratechange and respects memory and active media', async () => {
    const rates = await import('../src/utils/playbackRate')
    const video = document.body.appendChild(document.createElement('video'))
    const unrelated = document.body.appendChild(document.createElement('video'))
    let ad = false
    const settings = { value: { rememberPlaybackRate: true, savedPlaybackRate: 1 } }
    const controllers = new Map()
    const context = await loadSourceFunctions('../src/utils/player.ts', [
      'applyExplicitPlaybackRate',
      'markPlaybackRateUserIntent',
      'consumePlaybackRateUserIntent',
      'monitorPlaybackRateVideo',
      'applyRememberedPlaybackRateToVideo',
      'schedulePlaybackRateInitializationCorrection',
    ], {
      ...rates,
      settings,
      playbackRateLifecycleActive: true,
      isVideoPage: () => true,
      getVideoElement: () => video,
      isPlayerAdvertisement: () => ad,
      isNativeVideoComponentReady: () => true,
      playbackRateListenerControllers: controllers,
      applyingPlaybackRateVideos: new WeakSet(),
      playbackRateUserIntentUntil: new WeakMap(),
      PLAYBACK_RATE_USER_INTENT_DURATION_MS: 500,
      playbackRateCorrectionFrameIds: new Map(),
      metadataCorrectionVideos: new WeakSet(),
      requestAnimationFrame,
      cancelAnimationFrame,
      AbortController,
      HTMLMediaElement: window.HTMLMediaElement,
    })
    try {
      assert.equal(context.applyExplicitPlaybackRate(1.75), true)
      video.dispatchEvent(new Event('ratechange'))
      assert.equal(video.playbackRate, 1.75)
      assert.equal(settings.value.savedPlaybackRate, 1.75)
      settings.value.rememberPlaybackRate = false
      assert.equal(context.applyExplicitPlaybackRate(2.25), true)
      video.dispatchEvent(new Event('ratechange'))
      assert.equal(video.playbackRate, 2.25)
      assert.equal(settings.value.savedPlaybackRate, 1.75)
      for (const invalid of [Number.NaN, Infinity, 0, 5.01])
        assert.equal(context.applyExplicitPlaybackRate(invalid), false)
      ad = true
      assert.equal(context.applyExplicitPlaybackRate(3), false)
      assert.equal(unrelated.playbackRate, 1)
      video.remove()
      ad = false
      assert.equal(context.applyExplicitPlaybackRate(3), false)
    }
    finally {
      controllers.forEach(controller => controller.abort())
      video.remove()
      unrelated.remove()
    }
  })
  check('A08 deletion focus: surviving link receives focus only for the removed focused row', async () => {
    const { captureListRemovalFocus } = await import('../src/utils/listRemovalFocus')
    const pop = document.body.appendChild(document.createElement('div'))
    pop.className = 'bew-popover'
    pop.innerHTML = '<header class="bew-popover__header"><button>all</button></header><article class="popover-card"><button>delete</button></article><article class="popover-card"><a href="#next">next</a></article>'
    const first = pop.querySelector('article button')
    first.focus()
    const settle = captureListRemovalFocus(first)
    first.closest('article').remove()
    settle()
    assert.equal(document.activeElement, pop.querySelector('a'))
    const final = pop.querySelector('a')
    const fallback = captureListRemovalFocus(final)
    final.closest('article').remove()
    fallback()
    assert.equal(document.activeElement, pop.querySelector('header button'))
    pop.remove()
  })
  check('A07 FavoritesPop: A to B to C keeps stale paint inert and rejects late failures', async () => {
    const requests = []
    const store = Vue.reactive({ isLogin: true, userInfo: { mid: 1 }, isInWatchLater: () => false })
    const resource = id => ({ id, type: 2, attr: 0, title: `video ${id}`, cover: '', link: '', duration: 10, upper: { mid: 1, name: 'author' }, bvid: `BV${id}fixture` })
    const page = id => ({ code: 0, data: { medias: [resource(id)], has_more: false, info: { media_count: 1 } } })
    const component = await compileComponent('../src/components/TopBar/components/pops/FavoritesPop.vue', {
      'pinia': { storeToRefs: () => ({ favoriteStateVersion: Vue.ref(0) }) },
      'vue-i18n': { useI18n: () => ({ t: key => key }) },
      'vue-toastification': { useToast: () => ({ error() {} }) },
      '~/components/Empty.vue': { default: { render: () => null } },
      '~/components/Tooltip.vue': { default: { props: ['content', 'placement', 'teleport'], setup: (_props, { slots }) => () => slots.default?.() } },
      '~/composables/useOptimizedScroll': { useOptimizedScroll() {} },
      '~/stores/topBarStore': { useTopBarStore: () => store },
      '~/utils/accountLifetime': await import('../src/utils/accountLifetime'),
      '~/utils/accountScope': await import('../src/utils/accountScope'),
      '~/utils/api': { default: { favorite: {
        getFavoriteCategories: async () => ({ code: 0, data: { list: [1, 2, 3].map(id => ({ id, title: `folder ${id}` })) } }),
        getFavoriteResources: params => new Promise(resolve => requests.push({ params, resolve })),
      } } },
      '~/utils/dataFormatter': { calcCurrentTime: () => '00:10' },
      '~/utils/favoriteResource': await import('../src/utils/favoriteResource'),
      '~/utils/favoriteSeason': await import('../src/utils/favoriteSeason'),
      '~/utils/main': { getUserID: () => '1', removeHttpFromUrl: value => value, scrollToTop() {} },
      '~/utils/messaging': { isExtensionContextInvalidatedError: error => String(error?.message ?? error).includes('Extension context invalidated') },
      '~/utils/watchLater': { updateOwnedWatchLater: () => assert.fail('a stale folder cannot write') },
      './PopoverListSkeleton.vue': { default: { render: () => null } },
    })
    const host = document.body.appendChild(document.createElement('div'))
    const app = Vue.createApp(component)
    app.component('ALink', { props: ['href'], setup: (props, { slots }) => () => Vue.h('a', { href: props.href }, slots.default?.()) })
    app.component('Button', { props: ['disabled'], setup: (props, { slots }) => () => Vue.h('button', { disabled: props.disabled }, slots.default?.()) })
    app.config.globalProperties.$t = key => key
    try {
      app.mount(host)
      await flush()
      requests[0].resolve(page(11))
      await flush()
      const first = host.querySelector('.popover-card')
      host.querySelectorAll('.favorites-pop__category')[1].click()
      await flush()
      assert.equal(host.querySelector('.popover-card'), first)
      assert.equal(host.querySelector('.favorites-pop__items').hasAttribute('inert'), true)
      host.querySelector('.favorites-pop__watch-later button').click()
      await flush()
      host.querySelectorAll('.favorites-pop__category')[2].click()
      await flush()
      requests[2].resolve(page(33))
      await flush()
      requests[1].resolve({ code: -1 })
      await flush()
      assert.match(host.textContent, /video 33/)
      assert.equal(host.querySelector('[role="status"]'), null)
      assert.equal(host.querySelector('.favorites-pop__items').hasAttribute('inert'), false)
      host.querySelectorAll('.favorites-pop__category')[1].click()
      await flush()
      requests[3].resolve({ code: -1 })
      await flush()
      assert.equal(host.querySelectorAll('.popover-card:not([aria-hidden="true"])').length, 0, 'leaving cards are inert while their animation finishes')
      host.querySelector('[role="status"] button').click()
      await flush()
      assert.deepEqual({ ...requests[4].params }, { media_id: 2, pn: 1, keyword: '' })
      requests[4].resolve(page(22))
      await flush()
      assert.match(host.textContent, /video 22/)
    }
    finally {
      app.unmount()
      host.remove()
    }
  })
  check('A06 favorite selection: real controller isolates differences, capacity, failure, close and account changes', async () => {
    const { createVideoFavoriteSelection, canFavoriteVideo } = await import('../src/utils/videoFavoriteSelection')
    assert.equal(canFavoriteVideo({ id: 123 }), false)
    assert.equal(canFavoriteVideo({ aid: 123, roomid: 1 }), false)
    assert.equal(canFavoriteVideo({ aid: 123, epid: 1 }), false)
    assert.equal(canFavoriteVideo({ aid: 123 }), true)
    let account = 1
    let readFailure = false
    let writeFailure = false
    let notices = 0
    let reads = 0
    let responseGate
    const writes = []
    let rows = [{ id: 1, title: 'full member', media_count: 10, max_count: 10, fav_state: 1 }, { id: 2, title: 'full nonmember', media_count: 10, max_count: 10, fav_state: 0 }, { id: 3, title: 'unknown capacity', media_count: 1000000, fav_state: 0 }]
    const deps = {
      account: () => account,
      csrf: () => 'credential',
      resolveAid: async () => 123,
      read: async () => {
        reads++
        if (readFailure)
          throw new Error('offline')
        return { code: 0, data: { count: rows.length, list: rows } }
      },
      write: async (data) => {
        writes.push(data)
        if (responseGate)
          await responseGate
        if (writeFailure)
          return { code: -403 }
        rows = rows.map(row => ({ ...row, fav_state: data.add_media_ids.split(',').includes(String(row.id)) ? 1 : data.del_media_ids.split(',').includes(String(row.id)) ? 0 : row.fav_state }))
        return { code: 0 }
      },
      changed: async () => { notices++ },
    }
    const selection = createVideoFavoriteSelection({ aid: 123 }, deps)
    assert.equal(await selection.load(), true)
    selection.toggle(rows[1])
    assert.deepEqual(selection.selected.value, [1])
    selection.toggle(rows[0])
    selection.toggle(rows[2])
    readFailure = true
    assert.equal(await selection.save(), false)
    assert.deepEqual(writes[0], { rid: 123, add_media_ids: '3', del_media_ids: '1', csrf: 'credential' })
    assert.equal(selection.error.value, 'verify')
    await selection.save()
    assert.equal(writes.length, 1, 'accepted write cannot be repeated after failed readback')
    readFailure = false
    assert.equal(await selection.load(), true)
    assert.deepEqual(selection.selected.value, [3])
    assert.equal(notices, 1)
    selection.toggle(rows[0])
    // Folder 1 is full but no longer a member after the previous transaction.
    assert.deepEqual(selection.selected.value, [3])
    selection.toggle(rows[2])
    writeFailure = true
    assert.equal(await selection.save(), false)
    assert.equal(selection.error.value, 'save')
    writeFailure = false
    let release
    responseGate = new Promise(resolve => release = resolve)
    const pending = selection.save()
    selection.close()
    assert.equal(selection.editable.value, false)
    const beforeReopenRead = reads
    const next = createVideoFavoriteSelection({ bvid: 'BV1fixture' }, deps)
    const reopened = next.load()
    await flush()
    assert.equal(reads, beforeReopenRead, 'reopening waits for the already submitted transaction before reading membership')
    release()
    await pending
    await reopened
    assert.equal(notices, 2, 'accepted writes reconcile the same account after close')
    assert.deepEqual(next.selected.value, [], 'reopened editor reads the post-transaction membership')
    account = 2
    next.toggle(rows[2])
    const count = writes.length
    await next.save()
    assert.equal(writes.length, count)
    next.close()
    const empty = createVideoFavoriteSelection({ aid: 123 }, { ...deps, read: async () => ({ code: 0, data: { count: 0, list: null } }) })
    assert.equal(await empty.load(), true)
    assert.equal(empty.folders.value.length, 0)
    empty.close()
  })
  check('A09 danmaku: actual positioning respects viewport and clipping in both native revisions', async () => {
    const floating = await import('../src/utils/floatingMenu')
    const { positionDanmakuSettingsPanel } = await loadSourceFunctions('../src/utils/bewlyWidescreen/danmaku.ts', ['positionDanmakuSettingsPanel'], {
      ...floating,
      document,
      window: { innerWidth: 640, innerHeight: 480 },
      getComputedStyle,
    })
    const player = document.body.appendChild(document.createElement('div'))
    player.className = 'bpx-player-container'
    const setting = player.appendChild(document.createElement('button'))
    const panel = setting.appendChild(document.createElement('div'))
    let anchor = { left: 2, right: 38, top: 420, bottom: 456, width: 36, height: 36 }
    setting.getBoundingClientRect = () => anchor
    panel.getBoundingClientRect = () => ({ width: 300, height: 200 })
    try {
      for (const revision of ['1', '2']) {
        player.dataset.revision = revision
        positionDanmakuSettingsPanel(setting, panel)
        assert.ok(Number.parseFloat(panel.style.getPropertyValue('--bew-dm-popover-left')) + anchor.left >= 8)
        assert.ok(Number.parseFloat(panel.style.getPropertyValue('--bew-dm-popover-top')) < 0)
        anchor = { left: 600, right: 636, top: 5, bottom: 41, width: 36, height: 36 }
        positionDanmakuSettingsPanel(setting, panel)
        assert.ok(Number.parseFloat(panel.style.getPropertyValue('--bew-dm-popover-left')) + anchor.left + 300 <= 632)
        assert.ok(Number.parseFloat(panel.style.getPropertyValue('--bew-dm-popover-top')) > 0)
        anchor = { left: 2, right: 38, top: 420, bottom: 456, width: 36, height: 36 }
      }
      player.style.overflowX = 'hidden'
      player.getBoundingClientRect = () => ({ left: 40, right: 400, top: 0, bottom: 480, width: 360, height: 480 })
      anchor = { left: 45, right: 81, top: 420, bottom: 456, width: 36, height: 36 }
      positionDanmakuSettingsPanel(setting, panel)
      assert.ok(Number.parseFloat(panel.style.getPropertyValue('--bew-dm-popover-left')) + anchor.left >= 48)
      assert.equal(setting.parentElement, player, 'native nodes are not reparented')
    }
    finally { player.remove() }
  })
  check('A05 preview: actual cover resumes, saves before reset and rejects old media events', async () => {
    const policy = await import('../src/utils/videoPreviewProgress')
    const video = { bvid: 'BV1fixture', aid: 123, cid: 456, url: 'https://www.bilibili.com/video/BV1fixture?p=2&queue=keep#part' }
    const target = new URL(policy.getVideoPlaybackUrl(video, 23))
    assert.equal(target.searchParams.get('t'), '23')
    assert.equal(target.searchParams.get('p'), '2')
    assert.equal(target.searchParams.get('queue'), 'keep')
    assert.equal(target.hash, '#part')
    const queued = new URL(policy.getVideoPlaybackUrl({ ...video, bvid: 'BV1xx411c7mD', url: 'https://www.bilibili.com/list/ml123?bvid=BV1xx411c7mD&p=2&oid=456' }, 23))
    assert.equal(queued.pathname, '/list/ml123')
    assert.equal(queued.searchParams.get('t'), '23')
    assert.equal(queued.searchParams.get('oid'), '456')
    assert.equal(new URL(policy.getVideoPlaybackUrl({ aid: 123 }, 7)).searchParams.get('t'), '7')
    assert.equal(new URL(policy.getVideoPlaybackUrl({ epid: 456 }, 8)).searchParams.get('t'), '8')
    assert.equal(policy.getVideoPlaybackUrl({ ...video, url: 'https://www.bilibili.com/video/BVother' }, 23), 'https://www.bilibili.com/video/BVother')
    assert.notEqual(policy.getVideoPreviewIdentity(video), policy.getVideoPreviewIdentity({ ...video, cid: 457 }))
    assert.equal(policy.getVideoPreviewIdentity({ roomid: 12 }), '')
    assert.equal(policy.normalizePreviewPosition(Infinity, 100), null)
    const blank = { render: () => null }
    const settings = Vue.ref({ enableVideoPreview: true, enableVideoPreviewSwipeSeek: false })
    const Cover = await compileComponent('../src/components/VideoCard/components/VideoCardCover.vue', {
      '@iconify/vue': { Icon: blank },
      '~/components/Button.vue': { default: blank },
      '~/components/LazyPicture.vue': { default: blank },
      '~/components/Tooltip.vue': { default: blank },
      '~/composables/useVideoPreviewSwipeSeek': await import('../src/composables/useVideoPreviewSwipeSeek'),
      '~/logic': { settings },
      '~/utils/hls': { loadHlsModule: () => assert.fail('MP4 does not load HLS') },
      '~/utils/flv': { loadFlvModule: () => assert.fail('MP4 does not load FLV') },
      '~/utils/mediaResources': await import('../src/utils/mediaResources'),
      '~/utils/previewMediaSession': await import('../src/utils/previewMediaSession'),
      '~/utils/fullscreenChange': await import('../src/utils/fullscreenChange'),
      '~/utils/videoPreviewProgress': policy,
    })
    const media = window.HTMLMediaElement.prototype
    const old = Object.fromEntries(['play', 'pause', 'load'].map(key => [key, media[key]]))
    media.play = async () => {}
    media.pause = media.load = () => {}
    const props = Vue.reactive({ video, removed: false, isHover: true, previewVideoUrl: 'https://example.com/a.mp4', previewIdentity: policy.getVideoPreviewIdentity(video), previewCurrentTime: 23, isInWatchLater: false, showWatchLater: false, coverImageUrl: '' })
    const writes = []
    const host = document.body.appendChild(document.createElement('div'))
    const app = Vue.createApp({ render: () => Vue.h(Cover, { ...props, onPreviewProgress: (time, identity) => {
      writes.push([time, identity])
      props.previewCurrentTime = time
    } }) })
    app.config.globalProperties.$t = key => key
    const ready = (el) => {
      Object.defineProperty(el, 'readyState', { configurable: true, value: 2 })
      Object.defineProperty(el, 'duration', { configurable: true, value: 100 })
      el.dispatchEvent(new Event('loadedmetadata'))
    }
    try {
      app.mount(host)
      await flush()
      const first = host.querySelector('video')
      ready(first)
      assert.equal(first.currentTime, 23)
      first.currentTime = 40
      props.previewVideoUrl = 'https://example.com/renewed.mp4'
      await flush()
      assert.equal(props.previewCurrentTime, 40, 'URL renewal saves position before reset')
      ready(first)
      Object.defineProperty(first, 'ended', { configurable: true, value: true })
      first.dispatchEvent(new Event('ended'))
      assert.equal(props.previewCurrentTime, 0)
      props.previewIdentity = 'next-media'
      props.previewCurrentTime = 12
      await flush()
      const second = host.querySelector('video')
      assert.notEqual(second, first)
      const count = writes.length
      first.dispatchEvent(new Event('timeupdate'))
      first.dispatchEvent(new Event('pause'))
      first.dispatchEvent(new Event('loadedmetadata'))
      assert.equal(writes.length, count)
      ready(second)
      assert.equal(second.currentTime, 12)
      second.currentTime = 31
      app.unmount()
      assert.equal(props.previewCurrentTime, 31, 'virtual unmount saves the current session')
      const finalCount = writes.length
      second.dispatchEvent(new Event('timeupdate'))
      assert.equal(writes.length, finalCount)
    }
    finally {
      if (host.childElementCount)
        app.unmount()
      Object.assign(media, old)
      host.remove()
    }
  })
  check('A04 navigation: bounded search intent, duplicate activation and current external targets', async () => {
    const search = await import('../src/utils/iframeSearch')
    const external = await import('../src/utils/iframeExternalUrl')
    assert.equal(search.parseIframeSearchUrl('https://evil.test/?keyword=hello'), undefined)
    assert.equal(search.parseIframeSearchUrl('https://www.bilibili.com/video/BV1test?keyword=hello'), undefined)
    assert.deepEqual(search.parseIframeSearchUrl('https://search.bilibili.com/upuser?keyword=test'), { keyword: 'test', category: 'user' })
    assert.equal(search.parseIframeSearch({ keyword: 'test', category: 'arbitrary' }), undefined)
    const entry = 'https://www.bilibili.com/video/BV1fixture'
    const current = 'https://www.bilibili.com/video/BV2fixture?p=2'
    const frame = { contentWindow: { location: { href: current } } }
    assert.equal(external.resolveIframeExternalUrl(frame, '', entry), current)
    const crossOrigin = { contentWindow: {
      get location() {
        throw new Error('cross origin')
      },
    } }
    assert.equal(external.resolveIframeExternalUrl(crossOrigin, current, entry), current)
    assert.equal(external.resolveIframeExternalUrl(crossOrigin, 'https://evil.test/', entry), entry)
    const opened = []
    let closed = 0
    const selectedMoment = Vue.ref({ id: 'moment' })
    const detailFrameUrl = Vue.ref(entry)
    const detail = await loadSourceFunctions('../src/contentScripts/views/Moments/useMomentDetail.ts', ['syncDetailExternalHref', 'openDetailFrameInNewTab'], {
      ...external,
      ...(await import('../src/utils/linkNavigation')),
      detailIframeRef: Vue.ref(frame),
      reportedHref: Vue.ref(''),
      detailFrameUrl,
      selectedMoment,
      disposed: false,
      requestClose: () => closed++,
      window: { open: (...args) => opened.push(args) },
    })
    const anchor = document.createElement('a')
    let prevented = 0
    const click = { currentTarget: anchor, button: 0, preventDefault: () => prevented++ }
    detail.openDetailFrameInNewTab({ ...click, metaKey: true })
    assert.equal(anchor.href, current)
    assert.equal(prevented, 0, 'native modifier navigation stays on the real anchor')
    detail.openDetailFrameInNewTab(click)
    assert.equal(opened.length, 1)
    assert.equal(opened[0][0], current)
    assert.equal(closed, 1)
    assert.equal(detailFrameUrl.value, entry, 'updating an external target never changes iframe src')
    selectedMoment.value = null
    detail.openDetailFrameInNewTab(click)
    assert.equal(opened.length, 1)
    let receive
    const navigations = []
    const commands = []
    const playbackCommands = await import('../src/utils/playbackRateCommand')
    let active = true
    const scope = Vue.effectScope()
    const host = await loadSourceModule('../src/composables/useIframeDocumentHost.ts', {
      'vue': Vue,
      '~/constants/globalEvents': await import('../src/constants/globalEvents'),
      './useDark': { useDark: () => ({ isDark: Vue.ref(false), isOledDark: Vue.ref(false), darkModeBaseColor: Vue.ref('#181818') }) },
      '~/utils/iframeDocument': { createIframeDocumentHost: () => ({ clear() {}, request() {}, receive() {}, send(message) {
        commands.push(message)
        return true
      }, matches: data => data.documentId === 'current' }) },
      '~/utils/iframeMessage': { getIframeMessageData: event => event.data },
      '~/utils/iframeSearch': search,
      '~/utils/playbackRateCommand': playbackCommands,
      '~/utils/searchNavigation': { resolveSearchNavigationTarget: keyword => `https://www.bilibili.com/?page=SearchResults&keyword=${keyword}`, openSearchResultsInCurrentTab: target => navigations.push(target) },
    }, { window: { addEventListener: (_type, callback) => receive = callback, removeEventListener: () => receive = undefined } })
    scope.run(() => host.useIframeDocumentHost(Vue.ref(document.createElement('iframe')), () => active, () => active))
    const data = { type: search.IFRAME_SEARCH_REQUEST, documentId: 'current', keyword: 'test', category: 'user', intent: 'currentTab', requestId: 1 }
    receive({ data })
    receive({ data })
    receive({ data: { ...data, documentId: 'old', requestId: 2 } })
    assert.equal(navigations.length, 1)
    assert.equal(new URL(navigations[0]).searchParams.get('category'), 'user')
    let settled = false
    const rate = playbackCommands.applyActivePlaybackRate(1.75).then((result) => {
      settled = true
      return result
    })
    const request = commands.at(-1)
    assert.equal(request.rate, 1.75)
    receive({ data: { type: playbackCommands.IFRAME_PLAYBACK_RATE, documentId: 'old', phase: 'result', requestId: request.requestId, applied: true } })
    await flush()
    assert.equal(settled, false)
    receive({ data: { type: playbackCommands.IFRAME_PLAYBACK_RATE, documentId: 'current', phase: 'result', requestId: request.requestId, applied: true } })
    assert.equal(await rate, true)
    active = false
    receive({ data: { ...data, requestId: 3 } })
    assert.equal(navigations.length, 1)
    scope.stop()
    assert.equal(receive, undefined)
  })
  check('A03 document theme: reload, stale host, route conflict and OLED share the actual reactive application', async () => {
    const protocol = await import('../src/constants/globalEvents')
    const route = Vue.ref('https://www.bilibili.com/video/BV1fixture')
    const location = { href: route.value }
    const childMessages = []
    const parentMessages = []
    const listeners = new Map()
    const childWindow = { location, parent: {}, addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name), dispatchEvent() {} }
    let frame = { contentWindow: { location }, getAttribute: () => route.value }
    const wire = {
      setIframeDocumentBinding() {},
      setParentDocumentBinding() {},
      getParentMessageData: (event, types) => types.includes(event.data.type) ? event.data : undefined,
      getIframeMessageData: event => event.data,
      postMessageToParent: (message) => {
        childMessages.push(message)
        return true
      },
      postMessageToIframe: (_frame, message) => {
        parentMessages.push(message)
        return true
      },
    }
    const documentModule = await loadSourceModule('../src/utils/iframeDocument.ts', { './iframeMessage': wire }, { crypto, location, window: childWindow })
    const settings = Vue.ref({ theme: 'dark', videoPageDarkMode: true, enableOledDarkMode: true, darkModeBaseColor: '#181818' })
    const dark = await loadSourceModule('../src/composables/useDark.ts', {
      '~/utils/darkModeTint': await import('../src/utils/darkModeTint'),
      'vue': Vue,
      '@vueuse/core': { usePreferredDark: () => Vue.ref(true) },
      '~/composables/useCurrentLocationHref': { useCurrentLocationHref: () => route },
      '~/constants/globalEvents': protocol,
      '~/logic': { settings },
      '~/utils/iframeDocument': documentModule,
      '~/utils/iframeMessage': wire,
      '~/utils/main': { isVideoPlaybackPage: () => true, setCookie() {} },
    }, { ...Vue, window: childWindow, CustomEvent })
    const host = documentModule.createIframeDocumentHost(() => frame)
    const deliver = message => listeners.get('message')({ data: message })
    const receive = message => host.receive({ data: message, origin: 'https://www.bilibili.com' })
    const handshake = () => {
      host.request()
      deliver(parentMessages.at(-1))
      receive(childMessages.at(-1))
      deliver(parentMessages.at(-1))
      assert.ok(receive(childMessages.at(-1)))
    }
    const rootClass = document.documentElement.className
    const bodyClass = document.body.className
    const oldStyle = document.documentElement.getAttribute('style')
    try {
      const state = dark.useDark()
      handshake()
      host.send({ type: protocol.IFRAME_DARK_MODE_CHANGE, isDark: false, isOledDark: false, darkModeBaseColor: '#282828' })
      const oldTheme = parentMessages.at(-1)
      deliver(oldTheme)
      await flush()
      assert.equal(state.isDark.value, false, 'parent light wins over local dark and video-page dark')
      assert.equal(document.documentElement.classList.contains('dark'), false)
      assert.equal(settings.value.theme, 'dark', 'inherited appearance is not saved')
      route.value = location.href = 'https://www.bilibili.com/video/BV2fixture'
      await flush()
      assert.ok(receive(childMessages.at(-1)))
      host.send({ type: protocol.IFRAME_DARK_MODE_CHANGE, isDark: true, isOledDark: true, darkModeBaseColor: '#242424' })
      deliver(parentMessages.at(-1))
      await flush()
      // A playback page keeps the dark palette under an inherited pure black.
      assert.equal(state.isDark.value, true)
      assert.equal(state.isOledDark.value, false)
      assert.equal(state.darkModeBaseColor.value, '#242424')
      assert.ok(!document.documentElement.classList.contains('oled-dark'))
      deliver(oldTheme)
      await flush()
      assert.equal(state.isDark.value, true, 'stale route reply is ignored')
      const oldReady = childMessages.at(-1)
      handshake()
      assert.equal(receive(oldReady), undefined, 'load rotates the host identity even at the same URL')
      dark.stopDarkState()
      const reloaded = dark.useDark()
      handshake()
      deliver(oldTheme)
      await flush()
      assert.equal(reloaded.isDark.value, true, 'old document messages cannot change a new document')
      frame = null
      host.clear()
      assert.equal(host.matches(oldReady), false)
    }
    finally {
      dark.stopDarkState()
      document.documentElement.className = rootClass
      document.body.className = bodyClass
      if (oldStyle === null)
        document.documentElement.removeAttribute('style')
      else document.documentElement.setAttribute('style', oldStyle)
    }
  })
}
