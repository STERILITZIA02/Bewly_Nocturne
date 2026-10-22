import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import { compileStyleAsync, parse } from 'vue/compiler-sfc'

import { loadSourceFunctions } from './sourceFunctionHarness'
import { loadSourceModule } from './sourceModuleHarness'

export function registerNotificationUIChecks(check, { Vue, compileComponent, flush }) {
  const i18n = { useI18n: () => ({ t: key => key, locale: Vue.ref('cmn-CN') }) }

  check('Mono charts preserve fractional values, bound mark counts and leave unknown or zero empty', async () => {
    const { chartRungs, chartUnit } = await import('../src/utils/chartScale')
    assert.deepEqual(chartRungs(null, 1), [])
    assert.deepEqual(chartRungs(0, 1), [])
    assert.deepEqual(chartRungs(-1, 1), [])
    assert.deepEqual(chartRungs(12.5, 5), [1, 1, 0.5])
    assert.equal(chartRungs(65, 1, 100).length, 65)
    assert.equal(chartRungs(53.3, 1, 100).length, 54)
    assert.ok(Math.abs(chartRungs(53.3, 1, 100).at(-1) - 0.3) < 0.001)
    for (const value of [1, 19, 101, 12345, 1e9]) {
      const unit = chartUnit(value)
      const marks = chartRungs(value, unit)
      assert.ok(marks.length <= 20)
      assert.ok(Math.abs(marks.reduce((sum, mark) => sum + mark, 0) * unit - value) < 0.001)
    }
  })

  check('inbox insights distinguish unknown counts, preserve source order and expose navigation/read actions', async () => {
    const { getMessageInsights, getRecentConversationActivity } = await import('../src/contentScripts/views/Notifications/whisper/messageInsights')
    assert.equal(getMessageInsights([], {}, {}).total, null)
    assert.equal(getMessageInsights([], { reply: 0, at: 0, like: 0, sys_msg: 0 }, { follow_unread: 0, unfollow_unread: 0 }).total, 0)
    const sessions = [{ key: '1:2', talkerId: '2', name: 'Alice', timestamp: 1700000000000000, unreadCount: 2, pinned: true, muted: false }, { key: '1:3', talkerId: '3', name: 'Bob', timestamp: 1700000100000000, unreadCount: 0, pinned: false, muted: true }]
    const topBar = Vue.reactive({ unReadMessage: { reply: 1, at: 2, like: 3, recv_like: 4, sys_msg: 5 }, unReadDm: { follow_unread: 2, unfollow_unread: 1 } })
    const data = getMessageInsights(sessions, topBar.unReadMessage, topBar.unReadDm)
    assert.equal(data.total, 15)
    assert.deepEqual(data.recent.map(item => item.name), ['Bob', 'Alice'])
    assert.deepEqual(sessions.map(item => item.name), ['Alice', 'Bob'])
    assert.equal(data.pinned, 1)
    assert.equal(data.muted, 1)
    const now = new Date(2026, 9, 11, 12).getTime()
    const activity = getRecentConversationActivity([
      { timestamp: now * 1000, followed: true },
      { timestamp: now * 1000, followed: false },
      { timestamp: new Date(2026, 9, 5, 10).getTime() * 1000, followed: true },
      { timestamp: new Date(2026, 9, 4, 10).getTime() * 1000, followed: true },
      { timestamp: (now + 10000) * 1000, followed: true },
    ], now)
    assert.equal(activity.length, 7)
    assert.equal(activity[0].followed, 1)
    assert.equal(activity[6].followed, 1)
    assert.equal(activity[6].unfollowed, 1)
    assert.equal(activity.reduce((sum, day) => sum + day.followed + day.unfollowed, 0), 3)
    const Insights = await compileComponent('../src/contentScripts/views/Notifications/whisper/ConversationInsights.vue', {
      'vue-i18n': i18n,
      '~/stores/topBarStore': { useTopBarStore: () => topBar },
    })
    const selections = []
    let writes = 0
    const readAll = { state: Vue.reactive({ status: 'idle' }), markAllRead() {
      writes++
      this.state.status = 'running'
    } }
    const host = document.body.appendChild(document.createElement('div'))
    const app = Vue.createApp({ render: () => Vue.h(Insights, { sessions, loaded: true, readAll, onSelectView: view => selections.push(view), onSelectSession: session => selections.push(session.key) }) })
    try {
      app.mount(host)
      await flush()
      assert.equal(host.querySelectorAll('.conversation-insights__ring-primary').length, 67)
      assert.equal(host.querySelectorAll('.conversation-insights__proportion line').length, 100)
      assert.equal(host.querySelectorAll('.message-activity-chart__sample').length, 14)
      assert.equal(writes, 0)
      assert.equal(host.querySelector('time').dateTime, new Date(sessions[1].timestamp / 1000).toISOString())
      host.querySelector('.conversation-insights__notification').click()
      host.querySelector('.conversation-insights__session').click()
      assert.deepEqual(selections, ['reply', '1:3'])
      host.querySelector('.conversation-insights__mark-read').click()
      await flush()
      assert.equal(writes, 1)
      assert.equal(host.querySelector('.conversation-insights__mark-read').disabled, true)
      readAll.state.status = 'partial'
      await flush()
      assert.match(host.querySelector('[role="status"]').textContent, /read_partial/)
      readAll.state.status = 'success'
      Object.assign(topBar.unReadMessage, { reply: 0, at: 0, like: 0, recv_like: 0, sys_msg: 0 })
      Object.assign(topBar.unReadDm, { follow_unread: 0, unfollow_unread: 0 })
      await flush()
      assert.equal(host.querySelector('[role="status"]'), null)
      assert.equal(host.querySelector('.conversation-insights__mark-read').disabled, true)
      assert.equal(host.querySelectorAll('.chart-rungs rect').length, 0)
      assert.equal(host.querySelectorAll('.conversation-insights__ring-primary').length, 0)
    }
    finally {
      app.unmount()
      host.remove()
    }
  })

  check('mark all read paginates beyond loaded sessions, deduplicates ACKs and cancels stale account writes', async () => {
    const { useMarkAllMessagesRead } = await import('../src/contentScripts/views/Notifications/composables/useMarkAllMessagesRead')
    const row = (id, ts) => ({ talker_id: id, session_type: 1, top_ts: 0, session_ts: ts, unread_count: 2, ack_seqno: '0', max_seqno: '90071992547409930' })
    const mid = Vue.ref('1')
    const scope = Vue.effectScope()
    const reads = []
    const acks = []
    const local = []
    const sections = []
    let rejectAck = false
    let syncs = 0
    let pendingFetch
    const controller = scope.run(() => useMarkAllMessagesRead(mid, {
      active: () => true,
      currentAccount: () => mid.value,
      wait: async () => {},
      fetchSessions: async (endTs) => {
        reads.push(endTs)
        if (pendingFetch)
          return pendingFetch
        return { code: 0, data: endTs === undefined ? { has_more: 1, session_list: [row('2', 200)] } : { has_more: 0, session_list: [row('2', 200), row('3', 100)] } }
      },
      ackSession: async (session) => {
        acks.push(session.talker_id)
        return { code: rejectAck ? -412 : 0 }
      },
      sessionRead: session => local.push(session.talker_id),
      markNotification: async (section) => {
        sections.push(section)
        return true
      },
      syncUnread: async () => { syncs++ },
    }))
    try {
      assert.equal(acks.length, 0)
      await Promise.all([controller.markAllRead(), controller.markAllRead()])
      assert.deepEqual(reads, [undefined, 200])
      assert.deepEqual(acks, ['2', '3'])
      assert.deepEqual(local, ['2', '3'])
      assert.deepEqual(sections, ['reply', 'at', 'love', 'system'])
      assert.equal(syncs, 1)
      assert.equal(controller.state.status, 'success')
      rejectAck = true
      await controller.markAllRead()
      assert.equal(controller.state.status, 'partial')
      assert.deepEqual(local, ['2', '3'], 'a rejected ACK must not clear local unread')
      assert.equal(acks.length, 3, 'risk-control rejection stops the write sequence')
      let resolveFetch
      pendingFetch = new Promise((resolve) => {
        resolveFetch = resolve
      })
      const pending = controller.markAllRead()
      await flush()
      mid.value = 'other'
      resolveFetch({ code: 0, data: { has_more: 0, session_list: [row('4', 10)] } })
      await pending
      assert.equal(acks.length, 3)
      assert.equal(controller.state.status, 'idle')
    }
    finally {
      scope.stop()
    }
  })

  check('notification skeleton uses CSS columns without a layout observer per placeholder', async () => {
    const path = '../src/contentScripts/views/Notifications/components/NativeNotificationFeedSkeleton.vue'
    const source = await readFile(new URL(path, import.meta.url), 'utf8')
    assert.doesNotMatch(source, /MasonryGrid|ResizeObserver|getBoundingClientRect/)
    const Skeleton = await compileComponent(path)
    const host = document.body.appendChild(document.createElement('div'))
    const app = Vue.createApp(Skeleton, { label: 'Loading', count: 6 })
    try {
      app.mount(host)
      await flush()
      assert.equal(host.querySelectorAll('.native-notification-feed-skeleton__item').length, 6)
      assert.ok(host.querySelector('.native-notification-grid[role="status"]'))
    }
    finally {
      app.unmount()
      host.remove()
    }
  })

  check('history search status keeps one accessible pause/resume control without scan counts or skeletons', async () => {
    const Results = await compileComponent('../src/contentScripts/views/Notifications/whisper/PrivateHistorySearchResults.vue', { vue: Vue, 'vue-i18n': i18n })
    const state = Vue.reactive({ query: 'needle', results: [], visibleResultCount: 50, running: true, complete: false, limited: false, error: false, batch: 1, scannedMessages: 12345, skippedSessions: 0 })
    const controller = {
      state,
      selectedIndex: Vue.ref(-1),
      filteredResults: Vue.computed(() => state.results),
      stop() { state.running = false },
      resume() { state.running = true },
    }
    const host = document.body.appendChild(document.createElement('div'))
    const app = Vue.createApp({ render: () => Vue.h(Results, { controller, query: 'needle' }) })
    app.component('Button', { props: ['type', 'size'], setup: (_props, { slots }) => () => Vue.h('button', slots.default?.()) })
    try {
      app.mount(host)
      await flush()
      const toggle = host.querySelector('.private-history-results__search-toggle')
      assert.ok(toggle)
      assert.match(toggle.textContent, /search.progress/)
      assert.match(toggle.getAttribute('aria-label'), /search.stop/)
      assert.equal(host.querySelector('[data-bew-skeleton]'), null)
      assert.equal(host.textContent.includes('12345'), false)
      assert.equal(toggle.closest('.private-history-results__list'), null, 'the control must stay outside the changing scrollable result list')
      toggle.click()
      await flush()
      assert.equal(state.running, false)
      assert.match(toggle.textContent, /search.continue/)
      assert.equal(toggle.classList.contains('private-history-results__search-toggle--running'), false)
      toggle.click()
      await flush()
      assert.equal(state.running, true)
      assert.equal(host.querySelector('.private-history-results__search-toggle'), toggle, 'retain the button and keyboard focus across pause/resume')
      state.complete = true
      state.running = false
      await flush()
      assert.equal(host.querySelector('.private-history-results__search-toggle'), null)
      assert.equal(host.textContent.includes('12345'), false)
    }
    finally {
      app.unmount()
      host.remove()
    }
  })

  check('message wheel: keyboard previews without reading feeds, commits explicitly, and keeps one tab stop', async () => {
    const Wheel = await compileComponent('../src/components/WheelSelector.vue', { vue: Vue })
    const value = Vue.ref('whisper')
    const updates = []
    const items = ['whisper', 'reply', 'at', 'love', 'system'].map(value => ({ value, label: value, ariaLabel: value, badge: value === 'reply' ? 123 : 0 }))
    const host = document.body.appendChild(document.createElement('div'))
    const app = Vue.createApp({ render: () => Vue.h(Wheel, {
      modelValue: value.value,
      items,
      label: 'Messages',
      panelId: 'fixture-panel',
      'onUpdate:modelValue': (next) => {
        value.value = next
        updates.push(next)
      },
    }) })
    try {
      app.mount(host)
      await flush()
      const tabs = [...host.querySelectorAll('[role="tab"]')]
      const targetStyle = tabs[1].getAttribute('style')
      tabs[1].focus()
      await flush()
      assert.equal(tabs[1].getAttribute('style'), targetStyle, 'pointer focus must not move the hit target before click')
      assert.equal(value.value, 'whisper')
      assert.equal(tabs.length, 5)
      assert.equal(tabs.filter(tab => tab.tabIndex === 0).length, 1)
      assert.equal(host.querySelector('.wheel-selector__badge').textContent.trim(), '99+')
      tabs[0].focus()
      tabs[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }))
      await flush()
      assert.equal(document.activeElement, tabs[1])
      assert.equal(value.value, 'whisper', 'focus alone must not mark intermediate categories as read')
      tabs[1].click()
      await flush()
      assert.deepEqual(updates, ['reply'])
      assert.equal(tabs[1].getAttribute('aria-selected'), 'true')
      assert.equal(tabs[1].getAttribute('aria-controls'), 'fixture-panel')
      tabs[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true }))
      await flush()
      assert.equal(document.activeElement, tabs[4])
      assert.equal(value.value, 'reply')
      tabs[4].click()
      await flush()
      assert.equal(value.value, 'system')
      const blocked = new KeyboardEvent('keydown', { key: 'ArrowUp', ctrlKey: true, bubbles: true, cancelable: true })
      tabs[4].dispatchEvent(blocked)
      await flush()
      assert.equal(blocked.defaultPrevented, false)
      assert.equal(document.activeElement, tabs[4])
      value.value = 'at'
      await flush()
      assert.equal(tabs[2].tabIndex, 0, 'route-driven changes reposition the same options')
      assert.equal(host.querySelectorAll('[role="tab"][tabindex="0"]').length, 1)
      const wheel = async (deltaY, timeStamp) => {
        const event = new window.WheelEvent('wheel', { deltaY, bubbles: true, cancelable: true })
        Object.defineProperty(event, 'timeStamp', { value: timeStamp })
        host.querySelector('.wheel-selector').dispatchEvent(event)
        await flush()
      }
      await wheel(60, 1000)
      assert.equal(value.value, 'love')
      await wheel(4, 1100)
      await wheel(4, 1200)
      assert.equal(value.value, 'love', 'small inertial tails cannot advance another category')
      await wheel(60, 1300)
      assert.equal(value.value, 'system', 'a sustained deliberate gesture can keep advancing')
      await wheel(-60, 1310)
      assert.equal(value.value, 'love', 'reversing direction responds immediately during the current transition')
    }
    finally {
      app.unmount()
      host.remove()
    }
  })

  check('notification scroll: mounted feeds own independent viewports and save only their category on unmount', async () => {
    const root = '../src/contentScripts/views/Notifications/'
    const blank = { render: () => null }
    const controller = {
      accountMid: Vue.ref('1'),
      states: Object.fromEntries(['reply', 'at'].map(section => [section, Vue.reactive({ items: [], loaded: true, noMore: true, scrollTop: 0 })])),
      getReadCandidate: () => null,
      refresh: async () => {},
    }
    const Feed = await compileComponent(`${root}components/NativeNotificationFeed.vue`, {
      'vue-i18n': i18n,
      '~/stores/topBarStore': { useTopBarStore: () => ({ unReadMessage: {} }) },
      '~/utils/notificationRoute': await import('../src/utils/notificationRoute'),
      '../notificationFeedPolicy': await import(`${root}notificationFeedPolicy`),
      '../notificationReadReconciliation': await import(`${root}notificationReadReconciliation`),
      '../notificationTimings': await import(`${root}notificationTimings`),
      './NativeNotificationFeedSkeleton.vue': { default: blank },
      './NativeNotificationItem.vue': { default: blank },
      './NativeSystemNotificationItem.vue': { default: blank },
    })
    const category = Vue.ref('reply')
    const outer = document.body.appendChild(document.createElement('div'))
    outer.scrollTop = 900
    let instance
    const app = Vue.createApp({ render: () => Vue.h(Feed, {
      key: category.value,
      section: category.value,
      accountState: 'ready',
      active: false,
      controller,
      ref: value => instance = value,
    }) })
    app.component('Empty', blank)
    app.component('ALink', blank)
    app.component('Button', blank)
    try {
      app.mount(outer)
      await flush()
      const first = outer.querySelector('.native-notification-feed')
      first.scrollTop = 180
      category.value = 'at'
      await flush()
      assert.equal(controller.states.reply.scrollTop, 180)
      assert.equal(controller.states.at.scrollTop, 0)
      const second = outer.querySelector('.native-notification-feed')
      assert.notEqual(second, first)
      assert.equal(outer.scrollTop, 900, 'category switches do not scroll the page or sidebar')
      second.scrollTop = 240
      second.scrollTo = ({ top }) => second.scrollTop = top
      await instance.refresh()
      assert.equal(second.scrollTop, 0, 'manual refresh resets only the current feed')
      assert.equal(controller.states.reply.scrollTop, 180)
      assert.equal(outer.scrollTop, 900)
      second.scrollTop = 320
      app.unmount()
      assert.equal(controller.states.at.scrollTop, 320)
    }
    finally {
      if (outer.firstChild)
        app.unmount()
      outer.remove()
    }
  })

  check('notification routing: departing page preserves hot/history search destinations and legacy message settings still normalize', async () => {
    const previousUrl = window.location.href
    const previousState = window.history.state
    const previousTitle = document.title
    const enums = await import('../src/enums/appEnums')
    const notificationRoute = await import('../src/utils/notificationRoute')
    window.history.replaceState({ nativeData: 'retained' }, '', notificationRoute.buildBewlyNotificationUrl('whisper'))
    const settings = Vue.ref({ dockPosition: 'bottom', pageMode: 'bewly', usePluginSearchResultsPage: true, dockItemsConfig: [], homePageTabVisibilityList: [], searchBarLinkOpenMode: 'currentTab', useSearchPageModeOnHomePage: true })
    settings.initializationState = Vue.ref('loaded')
    const route = await loadSourceModule('../src/composables/useRouteState.ts', { vue: Vue })
    const href = await loadSourceModule('../src/composables/useCurrentLocationHref.ts', { 'vue': Vue, './useRouteState': route })
    const home = await loadSourceModule('../src/composables/useHomePageRoute.ts', {
      'vue': Vue,
      '~/composables/useCurrentLocationHref': href,
      '~/composables/useRouteState': route,
      '~/enums/appEnums': enums,
      '~/logic': { settings },
      '~/utils/homeRoute': await import('../src/utils/homeRoute'),
      '~/utils/homeTabConfig': await import('../src/utils/homeTabConfig'),
    })
    const scope = Vue.effectScope()
    const shell = scope.run(() => home.useHomePageRoute(() => 'Home', [{ page: 'ForYou', visible: true }]))
    const openedSettings = []
    const provider = { ...shell, handlePageRefresh: Vue.ref(), scrollViewportRef: Vue.ref(), openSettingsAt: target => openedSettings.push(target) }
    const blank = { render: () => null }
    const sessions = { state: Vue.reactive({ items: [], loaded: false }), selectedTalkerId: Vue.ref(''), selectedSessionKey: Vue.ref(''), clearSelectedSession() {} }
    const component = await compileComponent('../src/contentScripts/views/Notifications/Notifications.vue', {
      '~/utils/userRelation': { changeUserRelation() {} },
      './whisper/usePrivateSessionActions': { privateSessionActionsKey: Symbol('session-actions-fixture'), usePrivateSessionActions: () => ({ state: {} }) },
      'vue-i18n': i18n,
      '~/composables/useAppProvider': { useBewlyApp: () => provider },
      '~/composables/useRouteState': route,
      '~/constants/layout': await import('../src/constants/layout'),
      '~/enums/appEnums': enums,
      '~/logic': { settings, localSettings: Vue.ref({}) },
      '~/stores/topBarStore': { useTopBarStore: () => ({ userInfo: { mid: 0 }, isLogin: false }) },
      '~/utils/api': { default: {} },
      '~/utils/main': { getCSRF: () => '' },
      '~/utils/notificationRoute': notificationRoute,
      '~/utils/privateConversationRoute': await import('../src/utils/privateConversationRoute'),
      './components/NativeNotificationFeed.vue': { default: blank },
      './components/NotificationsPageHeader.vue': { default: blank },
      './components/NotificationsPageSkeleton.vue': { default: blank },
      './composables/useNotificationFeeds': { useNotificationFeeds: () => ({}) },
      './notificationFeedPolicy': await import('../src/contentScripts/views/Notifications/notificationFeedPolicy'),
      './notificationSections': await import('../src/contentScripts/views/Notifications/notificationSections'),
      './systemNotificationFeed': { createSystemNotificationPageFetcher: () => () => assert.fail('route changes must not fetch feeds in this fixture') },
      './whisper/usePrivateEmotePanel': { usePrivateEmotePanel: () => ({ release() {} }) },
      './whisper/usePrivateMessageWorkspace': { usePrivateMessageWorkspace: () => ({ messages: {}, writes: {}, release() {}, dispose() {} }) },
      './whisper/usePrivateRecipientSearch': { usePrivateRecipientSearch: () => ({ reset() {}, pause() {} }) },
      './whisper/usePrivateHistorySearch': { usePrivateHistorySearch: () => ({ reset() {}, suspend() {} }) },
      './whisper/usePrivateSessions': { usePrivateSessions: () => sessions },
      './whisper/usePrivateConversationTarget': await import('../src/contentScripts/views/Notifications/whisper/usePrivateConversationTarget'),
      './whisper/WhisperWorkspace.vue': { default: blank },
    }, { renderTemplate: false, globals: { URL } })
    const navigation = await loadSourceModule('../src/utils/searchNavigation.ts', {
      '~/composables/useDark': { useDark: () => assert.fail('a top-level search must not access an iframe channel') },
      '~/utils/iframeSearch': await import('../src/utils/iframeSearch'),
      '~/composables/useRouteState': route,
      '~/enums/appEnums': enums,
      '~/logic': { settings },
      '~/utils/configuredLinkNavigation': { getLinkFallbackPage: () => 'Home' },
      '~/utils/main': { isHomePage: (url = window.location.href) => new URL(url).pathname === '/', isInIframe: () => false, openLinkToNewTab: () => assert.fail('current-tab search must stay in this document') },
      '~/utils/pageMode': await import('../src/utils/pageMode'),
      '~/utils/searchNavigationCore': await import('../src/utils/searchNavigationCore'),
      './searchNavigationCore': await import('../src/utils/searchNavigationCore'),
      './searchUrl': await import('../src/utils/searchUrl'),
      '~/utils/tabs': { openLinkInBackground: () => assert.fail('current-tab search must stay in this document') },
    })
    const host = document.body.appendChild(document.createElement('div'))
    let page
    const app = Vue.createApp({ render: () => Vue.h(component, { ref: value => page = value?.$?.setupState }) })
    try {
      app.mount(host)
      await flush()
      // Keep the real page mounted during route changes, as it can be while its
      // leave transition runs. Its route watcher must respect the new owner.
      for (const section of ['whisper', 'reply', 'at', 'love', 'system']) {
        for (const keyword of ['热搜 fixture', '历史 fixture']) {
          window.history.replaceState(window.history.state, '', notificationRoute.buildBewlyNotificationUrl(section))
          route.syncRouteState()
          await flush()
          assert.equal(page.currentView, section)
          const destination = navigation.resolveSearchNavigationTarget(keyword)
          navigation.openSearchResults(destination, { fromSearchResultsTopBar: true })
          await flush()
          assert.equal(window.location.href, destination, `${section}: departing Notifications cannot replace the search URL`)
          assert.equal(shell.activatedPage.value, 'SearchResults')
          route.syncRouteState()
          await flush()
          assert.equal(window.location.href, destination, 'a later route observation cannot bounce back to messages')
          assert.deepEqual(window.history.state, { nativeData: 'retained' })
        }
      }
      assert.equal(openedSettings.length, 0)
      for (const view of ['settings', 'unknown']) {
        window.history.replaceState(window.history.state, '', `/?page=Notifications&notificationView=${view}`)
        route.syncRouteState()
        await flush()
        assert.equal(window.location.href, notificationRoute.buildBewlyNotificationUrl('whisper'))
        assert.equal(page.currentView, 'whisper')
      }
      assert.equal(openedSettings.length, 1)
      assert.equal(openedSettings[0].page, 'messages')
    }
    finally {
      app.unmount()
      host.remove()
      scope.stop()
      route.stopRouteObserver()
      window.history.replaceState(previousState, '', previousUrl)
      document.title = previousTitle
    }
  })

  check('notification cards: actual reply/at/love cards separate interaction and source, preserve links/fallbacks and share skeleton columns', async () => {
    const root = '../src/contentScripts/views/Notifications/components/'
    const Card = await compileComponent(`${root}NativeNotificationItem.vue`, { 'vue-i18n': i18n, '~/utils/locale': await import('../src/utils/locale') })
    const Skeleton = await compileComponent(`${root}NativeNotificationFeedSkeleton.vue`)
    const styles = []
    for (const file of [`${root}NativeNotificationItem.vue`, `${root}NativeNotificationFeedSkeleton.vue`, '../src/styles/main.scss']) {
      const url = new URL(file, import.meta.url)
      const source = await readFile(url, 'utf8')
      const compiled = await compileStyleAsync({
        source: file.endsWith('.vue') ? parse(source).descriptor.styles[0].content : source,
        filename: fileURLToPath(url),
        id: 'notification-ui-fixture',
        preprocessLang: 'scss',
      })
      assert.deepEqual(compiled.errors, [])
      const style = document.head.appendChild(document.createElement('style'))
      style.textContent = compiled.code
      styles.push(style)
    }
    const item = Vue.ref(null)
    const host = document.body.appendChild(document.createElement('div'))
    const app = Vue.createApp({ render: () => item.value ? Vue.h('div', [Vue.h(Card, { item: item.value }), Vue.h(Skeleton, { section: item.value.section, count: 1, label: 'Loading' })]) : null })
    app.component('ALink', { props: ['href'], setup: (props, { slots }) => () => Vue.h('a', { href: props.href }, slots.default?.()) })
    try {
      app.mount(host)
      for (const section of ['reply', 'at', 'love']) {
        item.value = {
          id: section,
          kind: 'interaction',
          section,
          actors: [{ id: '42', name: 'Actor', avatar: 'https://i0.hdslb.com/avatar.png' }],
          actorCount: 1,
          actionTextKey: `notifications.native.${section}`,
          body: `received ${section}`,
          quote: 'the quoted interaction',
          sourceTitle: 'A source title with enough text to wrap over multiple lines',
          sourceImage: 'https://i0.hdslb.com/cover.jpg',
          sourceUrl: 'https://www.bilibili.com/video/BV1xx411c7mD/?t=42',
          originalUrl: 'https://message.bilibili.com/',
          timestamp: 1700000000,
          unread: true,
        }
        await flush()
        const card = host.querySelector('.native-notification-item')
        const content = card.querySelector('.native-notification-item__content')
        const context = card.querySelector('.native-notification-item__context')
        assert.equal(context.parentElement, card)
        const body = card.querySelector('.native-notification-item__body')
        assert.equal(body.parentElement, card)
        assert.match(body.textContent, new RegExp(`received ${section}`))
        assert.equal(content.contains(context), false)
        assert.ok(context.textContent.includes('the quoted interaction'))
        assert.equal(card.querySelector('.native-notification-item__actor').href, 'https://space.bilibili.com/42')
        assert.deepEqual([...context.querySelectorAll('a')].map(link => link.href), [item.value.sourceUrl, item.value.sourceUrl])
        assert.ok(card.querySelector('.native-notification-item__unread'))
        assert.equal(card.querySelector('time').dateTime, new Date(1700000000000).toISOString())
        const skeleton = host.querySelector('.native-notification-feed-skeleton__item')
        assert.equal(card.classList.contains('native-notification-interaction-layout'), true)
        assert.equal(skeleton.classList.contains('native-notification-interaction-layout'), true)
        assert.equal(getComputedStyle(card).gridTemplateColumns, 'auto minmax(0, 1fr)')
        assert.equal(getComputedStyle(card).gridTemplateColumns, getComputedStyle(skeleton).gridTemplateColumns)
        assert.equal(skeleton.querySelector('.native-notification-feed-skeleton__context').parentElement, skeleton)
        context.querySelector('img').dispatchEvent(new Event('error'))
        await flush()
        assert.equal(context.querySelector('img'), null)
        assert.ok(context.textContent.includes(item.value.sourceTitle), 'a failed source image cannot remove its title/link')
      }
      item.value = { ...item.value, id: 'empty-source', body: '', sourceTitle: '', sourceImage: '', quote: '', sourceUrl: '' }
      await flush()
      assert.equal(host.querySelector('.native-notification-item__open-source').href, item.value.originalUrl)
      assert.equal(host.querySelector('.native-notification-item__body'), null)
    }
    finally {
      app.unmount()
      host.remove()
      styles.forEach(style => style.remove())
    }
  })

  check('conversation close: the actual page clears selection and URL without navigating back into the previous user', async () => {
    const route = await import('../src/utils/privateConversationRoute')
    const oldUrl = window.location.href
    const oldState = window.history.state
    const pending = Vue.ref({ talkerId: '3', sessionType: 1 })
    const recipient = Vue.ref({ mid: '3' })
    let selected = '1:3'
    const page = await loadSourceFunctions('../src/contentScripts/views/Notifications/Notifications.vue', ['closePrivateConversation', 'replacePrivateConversationUrl'], {
      window,
      clearPrivateConversationRoute: route.clearPrivateConversationRoute,
      pendingPrivateConversationRoute: pending,
      transientPrivateRecipient: recipient,
      privateSessions: { clearSelectedSession: () => { selected = '' } },
      resetWorkspacePagePosition() {},
    })
    try {
      window.history.replaceState({ nativeData: { kept: true } }, '', route.buildPrivateConversationUrl({ talkerId: '2', sessionType: 1 }))
      window.history.pushState(window.history.state, '', route.buildPrivateConversationUrl({ talkerId: '3', sessionType: 1 }))
      page.closePrivateConversation()
      assert.equal(selected, '')
      assert.equal(pending.value, null)
      assert.equal(recipient.value, null)
      assert.equal(route.parsePrivateConversationRoute(window.location.href), null)
      assert.equal(new URL(window.location.href).searchParams.get('notificationView'), 'whisper')
      assert.deepEqual(window.history.state, { nativeData: { kept: true } })
    }
    finally {
      window.history.replaceState(oldState, '', oldUrl)
    }
  })

  check('App authorization: actual Dialog omits only its top blur while preserving instructions, QR polling and cleanup', async () => {
    const host = document.body.appendChild(document.createElement('div'))
    const settings = Vue.ref({ recommendationMode: 'app', disableFrostedGlass: false })
    const tokens = Vue.ref({ accessToken: '' })
    const Button = { props: ['disabled'], setup: (props, { slots }) => () => Vue.h('button', { disabled: props.disabled }, slots.default?.()) }
    const Dialog = await compileComponent('../src/components/Dialog.vue', {
      '~/components/Button.vue': { default: Button },
      '~/components/CloseButton.vue': { default: Button },
      '~/components/PanelTopBlur.vue': { default: await compileComponent('../src/components/PanelTopBlur.vue') },
      '~/composables/useAppProvider': { useBewlyApp: () => ({ mainAppRef: Vue.ref(host) }) },
      '~/logic': { settings },
      '~/utils/dialogFocus': await import('../src/utils/dialogFocus'),
      '~/utils/dialogKeyboard': await import('../src/utils/dialogKeyboard'),
    })
    const polls = new Map()
    let requests = 0
    const Authorization = await compileComponent('../src/components/AppAuthorizationDialog.vue', {
      'vue-i18n': i18n,
      'vue-toastification': { useToast: () => ({ success() {} }) },
      'qrcode.vue': { default: { props: ['value'], setup: props => () => Vue.h('svg', { 'data-qr': props.value }) } },
      '~/logic': { settings, appAuthTokens: tokens },
      '~/logic/appAuthorizationCoordinator': { beginAppAuthorization() {}, completeAppAuthorization() {}, dismissAppAuthorization() {} },
      '~/utils/authProvider': {
        getAppLoginQRCode: async () => {
          requests++
          return { code: 0, data: { url: 'https://www.bilibili.com/fixture-qr', auth_code: 'fixture' } }
        },
        hasValidAppAuthTokens: () => false,
        pollAppLoginQRCode: async () => ({ code: 86039 }),
        saveAppAuthTokens() {},
      },
    }, { globals: {
      setTimeout: (run) => {
        polls.set(1, run)
        return 1
      },
      clearTimeout: id => polls.delete(id),
    } })
    const app = Vue.createApp(Authorization)
    app.component('Dialog', Dialog)
    app.component('Button', Button)
    app.config.globalProperties.$t = key => key
    try {
      app.mount(host)
      await flush()
      assert.equal(requests, 1)
      assert.ok(host.textContent.includes('settings.scan_qrcode_desc'))
      assert.ok(host.textContent.includes('settings.authorize_app_desc'))
      assert.ok(host.querySelector('[data-qr]'))
      assert.equal(host.querySelector('.bew-panel-top-blur'), null)
      assert.equal(host.querySelector('.dialog__surface').style.backdropFilter, 'var(--bew-filter-glass-2)')
      assert.equal(polls.size, 1)
    }
    finally {
      app.unmount()
      host.remove()
    }
    assert.equal(polls.size, 0)
  })
}
