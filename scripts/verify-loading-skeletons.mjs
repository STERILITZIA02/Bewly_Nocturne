import assert from 'node:assert/strict'

import * as events from '../src/constants/globalEvents'
import * as constants from '../src/utils/bewlyWidescreen/constants'
import * as policy from '../src/utils/bewlyWidescreenPolicy'
import { loadSourceModule } from './sourceModuleHarness'

function frameClock() {
  let now = 0
  let id = 0
  const frames = new Map()
  return {
    frames,
    Date: { now: () => now },
    requestAnimationFrame: (callback) => {
      frames.set(++id, callback)
      return id
    },
    cancelAnimationFrame: id => frames.delete(id),
    step(ms = 16) {
      now += ms
      const batch = [...frames.values()]
      frames.clear()
      batch.forEach(callback => callback(now))
    },
  }
}

const rect = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height })

export function registerLoadingSkeletonChecks(check, { Vue, compileComponent, flush }) {
  check('loading: Opus initialization, delayed hide and reopen release their timers, observer and DOM', async () => {
    let id = 0
    const timers = new Map()
    const setTimer = (run, delay) => {
      timers.set(++id, { run, delay })
      return id
    }
    const listeners = new Map()
    const observers = []
    const rootClasses = document.documentElement.className
    const module = await loadSourceModule('../src/contentScripts/features/opusDetailDrawerLayout.ts', {
      '@iconify/vue': { Icon: {} },
      'vue': Vue,
      '~/constants/layout': await import('../src/constants/layout'),
      '~/styles/skeleton.scss?inline': { default: '[data-bew-skeleton] {}' },
      '~/utils/i18n': { i18n: { global: { t: key => key } } },
      '~/utils/iframeMessage': { getParentMessageData: () => undefined, postMessageToParent: () => true },
      '~/utils/main': { isInIframe: () => true },
    }, {
      location: new URL('https://www.bilibili.com/opus/123'),
      URLSearchParams,
      setTimeout: setTimer,
      clearTimeout: id => timers.delete(id),
      MutationObserver: class {
        constructor() { observers.push(this) }
        observe() { this.active = true }
        disconnect() { this.active = false }
      },
      window: {
        location: new URL('https://www.bilibili.com/opus/123'),
        innerWidth: 1440,
        setTimeout: setTimer,
        clearTimeout: id => timers.delete(id),
        addEventListener: (name, listener) => listeners.set(name, listener),
        removeEventListener: (name, listener) => {
          if (listeners.get(name) === listener)
            listeners.delete(name)
        },
      },
    })
    try {
      module.setupOpusDetailDrawerLayout()
      const first = document.querySelector('.bewly-opus-iframe-loading')
      assert.ok(first.querySelector('[data-bew-skeleton]'))
      const deadline = [...timers].find(([, timer]) => timer.delay === 10000)
      assert.ok(deadline)
      timers.delete(deadline[0])
      deadline[1].run()
      assert.ok(first.classList.contains('is-hide'))
      module.setupOpusDetailDrawerLayout()
      assert.equal(first.classList.contains('is-hide'), false)
      assert.equal(document.querySelectorAll('.bewly-opus-iframe-loading').length, 1)
      assert.equal([...timers.values()].some(timer => timer.delay === 200), false, 'reopen cancels the old fade removal')
      module.disposeOpusDetailDrawerLayout()
      assert.equal(timers.size, 0)
      assert.equal(listeners.size, 0)
      assert.ok(observers.every(observer => !observer.active))
      assert.equal(document.querySelector('.bewly-opus-iframe-loading'), null)
      assert.equal(document.getElementById('bewly-opus-drawer-layout'), null)
      module.setupOpusDetailDrawerLayout()
      assert.notEqual(document.querySelector('.bewly-opus-iframe-loading'), first)
      assert.equal(document.querySelectorAll('#bewly-opus-drawer-layout').length, 1)
      module.disposeOpusDetailDrawerLayout()
      assert.equal(timers.size, 0)
    }
    finally {
      module.disposeOpusDetailDrawerLayout()
      document.documentElement.className = rootClasses
    }
  })

  check('loading: playing does not dismiss an entering shell; measured overlay and resources follow the current page', async () => {
    const time = frameClock()
    const timers = new Map()
    let timerId = 0
    const session = { entering: true, current: null }
    const video = document.body.appendChild(document.createElement('video'))
    video.autoplay = true
    const loadingModule = await loadSourceModule('../src/utils/bewlyWidescreen/loading.ts', {
      '~/logic': { settings: { value: { bewlyWidescreenSidebarWidth: 400, bewlyWidescreenLayoutPriority: 'sidebar-first', bewlyWidescreenSidebarPosition: 'left' } } },
      '~/utils/bewlyWidescreenPolicy': policy,
      '~/utils/player': { getVideoElement: () => video },
      './constants': constants,
      './labels': { t: key => key },
      './loadingView': await import('../src/utils/bewlyWidescreen/loadingView'),
      './session': { session },
      './styles/loading': { injectLoadingStyle: () => document.head.appendChild(document.createElement('style')) },
    }, {
      ...time,
      setTimeout: (callback) => {
        timers.set(++timerId, callback)
        return timerId
      },
      clearTimeout: id => timers.delete(id),
      navigator: { userActivation: { hasBeenActive: true } },
    })
    const loading = loadingModule.createWidescreenLoading({ exit() {}, onPreparationTimeout() {} })
    try {
      loading.prepare(true)
      video.dispatchEvent(new Event('playing'))
      assert.equal(time.frames.size, 0, 'autoplay must not schedule the skeleton fade before the shell settles')
      const overlay = document.getElementById(constants.LOADING_ROOT_ID)
      assert.ok(overlay.querySelector('[data-bew-skeleton]'))
      assert.equal(overlay.dataset.sidebarPosition, 'left')
      assert.equal(overlay.style.getPropertyValue('--bewly-widescreen-sidebar-user-width'), `${policy.clampWidescreenSidebarWidth(400, window.innerWidth)}px`)
      session.entering = false
      session.current = {
        danmakuGlass: { getBoundingClientRect: () => rect(24, 690, 1100, 150) },
        sidebarEl: { getBoundingClientRect: () => rect(1140, 24, 400, 816) },
      }
      video.dispatchEvent(new Event('playing'))
      assert.equal(time.frames.size, 0)
      loading.alignToCurrentLayout()
      const controls = overlay.querySelector('.bewly-widescreen-loading-skeleton-controls')
      assert.equal(controls.style.top, '690px')
      assert.equal(controls.style.width, '1100px')
      loading.remove()
      time.step()
      assert.ok(overlay.classList.contains('is-leaving'))
      loading.reset()
      assert.equal(timers.size, 0)
      assert.equal(time.frames.size, 0)
      assert.equal(loading.hasOverlay, false)
      video.dispatchEvent(new Event('playing'))
      assert.equal(time.frames.size, 0, 'the listener is removed on exit')
    }
    finally {
      loading.reset()
      video.remove()
    }
  })

  check('loading: native controls wait for Shadow DOM layout to settle, then release the one-shot gate', async () => {
    const time = frameClock()
    const settings = { value: { alwaysUseDock: false, bewlyWidescreenCenterVideo: false } }
    const session = { current: null }
    const host = document.body.appendChild(document.createElement('div'))
    host.id = 'bewly'
    host.attachShadow({ mode: 'open' })
    const root = document.body.appendChild(document.createElement('section'))
    root.innerHTML = '<div class="frame"></div><aside></aside><div class="description"></div><div class="glass"></div><div class="bpx-player-container"><div class="bpx-player-control-wrap"><div class="bpx-player-control-bottom"><button>Play</button></div></div><div class="bpx-player-sending-bar"><div class="bpx-player-video-info">Online</div></div></div>'
    const player = root.querySelector('.bpx-player-container')
    const source = root.querySelector('.bpx-player-sending-bar')
    const controls = root.querySelector('.bpx-player-control-wrap')
    const buttons = root.querySelector('.bpx-player-control-bottom')
    buttons.style.display = 'flex'
    const viewers = source.firstElementChild
    root.getBoundingClientRect = () => rect(0, 0, 1440, 900)
    player.getBoundingClientRect = () => rect(0, 0, 1100, 860)
    controls.getBoundingClientRect = () => rect(0, 700, 1100, 55)
    buttons.getBoundingClientRect = () => rect(0, 720, 1100, 35)
    source.getBoundingClientRect = () => rect(0, 780, 1100, 36)
    viewers.getBoundingClientRect = () => rect(8, 780, 80, 36)
    const state = {
      root,
      playerEl: player,
      playerFrame: root.querySelector('.frame'),
      playerSlot: root.querySelector('.frame'),
      sidebarEl: root.querySelector('aside'),
      descriptionSlot: root.querySelector('.description'),
      danmakuGlass: root.querySelector('.glass'),
      danmakuDock: source,
      danmakuSourceHost: source,
      danmakuSemanticsSource: source,
      sidebarPosition: 'right',
      sidebarLayout: 'compact',
      controlsLayoutReady: false,
      playerPointerInside: true,
    }
    state.playerFrame.getBoundingClientRect = () => rect(0, 0, 1100, 860)
    state.sidebarEl.getBoundingClientRect = () => rect(1100, 0, 340, 860)
    state.danmakuGlass.getBoundingClientRect = () => rect(0, 700, 1100, 140)
    session.current = state
    const native = await loadSourceModule('../src/utils/bewlyWidescreen/nativeControls.ts', {
      '~/constants/globalEvents': events,
      '~/utils/bewlyWidescreen/constants': constants,
      '~/utils/bewlyWidescreen/session': { isWidescreenSidebarExpanded: () => false },
      '~/utils/bewlyWidescreenPolicy': policy,
      '~/utils/photoViewer': { isPhotoViewerOpen: () => false },
    })
    const geometry = await loadSourceModule('../src/utils/bewlyWidescreen/geometry.ts', {
      '~/logic': { settings },
      '~/utils/bewlyWidescreen/actionEffects': { scheduleActionGeometrySync() {} },
      '~/utils/bewlyWidescreen/constants': constants,
      '~/utils/bewlyWidescreen/description': { syncDescription() {} },
      '~/utils/bewlyWidescreen/nativeControls': native,
      '~/utils/bewlyWidescreen/nativeDom': { exitNativeMiniPlayer() {}, findMovable: () => null },
      '~/utils/bewlyWidescreen/session': { session },
      '~/utils/bewlyWidescreenPolicy': policy,
      '~/utils/player': { getVideoElement: () => null },
    }, {
      ...time,
      Event: window.Event,
      // JSDOM caches computed Shadow DOM styles across inline mutations; feed
      // the controlled layout direction while retaining real token reads.
      getComputedStyle: element => ({
        flexDirection: element.style.flexDirection,
        display: element.style.display,
        getPropertyValue: name => getComputedStyle(element).getPropertyValue(name),
      }),
    })
    let reveals = 0
    state.onInitialLayoutReady = () => reveals++
    try {
      geometry.schedulePlayerResizeSync(state)
      time.step()
      assert.equal(root.dataset.playerControlsReady, 'false')
      assert.equal(reveals, 0)
      assert.equal(time.frames.size, 0, 'missing native/Shadow DOM nodes must not cause an empty RAF loop')

      host.shadowRoot.innerHTML = '<div class="widescreen-docked"><div class="sidebar-content" style="display:flex;flex-direction:column"></div></div>'
      const auxiliary = host.shadowRoot.querySelector('.sidebar-content')
      let auxiliaryWidth = 168
      auxiliary.getBoundingClientRect = () => rect(96, 780, auxiliaryWidth, 36)
      geometry.schedulePlayerResizeSync(state)
      time.step(500)
      assert.equal(reveals, 0, 'unstyled/vertical controls cannot dismiss initialization')
      auxiliary.style.flexDirection = 'row'
      buttons.style.display = 'block'
      geometry.schedulePlayerResizeSync(state)
      time.step()
      assert.equal(time.frames.size, 0, 'positive native boxes without their flex CSS are still unready')
      assert.equal(state.controlsLayoutReady, false)
      buttons.style.display = 'flex'
      geometry.schedulePlayerResizeSync(state)
      time.step()
      assert.equal(document.body.style.getPropertyValue('--bewly-widescreen-aux-controls-width'), '176px')
      time.step(100)
      auxiliaryWidth = 124
      time.step()
      assert.equal(document.body.style.getPropertyValue('--bewly-widescreen-aux-controls-width'), '132px', 'reserve the rendered controls, not four assumed buttons')
      time.step(159)
      assert.equal(reveals, 0, 'a geometry change restarts the existing stability window')
      time.step(1)
      assert.equal(reveals, 1)
      assert.equal(root.dataset.playerControlsReady, 'true')
      assert.equal(root.dataset.playerControlsHidden, 'false')
      assert.equal(time.frames.size, 0, 'settled controls stop animation-frame measurements')
      geometry.schedulePlayerResizeSync(state)
      time.step()
      assert.equal(reveals, 1)

      geometry.resetControlsLayout(state)
      geometry.schedulePlayerResizeSync(state)
      time.step()
      auxiliary.style.flexDirection = 'column'
      time.step(200)
      assert.equal(state.controlsLayoutStableSince, undefined)
      auxiliary.style.flexDirection = 'row'
      geometry.schedulePlayerResizeSync(state)
      time.step()
      time.step(159)
      assert.equal(state.controlsLayoutReady, false, 'an interrupted layout cannot reuse its previous stable time')
      time.step(1)
      assert.equal(state.controlsLayoutReady, true)

      geometry.resetControlsLayout(state)
      settings.value.alwaysUseDock = true
      auxiliary.remove()
      geometry.schedulePlayerResizeSync(state)
      time.step()
      time.step(constants.READY_STABILITY_DELAY)
      assert.equal(state.controlsLayoutReady, true, 'the regular Dock mode does not wait for auxiliary buttons')
      assert.equal(document.body.style.getPropertyValue('--bewly-widescreen-aux-controls-width'), '0px')

      geometry.resetControlsLayout(state)
      state.onInitialLayoutReady = () => reveals++
      geometry.schedulePlayerResizeSync(state)
      time.step()
      session.current = null
      time.step(1000)
      assert.equal(reveals, 1, 'a late frame cannot reveal a departed page')
      session.current = state
      geometry.schedulePlayerResizeSync(state)
      geometry.clearPlayerResizeSync(state)
      assert.equal(time.frames.size, 0)
      assert.equal(state.onInitialLayoutReady, undefined)
    }
    finally {
      geometry.clearPlayerResizeSync(state)
      geometry.clearAuxiliaryControlGeometry()
      document.body.classList.remove(events.BEWLY_WIDESCREEN_CONTROLS_HIDDEN_CLASS)
      host.remove()
      root.remove()
    }
  })

  check('loading: Select retains known server labels, disables actions, and removes its placeholder on completion', async () => {
    const SkeletonBlock = await compileComponent('../src/components/SkeletonBlock.vue')
    const host = document.body.appendChild(document.createElement('div'))
    const Select = await compileComponent('../src/components/Select.vue', {
      '~/utils/dialogFocus': await import('../src/utils/dialogFocus'),
      '~/utils/selectOptionKey': await import('../src/utils/selectOptionKey'),
      '~/composables/useAppProvider': { useBewlyApp: () => ({ mainAppRef: Vue.ref(host) }) },
      '~/composables/useFloatingMenuPosition': { useFloatingMenuPosition: () => ({ position: Vue.ref({}), scheduleUpdate() {}, start() {}, stop() {} }) },
    })
    const props = Vue.reactive({ loading: true, modelValue: null, options: [{ value: 1, label: 'Enabled' }, { value: 0, label: 'Disabled' }] })
    const changes = []
    const app = Vue.createApp({ setup: () => () => Vue.h(Select, { ...props, onChange: value => changes.push(value) }) })
    app.component('SkeletonBlock', SkeletonBlock)
    app.config.globalProperties.$t = key => key
    try {
      app.mount(host)
      const trigger = host.querySelector('.select-trigger')
      assert.equal(trigger.disabled, true)
      assert.ok(host.querySelector('[data-bew-skeleton]'))
      trigger.click()
      await flush()
      assert.equal(host.querySelector('[role=listbox]'), null)
      props.modelValue = 1
      await flush()
      assert.match(trigger.textContent, /Enabled/)
      assert.equal(host.querySelectorAll('[data-bew-skeleton]').length, 1)
      props.loading = false
      await flush()
      assert.equal(trigger.disabled, false)
      assert.equal(host.querySelectorAll('[data-bew-skeleton]').length, 0)
      assert.match(trigger.textContent, /Enabled/)
      assert.deepEqual(changes, [], 'displaying authoritative data does not submit a mutation')
      trigger.click()
      await flush()
      assert.ok(host.querySelector('[role=listbox]'))
      props.loading = true
      await flush()
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      await flush()
      assert.equal(host.querySelector('[role=listbox]'), null)
    }
    finally {
      app.unmount()
      host.remove()
    }
  })

  check('loading: real list skeleton renders history gutters and the requested action count', async () => {
    const SkeletonBlock = await compileComponent('../src/components/SkeletonBlock.vue')
    const List = await compileComponent('../src/components/VideoListSkeleton.vue', { '~/components/SkeletonBlock.vue': { default: SkeletonBlock } })
    const host = document.body.appendChild(document.createElement('div'))
    const props = Vue.reactive({ history: true, actionCount: 1, count: 3 })
    const app = Vue.createApp({ setup: () => () => Vue.h(List, props) })
    try {
      app.mount(host)
      assert.equal(host.querySelectorAll('.bew-history-time-slot').length, 3)
      assert.equal(host.querySelectorAll('.video-list-skeleton__actions [data-bew-skeleton]').length, 3)
      props.history = false
      props.actionCount = 3
      await flush()
      assert.equal(host.querySelectorAll('.bew-history-time-slot').length, 0)
      assert.equal(host.querySelectorAll('.video-list-skeleton__actions [data-bew-skeleton]').length, 9)
      app.unmount()
      assert.equal(host.querySelectorAll('[data-bew-skeleton]').length, 0)
    }
    finally {
      host.remove()
    }
  })

  check('loading: SearchBar keeps the latest query busy and ignores blurred or unmounted completions', async () => {
    const pending = () => {
      let resolve
      const promise = new Promise(done => resolve = done)
      return { promise, resolve }
    }
    const histories = []
    const queries = []
    let releases = 0
    let hotLoads = 0
    const Search = await compileComponent('../src/components/SearchBar/SearchBar.vue', {
      '@vueuse/core': {
        onClickOutside() {},
        useDebounceFn: run => run,
        useElementBounding: () => ({ left: Vue.ref(0), top: Vue.ref(0) }),
        useMediaQuery: () => Vue.ref(false),
      },
      '~/constants/layout': await import('../src/constants/layout'),
      '~/logic': { settings: Vue.ref({ enableSearchHistory: true, showHotSearchInTopBar: true }) },
      '~/logic/searchExperience': {
        acquireSearchExperience: () => () => releases++,
        useSearchExperience: () => ({ hotSearchList: Vue.ref([]), searchRecommendation: Vue.ref(null), isLoadingHotSearch: Vue.ref(false) }),
        loadSharedHotSearch: async () => hotLoads++,
      },
      '~/utils/api': { default: { search: { getSearchSuggestion: ({ term }) => {
        const query = { ...pending(), term }
        queries.push(query)
        return query.promise
      } } } },
      '~/utils/debug': { debugLog() {} },
      '~/utils/messaging': { isExtensionContextInvalidatedError: () => false },
      '~/utils/searchHighlight': { sanitizeSearchHighlight: value => value },
      '~/utils/searchNavigation': { openSearchResults() {}, resolveSearchNavigationTarget: value => value },
      '../SearchFocusOverlay.vue': { default: {} },
      '../TagRemoveButton.vue': { default: {} },
      './searchHistoryProvider': {
        getSearchHistory: () => {
          const request = pending()
          histories.push(request)
          return request.promise
        },
        addSearchHistory() {},
        clearAllSearchHistory() {},
        removeSearchHistory() {},
      },
    }, { renderTemplate: false })
    let state
    const host = document.body.appendChild(document.createElement('div'))
    const app = Vue.createApp({ setup: () => () => Vue.h(Search, { ref: (value) => {
      if (value)
        state = value.$.setupState
    } }) })
    try {
      app.mount(host)
      state.isFocus = true
      await flush()
      assert.equal(state.historyLoading, true)
      state.isFocus = false
      await flush()
      state.isFocus = true
      await flush()
      histories[0].resolve([{ value: 'old', timestamp: 1 }])
      await flush()
      assert.equal(state.historyLoading, true, 'the old focus request cannot clear a new skeleton')
      assert.equal(hotLoads, 0, 'blurred history completion cannot initiate a hot-search load')
      histories[1].resolve([{ value: 'current', timestamp: 2 }])
      await flush()
      assert.equal(state.historyLoading, false)
      assert.equal(state.searchHistory[0].value, 'current')
      for (const value of ['old query', 'new query']) state.handleNativeInput({ target: { value } })
      assert.equal(state.suggestionsLoading, true)
      queries[0].resolve({ code: 0, result: { tag: [{ value: 'old', term: 'old' }] } })
      await flush()
      assert.equal(state.suggestionsLoading, true)
      assert.equal(state.suggestions.length, 0)
      queries[1].resolve({ code: 0, result: { tag: [{ value: 'new', term: 'new' }] } })
      await flush()
      assert.equal(state.suggestionsLoading, false)
      assert.equal(state.suggestions[0].value, 'new')
      state.handleNativeInput({ target: { value: 'blurred' } })
      state.isFocus = false
      await flush()
      assert.equal(state.suggestionsLoading, false)
      queries[2].resolve({ code: 0, result: { tag: [{ value: 'blurred' }] } })
      await flush()
      assert.equal(state.suggestions.length, 0)
      state.handleNativeInput({ target: { value: 'disposed' } })
      app.unmount()
      queries[3].resolve({ code: 0, result: { tag: [{ value: 'disposed' }] } })
      await flush()
      assert.equal(state.suggestions.length, 0)
      assert.equal(releases, 1)
    }
    finally { host.remove() }
  })
}
