import assert from 'node:assert/strict'

import { loadSourceFunctions } from './sourceFunctionHarness'
import { loadSourceModule } from './sourceModuleHarness'

export function registerRuntimeErrorChecks(check, { Vue, flush, compileComponent }) {
  async function relationsFixture() {
    const account = Vue.reactive({ isLogin: true, userInfo: { mid: 1 } })
    let cookie = '1'
    let now = 10_000
    const requests = []
    const errors = []
    const listeners = new Set()
    const scopes = []
    const messaging = await loadSourceModule('../src/utils/messaging.ts', {
      'webextension-polyfill': { default: { runtime: { sendMessage: (message) => {
        let resolve, reject
        const promise = new Promise((done, fail) => {
          resolve = done
          reject = fail
        })
        requests.push({ message, resolve, reject })
        return promise
      } } } },
    })
    const api = await loadSourceModule('../src/utils/api.ts', { '~/utils/messaging': messaging })
    const module = await loadSourceModule('../src/composables/useUserRelations.ts', {
      '@vueuse/core': await import('@vueuse/core'),
      'vue': Vue,
      '~/stores/topBarStore': { useTopBarStore: () => account },
      '~/utils/accountScope': await import('../src/utils/accountScope'),
      '~/utils/api': api,
      '~/utils/main': { getUserID: () => cookie },
      '~/utils/messaging': messaging,
      '~/utils/userRelation': { onUserRelationChange: (listener) => {
        listeners.add(listener)
        return () => listeners.delete(listener)
      } },
    }, {
      Date: class extends Date { static now() { return now } },
      console: { error: (...args) => errors.push(args) },
    })
    return {
      requests,
      errors,
      listeners,
      consumer() {
        const scope = Vue.effectScope()
        scopes.push(scope)
        return { scope, state: scope.run(module.useUserRelations) }
      },
      changeAccount(mid) {
        cookie = String(mid)
        account.userInfo.mid = mid
      },
      advance(ms) { now += ms },
      dispose() { scopes.forEach(scope => scope.stop()) },
    }
  }

  check('relations invalidation: real message transport stops unsent chunks, settles joined readers and remains terminal after remount', async () => {
    for (const failure of ['Extension context invalidated.', 'Could not establish connection. Receiving end does not exist.']) {
      const fixture = await relationsFixture()
      const first = fixture.consumer()
      const second = fixture.consumer()
      try {
        const seed = first.state.batchQueryUserRelations([10])
        fixture.requests[0].resolve({ code: 0, data: { 10: { attribute: 2 } } })
        await seed
        const known = first.state.userRelations.value[10]
        const mids = Array.from({ length: 81 }, (_, index) => index + 100)
        const read = first.state.batchQueryUserRelations(mids)
        let joinedSettled = false
        const joined = second.state.batchQueryUserRelations([100, 140, 180]).then(() => {
          joinedSettled = true
        })
        assert.equal(fixture.requests.length, 2)
        assert.equal(fixture.requests[1].message.type, 'getRelations')
        assert.equal(fixture.requests[1].message.data.fids.split(',').length, 40)
        fixture.requests[1].reject(new Error(failure))
        await flush()
        assert.equal(fixture.requests.length, 2, 'the remaining two chunks must not be sent')
        assert.equal(joinedSettled, true, 'readers of both sent and unsent MIDs are released')
        await Promise.all([read, joined])
        assert.equal(first.state.userRelations.value[10], known, 'confirmed relations are not replaced by failure defaults')
        assert.equal(known.isFollowing, true)
        assert.equal(first.state.userRelations.value[100], undefined)
        assert.equal(fixture.errors.length, 0)
        fixture.advance(600_000)
        await first.state.batchQueryUserRelations([2000])
        assert.equal(fixture.requests.length, 2, 'there is no retry after an expired ordinary cooldown')
        first.scope.stop()
        second.scope.stop()
        assert.equal(fixture.listeners.size, 0)
        const remounted = fixture.consumer()
        await remounted.state.batchQueryUserRelations([3000])
        assert.equal(fixture.requests.length, 2, 'new cards cannot revive the same invalidated content-script world')
      }
      finally { fixture.dispose() }
    }
  })

  check('relations invalidation: a stale account rejection terminates current readers and rejects late successful responses', async () => {
    const fixture = await relationsFixture()
    const first = fixture.consumer().state
    const second = fixture.consumer().state
    try {
      const oldRead = first.batchQueryUserRelations([10])
      fixture.changeAccount(2)
      const currentRead = second.batchQueryUserRelations([20])
      let joinedSettled = false
      const joined = first.batchQueryUserRelations([20]).then(() => {
        joinedSettled = true
      })
      assert.equal(fixture.requests.length, 2)
      fixture.requests[0].reject(new Error('Extension context invalidated.'))
      await flush()
      assert.equal(joinedSettled, true)
      fixture.requests[1].resolve({ code: 0, data: { 20: { attribute: 2 } } })
      await Promise.all([oldRead, currentRead, joined])
      assert.equal(second.userRelations.value[20], undefined)
      await second.batchQueryUserRelations([30])
      assert.equal(fixture.requests.length, 2)
      assert.equal(fixture.errors.length, 0)
    }
    finally { fixture.dispose() }
  })

  check('relations ordinary failure: network errors still report, preserve known values and retry after the existing cooldown', async () => {
    const fixture = await relationsFixture()
    const state = fixture.consumer().state
    try {
      const seed = state.batchQueryUserRelations([10])
      fixture.requests[0].resolve({ code: 0, data: { 10: { attribute: 2 } } })
      await seed
      const known = state.userRelations.value[10]
      fixture.advance(300_001)
      const failed = state.batchQueryUserRelations([10])
      fixture.requests[1].reject(new Error('Network unavailable'))
      await failed
      assert.equal(fixture.errors.length, 1)
      assert.equal(state.userRelations.value[10], known)
      await state.batchQueryUserRelations([10])
      assert.equal(fixture.requests.length, 2)
      fixture.advance(30_001)
      const retry = state.batchQueryUserRelations([10])
      fixture.requests[2].resolve({ code: 0, data: null })
      await retry
      assert.equal(state.userRelations.value[10].isFollowing, false)
      assert.equal(fixture.errors.length, 1)
    }
    finally { fixture.dispose() }
  })

  check('image protocols: real LazyPicture keeps HTTPS through preferred formats, fallback and source changes', async () => {
    const { normalizeBilibiliImageUrl } = await import('../src/utils/bilibiliUrl')
    const insecure = 'http://i0.hdslb.com/bfs/dm/37e551c7af2fc4c15737d4bd142783f4c03cec90.png'
    const secure = insecure.replace('http:', 'https:')
    assert.equal(normalizeBilibiliImageUrl(insecure), secure)
    assert.equal(normalizeBilibiliImageUrl(insecure.slice(5)), secure)
    const { parsePrivateEmotePanel } = await import('../src/contentScripts/views/Notifications/whisper/privateMessageRenderers')
    const panel = parsePrivateEmotePanel({ code: 0, data: { packages: [{ id: 1, text: 'fixture', url: insecure, emote: [{ id: 2, text: '[fixture]', url: insecure }] }] } })
    assert.equal(panel[0].iconUrl, secure)
    assert.equal(panel[0].emotes[0].url, secure)
    const { createOptimisticPrivateImageMessage, reconcileOptimisticPrivateMessages } = await import('../src/contentScripts/views/Notifications/whisper/experimental/privateMessageTransactions')
    const optimistic = createOptimisticPrivateImageMessage({ localId: 'fixture', objectUrl: 'blob:https://www.bilibili.com/fixture', senderId: '1', receiverId: '2', timestamp: 1 })
    optimistic.serverMediaUrl = insecure
    const confirmed = { ...optimistic, localId: undefined, msgKey: 'server-1', seqno: '1', content: { type: 'image', src: secure, width: 1, height: 1 } }
    assert.equal(reconcileOptimisticPrivateMessages([optimistic, confirmed], 'fixture').reconciled, true, 'HTTPS display normalization preserves upload/history reconciliation')
    assert.equal(reconcileOptimisticPrivateMessages([optimistic, { ...confirmed, content: { ...confirmed.content, src: `${secure}?other=1` } }], 'fixture').reconciled, false)
    for (const other of ['blob:https://www.bilibili.com/fixture', 'data:image/png;base64,fixture', 'http://example.org/image.png'])
      assert.equal(normalizeBilibiliImageUrl(other), other)
    const Component = await compileComponent('../src/components/LazyPicture.vue')
    const src = Vue.ref(insecure)
    const host = document.body.appendChild(document.createElement('div'))
    const app = Vue.createApp({ render: () => Vue.h(Component, { src: src.value, loading: 'eager' }) })
    app.config.globalProperties.$t = key => key
    try {
      app.mount(host)
      await flush()
      const first = host.querySelector('img')
      assert.equal(first.getAttribute('src'), secure)
      assert.equal(host.querySelector('source').getAttribute('srcset'), `${secure}.avif`)
      src.value = secure
      await flush()
      assert.equal(host.querySelector('img'), first, 'equivalent protocol spelling does not restart loading')
      first.dispatchEvent(new Event('error'))
      await flush()
      assert.equal(host.querySelectorAll('source').length, 0)
      assert.equal(host.querySelector('img').getAttribute('src'), secure)
      host.querySelector('img').dispatchEvent(new Event('error'))
      await flush()
      assert.ok(host.querySelector('.lazy-picture-error'))
      src.value = 'http://i1.hdslb.com/bfs/archive/another.jpg'
      await flush()
      assert.equal(host.querySelector('img').getAttribute('src'), src.value.replace('http:', 'https:'))
    }
    finally {
      app.unmount()
      host.remove()
    }
  })

  check('playback metadata: copied images are normalized before insertion; original native nodes stay intact', async () => {
    const source = document.createElement('div')
    source.innerHTML = '<span>12</span><img src="http://i0.hdslb.com/bfs/dm/fixture.png">'
    const metadataSlot = document.createElement('div')
    const replace = metadataSlot.replaceChildren.bind(metadataSlot)
    metadataSlot.replaceChildren = (node) => {
      assert.equal(node.querySelector('img').getAttribute('src'), 'https://i0.hdslb.com/bfs/dm/fixture.png')
      replace(node)
    }
    const module = await loadSourceFunctions('../src/utils/bewlyWidescreen/videoInfo.ts', ['syncVideoMetadata'], {
      isPgcPlaybackPage: () => false,
      selectors: { metadata: ['.video-info-meta'] },
      findMovable: () => source,
      ...(await import('../src/utils/bilibiliUrl')),
    })
    assert.equal(module.syncVideoMetadata({ metadataSlot }), true)
    const clone = metadataSlot.firstElementChild
    module.syncVideoMetadata({ metadataSlot })
    assert.equal(metadataSlot.firstElementChild, clone)
    assert.equal(source.querySelector('img').getAttribute('src'), 'http://i0.hdslb.com/bfs/dm/fixture.png')
  })

  check('comment-root discovery: duplicate selectors reuse one root without forcing layout; multiple roots retain visibility priority', async () => {
    const root = document.createElement('div')
    const first = root.appendChild(document.createElement('div'))
    first.id = 'comment'
    first.className = 'commentapp'
    let measurements = 0
    Object.defineProperty(first, 'offsetParent', { get: () => {
      measurements++
      return null
    } })
    const module = await loadSourceFunctions('../src/utils/bewlyWidescreen/nativeDom.ts', ['findCommentRoot'], {
      selectors: { comment: ['#comment', '.commentapp'] },
      ROOT_ID: 'bewly-widescreen-root',
      isLikelyCommentRoot: () => true,
    })
    for (let turn = 0; turn < 100; turn++)
      assert.equal(module.findCommentRoot(root), first)
    assert.equal(measurements, 0)
    const visible = root.appendChild(document.createElement('div'))
    visible.className = 'commentapp'
    Object.defineProperty(visible, 'offsetParent', { get: () => root })
    assert.equal(module.findCommentRoot(root), visible)
    assert.equal(measurements, 1)
    assert.equal(module.findCommentRoot(document.createElement('div')), null)
  })

  async function cloudFixture({ local = {}, remote = {}, entries = {}, time = 0, rejectWrite } = {}) {
    const protocol = await import('../src/utils/settingsCloudSyncProtocol')
    const storageProtocol = await import('../src/utils/settingsStorageProtocol')
    const listeners = new Set()
    const timers = new Map()
    const alarms = new Map()
    const writes = []
    const errors = []
    const activities = []
    let alarmListener
    let now = time
    local[protocol.SETTINGS_CLOUD_SYNC_ENABLED_KEY] = true
    const emit = (changes, area) => listeners.forEach(listener => listener(changes, area))
    const browser = {
      extension: { inIncognitoContext: false },
      storage: {
        local: {
          get: async keys => Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map(key => [key, structuredClone(local[key])])),
          set: async (data) => {
            const changes = Object.fromEntries(Object.entries(data).map(([key, value]) => [key, { oldValue: local[key], newValue: structuredClone(value) }]))
            Object.assign(local, structuredClone(data))
            queueMicrotask(() => emit(changes, 'local'))
          },
        },
        sync: {
          get: async () => structuredClone(remote),
          set: async (data) => {
            writes.push({ at: now, data: structuredClone(data) })
            if (rejectWrite)
              throw new Error(rejectWrite)
            Object.assign(remote, structuredClone(data))
            emit(Object.fromEntries(Object.entries(data).map(([key, value]) => [key, { newValue: value }])), 'sync')
          },
        },
        onChanged: { addListener: listener => listeners.add(listener) },
      },
      alarms: {
        create: async (name, info) => { alarms.set(name, info.when) },
        clear: async name => alarms.delete(name),
        onAlarm: { addListener: (listener) => { alarmListener = listener } },
      },
      tabs: { onActivated: { addListener: listener => activities.push(listener) } },
      windows: { onFocusChanged: { addListener: listener => activities.push(listener) } },
    }
    class Clock extends Date {
      static now() { return now }
    }
    const timing = {
      Date: Clock,
      setTimeout: (callback, delay) => {
        timers.set(callback, now + delay)
        return callback
      },
      clearTimeout: callback => timers.delete(callback),
    }
    const writePolicy = await loadSourceModule('../src/background/settingsCloudSyncWrites.ts', { '~/utils/settingsCloudSyncProtocol': protocol }, timing)
    const module = await loadSourceModule('../src/background/settingsCloudSync.ts', {
      'webextension-polyfill': { default: browser },
      '~/utils/settingsCloudSyncProtocol': protocol,
      '~/utils/settingsStorageProtocol': storageProtocol,
      './settingsContextRelay': { onSettingsMessage() {} },
      './settingsCloudSyncWrites': writePolicy,
      './settingsStorageCoordinator': {
        reconcileSettingsCloudSyncSnapshot: async () => ({ uploads: { ...entries } }),
        collectSettingsCloudSyncEntries: async fields => Object.fromEntries(fields.filter(field => entries[field]).map(field => [field, entries[field]])),
        applySettingsCloudSyncChanges: async () => ({ uploads: {} }),
      },
    }, { ...timing, console: { warn: (...args) => errors.push(args), error: (...args) => errors.push(args) } })
    module.setupSettingsCloudSync()
    for (let turn = 0; turn < 20 && timers.size === 0 && alarms.size === 0; turn++)
      await flush()
    return {
      writes,
      errors,
      local,
      remote,
      alarms,
      timers,
      entries,
      status: () => local[protocol.SETTINGS_CLOUD_SYNC_STATUS_KEY],
      activity: () => activities.forEach(callback => callback()),
      async edit(field, value, counter) {
        const before = entries[field]?.version
        entries[field] = { schemaVersion: 1, deleted: false, value, version: { counter, deviceId: 'fixture' } }
        emit({ [storageProtocol.SETTINGS_STORAGE_META_KEY]: { oldValue: { cloudSyncInitialized: true, fieldVersions: { [field]: before } }, newValue: { cloudSyncInitialized: true, fieldVersions: { [field]: entries[field].version } } } }, 'local')
        await flush()
      },
      async advance(ms) {
        now += ms
        for (let pass = 0; pass < 8; pass++) {
          for (const [callback, at] of timers) {
            if (at <= now) {
              timers.delete(callback)
              callback()
            }
          }
          for (const [name, at] of alarms) {
            if (at <= now) {
              alarms.delete(name)
              alarmListener({ name })
            }
          }
          await flush()
        }
      },
    }
  }

  const entry = value => ({ schemaVersion: 1, deleted: false, value, version: { counter: 1, deviceId: 'fixture' } })
  check('cloud sync: hourly quota persists, edits coalesce and alarm recovery writes only the latest value', async () => {
    const failure = 'This request exceeds the MAX_WRITE_OPERATIONS_PER_HOUR quota.'
    const fixture = await cloudFixture({ entries: { theme: entry('light') }, rejectWrite: failure })
    await fixture.advance(1500)
    assert.equal(fixture.writes.length, 1)
    assert.equal(fixture.status().blockedByQuotaCount, 1)
    assert.equal(fixture.status().failedCount, 0)
    assert.match(fixture.status().lastError, /MAX_WRITE_OPERATIONS_PER_HOUR/)
    assert.equal(fixture.status().retryAt, 1500 + 3_601_000)
    await fixture.edit('theme', 'dark', 2)
    for (let count = 0; count < 20; count++) fixture.activity()
    await fixture.advance(60_000)
    assert.equal(fixture.writes.length, 1, 'activity and new edits cannot bypass an hourly cooldown')
    assert.equal(fixture.errors.length, 0, 'quota is visible as a blocked state, not repeated exception logging')
    const restarted = await cloudFixture({ local: fixture.local, remote: fixture.remote, entries: fixture.entries, time: 61_500 })
    await restarted.advance(1500)
    assert.equal(restarted.writes.length, 0, 'worker restart preserves the cooldown')
    await restarted.advance(3_602_500 - 63_000)
    assert.equal(restarted.writes.length, 1)
    assert.equal(Object.values(restarted.writes[0].data)[0].value, 'dark')
    assert.equal(restarted.status().blockedByQuotaCount, 0)
    assert.equal(restarted.status().retryAt, 0)
    assert.equal(restarted.status().lastError, '')
  })

  check('cloud sync: continuous local changes respect a persistent write-cycle floor', async () => {
    const fixture = await cloudFixture({ entries: { scale: entry(0) } })
    for (let step = 1; step <= 120; step++) {
      await fixture.edit('scale', step, step + 1)
      await fixture.advance(500)
    }
    await fixture.advance(5000)
    assert.ok(fixture.writes.length <= 14)
    for (let index = 1; index < fixture.writes.length; index++)
      assert.ok(fixture.writes[index].at - fixture.writes[index - 1].at >= 5000)
    assert.equal(Object.values(fixture.writes.at(-1).data)[0].value, 120)
    assert.equal(fixture.errors.length, 0)
    console.log(`PERF cloud fixture: 120 edits coalesced into ${fixture.writes.length} upload cycles`)
  })

  check('cloud sync: minute quota and pre-existing hourly failure wait; ordinary errors still report failure', async () => {
    const minute = await cloudFixture({ entries: { theme: entry('dark') }, rejectWrite: 'MAX_WRITE_OPERATIONS_PER_MINUTE' })
    await minute.advance(1500)
    assert.equal(minute.status().retryAt, 62_500)
    const protocol = await import('../src/utils/settingsCloudSyncProtocol')
    const existing = await cloudFixture({ entries: { theme: entry('light') }, local: { [protocol.SETTINGS_CLOUD_SYNC_STATUS_KEY]: { lastError: 'MAX_WRITE_OPERATIONS_PER_HOUR' } } })
    await existing.advance(1500)
    assert.equal(existing.writes.length, 0)
    assert.equal(existing.status().blockedByQuotaCount, 1)
    const failed = await cloudFixture({ entries: { theme: entry('light') }, rejectWrite: 'storage temporarily unavailable' })
    await failed.advance(1500)
    assert.equal(failed.status().failedCount, 1)
    assert.equal(failed.status().retryAt, 0)
    assert.equal(failed.errors.length, 1)
    await failed.advance(2000)
    assert.equal(failed.writes.length, 1, 'generic retries also obey the write floor')
  })
}
