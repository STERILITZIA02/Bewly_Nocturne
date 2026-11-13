import assert from 'node:assert/strict'

import { loadSourceModule } from './sourceModuleHarness'

export function registerApprovedUpstreamChecks(check, { Vue, compileComponent, flush }) {
  check('approved upstream: quick filters persist the existing policy fields and open their exact settings', async () => {
    const settings = Vue.ref({ recommendationMode: 'app', enableFilterByLikeCount: false })
    const destinations = []
    const host = document.body.appendChild(document.createElement('div'))
    const Entry = await compileComponent('../src/components/ContentFilterEntry.vue', {
      'vue-i18n': { useI18n: () => ({ t: key => key }) },
      '~/logic': { settings },
      '~/composables/useAppProvider': { useBewlyApp: () => ({ openSettingsAt: target => destinations.push(target) }) },
      '~/components/Tooltip.vue': { default: { inheritAttrs: false, setup: (_props, { slots }) => () => slots.default?.() } },
      '~/components/ContextMenu.vue': { default: {
        props: ['options'],
        emits: ['select', 'close'],
        setup: (props, { emit }) => () => Vue.h('div', props.options.map(option => Vue.h('button', {
          'data-filter': option.value,
          'aria-checked': option.checked,
          'onClick': () => {
            emit('select', option.value)
            if (option.closeOnSelect !== false)
              emit('close')
          },
        }, option.label))),
      } },
    })
    const app = Vue.createApp({ render: () => Vue.h(Entry) })
    try {
      app.mount(host)
      host.querySelector('[aria-haspopup="menu"]').click()
      await flush()
      host.querySelector('[data-filter="enableFilterByLikeCount"]').click()
      assert.equal(settings.value.enableFilterByLikeCount, true, 'APP likes use the same existing filter setting')
      host.querySelector('[data-filter="settings"]').click()
      assert.equal(destinations.at(-1).settingId, 'settings.filter_by_view_count')
    }
    finally {
      app.unmount()
      host.remove()
    }
  })

  check('approved upstream: the native volume bridge rejects stale media and invalid steps on video and playlist routes', async () => {
    const url = window.location.href
    const originalPlayer = Object.getOwnPropertyDescriptor(window, 'player')
    const media = document.body.appendChild(document.createElement('video'))
    const stale = document.body.appendChild(document.createElement('video'))
    const bridge = await loadSourceModule('../src/utils/videoMetadataBridge.ts', {
      './pageBridgeChannel': { getPageBridgeChannelId: () => 'volume-fixture' },
    })
    const main = await loadSourceModule('../src/inject/videoMetadata.ts', {
      '~/inject/movedPgcReact': { createMovedPgcReactBridge: () => ({ release() {}, dispose() {} }), getMountedPgcEventRoot: () => null },
      '~/utils/bewlyWidescreen/constants': { selectors: { upPanel: ['.fixture-info'], toolbar: [], description: [], tags: [], mediaInfo: [], playlist: [], recommend: [] } },
      '~/utils/videoMetadataBridge': bridge,
    })
    Object.defineProperty(window, 'player', { configurable: true, value: { mediaElement: () => media } })
    const stop = main.setupVideoMetadataBridge('volume-fixture')
    try {
      window.history.replaceState(null, '', '/video/BV17x411w7KC')
      media.volume = 0.4
      assert.equal(bridge.adjustNativeVolume(media, 0.05), 0.45)
      assert.equal(bridge.adjustNativeVolume(stale, 0.05), undefined)
      assert.equal(stale.volume, 1)
      assert.equal(bridge.adjustNativeVolume(media, Number.NaN), undefined)
      assert.equal(bridge.adjustNativeVolume(media, 2), undefined)
      media.muted = true
      assert.equal(bridge.adjustNativeVolume(media, 0.1), 0.1)
      assert.equal(media.muted, false)
      window.history.replaceState(null, '', '/list/watchlater')
      assert.equal(bridge.adjustNativeVolume(media, 0.1), 0.2)
    }
    finally {
      stop()
      media.remove()
      stale.remove()
      window.history.replaceState(null, '', url)
      if (originalPlayer)
        Object.defineProperty(window, 'player', originalPlayer)
      else delete window.player
    }
  })

  check('approved upstream: localized feeds and spaces preserve host boundaries', async () => {
    const { getBilibiliLogicalPathname, toBilibiliLogicalUrl } = await import('../src/utils/bilibiliLocale')
    for (const [href, path] of [
      ['https://t.bilibili.com/zh-Hans/', '/'],
      ['https://t.bilibili.com/JA/123', '/123'],
      ['https://space.bilibili.com/zh-Hant/2/dynamic?x=1', '/2/dynamic'],
      ['https://www.bilibili.com/ja/opus/123', '/opus/123'],
      ['https://example.com/ja/video/BV17x411w7KC', '/ja/video/BV17x411w7KC'],
    ]) assert.equal(getBilibiliLogicalPathname(href), path)
    assert.equal(toBilibiliLogicalUrl('https://space.bilibili.com/zh-Hans/2/dynamic?x=1#reply'), 'https://space.bilibili.com/2/dynamic?x=1#reply')
  })

  check('approved upstream: moment IDs normalize before capability and forward-count lookups', async () => {
    const ids = []
    const { createMomentAdapter } = await loadSourceModule('../src/contentScripts/views/Moments/momentAdapter.ts', {
      '~/utils/dataFormatter': { numFormatter: String },
      '~/utils/momentAdditionalPolicy': await import('../src/utils/momentAdditionalPolicy'),
      '~/utils/momentDescription': await import('../src/utils/momentDescription'),
      '~/utils/momentMoreCapability': { resolveMomentMoreCapability: id => ids.push(id) },
      '~/utils/momentPromotion': { detectMomentPromotion: () => null },
      '~/utils/momentUrl': await import('../src/utils/momentUrl'),
    })
    const adapter = createMomentAdapter(key => key, (id) => {
      ids.push(id)
      return 0
    })
    const moment = adapter.mapMoment({ id: 123, type: 'DYNAMIC_TYPE_WORD', modules: { module_author: { mid: 1, pub_ts: 2 } } })
    assert.equal(moment.id, '123')
    assert.deepEqual(ids, ['123', '123'])
    assert.equal(adapter.mapMoment({ id_str: '9007199254740993123', modules: {} }).id, '9007199254740993123')
  })

  check('approved upstream: initial comment preference never overwrites an existing thread session', async () => {
    const { createMomentCommentSessionCache } = await import('../src/utils/momentCommentSession')
    const cache = createMomentCommentSessionCache('1')
    const target = { oid: '123', type: 17 }
    assert.equal(cache.open('1', 'a', target, undefined, 0).sort, 0)
    assert.equal(cache.open('1', 'b', target, undefined, 1).sort, 1)
    assert.equal(cache.open('1', 'a', target, undefined, 1).sort, 0)
    assert.equal(cache.open('1', 'a', target, 1, 0).sort, 1)
  })

  check('approved upstream: accepted recommendation rows survive filtering and restore without another feed cache', async () => {
    const { createRecommendationFeed } = await import('../src/contentScripts/views/Home/recommendationFeed')
    const list = Vue.shallowRef([])
    const ads = Vue.ref(true)
    const scope = Vue.effectScope()
    const feed = scope.run(() => createRecommendationFeed(list, { blockAds: () => ads.value, keysOf: row => [row.uniqueId] }))
    feed.append([{ uniqueId: 'a', isAdvertisement: false, filtered: true }, { uniqueId: 'ad', isAdvertisement: true }, { uniqueId: 'b', isAdvertisement: false }])
    assert.deepEqual(feed.visible.value.map(row => row.uniqueId), ['b'])
    assert.equal(feed.has('a'), true)
    list.value = list.value.map(row => ({ ...row, filtered: false }))
    assert.deepEqual(feed.visible.value.map(row => row.uniqueId), ['a', 'b'])
    ads.value = false
    await flush()
    assert.deepEqual(feed.visible.value.map(row => row.uniqueId), ['a', 'ad', 'b'])
    scope.stop()
  })

  check('approved upstream: nested dialogs release the actual viewport only after its last owner', async () => {
    const { lockDialogScroll } = await import('../src/utils/dialogScroll')
    const viewport = document.createElement('div')
    viewport.style.setProperty('overflow-y', 'auto', 'important')
    viewport.scrollTop = 900
    const first = lockDialogScroll(viewport)
    const second = lockDialogScroll(viewport)
    first()
    assert.equal(viewport.style.overflowY, 'hidden')
    second()
    assert.equal(viewport.style.overflowY, 'auto')
    assert.equal(viewport.style.getPropertyPriority('overflow-y'), 'important')
    assert.equal(viewport.scrollTop, 900)
  })

  check('approved upstream: wheel volume has one owner, skips scroll UI and releases on exit, media change and disable', async () => {
    const settings = Vue.ref({ customFullscreenWheelVolume: false, fullscreenWheelVolumeStep: 5 })
    const root = document.body.appendChild(document.createElement('div'))
    let media = root.appendChild(document.createElement('video'))
    let full = null
    let sync
    let domChanged
    let attached = 0
    const writes = []
    const status = []
    const { setupFullscreenWheelVolume } = await loadSourceModule('../src/contentScripts/fullscreenWheelVolume.ts', {
      'vue': Vue,
      '~/logic': { settings },
      '~/contentScripts/playerDomLifecycle': { hasPlayerMediaMutation: () => true, observePlayerDom(callback) {
        attached++
        domChanged = callback
        callback()
        return () => attached--
      } },
      '~/utils/fullscreenChange': { getFullscreenElement: () => full, subscribeFullscreenChange(callback) {
        sync = callback
        return () => sync = undefined
      } },
      '~/utils/i18n': { i18n: { global: { t: (_key, value) => String(value.volume) } } },
      '~/utils/player': { showState: value => status.push(value) },
      '~/utils/playerMedia': { getVideoElement: () => media },
      '~/utils/videoMetadataBridge': { adjustNativeVolume(video, delta) {
        if (delta)
          writes.push(video)
        video.volume = Math.max(0, Math.min(1, video.volume + delta))
        return video.volume
      } },
      '~/utils/wheelStep': await import('../src/utils/wheelStep'),
    })
    let time = 0
    function wheel(target, deltaY = -100, extra = {}) {
      const event = new window.WheelEvent('wheel', { deltaY, bubbles: true, composed: true, cancelable: true, ...extra })
      Object.defineProperty(event, 'timeStamp', { value: time += 300 })
      target.dispatchEvent(event)
      return event.defaultPrevented
    }
    let nativeCalls = 0
    const native = () => nativeCalls++
    const stop = setupFullscreenWheelVolume()
    try {
      media.volume = 0.4
      assert.equal(wheel(media), false)
      settings.value.customFullscreenWheelVolume = true
      await flush()
      assert.equal(attached, 0)
      full = root
      sync()
      document.addEventListener('wheel', native)
      assert.equal(wheel(media), true)
      assert.equal(media.volume, 0.45)
      assert.equal(nativeCalls, 0, 'the native/BTR bubbling path cannot adjust a second time')
      assert.equal(writes.length, 1)
      settings.value.fullscreenWheelVolumeStep = 10
      wheel(media)
      assert.equal(media.volume, 0.55)
      assert.equal(status.at(-1), '55')
      const menu = root.appendChild(document.createElement('div'))
      menu.setAttribute('role', 'menu')
      assert.equal(wheel(menu), false)
      const scroller = root.appendChild(document.createElement('div'))
      scroller.style.overflowY = 'auto'
      Object.defineProperties(scroller, { scrollHeight: { value: 500 }, clientHeight: { value: 50 } })
      assert.equal(wheel(scroller), false)
      assert.equal(wheel(media, -100, { ctrlKey: true }), false)
      const old = media
      media = document.createElement('video')
      old.replaceWith(media)
      domChanged()
      media.volume = 0.2
      wheel(media)
      assert.equal(writes.at(-1), media)
      assert.equal(old.volume, 0.55)
      full = null
      sync()
      assert.equal(attached, 0)
      assert.equal(wheel(media), false)
      full = root
      sync()
      settings.value.customFullscreenWheelVolume = false
      await flush()
      assert.equal(attached, 0)
      assert.equal(wheel(media), false)
    }
    finally {
      stop()
      document.removeEventListener('wheel', native)
      root.remove()
    }
  })

  check('approved upstream: default animation stays native and neutral/custom colours share theme tokens', async () => {
    const { getThemeColorTokens } = await import('../src/utils/themeColor')
    assert.equal(getThemeColorTokens('#00a1d6', false).actionAnimationFilter, 'none')
    assert.equal(getThemeColorTokens('neutral', false).actionAnimationFilter, 'grayscale(1) brightness(0)')
    assert.equal(getThemeColorTokens('neutral', true).actionAnimationFilter, 'grayscale(1) brightness(10)')
    assert.match(getThemeColorTokens('#f43f5e', false).actionAnimationFilter, /^hue-rotate\(/)
  })

  check('approved upstream: seven-option vote keeps hidden choices, selection, submit and results', async () => {
    const host = document.body.appendChild(document.createElement('div'))
    let submitted
    let reads = 0
    const reply = () => ({ code: 0, data: { vote_info: { title: 'vote', choice_cnt: 2, join_num: 100, my_votes: submitted ?? [], options: Array.from({ length: 7 }, (_, i) => ({ opt_idx: i + 1, opt_desc: `option ${i + 1}`, cnt: i })) } } })
    const Vote = await compileComponent('../src/components/MomentCard/MomentVote.vue', {
      'vue-i18n': { useI18n: () => ({ t: key => key, locale: Vue.ref('en') }) },
      '~/stores/topBarStore': { useTopBarStore: () => ({ userInfo: { mid: '1' } }) },
      '~/utils/api': { default: { moment: {
        getMomentVote: async () => {
          reads++
          return reply()
        },
        submitMomentVote: async (payload) => {
          submitted = payload.votes
          return { code: 0 }
        },
      } } },
      '~/utils/main': { getCSRF: () => 'fixture', getUserID: () => '1' },
      '~/utils/momentVote': await import('../src/utils/momentVote'),
      './utils': { getMomentThumbnailUrl: value => value },
      '~/components/ChartRungs.vue': { default: { render: () => null } },
    })
    const app = Vue.createApp(Vote, { voteId: '1', momentId: '123', fallbackTitle: '', fallbackEndTime: 0 })
    try {
      app.mount(host)
      await flush()
      assert.equal(host.querySelectorAll('input').length, 7)
      assert.equal(host.querySelectorAll('[inert] input').length, 1)
      const toggle = host.querySelector('.moment-vote__toggle')
      toggle.click()
      await flush()
      assert.equal(host.querySelectorAll('[inert] input').length, 0)
      host.querySelector('input[value="7"]').click()
      await flush()
      toggle.click()
      await flush()
      assert.equal(host.querySelector('input[value="7"]').checked, true)
      host.querySelector('.moment-vote__submit').click()
      await flush()
      assert.deepEqual(submitted, [7])
      assert.equal(reads, 2)
      assert.equal(host.querySelectorAll('.moment-vote__result').length, 7)
      assert.equal(host.querySelector('.moment-vote__submit'), null)
    }
    finally {
      app.unmount()
      host.remove()
    }
  })
}
