import assert from 'node:assert/strict'

import { loadSourceModule } from './sourceModuleHarness'

export function registerUIAuditFixChecks(check, { Vue, compileComponent, flush }) {
  check('UI audit: isolated-world search commits the real route/outlet before any fallback timer or history write', async () => {
    window.history.replaceState({ retained: true }, '', '/?page=Home&tab=ForYou')
    const routeModule = await loadSourceModule('../src/composables/useRouteState.ts', { vue: Vue })
    const settings = Vue.ref({
      searchBarLinkOpenMode: 'currentTab',
      useSearchPageModeOnHomePage: true,
      homePageTabVisibilityList: [{ page: 'ForYou', visible: true }],
    })
    const enums = await import('../src/enums/appEnums')
    const homeModule = await loadSourceModule('../src/composables/useHomePageRoute.ts', {
      'vue': Vue,
      '~/composables/useCurrentLocationHref': { useCurrentLocationHref: () => Vue.computed(() => routeModule.useRouteState().href) },
      '~/enums/appEnums': enums,
      '~/logic': { settings },
      '~/utils/homeRoute': await import('../src/utils/homeRoute'),
      '~/utils/homeTabConfig': await import('../src/utils/homeTabConfig'),
    })
    const navigation = await loadSourceModule('../src/utils/searchNavigation.ts', {
      '~/composables/useRouteState': routeModule,
      '~/enums/appEnums': enums,
      '~/logic': { settings },
      '~/utils/configuredLinkNavigation': { getLinkFallbackPage: () => 'Home' },
      '~/utils/main': { isHomePage: href => new URL(href ?? window.location.href).pathname === '/', isInIframe: () => false },
      '~/utils/pageMode': {},
      '~/utils/searchNavigationCore': await import('../src/utils/searchNavigationCore'),
      './searchNavigationCore': await import('../src/utils/searchNavigationCore'),
      './searchUrl': await import('../src/utils/searchUrl'),
      '~/utils/tabs': {},
    })
    const scope = Vue.effectScope()
    const outlet = scope.run(() => homeModule.useHomePageRoute(() => enums.AppPage.Home, [{ page: 'ForYou', visible: true }]))
    const route = routeModule.useRouteState()
    const before = route.navigationId
    let finishHistory
    const pendingHistory = new Promise(resolve => finishHistory = resolve)
    try {
      // jsdom's pushState, like the extension's ISOLATED world, emits no MAIN
      // bridge event. The real shared route and outlet must still change now.
      navigation.openSearchResults('https://www.bilibili.com/?page=SearchResults&keyword=first', { persistHistory: () => pendingHistory })
      assert.match(route.href, /keyword=first/)
      assert.equal(outlet.activatedPage.value, enums.AppPage.SearchResults)
      assert.equal(route.navigationId, before + 1)
      assert.equal(window.history.state.retained, true)
      window.dispatchEvent(new Event('pushstate'))
      await flush()
      assert.equal(route.navigationId, before + 1, 'a later MAIN bridge notification is deduplicated')
      navigation.openSearchResults('https://www.bilibili.com/?page=SearchResults&keyword=second')
      assert.match(route.href, /keyword=second/)
      finishHistory()
      await flush()
      assert.match(route.href, /keyword=second/)
      assert.equal(route.navigationId, before + 2)
    }
    finally {
      scope.stop()
      routeModule.stopRouteObserver()
      window.history.replaceState({}, '', '/')
    }
  })

  check('UI audit: TopBar keyboard opens the existing popup, survives pointer leave, restores focus and cleans up', async () => {
    const timers = new Map()
    let timerId = 0
    const popupVisible = Vue.reactive({ history: false, favorites: false })
    const store = { popupVisible, closeAllPopups: except => Object.keys(popupVisible).forEach((key) => {
      if (key !== except)
        popupVisible[key] = false
    }) }
    const module = await loadSourceModule('../src/components/TopBar/composables/useTopBarInteraction.ts', {
      'vue': Vue,
      '@vueuse/core': { unrefElement: target => Vue.unref(target) },
      '~/components/TopBar/constants/urls': {},
      '~/composables/useAnchoredPopoverPosition': { useAnchoredPopoverPosition() {} },
      '~/composables/useAppProvider': { useBewlyApp: () => ({ activatedPage: Vue.ref('Home') }) },
      '~/composables/useCurrentLocationHref': { useCurrentLocationHref: () => Vue.ref(window.location.href) },
      '~/enums/appEnums': await import('../src/enums/appEnums'),
      '~/logic': { settings: Vue.ref({ touchScreenOptimization: false }) },
      '~/stores/settingsStore': { useSettingsStore: () => ({}) },
      '~/stores/topBarStore': { useTopBarStore: () => store },
      '~/utils/configuredLinkNavigation': {},
      '~/utils/main': {},
      '~/utils/searchNavigation': {},
      '~/utils/tabs': {},
    }, {
      setTimeout: (callback, delay) => {
        timers.set(++timerId, { callback, delay })
        return timerId
      },
      clearTimeout: id => timers.delete(id),
    })
    const host = document.body.appendChild(document.createElement('div'))
    const outside = document.body.appendChild(document.createElement('button'))
    const app = Vue.createApp({ setup() {
      const interaction = module.useTopBarInteraction()
      const refs = Object.fromEntries(Object.keys(popupVisible).map((key) => {
        const trigger = interaction.setupTopBarItemHoverEvent(key)
        const popup = Vue.ref()
        interaction.setupTopBarItemTransformer(key, popup)
        return [key, { trigger, popup }]
      }))
      return () => Object.entries(refs).map(([key, { trigger, popup }]) => Vue.h('div', { ref: trigger, 'data-key': key }, [
        Vue.h('a', { href: '#', class: 'top-bar-trigger' }, key),
        popupVisible[key] ? Vue.h('div', { ref: popup, class: 'bew-popover' }, [Vue.h('button', {}, `inside-${key}`)]) : null,
      ]))
    } })
    const runTimers = () => {
      const current = [...timers.values()]
      timers.clear()
      current.forEach(timer => timer.callback())
    }
    try {
      app.mount(host)
      await flush()
      const trigger = host.querySelector('[data-key="history"] a')
      trigger.focus()
      trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }))
      await flush()
      assert.equal(popupVisible.history, true)
      assert.equal(document.activeElement.textContent, 'inside-history')
      assert.equal(trigger.getAttribute('aria-expanded'), 'true')
      const popup = host.querySelector('#bew-topbar-popup-history')
      assert.equal(popup.dataset.instant, 'true')
      popup.dispatchEvent(new MouseEvent('mouseleave'))
      runTimers()
      assert.equal(popupVisible.history, true, 'pointer leave cannot dismiss the keyboard-owned popup')
      document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
      await flush()
      assert.equal(popupVisible.history, false)
      assert.equal(document.activeElement, trigger)
      trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }))
      await flush()
      outside.focus()
      await flush()
      assert.equal(popupVisible.history, false, 'leaving by Tab releases the popup')
      host.querySelector('[data-key="history"]').dispatchEvent(new MouseEvent('mouseenter'))
      assert.ok([...timers.values()].some(timer => timer.delay === 320))
      runTimers()
      await flush()
      host.querySelector('[data-key="favorites"]').dispatchEvent(new MouseEvent('mouseenter'))
      assert.ok([...timers.values()].some(timer => timer.delay === 0), 'adjacent popups open without a second hover delay')
      runTimers()
      await flush()
      assert.equal(popupVisible.favorites, true)
      assert.equal(popupVisible.history, false)
      app.unmount()
      assert.equal(timers.size, 0)
      trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
      assert.equal(popupVisible.history, false)
    }
    finally {
      if (host.childElementCount)
        app.unmount()
      host.remove()
      outside.remove()
    }
  })

  check('UI audit: settings radios support arrows and explicit control names override group labels', async () => {
    const Segmented = await compileComponent('../src/components/Settings/components/SettingsSegmentedControl.vue', {
      '~/components/LiquidSegmentIndicator.vue': { default: { render: () => null } },
    })
    const Radio = await compileComponent('../src/components/Radio.vue')
    const Slider = await compileComponent('../src/components/Slider.vue', { '~/utils/range': await import('../src/utils/range') })
    const model = Vue.ref('a')
    const host = document.body.appendChild(document.createElement('div'))
    const app = Vue.createApp({ setup: () => () => Vue.h('div', [
      Vue.h(Segmented, { modelValue: model.value, 'onUpdate:modelValue': value => model.value = value, label: 'Choices', options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] }),
      Vue.h(Radio, { modelValue: false, label: 'Show', accessibleLabel: 'History · Show', disabled: true }),
      Vue.h(Slider, { modelValue: 50, label: '50%', accessibleLabel: 'Two columns · Cover ratio' }),
    ]) })
    try {
      app.mount(host)
      const radios = [...host.querySelectorAll('[role="radio"]')]
      radios[0].focus()
      radios[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }))
      await flush()
      assert.equal(model.value, 'b')
      assert.equal(document.activeElement, radios[1])
      assert.equal(radios[1].getAttribute('aria-checked'), 'true')
      assert.equal(radios[0].tabIndex, -1)
      assert.equal(host.querySelector('input[type="checkbox"]').getAttribute('aria-label'), 'History · Show')
      assert.equal(host.querySelector('input[type="checkbox"]').disabled, true)
      assert.equal(host.querySelector('input[type="range"]').getAttribute('aria-label'), 'Two columns · Cover ratio')
    }
    finally {
      app.unmount()
      host.remove()
    }
  })

  check('UI audit: Weekly edition search supports focus, arrows, selection and Escape without replacing its request owner', async () => {
    const host = document.body.appendChild(document.createElement('div'))
    const requestedEditions = []
    const provider = { mainAppRef: Vue.ref(host), scrollViewportRef: Vue.ref(host), handlePageRefresh: Vue.ref(), handleBackToTop() {} }
    const Weekly = await compileComponent('../src/contentScripts/views/Home/components/Weekly.vue', {
      '~/components/VideoCardGrid.vue': { default: { render: () => null } },
      '~/composables/useAppProvider': { useBewlyApp: () => provider },
      '~/composables/useFloatingMenuPosition': { useFloatingMenuPosition: () => ({ position: Vue.ref({ top: 10, left: 10, width: 280, maxHeight: 400 }), start() {}, stop() {}, scheduleUpdate() {} }) },
      '~/composables/useHomeTabState': await import('../src/composables/useHomeTabState'),
      '~/constants/layout': await import('../src/constants/layout'),
      '~/logic': { settings: Vue.ref({ useSearchPageModeOnHomePage: true }) },
      '~/utils/api': { default: { ranking: {
        getPopularSeriesList: async () => ({ code: 0, data: { list: [{ number: 42, name: '42' }, { number: 41, name: '41' }] } }),
        getPopularSeriesOne: async ({ number }) => {
          requestedEditions.push(number)
          return { code: 0, data: { list: [] } }
        },
      } } },
      '~/utils/htmlDecode': { decodeHtmlEntities: text => text },
      '~/utils/messaging': { reportRuntimeFailure() {} },
    })
    const app = Vue.createApp(Weekly, { gridLayout: 'adaptive', topBarVisibility: true })
    app.config.globalProperties.$t = key => key
    try {
      app.mount(host)
      await flush()
      const trigger = host.querySelector('button[aria-expanded]')
      trigger.focus()
      trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }))
      await flush()
      const input = host.querySelector('.weekly-series-popover input')
      assert.equal(document.activeElement, input)
      input.value = '41'
      input.dispatchEvent(new Event('input', { bubbles: true }))
      await flush()
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }))
      assert.equal(document.activeElement.textContent.trim(), '41')
      document.activeElement.click()
      await flush()
      assert.equal(requestedEditions.at(-1), 41)
      assert.equal(document.activeElement, trigger)
      assert.equal(trigger.getAttribute('aria-expanded'), 'false')
      trigger.click()
      await flush()
      document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
      await flush()
      assert.equal(document.activeElement, trigger)
      assert.equal(trigger.getAttribute('aria-expanded'), 'false')
    }
    finally {
      app.unmount()
      host.remove()
    }
  })

  check('UI audit: destination persists plugin search history without delaying result mounting or reacting to a draft', async () => {
    window.history.replaceState({}, '', '/?page=SearchResults&keyword=committed')
    const href = Vue.ref(window.location.href)
    const writes = []
    const store = Vue.reactive({ searchKeyword: '', isLogin: false, userInfo: { mid: 0 } })
    const leaves = ['SearchCategoryTabs', 'SearchLiveFilters', 'SearchResultsPanel', 'SearchUserFilters', 'SearchVideoFilters']
    const SearchResults = await compileComponent('../src/contentScripts/views/SearchResults/SearchResults.vue', {
      'pinia': { storeToRefs: Vue.toRefs },
      'vue-i18n': { useI18n: () => ({ t: key => key }) },
      '~/components/SearchBar/searchHistoryProvider': { addSearchHistory: (item) => {
        writes.push(item.value)
        return new Promise(() => {})
      } },
      '~/composables/useAppProvider': { useBewlyApp: () => ({ handleReachBottom: Vue.ref(), handlePageRefresh: Vue.ref() }) },
      '~/composables/useCurrentLocationHref': { useCurrentLocationHref: () => href },
      '~/composables/useRouteState': { syncRouteState() {} },
      '~/logic': { settings: Vue.ref({ enableSearchHistory: true }) },
      '~/stores/topBarStore': { useTopBarStore: () => store },
      '~/utils/accountScope': { resolveAuthenticatedAccountId: () => null },
      '~/utils/messaging': { reportRuntimeFailure() {} },
      './utils/searchUrlState': await import('../src/contentScripts/views/SearchResults/utils/searchUrlState'),
      ...Object.fromEntries(leaves.map(name => [`./components/${name}.vue`, { default: { render: () => Vue.h('div', { 'data-page-part': name }) } }])),
    }, { globals: { URLSearchParams } })
    const host = document.body.appendChild(document.createElement('div'))
    const app = Vue.createApp(SearchResults)
    try {
      app.mount(host)
      await flush()
      assert.deepEqual(writes, ['committed'])
      assert.ok(host.querySelector('[data-page-part="SearchResultsPanel"]'))
      store.searchKeyword = 'unsubmitted draft'
      await flush()
      assert.deepEqual(writes, ['committed'])
      window.history.pushState({}, '', '/?page=SearchResults&keyword=next')
      href.value = window.location.href
      await flush()
      assert.deepEqual(writes, ['committed', 'next'])
    }
    finally {
      app.unmount()
      host.remove()
      window.history.replaceState({}, '', '/')
    }
  })

  check('UI audit: UnoCSS layout keeps the 4px grid independently of the 15px body size', async () => {
    const { createGenerator } = await import('unocss')
    const config = (await import('../unocss.config')).default
    const generator = await createGenerator(config)
    const { css } = await generator.generate('p-4 gap-2 py-1 text-base -mt-2 w-10', { preflights: false })
    assert.match(css, /padding:var\(--bew-space-4\)/)
    assert.match(css, /gap:var\(--bew-space-2\)/)
    assert.match(css, /padding-top:var\(--bew-space-1\)/)
    assert.match(css, /font-size:var\(--bew-font-size-body\)/)
    assert.doesNotMatch(css, /calc\(var\(--bew-base-font-size\) \* (?:0\.25|0\.5|1)\)/)
  })
}
