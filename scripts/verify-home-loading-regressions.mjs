import assert from 'node:assert/strict'

export function registerHomeLoadingRegressionChecks(check, { Vue, compileComponent, flush }) {
  check('Home refresh: delayed account readiness keeps the search hero at the page top', async () => {
    const { HomeSubPage } = await import('../src/contentScripts/views/Home/types')
    const layout = await import('../src/constants/layout')
    const topBar = Vue.reactive({ isLogin: false, userInfo: { mid: 0 } })
    const tabs = [HomeSubPage.ForYou, HomeSubPage.Weekly].map(page => ({ page, visible: true, i18nKey: page }))
    const settings = Vue.ref({ useSearchPageModeOnHomePage: true, preserveForYouState: true, recommendationMode: 'web', homePageTabVisibilityList: tabs })
    const viewport = document.body.appendChild(document.createElement('div'))
    viewport.scrollTop = 1200
    const provider = {
      handleBackToTop: value => viewport.scrollTop = value,
      homeActivatedPage: Vue.ref(HomeSubPage.ForYou),
      homeActivatedPageTouched: Vue.ref(false),
      isHomeTabSwitching: Vue.ref(false),
      scrollViewportRef: Vue.ref(viewport),
    }
    const blank = { render: () => null }
    const Home = await compileComponent('../src/contentScripts/views/Home/Home.vue', {
      '@iconify/vue': { Icon: blank },
      '@vueuse/core': { useThrottleFn: fn => fn },
      '~/components/LiquidSegmentIndicator.vue': { default: blank },
      '~/components/PageAsyncLoading.vue': { default: blank },
      '~/composables/useAppProvider': { useBewlyApp: () => provider },
      '~/composables/useHomeTabState': await import('../src/composables/useHomeTabState'),
      '~/composables/useSearchFocusEffect': { useSearchFocusEffect: () => ({ darkened: false, blurred: false }) },
      '~/constants/globalEvents': await import('../src/constants/globalEvents'),
      '~/constants/layout': layout,
      '~/logic': { settings, gridLayout: Vue.ref({ home: 'adaptive' }) },
      '~/logic/layoutEdit': { isLayoutEditing: Vue.ref(false), useLayoutEditSettingValue: (_key, getter) => Vue.computed(getter), vLayoutEditable: {} },
      '~/stores/forYouStore': { useForYouStore: () => ({ resetState() {}, takeCompleteState: () => null }) },
      '~/stores/mainStore': { useMainStore: () => ({ homeTabs: tabs }) },
      '~/stores/topBarStore': { useTopBarStore: () => topBar },
      '~/utils/accountScope': await import('../src/utils/accountScope'),
      '~/utils/homeTabConfig': await import('../src/utils/homeTabConfig'),
      '~/utils/mitt': { default: { on() {}, off() {} } },
      './components/VersionReminder.vue': { default: blank },
      './components/RecommendationModeSwitcher.vue': { default: blank },
      './types': { HomeSubPage },
    }, { renderTemplate: false })
    const host = viewport.appendChild(document.createElement('div'))
    let state
    const app = Vue.createApp({ render: () => Vue.h(Home, { ref: value => state = value?.$?.setupState }) })
    try {
      app.mount(host)
      await flush()
      assert.equal(viewport.scrollTop, 0)
      topBar.isLogin = true
      await flush()
      topBar.userInfo.mid = 42
      await flush()
      state.restoreTabScrollPosition()
      assert.equal(viewport.scrollTop, 0, 'late account identity must not replace the entry position with the video section offset')
      assert.equal(state.cachedScrollTop, 0)
      state.handleChangeTab(tabs[1])
      await flush()
      state.restoreTabScrollPosition()
      assert.equal(viewport.scrollTop, 0, 'switching to an uncached tab from the search hero must keep it visible')
      topBar.userInfo.mid = 43
      await flush()
      state.restoreTabScrollPosition()
      assert.equal(viewport.scrollTop, 0, 'account updates after switching tabs must also retain the visible search hero')
      viewport.scrollTop = layout.HOME_SEARCH_STAGE_HEIGHT + 500
      state.handleChangeTab(tabs[0])
      await flush()
      state.restoreTabScrollPosition()
      assert.equal(viewport.scrollTop, layout.HOME_SEARCH_STAGE_HEIGHT, 'an uncached tab entered from the list starts at the video section')
      state.handleChangeTab(tabs[1])
      await flush()
      state.restoreTabScrollPosition()
      assert.equal(viewport.scrollTop, layout.HOME_SEARCH_STAGE_HEIGHT + 500, 'returning to a visited tab preserves its remembered list position')
    }
    finally {
      app.unmount()
      viewport.remove()
    }
  })

  check('Weekly: delayed initialization and refresh preserve the hero; edition changes never scroll it out of view', async () => {
    const { HOME_SEARCH_STAGE_HEIGHT } = await import('../src/constants/layout')
    const viewport = document.body.appendChild(document.createElement('div'))
    const settings = Vue.ref({ useSearchPageModeOnHomePage: true })
    const scrolls = []
    const lists = []
    const videos = []
    const provider = {
      mainAppRef: Vue.ref(viewport),
      scrollViewportRef: Vue.ref(viewport),
      handlePageRefresh: Vue.ref(),
      handleBackToTop(top) {
        scrolls.push(top)
        viewport.scrollTop = top
      },
    }
    const Weekly = await compileComponent('../src/contentScripts/views/Home/components/Weekly.vue', {
      '~/components/VideoCardGrid.vue': { default: { render: () => null } },
      '~/composables/useAppProvider': { useBewlyApp: () => provider },
      '~/composables/useHomeTabState': await import('../src/composables/useHomeTabState'),
      '~/constants/layout': { HOME_SEARCH_STAGE_HEIGHT },
      '~/logic': { settings },
      '~/utils/api': { default: { ranking: {
        getPopularSeriesList: () => new Promise(resolve => lists.push(resolve)),
        getPopularSeriesOne: request => new Promise(resolve => videos.push({ ...request, resolve })),
      } } },
      '~/utils/htmlDecode': { decodeHtmlEntities: text => text },
      '~/utils/messaging': { reportRuntimeFailure() {} },
    }, { renderTemplate: false })
    const host = viewport.appendChild(document.createElement('div'))
    let state
    const app = Vue.createApp({ render: () => Vue.h(Weekly, { gridLayout: 'adaptive', topBarVisibility: true, ref: value => state = value?.$?.setupState }) })
    const editions = [{ number: 42, name: '42' }, { number: 41, name: '41' }]
    const settleList = async () => {
      lists.shift()({ code: 0, data: { list: editions } })
      await flush()
      assert.equal(videos.at(-1).number, 42)
      videos.at(-1).resolve({ code: 0, data: { list: [] } })
      await flush()
    }
    try {
      app.mount(host)
      await flush()
      await settleList()
      assert.deepEqual(scrolls, [], 'an asynchronous list response cannot take over page scrolling')
      assert.equal(viewport.scrollTop, 0)
      const refreshing = provider.handlePageRefresh.value()
      await settleList()
      await refreshing
      assert.deepEqual(scrolls, [], 'refresh remains at the position chosen by the shell')
      state.selectSeries(editions[1])
      await flush()
      assert.equal(scrolls.at(-1), 0)
      assert.equal(videos.at(-1).number, 41)
      videos.at(-1).resolve({ code: 0, data: { list: [] } })
      await flush()
      viewport.scrollTop = HOME_SEARCH_STAGE_HEIGHT + 700
      state.selectSeries(editions[0])
      await flush()
      assert.equal(scrolls.at(-1), HOME_SEARCH_STAGE_HEIGHT, 'a user already in the list still returns to its beginning')
      videos.at(-1).resolve({ code: 0, data: { list: [] } })
      await flush()
      settings.value.useSearchPageModeOnHomePage = false
      viewport.scrollTop = 700
      state.selectSeries(editions[1])
      await flush()
      assert.equal(scrolls.at(-1), 0)
      const pending = videos.at(-1)
      app.unmount()
      const count = scrolls.length
      pending.resolve({ code: 0, data: { list: [] } })
      await flush()
      assert.equal(scrolls.length, count)
    }
    finally {
      if (host.childElementCount)
        app.unmount()
      viewport.remove()
    }
  })

  check('Card preview: MP4/HLS/FLV retain the full skeleton until decoded data; stale and unmounted sessions cannot settle it', async () => {
    const settings = Vue.ref({ enableVideoPreview: true, enableVideoCtrlBarOnVideoCard: true, enableVideoPreviewSwipeSeek: false })
    const blank = { render: () => null }
    const players = []
    const flvPlayers = []
    let resolveHls
    const hlsModule = new Promise(resolve => resolveHls = resolve)
    class FakeHls {
      static isSupported() { return true }
      static Events = { MANIFEST_PARSED: 'manifest', ERROR: 'error' }
      static ErrorTypes = { MEDIA_ERROR: 'media' }
      handlers = new Map()
      destroyed = false
      constructor() { players.push(this) }
      loadSource() {}
      attachMedia() {}
      on(name, handler) { this.handlers.set(name, handler) }
      destroy() { this.destroyed = true }
    }
    const Cover = await compileComponent('../src/components/VideoCard/components/VideoCardCover.vue', {
      '@iconify/vue': { Icon: blank },
      '~/components/Button.vue': { default: blank },
      '~/components/LazyPicture.vue': { default: blank },
      '~/components/SkeletonBlock.vue': { default: await compileComponent('../src/components/SkeletonBlock.vue') },
      '~/components/Tooltip.vue': { default: blank },
      '~/composables/useVideoPreviewSwipeSeek': await import('../src/composables/useVideoPreviewSwipeSeek'),
      '~/logic': { settings },
      '~/utils/dataFormatter': { calcCurrentTime: () => '' },
      '~/utils/flv': { loadFlvModule: async () => ({ default: {
        isSupported: () => true,
        Events: { ERROR: 'error', LOADING_COMPLETE: 'complete' },
        createPlayer: () => {
          const player = {
            handlers: new Map(),
            destroyed: false,
            attachMediaElement() {},
            on(name, handler) { this.handlers.set(name, handler) },
            load() {},
            pause() {},
            unload() {},
            detachMediaElement() {},
            destroy() { this.destroyed = true },
          }
          flvPlayers.push(player)
          return player
        },
      } }) },
      '~/utils/hls': { loadHlsModule: () => hlsModule },
      '~/utils/mediaResources': await import('../src/utils/mediaResources'),
      '~/utils/previewMediaSession': await import('../src/utils/previewMediaSession'),
    })
    const media = window.HTMLMediaElement.prototype
    const originals = Object.fromEntries(['load', 'play', 'pause'].map(name => [name, media[name]]))
    media.load = () => {}
    media.pause = () => {}
    media.play = async () => {}
    const props = Vue.reactive({ layout: 'modern', skeleton: false, removed: false, isHover: true, shouldHideOverlayElements: false, previewVideoUrl: 'https://example.com/first.mp4', videoElement: null, isInWatchLater: false, showWatchLater: false, coverImageUrl: '' })
    const host = document.body.appendChild(document.createElement('div'))
    const app = Vue.createApp({ render: () => Vue.h(Cover, props) })
    app.config.globalProperties.$t = key => key
    const loading = () => host.querySelector('.video-card-preview__loading [data-bew-skeleton]')
    const settleTransition = async () => {
      await flush()
      await new Promise(resolve => setTimeout(resolve, 60))
      await flush()
    }
    const ready = (video) => {
      Object.defineProperty(video, 'readyState', { configurable: true, value: window.HTMLMediaElement.HAVE_CURRENT_DATA })
      video.dispatchEvent(new Event('loadeddata'))
    }
    try {
      app.mount(host)
      await flush()
      const first = host.querySelector('video')
      assert.ok(loading(), 'MP4 must enter the same full-cover skeleton as stream previews')
      assert.equal(first.controls, false)
      first.dispatchEvent(new Event('loadedmetadata'))
      await flush()
      assert.ok(loading(), 'metadata and a resolved play() do not prove a decoded frame')
      ready(first)
      await settleTransition()
      assert.equal(loading(), null)
      assert.equal(first.controls, true)
      props.isHover = false
      await settleTransition()
      props.previewVideoUrl = 'https://example.com/current.m3u8'
      props.isHover = true
      await flush()
      const current = host.querySelector('video')
      assert.ok(loading(), 'the skeleton also covers asynchronous HLS module loading')
      first.dispatchEvent(new Event('loadeddata'))
      await flush()
      assert.ok(loading(), 'the old element cannot clear the new preview')
      resolveHls({ default: FakeHls })
      await flush()
      players[0].handlers.get('manifest')()
      await flush()
      assert.ok(loading(), 'an HLS manifest does not prove a decoded frame')
      ready(current)
      await settleTransition()
      assert.equal(loading(), null)
      props.isHover = false
      await settleTransition()
      assert.equal(players[0].destroyed, true)
      props.previewVideoUrl = 'https://example.com/live.flv'
      props.isHover = true
      await flush()
      const live = host.querySelector('video')
      assert.ok(loading())
      flvPlayers[0].handlers.get('complete')?.()
      await flush()
      assert.ok(loading(), 'download completion does not prove a decoded FLV frame')
      ready(live)
      await settleTransition()
      assert.equal(loading(), null)
      app.unmount()
      current.dispatchEvent(new Event('canplay'))
      live.dispatchEvent(new Event('canplay'))
      assert.equal(flvPlayers[0].destroyed, true)
      assert.equal(current.hasAttribute('src'), false)
    }
    finally {
      if (host.childElementCount)
        app.unmount()
      Object.assign(media, originals)
      host.remove()
    }
  })
}
