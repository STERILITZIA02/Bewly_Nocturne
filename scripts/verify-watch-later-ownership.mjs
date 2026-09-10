import assert from 'node:assert/strict'

import { loadSourceModule } from './sourceModuleHarness'

export function registerWatchLaterOwnershipChecks(check, { Vue, flush }) {
  const deferred = () => {
    let resolve
    const promise = new Promise(done => resolve = done)
    return { promise, resolve }
  }

  async function cardFixture({ pendingMember = false, pendingAid = false, pendingWrite = false, preview = false } = {}) {
    const member = deferred()
    const aid = deferred()
    const write = deferred()
    let cookieMid = '1'
    let csrf = 'csrf-1'
    const sends = []
    const commits = []
    const errors = []
    const previewRequests = []
    const hoverTimers = new Map()
    let hoverTimerId = 0
    const store = Vue.reactive({
      isLogin: true,
      userInfo: { mid: 1 },
      member: false,
      ensureWatchLaterState: () => pendingMember ? member.promise : Promise.resolve(true),
      isInWatchLater: () => store.member,
      commitWatchLaterMutation: async (...args) => commits.push(args),
    })
    const api = {
      video: {
        getVideoInfo: () => pendingAid ? aid.promise : Promise.resolve({ code: 0, data: { aid: 101 } }),
        getVideoPreview: (params) => {
          const task = deferred()
          previewRequests.push({ ...task, params })
          return task.promise
        },
      },
      watchlater: Object.fromEntries(['saveToWatchLater', 'removeFromWatchLater'].map(action => [action, (params) => {
        sends.push({ action, params, mid: cookieMid })
        return pendingWrite ? write.promise : Promise.resolve({ code: 0 })
      }])),
    }
    const main = { getUserID: () => cookieMid, getCSRF: () => csrf, removeHttpFromUrl: value => value }
    const watchLater = await loadSourceModule('../src/utils/watchLater.ts', {
      '~/utils/api': { default: api },
      '~/utils/pgcEpisode': { resolvePgcEpisodeVideoIds: async () => null },
      '~/utils/main': main,
    })
    const logic = await loadSourceModule('../src/components/VideoCard/composables/useVideoCardLogic.ts', {
      'vue-i18n': { useI18n: () => ({ t: key => key }) },
      'vue-toastification': { useToast: () => ({ error: message => errors.push(message), warning: message => errors.push(message) }) },
      '~/composables/useAppProvider': { useBewlyApp: () => ({ openIframeDrawer() {} }) },
      '~/constants/mediaPreview': { DELAYED_MEDIA_PREVIEW_MS: 1200 },
      '~/logic': { appAuthTokens: Vue.ref({}), settings: Vue.ref({ enableVideoPreview: preview }) },
      '~/stores/topBarStore': { useTopBarStore: () => store },
      '~/utils/accountLifetime': await import('../src/utils/accountLifetime'),
      '~/utils/accountScope': await import('../src/utils/accountScope'),
      '~/utils/api': { default: api },
      '~/utils/authProvider': {},
      '~/utils/dataFormatter': { parseStatNumber: value => value },
      '~/utils/floatingMenu': {},
      '~/utils/main': main,
      '~/utils/messaging': { isExtensionContextInvalidatedError: () => false },
      '~/utils/tabs': {},
      '~/utils/userRelation': { onUserRelationChange: () => () => {} },
      '~/utils/watchLater': watchLater,
      '../types': await import('../src/components/VideoCard/types'),
      '../utils': {},
      './videoPreviewCache': { releaseVideoPreviewCacheEntry() {}, retainVideoPreviewCacheEntry() {} },
    }, { ...Vue, inject: (_key, fallback) => fallback, window: { setTimeout: (callback) => {
      hoverTimers.set(++hoverTimerId, callback)
      return hoverTimerId
    } }, clearTimeout: id => hoverTimers.delete(id) })
    const props = Vue.ref({ video: { aid: pendingAid ? undefined : 101, bvid: 'BV1xx411c7mD', cid: 91 }, showWatchLater: false, showPreview: preview })
    const scope = Vue.effectScope()
    const card = scope.run(() => logic.useVideoCardLogic(props))
    return {
      card,
      props,
      scope,
      store,
      sends,
      commits,
      errors,
      previewRequests,
      hoverTimers,
      member,
      aid,
      write,
      setCookie(mid) { cookieMid = mid },
      setCsrf(value) { csrf = value },
    }
  }

  check('video preview: in-place BV/CID changes, account changes and disposal invalidate actual pending fetches', async () => {
    const fixture = await cardFixture({ preview: true })
    const response = url => ({ code: 0, data: { durl: [{ url }] } })
    try {
      fixture.card.handleMouseEnter(new MouseEvent('mouseenter'))
      const timers = [...fixture.hoverTimers.values()]
      fixture.hoverTimers.clear()
      timers.forEach(run => run())
      await flush()
      assert.equal(fixture.previewRequests.length, 1)
      fixture.props.value.video.bvid = 'BV2xx411c7mD'
      fixture.props.value.video.cid = 92
      await flush()
      assert.equal(fixture.previewRequests.length, 2)
      assert.deepEqual({ ...fixture.previewRequests[1].params }, { bvid: 'BV2xx411c7mD', cid: 92 })
      fixture.previewRequests[0].resolve(response('https://example.com/old.mp4'))
      await flush()
      assert.equal(fixture.card.previewVideoUrl.value, '')
      fixture.previewRequests[1].resolve(response('https://example.com/new.mp4'))
      await flush()
      assert.equal(fixture.card.previewVideoUrl.value, 'https://example.com/new.mp4')
      fixture.props.value.video.cid = 93
      await flush()
      fixture.setCookie('2')
      fixture.store.userInfo.mid = 2
      await flush()
      fixture.previewRequests[2].resolve(response('https://example.com/old-account.mp4'))
      await flush()
      assert.equal(fixture.card.previewVideoUrl.value, '')
      fixture.previewRequests[3].resolve(response('https://example.com/account-2.mp4'))
      await flush()
      assert.equal(fixture.card.previewVideoUrl.value, 'https://example.com/account-2.mp4')
      fixture.props.value.video.cid = 94
      await flush()
      fixture.scope.stop()
      fixture.previewRequests[4].resolve(response('https://example.com/disposed.mp4'))
      await flush()
      assert.equal(fixture.card.previewVideoUrl.value, '')
    }
    finally { fixture.scope.stop() }
  })

  check('video card hover: pressed buttons and dragged content cancel waiting previews while fullscreen and scrubbing stay active', async () => {
    const fixture = await cardFixture()
    const { card, hoverTimers } = fixture
    try {
      card.handleMouseEnter(new MouseEvent('mouseenter', { buttons: 1 }))
      assert.equal(hoverTimers.size, 0)
      card.handleMouseEnter(new MouseEvent('mouseenter'))
      assert.equal(hoverTimers.size, 1)
      card.cancelDragPreview()
      assert.equal(hoverTimers.size, 0)
      assert.equal(card.isHover.value, false)
      card.isHover.value = true
      card.isPreviewFullscreen.value = true
      card.cancelDragPreview()
      assert.equal(card.isHover.value, true)
      card.isPreviewFullscreen.value = false
      card.isPreviewScrubbing.value = true
      card.cancelDragPreview()
      assert.equal(card.isHover.value, true)
    }
    finally { fixture.scope.stop() }
    assert.equal(hoverTimers.size, 0)
  })

  check('watch later: the actual card never sends after account/cookie/media changes or disposal during awaited identity work', async () => {
    for (const stage of ['membership', 'aid']) {
      for (const change of ['account', 'cookie', 'csrf', 'media', 'media-in-place', 'dispose']) {
        const fixture = await cardFixture({ pendingMember: stage === 'membership', pendingAid: stage === 'aid' })
        try {
          const task = fixture.card.toggleWatchLater()
          await flush()
          if (change === 'account') {
            fixture.store.userInfo.mid = 2
            fixture.setCookie('2')
          }
          if (change === 'cookie')
            fixture.setCookie('2')
          if (change === 'csrf')
            fixture.setCsrf('csrf-2')
          if (change === 'media')
            fixture.props.value = { ...fixture.props.value, video: { aid: 202, bvid: 'BV2xx411c7mD' } }
          if (change === 'media-in-place')
            fixture.props.value.video.bvid = 'BV2xx411c7mD'
          if (change === 'dispose')
            fixture.scope.stop()
          fixture.member.resolve(true)
          fixture.aid.resolve({ code: 0, data: { aid: 101 } })
          await task
          assert.equal(fixture.sends.length, 0, `${stage}/${change}: stale work must stop before the HTTP write`)
          assert.equal(fixture.commits.length, 0)
        }
        finally { fixture.scope.stop() }
      }
    }
  })

  check('watch later: repeat clicks join no new write, submitted action stays fixed, and old results do not settle a new operation', async () => {
    const fixture = await cardFixture({ pendingMember: true, pendingWrite: true })
    try {
      const first = fixture.card.toggleWatchLater()
      fixture.props.value = { ...fixture.props.value, video: { ...fixture.props.value.video, title: 'refreshed metadata' } }
      await flush()
      assert.equal(fixture.card.isUpdatingWatchLater.value, true, 'same-media metadata replacement retains the operation lock')
      await fixture.card.toggleWatchLater()
      fixture.store.member = true
      fixture.member.resolve(true)
      await flush()
      assert.equal(fixture.sends.length, 1)
      assert.equal(fixture.sends[0].action, 'removeFromWatchLater')
      fixture.store.member = false
      fixture.props.value = { ...fixture.props.value, video: { ...fixture.props.value.video, view: 999 } }
      await flush()
      await fixture.card.toggleWatchLater()
      assert.equal(fixture.sends.length, 1, 'refreshing metadata during a sent request cannot invert and resubmit it')
      fixture.store.userInfo.mid = 2
      fixture.setCookie('2')
      fixture.write.resolve({ code: 0 })
      await first
      assert.equal(fixture.sends.length, 1)
      assert.equal(fixture.commits.length, 0, 'account 2 must not receive account 1 completion')
      assert.deepEqual(fixture.errors, [])
    }
    finally { fixture.scope.stop() }
  })

  check('watch later: the real native toolbar rejects old readiness continuations and reconciles sent writes after its view is removed', async () => {
    const oldUrl = window.location.href
    const oldHistoryState = window.history.state
    for (const invalidation of ['cookie', 'navigation', 'stop', 'after-send', 'account-after-send']) {
      const aid = deferred()
      const write = deferred()
      const sends = []
      const commits = []
      let cookieMid = '1'
      const store = Vue.reactive({
        isLogin: true,
        userInfo: { mid: 1 },
        addedWatchLaterList: [],
        getUserInfo: async () => {},
        ensureWatchLaterState: async () => true,
        isInWatchLater: () => false,
        commitWatchLaterMutation: async (...args) => commits.push(args),
      })
      const api = { video: { getVideoInfo: () => aid.promise }, watchlater: {
        saveToWatchLater: (params) => {
          sends.push(params)
          return write.promise
        },
        removeFromWatchLater: () => { throw new Error('unexpected removal') },
      } }
      const main = { getCSRF: () => 'csrf-1', getUserID: () => cookieMid }
      const watchLater = await loadSourceModule('../src/utils/watchLater.ts', {
        '~/utils/api': { default: api },
        '~/utils/main': main,
        '~/utils/pgcEpisode': { resolvePgcEpisodeVideoIds: async () => null },
      })
      const native = await loadSourceModule('../src/utils/watchLaterButton.ts', {
        'vue': Vue,
        '~/logic': { settings: Vue.ref({ language: 'en', externalWatchLaterButton: true }) },
        '~/stores/topBarStore': { useTopBarStore: () => store },
        '~/utils/accountLifetime': await import('../src/utils/accountLifetime'),
        '~/utils/accountScope': await import('../src/utils/accountScope'),
        '~/utils/bilibiliApiError': { isBilibiliRiskControl: () => false },
        '~/utils/i18n': { i18n: { global: { t: key => key, locale: Vue.ref('en') } } },
        '~/utils/main': main,
        '~/utils/messaging': { isExtensionContextInvalidatedError: () => false },
        '~/utils/watchLater': watchLater,
      }, { location: window.location })
      const toolbar = document.body.appendChild(document.createElement('div'))
      toolbar.className = 'video-toolbar-container'
      const more = toolbar.appendChild(document.createElement('button'))
      more.className = 'video-tool-more'
      more.getBoundingClientRect = () => ({ width: 40, height: 40 })
      try {
        window.history.replaceState(null, '', '/video/av101/')
        assert.equal(native.addWatchLaterButton(), true)
        await flush()
        const original = toolbar.querySelector('.bewly-watch-later-btn')
        assert.equal(original.disabled, false)
        if (!invalidation.endsWith('after-send'))
          window.history.replaceState(null, '', '/video/BV1xx411c7mD/')
        original.click()
        await flush()
        if (invalidation === 'cookie')
          cookieMid = '2'
        if (invalidation === 'navigation')
          window.history.replaceState(null, '', '/video/av303/')
        if (invalidation === 'stop' || invalidation === 'after-send')
          native.removeWatchLaterButton()
        if (invalidation === 'account-after-send') {
          cookieMid = '2'
          store.userInfo.mid = 2
          await flush()
        }
        aid.resolve({ code: 0, data: { aid: 202 } })
        await flush()
        if (invalidation === 'after-send') {
          assert.deepEqual(sends.map(params => ({ ...params })), [{ aid: 101, csrf: 'csrf-1' }])
          write.resolve({ code: 0 })
          await flush()
          assert.deepEqual(commits, [[101, true, 1]], 'the account store still reconciles an accepted old-view write')
        }
        else if (invalidation === 'account-after-send') {
          const replacement = toolbar.querySelector('.bewly-watch-later-btn')
          assert.notEqual(replacement, original)
          assert.equal(replacement.disabled, false)
          write.resolve({ code: 0 })
          await flush()
          assert.equal(replacement.disabled, false, 'old completion cannot disable the new account toolbar')
          assert.equal(commits.length, 0)
          assert.equal(sends.length, 1, 'account transition never replays the old write')
        }
        else {
          assert.equal(sends.length, 0, invalidation)
          assert.equal(commits.length, 0)
        }
      }
      finally {
        native.removeWatchLaterButton()
        toolbar.remove()
        window.history.replaceState(oldHistoryState, '', oldUrl)
      }
    }
  })
}
