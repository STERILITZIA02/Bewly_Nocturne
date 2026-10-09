import assert from 'node:assert/strict'

import { JSDOM } from 'jsdom'

import { loadSourceModule } from './sourceModuleHarness'

export function registerMaintenanceReviewChecks(check, { Vue, flush, compileComponent }) {
  check('review Following faces: delayed enrichment updates the rendered card and unfinished cached entries resume after remount', async () => {
    const faces = []
    const module = await loadSourceModule('../src/contentScripts/views/Home/following/useFollowingVideoSearch.ts', {
      'vue': Vue,
      '~/logic': { settings: Vue.ref({ followingFilterChargingVideos: false }) },
      '~/utils/api': { default: { user: {
        getUserVideos: async () => ({ code: 0, data: { list: { vlist: [20, 21].map(mid => ({ mid, aid: mid, bvid: `BV${mid}`, title: 'title', author: 'author', pic: '', created: 1 })) }, page: { count: 2, ps: 30 } } }),
        getUserCard: (params, options) => new Promise(resolve => faces.push({ params, options, resolve })),
      } } },
      '~/utils/dataFormatter': { parseStatNumber: Number },
      '~/utils/favoriteAvatar': await import('../src/utils/favoriteAvatar'),
      '~/utils/htmlDecode': { decodeHtmlEntities: value => value },
    })
    const fields = new Map()
    let search
    let restored = false
    const host = document.body.appendChild(document.createElement('div'))
    const mount = () => {
      const app = Vue.createApp({
        setup() {
          search = module.useFollowingVideoSearch({ restored, isCurrent: () => true, ref: (key, initial) => {
            if (!fields.has(key))
              fields.set(key, Vue.ref(initial))
            return fields.get(key)
          } }, () => 1, () => 10, () => undefined)
          return () => Vue.h('div', search.items.value.map(item => item.author.authorFace).join('|'))
        },
      })
      app.mount(host)
      return app
    }
    let app = mount()
    try {
      search.draft.value = 'author'
      await search.submit()
      await flush()
      assert.equal(faces.length, 2)
      faces[0].resolve({ code: 0, data: { card: { mid: 20, face: 'face-20' } } })
      await flush()
      assert.equal(host.textContent, 'face-20|', 'enrichment must mutate the reactive card, not the raw object inserted earlier')
      app.unmount()
      assert.equal(faces[1].options.signal.aborted, true)
      restored = true
      app = mount()
      await flush()
      assert.equal(faces.length, 3, 'only the unfinished cached author should be read again')
      faces[2].resolve({ code: 0, data: { card: { mid: 21, face: 'face-21' } } })
      await flush()
      assert.equal(host.textContent, 'face-20|face-21')
      faces[1].resolve({ code: 0, data: { card: { mid: 21, face: 'stale' } } })
      await flush()
      assert.equal(host.textContent, 'face-20|face-21')
    }
    finally {
      app.unmount()
      host.remove()
    }
  })

  check('review TopBar lifetime: deferred initialization cannot reactivate a store after its component unmounts', async () => {
    const activations = []
    const store = { popupVisible: {}, drawerVisible: { notifications: false }, setTopBarVisible() {}, setUiActive: async value => activations.push(value), cleanup: () => activations.push(false) }
    const noUI = { render: () => null }
    const TopBar = await compileComponent('../src/components/TopBar/TopBar.vue', {
      '@vueuse/core': { onKeyStroke() {}, useMediaQuery: () => Vue.ref(false), useMouseInElement: () => ({ isOutside: Vue.ref(true) }) },
      '~/composables/useAppProvider': { useBewlyApp: () => ({ reachTop: Vue.ref(true) }) },
      '~/composables/useCurrentLocationHref': { useCurrentLocationHref: () => Vue.ref(window.location.href) },
      '~/composables/useDark': { useDark: () => ({ isDark: Vue.ref(false) }) },
      '~/constants/globalEvents': await import('../src/constants/globalEvents'),
      '~/enums/appEnums': await import('../src/enums/appEnums'),
      '~/logic': { settings: Vue.ref({ videoPageTopBarConfig: 'alwaysShow', touchScreenOptimization: false }) },
      '~/logic/iframePageState': { useIframePageActive: () => Vue.ref(false) },
      '~/logic/layoutEdit': { isLayoutEditing: Vue.ref(false), useLayoutEditableRoot() {} },
      '~/stores/settingsStore': { useSettingsStore: () => ({ getEffectiveTopBarSource: () => 'bewly' }) },
      '~/stores/topBarStore': { useTopBarStore: () => store },
      '~/utils/bewlyWidescreen': { isBewlyWidescreenActive: () => false },
      '~/utils/iframeDrawerHost': { isIframeDrawerHost: () => false },
      '~/utils/main': { isHomePage: () => true, isInIframe: () => false, isUserSpacePage: () => false, isVideoOrBangumiPage: () => false },
      '~/utils/messaging': { reportRuntimeFailure: (_context, error) => { throw error } },
      '~/utils/mitt': { default: { on() {}, off() {}, emit() {} } },
      './components/NotificationsDrawer.vue': { default: noUI },
      './components/TopBarHeader.vue': { default: noUI },
      './composables/useTopBarInteraction': { resetTopBarTransientInteraction() {}, useTopBarInteraction: () => ({ forceWhiteIcon: Vue.ref(false) }) },
    }, { globals: { clearTimeout: window.clearTimeout.bind(window), MutationObserver: window.MutationObserver } })
    const host = document.body.appendChild(document.createElement('div'))
    const app = Vue.createApp(TopBar)
    app.mount(host)
    app.unmount()
    await flush()
    host.remove()
    assert.equal(activations.includes(true), false)
  })

  check('review dynamic emotes: A to B to A late reads cannot overwrite the current account request cache', async () => {
    const pending = []
    let cookie = '1'
    const module = await loadSourceModule('../src/components/MomentCard/useMomentForwardComposer.ts', {
      'vue': Vue,
      '~/utils/api': { default: { moment: { getMomentEmotes: () => new Promise(resolve => pending.push(resolve)) } } },
      '~/utils/main': { getUserID: () => cookie },
      './momentForwardContent': await import('../src/components/MomentCard/momentForwardContent'),
      './momentForwardTransactions': { MOMENT_FORWARD_TRANSACTIONS: Symbol('momentForwardTransactions') },
    })
    const response = id => ({ code: 0, data: { packages: [{ id, type: 4, emote: [{ id, text: `pack-${id}` }] }] } })
    const oldA = module.loadMomentForwardEmotes('1')
    cookie = '2'
    const b = module.loadMomentForwardEmotes('2')
    cookie = '1'
    const newA = module.loadMomentForwardEmotes('1')
    pending[2](response(3))
    const fresh = await newA
    pending[0](response(1))
    pending[1](response(2))
    await Promise.all([oldA, b])
    assert.deepEqual(await module.loadMomentForwardEmotes('1'), fresh)
    assert.equal(pending.length, 3)
  })

  async function themeFixture() {
    const host = document.body.appendChild(document.createElement('div'))
    host.id = 'bewly'
    const shadow = host.attachShadow({ mode: 'open' })
    const savedHtmlClass = document.documentElement.className
    const savedBodyClass = document.body.className
    const savedStyle = document.documentElement.getAttribute('style')
    const hidden = Object.getOwnPropertyDescriptor(document, 'hidden')
    const start = Object.getOwnPropertyDescriptor(document, 'startViewTransition')
    const animate = Object.getOwnPropertyDescriptor(document.documentElement, 'animate')
    const intervals = new Map()
    let id = 0
    let minute = 12 * 60
    let reduced = false
    let throwStart = false
    const transitions = []
    const animations = []
    const deferred = () => {
      let resolve
      let reject
      const promise = new Promise((done, fail) => {
        resolve = done
        reject = fail
      })
      return { promise, resolve, reject }
    }
    Object.defineProperty(document, 'startViewTransition', { configurable: true, value: (update) => {
      if (throwStart)
        throw new Error('Transition unavailable')
      const ready = deferred()
      const finished = deferred()
      const entry = { ready, finished, skipped: 0, update: Promise.resolve().then(update) }
      transitions.push(entry)
      return { ready: ready.promise, finished: finished.promise, skipTransition() {
        entry.skipped++
        ready.reject(new Error('skipped'))
        finished.resolve()
      } }
    } })
    Object.defineProperty(document.documentElement, 'animate', { configurable: true, value: (frames, options) => {
      const finished = deferred()
      const entry = { frames, options, finished, canceled: 0 }
      animations.push(entry)
      return { finished: finished.promise, cancel() {
        entry.canceled++
        finished.reject(new Error('animation canceled'))
      } }
    } })
    const settings = Vue.ref({ theme: 'light', themeScheduleStart: '06:00', themeScheduleEnd: '18:00', darkModeBaseColor: '#181818', adaptToOtherPageStyles: true, videoPageDarkMode: false, enableOledDarkMode: false })
    const module = await loadSourceModule('../src/composables/useDark.ts', {
      'vue': Vue,
      '@vueuse/core': { usePreferredDark: () => Vue.ref(false) },
      '~/composables/useCurrentLocationHref': { useCurrentLocationHref: () => Vue.ref(window.location.href) },
      '~/constants/globalEvents': await import('../src/constants/globalEvents'),
      '~/logic': { settings },
      '~/utils/iframeMessage': { getParentMessageData: () => undefined },
      '~/utils/main': { isVideoPlaybackPage: () => false, setCookie() {} },
    }, {
      ref: Vue.ref,
      computed: Vue.computed,
      watch: Vue.watch,
      nextTick: Vue.nextTick,
      innerWidth: 1200,
      innerHeight: 800,
      CustomEvent,
      Date: class extends Date {
        getHours() { return Math.floor(minute / 60) }
        getMinutes() { return minute % 60 }
      },
      clearInterval: id => intervals.delete(id),
      window: {
        addEventListener: window.addEventListener.bind(window),
        removeEventListener: window.removeEventListener.bind(window),
        dispatchEvent: window.dispatchEvent.bind(window),
        matchMedia: () => ({ matches: reduced }),
        setInterval: (callback) => {
          intervals.set(++id, callback)
          return id
        },
      },
    })
    const state = module.useDark()
    return {
      state,
      settings,
      transitions,
      animations,
      intervals,
      shadow,
      setMinute(value) { minute = value },
      reduced(value) { reduced = value },
      failStart() { throwStart = true },
      close() {
        module.stopDarkState()
        host.remove()
        document.documentElement.className = savedHtmlClass
        document.body.className = savedBodyClass
        if (savedStyle === null)
          document.documentElement.removeAttribute('style')
        else document.documentElement.setAttribute('style', savedStyle)
        for (const [object, key, descriptor] of [[document, 'hidden', hidden], [document, 'startViewTransition', start], [document.documentElement, 'animate', animate]]) {
          if (descriptor)
            Object.defineProperty(object, key, descriptor)
          else delete object[key]
        }
      },
    }
  }

  check('review theme transitions: rapid interruption, animation failure, missing wrapper and reduced motion release every owned style', async () => {
    const fixture = await themeFixture()
    const button = document.body.appendChild(document.createElement('button'))
    button.getBoundingClientRect = () => ({ left: 100, top: 100, width: 50, height: 40 })
    button.addEventListener('click', fixture.state.toggleDark)
    const styles = () => document.querySelectorAll('[data-bewly-theme-transition]').length + fixture.shadow.querySelectorAll('[data-bewly-theme-transition]').length
    try {
      button.click()
      await flush()
      assert.equal(styles(), 3)
      button.click()
      await flush()
      assert.equal(fixture.transitions[0].skipped, 1)
      assert.equal(styles(), 3)
      fixture.transitions[1].ready.resolve()
      await flush()
      assert.equal(fixture.animations[0].options.duration, 300)
      assert.ok(fixture.animations[0].frames.clipPath.every(value => value.includes('125px 120px')), 'keyboard activation originates at the trigger')
      fixture.transitions[1].finished.reject(new Error('interrupted'))
      await flush()
      assert.equal(styles(), 0)
      fixture.failStart()
      button.click()
      assert.equal(styles(), 0)
      fixture.reduced(true)
      const count = fixture.transitions.length
      button.click()
      assert.equal(fixture.transitions.length, count)
      assert.equal(styles(), 0)
    }
    finally {
      fixture.close()
      button.remove()
    }
  })

  check('review scheduled theme: hidden pages have no clock wakeups; resume uses the current local time immediately', async () => {
    const fixture = await themeFixture()
    try {
      fixture.settings.value.theme = 'scheduled'
      await flush()
      assert.equal(fixture.intervals.size, 1)
      assert.equal(fixture.state.isDark.value, false)
      Object.defineProperty(document, 'hidden', { configurable: true, value: true })
      document.dispatchEvent(new Event('visibilitychange'))
      assert.equal(fixture.intervals.size, 0)
      fixture.setMinute(21 * 60)
      Object.defineProperty(document, 'hidden', { configurable: true, value: false })
      document.dispatchEvent(new Event('visibilitychange'))
      await flush()
      assert.equal(fixture.state.isDark.value, true)
      assert.equal(fixture.intervals.size, 1)
      fixture.settings.value.theme = 'auto'
      await flush()
      assert.equal(fixture.intervals.size, 0)
    }
    finally { fixture.close() }
  })

  check('review shared search backend: one cancelled consumer preserves another; the last abort stops its owner and persistence cannot delay the response', async () => {
    const reads = []
    const module = await loadSourceModule('../src/background/messageListeners/api/search.ts', {
      'webextension-polyfill': { default: {
        cookies: { get: async () => ({ value: '1' }) },
        storage: { session: { get: async () => ({}), set: () => new Promise(() => {}) } },
      } },
      '~/constants/searchApi': await import('../src/constants/searchApi'),
      '~/utils/abort': await import('../src/utils/abort'),
      '../../utils': { AHS: { J_D: [] }, doRequest: (_message, _api, { signal }) => new Promise((resolve, reject) => {
        reads.push({ signal, resolve })
        signal.addEventListener('abort', () => reject(signal.reason), { once: true })
      }) },
    })
    const load = module.default.getDefaultSearchRecommendation
    const a = new AbortController()
    const b = new AbortController()
    const first = load({}, undefined, { signal: a.signal }).catch(error => error.name)
    const second = load({}, undefined, { signal: b.signal }).catch(error => error.name)
    await flush()
    await flush()
    assert.equal(reads.length, 1)
    a.abort()
    assert.equal(await first, 'AbortError')
    assert.equal(reads[0].signal.aborted, false)
    b.abort()
    assert.equal(await second, 'AbortError')
    assert.equal(reads[0].signal.aborted, true)
    let settled = false
    const fresh = load().then((value) => {
      settled = true
      return value
    })
    await flush()
    await flush()
    reads[1].resolve({ code: 0, data: { name: 'fresh' } })
    await flush()
    await flush()
    assert.equal(settled, true, 'slow session cache persistence must not block current UI')
    assert.equal((await fresh).data.name, 'fresh')
    await load()
    assert.equal(reads.length, 2)
  })

  check('review shared search UI: ref-counted cancellation, hidden resume, account invalidation and late finally preserve the new owner', async () => {
    const hidden = Object.getOwnPropertyDescriptor(document, 'hidden')
    const requests = []
    const timers = new Map()
    let timer = 0
    let mid = '1'
    const protocol = await import('../src/constants/pageBridge')
    const api = kind => (_params, options) => new Promise(resolve => requests.push({ kind, options, resolve }))
    const module = await loadSourceModule('../src/logic/searchExperience.ts', {
      'vue': Vue,
      '~/constants/pageBridge': { ...protocol, getPageBridgeTargetOrigin: () => window.location.origin },
      '~/utils/pageBridgeChannel': { getPageBridgeChannelId: () => 'search-owner' },
      '~/utils/api': { default: { search: { getHotSearchList: api('hot'), getDefaultSearchRecommendation: api('default') } } },
      '~/utils/debug': { debugLog() {} },
      '~/utils/main': { getUserID: () => mid },
      '~/utils/messaging': { isExtensionContextInvalidatedError: () => false },
    }, {
      setTimeout: (callback) => {
        timers.set(++timer, callback)
        return timer
      },
      clearTimeout: id => timers.delete(id),
    })
    const state = module.useSearchExperience()
    const first = module.acquireSearchExperience({ hotSearch: true, recommendation: true })
    const second = module.acquireSearchExperience({ hotSearch: true, recommendation: true })
    try {
      assert.equal(requests.length, 2)
      const initialTimer = [...timers.keys()][0]
      first()
      assert.equal([...timers.keys()][0], initialTimer, 'consumer changes cannot postpone refresh indefinitely')
      assert.equal(requests[0].options.signal.aborted, false)
      Object.defineProperty(document, 'hidden', { configurable: true, value: true })
      document.dispatchEvent(new Event('visibilitychange'))
      assert.ok(requests.every(request => request.options.signal.aborted))
      assert.equal(timers.size, 0)
      Object.defineProperty(document, 'hidden', { configurable: true, value: false })
      document.dispatchEvent(new Event('visibilitychange'))
      assert.equal(requests.length, 4)
      requests[0].resolve({ code: 0, data: { trending: { list: [{ keyword: 'old' }] } } })
      requests[1].resolve({ code: 0, data: { name: 'old' } })
      await flush()
      assert.equal(state.isLoadingHotSearch.value, true)
      assert.equal(state.isLoadingSearchRecommendation.value, true)
      assert.equal(state.hotSearchList.value.length, 0)
      requests[2].resolve({ code: 0, data: { trending: { list: [] } } })
      requests[3].resolve({ code: 0, data: { name: 'account-a' } })
      await flush()
      assert.equal(state.searchRecommendation.value.name, 'account-a')
      await module.loadSharedHotSearch()
      assert.equal(requests.length, 4, 'a valid empty hot-search list is cached')
      mid = '2'
      window.dispatchEvent(new window.MessageEvent('message', { source: window, origin: window.location.origin, data: { protocol: protocol.PAGE_BRIDGE_PROTOCOL, channelId: 'search-owner', type: protocol.PAGE_BRIDGE_MESSAGE.ACCOUNT_CHANGED } }))
      assert.equal(state.searchRecommendation.value, null)
      assert.equal(requests.length, 5)
      requests[4].resolve({ code: 0, data: { name: 'account-b' } })
      await flush()
      assert.equal(state.searchRecommendation.value.name, 'account-b')
    }
    finally {
      first()
      second()
      assert.equal(timers.size, 0)
      if (hidden)
        Object.defineProperty(document, 'hidden', hidden)
      else delete document.hidden
    }
  })

  async function searchFixture() {
    const pending = []
    const debounce = []
    let delayInput = false
    const visibility = Vue.ref('visible')
    const iframeActive = Vue.ref(false)
    const settings = Vue.ref({ enableSearchHistory: true, showSearchRecommendation: false, showHotSearchInTopBar: false, disableFrostedGlass: true })
    let history = [{ value: 'one', timestamp: 1 }, { value: 'two', timestamp: 1 }]
    let failHistory = false
    let nextHistoryRead
    const errors = []
    const source = await compileComponent('../src/components/SearchBar/SearchBar.vue', {
      '@vueuse/core': {
        onClickOutside() {},
        useDebounceFn: callback => (...args) => delayInput ? debounce.push(() => callback(...args)) : callback(...args),
        useElementBounding: () => ({ left: Vue.ref(0), top: Vue.ref(0) }),
        useMediaQuery: () => Vue.ref(false),
        useDocumentVisibility: () => visibility,
      },
      '~/constants/layout': await import('../src/constants/layout'),
      '~/logic': { settings },
      '~/logic/iframePageState': { useIframePageActive: () => iframeActive },
      '~/utils/main': { isInIframe: () => false },
      '~/logic/searchExperience': { acquireSearchExperience: () => () => {}, loadSharedHotSearch: async () => {}, useSearchExperience: () => ({ hotSearchList: Vue.ref([]), searchRecommendation: Vue.ref(null), isLoadingHotSearch: Vue.ref(false) }) },
      '~/utils/api': { default: { search: { getSearchSuggestion: (params, options) => new Promise((resolve, reject) => {
        pending.push({ params, options, resolve, reject })
        options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true })
      }) } } },
      '~/utils/debug': { debugLog() {} },
      '~/utils/linkNavigation': { hasNavigationModifier: () => false },
      '~/utils/liquidGlass': { vLiquidGlass: {} },
      '~/utils/messaging': { isExtensionContextInvalidatedError: () => false },
      '~/utils/searchHighlight': { sanitizeSearchHighlight: value => value },
      '~/utils/searchNavigation': { openSearchResults() {}, resolveSearchNavigationTarget: value => `https://www.bilibili.com/?keyword=${value}`, shouldUsePluginSearchResultsPage: () => true },
      '../SearchFocusOverlay.vue': { default: { render: () => null } },
      '../TagRemoveButton.vue': { default: Vue.defineComponent({ props: ['label', 'disabled'], emits: ['click'], setup: (props, { emit }) => () => Vue.h('button', { 'aria-label': props.label, 'disabled': props.disabled, 'onClick': event => emit('click', event) }, 'Remove') }) },
      './searchHistoryProvider': {
        getSearchHistory: async () => {
          const read = nextHistoryRead
          nextHistoryRead = undefined
          return read ? read() : history
        },
        addSearchHistory: async () => history,
        removeSearchHistory: async (value) => {
          if (failHistory)
            throw new Error('unconfirmed')
          return history = history.filter(item => item.value !== value)
        },
        clearAllSearchHistory: async () => {
          if (failHistory)
            throw new Error('unconfirmed')
          return history = []
        },
      },
    })
    const host = document.body.appendChild(document.createElement('div'))
    const props = Vue.reactive({ modelValue: '', searchBehavior: 'stay' })
    const app = Vue.createApp({ render: () => Vue.h(source, { ...props, 'onUpdate:modelValue': value => props.modelValue = value }) })
    app.component('ALink', { props: ['href'], setup: (props, { slots }) => () => Vue.h('a', { href: props.href }, slots.default?.()) })
    app.component('SkeletonBlock', { render: () => Vue.h('span') })
    app.config.globalProperties.$t = key => key
    app.config.errorHandler = error => errors.push(error)
    app.mount(host)
    return {
      host,
      props,
      settings,
      pending,
      errors,
      debounce,
      visibility,
      iframeActive,
      delayInput() { delayInput = true },
      failHistory(value) { failHistory = value },
      deferHistory(read) { nextHistoryRead = read },
      close() {
        app.unmount()
        host.remove()
      },
    }
  }

  check('review search UI: failed delete/clear keeps visible history and offers read retry without unhandled Vue errors', async () => {
    const fixture = await searchFixture()
    try {
      const input = fixture.host.querySelector('input')
      input.dispatchEvent(new FocusEvent('focus'))
      await flush()
      assert.equal(fixture.host.querySelectorAll('.history-item').length, 2)
      fixture.failHistory(true)
      fixture.host.querySelector('.history-item__remove').click()
      await flush()
      assert.equal(fixture.host.querySelectorAll('.history-item').length, 2)
      assert.ok(fixture.host.querySelector('[role="alert"]'))
      Array.from(fixture.host.querySelectorAll('button')).find(button => button.textContent.trim() === 'search_bar.clear_history').click()
      await flush()
      assert.equal(fixture.host.querySelectorAll('.history-item').length, 2)
      fixture.host.querySelector('.history-error button').click()
      await flush()
      assert.equal(fixture.host.querySelector('[role="alert"]'), null)
      input.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: document.body }))
      await flush()
      let finishRead
      fixture.deferHistory(() => new Promise((resolve) => {
        finishRead = resolve
      }))
      input.dispatchEvent(new FocusEvent('focus'))
      await flush()
      fixture.host.querySelector('.history-item__remove').click()
      await flush()
      assert.equal(fixture.host.querySelector('.history-error button').disabled, false, 'a write supersedes the old read loading state')
      finishRead([])
      await flush()
      assert.equal(fixture.host.querySelectorAll('.history-item').length, 2, 'the superseded read cannot replace the retained write-failure state')
      assert.ok(fixture.host.querySelector('[role="alert"]'))
      assert.equal(fixture.errors.length, 0)
    }
    finally { fixture.close() }
  })

  check('review search UI cancellation: IME waits for composition completion; new input/model and blur abort only obsolete suggestions', async () => {
    const fixture = await searchFixture()
    const input = fixture.host.querySelector('input')
    try {
      input.dispatchEvent(new FocusEvent('focus'))
      input.value = 'shi'
      input.dispatchEvent(new window.InputEvent('input', { isComposing: true, bubbles: true }))
      await flush()
      assert.equal(fixture.pending.length, 0)
      input.value = '时光'
      input.dispatchEvent(new window.CompositionEvent('compositionend', { bubbles: true }))
      await flush()
      assert.equal(fixture.pending.length, 1)
      input.value = '时光代理人'
      input.dispatchEvent(new window.InputEvent('input', { bubbles: true }))
      await flush()
      assert.equal(fixture.pending[0].options.signal.aborted, true)
      assert.equal(fixture.pending[1].options.signal.aborted, false)
      fixture.props.modelValue = 'external route'
      await flush()
      assert.equal(fixture.pending[1].options.signal.aborted, true)
      input.value = 'last'
      input.dispatchEvent(new window.InputEvent('input', { bubbles: true }))
      await flush()
      input.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: document.body }))
      await flush()
      assert.equal(fixture.pending[2].options.signal.aborted, true)
      input.dispatchEvent(new FocusEvent('focus'))
      input.value = 'resolved'
      input.dispatchEvent(new window.InputEvent('input', { bubbles: true }))
      await flush()
      fixture.pending[3].resolve({ code: 0, result: { tag: [{ value: 'answer', name: 'answer' }, { value: 'answer', name: 'answer' }] } })
      await flush()
      assert.equal(fixture.host.querySelectorAll('[role="option"]').length, 1)
      assert.equal(fixture.errors.length, 0)
    }
    finally { fixture.close() }
  })

  check('review search unmount: queued debounce callbacks cannot start a request after the real component is disposed', async () => {
    const fixture = await searchFixture()
    fixture.delayInput()
    const input = fixture.host.querySelector('input')
    input.value = 'delayed'
    input.dispatchEvent(new window.InputEvent('input', { bubbles: true }))
    assert.equal(fixture.debounce.length, 1)
    fixture.close()
    await fixture.debounce[0]()
    assert.equal(fixture.pending.length, 0)
  })

  check('review search activity: hidden bars and inactive hosts cancel suggestions without clearing the input draft', async () => {
    const fixture = await searchFixture()
    const input = fixture.host.querySelector('input')
    try {
      input.dispatchEvent(new FocusEvent('focus'))
      input.value = 'draft'
      input.dispatchEvent(new window.InputEvent('input', { bubbles: true }))
      await flush()
      fixture.props.active = false
      await flush()
      assert.equal(fixture.pending[0].options.signal.aborted, true)
      input.value = 'hidden draft'
      input.dispatchEvent(new window.InputEvent('input', { bubbles: true }))
      await flush()
      assert.equal(fixture.pending.length, 1)
      assert.equal(fixture.props.modelValue, 'hidden draft')
      fixture.props.active = true
      input.dispatchEvent(new FocusEvent('focus'))
      await flush()
      input.value = 'active'
      input.dispatchEvent(new window.InputEvent('input', { bubbles: true }))
      await flush()
      fixture.iframeActive.value = true
      await flush()
      assert.equal(fixture.pending[1].options.signal.aborted, true)
      assert.equal(fixture.errors.length, 0)
    }
    finally { fixture.close() }
  })

  check('review avatar reads: disposal aborts four active reads, settles every waiter and never starts the queued requests', async () => {
    const { createFavoriteAvatarLoader } = await import('../src/utils/favoriteAvatar')
    const requests = []
    const loader = createFavoriteAvatarLoader((mid, signal) => new Promise(resolve => requests.push({ mid, signal, resolve })))
    const readers = Array.from({ length: 8 }, (_, index) => loader.load(index + 1))
    assert.equal(requests.length, 4)
    loader.dispose()
    assert.ok(requests.every(request => request.signal.aborted))
    assert.ok((await Promise.all(readers)).every(value => value === undefined))
    requests.forEach(request => request.resolve('late-avatar'))
    await flush()
    assert.equal(requests.length, 4)
    assert.equal(loader.cacheSize, 0)
  })

  async function historyFixture(shared = {}) {
    const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://www.bilibili.com/', pretendToBeVisual: true })
    const { window } = dom
    const { document } = window
    const iframeMessage = await import('../src/utils/iframeMessage')
    const timers = new Map()
    let timer = 0
    const storage = shared.storage ?? new Map([['search_history:search_history', JSON.stringify([{ value: 'older', timestamp: 1 }, { value: 'newer', timestamp: 2 }])], ['search_history:unrelated', 'keep']])
    const calls = []
    let readFailure = false
    let writeFailure = false
    let hold = false
    const clock = {
      setTimeout: (callback) => {
        timers.set(++timer, callback)
        return timer
      },
      clearTimeout: id => timers.delete(id),
    }
    const respond = (frame, packet, value, id = packet.id) => window.dispatchEvent(new window.MessageEvent('message', { source: frame.contentWindow, origin: new URL(frame.src).origin, data: { type: 'COLS_RES', key: packet.key, id, value } }))
    const provider = await loadSourceModule('../src/components/SearchBar/searchHistoryProvider.ts', { '~/utils/iframeMessage': {
      ...iframeMessage,
      postMessageToIframe: (frame, packet) => {
        calls.push({ frame, packet })
        if (packet.type === 'COLS_GET') {
          if (!hold)
            queueMicrotask(() => respond(frame, packet, readFailure ? undefined : storage.get(packet.key) ?? null))
        }
        else {
          if (!writeFailure) {
            if (packet.type === 'COLS_SET')
              storage.set(packet.key, packet.value)
            if (packet.type === 'COLS_RM')
              storage.delete(packet.key)
          }
          queueMicrotask(() => respond(frame, packet, undefined))
        }
        return true
      },
    } }, { ...clock, DOMException: window.DOMException, document, navigator: { locks: shared.locks }, window: {
      addEventListener: window.addEventListener.bind(window),
      removeEventListener: window.removeEventListener.bind(window),
      ...clock,
    } })
    return {
      provider,
      calls,
      storage,
      timers,
      respond,
      readFailure(value) { readFailure = value },
      writeFailure(value) { writeFailure = value },
      hold(value) { hold = value },
      async mount() {
        await flush()
        document.querySelector('iframe[data-bewly-cols-storage]')?.dispatchEvent(new window.Event('load'))
        await flush()
      },
      close() {
        document.querySelectorAll('iframe[data-bewly-cols-storage]').forEach(frame => frame.remove())
        dom.window.close()
        assert.equal(timers.size, 0)
      },
    }
  }

  check('review search history: failed reads cannot overwrite native history; clear confirms only its own key and repeated searches move first', async () => {
    const fixture = await historyFixture()
    const { provider, calls, storage } = fixture
    const original = storage.get('search_history:search_history')
    try {
      fixture.readFailure(true)
      const failed = provider.addSearchHistory({ value: 'new', timestamp: 3 }).catch(error => error)
      await fixture.mount()
      assert.match(String(await failed), /read failed/)
      assert.equal(storage.get('search_history:search_history'), original)
      assert.equal(calls.filter(call => call.packet.type !== 'COLS_GET').length, 0)
      fixture.readFailure(false)
      storage.set('search_history:search_history', '{bad-json')
      await assert.rejects(provider.removeSearchHistory('older'), /Invalid search history/)
      assert.equal(storage.get('search_history:search_history'), '{bad-json')
      storage.set('search_history:search_history', original)
      const next = await provider.addSearchHistory({ value: 'older', timestamp: 4 })
      assert.equal(next[0].value, 'older')
      fixture.writeFailure(true)
      await assert.rejects(provider.clearAllSearchHistory(), /confirm/)
      assert.ok(storage.get('search_history:search_history'))
      fixture.writeFailure(false)
      assert.equal((await provider.clearAllSearchHistory()).length, 0)
      assert.equal(storage.has('search_history:search_history'), false)
      assert.equal(storage.get('search_history:unrelated'), 'keep')
      assert.equal((await provider.getSearchHistory()).length, 0, 'confirmed native null is a valid empty history')
    }
    finally { fixture.close() }
  })

  check('review search history correlation: stale responses do not settle a newer read, and a timed-out read never enables a write', async () => {
    const fixture = await historyFixture()
    const { provider, calls, timers, respond } = fixture
    fixture.hold(true)
    try {
      let settled = false
      const current = provider.getSearchHistory().then((value) => {
        settled = true
        return value
      })
      await fixture.mount()
      const { frame, packet } = calls.at(-1)
      respond(frame, packet, '[]', 'old-request')
      await flush()
      assert.equal(settled, false)
      respond(frame, packet, '[{"value":"actual","timestamp":1}]')
      assert.equal((await current)[0].value, 'actual')
      const mutation = provider.addSearchHistory({ value: 'never-write', timestamp: 2 }).catch(error => error)
      await flush()
      for (const callback of [...timers.values()]) callback()
      assert.match(String(await mutation), /timed out/)
      assert.equal(calls.filter(call => call.packet.type !== 'COLS_GET').length, 0)
    }
    finally { fixture.close() }
  })

  check('review search history tabs: two real provider instances share a browser lock and retain both edits', async () => {
    let tail = Promise.resolve()
    let active = 0
    let maximum = 0
    const locks = { request(name, _options, callback) {
      assert.equal(name, 'bewly:search-history')
      const task = tail.then(async () => {
        maximum = Math.max(maximum, ++active)
        try {
          return await callback()
        }
        finally { active-- }
      })
      tail = task.catch(() => {})
      return task
    } }
    const storage = new Map()
    const first = await historyFixture({ storage, locks })
    const second = await historyFixture({ storage, locks })
    try {
      const a = first.provider.addSearchHistory({ value: 'tab-a', timestamp: 1 })
      const b = second.provider.addSearchHistory({ value: 'tab-b', timestamp: 2 })
      await first.mount()
      await a
      await second.mount()
      await b
      assert.equal(maximum, 1)
      assert.deepEqual(JSON.parse(storage.get('search_history:search_history')).map(item => item.value), ['tab-b', 'tab-a'])
    }
    finally {
      first.close()
      second.close()
    }
  })

  check('review search history lock: a suspended holder cannot leave the current page waiting forever or trigger an unlocked write', async () => {
    const fixture = await historyFixture({ locks: { request: (_name, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })) } })
    try {
      const waiting = fixture.provider.addSearchHistory({ value: 'blocked', timestamp: 1 }).catch(error => error)
      await flush()
      for (const callback of [...fixture.timers.values()]) callback()
      assert.match(String(await waiting), /lock timed out/)
      assert.equal(fixture.calls.length, 0)
    }
    finally { fixture.close() }
  })

  check('review search history frame: a replaced source is never reused for private history', async () => {
    const fixture = await historyFixture()
    try {
      const first = fixture.provider.getSearchHistory()
      await fixture.mount()
      await first
      const oldFrame = fixture.calls[0].frame
      oldFrame.src = 'https://example.invalid/storage'
      const next = fixture.provider.getSearchHistory()
      await fixture.mount()
      await next
      assert.notEqual(fixture.calls.at(-1).frame, oldFrame)
      assert.equal(fixture.calls.at(-1).frame.src, 'https://s1.hdslb.com/bfs/seed/jinkela/short/cols/iframe.html')
    }
    finally { fixture.close() }
  })

  async function playerFixture(bodyReady = true) {
    const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: 'https://www.bilibili.com/video/BV1dpBoB7EMV/', pretendToBeVisual: true })
    const { window } = dom
    const { document } = window
    if (!bodyReady)
      document.body.remove()
    let deliveries = 0
    const errors = []
    const frames = new Map()
    let frame = 0
    const globals = {
      ...Object.fromEntries(['document', 'Node', 'Element', 'HTMLElement', 'HTMLVideoElement', 'ShadowRoot', 'location'].map(name => [name, window[name]])),
      window,
      getComputedStyle: window.getComputedStyle.bind(window),
      MutationObserver: class extends window.MutationObserver {
        constructor(callback) {
          super((records) => {
            deliveries++
            callback(records)
          })
        }
      },
      requestAnimationFrame: (callback) => {
        frames.set(++frame, callback)
        return frame
      },
      cancelAnimationFrame: id => frames.delete(id),
      console: { error: (...args) => errors.push(args) },
    }
    const media = await loadSourceModule('../src/utils/playerMedia.ts', { './videoMetadataBridge': { isNativeVideoComponentReady: () => true } }, globals)
    const lifecycle = await loadSourceModule('../src/contentScripts/playerDomLifecycle.ts', { '~/utils/playerMedia': media }, globals)
    const screenshot = await loadSourceModule('../src/contentScripts/videoScreenshotControl.ts', {
      'vue': Vue,
      '~/composables/useRouteState': { useRouteState: () => ({ href: window.location.href, navigationId: 0 }) },
      '~/logic': { settings: Vue.ref({ showVideoScreenshotButton: true, videoScreenshotShortcut: '', language: 'en' }) },
      '~/utils/i18n': { i18n: { global: { t: () => 'Screenshot' } } },
      '~/utils/main': { isVideoPlaybackPage: () => true },
      '~/utils/videoScreenshot': { videoScreenshotBusy: Vue.ref(false), captureVideoScreenshot() {}, handleVideoScreenshotShortcut() {} },
      './playerControlFit': { registerPlayerControlFit: () => ({ refresh() {}, dispose() {} }) },
      './playerControlTooltip': { createPlayerControlTooltip: () => document.createElement('span'), updatePlayerControlTooltip() {} },
      './playerDomLifecycle': lifecycle,
    }, globals)
    const markup = '<div id="playerWrap"><div id="bilibiliPlayer"><video></video><div class="bpx-player-control-bottom"><div class="bpx-player-control-bottom-right"><div class="bpx-player-ctrl-volume"><div class="bpx-player-ctrl-btn-icon"></div></div></div></div></div></div>'
    return { dom, document, lifecycle, screenshot, markup, errors, deliveries: () => deliveries }
  }

  check('review player boot: document_start subscriptions discover the body and late native controls', async () => {
    const fixture = await playerFixture(false)
    const stop = fixture.lifecycle.observePlayerDom(() => {})
    fixture.screenshot.initVideoScreenshotControl()
    try {
      const body = fixture.document.createElement('body')
      body.innerHTML = fixture.markup
      fixture.document.documentElement.append(body)
      await flush()
      assert.equal(body.querySelectorAll('.bewly-video-screenshot-control').length, 1)
    }
    finally {
      fixture.screenshot.stopVideoScreenshotControl()
      stop()
      fixture.dom.window.close()
    }
  })

  check('review player scope: bound players ignore unrelated subtree churn and survive moved/replaced ancestors', async () => {
    const fixture = await playerFixture()
    const { document, markup } = fixture
    const outside = document.body.appendChild(document.createElement('section'))
    const parent = document.body.appendChild(document.createElement('section'))
    parent.innerHTML = markup
    fixture.screenshot.initVideoScreenshotControl()
    try {
      await flush()
      const before = fixture.deliveries()
      for (let i = 0; i < 100; i++)
        outside.append(document.createElement('article'))
      await flush()
      assert.equal(fixture.deliveries() - before, 0, 'bound playback has no whole-document subtree observer')
      const newParent = document.body.appendChild(document.createElement('section'))
      newParent.append(parent.firstElementChild)
      parent.remove()
      await flush()
      const old = newParent.firstElementChild
      newParent.innerHTML = markup
      await flush()
      assert.equal(newParent.querySelectorAll('.bewly-video-screenshot-control').length, 1)
      const afterReplacement = fixture.deliveries()
      old.append(document.createElement('video'))
      await flush()
      assert.equal(fixture.deliveries(), afterReplacement)
    }
    finally {
      fixture.screenshot.stopVideoScreenshotControl()
      fixture.dom.window.close()
    }
  })

  check('review player consumers: one failing subscriber cannot block other controls or remain half-registered', async () => {
    const fixture = await playerFixture()
    fixture.document.body.innerHTML = fixture.markup
    let calls = 0
    let stopBad
    let stopGood
    try {
      stopBad = fixture.lifecycle.observePlayerDom(() => {
        throw new Error('isolated consumer failure')
      })
      stopGood = fixture.lifecycle.observePlayerDom(() => calls++)
      fixture.document.querySelector('#bilibiliPlayer').append(fixture.document.createElement('button'))
      await flush()
      assert.equal(calls, 2)
      assert.equal(fixture.errors.length, 2)
    }
    finally {
      stopBad?.()
      stopGood?.()
      fixture.dom.window.close()
    }
  })
}
