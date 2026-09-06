import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import vm from 'node:vm'

import { loadSourceModule } from './sourceModuleHarness'

export function registerTopBarSyncChecks(check, { Vue, flush }) {
  async function createStore(sendMessage) {
    const { createPinia, defineStore, disposePinia } = await import('pinia')
    const messages = []
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
      onMessage: { addListener() {} },
    }
    // Exercise the installed polyfill, including its closed-port -> undefined
    // conversion, followed by the real messaging module and Pinia store.
    const require = createRequire(import.meta.url)
    const context = { chrome: { runtime }, module: { exports: {} }, exports: {} }
    vm.runInNewContext(await readFile(require.resolve('webextension-polyfill'), 'utf8'), context)
    const warnings = []
    const messaging = await loadSourceModule('../src/utils/messaging.ts', { 'webextension-polyfill': { default: context.module.exports } }, { console: { warn: (...args) => warnings.push(args) } })
    const timers = new Map()
    let nextTimer = 0
    const module = await loadSourceModule('../src/stores/topBarStore.ts', {
      'pinia': { defineStore },
      'vue': Vue,
      'vue-toastification': { useToast: () => ({}) },
      '~/components/TopBar/constants/urls': await import('../src/components/TopBar/constants/urls'),
      '~/composables/useCurrentLocationHref': { useCurrentLocationHref: () => Vue.ref('https://www.bilibili.com/video/BV15gtZ6fE2T/') },
      '~/constants/topBarState': await import('../src/constants/topBarState'),
      '~/logic': { settings: Vue.ref({}) },
      '~/logic/loginStatus': await import('../src/logic/loginStatus'),
      '~/logic/uploaderLatestVideoTimes': {},
      '~/stores/settingsStore': { useSettingsStore: () => ({ getEffectiveTopBarSource: () => 'bewly' }) },
      '~/stores/topBarSharedRefresh': await import('../src/stores/topBarSharedRefresh'),
      '~/utils/api': { default: {} },
      '~/utils/effectiveTopBarSource': { showBewlyTopBar: () => true },
      '~/utils/i18n': { i18n: { global: { t: key => key } } },
      '~/utils/main': { getCSRF: () => '', isHomePage: () => false },
      '~/utils/messaging': messaging,
      '~/utils/momentFeedOrder': {},
      '~/utils/momentKey': {},
    }, {
      document: { cookie: 'DedeUserID=123' },
      setTimeout: (callback) => {
        timers.set(++nextTimer, callback)
        return nextTimer
      },
      clearTimeout: id => timers.delete(id),
    })
    const pinia = createPinia()
    const store = module.useTopBarStore(pinia)
    store.userInfo.mid = 123
    store.unReadMessage.reply = 7
    store.watchLaterCount = 4
    return {
      store,
      messages,
      timers,
      warnings,
      dispose() {
        store.cleanup()
        disposePinia(pinia)
      },
    }
  }

  for (const failure of ['closed-port', 'undefined', 'null']) {
    check(`TopBar sync: ${failure} reply stops polling and preserves the current state`, async () => {
      let reply
      const fixture = await createStore((_message, callback) => {
        reply = callback
      })
      try {
        fixture.store.startUpdateTimer()
        const [timerId, tick] = [...fixture.timers][0]
        fixture.timers.delete(timerId)
        tick()
        assert.equal(fixture.messages.length, 1)
        assert.equal(fixture.timers.size, 1, 'the next tick is queued while the claim is pending')
        reply(failure === 'null' ? null : undefined, failure === 'closed-port' ? 'The message port closed before a response was received.' : undefined)
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
        assert.equal(fixture.messages.length, 1, 'later calls must not send another claim or publish an empty snapshot')
        assert.equal(fixture.timers.size, 0)
      }
      finally {
        fixture.dispose()
      }
    })
  }

  check('TopBar sync: valid empty snapshots, refresh leases and recoverable errors retain their behavior', async () => {
    const { TOP_BAR_STATE_MESSAGE: message } = await import('../src/constants/topBarState')
    let claim = { shouldRefresh: false }
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
      claim = { shouldRefresh: true, refreshId: 42 }
      await fixture.store.syncSharedData({ force: true, refresh: async () => {
        fixture.store.unReadMessage.reply = 9
        return true
      } })
      const published = fixture.messages.find(request => request.type === message.PUBLISH)
      assert.equal(published.data.accountId, 123)
      assert.equal(published.data.refreshId, 42)
      assert.equal(published.data.snapshot.unReadMessage.reply, 9)
      assert.equal(fixture.timers.size, 1, 'void publish acknowledgements remain valid')
      claim = { shouldRefresh: false, snapshot: published.data.snapshot }
      fixture.store.unReadMessage.reply = 0
      await fixture.store.syncSharedData()
      assert.equal(fixture.store.unReadMessage.reply, 9)
      claim = { shouldRefresh: true, refreshId: 43 }
      await fixture.store.syncSharedData({ refresh: async () => false })
      const released = fixture.messages.find(request => request.type === message.RELEASE_REFRESH)
      assert.equal(released.data.refreshId, 43)
      assert.equal(fixture.timers.size, 1, 'void release acknowledgements remain valid')
    }
    finally {
      fixture.dispose()
    }
  })
}
