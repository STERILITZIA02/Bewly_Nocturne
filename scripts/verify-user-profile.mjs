import assert from 'node:assert/strict'

import { loadSourceModule } from './sourceModuleHarness'

const rawSession = (id, timestamp = 100, readonly = false) => ({ talker_id: id, session_type: 1, top_ts: 0, session_ts: timestamp, unread_count: 0, ack_seqno: '0', max_seqno: '0', system_msg_type: readonly ? 1 : 0, is_intercept: 0, is_follow: 1, can_fold: 0, is_dnd: 0, last_msg: null })
const cards = ids => ({ code: 0, data: ids.map(mid => ({ mid, name: `User ${mid}`, face: 'https://i0.hdslb.com/fixture.png' })) })

export function registerUserProfileChecks(check, { Vue, flush, compileComponent }) {
  check('user profile: native owner keeps follow action, interrupts motion and opens the exact Bewly conversation in a new tab', async () => {
    const links = []
    const animations = []
    let disconnected = 0
    class Profile extends window.HTMLElement {
      constructor() {
        super()
        this.attachShadow({ mode: 'open' }).innerHTML = '<div id="wrap"></div>'
        const panel = this.shadowRoot.querySelector('#wrap')
        panel.getBoundingClientRect = () => ({ left: 100, top: 100, bottom: 300, width: 300 })
        panel.animate = (frames, options) => {
          let finish
          const animation = {
            frames,
            options,
            cancelled: false,
            finished: new Promise(resolve => finish = resolve),
            cancel() { this.cancelled = true },
            finish: () => finish(),
          }
          animations.push(animation)
          return animation
        }
      }

      visible(show) { this.style.display = show ? 'block' : 'none' }
      handleJumpMsg() { throw new Error('native navigation should be replaced') }
      handleFollow() { return 'native-follow' }
      disconnectedCallback() { disconnected++ }
    }
    const { patchNativeUserProfile } = await loadSourceModule('../src/inject/nativeUserProfile.ts', {
      '~/utils/motionTiming': await import('../src/utils/motionTiming'),
      '~/utils/privateConversationRoute': await import('../src/utils/privateConversationRoute'),
    }, { window: { open: (...args) => links.push(args), matchMedia: () => ({ matches: false }) }, getComputedStyle: () => ({ opacity: '.5', transform: 'scale(.98)', getPropertyValue: key => key === '--bew-duration-normal' ? '.2s' : key === '--bew-duration-fast' ? '150ms' : 'ease-out' }) })
    const follow = Profile.prototype.handleFollow
    patchNativeUserProfile(Profile)
    patchNativeUserProfile(Profile)
    window.customElements.define('bew-profile-fixture', Profile)
    const profile = document.body.appendChild(new Profile())
    profile.uid = '123456789012345678'
    profile.lastShowEl = { getBoundingClientRect: () => ({ left: 120, top: 70, width: 40 }) }
    try {
      profile.handleJumpMsg()
      const url = new URL(links[0][0])
      assert.equal(url.hostname, 'www.bilibili.com')
      assert.equal(url.searchParams.get('page'), 'Notifications')
      assert.equal(url.searchParams.get('notificationTalker'), profile.uid)
      assert.equal(links[0][1], '_blank')
      assert.equal(links[0][2], 'noopener,noreferrer')
      assert.equal(Profile.prototype.handleFollow, follow)
      profile.visible(true)
      await flush()
      assert.equal(animations[0].options.duration, 200)
      assert.equal(profile.shadowRoot.querySelector('#wrap').style.transformOrigin, '40px 0%')
      profile.visible(false)
      await flush()
      assert.equal(profile.inert, true)
      profile.visible(true)
      await flush()
      animations[1].finish()
      await flush()
      assert.equal(profile.style.display, 'block', 'old hide cannot close a reopened profile')
      assert.equal(profile.inert, false)
      assert.equal(animations[0].cancelled, true)
      profile.uid = 'invalid'
      profile.handleJumpMsg()
      assert.equal(links.length, 1)
    }
    finally { profile.remove() }
    assert.equal(disconnected, 1)
    assert.equal(animations.at(-1).cancelled, true)
  })

  check('user profile: targeted session read distinguishes absent, readonly and mismatched responses', async () => {
    let data = rawSession('123', 100, true)
    let code = 0
    const { getPrivateConversationTarget } = await loadSourceModule('../src/background/privateMessage/sessionActions.ts', {
      './errors': await import('../src/background/privateMessage/errors'),
      './protocol': await import('../src/background/privateMessage/protocol'),
      './transport': { requestPrivateMessage: async () => ({ code, data }) },
      './types': await import('../src/background/privateMessage/types'),
    })
    const result = await getPrivateConversationTarget({ talkerId: '123', sessionType: 1 })
    assert.equal(result.data.session.system_msg_type, 1)
    data = {}
    assert.equal((await getPrivateConversationTarget({ talkerId: '123', sessionType: 1 })).data.session, null)
    data = rawSession('456')
    assert.notEqual((await getPrivateConversationTarget({ talkerId: '123', sessionType: 1 })).code, 0)
    code = 1000004
    assert.equal((await getPrivateConversationTarget({ talkerId: '123', sessionType: 1 })).data.session, null)
    for (const failure of [-101, -412, -1]) {
      code = failure
      assert.equal((await getPrivateConversationTarget({ talkerId: '123', sessionType: 1 })).code, failure)
    }
  })

  check('user profile: route resolution selects the exact user, preserves readonly permissions and rejects stale targets', async () => {
    const sessionUtils = await import('../src/contentScripts/views/Notifications/whisper/privateSession')
    const { usePrivateConversationTarget } = await loadSourceModule('../src/contentScripts/views/Notifications/whisper/usePrivateConversationTarget.ts', { vue: Vue, './privateSession': sessionUtils })
    const account = Vue.ref('1')
    const route = Vue.ref({ talkerId: '100', sessionType: 1 })
    const state = Vue.reactive({ loaded: true, items: [] })
    const selected = Vue.ref('')
    const recipients = []
    const delayed = new Map()
    let fail = true
    let requests = 0
    const scope = Vue.effectScope()
    const target = scope.run(() => usePrivateConversationTarget({ account, route, active: () => true, sessions: { state, selectSession: session => selected.value = session.key, clearSelectedSession: () => selected.value = '', includeRouteSession: session => state.items = [...state.items, session] }, fetchCards: async ids => cards(ids), selectRecipient: recipient => recipients.push(recipient), fetchTarget: async ({ talkerId }) => {
      requests++
      if (talkerId === '100')
        return { code: 0, data: { session: rawSession('100', 100, true) } }
      if (talkerId === '500')
        return fail ? { code: -1 } : { code: 0, data: { session: null } }
      return new Promise(resolve => delayed.set(talkerId, resolve))
    } }))
    try {
      await flush()
      assert.equal(selected.value, '1:100')
      assert.equal(state.items[0].capabilities.canSend, false)
      route.value = { talkerId: '200', sessionType: 1 }
      await flush()
      route.value = { talkerId: '300', sessionType: 1 }
      await flush()
      delayed.get('300')({ code: 0, data: { session: rawSession('300') } })
      await flush()
      delayed.get('200')({ code: 0, data: { session: rawSession('200') } })
      await flush()
      assert.equal(selected.value, '1:300')
      assert.equal(state.items.some(item => item.talkerId === '200'), false)
      route.value = { talkerId: '400', sessionType: 1 }
      await flush()
      account.value = '2'
      route.value = null
      delayed.get('400')({ code: 0, data: { session: rawSession('400') } })
      await flush()
      assert.equal(state.items.some(item => item.talkerId === '400'), false)
      route.value = { talkerId: '500', sessionType: 1 }
      await flush()
      assert.equal(target.state.failed, true)
      const before = requests
      state.items = [...state.items]
      await flush()
      assert.equal(requests, before, 'failed reads do not loop automatically')
      fail = false
      await target.retry()
      assert.equal(recipients.at(-1).mid, '500')
      assert.equal(selected.value, '')
      assert.equal(state.items.some(item => item.talkerId === '500'), false, 'new recipient is not a fabricated historical session')
    }
    finally { scope.stop() }
  })

  check('user profile: loading an old target does not skip intervening history pages', async () => {
    const { usePrivateSessions } = await loadSourceModule('../src/contentScripts/views/Notifications/whisper/usePrivateSessions.ts', {
      vue: Vue,
      './privateSession': await import('../src/contentScripts/views/Notifications/whisper/privateSession'),
      './privateMessage': await import('../src/contentScripts/views/Notifications/whisper/privateMessage'),
    })
    const { transformPrivateSessions } = await import('../src/contentScripts/views/Notifications/whisper/privateSession')
    const page = sessions => ({ code: 0, data: { session_list: sessions, has_more: 1 } })
    let cursor
    const scope = Vue.effectScope()
    const sessions = scope.run(() => usePrivateSessions(Vue.ref('1'), {
      fetchSessions: async () => page([rawSession('100', 100)]),
      fetchNewSessions: async () => page([]),
      fetchOlderSessions: async (end) => {
        cursor = end
        return page([rawSession('90', 90)])
      },
      fetchUserCards: async ids => cards(ids),
    }))
    try {
      await sessions.loadInitial()
      const [older] = transformPrivateSessions([rawSession('1', 1)], cards(['1']))
      sessions.includeRouteSession(older)
      sessions.selectSession(older)
      await sessions.refresh()
      assert.equal(sessions.selectedSessionKey.value, '1:1')
      await sessions.loadMore()
      assert.equal(cursor, 100)
      assert.equal(sessions.state.oldestSessionTs, 90)
    }
    finally { scope.stop() }
  })

  check('user profile: sidebar renders and selects a routed user even outside filters, without duplicating rows', async () => {
    const base = '../src/contentScripts/views/Notifications/whisper/'
    const sessionUtils = await import(`${base}privateSession`)
    const i18n = { useI18n: () => ({ t: key => key, locale: Vue.ref('en') }) }
    const Item = await compileComponent(`${base}ConversationListItem.vue`, {
      'vue-i18n': i18n,
      './privateSession': sessionUtils,
      './usePrivateSessionActions': { canManagePrivateSession: () => false, privateSessionActionsKey: Symbol('actions') },
    })
    const Recipient = await compileComponent(`${base}PrivateRecipientSearchResultItem.vue`)
    const List = await compileComponent(`${base}ConversationList.vue`, {
      'vue-i18n': i18n,
      '~/components/LibrarySearchField.vue': { default: { render: () => null } },
      '~/composables/usePageViewState': { usePageViewState: () => ({ ref: (_key, value) => Vue.ref(value) }) },
      './ConversationListItem.vue': { default: Item },
      './ConversationListSkeleton.vue': { default: { render: () => null } },
      './PrivateRecipientSearchResultItem.vue': { default: Recipient },
      './privateSession': sessionUtils,
      './privateRecipientSearch': await import(`${base}privateRecipientSearch`),
      './privateSearchPolicy': await import(`${base}privateSearchPolicy`),
    })
    const items = sessionUtils.transformPrivateSessions([rawSession('123')], cards(['123']))
    const recipient = Vue.ref(null)
    const selected = Vue.ref('1:123')
    const filter = Vue.ref('other')
    const host = document.body.appendChild(document.createElement('div'))
    const app = Vue.createApp({ render: () => Vue.h(List, {
      active: true,
      compact: false,
      items,
      selectedSessionKey: selected.value,
      selectedRecipient: recipient.value,
      loadingMore: false,
      noMore: true,
      paginationStalled: false,
      loadMoreFailed: false,
      showOfficialAssistants: true,
      typeFilter: filter.value,
      recipientSearch: { pause() {}, setQuery() {}, state: { complete: false, groups: { following: { items: [] }, global: { items: [] } } } },
    }) })
    app.config.globalProperties.$t = key => key
    app.component('ALink', { props: ['href'], setup: (props, { slots }) => () => Vue.h('a', { href: props.href }, slots.default?.()) })
    const button = { props: ['label'], setup: (props, { slots }) => () => Vue.h('button', { type: 'button', 'aria-label': props.label }, slots.default?.()) }
    app.component('Button', button)
    app.component('IconButton', button)
    app.component('Tooltip', { setup: (_props, { slots }) => () => slots.default?.() })
    try {
      app.mount(host)
      await flush()
      assert.equal(host.querySelectorAll('[data-session-key="1:123"]').length, 1)
      assert.equal(host.querySelector('[data-session-key="1:123"]').getAttribute('aria-current'), 'true')
      filter.value = 'all'
      await flush()
      assert.equal(host.querySelectorAll('[data-session-key="1:123"]').length, 1)
      selected.value = ''
      recipient.value = { mid: '456', name: 'New user', avatar: '', source: 'global' }
      await flush()
      assert.equal(host.querySelector('[data-recipient-mid="456"]').getAttribute('aria-pressed'), 'true')
    }
    finally {
      app.unmount()
      host.remove()
    }
  })
}
