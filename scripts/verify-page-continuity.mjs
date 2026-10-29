import assert from 'node:assert/strict'

import { loadSourceModule } from './sourceModuleHarness'

function animationFixture() {
  const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'animate')
  const matchMedia = window.matchMedia
  const records = []
  let reduced = false
  window.matchMedia = () => ({ get matches() {
    return reduced
  }, addEventListener() {}, removeEventListener() {} })
  Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value(frames, options) {
    let resolve
    let reject
    const record = { element: this, frames, options, cancelled: false, finished: new Promise((done, fail) => {
      resolve = done
      reject = fail
    }) }
    const animation = { finished: record.finished, cancel() {
      record.cancelled = true
      reject(new Error('cancelled'))
    } }
    record.finish = resolve
    records.push(record)
    return animation
  } })
  return {
    records,
    reduced(value) { reduced = value },
    close() {
      window.matchMedia = matchMedia
      if (original)
        Object.defineProperty(HTMLElement.prototype, 'animate', original)
      else delete HTMLElement.prototype.animate
    },
  }
}

export function registerPageContinuityChecks(check, { Vue, flush, compileComponent }) {
  check('Page continuity: interrupted Anime sections resume independently while completed empty sections stay cached', async () => {
    const { providePageViewState } = await import('../src/composables/usePageViewState')
    const requests = { watch: [], popular: [], recommendations: 0 }
    const signals = []
    const deferred = (list) => {
      let resolve
      const promise = new Promise(done => resolve = done)
      list.push(resolve)
      return promise
    }
    const Anime = await compileComponent('../src/contentScripts/views/Anime/Anime.vue', {
      'vue-i18n': { useI18n: () => ({ t: key => key }) },
      '~/composables/useAppProvider': { useBewlyApp: () => ({ handleReachBottom: Vue.ref(), handlePageRefresh: Vue.ref() }) },
      '~/stores/topBarStore': { useTopBarStore: () => Vue.reactive({ userInfo: { mid: 100 } }) },
      '~/models/anime/watchList': await import('../src/models/anime/watchList'),
      '~/utils/accountScope': await import('../src/utils/accountScope'),
      '~/utils/api': { default: { anime: {
        getAnimeWatchList: (_params, options) => {
          signals.push(options.signal)
          return deferred(requests.watch)
        },
        getPopularAnimeList: (_params, options) => {
          signals.push(options.signal)
          return deferred(requests.popular)
        },
        getRecommendAnimeList: async () => {
          requests.recommendations++
          return { code: 0, data: { items: [], has_next: false, coursor: 0 } }
        },
      } } },
      '~/utils/dataFormatter': { numFormatter: String },
      '~/utils/main': { getUserID: () => '100', openLinkToNewTab() {} },
      '~/utils/messaging': { reportRuntimeFailure() {} },
      './components/AnimeTimeTable.vue': { default: { render: () => null } },
    }, { renderTemplate: false })
    const active = Vue.ref(true)
    let current
    const host = document.body.appendChild(document.createElement('div'))
    const app = Vue.createApp({ setup() {
      providePageViewState(() => '100')
      return () => active.value ? Vue.h(Anime, { ref: instance => current = instance?.$?.setupState }) : null
    } })
    try {
      app.mount(host)
      await flush()
      active.value = false
      await flush()
      assert.ok(signals.every(signal => signal.aborted), 'leaving aborts unfinished requests, not just their UI commits')
      active.value = true
      await flush()
      assert.equal(requests.watch.length, 2)
      assert.equal(requests.popular.length, 2)
      assert.equal(signals.at(-1).aborted, false, 'the returning view owns a fresh request lifetime')
      assert.equal(requests.recommendations, 1, 'a completed valid empty result must not be mistaken for an unfinished section')
      requests.watch[0]({ code: 0, data: { list: [{ title: 'stale' }] } })
      requests.popular[0]({ code: 0, result: { list: [{ title: 'stale' }] } })
      requests.watch[1]({ code: 0, data: { list: [] } })
      requests.popular[1]({ code: 0, result: { list: [] } })
      await flush()
      assert.equal(current.watchListLoaded, true)
      assert.equal(current.popularLoaded, true)
      assert.equal(current.animeWatchList.length, 0)
      active.value = false
      await flush()
      active.value = true
      await flush()
      assert.equal(requests.watch.length, 2)
      assert.equal(requests.popular.length, 2)
    }
    finally {
      app.unmount()
      host.remove()
    }
  })

  check('Page continuity: code-ready 60/150ms content handoff preserves the shell, old scroll and one mounted data owner', async () => {
    const { useReadyPageTransition } = await import('../src/composables/useReadyPageTransition')
    const animation = animationFixture()
    const selected = Vue.ref('a')
    let resolveCode
    let mounted = 0
    let maximum = 0
    let scroll = 900
    let swaps = 0
    const page = name => ({ setup() {
      mounted++
      maximum = Math.max(maximum, mounted)
      Vue.onBeforeUnmount(() => mounted--)
      return () => Vue.h('section', { 'data-page': name, style: { '--bew-page-exit-duration': '.06s', '--bew-page-enter-duration': '.15s' } }, name)
    } })
    const pages = { a: page('a'), b: page('b') }
    const root = document.body.appendChild(document.createElement('div'))
    const app = Vue.createApp({ setup() {
      const transition = useReadyPageTransition(() => pages[selected.value], component => component === pages.a ? Promise.resolve() : new Promise(resolve => resolveCode = resolve), {
        onSwap() {
          swaps++
          scroll = 240
        },
      })
      return () => Vue.h('div', [
        Vue.h('header', { id: 'fixed-header' }, 'header'),
        Vue.h('aside', { id: 'fixed-sidebar' }, 'sidebar'),
        Vue.h('nav', { id: 'fixed-dock' }, 'dock'),
        Vue.h(Vue.Transition, { ...transition, mode: 'out-in' }, { default: () => Vue.h(pages[selected.value], { key: selected.value }) }),
      ])
    } })
    try {
      app.mount(root)
      await flush()
      const shell = ['header', 'sidebar', 'dock'].map(key => root.querySelector(`#fixed-${key}`))
      selected.value = 'b'
      await flush()
      assert.equal(animation.records.length, 0, 'keep the old page painted until the target code is ready')
      assert.equal(root.querySelector('[data-page]').textContent, 'a')
      assert.equal(scroll, 900)
      resolveCode()
      await flush()
      const leave = animation.records.at(-1)
      assert.equal(leave.options.duration, 60, 'compressed CSS seconds retain their millisecond meaning')
      assert.deepEqual(leave.frames.map(frame => Number(frame.opacity)), [1, 0])
      assert.equal(scroll, 900, 'outgoing content must not jump before its fade finishes')
      leave.finish()
      await flush()
      assert.equal(swaps, 1)
      assert.equal(scroll, 240)
      const enter = animation.records.at(-1)
      assert.equal(enter.options.duration, 150)
      assert.ok(enter.frames.every(frame => !('transform' in frame)), 'workspace fixed controls must keep their containing block')
      enter.finish()
      await flush()
      assert.equal(maximum, 1)
      assert.equal(root.querySelector('[data-page]').textContent, 'b')
      assert.deepEqual(['header', 'sidebar', 'dock'].map(key => root.querySelector(`#fixed-${key}`)), shell)
      assert.ok(animation.records.every(record => record.element.matches('[data-page]')), 'the shell is never an animation target')
    }
    finally {
      app.unmount()
      root.remove()
      animation.close()
    }
  })

  check('Page continuity: reduced motion stays within 100ms and cancelled/disposed phases cannot commit a later swap', async () => {
    const { useReadyPageTransition } = await import('../src/composables/useReadyPageTransition')
    const fixture = animationFixture()
    fixture.reduced(true)
    const scope = Vue.effectScope()
    const target = Vue.ref('a')
    let swaps = 0
    let done = 0
    const hooks = scope.run(() => useReadyPageTransition(() => target.value, async () => {}, { rise: () => true, onSwap: () => swaps++ }))
    const element = document.body.appendChild(document.createElement('section'))
    element.inert = false
    try {
      await flush()
      hooks.onEnter(element, () => done++)
      assert.equal(fixture.records.at(-1).options.duration, 70)
      assert.ok(fixture.records.at(-1).frames.every(frame => !('transform' in frame)))
      hooks.onEnterCancelled(element)
      await flush()
      assert.equal(done, 0)
      hooks.onBeforeLeave(element)
      hooks.onLeave(element, () => done++)
      await flush()
      const leave = fixture.records.at(-1)
      assert.equal(leave.options.duration, 30)
      hooks.onLeaveCancelled(element)
      leave.finish()
      await flush()
      assert.equal(swaps, 0)
      assert.equal(element.inert, false)
      hooks.onBeforeLeave(element)
      hooks.onLeave(element, () => done++)
      await flush()
      scope.stop()
      fixture.records.at(-1).finish()
      await flush()
      assert.equal(swaps, 0)
      assert.equal(done, 0)
    }
    finally {
      scope.stop()
      fixture.close()
      element.remove()
    }
  })

  check('Page continuity: data-only snapshots retain query/selection/scroll before owner teardown and never cross accounts', async () => {
    const state = await import('../src/composables/usePageViewState')
    const route = Vue.ref('history')
    const account = Vue.ref('100')
    let current
    let cache
    const Page = { props: ['page'], setup(props) {
      const view = state.usePageViewState(props.page)
      const query = view.ref('query', '')
      const selected = view.ref('selected', new Set())
      const items = Vue.reactive(view.read('items', []))
      view.capture('items', () => items)
      Vue.onBeforeUnmount(() => items.splice(0))
      current = { query, selected, items, positions: state.usePageScrollPositions(`${props.page}:`) }
      return () => Vue.h('div', query.value)
    } }
    const root = document.body.appendChild(document.createElement('div'))
    const app = Vue.createApp({ setup() {
      cache = state.providePageViewState(() => account.value)
      return () => Vue.h(Page, { key: route.value, page: route.value })
    } })
    try {
      app.mount(root)
      current.query.value = 'retained query'
      current.selected.value.add('video-1')
      current.items.push({ id: 1 })
      current.positions.set('main', 480)
      route.value = 'watch-later'
      await flush()
      route.value = 'history'
      await flush()
      assert.equal(current.query.value, 'retained query')
      assert.ok(current.selected.value.has('video-1'))
      assert.deepEqual([...current.items], [{ id: 1 }])
      assert.equal(current.positions.get('main'), 480)
      account.value = '200'
      route.value = 'watch-later'
      await flush()
      assert.equal(cache.snapshots.has('history'), false, 'old owner must not repopulate the cleared cache')
      route.value = 'history'
      await flush()
      assert.equal(current.query.value, '')
      assert.equal(current.items.length, 0)
      assert.equal(current.selected.value.size, 0)
      assert.equal(current.positions.get('main'), undefined)
    }
    finally {
      app.unmount()
      assert.equal(cache.snapshots.size, 0)
      root.remove()
    }
  })

  check('Page continuity: History resumes its saved cursor without refetching or losing filters, and rejects another account snapshot', async () => {
    const { useHistoryTimeline } = await import('../src/contentScripts/views/History/useHistoryTimeline')
    let account = 100
    const requests = []
    const dependencies = {
      getGroupInterval: () => 'day',
      getSortOrder: () => 'newest',
      getAccountId: () => account,
      getCSRF: () => '',
      haveScrollbar: async () => true,
      onWriteError: () => assert.fail('no writes in view restoration'),
      api: {
        getHistoryPauseStatus: async () => ({ code: 0, data: false }),
        getHistoryList: async (params) => {
          requests.push(params)
          return { code: 0, data: { list: Array.from({ length: 20 }, (_, index) => ({ title: String(account), view_at: (params.view_at || 200) - index - 1, duration: 100, progress: 10, history: { business: 'archive', oid: requests.length * 100 + index, dt: 2 } })), cursor: { max: requests.length * 100 + 19, view_at: (params.view_at || 200) - 20, business: 'archive' } } }
        },
      },
    }
    const first = useHistoryTimeline(dependencies)
    first.activate()
    await flush()
    first.keyword.value = 'unfinished search'
    const saved = first.snapshot()
    first.dispose()
    const second = useHistoryTimeline(dependencies)
    try {
      second.activate(saved)
      await flush()
      assert.equal(requests.length, 1)
      assert.equal(second.historyList.length, 20)
      assert.equal(second.keyword.value, 'unfinished search')
      await second.load()
      assert.equal(requests[1].view_at, saved.cursor.view_at)
      assert.equal(second.historyList.length, 40)
      account = 200
      second.activate(saved)
      await flush()
      assert.equal(requests.at(-1).view_at, 0)
      assert.equal(second.keyword.value, '')
      assert.ok(second.historyList.every(item => item.title === '200'))
    }
    finally { second.dispose() }
  })

  check('Page continuity: navigation restores module query/selection and clears private routes on account changes', async () => {
    const { AppPage } = await import('../src/enums/appEnums')
    const { HomeSubPage } = await import('../src/contentScripts/views/Home/types')
    const savedUrl = window.location.href
    const savedState = window.history.state
    window.history.replaceState({ native: 1 }, '', '/?page=Notifications&notificationView=whisper&notificationTalker=123&notificationSessionType=1')
    const href = Vue.ref(window.location.href)
    const account = Vue.ref('100')
    const settings = Vue.ref({ useSearchPageModeOnHomePage: false, homePageTabVisibilityList: [{ page: HomeSubPage.ForYou, visible: true }] })
    settings.initializationState = Vue.ref('loaded')
    const module = await loadSourceModule('../src/composables/useHomePageRoute.ts', {
      'vue': Vue,
      '~/composables/useCurrentLocationHref': { useCurrentLocationHref: () => href },
      '~/composables/useRouteState': { syncRouteState: () => href.value = window.location.href },
      '~/logic': { settings },
      '~/enums/appEnums': { AppPage },
      '~/utils/homeRoute': await import('../src/utils/homeRoute'),
      '~/utils/homeTabConfig': await import('../src/utils/homeTabConfig'),
    })
    const scope = Vue.effectScope()
    try {
      const route = scope.run(() => module.useHomePageRoute(() => AppPage.Home, settings.value.homePageTabVisibilityList, () => account.value))
      route.navigateToPage(AppPage.History)
      assert.equal(new URL(window.location.href).searchParams.has('notificationTalker'), false)
      route.navigateToPage(AppPage.Notifications)
      assert.equal(new URL(window.location.href).searchParams.get('notificationTalker'), '123')
      window.history.replaceState(window.history.state, '', '/?page=SearchResults&keyword=music&category=user&pn=3')
      href.value = window.location.href
      route.navigateToPage(AppPage.History)
      route.navigateToPage(AppPage.SearchResults)
      assert.equal(new URL(window.location.href).searchParams.get('keyword'), 'music')
      assert.equal(new URL(window.location.href).searchParams.get('pn'), '3')
      account.value = '200'
      route.navigateToPage(AppPage.History)
      route.navigateToPage(AppPage.Notifications)
      assert.equal(new URL(window.location.href).searchParams.has('notificationTalker'), false)
      assert.equal(window.history.state.native, 1)
    }
    finally {
      scope.stop()
      window.history.replaceState(savedState, '', savedUrl)
    }
  })

  check('Page continuity: video history retains the underlying view, rejects foreign entries and preserves unrelated history state', async () => {
    const history = await import('../src/utils/iframeDrawerHistory')
    const origin = 'https://www.bilibili.com/?page=SearchResults&keyword=music&category=user'
    const video = 'https://www.bilibili.com/video/BV1fixture'
    const state = history.createIframeDrawerHistory({ native: 'preserve' }, origin, 'momentsDialog')
    assert.equal(history.resolveApplicationHref(video, state), origin)
    assert.equal(history.readIframeDrawerHistory(state, video).playbackContext, 'momentsDialog')
    assert.deepEqual(history.clearIframeDrawerHistory(state), { native: 'preserve' })
    assert.equal(history.resolveApplicationHref(video, {}), video)
    assert.equal(history.resolveApplicationHref('https://example.com/', state), 'https://example.com/')
    const foreign = structuredClone(state)
    foreign.__bewlyIframeDrawer.session = 'another-document'
    assert.equal(history.resolveApplicationHref(video, foreign), video)
    assert.equal(history.clearIframeDrawerHistory(null), null)
  })

  check('Page continuity: actual cached Home retains its shell and tab state while releasing inactive data owners and scroll subscriptions', async () => {
    const { HomeSubPage } = await import('../src/contentScripts/views/Home/types')
    const tabState = await import('../src/composables/useHomeTabState')
    const layout = await import('../src/constants/layout')
    const events = await import('../src/constants/globalEvents')
    const bus = (await import('mitt')).default()
    const viewport = document.body.appendChild(document.createElement('div'))
    viewport.scrollTo = ({ top }) => viewport.scrollTop = top
    const tabs = [{ page: HomeSubPage.ForYou, visible: true, i18nKey: 'home' }, { page: HomeSubPage.Trending, visible: true, i18nKey: 'trending' }]
    const settings = Vue.ref({ useSearchPageModeOnHomePage: true, preserveForYouState: true, recommendationMode: 'web', homePageTabVisibilityList: tabs, searchPageShowLogo: true, showRecommendationModeSwitcher: false, enableGridLayoutSwitcher: false })
    const provider = { homeActivatedPage: Vue.ref(HomeSubPage.ForYou), homeActivatedPageTouched: Vue.ref(false), navigateToHomeTab: page => provider.homeActivatedPage.value = page, isHomeTabSwitching: Vue.ref(false), scrollViewportRef: Vue.ref(viewport) }
    const blank = { render: () => null }
    let owners = 0
    let requests = 0
    const Home = await compileComponent('../src/contentScripts/views/Home/Home.vue', {
      '@iconify/vue': { Icon: blank },
      '@vueuse/core': { useMediaQuery: () => Vue.ref(false) },
      '~/components/LiquidSegmentIndicator.vue': { default: blank },
      '~/components/PageAsyncLoading.vue': { default: blank },
      '~/composables/useAppProvider': { useBewlyApp: () => provider },
      '~/composables/useHomeTabState': tabState,
      '~/constants/layout': layout,
      '~/constants/globalEvents': events,
      '~/logic': { settings, gridLayout: Vue.ref({ home: 'adaptive' }) },
      '~/logic/layoutEdit': { isLayoutEditing: Vue.ref(false), useLayoutEditSettingValue: (_key, getValue) => Vue.computed(getValue), vLayoutEditable: {} },
      '~/stores/forYouStore': { useForYouStore: () => ({ resetState() {}, takeCompleteState: () => null, saveCompleteState() {} }) },
      '~/stores/mainStore': { useMainStore: () => ({ homeTabs: tabs }) },
      '~/stores/topBarStore': { useTopBarStore: () => ({ isLogin: true, userInfo: { mid: 100 } }) },
      '~/utils/accountScope': await import('../src/utils/accountScope'),
      '~/utils/homeTabConfig': await import('../src/utils/homeTabConfig'),
      '~/utils/scrollIntent': await import('../src/utils/scrollIntent'),
      '~/utils/mitt': { default: bus },
      './components/VersionReminder.vue': { default: blank },
      './components/HomeChannelsMenu.vue': { default: blank },
      './components/RecommendationModeSwitcher.vue': { default: blank },
      './types': { HomeSubPage },
    }, { globals: { defineAsyncComponent: () => ({ setup() {
      const state = tabState.useHomeTabState()
      const value = state.ref('retained-filter', '')
      owners++
      if (!state.restored)
        requests++
      Vue.onBeforeUnmount(() => owners--)
      return () => Vue.h('input', { 'data-tab-filter': '', 'value': value.value, 'onInput': event => value.value = event.target.value })
    } }) } })
    const visible = Vue.ref(true)
    let instance
    const app = Vue.createApp({ render: () => Vue.h(Vue.KeepAlive, { include: ['BewlyHomePage'], max: 1 }, { default: () => visible.value ? Vue.h(Home, { ref: value => instance = value }) : Vue.h('div', 'other page') }) })
    app.config.globalProperties.$t = key => key
    app.component('Logo', blank)
    app.component('SearchBar', blank)
    try {
      app.mount(viewport)
      await flush()
      const home = instance
      const header = viewport.querySelector('.home-header')
      const input = viewport.querySelector('[data-tab-filter]')
      input.value = 'preserved'
      input.dispatchEvent(new Event('input', { bubbles: true }))
      assert.equal(owners, 1)
      assert.equal(requests, 1)
      assert.equal(bus.all.get(events.OVERLAY_SCROLL_BAR_SCROLL)?.length, 1)
      visible.value = false
      await flush()
      assert.equal(owners, 0, 'inactive Home must release previews, observers and request owners')
      assert.equal(bus.all.get(events.OVERLAY_SCROLL_BAR_SCROLL)?.length ?? 0, 0)
      visible.value = true
      await flush()
      assert.equal(instance, home)
      assert.equal(viewport.querySelector('.home-header'), header)
      assert.equal(viewport.querySelector('[data-tab-filter]').value, 'preserved')
      assert.equal(owners, 1)
      assert.equal(requests, 1, 'restored tab data must not start a duplicate initial request')
      assert.equal(bus.all.get(events.OVERLAY_SCROLL_BAR_SCROLL)?.length, 1)
    }
    finally {
      app.unmount()
      assert.equal(owners, 0)
      viewport.remove()
    }
  })
}
