import assert from 'node:assert/strict'

import { JSDOM } from 'jsdom'

import { loadSourceFunctions } from './sourceFunctionHarness'
import { loadSourceModule } from './sourceModuleHarness'

export function registerUpstreamHomeChecks(check, { Vue, flush, compileComponent }) {
  check('home route: explicit/hidden tabs, back-forward, integrated search and history state share one source', async () => {
    const enums = await import('../src/enums/appEnums')
    const { HomeSubPage } = await import('../src/contentScripts/views/Home/types')
    const homeRoute = await loadSourceModule('../src/utils/homeRoute.ts', { '~/contentScripts/views/Home/types': { HomeSubPage }, '~/enums/appEnums': enums })
    const config = [HomeSubPage.ForYou, HomeSubPage.Weekly, HomeSubPage.Following].map(page => ({ page, visible: true }))
    const settings = Vue.ref({ homePageTabVisibilityList: config, useSearchPageModeOnHomePage: true })
    window.history.replaceState({ native: { key: 'preserved' } }, '', '/?page=Home&tab=Weekly&hcfrom=share')
    const href = Vue.ref(window.location.href)
    const original = window.history.replaceState
    window.history.replaceState = function (...args) {
      original.apply(this, args)
      href.value = window.location.href
    }
    const module = await loadSourceModule('../src/composables/useHomePageRoute.ts', {
      'vue': Vue,
      '~/composables/useCurrentLocationHref': { useCurrentLocationHref: () => href },
      '~/enums/appEnums': enums,
      '~/logic': { settings },
      '~/utils/homeRoute': homeRoute,
      '~/utils/homeTabConfig': await import('../src/utils/homeTabConfig'),
    })
    const scope = Vue.effectScope()
    const state = scope.run(() => module.useHomePageRoute(() => enums.AppPage.Home, config))
    try {
      assert.equal(state.homeActivatedPage.value, HomeSubPage.Weekly)
      state.homeActivatedPageTouched.value = true
      state.homeActivatedPage.value = HomeSubPage.Following
      assert.equal(new URL(href.value).searchParams.get('tab'), 'Following')
      assert.deepEqual(window.history.state, { native: { key: 'preserved' } })
      window.history.pushState({ from: 'back' }, '', '/?page=Home&tab=Weekly')
      href.value = window.location.href
      assert.equal(state.homeActivatedPage.value, HomeSubPage.Weekly)
      settings.value.homePageTabVisibilityList[1].visible = false
      await flush()
      assert.equal(state.homeActivatedPage.value, HomeSubPage.ForYou)
      assert.equal(new URL(href.value).searchParams.get('tab'), 'ForYou')
      assert.deepEqual(window.history.state, { from: 'back' })
      window.history.pushState({ from: 'forward' }, '', '/?page=Search&tab=Weekly')
      href.value = window.location.href
      assert.equal(state.activatedPage.value, enums.AppPage.Home)
      assert.equal(new URL(href.value).searchParams.get('tab'), 'ForYou')
      state.activatedPage.value = enums.AppPage.Moments
      assert.equal(new URL(href.value).searchParams.has('tab'), false)
      window.history.pushState({ native: true }, '', '/bangumi/play/ep123')
      href.value = window.location.href
      state.homeActivatedPage.value = HomeSubPage.Following
      assert.equal(window.location.search, '', 'native URLs are never rewritten as Home routes')
    }
    finally {
      scope.stop()
      window.history.replaceState = original
      window.history.replaceState(null, '', '/')
    }
  })

  check('home URL cleanup: delayed callbacks preserve native history data and cannot overwrite a newer tab', async () => {
    const { cleanBilibiliUrl } = await import('../src/utils/bilibiliUrl')
    let idle
    const url = 'https://www.bilibili.com/?page=Home&tab=Weekly&hcfrom=share'
    const state = { native: 42 }
    const writes = []
    const host = { location: { href: url }, requestIdleCallback: (callback) => {
      idle = callback
      return 1
    } }
    const context = await loadSourceFunctions('../src/contentScripts/views/App.vue', ['cleanUrlParams'], {
      window: host,
      document: { readyState: 'complete' },
      history: { state, replaceState: (...args) => writes.push(args) },
      cleanBilibiliUrl,
      settings: { value: { cleanUrlArgument: true } },
      isCleaningUrl: false,
      cleanupIdleCallback: undefined,
    })
    context.cleanUrlParams()
    host.location.href = url.replace('Weekly', 'Following')
    idle()
    assert.equal(writes.length, 0)
    context.cleanUrlParams()
    idle()
    assert.equal(writes[0][0], state)
    assert.equal(new URL(writes[0][2]).searchParams.get('tab'), 'Following')
    assert.equal(new URL(writes[0][2]).searchParams.has('hcfrom'), false)
  })

  check('early boot: document-start guard keeps layout, handles late html, iframe scope and one cleanup handoff', async () => {
    const timers = new Map()
    let nextTimer = 0
    const doc = new JSDOM('<!doctype html><html><body><div class="bili-header">native</div></body></html>', { url: 'https://www.bilibili.com/?page=Home' })
    const module = await loadSourceModule('../src/contentScripts/pageLoadingGuard.ts', {}, {
      MutationObserver: doc.window.MutationObserver,
      setTimeout: (callback) => {
        timers.set(++nextTimer, callback)
        return nextTimer
      },
      clearTimeout: id => timers.delete(id),
    })
    try {
      const guard = module.createPageLoadingGuard(doc.window.document, false)
      assert.equal(doc.window.getComputedStyle(doc.window.document.body).opacity, '0')
      assert.notEqual(doc.window.getComputedStyle(doc.window.document.body).display, 'none')
      const removals = []
      guard.adoptOverlay(immediate => removals.push(immediate))
      guard.revealHeader()
      assert.equal(doc.window.document.querySelector('[data-bewly-header-loading]'), null)
      guard.dispose()
      guard.dispose()
      assert.deepEqual(removals, [false])
      assert.equal(timers.size, 0)
      assert.equal(doc.window.document.querySelector('[data-bewly-page-loading]'), null)
      const root = doc.window.document.documentElement
      root.remove()
      const late = module.createPageLoadingGuard(doc.window.document, false)
      doc.window.document.append(root)
      await flush()
      assert.ok(root.querySelector('[data-bewly-page-loading]'))
      ;[...timers.values()][0]()
      late.adoptOverlay(immediate => removals.push(immediate))
      assert.deepEqual(removals, [false, true], 'a late main script cannot re-cover a timed-out document')
      const iframe = module.createPageLoadingGuard(doc.window.document, true)
      assert.equal(root.querySelector('[data-bewly-page-loading]'), null, 'native home iframes retain their visible layout')
      iframe.dispose(true)
      assert.equal(root.querySelectorAll('[data-bewly-header-loading]').length, 0)
    }
    finally { doc.window.close() }
  })

  check('recommendation capsule: actual component uses one setting, requests existing App authorization and retains page mode', async () => {
    const settings = Vue.ref({ recommendationMode: 'web', pageMode: 'custom' })
    const requests = []
    const module = await loadSourceModule('../src/logic/recommendationMode.ts', {
      '~/logic/storage': { settings, appAuthTokens: Vue.ref({ accessToken: '' }) },
      '~/utils/authProvider': { hasValidAppAuthTokens: () => false },
      './appAuthorizationCoordinator': { requestAppAuthorization: token => requests.push(token) },
    })
    const Component = await compileComponent('../src/contentScripts/views/Home/components/RecommendationModeSwitcher.vue', {
      'vue-i18n': { useI18n: () => ({ t: key => key }) },
      '~/logic': { settings },
      '~/components/LiquidSegmentIndicator.vue': { default: { render: () => null } },
      '~/logic/layoutEdit': { vLayoutEditable: {} },
      '~/logic/recommendationMode': module,
    })
    const host = document.body.appendChild(document.createElement('div'))
    const app = Vue.createApp(Component)
    app.config.globalProperties.$t = key => key
    app.mount(host)
    const buttons = [...host.querySelectorAll('button')]
    try {
      buttons[1].click()
      await flush()
      assert.equal(settings.value.recommendationMode, 'webNoCookie')
      assert.equal(buttons[1].getAttribute('aria-pressed'), 'true')
      buttons[2].click()
      await flush()
      assert.deepEqual(requests, [''])
      assert.equal(settings.value.recommendationMode, 'app')
      buttons[0].click()
      await flush()
      assert.equal(settings.value.pageMode, 'custom')
      assert.equal(buttons[0].getAttribute('data-active'), 'true')
    }
    finally {
      app.unmount()
      host.remove()
    }
  })

  check('playback boot: shell mounting cannot expose the native page before mode confirmation; original modes and iframes reveal normally', async () => {
    const page = new JSDOM('<!doctype html><html><body><div id="app"><div class="right-container">Native recommendations</div></div><div id="bewly-widescreen-loading">Skeleton</div></body></html>', { url: 'https://www.bilibili.com/video/BVfixture/' })
    const module = await loadSourceModule('../src/contentScripts/pageLoadingGuard.ts', {}, { MutationObserver: page.window.MutationObserver })
    const guard = module.createPageLoadingGuard(page.window.document, false)
    const app = page.window.document.getElementById('app')
    const nativeStyle = () => page.window.getComputedStyle(app).visibility
    const settings = { value: { enableVideoPlayerModeOverrides: false } }
    let inIframe = false
    let mode = 'bewlyWidescreen'
    const lifecycle = await loadSourceFunctions('../src/contentScripts/index.ts', ['finishBootAfterAppMount'], {
      isVideoOrBangumiPage: () => true,
      isInIframe: () => inIframe,
      settings,
      resolveDefaultVideoPlayerMode: () => mode,
      pageLoading: guard,
    })
    try {
      assert.equal(nativeStyle(), 'hidden')
      assert.notEqual(page.window.getComputedStyle(app).display, 'none', 'native layout measurements remain possible')
      assert.equal(page.window.getComputedStyle(page.window.document.getElementById('bewly-widescreen-loading')).visibility, 'visible')
      lifecycle.finishBootAfterAppMount()
      assert.equal(nativeStyle(), 'hidden', 'Vue-mounted alone is not the playback handoff')
      mode = 'default'
      settings.value.enableVideoPlayerModeOverrides = true
      lifecycle.finishBootAfterAppMount()
      assert.equal(nativeStyle(), 'hidden', 'unknown per-type overrides still use the existing player decision')
      settings.value.enableVideoPlayerModeOverrides = false
      lifecycle.finishBootAfterAppMount()
      assert.equal(nativeStyle(), 'visible')
      const iframeGuard = module.createPageLoadingGuard(page.window.document, true)
      lifecycle.pageLoading = iframeGuard
      mode = 'bewlyWidescreen'
      inIframe = true
      lifecycle.finishBootAfterAppMount()
      assert.equal(iframeGuard.active, false)
    }
    finally {
      guard.dispose(true)
      page.window.close()
    }
  })
}
