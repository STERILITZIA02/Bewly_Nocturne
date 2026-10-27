import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import { loadSourceFunctions } from './sourceFunctionHarness'
import { loadSourceModule } from './sourceModuleHarness'

function deferred() {
  let resolve
  const promise = new Promise(done => resolve = done)
  return { promise, resolve }
}

const plain = value => JSON.parse(JSON.stringify(value))

async function feedbackModule(auth) {
  return loadSourceModule('../src/utils/appFeedFeedback.ts', {
    '~/models/video/appForYou': await import('../src/models/video/appForYou'),
    './appClient': { isUncertainAppClientFailure: error => error.uncertain === true },
    './authProvider': auth,
  })
}

export function registerRecommendationRuntimeChecks(check, { Vue, flush, compileComponent }) {
  check('requested reliability: feedback identities, object parameters, auth snapshots and cancellation retain their semantics', async () => {
    const requests = []
    let current = true
    let response = { code: 0 }
    let failure
    let refreshes = 0
    const module = await feedbackModule({
      isAppAuthCurrent: () => current,
      isAppAccessTokenInvalidResponse: value => value.code === -101,
      refreshInvalidAppAccessToken: () => refreshes++,
      requestAppClient: async (endpoint, params, owner) => {
        requests.push({ endpoint, params, owner })
        assert.ok(Object.isFrozen(params))
        if (failure)
          throw failure
        return response
      },
    })
    const reasons = [{ id: 4, mid: 1 }, { id: 4, mid: 2 }, { id: 4, rid: 1 }, { id: 4, rid: 2 }, { id: 4, tag_id: 1 }, { id: 4, tag_id: 2 }]
    const keys = reasons.map(reason => module.getAppFeedFeedbackReasonKey('dislike', reason))
    assert.equal(new Set(keys).size, reasons.length)
    assert.notEqual(keys[0], module.getAppFeedFeedbackReasonKey('feedback', reasons[0]))
    assert.notEqual(module.getAppFeedFeedbackReasonKey('dislike', { id: 4 }), module.getAppFeedFeedbackReasonKey('dislike', { id: 4, mid: 0 }))
    const auth = { mid: 7, accessToken: 'captured-token' }
    const target = { goto: 'bangumi', id: '123' }
    const selection = { reasonId: 4, mid: 0, rid: 2, tag_id: 3 }
    assert.equal((await module.submitAppFeedFeedback('feedDislike', auth, target, selection)).outcome, 'succeeded')
    assert.deepEqual(plain(requests[0].params), { access_key: auth.accessToken, goto: 'bangumi', id: '123', reason_id: 4, mid: 0, rid: 2, tag_id: 3, ...(await import('../src/constants/appClient')).APP_CLIENT_FEEDBACK_PARAMS })
    assert.deepEqual(plain(requests[0].owner), { mid: 7 })
    await module.submitAppFeedFeedback('feedDislike', auth, target, { feedbackId: 4 })
    assert.equal(requests.at(-1).params.feedback_id, 4)
    assert.equal('reason_id' in requests.at(-1).params, false)
    await module.submitAppFeedFeedback('feedDislikeCancel', auth, target, selection)
    for (const key of ['reason_id', 'feedback_id', 'mid', 'rid', 'tag_id'])
      assert.equal(key in requests.at(-1).params, false, 'cancel carries only the captured target')
    response = { code: -101 }
    assert.equal((await module.submitAppFeedFeedback('feedDislike', auth, target, selection)).outcome, 'expired')
    assert.equal(refreshes, 1)
    failure = { uncertain: true }
    assert.equal((await module.submitAppFeedFeedback('feedDislike', auth, target, selection)).outcome, 'uncertain')
    current = false
    assert.equal((await module.submitAppFeedFeedback('feedDislike', auth, target, selection)).outcome, 'stale')
    assert.equal(requests.length, 6, 'unknown and expired writes are never automatically resent')
    assert.deepEqual(plain(module.getAppFeedFeedbackTarget({ goto: 'bangumi', param: '123', id: 999 })), target)
    assert.equal(module.getAppFeedFeedbackTarget({ goto: 'bangumi', id: 123 }), null, 'a season has no implicit aid fallback')
    assert.equal(module.getAppFeedFeedbackTarget({ goto: 'ketang', id: 123 }), null)
    assert.deepEqual(plain(module.getAppFeedFeedbackTarget({ goto: 'av', aid: 5, id: 6 })), { goto: 'av', id: '5' })
  })

  check('requested reliability: actual dislike dialog distinguishes equal IDs and resets replaced or empty option lists', async () => {
    const requests = []
    const removed = []
    let keydown
    let freshness = async () => true
    const module = await feedbackModule({
      isAppAuthCurrent: () => true,
      isAppAccessTokenInvalidResponse: () => false,
      requestAppClient: async (_endpoint, params) => {
        requests.push(params)
        return { code: 0 }
      },
    })
    const Component = await compileComponent('../src/components/VideoCard/VideoCardContextMenu/components/DislikeDialog.vue', {
      '@vueuse/core': { onKeyStroke: callback => keydown = callback },
      'vue-i18n': { useI18n: () => ({ t: key => key }) },
      'vue-toastification': { useToast: () => ({ warning() {}, error() {} }) },
      '~/models/video/appForYou': await import('../src/models/video/appForYou'),
      '~/utils/appFeedFeedback': module,
      '~/logic/recommendationMode': { getRecommendationRequestIdentity: () => '' },
      '~/utils/authProvider': { captureAppAuth: () => ({ mid: 7, accessToken: 'captured' }), ensureFreshAppAccessToken: () => freshness() },
    })
    const reason = (name, rid) => ({ id: 4, name, rid })
    const first = reason('Channel A', 1)
    const second = reason('Channel B', 2)
    const props = Vue.reactive({ modelValue: true, video: { goto: 'bangumi', param: '123', id: 0, threePointV2: [{ type: 'dislike', reasons: [first, second] }, { type: 'feedback', reasons: [first] }] } })
    const Dialog = { emits: ['confirm', 'close'], setup: (_props, { slots, emit }) => () => Vue.h('div', [slots.default?.(), Vue.h('button', { onClick: () => emit('confirm') }, 'Confirm')]) }
    const host = document.body.appendChild(document.createElement('div'))
    const app = Vue.createApp({ render: () => Vue.h(Component, { ...props, onRemoved: value => removed.push(value) }) })
    app.component('Dialog', Dialog)
    app.config.globalProperties.$t = key => key
    app.mount(host)
    const selected = () => [...host.querySelectorAll('.activated-dislike-reason')]
    try {
      const nodes = [...host.querySelectorAll('li')]
      assert.equal(selected().length, 1)
      nodes[1].click()
      await flush()
      assert.equal(selected()[0], nodes[1])
      props.video = { ...props.video, url: 'https://www.bilibili.com/bangumi/play/ss123?t=99' }
      await flush()
      assert.equal(selected()[0], nodes[1], 'preview URL and unrelated card changes cannot reset an actual feedback selection')
      host.querySelector('button').click()
      await flush()
      assert.equal(requests.at(-1).rid, 2)
      assert.equal(requests.at(-1).reason_id, 4)
      nodes[2].click()
      await flush()
      assert.equal(selected().length, 1)
      assert.equal(selected()[0], nodes[2], 'the feedback group cannot select the dislike group with the same reason ID')
      host.querySelector('button').click()
      await flush()
      assert.equal(requests.at(-1).feedback_id, 4)
      props.video.threePointV2[0].reasons = [second, first]
      await flush()
      assert.equal(host.querySelector('li'), nodes[1], 'list keys preserve the actual object rather than its position or shared ID')
      assert.equal(selected()[0], nodes[1])
      keydown({ key: 'ArrowDown', preventDefault() {} })
      await flush()
      assert.equal(selected()[0], nodes[0])
      const waiting = deferred()
      freshness = () => waiting.promise
      host.querySelector('button').click()
      props.video.threePointV2 = [{ type: 'dislike', reasons: [reason('Replacement', 3)] }]
      await flush()
      waiting.resolve(true)
      await flush()
      assert.equal(requests.length, 2, 'a removed selection cannot be submitted after an auth refresh')
      assert.equal(selected().length, 1)
      props.video.threePointV2 = []
      await flush()
      assert.equal(selected().length, 0)
      host.querySelector('button').click()
      await flush()
      assert.equal(requests.length, 2)
      assert.equal(removed.length, 2)
      props.video.threePointV2 = [{ type: 'feedback', reasons: [first, second] }]
      await flush()
      const feedbackNodes = [...host.querySelectorAll('li')]
      feedbackNodes[1].click()
      await flush()
      props.video = { ...props.video, url: 'https://www.bilibili.com/bangumi/play/ss123?t=100' }
      await flush()
      assert.equal(selected()[0], feedbackNodes[1], 'an absent group also remains stable across preview-link changes')
    }
    finally {
      app.unmount()
      host.remove()
    }
  })

  check('requested reliability: PGC and course recommendation feedback is independent of the rendered media type', async () => {
    const adapter = await loadSourceModule('../src/contentScripts/views/Home/adapters/appRecommendationItem.ts', {
      '~/utils/bvid': await import('../src/utils/bvid'),
    })
    const transforms = await loadSourceModule('../src/contentScripts/views/Home/adapters/recommendationVideo.ts', {
      './appRecommendationItem': adapter,
      '~/utils/advertising': { isBilibiliAdvertisement: () => false },
      '~/utils/htmlDecode': { decodeHtmlEntities: value => value || '' },
      '~/utils/uriParse': await import('../src/utils/uriParse'),
    })
    const feedback = await feedbackModule({})
    const props = Vue.reactive({ video: {} })
    let visualType = 'bangumi'
    const menu = await loadSourceFunctions('../src/components/VideoCard/VideoCardContextMenu/VideoCardContextMenu.vue', ['configurableGroups'], {
      computed: Vue.computed,
      props,
      getVideoType: () => visualType,
      getAuthorMid: () => undefined,
      window: {},
      getAuthorFollowed: () => undefined,
      isBangumiVideo: (await import('../src/components/VideoCard/utils')).isBangumiVideo,
      getAppFeedFeedbackTarget: feedback.getAppFeedFeedbackTarget,
      ThreePointV2Type: (await import('../src/models/video/appForYou')).Type,
      t: key => key,
      openAppDislikeDialog() {},
      handleWebDislike() {},
      canFavoriteVideo: () => false,
      closeThen: callback => callback,
      copyCleanLink() {},
    })
    for (const uri of ['bilibili://pgc/season/123', 'https://www.bilibili.com/cheese/play/ss123']) {
      const raw = { card_goto: 'bangumi', param: '123', uri, args: { aid: 123 }, three_point_v2: [{ type: 'feedback', reasons: [{ id: 4, rid: 2 }] }] }
      const normalized = adapter.normalizeAppVideoItem(raw)
      const video = transforms.transformAppVideo(normalized)
      assert.equal(video.aid, undefined)
      assert.equal(video.id, 0)
      assert.equal(video.recommendationSource, 'app')
      assert.equal(video.goto, 'bangumi')
      assert.deepEqual(Array.from(adapter.getAppVideoKeys(normalized)), ['bangumi:123'])
      props.video = video
      assert.equal(menu.configurableGroups.value[0][0].key, 'notInterested')
      visualType = 'common'
      props.video = { ...video }
      assert.equal(menu.configurableGroups.value[0][0].key, 'notInterested')
    }
    const explicit = adapter.normalizeAppVideoItem({ card_goto: 'bangumi', param: '123', args: { aid: 123 }, player_args: { aid: 456 } })
    assert.equal(transforms.transformAppVideo(explicit).aid, 456, 'only the explicit playback aid is a video identity')
    assert.equal(adapter.normalizeAppVideoItem({ card_goto: 'av', param: '456', args: {} }).args.aid, 456)
    props.video = { threePointV2: [] }
    visualType = 'appRcmd'
    assert.equal(menu.configurableGroups.value[0].length, 0, 'presentation alone does not grant feed feedback')
    assert.equal(transforms.transformWebVideo({ id: 1, owner: {} }).recommendationSource, 'web')
  })

  check('requested reliability: ordinary API merging skips undefined before overriding defaults without loosening strict params', async () => {
    const requests = []
    const module = await loadSourceModule('../src/background/utils.ts', {
      'webextension-polyfill': { default: {} },
      '~/utils/abort': await import('../src/utils/abort'),
      './wbiSign': { needsWbiSign: () => false, isBilibiliNavUrl: () => false },
    }, { URLSearchParams, fetch: async (url, options) => {
      requests.push({ url: new URL(url), options })
      return new Response('{"code":0}', { headers: { 'content-type': 'application/json' } })
    } })
    const serializers = []
    const api = {
      url: 'https://api.bilibili.com/fixture',
      params: { aid: 123, count: 1, enabled: true, empty: 'default' },
      _fetch: { method: 'post', strictParams: true, body: { csrf: 'default', count: 1, enabled: true, nullable: 'default', empty: 'default' }, bodySerializer: (body) => {
        serializers.push(plain(body))
        return JSON.stringify(body)
      } },
      afterHandle: [response => response.json()],
    }
    const message = { contentScriptQuery: 'fixture', aid: undefined, csrf: undefined, count: 0, enabled: false, nullable: null, empty: '', unknown: 5 }
    await module.apiListenerFactory({ fixture: api })(message)
    assert.equal(requests[0].url.searchParams.get('aid'), '123')
    assert.equal(requests[0].url.searchParams.get('count'), '0')
    assert.equal(requests[0].url.searchParams.get('enabled'), 'false')
    assert.equal(requests[0].url.searchParams.has('unknown'), false)
    assert.equal(requests[0].url.searchParams.has('empty'), false, 'query empty-string omission retains the existing API semantics')
    assert.deepEqual(serializers[0], { csrf: 'default', count: 0, enabled: false, nullable: null, empty: '' })
    api._fetch.bodySerializer = undefined
    await module.apiListenerFactory({ fixture: api })(message)
    assert.deepEqual(JSON.parse(requests[1].options.body), serializers[0], 'JSON bodies retain explicit null and empty strings')
    api._fetch.headers = { 'Content-Type': 'application/x-www-form-urlencoded' }
    await module.apiListenerFactory({ fixture: api })(message)
    assert.equal(requests[2].options.body.get('csrf'), 'default')
    assert.equal(requests[2].options.body.get('empty'), '')
    assert.equal(requests[2].options.body.has('nullable'), false, 'form null omission retains the existing API semantics')
  })

  check('requested reliability: late startup storage cannot overwrite events and effective redirect settings serialize once', async () => {
    async function start() {
      const initial = deferred()
      const writes = []
      let changed
      const setups = { appClient: 'setupAppClient', contentScriptRefreshPrompt: 'setupContentScriptRefreshPrompt', loginStateWatcher: 'setupLoginStateWatcher', 'messageListeners/api': 'setupApiMsgListeners', 'messageListeners/tabs': 'setupTabMsgListeners', openTabsWatchLater: 'setupOpenTabsWatchLater', refreshTabs: 'setupRefreshTabs', settingsCloudSync: 'setupSettingsCloudSync', settingsStorageCoordinator: 'setupSettingsStorageCoordinator', stateConsumers: 'setupStateConsumers', topBarStateBroker: 'setupTopBarStateBroker', videoVisitHistoryCoordinator: 'setupVideoVisitHistoryCoordinator' }
      await loadSourceModule('../src/background/index.ts', {
        ...Object.fromEntries(Object.entries(setups).map(([file, fn]) => [`./${file}`, { [fn]() {} }])),
        '~/utils/bilibiliDesktopNavigation': await import('../src/utils/bilibiliDesktopNavigation'),
        'webextension-polyfill': { default: {
          storage: { local: { get: () => initial.promise }, onChanged: { addListener: fn => changed = fn } },
          declarativeNetRequest: { updateDynamicRules: (rule) => {
            const pending = deferred()
            writes.push({ rule, ...pending })
            return pending.promise
          } },
        } },
      })
      return { initial, writes, change: value => changed({ settings: { newValue: value } }, 'local') }
    }
    const first = await start()
    first.change({ preventMobileRedirect: false })
    await flush()
    first.initial.resolve({ settings: { preventMobileRedirect: true } })
    first.change(JSON.stringify({ preventMobileRedirect: false, unrelated: 1 }))
    await flush()
    assert.equal(first.writes.length, 1)
    assert.equal(first.writes[0].rule.addRules.length, 0)
    first.writes[0].resolve()
    await flush()
    const second = await start()
    second.initial.resolve({ settings: { preventMobileRedirect: true } })
    await flush()
    second.change({ preventMobileRedirect: false })
    second.change({ preventMobileRedirect: false, unrelated: 1 })
    await flush()
    assert.equal(second.writes.length, 1, 'new rule changes wait for the running browser update')
    second.writes[0].resolve()
    await flush()
    assert.equal(second.writes.length, 2)
    assert.equal(second.writes[1].rule.addRules.length, 0)
    second.writes[1].resolve()
    await flush()
  })

  check('requested reliability: manifest, CS, MAIN and startup overlay agree on the exact sync-frame namespace', async () => {
    const scope = await import('../src/constants/contentScript')
    const nativeSites = await import('../src/constants/nativeSites')
    const manifestModule = await loadSourceModule('../src/manifest.ts', {
      'fs-extra': { default: { readJSON: async () => ({ name: 'fixture', version: '1.0.0' }) } },
      '../scripts/utils': { isDev: false, isSafari: false, r: path => path },
      './constants/contentScript': scope,
      './constants/nativeSites': nativeSites,
    })
    const manifest = await manifestModule.getManifest()
    const entries = manifest.content_scripts.filter(entry => entry.js.some(file => file.includes('contentScripts')))
    for (const entry of entries)
      assert.deepEqual(Array.from(entry.exclude_matches), [...scope.CONTENT_SCRIPT_EXCLUDE_MATCHES])
    const urls = [
      ['https://message.bilibili.com/pages/nav/header_sync?x=1', false],
      ['https://t.bilibili.com/pages/nav/index', false],
      ['https://message.bilibili.com/pages/nav?x=1', false],
      ['https://t.bilibili.com/pages/nav/', false],
      ['https://message.bilibili.com/#/whisper', true],
      ['https://message.bilibili.com/#/reply', true],
      ['https://t.bilibili.com/', true],
      ['https://t.bilibili.com/123', true],
      ['https://message.bilibili.com/pages/navigation', true],
      ['https://www.bilibili.com/opus/123', true],
      ['https://www.bilibili.com/video/BVfixture', true],
    ]
    for (const [url, expected] of urls) {
      assert.equal(scope.isContentScriptTargetUrl(url), expected, url)
      const excluded = scope.CONTENT_SCRIPT_EXCLUDE_MATCHES.some(pattern => new RegExp(`^${pattern.split('*').map(part => part.replace(/[.*+?^{}()|[\]\\$]/g, '\\$&')).join('.*')}$`).test(url))
      assert.equal(excluded, !expected, `${url} manifest exclusion`)
      for (const [file, name, owner] of [['contentScripts', 'shouldInitializeContentScript', 'contentScriptGlobal'], ['inject', 'shouldInitializePageScript', 'pageScriptGlobal']]) {
        const context = await loadSourceFunctions(`../src/${file}/index.ts`, [name], { [owner]: {}, document: { URL: url }, ...scope, isConfirmedLiveEmbeddedFrame: () => false })
        assert.equal(context[name], expected, `${name} ${url}`)
      }
      let overlays = 0
      await loadSourceModule('../src/contentScripts/pageLoading.ts', {
        'fixture:runtime': {},
        '../constants/contentScript': scope,
        '../utils/bilibiliLiveContext': { isConfirmedLiveEmbeddedFrame: () => false },
        './pageLoadingGuard': { getPageLoadingGuard: () => {
          overlays++
          return { dispose() {} }
        } },
      }, { chrome: { runtime: { getURL: () => 'fixture:runtime' } }, navigator: { userAgent: 'fixture' }, document: { URL: url } })
      assert.equal(overlays, expected ? 1 : 0)
    }
  })

  check('requested reliability: photo-viewer state uses the actual document handshake across reloads, routes and teardown', async () => {
    const parentEvents = []
    const childEvents = []
    const parentListeners = new Map()
    const frameListeners = new Map()
    const location = { href: 'https://www.bilibili.com/opus/123', origin: 'https://www.bilibili.com' }
    const child = { location }
    const parent = { addEventListener: (type, fn) => parentListeners.set(type, fn), removeEventListener: type => parentListeners.delete(type), postMessage: data => childEvents.push({ data: plain(data), source: child, origin: location.origin }) }
    Object.assign(child, { parent, top: parent, setTimeout, clearTimeout, postMessage: data => parentEvents.push({ data: plain(data), source: parent, origin: location.origin }) })
    child.self = child
    const frame = { contentWindow: child, getAttribute: () => 'https://www.bilibili.com/opus/123', addEventListener: (type, fn) => frameListeners.set(type, fn), removeEventListener: type => frameListeners.delete(type) }
    const wire = await loadSourceModule('../src/utils/iframeMessage.ts', { '~/constants/contentScript': await import('../src/constants/contentScript') }, { window: child, location, document: { referrer: 'https://www.bilibili.com/' }, Object })
    const protocol = await loadSourceModule('../src/utils/iframeDocument.ts', { './iframeMessage': wire }, { window: child, location, crypto })
    const client = protocol.createIframeDocumentClient()
    let idle
    let observe
    let stops = 0
    const detector = await loadSourceModule('../src/contentScripts/features/iframePhotoViewerDetector.ts', {
      '~/utils/lazyLoad': { runWhenIdle: (callback) => {
        idle = callback
        return { dispose() {} }
      } },
      '~/utils/photoViewer': { observePhotoViewerState: (callback) => {
        observe = callback
        callback(true)
        return () => stops++
      } },
    }, { window: child })
    detector.setupIframePhotoViewerDetector(client)
    idle()
    assert.equal(childEvents.length, 0, 'an open viewer waits for its document identity')
    const active = Vue.ref(true)
    const hostModule = await loadSourceModule('../src/composables/useIframeDocumentHost.ts', {
      'vue': Vue,
      './useDark': { useDark: () => ({ isDark: Vue.ref(false) }) },
      '~/constants/globalEvents': await import('../src/constants/globalEvents'),
      '~/utils/iframeDocument': protocol,
      '~/utils/iframeMessage': wire,
      '~/utils/iframeSearch': { IFRAME_SEARCH_REQUEST: 'search', parseIframeSearch() {} },
      '~/utils/playbackRateCommand': { IFRAME_PLAYBACK_RATE: 'rate', registerIframePlaybackRate() {} },
      '~/utils/searchNavigation': {},
    }, { window: parent })
    const owner = Vue.effectScope()
    const host = owner.run(() => hostModule.useIframeDocumentHost(Vue.shallowRef(frame), () => active.value))
    const pump = () => {
      for (let turn = 0; turn < 20 && (parentEvents.length || childEvents.length); turn++) {
        while (parentEvents.length)
          client.receive(parentEvents.shift())
        while (childEvents.length)
          parentListeners.get('message')?.(childEvents.shift())
      }
    }
    try {
      pump()
      assert.equal(host.photoViewerOpen.value, true, 'viewer opened before handshake is reported when bound')
      observe(false)
      const oldClosed = childEvents.at(-1)
      pump()
      assert.equal(host.photoViewerOpen.value, false)
      observe(true)
      const oldOpen = childEvents.at(-1)
      pump()
      observe(true)
      assert.equal(childEvents.length, 0, 'equal state does not send another message')
      frameListeners.get('load')()
      assert.equal(host.photoViewerOpen.value, false)
      parentListeners.get('message')(oldOpen)
      assert.equal(host.photoViewerOpen.value, false, 'same-URL reload invalidates the old session immediately')
      pump()
      assert.equal(host.photoViewerOpen.value, true)
      parentListeners.get('message')(oldClosed)
      assert.equal(host.photoViewerOpen.value, true)
      location.href = 'https://www.bilibili.com/opus/456'
      client.report()
      pump()
      assert.equal(host.currentHref.value, location.href)
      assert.equal(host.photoViewerOpen.value, true, 'a route revision republishes the unchanged visible state')
      parentListeners.get('message')(oldClosed)
      assert.equal(host.photoViewerOpen.value, true)
      parentListeners.get('message')({ data: { type: 'IFRAME_PHOTO_VIEWER_STATE', isOpen: false }, origin: location.origin, source: child })
      assert.equal(host.photoViewerOpen.value, true, 'unbound messages cannot affect the UI')
      detector.cleanupIframePhotoViewerDetector()
      pump()
      assert.equal(host.photoViewerOpen.value, false)
      assert.equal(stops, 1)
      owner.stop()
      client.dispose()
      assert.equal(parentListeners.size, 0)
      assert.equal(frameListeners.size, 0)
      const direct = protocol.createIframeDocumentHost(() => frame)
      const first = protocol.createIframeDocumentClient()
      const second = protocol.createIframeDocumentClient()
      const bind = (document) => {
        document.report()
        direct.receive(childEvents.shift())
        document.receive(parentEvents.shift())
        const ready = childEvents.shift()
        direct.receive(ready)
        return ready
      }
      const firstReady = bind(first)
      const secondReady = bind(second)
      assert.equal(direct.matches(secondReady.data), true)
      assert.equal(direct.receive({ ...firstReady, data: { ...firstReady.data, revision: firstReady.data.revision + 20 } }), undefined, 'old same-URL ready cannot replace a new document before the load event')
      direct.receive({ ...firstReady, data: { ...firstReady.data, phase: 'hello' } })
      second.receive(parentEvents.shift())
      assert.equal(direct.matches(secondReady.data), true, 'a late old hello cannot invalidate the current session')
      assert.equal(direct.receive(firstReady), undefined)
      direct.clear()
      first.dispose()
      second.dispose()
    }
    finally {
      detector.cleanupIframePhotoViewerDetector()
      owner.stop()
      client.dispose()
    }
    let enabled = 0
    const styleSetup = await loadSourceFunctions('../src/contentScripts/index.ts', ['applySettingsDependentPageStyles'], {
      isSupportedPages: () => false,
      isSupportedIframePages: () => true,
      settings: { value: { adaptToOtherPageStyles: false, videoPageDarkMode: false } },
      applyBewlyDesignClasses: () => false,
      setupOpusDetailDrawerLayout() {},
      useDark: () => ({ iframeDocument: client }),
      setupIframePhotoViewerDetector: () => enabled++,
    })
    styleSetup.applySettingsDependentPageStyles()
    assert.equal(enabled, 1, 'viewer detection does not depend on style adaptation')
  })

  check('requested reliability: native moment texture and body layers are scoped to the original feed and released on navigation', async () => {
    const css = (await import('sass')).compileString(await readFile(new URL('../src/styles/adaptedStyles/pages/momentsPage.scss', import.meta.url), 'utf8')).css
    assert.match(css, /\.momentsPage\.moments-native-feed #app::after\s*\{[^}]*display: none !important;[^}]*pointer-events: none !important;/)
    assert.match(css, /\.momentsPage\.moments-native-feed \.bili-dyn-home--member,\s*\.momentsPage\.moments-native-feed \.bili-dyn-home--visitor\s*\{[^}]*z-index: 2;[^}]*position: relative;/)
    const location = { href: 'https://t.bilibili.com/' }
    let route
    const rootClass = document.documentElement.className
    const styles = await loadSourceModule('../src/styles/adaptedStyles/index.ts', {
      './common': {},
      './shadowDom': {},
      './thirdParties': {},
      'vue': Vue,
      '~/composables/useRouteState': { onRouteChange: (callback) => {
        route = callback
        return () => {}
      } },
      '~/logic/storage': { settings: Vue.ref({}), settingsInitializationState: Vue.ref('loaded'), settingsReady: Promise.resolve() },
      '~/utils/main': { isHomePage: () => false, isInIframe: () => false, isTopicPage: () => false, isWatchLaterListPage: () => false },
      './pages/momentsPage.scss?inline': { default: css },
    }, { window: { location } })
    try {
      route({ href: location.href })
      await flush()
      assert.equal(document.documentElement.classList.contains('moments-native-feed'), true)
      location.href = 'https://www.bilibili.com/opus/123'
      route({ href: location.href })
      await flush()
      assert.equal(document.documentElement.classList.contains('moments-native-feed'), false, 'Opus viewers and business overlays keep their layers')
      assert.equal(document.documentElement.classList.contains('momentsPage'), true)
      styles.stopAdaptedStyles()
      assert.equal(document.documentElement.classList.contains('momentsPage'), false)
    }
    finally {
      styles.stopAdaptedStyles()
      document.documentElement.className = rootClass
    }
  })
}
