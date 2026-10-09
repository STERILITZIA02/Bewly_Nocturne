import assert from 'node:assert/strict'

import { loadSourceFunctions } from './sourceFunctionHarness'
import { loadSourceModule } from './sourceModuleHarness'

export function registerVisualConsistencyChecks(check, { Vue, compileComponent, flush }) {
  async function calendarPositioning(globals = {}) {
    return loadSourceModule('../src/composables/useAnchoredPopoverPosition.ts', {
      '@vueuse/core': await import('@vueuse/core'),
      '~/utils/floatingMenu': await import('../src/utils/floatingMenu'),
    }, {
      ...Vue,
      ResizeObserver: class { observe() {} disconnect() {} },
      ...globals,
    })
  }

  check('V26 navigation: user visits survive back/forward while normalization replaces and search state is preserved', async () => {
    const enums = await import('../src/enums/appEnums')
    const { HomeSubPage } = await import('../src/contentScripts/views/Home/types')
    const config = [HomeSubPage.ForYou, HomeSubPage.Weekly].map(page => ({ page, visible: true }))
    window.history.replaceState({ native: 'retained' }, '', '/?page=SearchResults&keyword=fixture&pn=3')
    const route = await loadSourceModule('../src/composables/useRouteState.ts', { vue: Vue })
    const settings = Vue.ref({ homePageTabVisibilityList: config, useSearchPageModeOnHomePage: true })
    settings.initializationState = Vue.ref('loaded')
    const module = await loadSourceModule('../src/composables/useHomePageRoute.ts', {
      'vue': Vue,
      '~/composables/useCurrentLocationHref': { useCurrentLocationHref: () => Vue.computed(() => route.useRouteState().href) },
      '~/composables/useRouteState': route,
      '~/enums/appEnums': enums,
      '~/logic': { settings },
      '~/utils/homeRoute': await import('../src/utils/homeRoute'),
      '~/utils/homeTabConfig': await import('../src/utils/homeTabConfig'),
    })
    const scope = Vue.effectScope()
    const state = scope.run(() => module.useHomePageRoute(() => enums.AppPage.Home, config))
    const traverse = direction => new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('history traversal did not finish')), 1000)
      window.addEventListener('popstate', () => {
        clearTimeout(timer)
        resolve()
      }, { once: true })
      window.history[direction]()
    })
    try {
      const length = window.history.length
      state.navigateToPage(enums.AppPage.History)
      state.navigateToPage(enums.AppPage.Favorites)
      assert.equal(window.history.length, length + 2)
      assert.equal(new URL(route.useRouteState().href).searchParams.get('page'), 'Favorites')
      assert.equal(window.location.search.includes('keyword'), false)
      assert.deepEqual(window.history.state, { native: 'retained' })
      await traverse('back')
      await flush()
      assert.equal(state.activatedPage.value, enums.AppPage.History)
      await traverse('back')
      await flush()
      assert.equal(state.activatedPage.value, enums.AppPage.SearchResults)
      assert.equal(new URL(window.location.href).searchParams.get('keyword'), 'fixture')
      assert.equal(new URL(window.location.href).searchParams.get('pn'), '3')
      await traverse('forward')
      await flush()
      assert.equal(state.activatedPage.value, enums.AppPage.History)
      state.navigateToPage(enums.AppPage.Home)
      const beforeTab = window.history.length
      state.navigateToHomeTab(HomeSubPage.Weekly)
      assert.equal(window.history.length, beforeTab + 1)
      assert.equal(new URL(window.location.href).searchParams.get('tab'), 'Weekly')
      const beforeNormalize = window.history.length
      settings.value.homePageTabVisibilityList[1].visible = false
      await flush()
      assert.equal(state.homeActivatedPage.value, HomeSubPage.ForYou)
      assert.equal(window.history.length, beforeNormalize, 'hiding a tab must not create a navigation entry')
      state.navigateToPage(enums.AppPage.Search)
      assert.equal(state.activatedPage.value, enums.AppPage.Home)
      assert.equal(window.history.length, beforeNormalize, 'integrated Search already at Home is a no-op')
    }
    finally {
      scope.stop()
      route.stopRouteObserver()
      window.history.replaceState({}, '', '/')
    }
  })

  check('V26 images: page images use their ancestor root; teleported images load and release from the viewport', async () => {
    const observers = []
    let subscriptions = 0
    class Observer {
      targets = new Set()
      constructor(callback, options) {
        this.callback = callback
        this.root = options.root
        observers.push(this)
      }

      observe(target) { this.targets.add(target) }
      unobserve(target) { this.targets.delete(target) }
      disconnect() { this.targets.clear() }
    }
    const Picture = await compileComponent('../src/components/LazyPicture.vue', {
      '~/utils/imageLoadQueue': {
        getImageLoadPriority: () => 0,
        subscribeImageLoadRoot: () => {
          subscriptions++
          return () => subscriptions--
        },
        enqueueImageLoad: (job) => {
          void job.start({ isCurrent: () => true })
          return { cancel() {}, isQueued: () => false }
        },
      },
    }, { globals: { IntersectionObserver: Observer } })
    const host = document.body.appendChild(document.createElement('div'))
    const viewport = document.body.appendChild(document.createElement('div'))
    const popup = document.body.appendChild(document.createElement('div'))
    const app = Vue.createApp({
      setup() {
        Vue.provide('BEWLY_APP', { mainAppRef: Vue.ref(host), scrollViewportRef: Vue.ref(viewport) })
        return () => [
          Vue.h(Vue.Teleport, { to: viewport }, Vue.h(Picture, { src: 'https://i0.hdslb.com/bfs/archive/page.jpg' })),
          Vue.h(Vue.Teleport, { to: popup }, Vue.h(Picture, { src: 'https://i0.hdslb.com/bfs/archive/popup.jpg' })),
        ]
      },
    })
    app.config.globalProperties.$t = key => key
    try {
      app.mount(host)
      await flush()
      const pagePicture = viewport.querySelector('picture')
      const popupPicture = popup.querySelector('picture')
      const pageObserver = observers.find(observer => observer.targets.has(pagePicture))
      const popupObserver = observers.find(observer => observer.targets.has(popupPicture))
      assert.equal(pageObserver.root, viewport)
      assert.equal(popupObserver.root, null)
      pageObserver.callback([{ target: pagePicture, isIntersecting: true }])
      popupObserver.callback([{ target: popupPicture, isIntersecting: true }])
      await flush()
      assert.equal(pagePicture.querySelector('img').getAttribute('src'), 'https://i0.hdslb.com/bfs/archive/page.jpg')
      assert.equal(popupPicture.querySelector('img').getAttribute('src'), 'https://i0.hdslb.com/bfs/archive/popup.jpg')
    }
    finally {
      app.unmount()
      assert.equal(subscriptions, 0)
      assert.ok(observers.every(observer => observer.targets.size === 0))
      host.remove()
      viewport.remove()
      popup.remove()
    }
  })

  check('V26 episodes: missing entries never become season links; actual API eps keep their destinations', async () => {
    const module = await loadSourceFunctions('../src/contentScripts/views/SearchResults/searchTransforms.ts', [
      'extractBangumiEpisodes',
      'resolveEpisodeNumber',
    ], { removeHighlight: value => String(value ?? '') })
    const data = module.extractBangumiEpisodes({ eps: [
      { id: 12, title: '第2话', url: 'https://www.bilibili.com/bangumi/play/ep12' },
      { ep_id: 16, title: '第6话' },
    ] })
    assert.equal(data.length, 2)
    assert.equal(data[1].url, 'https://www.bilibili.com/bangumi/play/ep16')
    const List = await compileComponent('../src/components/BangumiEpisodeList/BangumiEpisodeList.vue', {
      '@vueuse/core': { useResizeObserver() {} },
    })
    const episodes = Vue.ref([])
    const host = document.body.appendChild(document.createElement('div'))
    const app = Vue.createApp({ setup: () => () => Vue.h(List, { episodes: episodes.value }) })
    app.component('ALink', { props: ['href', 'type', 'stopPropagation'], setup: (props, { slots }) => () => Vue.h('a', { href: props.href, target: '_blank' }, slots.default?.()) })
    app.mount(host)
    try {
      assert.equal(host.querySelectorAll('a').length, 0)
      episodes.value = [{ id: '1', number: 1, title: 'Missing' }, ...data]
      await flush()
      const links = [...host.querySelectorAll('a')]
      assert.deepEqual(links.map(link => link.textContent.trim()), ['2', '6'])
      assert.deepEqual(links.map(link => link.href), Array.from(data, item => item.url))
      assert.ok(links.every(link => link.target === '_blank'))
    }
    finally {
      app.unmount()
      host.remove()
    }
  })

  check('V26 calendar: Escape closes from trigger or panel, preserves IME and restores focus without submitting', async () => {
    const DatePicker = await compileComponent('../src/contentScripts/views/SearchResults/components/DatePicker.vue', {
      'vue-i18n': { useI18n: () => ({ t: key => key }) },
      '../utils/localDate': await import('../src/contentScripts/views/SearchResults/utils/localDate'),
      '~/composables/useAnchoredPopoverPosition': await calendarPositioning(),
    })
    const host = document.body.appendChild(document.createElement('div'))
    const outside = document.body.appendChild(document.createElement('button'))
    const updates = []
    const app = Vue.createApp(DatePicker, { modelValue: '2026-09-17', 'onUpdate:modelValue': value => updates.push(value) })
    app.config.globalProperties.$t = key => key
    app.mount(host)
    const trigger = host.querySelector('.calendar-icon')
    const key = (target, isComposing = false) => target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', isComposing, bubbles: true, cancelable: true }))
    try {
      trigger.focus()
      trigger.click()
      await flush()
      assert.equal(trigger.getAttribute('aria-expanded'), 'true')
      key(trigger, true)
      await flush()
      assert.ok(host.querySelector('[role="dialog"]'))
      key(trigger)
      await flush()
      assert.equal(host.querySelector('[role="dialog"]'), null)
      assert.equal(document.activeElement, trigger)
      assert.deepEqual(updates, [])
      trigger.click()
      await flush()
      const day = host.querySelector('.day-cell.selected')
      day.focus()
      key(day)
      await flush()
      assert.equal(host.querySelector('[role="dialog"]'), null)
      assert.equal(document.activeElement, trigger)
      trigger.click()
      await flush()
      outside.focus()
      await flush()
      assert.equal(host.querySelector('[role="dialog"]'), null)
    }
    finally {
      app.unmount()
      host.remove()
      outside.remove()
    }
  })

  check('V26 calendar: shared positioning contains a short-window popup and releases observers and queued frames', async () => {
    const listeners = new Map()
    const frames = new Map()
    const observers = []
    let frameId = 0
    const positioning = await calendarPositioning({
      window: { innerWidth: 1100, innerHeight: 600, addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: (name, fn) => {
        if (listeners.get(name) === fn)
          listeners.delete(name)
      } },
      ResizeObserver: class {
        active = true
        constructor() { observers.push(this) }
        observe() {}
        disconnect() { this.active = false }
      },
      requestAnimationFrame(fn) {
        frames.set(++frameId, fn)
        return frameId
      },
      cancelAnimationFrame(id) { frames.delete(id) },
    })
    const DatePicker = await compileComponent('../src/contentScripts/views/SearchResults/components/DatePicker.vue', {
      'vue-i18n': { useI18n: () => ({ t: key => key }) },
      '../utils/localDate': await import('../src/contentScripts/views/SearchResults/utils/localDate'),
      '~/composables/useAnchoredPopoverPosition': positioning,
    })
    const host = document.body.appendChild(document.createElement('div'))
    const app = Vue.createApp(DatePicker, { modelValue: '2026-09-17' })
    app.config.globalProperties.$t = key => key
    app.mount(host)
    const trigger = host.querySelector('.calendar-icon')
    host.querySelector('.date-picker').getBoundingClientRect = () => ({ left: 465, right: 593, top: 222, bottom: 258, width: 128 })
    try {
      trigger.click()
      await flush()
      const popup = host.querySelector('[role="dialog"]')
      popup.getBoundingClientRect = () => ({ width: 280, height: 359 })
      listeners.get('resize')()
      for (const [id, fn] of frames) {
        frames.delete(id)
        fn()
      }
      assert.ok(Number.parseFloat(popup.style.top) >= 16)
      assert.ok(Number.parseFloat(popup.style.top) + 359 <= 584, 'the previously clipped footer fits the 600px viewport')
      assert.ok(Number.parseFloat(popup.style.left) >= 16)
      assert.ok(Number.parseFloat(popup.style.left) + 280 <= 1084)
      listeners.get('scroll')()
      assert.equal(frames.size, 1)
      trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
      await flush()
      assert.equal(host.querySelector('[role="dialog"]'), null)
      assert.equal(frames.size, 0)
      assert.equal(listeners.size, 0)
      assert.ok(observers.every(observer => !observer.active))
      assert.equal(document.activeElement, trigger)
    }
    finally {
      app.unmount()
      host.remove()
    }
  })

  check('V26 tooltip: clipped controls portal to the app surface and Escape still reaches the owning overlay', async () => {
    const Tooltip = await compileComponent('../src/components/Tooltip.vue')
    const host = document.body.appendChild(document.createElement('div'))
    const popup = document.body.appendChild(document.createElement('div'))
    let escapes = 0
    host.addEventListener('keydown', (event) => {
      if (event.key === 'Escape')
        escapes++
    })
    const app = Vue.createApp({
      setup() {
        Vue.provide('BEWLY_APP', { mainAppRef: Vue.ref(popup) })
        return () => Vue.h(Tooltip, { content: 'Action description', placement: 'top', teleport: true }, () => Vue.h('button', 'Action'))
      },
    })
    app.mount(host)
    try {
      const wrapper = host.querySelector('.b-tooltip-wrapper')
      const tip = popup.querySelector('[role="tooltip"]')
      wrapper.getBoundingClientRect = () => ({ left: 900, right: 932, top: 10, bottom: 42, width: 32, height: 32 })
      tip.getBoundingClientRect = () => ({ width: 140, height: 28 })
      host.querySelector('button').focus()
      await flush()
      assert.equal(host.querySelector('[role="tooltip"]'), null)
      assert.equal(tip.getAttribute('aria-hidden'), 'false')
      assert.equal(Number.parseFloat(tip.style.top), 50, 'top tooltip flips below near the viewport edge')
      assert.ok(Number.parseFloat(tip.style.left) + 140 <= window.innerWidth - 8)
      host.querySelector('button').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      await flush()
      assert.equal(tip.getAttribute('aria-hidden'), 'true')
      assert.equal(escapes, 1)
    }
    finally {
      app.unmount()
      assert.equal(popup.querySelector('[role="tooltip"]'), null)
      host.remove()
      popup.remove()
    }
  })

  check('V26 emotes: first-load skeleton matches the grid and existing packages stay available during refresh', async () => {
    const Picker = await compileComponent('../src/contentScripts/views/Notifications/whisper/PrivateEmotePicker.vue', {
      'vue-i18n': { useI18n: () => ({ t: key => key }) },
    })
    const packages = Vue.ref([])
    const loading = Vue.ref(true)
    const host = document.body.appendChild(document.createElement('div'))
    const app = Vue.createApp({ setup: () => () => Vue.h(Picker, { packages: packages.value, loading: loading.value }) })
    app.component('Button', { render: () => null })
    app.mount(host)
    try {
      assert.ok(host.querySelector('[role="status"] [data-bew-skeleton]'))
      assert.equal(host.querySelector('[role="tabpanel"]').getAttribute('aria-busy'), 'true')
      packages.value = [{ id: 'one', type: 'default', name: 'Known package', emotes: [{ id: 'one', text: 'Known', textOnly: true }] }]
      loading.value = false
      await flush()
      assert.equal(host.querySelectorAll('[data-bew-skeleton]').length, 0)
      assert.equal(host.querySelector('.private-emote-picker__item').textContent.trim(), 'Known')
      loading.value = true
      await flush()
      assert.equal(host.querySelectorAll('[data-bew-skeleton]').length, 0, 'refresh does not erase known emotes')
      assert.equal(host.querySelector('.private-emote-picker__item').textContent.trim(), 'Known')
    }
    finally {
      app.unmount()
      host.remove()
    }
  })

  check('Whisper emotes: package navigation restores its scroll origin and keyboard focus without selecting an emote', async () => {
    const Picker = await compileComponent('../src/contentScripts/views/Notifications/whisper/PrivateEmotePicker.vue', {
      'vue-i18n': { useI18n: () => ({ t: key => key }) },
    })
    const packages = Vue.ref(['first', 'second'].map(id => ({
      id,
      type: 'default',
      name: id,
      emotes: Array.from({ length: 80 }, (_, index) => ({ id: `${id}-${index}`, text: `${id}-${index}`, textOnly: true })),
    })))
    const selected = []
    const host = document.body.appendChild(document.createElement('div'))
    const app = Vue.createApp({ setup: () => () => Vue.h(Picker, { packages: packages.value, onSelect: value => selected.push(value) }) })
    app.component('Button', { render: () => null })
    app.mount(host)
    try {
      const body = host.querySelector('[role="tabpanel"]')
      const tabs = host.querySelectorAll('[role="tab"]')
      body.scrollTop = 420
      tabs[0].focus()
      tabs[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }))
      await flush()
      assert.equal(tabs[1].getAttribute('aria-selected'), 'true')
      assert.equal(document.activeElement, tabs[1])
      assert.equal(body.scrollTop, 0)
      assert.equal(selected.length, 0)
      body.scrollTop = 160
      packages.value = packages.value.map(pkg => ({ ...pkg, emotes: [...pkg.emotes] }))
      await flush()
      assert.equal(body.scrollTop, 160, 'refreshing the same package preserves the reading position')
      tabs[0].click()
      await flush()
      assert.equal(body.scrollTop, 0)
      host.querySelector('.private-emote-picker__item:last-child').click()
      assert.equal(selected[0].text, 'first-79')
    }
    finally {
      app.unmount()
      host.remove()
    }
  })

  check('V26 gallery identity: CDN shards deduplicate but unrelated hosts and GIF identities remain separate', async () => {
    const { getBilibiliImageResourceKey: key } = await import('../src/utils/bilibiliUrl')
    assert.equal(key('https://i2.hdslb.com/bfs/new_dyn/fixture.jpg'), key('http://i0.hdslb.com/bfs/new_dyn/fixture.jpg@640w.webp'))
    assert.equal(key('//i1.hdslb.com/bfs/new_dyn/fixture.webp'), key('https://i2.hdslb.com/bfs/new_dyn/fixture.jpg'))
    assert.notEqual(key('https://other.example/bfs/new_dyn/fixture.jpg'), key('https://i2.hdslb.com/bfs/new_dyn/fixture.jpg'))
    assert.notEqual(key('https://i2.hdslb.com/bfs/new_dyn/fixture.gif'), key('https://i2.hdslb.com/bfs/new_dyn/fixture.jpg'))
  })
}
