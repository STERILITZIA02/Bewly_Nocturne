import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import vm from 'node:vm'

import { loadSourceModule } from './sourceModuleHarness'

export function registerTopBarSyncChecks(check, { Vue, flush, compileComponent }) {
  async function createStore(sendMessage, overrides = {}) {
    const { createPinia, defineStore, disposePinia } = await import('pinia')
    const messages = []
    const callbacks = []
    const document = { cookie: 'DedeUserID=123', hidden: false, ...overrides.document }
    const runtime = {
      id: 'topbar-test',
      sendMessage(message, callback) {
        messages.push(message)
        sendMessage(message, (reply, error) => {
          runtime.lastError = error ? { message: error } : undefined
          callback(reply)
          runtime.lastError = undefined
        })
      },
      onMessage: { addListener(callback) { callbacks.push(callback) } },
    }
    // Exercise the installed polyfill, including its closed-port -> undefined
    // conversion, followed by the real messaging module and Pinia store.
    const require = createRequire(import.meta.url)
    const context = { chrome: { runtime }, module: { exports: {} }, exports: {} }
    vm.runInNewContext(await readFile(require.resolve('webextension-polyfill'), 'utf8'), context)
    const warnings = []
    const messaging = await loadSourceModule('../src/utils/messaging.ts', { 'webextension-polyfill': { default: context.module.exports }, '~/utils/abort': await import('../src/utils/abort'), '~/constants/apiRequest': await import('../src/constants/apiRequest') }, { console: { warn: (...args) => warnings.push(args) } })
    const timers = new Map()
    let nextTimer = 0
    const module = await loadSourceModule('../src/stores/topBarStore.ts', {
      '~/utils/watchLaterList': await import('../src/utils/watchLaterList'),
      'pinia': { defineStore },
      'vue': Vue,
      'vue-toastification': { useToast: () => ({}) },
      '~/components/TopBar/constants/urls': await import('../src/components/TopBar/constants/urls'),
      '~/composables/useCurrentLocationHref': { useCurrentLocationHref: () => Vue.ref('https://www.bilibili.com/video/BV15gtZ6fE2T/') },
      '~/constants/topBarState': await import('../src/constants/topBarState'),
      '~/logic': { settings: Vue.ref({}) },
      '~/logic/loginStatus': await import('../src/logic/loginStatus'),
      '~/logic/uploaderLatestVideoTimes': {},
      '~/logic/watchLaterState': overrides.watchLaterState ?? {
        watchLaterState: Vue.ref({ accountId: 123, count: 4 }),
        watchLaterUpdate: Vue.ref(),
        ensureWatchLaterCount: async () => true,
        ensureWatchLaterState: async () => true,
        isInWatchLater: () => undefined,
        applyWatchLaterUpdate() {},
      },
      '~/utils/abort': await import('../src/utils/abort'),
      '~/stores/settingsStore': { useSettingsStore: () => ({ getEffectiveTopBarSource: () => 'bewly' }) },
      '~/stores/topBarSharedRefresh': await import('../src/stores/topBarSharedRefresh'),
      '~/utils/api': { default: overrides.api ?? {} },
      '~/utils/effectiveTopBarSource': { showBewlyTopBar: () => true },
      '~/utils/i18n': { i18n: { global: { t: key => key } } },
      '~/utils/main': { getCSRF: () => '', isHomePage: () => false },
      '~/utils/messaging': messaging,
      '~/utils/momentFeedOrder': {},
      '~/utils/momentKey': {},
      '~/utils/notificationBadge': await import('../src/utils/notificationBadge'),
      '~/utils/watchLater': overrides.watchLater ?? {},
    }, {
      document,
      setTimeout: (callback) => {
        timers.set(++nextTimer, callback)
        return nextTimer
      },
      clearTimeout: id => timers.delete(id),
    })
    const pinia = createPinia()
    const store = module.useTopBarStore(pinia)
    if (overrides.initializeAccount !== false)
      store.userInfo.mid = 123
    store.unReadMessage.reply = 7
    return {
      store,
      messages,
      timers,
      warnings,
      messaging,
      document,
      emit: (type, data) => callbacks.forEach(callback => callback({ type, data }, {}, () => {})),
      dispose() {
        store.cleanup()
        disposePinia(pinia)
      },
    }
  }

  async function createUserPanel() {
    const fixture = await createStore((_request, reply) => reply(undefined))
    Object.assign(fixture.store.userInfo, { uname: 'Panel fixture', level_info: { current_level: 6, current_exp: 100, next_exp: 200 }, vip: { status: 0 } })
    const settings = Vue.ref({ hideTopBarUserPanelLv6LastLoginLocation: false })
    const reads = []
    const errors = []
    const read = kind => (_params, options) => new Promise((resolve, reject) => reads.push({ kind, options, resolve, reject }))
    const Panel = await compileComponent('../src/components/TopBar/components/pops/UserPanelPop.vue', {
      'dompurify': { default: { sanitize: value => value } },
      'pinia': await import('pinia'),
      'vue-i18n': { useI18n: () => ({ t: key => key }) },
      '~/components/TopBar/composables/useTopBarInteraction': { resetTopBarTransientInteraction() {} },
      '~/logic': { settings },
      '~/stores/topBarStore': { useTopBarStore: () => fixture.store },
      '~/utils/accountScope': await import('../src/utils/accountScope'),
      '~/utils/api': { default: { user: { getUserStat: read('stat'), getLoginLog: read('log') }, auth: { logout: () => assert.fail('read tests must never log out') } } },
      '~/utils/configuredLinkNavigation': { resolveConfiguredLinkAction: () => 'currentTab' },
      '~/utils/dataFormatter': { numFormatter: value => String(value) },
      '~/utils/lvIcons': await import('../src/utils/lvIcons'),
      '~/utils/main': { getCSRF: () => '', getUserID: () => fixture.document.cookie.match(/DedeUserID=(\d+)/)?.[1] },
      '~/utils/messaging': fixture.messaging,
      '~/utils/tabs': { openLinkInBackground: () => assert.fail('read tests must not open tabs') },
    }, { globals: { console: { ...console, error: (...args) => errors.push(args) } } })
    const host = document.body.appendChild(document.createElement('div'))
    let app
    const mount = () => {
      app = Vue.createApp(Panel, { userInfo: fixture.store.userInfo })
      app.config.globalProperties.$t = key => key
      app.config.errorHandler = error => errors.push(error)
      app.component('ALink', { props: ['href', 'title'], setup: (props, { slots }) => () => Vue.h('a', { href: props.href, title: props.title }, slots.default?.()) })
      app.component('Button', { setup: (_props, { slots }) => () => Vue.h('button', slots.default?.()) })
      app.mount(host)
    }
    mount()
    return {
      ...fixture,
      host,
      reads,
      errors,
      settings,
      mount,
      unmount: () => app.unmount(),
      counts: () => Array.from(host.querySelectorAll('.channel-info-item .num'), item => item.textContent.trim()),
      dispose() {
        app.unmount()
        host.remove()
        fixture.dispose()
      },
    }
  }

  check('user panel terminal reads: both endpoints reuse the real TopBar terminal state and reopening cannot revive invalidated requests', async () => {
    for (const kind of ['stat', 'log']) {
      for (const reason of ['Extension context invalidated.', 'The message port closed before a response was received.', 'Could not establish connection. Receiving end does not exist.']) {
        const fixture = await createUserPanel()
        try {
          assert.deepEqual(fixture.reads.map(read => read.kind), ['stat', 'log'])
          fixture.store.startUpdateTimer()
          assert.equal(fixture.timers.size, 1)
          fixture.reads.find(read => read.kind === kind).reject(new Error(reason))
          await flush()
          assert.equal(fixture.store.canReadUi(), false)
          assert.equal(fixture.timers.size, 0)
          assert.ok(fixture.reads.every(read => read.options.signal.aborted))
          fixture.reads.find(read => read.kind !== kind).resolve({ code: 0, data: { following: 999, list: [{ geo: 'late location' }] } })
          await flush()
          assert.deepEqual(fixture.counts(), ['—', '—', '—'])
          assert.equal(fixture.host.textContent.includes('late location'), false)
          fixture.unmount()
          fixture.mount()
          fixture.settings.value.hideTopBarUserPanelLv6LastLoginLocation = true
          await flush()
          assert.equal(fixture.reads.length, 2)
          assert.equal(fixture.errors.length, 0)
          assert.equal(fixture.warnings.length, 0)
        }
        finally { fixture.dispose() }
      }
    }
  })

  check('user panel read ownership: Cookie changes, account swaps, hidden login details and unmount reject stale data and abort only reads', async () => {
    const fixture = await createUserPanel()
    try {
      fixture.document.cookie = 'DedeUserID=234'
      fixture.reads[0].resolve({ code: 0, data: { following: 999 } })
      await flush()
      assert.deepEqual(fixture.counts(), ['—', '—', '—'], 'a Cookie change invalidates the old profile before Store reconciliation')
      fixture.store.userInfo.mid = 234
      await flush()
      assert.ok(fixture.reads.slice(0, 2).every(read => read.options.signal.aborted))
      assert.equal(fixture.reads.length, 4)
      fixture.reads[2].resolve({ code: 0, data: { following: 0, follower: 8, dynamic_count: 2 } })
      fixture.reads[1].resolve({ code: 0, data: { list: [{ geo: 'old account location' }] } })
      await flush()
      assert.deepEqual(fixture.counts(), ['0', '8', '2'])
      assert.equal(fixture.host.textContent.includes('old account location'), false)
      fixture.settings.value.hideTopBarUserPanelLv6LastLoginLocation = true
      await flush()
      assert.equal(fixture.reads[3].options.signal.aborted, true)
      assert.equal(fixture.reads.at(-1).kind, 'stat')
      assert.equal(fixture.reads.length, 5)
      fixture.unmount()
      assert.equal(fixture.reads[4].options.signal.aborted, true)
      fixture.mount()
      fixture.reads[4].resolve({ code: 0, data: { following: 888 } })
      fixture.reads[5].resolve({ code: 0, data: { following: 1, follower: 2, dynamic_count: 3 } })
      await flush()
      assert.deepEqual(fixture.counts(), ['1', '2', '3'])
      assert.equal(fixture.errors.length, 0)
    }
    finally { fixture.dispose() }
  })

  check('user panel ordinary failures: network errors remain diagnosable and a reopened panel may retry', async () => {
    const fixture = await createUserPanel()
    try {
      fixture.reads[0].reject(new Error('Network unavailable'))
      fixture.reads[1].reject(new Error('Temporary server failure'))
      await flush()
      assert.equal(fixture.store.canReadUi(), true)
      assert.equal(fixture.warnings.length, 2)
      assert.ok(fixture.warnings.every(args => args.every(value => typeof value === 'string')))
      assert.equal(fixture.errors.length, 0)
      fixture.unmount()
      fixture.mount()
      assert.equal(fixture.reads.length, 4)
    }
    finally { fixture.dispose() }
  })

  check('cold boot: actual Watch Later projection, TopBar store and CountBadge render before readiness and after logout', async () => {
    const callbacks = new Map()
    let cookie = 'DedeUserID=123'
    const projection = await loadSourceModule('../src/logic/watchLaterState.ts', {
      'vue': Vue,
      '~/constants/topBarState': await import('../src/constants/topBarState'),
      '~/constants/watchLaterState': await import('../src/constants/watchLaterState'),
      '~/logic/loginStatus': await import('../src/logic/loginStatus'),
      '~/utils/api': { default: {} },
      '~/utils/messaging': { onMessage: (type, callback) => callbacks.set(type, callback), isExtensionContextInvalidatedError: () => false, reportRuntimeFailure() {} },
      '~/utils/watchLaterSnapshot': await import('../src/utils/watchLaterSnapshot'),
    }, { document: { get cookie() { return cookie }, hidden: true } })
    const fixture = await createStore((_message, callback) => callback({ ok: true }), { initializeAccount: false, watchLaterState: projection })
    const { store } = fixture
    const host = document.body.appendChild(document.createElement('div'))
    const failures = []
    const Badge = await compileComponent('../src/components/CountBadge.vue')
    const app = Vue.createApp({ setup: () => () => Vue.h('nav', [Vue.h(Badge, { count: store.watchLaterCount }), Vue.h(Badge, { count: store.watchLaterCount })]) })
    app.config.errorHandler = error => failures.push(error)
    try {
      assert.equal(projection.watchLaterState.value, undefined)
      assert.equal(store.userInfo.mid, undefined)
      app.mount(host)
      assert.ok(host.querySelector('nav'))
      assert.equal(host.textContent, '', 'undefined account and undefined projection never count as a matching snapshot')
      projection.applyWatchLaterUpdate({ type: 'snapshot', snapshot: { accountId: 123, epoch: 'fixture', revision: 1, count: 12, complete: false, entries: [], updatedAt: 0, countUpdatedAt: Date.now() } })
      await flush()
      assert.equal(host.textContent, '')
      store.userInfo.mid = 123
      await flush()
      assert.equal(host.textContent, '1212')
      store.userInfo.mid = 456
      await flush()
      assert.equal(host.textContent, '')
      cookie = ''
      const { TOP_BAR_STATE_MESSAGE } = await import('../src/constants/topBarState')
      callbacks.get(TOP_BAR_STATE_MESSAGE.LOGIN_STATE_CHANGED)()
      delete store.userInfo.mid
      await flush()
      assert.equal(host.textContent, '')
      assert.deepEqual(failures, [])
    }
    finally {
      app.unmount()
      host.remove()
      fixture.dispose()
    }
  })

  for (const failure of ['closed-port', 'undefined', 'null']) {
    check(`TopBar sync: ${failure} reply stops polling and preserves the current state`, async () => {
      const replies = []
      const fixture = await createStore((_message, callback) => {
        replies.push(callback)
      })
      try {
        fixture.store.startUpdateTimer()
        const [timerId, tick] = [...fixture.timers][0]
        fixture.timers.delete(timerId)
        tick()
        assert.equal(fixture.messages.length, 3)
        assert.equal(fixture.timers.size, 1, 'the next tick is queued while the claim is pending')
        replies.forEach(reply => reply(failure === 'null' ? null : undefined, failure === 'closed-port' ? 'The message port closed before a response was received.' : undefined))
        await flush()
        assert.equal(fixture.timers.size, 0, 'an unanswered claim must stop the existing polling chain')
        assert.equal(fixture.warnings.length, 0, 'closed messaging must not emit repeated runtime failure warnings')
        assert.equal(fixture.store.isLogin, true)
        assert.equal(fixture.store.unReadMessage.reply, 7)
        assert.equal(fixture.store.watchLaterCount, 4)
        let refreshed = false
        await fixture.store.syncSharedData({ force: true, refresh: async () => {
          refreshed = true
          return true
        } })
        fixture.store.startUpdateTimer()
        assert.equal(refreshed, false)
        assert.equal(fixture.messages.length, 3, 'later calls must not send another claim or publish an empty snapshot')
        assert.equal(fixture.timers.size, 0)
      }
      finally {
        fixture.dispose()
      }
    })
  }

  check('TopBar sync: valid empty snapshots, refresh leases and recoverable errors retain their behavior', async () => {
    const { TOP_BAR_STATE_MESSAGE: message } = await import('../src/constants/topBarState')
    let claim = { shouldRefresh: false, version: 0 }
    let error
    const fixture = await createStore((request, reply) => reply(request.type === message.CLAIM_REFRESH ? claim : undefined, error))
    try {
      fixture.store.startUpdateTimer()
      await fixture.store.syncSharedData()
      assert.equal(fixture.timers.size, 1, 'a valid claim without a snapshot is not a transport failure')
      error = 'Temporary broker error'
      await assert.rejects(fixture.store.syncSharedData(), /Temporary broker error/)
      assert.equal(fixture.timers.size, 1, 'ordinary errors remain retryable')
      error = undefined
      claim = { shouldRefresh: true, refreshId: 42, version: 0 }
      await fixture.store.syncSharedData({ force: true, resource: 'unread', refresh: async () => {
        fixture.store.unReadMessage.reply = 9
        return true
      } })
      const published = fixture.messages.find(request => request.type === message.PUBLISH)
      assert.equal(published.data.accountId, 123)
      assert.equal(published.data.refreshId, 42)
      assert.equal(published.data.snapshot.unReadMessage.reply, 9)
      assert.equal(fixture.timers.size, 1, 'void publish acknowledgements remain valid')
      claim = { shouldRefresh: false, snapshot: published.data.snapshot, version: 0 }
      fixture.store.unReadMessage.reply = 0
      await fixture.store.syncSharedData({ resource: 'unread' })
      assert.equal(fixture.store.unReadMessage.reply, 9)
      claim = { shouldRefresh: true, refreshId: 43, version: 0 }
      await fixture.store.syncSharedData({ resource: 'unread', refresh: async () => false })
      const released = fixture.messages.find(request => request.type === message.RELEASE_REFRESH)
      assert.equal(released.data.refreshId, 43)
      assert.equal(fixture.timers.size, 1, 'void release acknowledgements remain valid')
    }
    finally {
      fixture.dispose()
    }
  })

  check('data TopBar UI: hidden/inactive hosts keep no polling wakeup; resume reconciles Cookie before data', async () => {
    const { TOP_BAR_STATE_MESSAGE: message } = await import('../src/constants/topBarState')
    const network = []
    let mid = 123
    let refreshId = 0
    const fixture = await createStore((request, reply) => {
      reply(request.type === message.CLAIM_REFRESH ? { shouldRefresh: true, refreshId: ++refreshId, version: 1 } : undefined)
    }, {
      document: { hidden: true },
      api: {
        user: { getUserInfo: async () => {
          network.push(['nav', mid])
          return { code: 0, data: { mid, isLogin: true, vip: { status: 0 } } }
        } },
        notification: {
          getUnreadMsg: async () => {
            network.push(['unread', mid])
            return { code: 0, data: { reply: mid } }
          },
          getUnreadDm: async () => ({ code: 0, data: {} }),
        },
        moment: { getMomentsUpdate: async () => ({ code: 0, data: { update_num: 3 } }) },
      },
    })
    try {
      await fixture.store.initData()
      fixture.store.startUpdateTimer()
      fixture.emit(message.INVALIDATED, { accountId: 123, resource: 'unread', version: 1 })
      await flush()
      assert.equal(network.length, 0)
      assert.equal(fixture.messages.length, 0)
      assert.equal(fixture.timers.size, 0)
      fixture.document.hidden = false
      await fixture.store.setUiActive(true)
      assert.deepEqual(network[0], ['nav', 123])
      assert.equal(fixture.store.unReadMessage.reply, 123)
      assert.equal(fixture.timers.size, 1)
      fixture.document.hidden = true
      await fixture.store.setUiActive(false)
      assert.equal(fixture.timers.size, 0)
      const count = network.length
      mid = 200
      fixture.document.cookie = 'DedeUserID=200'
      fixture.emit(message.LOGIN_STATE_CHANGED)
      fixture.emit(message.INVALIDATED, { accountId: 123, resource: 'unread', version: 2 })
      await flush()
      assert.equal(network.length, count)
      assert.equal(fixture.store.userInfo.mid, undefined)
      fixture.document.hidden = false
      await fixture.store.setUiActive(true)
      assert.deepEqual(network[count], ['nav', 200])
      assert.equal(fixture.store.userInfo.mid, 200)
      assert.equal(fixture.store.unReadMessage.reply, 200)
      await fixture.store.setUiActive(false)
      assert.equal(fixture.timers.size, 0)
    }
    finally { fixture.dispose() }
  })

  check('data TopBar UI: hiding the host does not cancel an authorized Watch Later write', async () => {
    let sends = 0
    const action = await loadSourceModule('../src/utils/watchLater.ts', {
      '~/logic/watchLaterState': { findWatchLaterEntry: () => undefined },
      '~/utils/api': { default: { watchlater: { removeFromWatchLater: async () => {
        sends++
        return { code: 0 }
      } } } },
      '~/utils/main': { getCSRF: () => 'fixture', getUserID: () => '123' },
      '~/utils/pgcEpisode': {},
      '~/utils/watchLaterWrite': await import('../src/utils/watchLaterWrite'),
    })
    const fixture = await createStore((_request, reply) => reply(undefined), { watchLater: action })
    try {
      const write = fixture.store.deleteWatchLaterItem(1)
      await fixture.store.setUiActive(false)
      assert.equal(await write, true)
      assert.equal(sends, 1)
      assert.equal(fixture.timers.size, 0)
    }
    finally { fixture.dispose() }
  })

  check('data WatchLater preview: deletion rewinds the shifted page boundary without losing the next item', async () => {
    const state = Vue.ref({ accountId: 123, count: 22 })
    const update = Vue.ref()
    let items = Array.from({ length: 22 }, (_, index) => ({ aid: index + 1 }))
    const pages = []
    const fixture = await createStore((_request, reply) => reply(undefined), {
      watchLaterState: { watchLaterState: state, watchLaterUpdate: update },
      api: { watchlater: { getWatchLaterListByPage: async ({ pn, ps }) => {
        pages.push(pn)
        return { code: 0, data: { count: items.length, list: items.slice((pn - 1) * ps, pn * ps) } }
      } } },
    })
    try {
      assert.equal(await fixture.store.getWatchLaterPreview(), true)
      await fixture.store.loadMoreWatchLaterList()
      assert.equal(fixture.store.watchLaterList.length, 20)
      items = items.filter(item => item.aid !== 5)
      state.value = { accountId: 123, count: 21 }
      update.value = { type: 'change', accountId: 123, change: { type: 'remove', entry: { aid: 5 } } }
      await Vue.nextTick()
      await fixture.store.loadMoreWatchLaterList()
      await fixture.store.loadMoreWatchLaterList()
      assert.deepEqual(pages, [1, 2, 2, 3])
      assert.deepEqual(Array.from(fixture.store.watchLaterList, item => item.aid), items.map(item => item.aid))
    }
    finally { fixture.dispose() }
  })

  check('data TopBar integration: three actual stores coalesce invalidation during a leased read and publish only unread fields', async () => {
    const protocol = await import('../src/constants/topBarState')
    const source = await loadSourceModule('../src/background/topBarStateBroker.ts', {
      'webextension-polyfill': { default: {} },
      '~/constants/topBarState': protocol,
      '~/constants/contentScript': { CONTENT_SCRIPT_MATCHES: [] },
      '~/utils/messaging': {},
    })
    const pages = new Map()
    const network = []
    const broker = source.createTopBarStateBroker({ tabs: {
      query: async () => [...pages.keys()].map(id => ({ id })),
      sendMessage: async (id, message) => pages.get(id).emit(message.type, message.data),
    } })
    const message = protocol.TOP_BAR_STATE_MESSAGE
    const handlers = { [message.CLAIM_REFRESH]: broker.claimRefresh, [message.PUBLISH]: broker.publish, [message.RELEASE_REFRESH]: broker.releaseRefresh, [message.INVALIDATE]: broker.invalidate }
    for (const id of [1, 2, 3]) {
      const fixture = await createStore((request, reply) => {
        Promise.resolve(handlers[request.type](request.data, { tab: { id } })).then(value => reply(value), error => reply(undefined, String(error)))
      }, { api: { notification: {
        getUnreadMsg: () => new Promise(resolve => network.push({ id, resolve })),
        getUnreadDm: async () => ({ code: 0, data: { follow_unread: 0 } }),
      } } })
      fixture.store.newMomentsCount = 50 + id
      pages.set(id, fixture)
    }
    try {
      const initial = [...pages.values()].map(page => page.store.syncSharedData({ resource: 'unread' }))
      for (let turn = 0; turn < 30 && network.length !== 1; turn++) await flush()
      assert.equal(network.length, 1)
      await broker.invalidate({ accountId: 123, resource: 'unread' })
      await flush()
      assert.equal(network.length, 1)
      network[0].resolve({ code: 0, data: { reply: 99 } })
      await Promise.all(initial)
      for (let turn = 0; turn < 30 && network.length !== 2; turn++) await flush()
      assert.equal(network.length, 2, 'exactly one follow-up read satisfies all three dirty stores')
      network[1].resolve({ code: 0, data: { reply: 2 } })
      for (let turn = 0; turn < 30 && [...pages.values()].some(page => page.store.unReadMessage.reply !== 2); turn++) await flush()
      for (const [id, page] of pages) {
        assert.equal(page.store.unReadMessage.reply, 2)
        assert.equal(page.store.newMomentsCount, 50 + id)
        assert.equal(page.store.watchLaterCount, 4)
      }
      assert.equal(network.length, 2)
    }
    finally { pages.forEach(page => page.dispose()) }
  })
}
