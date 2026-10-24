import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import { loadSourceFunctions } from './sourceFunctionHarness'
import { loadSourceModule } from './sourceModuleHarness'

const plain = value => JSON.parse(JSON.stringify(value))
function deferred() {
  let resolve
  const promise = new Promise(done => resolve = done)
  return { promise, resolve }
}

export function registerRecommendationConfigChecks(check, { Vue, flush, compileComponent }) {
  check('batch three: APP normalization keeps combined reasons, explicit follow state, author, portrait and actual publish information together', async () => {
    const { normalizeAppVideoItem } = await import('../src/contentScripts/views/Home/adapters/appRecommendationItem')
    const { transformAppVideo } = await import('../src/contentScripts/views/Home/adapters/recommendationVideo')
    const raw = { card_goto: 'av', param: '123', args: {}, rcmd_reason: { content: '已关注 | 竖屏 | 朋友看过' }, multiply_desc: { author_name: 'UP &amp; author', extra: '等2人联合创作 · 3天前' }, avatar: { up_id: 7 }, three_point_v2: [{ type: 'feedback', reasons: [{ id: 4, mid: 7 }] }] }
    const item = normalizeAppVideoItem(raw)
    assert.deepEqual(item.normalized.reasons, ['已关注', '竖屏', '朋友看过'])
    const video = transformAppVideo(item)
    assert.equal(video.author.name, 'UP & author')
    assert.equal(video.author.mid, 7)
    assert.equal(video.author.followed, true)
    assert.equal(video.author.authorFace, '')
    assert.equal(video.portrait, true)
    assert.equal(video.capsuleText, '3天前')
    assert.equal(video.goto, 'av')
    assert.deepEqual(video.threePointV2, raw.three_point_v2)
    assert.equal(video.like, undefined)
    assert.equal(video.displayTags, undefined)
    assert.equal(normalizeAppVideoItem({ ...raw, is_atten: false }).normalized.followed, false)
    const unknown = transformAppVideo(normalizeAppVideoItem({ card_goto: 'bangumi', param: '456', args: { aid: 456 }, desc: '内容 · 1万播放' }))
    assert.equal(unknown.author.name, undefined)
    assert.equal(unknown.author.mid, undefined)
    assert.equal(unknown.author.followed, undefined)
    assert.equal(unknown.capsuleText, undefined)
    assert.equal(unknown.publishedTimestamp, undefined)
    assert.equal(unknown.aid, undefined)
    assert.equal(normalizeAppVideoItem({ card_goto: 'av', param: '1', uri: 'bilibili://video/1', args: {} }).normalized.portrait, undefined)
    const square = normalizeAppVideoItem({ card_goto: 'av', param: '1', uri: 'bilibili://video/1?player_width=720&player_height=720', args: {} })
    assert.equal(square.normalized.vertical, false)
    assert.equal(transformAppVideo(square).portrait, true)
    assert.equal(transformAppVideo(square).type, 'horizontal')
  })

  check('batch three: four recommendation entries commit one complete request configuration and quick visibility never changes it', async () => {
    const settings = Vue.ref({ recommendationMode: 'web', appRecommendationColumn: 2, recommendationModeSwitcherOptions: ['web'], desktopColumns: 5 })
    const mode = await loadSourceModule('../src/logic/recommendationMode.ts', {
      '~/logic/storage': { settings },
      '~/utils/authProvider': { hasValidAppAuthTokens: () => true },
      './appAuthorizationCoordinator': { requestAppAuthorization() {} },
      './appAuthStorage': { getAppAuthIdentity: () => 'account-A' },
    })
    const changes = []
    const stop = Vue.watch(mode.getRecommendationRequestIdentity, key => changes.push(key), { flush: 'sync' })
    try {
      assert.deepEqual(Array.from(mode.getRecommendationModeOptions(key => key), option => option.value), ['web', 'webNoCookie', 'appSingle', 'appDouble'])
      mode.selectRecommendationMode('appSingle')
      assert.deepEqual(changes, ['app:1:account-A'])
      assert.equal(mode.getRecommendationModeOption(), 'appSingle')
      const root = settings.value
      mode.selectRecommendationMode('appSingle')
      assert.equal(settings.value, root)
      settings.value.recommendationModeSwitcherOptions = []
      assert.equal(changes.length, 1)
      assert.equal(settings.value.recommendationMode, 'app')
      mode.selectRecommendationMode('appDouble')
      assert.deepEqual(changes, ['app:1:account-A', 'app:2:account-A'])
      mode.selectRecommendationMode('webNoCookie')
      assert.equal(mode.getRecommendationModeOption(), 'webNoCookie')
      assert.equal(settings.value.desktopColumns, 5)
      const switcher = await readFile(new URL('../src/contentScripts/views/Home/components/RecommendationModeSwitcher.vue', import.meta.url), 'utf8')
      assert.match(switcher, /<Select[\s\S]*:options="options"/)
    }
    finally {
      stop()
    }
  })

  check('batch three: actual recommendation owners isolate request columns, delayed pages and APP accounts without duplicate refreshes', async () => {
    const settings = Vue.ref({ recommendationMode: 'app', appRecommendationColumn: 2, blockAds: true, language: 'en' })
    const tokens = Vue.ref({ accessToken: 'fixture-A' })
    const authIdentity = Vue.ref('account-A')
    const authStorage = { getAppAuthIdentity: () => authIdentity.value }
    const auth = {
      hasValidAppAuthTokens: () => true,
      ensureFreshAppAccessToken: async () => true,
      captureAppAuth: () => ({ accessToken: tokens.value.accessToken, generation: authIdentity.value, mid: 7 }),
      isAppAuthCurrent: snapshot => snapshot?.generation === authIdentity.value,
      isAppAccessTokenInvalidResponse: () => false,
      refreshInvalidAppAccessToken: async () => false,
    }
    const coordinator = { requestAppAuthorization() {}, reportAppAuthorizationInvalid() {} }
    const mode = await loadSourceModule('../src/logic/recommendationMode.ts', { '~/logic/storage': { settings, appAuthTokens: tokens }, '~/utils/authProvider': auth, './appAuthorizationCoordinator': coordinator, './appAuthStorage': authStorage })
    const requests = []
    auth.requestAppClient = async (_endpoint, params) => {
      const pending = deferred()
      requests.push({ params: plain(params), pending })
      return pending.promise
    }
    const provider = { haveScrollbar: async () => true, handleBackToTop() {}, ...Object.fromEntries(['handleReachBottom', 'handlePageRefresh', 'undoForwardState', 'handleUndoRefresh', 'handleForwardRefresh'].map(key => [key, Vue.ref()])) }
    const owners = []
    async function mount() {
      const key = mode.getRecommendationRequestIdentity()
      const slots = new Map()
      const tab = { restored: false, isCurrent: () => key === mode.getRecommendationRequestIdentity(), capture: () => () => {}, read: (_key, fallback) => fallback, ref(name, fallback) {
        if (!slots.has(name))
          slots.set(name, Vue.ref(fallback))
        return slots.get(name)
      }, shallowRef(name, fallback) {
        if (!slots.has(name))
          slots.set(name, Vue.shallowRef(fallback))
        return slots.get(name)
      } }
      const module = await loadSourceModule('../src/contentScripts/views/Home/useForYouRecommendations.ts', {
        'vue': Vue,
        'vue-i18n': { useI18n: () => ({ t: key => key }) },
        'vue-toastification': { useToast: () => ({ warning() {}, error() {} }) },
        '~/composables/useAppProvider': { useBewlyApp: () => provider, UndoForwardState: { Hidden: 0, ShowUndo: 1, ShowForward: 2 } },
        '~/composables/useHomeTabState': { useHomeTabState: () => tab },
        '~/contentScripts/views/Home/adapters/recommendationVideo': await import('../src/contentScripts/views/Home/adapters/recommendationVideo'),
        '~/contentScripts/views/Home/adapters/appRecommendationItem': await import('../src/contentScripts/views/Home/adapters/appRecommendationItem'),
        '~/enums/appEnums': await import('../src/enums/appEnums'),
        '~/logic': { settings, appAuthTokens: tokens },
        '~/logic/appAuthorizationCoordinator': coordinator,
        '~/logic/appAuthStorage': authStorage,
        '~/logic/recommendationMode': mode,
        '~/logic/loginStatus': await import('../src/logic/loginStatus'),
        '~/utils/accountScope': await import('../src/utils/accountScope'),
        '~/utils/advertising': await import('../src/utils/advertising'),
        '~/utils/api': { default: {} },
        '~/utils/authProvider': auth,
        '~/utils/bilibiliApiError': { isBilibiliRiskControl: () => false },
        '~/utils/debug': { debugLog() {} },
        '~/utils/messaging': { isExtensionContextInvalidatedError: () => false },
        './forYouInitialData': await import('../src/contentScripts/views/Home/forYouInitialData'),
        './recommendationFeed': await import('../src/contentScripts/views/Home/recommendationFeed'),
        './recommendationState': await import('../src/contentScripts/views/Home/recommendationState'),
        './useRecommendationHistory': await import('../src/contentScripts/views/Home/useRecommendationHistory'),
        './useRecommendationFilters': { useRecommendationFilters: () => ({ filterFunc: Vue.ref(null), appFilterFunc: Vue.ref(null), hasActiveWebRecommendationFilter: Vue.ref(true), hasActiveAppRecommendationFilter: Vue.ref(true), hasActiveRecommendationFilter: Vue.ref(true), requiresManualFilteredPaging: Vue.ref(false), recommendationFilterSettingsSignature: Vue.ref('fixture'), resetFilteredFeedPagingState() {}, recordFilteredFeedBatch() {} }) },
        './useWebRecommendationCursor': await loadSourceModule('../src/contentScripts/views/Home/useWebRecommendationCursor.ts', { '~/logic': { settings, noCookieForYouRecommendationState: Vue.ref({ showlistGroups: [], nextFreshIdx: 1 }) } }),
      })
      const host = document.body.appendChild(document.createElement('div'))
      let state
      const app = Vue.createApp({ setup() {
        state = module.useForYouRecommendations(() => {})
        return () => null
      } })
      app.mount(host)
      let stopped = false
      const owner = { state, slots, stop() {
        if (stopped)
          return
        stopped = true
        app.unmount()
        host.remove()
      } }
      owners.push(owner)
      await flush()
      return owner
    }
    const response = aid => ({ code: 0, data: { items: [{ card_goto: 'av', param: String(aid), args: { aid }, title: String(aid) }] } })
    try {
      const first = await mount()
      assert.equal(requests.length, 1)
      assert.equal(requests[0].params.column, 2)
      mode.selectRecommendationMode('appSingle')
      first.stop()
      const second = await mount()
      assert.equal(requests.length, 2)
      assert.equal(requests[1].params.column, 1)
      requests[0].pending.resolve(response(1))
      await flush()
      assert.equal(second.state.currentVideoList.value.length, 0)
      requests[1].pending.resolve(response(2))
      await flush()
      assert.equal(second.state.currentVideoList.value[0].displayData.aid, 2)
      assert.equal(second.state.currentVideoList.value[0].displayData.recommendationRequestIdentity, 'app:1:account-A')
      await flush()
      second.state.handleManualLoadMore()
      await flush()
      assert.equal(requests[2].params.idx, 1)
      tokens.value = { accessToken: 'fixture-B' }
      authIdentity.value = 'account-B'
      second.stop()
      const third = await mount()
      assert.equal(requests.length, 4)
      assert.equal(requests[3].params.idx, 0)
      assert.equal(requests[3].params.access_key, 'fixture-B')
      requests[2].pending.resolve(response(3))
      await flush()
      assert.equal(third.state.currentVideoList.value.length, 0)
      assert.equal(second.state.currentVideoList.value[0].displayData.recommendationRequestIdentity, 'app:1:account-A')
      requests[3].pending.resolve(response(4))
      await flush()
      assert.equal(third.state.currentVideoList.value[0].displayData.aid, 4)
      assert.equal(third.state.currentVideoList.value[0].displayData.recommendationRequestIdentity, 'app:1:account-B')
      await flush()
      provider.handlePageRefresh.value()
      await flush()
      const snapshot = third.slots.get('recommendationBack').value
      assert.equal(snapshot.requestIdentity, 'app:1:account-B')
      authIdentity.value = 'account-C'
      assert.equal(snapshot.requestIdentity, 'app:1:account-B', 'parked history keeps the accepted owner identity')
      requests[4].pending.resolve(response(5))
      await flush()
      assert.equal(third.state.currentVideoList.value.length, 0)
    }
    finally {
      for (const owner of owners)
        owner.stop()
    }
  })

  check('batch three: preview URL control preserves existing time parameters and does not change preview memory', async () => {
    const policy = await import('../src/utils/videoPreviewProgress')
    const video = { aid: 123, url: 'https://www.bilibili.com/video/av123?p=2#part' }
    assert.equal(new URL(policy.getVideoPlaybackUrl(video, 19)).searchParams.get('t'), '19')
    assert.equal(new URL(policy.getVideoPlaybackUrl(video, 19, false)).searchParams.has('t'), false)
    for (const enabled of [true, false]) {
      assert.equal(new URL(policy.getVideoPlaybackUrl({ ...video, url: video.url.replace('#part', '&t=7#part') }, 19, enabled)).searchParams.get('t'), '7')
      assert.equal(new URL(policy.getVideoPlaybackUrl({ ...video, url: video.url.replace('#part', '&start_progress=7000#part') }, 19, enabled)).searchParams.has('t'), false)
    }
    assert.equal(policy.normalizePreviewPosition(19, 100), 19)
    assert.equal(policy.getVideoPreviewIdentity(video), policy.getVideoPreviewIdentity({ ...video }))
  })

  check('batch three: disabling Dock return-to-top leaves refresh and its combined action available', async () => {
    const events = []
    const settings = Vue.ref({ showDockBackToTop: false })
    const refresh = Vue.ref(true)
    const module = await loadSourceFunctions('../src/components/Dock/Dock.vue', ['showBackToTopOrRefreshActions', 'combinedActionIsRefresh', 'handleBackToTopOrRefresh'], {
      computed: Vue.computed,
      settings,
      canRefreshCurrentPage: refresh,
      showBackToTopOrRefreshButton: { value: true },
      reachTop: { value: false },
      emit: event => events.push(event),
    })
    assert.equal(module.showBackToTopOrRefreshActions.value, true)
    assert.equal(module.combinedActionIsRefresh.value, true)
    module.handleBackToTopOrRefresh('auto')
    assert.deepEqual(events, ['refresh'])
    refresh.value = false
    assert.equal(module.showBackToTopOrRefreshActions.value, false)
    module.handleBackToTopOrRefresh('auto')
    assert.deepEqual(events, ['refresh'])
  })

  check('batch three: search identity cancels a pending URL restore while preserving the keyword and filters', async () => {
    const initial = new URL('https://www.bilibili.com/?page=SearchResults&keyword=keep&category=user&user_order=fans&user_type=2&pn=4#anchor')
    let written
    let synced = 0
    const module = await loadSourceFunctions('../src/contentScripts/views/SearchResults/SearchResults.vue', ['updateUrlParams', 'resetSearchIdentityPage'], {
      restoringFromUrl: true,
      urlRestoreGeneration: 10,
      currentPage: { value: 4 },
      window: { location: initial, history: { pushState: (_data, _title, href) => written = new URL(href, initial) } },
      buildSearchResultsUrl: (await import('../src/contentScripts/views/SearchResults/utils/searchUrlState')).buildSearchResultsUrl,
      syncRouteState: () => synced++,
      URLSearchParams,
    })
    module.resetSearchIdentityPage()
    assert.equal(module.urlRestoreGeneration, 11)
    assert.equal(module.restoringFromUrl, false)
    assert.equal(module.currentPage.value, 1)
    assert.equal(written.searchParams.has('pn'), false)
    for (const key of ['keyword', 'category', 'user_order', 'user_type'])
      assert.equal(written.searchParams.get(key), initial.searchParams.get(key))
    assert.equal(written.hash, initial.hash)
    assert.equal(synced, 1)
  })

  check('batch three: license assets load on demand, report missing entries and reject late text from another selection', async () => {
    const delayed = new Map()
    const requested = []
    const index = { schema: 1, project: 'project.txt', entries: [{ entry: 'good', asset: 'good.json' }, { entry: 'missing', asset: 'missing.json' }] }
    const report = { schema: 1, entry: 'good', issues: [], packages: [1, 2].map(id => ({ id: String(id), name: `package-${id}`, version: '1.0.0', license: 'MIT', files: [{ name: 'LICENSE', asset: `p${id}.txt` }], issues: [], outputs: [] })) }
    const Component = await compileComponent('../src/components/Settings/About/LicensePanel.vue', { '~/utils/messaging': { getExtensionAssetUrl: path => path } }, { globals: { fetch: async (path) => {
      requested.push(path)
      if (path.endsWith('index.json'))
        return { ok: true, text: async () => JSON.stringify(index) }
      if (path.endsWith('good.json'))
        return { ok: true, text: async () => JSON.stringify(report) }
      if (path.endsWith('missing.json'))
        return { ok: false }
      const pending = deferred()
      delayed.set(path, pending)
      return { ok: true, text: () => pending.promise }
    } } })
    assert.equal(requested.length, 0)
    const host = document.body.appendChild(document.createElement('div'))
    const app = Vue.createApp({ render: () => Vue.h(Component, { kind: 'thirdParty' }) })
    app.config.globalProperties.$t = key => key
    app.component('LoadingRing', { render: () => null })
    app.component('Button', { emits: ['click'], setup: (_props, { slots, emit }) => () => Vue.h('button', { onClick: () => emit('click') }, slots.default?.()) })
    app.mount(host)
    try {
      await flush()
      await flush()
      assert.match(host.textContent, /licenses_incomplete/)
      assert.match(host.textContent, /missing/)
      assert.equal(requested.some(path => path.endsWith('.txt')), false)
      const buttons = host.querySelectorAll('button')
      buttons[0].click()
      await flush()
      buttons[1].click()
      await flush()
      delayed.get('/assets/licenses/p1.txt').resolve('OLD LICENSE')
      await flush()
      assert.doesNotMatch(host.textContent, /OLD LICENSE/)
      delayed.get('/assets/licenses/p2.txt').resolve('CURRENT LICENSE')
      await flush()
      assert.match(host.textContent, /CURRENT LICENSE/)
    }
    finally {
      app.unmount()
      host.remove()
    }
  })
}
