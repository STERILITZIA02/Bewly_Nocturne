import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import { compileStyleAsync, parse } from 'vue/compiler-sfc'

import { loadSourceFunctions } from './sourceFunctionHarness'

export function registerNotificationUIChecks(check, { Vue, compileComponent, flush }) {
  const i18n = { useI18n: () => ({ t: key => key, locale: Vue.ref('cmn-CN') }) }

  check('notification cards: actual reply/at/love cards separate interaction and source, preserve links/fallbacks and share skeleton columns', async () => {
    const root = '../src/contentScripts/views/Notifications/components/'
    const Card = await compileComponent(`${root}NativeNotificationItem.vue`, { 'vue-i18n': i18n })
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
