import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import { compileStyleAsync, parse } from 'vue/compiler-sfc'

import { loadSourceFunctions } from './sourceFunctionHarness'
import { loadSourceModule } from './sourceModuleHarness'

export function registerNotificationUIChecks(check, { Vue, compileComponent, flush }) {
  const i18n = { useI18n: () => ({ t: key => key, locale: Vue.ref('cmn-CN') }) }

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
      './whisper/usePrivateRecipientSearch': { usePrivateRecipientSearch: () => ({ reset() {} }) },
      './whisper/usePrivateSessions': { usePrivateSessions: () => sessions },
      './whisper/WhisperWorkspace.vue': { default: blank },
    }, { renderTemplate: false, globals: { URL } })
    const navigation = await loadSourceModule('../src/utils/searchNavigation.ts', {
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
        assert.match(content.textContent, new RegExp(`received ${section}`))
        assert.equal(content.contains(context), false)
        assert.ok(context.textContent.includes('the quoted interaction'))
        assert.equal(card.querySelector('.native-notification-item__actor').href, 'https://space.bilibili.com/42')
        assert.deepEqual([...context.querySelectorAll('a')].map(link => link.href), [item.value.sourceUrl, item.value.sourceUrl])
        assert.ok(card.querySelector('.native-notification-item__unread'))
        assert.equal(card.querySelector('time').dateTime, new Date(1700000000000).toISOString())
        const skeleton = host.querySelector('.native-notification-feed-skeleton__item')
        assert.equal(card.classList.contains('native-notification-interaction-layout'), true)
        assert.equal(skeleton.classList.contains('native-notification-interaction-layout'), true)
        assert.equal(getComputedStyle(card).gridTemplateColumns, 'auto minmax(0, 3fr) minmax(0, 2fr)')
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
        getTVLoginQRCode: async () => {
          requests++
          return { code: 0, data: { url: 'https://www.bilibili.com/fixture-qr', auth_code: 'fixture' } }
        },
        hasValidAppAuthTokens: () => false,
        pollTVLoginQRCode: async () => ({ code: 86039 }),
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
