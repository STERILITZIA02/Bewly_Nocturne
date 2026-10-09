import assert from 'node:assert/strict'

import { loadSourceModule } from './sourceModuleHarness'

function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

function eventSource() {
  const listeners = new Set()
  return {
    listeners,
    addListener: fn => listeners.add(fn),
    removeListener: fn => listeners.delete(fn),
    emit: (...args) => [...listeners].map(fn => fn(...args)),
  }
}

async function deadlineModule(timers = new Map()) {
  let timerId = 0
  return {
    timers,
    module: await loadSourceModule('../src/utils/abort.ts', {}, {
      DOMException,
      setTimeout: (fn, delay) => {
        timers.set(++timerId, { fn, delay })
        return timerId
      },
      clearTimeout: id => timers.delete(id),
    }),
  }
}

export function registerDataConsistencyChecks(check, { Vue, flush }) {
  async function until(condition) {
    for (let turn = 0; turn < 16 && !condition(); turn++)
      await flush()
    assert.ok(condition(), 'expected asynchronous test stage was not reached')
  }
  check('data reads: ordinary and anonymous search ports abort fetch/body and preserve request allowlists', async () => {
    const abort = await deadlineModule()
    const protocol = await import('../src/constants/apiRequest')
    const searchApi = await import('../src/constants/searchApi')
    const storage = { get: async () => ({}), set: async () => {}, remove: async () => {} }
    const extension = {
      extension: { inIncognitoContext: false },
      cookies: { get: async () => ({ value: '100' }), getAll: async () => [{ name: 'DedeUserID', value: '100' }] },
      storage: { local: storage, session: storage },
      runtime: { onConnect: eventSource(), onMessage: eventSource() },
    }
    const requests = []
    const fetch = (url, init) => {
      const task = deferred()
      requests.push({ url, init, ...task })
      // Deliberately ignore the signal: the deadline must settle even a stuck body.
      return task.promise
    }
    const wbi = await loadSourceModule('../src/background/wbiSign.ts', {
      'md5': await import('md5'),
      '~/utils/abort': abort.module,
    }, { fetch, globalThis: { fetch }, Date, URL, JSON })
    const keyRuntime = { storage, fetch, now: Date.now, getCookies: extension.cookies.getAll }
    for (const options of [{ mid: '100' }, { noCookie: true }])
      wbi.storeWbiKeys('https://i/abcdefghijklmnopqrstuvwxyz012345.png', 'https://i/012345abcdefghijklmnopqrstuvwxyz.png', options, keyRuntime)
    const request = await loadSourceModule('../src/background/utils.ts', {
      'webextension-polyfill': { default: extension },
      '~/utils/abort': abort.module,
      './wbiSign': wbi,
    }, { fetch, URLSearchParams, Response, DOMException })
    const search = await loadSourceModule('../src/background/messageListeners/api/search.ts', {
      'webextension-polyfill': { default: extension },
      '~/constants/searchApi': searchApi,
      '~/utils/abort': abort.module,
      '../../utils': request,
    })
    const messaging = await loadSourceModule('../src/utils/messaging.ts', {
      'webextension-polyfill': { default: extension },
      '~/utils/abort': abort.module,
      '~/constants/apiRequest': protocol,
    })
    const endpointImports = Object.fromEntries(['anime', 'auth', 'favorite', 'history', 'live', 'moment', 'notification', 'ranking', 'user', 'video', 'watchLater'].map(name => [`./${name}`, { default: {} }]))
    const api = await loadSourceModule('../src/background/messageListeners/api/index.ts', {
      ...endpointImports,
      'webextension-polyfill': { default: extension },
      '~/constants/apiRequest': protocol,
      '~/utils/messaging': messaging,
      '../../utils': request,
      '../../messageServerSettings': { default: {} },
      '../../privateMessage': { default: {} },
      './search': search,
    })
    api.setupApiMsgListeners()
    const ports = []
    extension.runtime.connect = ({ name }) => {
      const client = { name, onMessage: eventSource(), onDisconnect: eventSource() }
      const server = { name, sender: { tab: { id: 1, incognito: false } }, onMessage: eventSource(), onDisconnect: eventSource() }
      client.postMessage = value => queueMicrotask(() => server.onMessage.emit(structuredClone(value)))
      server.postMessage = value => queueMicrotask(() => client.onMessage.emit(structuredClone(value)))
      client.disconnect = () => server.onDisconnect.emit()
      ports.push({ client, server })
      extension.runtime.onConnect.emit(server)
      return client
    }
    const settings = Vue.ref({ depersonalizeSearchResults: false })
    const transport = await loadSourceModule('../src/utils/searchRequest.ts', {
      '~/constants/searchApi': searchApi,
      '~/logic': { settings },
      '~/utils/messaging': messaging,
    })
    for (const [anonymous, stage] of [[false, 'fetch'], [true, 'fetch'], [false, 'body'], [true, 'body']]) {
      settings.value.depersonalizeSearchResults = anonymous
      const controller = new AbortController()
      const requestCount = requests.length
      const read = transport.requestSearch({ searchType: 'video', keyword: 'fixture', page: 1 }, controller.signal)
      for (let turn = 0; turn < 8 && requests.length === requestCount; turn++)
        await flush()
      const current = requests.at(-1)
      assert.equal(current.init.credentials, anonymous ? 'omit' : 'include')
      const url = new URL(current.url)
      assert.equal(url.searchParams.get('keyword'), 'fixture')
      assert.equal(url.searchParams.has('signal'), false)
      if (stage === 'body')
        current.resolve(new Response(new ReadableStream({ start() {} }), { headers: { 'content-type': 'application/json' } }))
      await flush()
      controller.abort()
      await assert.rejects(read, error => error.name === 'AbortError')
      assert.equal(current.init.signal.aborted, true)
      assert.equal(ports.at(-1).server.onMessage.listeners.size, 0)
      assert.equal(ports.at(-1).client.onMessage.listeners.size, 0)
      assert.equal(abort.timers.size, 0)
    }
    const read = request.doRequest({ contentScriptQuery: 'fixture' }, { url: 'https://example.test/read', _fetch: { method: 'get' }, afterHandle: request.AHS.J_D })
    requests.at(-1).resolve(new Response(new ReadableStream({ start() {} })))
    await flush()
    const ownerTimer = [...abort.timers.values()][0]
    ownerTimer.fn()
    await assert.rejects(read, error => error.name === 'TimeoutError')
    assert.equal(requests.at(-1).init.signal.aborted, true)
    assert.equal(abort.timers.size, 0)
  })

  check('data reads: cancelling one shared waiter preserves the owner and another consumer', async () => {
    const { module, timers } = await deadlineModule()
    const task = deferred()
    let ownerSignal
    const owner = module.withRequestDeadline((signal) => {
      ownerSignal = signal
      return task.promise
    })
    const controller = new AbortController()
    const first = module.waitWithSignal(owner, controller.signal)
    const second = module.waitWithSignal(owner, new AbortController().signal)
    controller.abort()
    await assert.rejects(first)
    assert.equal(ownerSignal.aborted, false)
    task.resolve(42)
    assert.equal(await second, 42)
    assert.equal(timers.size, 0)
  })

  check('data reads: WBI retry retains the first deadline, writes never inherit read cancellation, nav consumers share only their context', async () => {
    const abort = await deadlineModule()
    const refresh = deferred()
    let signingRefreshes = 0
    const requests = []
    const module = await loadSourceModule('../src/background/utils.ts', {
      'webextension-polyfill': { default: { cookies: { get: async () => ({ value: '100' }) } } },
      '~/utils/abort': abort.module,
      './wbiSign': {
        needsWbiSign: url => url.includes('/wbi/'),
        isBilibiliNavUrl: url => url.endsWith('/nav'),
        getWbiKeys: () => ({}),
        addWbiSign: params => params,
        clearWbiKeys() {},
        storeWbiKeys() {},
        initWbiKeys: () => {
          signingRefreshes++
          return refresh.promise
        },
      },
    }, { Response, URLSearchParams, fetch: (url, init) => {
      const task = deferred()
      requests.push({ ...task, url, init })
      return task.promise
    } })
    const signed = { url: 'https://api.bilibili.com/x/wbi/read', _fetch: { method: 'get' }, afterHandle: module.AHS.J_D }
    const pending = module.doRequest({ contentScriptQuery: 'fixture' }, signed)
    await until(() => requests.length === 1)
    const firstDeadline = [...abort.timers.keys()][0]
    requests[0].resolve(new Response(JSON.stringify({ code: -403 })))
    await until(() => signingRefreshes === 1)
    assert.equal(abort.timers.has(firstDeadline), true)
    abort.timers.get(firstDeadline).fn()
    await assert.rejects(pending, error => error.name === 'TimeoutError')
    refresh.resolve(true)
    await flush()
    assert.equal(requests.length, 1, 'expired signature refresh cannot send another attempt')
    const controller = new AbortController()
    controller.abort()
    const write = module.doRequest({ contentScriptQuery: 'write' }, { ...signed, _fetch: { method: 'post' } }, { signal: controller.signal })
    await until(() => requests.length === 2)
    assert.equal(requests.at(-1).init.signal, undefined)
    requests.at(-1).reject(new Error('unknown write result'))
    await assert.rejects(write)
    assert.equal(requests.length, 2, 'failed writes are not retried without a WBI signature')
    const factory = module.apiListenerFactory({ nav: { url: 'https://api.bilibili.com/x/web-interface/nav', _fetch: { method: 'get' }, afterHandle: module.AHS.J_D } })
    const consumer = new AbortController()
    const first = factory({ contentScriptQuery: 'nav' }, { tab: { id: 1 } }, { signal: consumer.signal })
    const second = factory({ contentScriptQuery: 'nav' }, { tab: { id: 2 } })
    await until(() => requests.length === 3)
    consumer.abort()
    await assert.rejects(first)
    const nav = requests.at(-1)
    assert.equal(nav.init.signal.aborted, false)
    nav.resolve(new Response(JSON.stringify({ code: 0, data: { mid: 100, isLogin: true } })))
    assert.equal((await second).data.mid, 100)
    const before = requests.length
    await factory({ contentScriptQuery: 'nav' }, { tab: { id: 3 } })
    assert.equal(requests.length, before)
    const privateRead = factory({ contentScriptQuery: 'nav' }, { tab: { id: 4, incognito: true } })
    await until(() => requests.length === before + 1)
    assert.equal(requests.length, before + 1)
    requests.at(-1).resolve(new Response(JSON.stringify({ code: 0, data: { mid: 100, isLogin: true } })))
    await privateRead
    assert.equal(abort.timers.size, 0)
  })

  check('data search controller: cancellation cannot clear newer loading; Cookie-first changes and errors remain distinct', async () => {
    const abort = await import('../src/utils/abort')
    const messaging = await loadSourceModule('../src/utils/messaging.ts', {
      'webextension-polyfill': { default: {} },
      '~/utils/abort': abort,
      '~/constants/apiRequest': await import('../src/constants/apiRequest'),
    })
    const calls = []
    const errors = []
    const account = Vue.reactive({ isLogin: true, userInfo: { mid: 100 } })
    let cookie = '100'
    const module = await loadSourceModule('../src/contentScripts/views/SearchResults/composables/useSearchRequest.ts', {
      'vue': Vue,
      'vue-i18n': { useI18n: () => ({ t: key => key }) },
      '~/logic': { settings: Vue.ref({ depersonalizeSearchResults: false }) },
      '~/stores/topBarStore': { useTopBarStore: () => account },
      '~/utils/accountScope': await import('../src/utils/accountScope'),
      '~/utils/abort': abort,
      '~/utils/main': { getUserID: () => cookie },
      '~/utils/messaging': messaging,
      '~/utils/searchRequest': { requestSearch: (_request, signal) => {
        const task = deferred()
        signal.addEventListener('abort', () => task.reject(signal.reason), { once: true })
        calls.push({ ...task, signal })
        return task.promise
      } },
    }, { console: { error: (...args) => errors.push(args) } })
    const scope = Vue.effectScope()
    const controller = scope.run(() => module.useSearchRequest('video'))
    let processed = 0
    const run = keyword => controller.search({ searchType: 'video', keyword }, () => {
      processed++
      return true
    })
    const first = run('first')
    const second = run('second')
    assert.equal(calls[0].signal.aborted, true)
    assert.equal(await first, false)
    assert.equal(controller.isLoading.value, true)
    calls[1].resolve({ code: 0 })
    assert.equal(await second, true)
    assert.equal(controller.isLoading.value, false)
    const stale = run('old-account')
    cookie = '200'
    calls[2].resolve({ code: 0 })
    assert.equal(await stale, false)
    assert.equal(processed, 1)
    account.userInfo.mid = 200
    const timeout = run('timeout')
    calls[3].reject(Object.assign(new Error('Timed out'), { name: 'TimeoutError' }))
    await timeout
    assert.equal(controller.error.value, 'search.errors.timeout')
    const risk = run('risk')
    calls[4].resolve({ code: -412 })
    await risk
    assert.equal(controller.error.value, 'search.errors.risk_control')
    const business = run('failed')
    calls[5].resolve({ code: -400 })
    await business
    assert.equal(controller.error.value, 'search.errors.failed')
    const disposed = run('dispose')
    scope.stop()
    assert.equal(calls[6].signal.aborted, true)
    assert.equal(await disposed, false)
    assert.equal(controller.isLoading.value, false)
    assert.equal(errors.length, 1, 'only the active timeout is diagnostic; cancellation and stale results are silent')
  })

  check('data WBI: overlapping account key reads cannot replace or clear the current account keys', async () => {
    const abort = await deadlineModule()
    const requests = []
    const module = await loadSourceModule('../src/background/wbiSign.ts', { 'md5': await import('md5'), '~/utils/abort': abort.module }, { fetch: globalThis.fetch, crypto })
    let mid = '100'
    const stored = {}
    const runtime = {
      now: Date.now,
      getCookies: async () => [{ name: 'DedeUserID', value: mid }],
      storage: { get: async () => structuredClone(stored), set: async values => Object.assign(stored, structuredClone(values)), remove: async (key) => { delete stored[key] } },
      fetch: async (_url, init) => {
        const task = deferred()
        requests.push({ ...task, init })
        return task.promise
      },
    }
    const old = module.initWbiKeys({ mid }, runtime)
    await until(() => requests.length === 1)
    mid = '200'
    const current = module.initWbiKeys({ mid }, runtime)
    await until(() => requests.length === 2)
    assert.equal(requests.length, 2)
    const response = key => new Response(JSON.stringify({ code: 0, data: { wbi_img: { img_url: `https://i/${key}.png`, sub_url: 'https://i/sub.png' } } }))
    requests[1].resolve(response('new'))
    assert.equal(await current, true)
    requests[0].resolve(response('old'))
    assert.equal(await old, false)
    assert.equal(module.getWbiKeys({ mid: '100' }), null)
    module.clearWbiKeys({ mid: '100' })
    assert.equal(module.getWbiKeys({ mid: '200' }).imgKey, 'new')
    const anonymous = module.initWbiKeys({ noCookie: true }, runtime)
    await until(() => requests.length === 3)
    assert.equal(requests[2].init.credentials, 'omit')
    assert.equal(requests[2].init.headers.Cookie, undefined)
    requests[2].resolve(response('anonymous'))
    assert.equal(await anonymous, true)
    assert.equal(module.getWbiKeys({ mid: '200' }).imgKey, 'new')
    assert.equal(abort.timers.size, 0)
  })

  check('data auth: revoke/re-authorize during persisted verification cannot publish or clear a newer refresh', async () => {
    const abort = await deadlineModule()
    const tokens = Vue.ref({ accessToken: 'one', refreshToken: 'r1', lastUpdatedAt: 1, mid: 100, accessTokenExpiresAt: 0, refreshTokenExpiresAt: null })
    const requests = []
    const persisted = []
    const auth = await loadSourceModule('../src/utils/authProvider.ts', {
      'vue': Vue,
      'webextension-polyfill': { default: { storage: { local: { get() {
        const task = deferred()
        persisted.push(task)
        return task.promise
      } } } } },
      '~/logic/appAuthStorage': { appAuthTokens: tokens, defaultAppAuthTokens: {}, resetAppAuthTokens: () => { tokens.value = {} } },
      './abort': abort.module,
      './appAuthTokenPolicy': await import('../src/utils/appAuthTokenPolicy'),
      './appSign': { appSign: () => 'fixture' },
    }, { URLSearchParams, fetch: (_url, init) => {
      const task = deferred()
      requests.push({ ...task, init })
      return task.promise
    } })
    const first = auth.refreshAppAccessToken()
    requests[0].resolve({ ok: true, json: async () => ({ code: 0, data: { token_info: { access_token: 'late-one' } } }) })
    await flush()
    const old = { ...tokens.value }
    tokens.value = { ...old, accessToken: 'two', refreshToken: 'r2', lastUpdatedAt: 2 }
    const second = auth.refreshAppAccessToken()
    persisted[0].resolve({ appAuthTokens: old })
    assert.equal(await first, false)
    assert.equal(requests[0].init.signal.aborted, true)
    const same = auth.refreshAppAccessToken()
    assert.equal(requests.length, 2, 'old finally cannot clear the new single-flight')
    requests[1].resolve({ ok: true, json: async () => ({ code: 0, data: { token_info: { access_token: 'fresh-two' } } }) })
    await flush()
    persisted[1].resolve({ appAuthTokens: { ...tokens.value } })
    assert.equal(await second, true)
    assert.equal(await same, true)
    assert.equal(tokens.value.accessToken, 'fresh-two')
    assert.equal(abort.timers.size, 0)
  })

  check('data settings: complete snapshots bypass slow writes; missing metadata is serialized once', async () => {
    const protocol = await import('../src/utils/settingsStorageProtocol')
    const handlers = new Map()
    const slow = deferred()
    let stored = { settings: JSON.stringify({ mode: 1 }), [protocol.SETTINGS_STORAGE_META_KEY]: { epoch: 'e1', deviceId: 'd1', revision: 0 } }
    let sets = 0
    let blockWrite = true
    const module = await loadSourceModule('../src/background/settingsStorageCoordinator.ts', {
      'webextension-polyfill': { default: { storage: { onChanged: eventSource(), local: {
        get: async () => structuredClone(stored),
        set: async (values) => {
          sets++
          if (blockWrite)
            await slow.promise
          Object.assign(stored, structuredClone(values))
        },
      } } } },
      '~/utils/settingsStorageProtocol': protocol,
      '~/utils/settingsCloudSyncProtocol': await import('../src/utils/settingsCloudSyncProtocol'),
      './settingsContextRelay': { onSettingsMessage: (name, fn) => handlers.set(name, fn) },
    }, { crypto: { randomUUID: () => `fixture-${sets}` } })
    module.setupSettingsStorageCoordinator()
    const patch = handlers.get(protocol.SETTINGS_STORAGE_PATCH_MESSAGE)({ clientId: 'a', operationId: 1, epoch: 'e1', patch: { set: { mode: 2 }, remove: [] } })
    await flush()
    const read = await handlers.get(protocol.SETTINGS_STORAGE_READ_MESSAGE)()
    assert.equal(JSON.parse(read.storedValue).mode, 1)
    assert.equal(sets, 1)
    slow.resolve()
    await patch
    stored = { settings: '{}' }
    blockWrite = false
    const results = await Promise.all(Array.from({ length: 3 }, () => handlers.get(protocol.SETTINGS_STORAGE_READ_MESSAGE)()))
    assert.equal(new Set(results.map(value => value.epoch)).size, 1)
    assert.equal(sets, 2)
  })

  check('data settings: same-turn edits coalesce, ACK captures unqueued edits, old epoch cannot resurrect', async () => {
    const protocol = await import('../src/utils/settingsStorageProtocol')
    const abort = await deadlineModule()
    const changes = eventSource()
    const writes = []
    let stored = { mode: 1, nested: { number: 1 } }
    const module = await loadSourceModule('../src/composables/useSettingsStorage.ts', {
      'vue': Vue,
      'webextension-polyfill': { default: { storage: { onChanged: changes } } },
      '~/utils/abort': abort.module,
      '~/utils/sidebarCoverSettings': await import('../src/utils/sidebarCoverSettings'),
      '~/utils/settingsStorageProtocol': protocol,
      '~/utils/messaging': { isExtensionContextInvalidatedError: () => false, sendMessage: (type, body) => {
        if (type === protocol.SETTINGS_STORAGE_READ_MESSAGE)
          return Promise.resolve({ accepted: true, epoch: 'e1', revision: 0, storedValue: JSON.stringify(stored) })
        const task = deferred()
        writes.push({ ...task, type, body })
        return task.promise
      } },
    }, { crypto, structuredClone })
    const scope = Vue.effectScope()
    const settings = scope.run(() => module.useSettingsStorage(stored))
    await flush()
    const nested = settings.value.nested
    for (let i = 2; i <= 101; i++) settings.value.mode = i
    assert.equal(settings.value.mode, 101, 'UI stays synchronous')
    assert.equal(writes.length, 0)
    await flush()
    assert.equal(writes.length, 1, '100 changes issue one patch')
    // Deliver a synchronous storage event before Vue can flush the edit watcher.
    settings.value.nested.number = 2
    stored = { mode: 101, nested: { number: 1 }, remote: true }
    changes.emit({ settings: { newValue: JSON.stringify(stored) }, [protocol.SETTINGS_STORAGE_META_KEY]: { newValue: { epoch: 'e1', revision: 1 } } }, 'local')
    assert.equal(settings.value.nested, nested)
    assert.equal(settings.value.nested.number, 2)
    writes[0].resolve({ accepted: true, epoch: 'e1', revision: 1, storedValue: JSON.stringify(stored) })
    await flush()
    assert.equal(writes[1].body.patch.set.nested.number, 2)
    settings.value.mode = 999
    changes.emit({ settings: { newValue: JSON.stringify({ mode: 3, nested: { number: 3 } }) }, [protocol.SETTINGS_STORAGE_META_KEY]: { newValue: { epoch: 'e2', revision: 0 } } }, 'local')
    writes[1].resolve({ accepted: true, epoch: 'e1', revision: 2, storedValue: '{}' })
    await flush()
    assert.equal(settings.value.mode, 3)
    assert.equal(writes.length, 2)
    scope.stop()
  })

  check('data settings: bounded local display stays degraded/read-only until authority; disposal flushes captured edits', async () => {
    const protocol = await import('../src/utils/settingsStorageProtocol')
    const abort = await deadlineModule()
    const listeners = eventSource()
    const read = deferred()
    const writes = []
    let timerId = 1000
    const module = await loadSourceModule('../src/composables/useSettingsStorage.ts', {
      'vue': Vue,
      'webextension-polyfill': { default: { storage: { onChanged: listeners, local: { get: async () => ({ settings: JSON.stringify({ mode: 9 }), [protocol.SETTINGS_STORAGE_META_KEY]: { epoch: 'e1', revision: 3 } }) } } } },
      '~/utils/abort': abort.module,
      '~/utils/sidebarCoverSettings': await import('../src/utils/sidebarCoverSettings'),
      '~/utils/settingsStorageProtocol': protocol,
      '~/utils/messaging': { isExtensionContextInvalidatedError: () => false, sendMessage: (type, body) => {
        if (type === protocol.SETTINGS_STORAGE_READ_MESSAGE)
          return read.promise
        const task = deferred()
        writes.push({ ...task, body })
        return task.promise
      } },
    }, {
      crypto,
      structuredClone,
      setTimeout: (fn, delay) => {
        abort.timers.set(++timerId, { fn, delay })
        return timerId
      },
      clearTimeout: id => abort.timers.delete(id),
    })
    const scope = Vue.effectScope()
    const state = scope.run(() => module.useSettingsStorage({ mode: 1 }, { normalize: (value) => {
      value.derived ??= 'default'
    } }))
    const fallback = [...abort.timers].find(([, timer]) => timer.delay === 1500)
    abort.timers.delete(fallback[0])
    fallback[1].fn()
    await flush()
    assert.equal(state.value.mode, 9)
    assert.equal(state.displayReady.value, true)
    assert.equal(state.initializationState.value, 'degraded')
    assert.equal(writes.length, 0)
    state.value.mode = 10
    await flush()
    assert.equal(writes.length, 0, 'degraded UI cannot send defaults or edits yet')
    read.resolve({ accepted: true, epoch: 'e1', revision: 4, storedValue: JSON.stringify({ mode: 12, derived: 'user' }) })
    await flush()
    assert.equal(state.initializationState.value, 'loaded')
    assert.equal(state.value.mode, 10)
    assert.equal(state.value.derived, 'user')
    assert.deepEqual(Object.keys(writes[0].body.patch.set), ['mode'])
    writes[0].resolve({ accepted: true, epoch: 'e1', revision: 5, storedValue: JSON.stringify({ mode: 10, derived: 'user' }) })
    await state.flush()
    state.value.mode = 11
    scope.stop()
    assert.equal(writes.length, 2, 'ordinary disposal captures an edit before the batched watcher')
    writes[1].resolve({ accepted: true, epoch: 'e1', revision: 6, storedValue: JSON.stringify({ mode: 11, derived: 'user' }) })
    await state.flush()
    assert.equal(listeners.listeners.size, 0)
    assert.equal(abort.timers.size, 0)
    const policy = await import('../src/utils/settingsBootPolicy')
    assert.equal(policy.canStartSettingsDependentBoot('degraded', false, true), true)
    assert.equal(policy.canStartSettingsDependentBoot('degraded', false, false), false)
  })

  check('data settings: actual coordinator import/clear retires old ACKs and pending edits across two clients', async () => {
    const protocol = await import('../src/utils/settingsStorageProtocol')
    const changes = eventSource()
    const handlers = new Map()
    let stored = { settings: JSON.stringify({ mode: 1 }), [protocol.SETTINGS_STORAGE_META_KEY]: { epoch: 'e1', deviceId: 'd1', revision: 0 } }
    let barrier
    const writeStarted = deferred()
    const storage = {
      get: async () => structuredClone(stored),
      set: async (values) => {
        if (barrier && values.settings !== undefined) {
          const waiting = barrier
          barrier = undefined
          writeStarted.resolve()
          await waiting.promise
        }
        const event = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { oldValue: stored[key], newValue: structuredClone(value) }]))
        Object.assign(stored, structuredClone(values))
        changes.emit(event, 'local')
      },
      remove: async (key) => { delete stored[key] },
    }
    const extension = { storage: { local: storage, onChanged: changes } }
    const coordinator = await loadSourceModule('../src/background/settingsStorageCoordinator.ts', {
      'webextension-polyfill': { default: extension },
      '~/utils/settingsStorageProtocol': protocol,
      '~/utils/settingsCloudSyncProtocol': await import('../src/utils/settingsCloudSyncProtocol'),
      './settingsContextRelay': { onSettingsMessage: (type, handler) => handlers.set(type, handler) },
    }, { crypto })
    coordinator.setupSettingsStorageCoordinator()
    const imports = []
    const patchCalls = []
    const errors = []
    let lostReplies = 0
    let faultClientId = ''
    async function client() {
      const source = await loadSourceModule('../src/composables/useSettingsStorage.ts', {
        'vue': Vue,
        'webextension-polyfill': { default: extension },
        '~/utils/abort': { ...(await import('../src/utils/abort')), waitForDelay: async () => {} },
        '~/utils/sidebarCoverSettings': await import('../src/utils/sidebarCoverSettings'),
        '~/utils/settingsStorageProtocol': protocol,
        '~/utils/messaging': { isExtensionContextInvalidatedError: () => false, sendMessage: async (type, value) => {
          if (type === protocol.SETTINGS_STORAGE_IMPORT_MESSAGE)
            imports.push(structuredClone(value))
          if (type === protocol.SETTINGS_STORAGE_PATCH_MESSAGE)
            patchCalls.push(structuredClone(value))
          const result = await handlers.get(type)(structuredClone(value))
          if (type === protocol.SETTINGS_STORAGE_PATCH_MESSAGE && value.clientId === faultClientId && lostReplies > 0) {
            lostReplies--
            throw new Error('Lost settings ACK')
          }
          return result
        } },
      }, { crypto, structuredClone })
      const scope = Vue.effectScope()
      const state = scope.run(() => source.useSettingsStorage({ mode: 1 }, { onError: error => errors.push(error) }))
      await state.flush()
      return { scope, state }
    }
    const a = await client()
    const b = await client()
    const blocked = deferred()
    barrier = blocked
    a.state.value.mode = 2
    await writeStarted.promise
    const imported = a.state.import({ mode: 9 })
    assert.equal(a.state.value.mode, 9)
    a.state.value.mode = 10 // a new edit in the importing generation
    b.state.value.mode = 4 // a stale peer edit in the old epoch
    await flush()
    blocked.resolve()
    await imported
    await a.state.flush()
    await flush()
    assert.equal(JSON.parse(stored.settings).mode, 10)
    assert.equal(b.state.value.mode, 10)
    const meta = structuredClone(stored[protocol.SETTINGS_STORAGE_META_KEY])
    await handlers.get(protocol.SETTINGS_STORAGE_IMPORT_MESSAGE)(imports[0])
    assert.equal(stored[protocol.SETTINGS_STORAGE_META_KEY].epoch, meta.epoch)
    assert.equal(stored[protocol.SETTINGS_STORAGE_META_KEY].revision, meta.revision, 'duplicate import never rotates or re-applies')
    changes.emit({ settings: { newValue: JSON.stringify({ mode: 2 }) }, [protocol.SETTINGS_STORAGE_META_KEY]: { newValue: { epoch: 'e1', revision: 99 } } }, 'local')
    assert.equal(a.state.value.mode, 10, 'a retired-epoch event cannot revive old settings')
    const previous = structuredClone(stored)
    stored = {}
    a.state.value.mode = 55
    changes.emit({ settings: { oldValue: previous.settings }, [protocol.SETTINGS_STORAGE_META_KEY]: { oldValue: previous[protocol.SETTINGS_STORAGE_META_KEY] } }, 'local')
    await handlers.get(protocol.SETTINGS_STORAGE_READ_MESSAGE)()
    await flush()
    assert.equal(a.state.value.mode, 1)
    assert.equal(stored.settings, undefined, 'clear never writes old queued edits or defaults back')
    faultClientId = imports[0].clientId
    lostReplies = 5
    const callCount = patchCalls.length
    a.state.value.mode = 20
    await assert.rejects(a.state.flush(), /Lost settings ACK/)
    assert.equal(errors.length, 1)
    assert.equal(new Set(patchCalls.slice(callCount).map(call => call.operationId)).size, 1)
    b.state.value.mode = 30
    await b.state.flush()
    a.state.value.extra = 'new edit'
    await a.state.flush()
    assert.equal(JSON.parse(stored.settings).mode, 30, 'a previously committed operation cannot overwrite a later peer edit on retry')
    assert.equal(JSON.parse(stored.settings).extra, 'new edit')
    a.scope.stop()
    b.scope.stop()
  })

  check('data settings: invalid extension contexts stop initial and write retries and release listeners', async () => {
    const protocol = await import('../src/utils/settingsStorageProtocol')
    for (const phase of ['initial', 'write']) {
      const changes = eventSource()
      let calls = 0
      const source = await loadSourceModule('../src/composables/useSettingsStorage.ts', {
        'vue': Vue,
        'webextension-polyfill': { default: { storage: { onChanged: changes } } },
        '~/utils/abort': await import('../src/utils/abort'),
        '~/utils/sidebarCoverSettings': await import('../src/utils/sidebarCoverSettings'),
        '~/utils/settingsStorageProtocol': protocol,
        '~/utils/messaging': {
          isExtensionContextInvalidatedError: error => String(error).includes('Extension context invalidated'),
          sendMessage: async (type) => {
            calls++
            if (phase === 'write' && type === protocol.SETTINGS_STORAGE_READ_MESSAGE)
              return { accepted: true, epoch: 'e1', revision: 0, storedValue: '{"mode":1}' }
            throw new Error('Extension context invalidated.')
          },
        },
      }, { crypto, structuredClone })
      const scope = Vue.effectScope()
      const state = scope.run(() => source.useSettingsStorage({ mode: 1 }, { onError: () => assert.fail('terminal context error must not become a retryable storage warning') }))
      if (phase === 'write') {
        await state.flush()
        state.value.mode = 2
        await assert.rejects(state.flush())
      }
      else {
        await until(() => state.initializationState.value === 'invalidated')
      }
      assert.equal(state.initializationState.value, 'invalidated')
      assert.equal(changes.listeners.size, 0)
      const settledCalls = calls
      state.value.mode = 3
      await flush()
      await assert.rejects(state.flush())
      assert.equal(calls, settledCalls)
      assert.equal(calls, phase === 'initial' ? 1 : 2)
      scope.stop()
    }
  })

  check('data TopBar: three force claims share one lease; in-flight invalidation coalesces and partial updates stay isolated', async () => {
    const protocol = await import('../src/constants/topBarState')
    const updates = []
    const stored = {}
    const module = await loadSourceModule('../src/background/topBarStateBroker.ts', {
      'webextension-polyfill': { default: {} },
      '~/constants/topBarState': protocol,
      '~/constants/contentScript': { CONTENT_SCRIPT_MATCHES: ['*://*.bilibili.com/*'] },
      '~/utils/messaging': { onMessage() {} },
    })
    const extension = {
      storage: { session: { get: async () => structuredClone(stored), set: async value => Object.assign(stored, structuredClone(value)) } },
      tabs: { query: async () => [1, 2, 3].map(id => ({ id, incognito: false })), sendMessage: async (id, message) => updates.push({ id, ...structuredClone(message) }) },
    }
    const broker = module.createTopBarStateBroker(extension)
    const request = { accountId: 100, resource: 'unread', maxAge: 300_000, force: true }
    const claims = await Promise.all([1, 2, 3].map(id => broker.claimRefresh(request, { tab: { id } })))
    assert.equal(claims.filter(claim => claim.shouldRefresh).length, 1)
    await broker.invalidate({ accountId: 100, resource: 'unread' })
    const blocked = await Promise.all([1, 2, 3].map(id => broker.claimRefresh(request, { tab: { id } })))
    assert.equal(blocked.filter(claim => claim.shouldRefresh).length, 0, 'invalidation retains the existing lease')
    await broker.publish({ ...request, ...claims[0], snapshot: { unReadMessage: { reply: 9 }, unReadDm: {} } })
    assert.equal(updates.filter(update => update.type === protocol.TOP_BAR_STATE_MESSAGE.UPDATED).length, 0, 'old version is never published fresh')
    const fresh = await Promise.all([1, 2, 3].map(id => broker.claimRefresh({ ...request, force: false }, { tab: { id } })))
    assert.equal(fresh.filter(claim => claim.shouldRefresh).length, 1)
    await broker.publish({ ...request, ...fresh[0], snapshot: { unReadMessage: { reply: 2 }, unReadDm: {}, newMomentsCount: 999 } })
    const published = updates.find(update => update.type === protocol.TOP_BAR_STATE_MESSAGE.UPDATED)
    assert.deepEqual(Object.keys(published.data.snapshot).sort(), ['unReadDm', 'unReadMessage'])
    const moments = await broker.claimRefresh({ ...request, resource: 'moments', force: false })
    assert.equal(moments.shouldRefresh, true, 'unread freshness cannot mark moments fresh')
    const restarted = module.createTopBarStateBroker(extension)
    assert.equal((await restarted.claimRefresh({ ...request, force: false })).snapshot.unReadMessage.reply, 2)
    assert.equal((await restarted.claimRefresh(request, { tab: { incognito: true } })).shouldRefresh, true)
  })

  async function watchLaterFixture() {
    const abort = await deadlineModule()
    const model = await import('../src/utils/watchLaterSnapshot')
    const protocol = await import('../src/constants/watchLaterState')
    const module = await loadSourceModule('../src/background/watchLaterStateBroker.ts', {
      '~/utils/abort': abort.module,
      '~/utils/watchLaterSnapshot': model,
    }, { crypto })
    const stored = {}
    let mid = 100
    let truth = [{ aid: 1, bvid: 'BV1NyeA6zESV', epid: 11 }]
    const reads = []
    const updates = []
    let nextRead
    const dependencies = {
      storageKey: 'fixture',
      storage: { get: async () => structuredClone(stored), set: async values => Object.assign(stored, structuredClone(values)) },
      account: async () => ({ accountId: mid, csrf: `csrf-${mid}` }),
      read: async (full, signal) => {
        reads.push({ full, signal })
        if (nextRead) {
          const read = nextRead
          nextRead = undefined
          return read.promise
        }
        return { code: 0, data: { count: truth.length, list: full ? structuredClone(truth) : truth.slice(0, 1) } }
      },
      broadcast: async update => updates.push(structuredClone(update)),
    }
    const broker = module.createWatchLaterStateBroker(dependencies)
    return { broker, module, dependencies, protocol, model, reads, updates, stored, setMid: (value) => {
      mid = value
    }, setTruth: (value) => {
      truth = value
    }, deferRead: () => {
      nextRead = deferred()
      return nextRead
    } }
  }

  check('data WatchLater: count is short, three consumers share membership, writes broadcast ordered deltas without full rereads', async () => {
    const fixture = await watchLaterFixture()
    const { broker, reads, updates } = fixture
    await Promise.all([1, 2, 3].map(() => broker.readCount(100, true)))
    assert.deepEqual(reads.map(read => read.full), [false])
    const states = await Promise.all([1, 2, 3].map(() => broker.readMembership(100, true)))
    assert.deepEqual(reads.map(read => read.full), [false, true])
    assert.equal(states[0].complete, true)
    const before = reads.length
    for (const aid of [2, 3, 4]) {
      const result = await broker.write(100, 'csrf-100', { type: 'add', entry: { aid } }, async () => ({ code: 0 }))
      assert.equal(result.watchLaterUpdate.type, 'change')
    }
    assert.equal(reads.length, before, 'confirmed additions never trigger a full network reread')
    const changes = updates.filter(update => update.type === 'change')
    assert.equal(new Set(changes.map(update => update.operationId)).size, 3)
    assert.equal(changes[1].baseRevision, changes[0].revision)
    assert.equal((await broker.readMembership(100)).entries.length, 4)
    fixture.setMid(200)
    let sent = 0
    await assert.rejects(broker.write(100, 'csrf-100', { type: 'clear' }, async () => {
      sent++
      return { code: 0 }
    }))
    assert.equal(sent, 0)
  })

  check('data WatchLater: stale read overlays a confirmed write; failed writes roll back and restart never replays unknown sends', async () => {
    const fixture = await watchLaterFixture()
    const { broker } = fixture
    await broker.readMembership(100)
    const old = fixture.deferRead()
    const read = broker.readMembership(100, true)
    await flush()
    await broker.write(100, 'csrf-100', { type: 'remove', entry: { aid: 1 } }, async () => ({ code: 0 }))
    fixture.setTruth([])
    old.resolve({ code: 0, data: { count: 1, list: [{ aid: 1 }] } })
    assert.equal((await read).entries.length, 0)
    const rejected = await broker.write(100, 'csrf-100', { type: 'add', entry: { aid: 2 } }, async () => ({ code: -412 }))
    assert.equal(rejected.code, -412)
    assert.equal((await broker.readMembership(100)).entries.length, 0)
    let sends = 0
    const sent = deferred()
    void broker.write(100, 'csrf-100', { type: 'add', entry: { aid: 3 } }, () => {
      sends++
      sent.resolve()
      return new Promise(() => {})
    })
    await sent.promise
    assert.ok(fixture.stored.fixture['100'].sending)
    fixture.setTruth([{ aid: 3 }])
    const restarted = fixture.module.createWatchLaterStateBroker(fixture.dependencies)
    const state = await restarted.readMembership(100)
    assert.equal(state.entries[0].aid, 3)
    assert.equal(sends, 1, 'worker restart uses only an authoritative read')
  })

  check('data WatchLater: partial preview deletion preserves count, stale pages keep their cursor and clear then add converges', async () => {
    const fixture = await watchLaterFixture()
    const { broker, reads, updates } = fixture
    const page = list => ({ code: 0, data: { count: 30, list: list.map(aid => ({ aid })) } })
    await broker.readPage(100, async () => page([1, 2, 3]))
    const partial = updates.at(-1).snapshot
    assert.equal(partial.complete, false)
    assert.deepEqual(partial.entries.map(item => item.aid), [1, 2, 3])
    const removed = await broker.write(100, 'csrf-100', { type: 'remove', entry: { aid: 2 } }, async () => ({ code: 0 }))
    assert.equal(removed.watchLaterUpdate.count, 29, 'a known positive in a partial page is already included in count')
    assert.equal((await broker.readCount(100)).count, 29)
    assert.equal(reads.length, 0, 'preview deletion does not fetch the full membership or an extra count')
    let attempts = 0
    const current = { code: 0, data: { count: 29, list: [{ aid: 1 }, { aid: 3 }, { aid: 4 }] } }
    const result = await broker.readPage(100, async () => ++attempts === 1 ? page([1, 2, 3]) : current)
    assert.deepEqual(result.data.list, current.data.list)
    assert.equal(attempts, 2, 'same-revision stale server pages are retried without shortening the page')
    assert.equal(reads.length, 0)
    fixture.setTruth(Array.from({ length: 29 }, (_, index) => ({ aid: index + 3 })))
    await assert.rejects(broker.readPage(100, async () => page([1, 2, 3])), /changed during read/)
    assert.equal(updates.at(-1).snapshot.entries.some(item => item.aid === 2), false)
    await broker.write(100, 'csrf-100', { type: 'clear' }, async () => ({ code: 0 }))
    await broker.write(100, 'csrf-100', { type: 'add', entry: { aid: 50 } }, async () => ({ code: 0 }))
    fixture.setTruth([{ aid: 50 }])
    const before = reads.length
    assert.deepEqual(structuredClone((await broker.readMembership(100, true)).entries), [{ aid: 50 }])
    assert.equal(reads.length - before, 1, 'a confirmed clear followed by an add matches the final server set')
    const newer = await broker.readPage(100, async () => ({ code: 0, data: { count: 1, list: [{ aid: 50 }] } }))
    assert.equal(newer.data.list[0].aid, 50)
  })

  check('data WatchLater: count-only reconciliation protects recent writes and yields to repeated authoritative observations', async () => {
    const fixture = await watchLaterFixture()
    const { broker, reads } = fixture
    await broker.readMembership(100)
    await broker.write(100, 'csrf-100', { type: 'remove', entry: { aid: 1 } }, async () => ({ code: 0 }))
    await assert.rejects(broker.readCount(100, true), /awaiting server reconciliation/)
    assert.equal((await broker.readCount(100)).count, 0)
    assert.equal((await broker.readCount(100, true)).count, 1)
    assert.deepEqual(reads.map(read => read.full), [true, false, false, false], 'count-only consumers never request the full list')
  })

  check('data WatchLater: actual client rejects duplicate/out-of-order/old-account projections and uses aid/BV/EP indexes', async () => {
    const fixture = await watchLaterFixture()
    const document = { cookie: 'DedeUserID=100', hidden: false }
    const listeners = new Map()
    const client = await loadSourceModule('../src/logic/watchLaterState.ts', {
      'vue': Vue,
      '~/constants/watchLaterState': fixture.protocol,
      '~/constants/topBarState': await import('../src/constants/topBarState'),
      '~/logic/loginStatus': await import('../src/logic/loginStatus'),
      '~/utils/watchLaterSnapshot': fixture.model,
      '~/utils/messaging': { isExtensionContextInvalidatedError: () => false, onMessage: (name, callback) => listeners.set(name, callback) },
      '~/utils/api': { default: { watchlater: {
        getWatchLaterState: async options => ({ code: 0, data: structuredClone(await fixture.broker.readMembership(options.accountId, options.force)) }),
        getWatchLaterCount: async options => ({ code: 0, data: structuredClone(await fixture.broker.readCount(options.accountId, options.force)) }),
      } } },
    }, { document })
    assert.equal(client.isInWatchLater({ aid: 1 }), undefined)
    await fixture.broker.readPage(100, async () => ({ code: 0, data: { count: 30, list: [{ aid: 1, bvid: 'BV1NyeA6zESV', epid: 11 }] } }))
    client.applyWatchLaterUpdate(fixture.updates.at(-1))
    assert.equal(client.isInWatchLater({ bvid: 'BV1NyeA6zESV' }), true)
    assert.equal(client.isInWatchLater({ aid: 2 }), undefined, 'a partial list cannot prove absence')
    const invalidated = await fixture.broker.invalidate(100)
    client.applyWatchLaterUpdate(invalidated)
    assert.equal(client.isInWatchLater({ aid: 1 }), undefined, 'invalidation discards stale positive evidence')
    assert.equal(await client.ensureWatchLaterState(), true)
    assert.equal(client.isInWatchLater({ bvid: 'BV1NyeA6zESV' }), true)
    assert.equal(client.findWatchLaterEntry({ epid: 11 }).aid, 1)
    const first = await fixture.broker.write(100, 'csrf-100', { type: 'add', entry: { aid: 2 } }, async () => ({ code: 0 }))
    const second = await fixture.broker.write(100, 'csrf-100', { type: 'remove', entry: { aid: 2 } }, async () => ({ code: 0 }))
    client.applyWatchLaterUpdate(second.watchLaterUpdate)
    await client.ensureWatchLaterState()
    client.applyWatchLaterUpdate(first.watchLaterUpdate)
    client.applyWatchLaterUpdate(second.watchLaterUpdate)
    assert.equal(client.isInWatchLater({ aid: 2 }), false)
    assert.equal(fixture.reads.length, 1, 'a delivery gap reuses the owner compact snapshot, not a network reload')
    document.cookie = 'DedeUserID=200'
    client.applyWatchLaterUpdate(first.watchLaterUpdate)
    assert.equal(client.isInWatchLater({ aid: 1 }), undefined)
  })

  check('data local history: the actual writer preserves concurrent records, clear rejects old tasks, deletion rejects unqueued edits', async () => {
    const model = await import('../src/utils/videoVisitRecord')
    const module = await loadSourceModule('../src/background/videoVisitHistoryCoordinator.ts', {
      './videoVisitHistoryDatabase': await import('../src/background/videoVisitHistoryDatabase'),
      'webextension-polyfill': { default: {} },
      '~/constants/contentScript': {},
      '~/utils/messaging': {},
      '~/utils/videoVisitRecord': model,
    }, { crypto })
    let stored
    const updates = []
    let writes = 0
    const owner = module.createVideoVisitHistoryCoordinator({
      get: async () => structuredClone(stored),
      set: async (value) => {
        stored = structuredClone(value)
        writes++
      },
      broadcast: async value => updates.push(structuredClone(value)),
    })
    const initial = await owner.handle({ type: 'read' })
    const command = (aid, operationId, epoch = initial.epoch, baseRevision = 0) => ({ type: 'record', epoch, baseRevision, operationId, edits: [{ identity: { aid }, record: { visitedAt: 1000 + aid }, baseRevision }] })
    const before = writes
    await Promise.all([owner.handle(command(1, 'tab-a:1')), owner.handle(command(2, 'tab-b:1'))])
    assert.deepEqual(Object.keys(stored.records).sort(), ['av:1', 'av:2'])
    assert.equal(writes - before, 2)
    assert.equal(Object.keys(updates.at(-1).records).length, 1, 'a one-record patch never broadcasts the complete table')
    await owner.handle({ type: 'remove', epoch: initial.epoch, identity: { aid: 1 } })
    await owner.handle(command(1, 'tab-a:late', initial.epoch, 0))
    assert.equal('av:1' in stored.records, false)
    const cleared = await owner.handle({ type: 'clear', epoch: initial.epoch })
    await owner.handle(command(3, 'tab-b:old'))
    assert.deepEqual(stored.records, {})
    await owner.handle({ type: 'migrate', epoch: cleared.epoch, source: 'old-tab', records: { 'av:1': 123 } })
    assert.deepEqual(stored.records, {}, 'an un-migrated old tab cannot resurrect cleared history')
    await owner.handle(command(4, 'tab-b:new', cleared.epoch, 0))
    assert.ok(stored.records['av:4'])
    const legacy = model.pruneVideoVisitHistory({ 'av:9': 1000 })
    assert.equal(model.createVideoHistoryIndex(legacy)({ aid: 9 }).status, 'browsed')
    assert.deepEqual(model.videoHistoryBaseKeys({ id: 9 }), [], 'a card display ID is not an authoritative aid')
    assert.deepEqual(model.videoHistoryBaseKeys({ aid: 9, roomid: 9 }), [])
    assert.notDeepEqual(model.videoHistoryBaseKeys({ bvid: 'BV1NyeA6zESV' }), model.videoHistoryBaseKeys({ bvid: 'BV1nyeA6zESV' }), 'BV payloads are case-sensitive')
    const records = model.applyVideoHistoryEdits({}, [
      { identity: { aid: 9, cid: 91, page: 1, pageCount: 2 }, record: { visitedAt: 1000, playedAt: 1000, progress: 45, duration: 100 } },
      { identity: { aid: 9, cid: 92, page: 2, pageCount: 2 }, record: { visitedAt: 2000, playedAt: 2000, progress: 5, duration: 80 } },
    ])
    const query = model.createVideoHistoryIndex(records)
    assert.equal(query({ aid: 9, page: 1 }).progress, 45)
    assert.equal(query({ aid: 9, cid: 92 }).progress, 5)
    assert.equal(query({ aid: 9 }).progress, undefined, 'unqualified manuscript queries never mix part seconds')
    assert.equal(query({ aid: 9, cid: 93 }), undefined)
    const capped = model.pruneVideoVisitHistory(Object.fromEntries(Array.from({ length: 10_001 }, (_, index) => [`av:${index + 1}`, index + 1])))
    assert.equal(Object.keys(capped).length, 10_000)
  })

  check('data local history clients: two pages merge, legacy is browsing-only, clear defeats delayed records and server progress wins', async () => {
    const model = await import('../src/utils/videoVisitRecord')
    const coordinator = await loadSourceModule('../src/background/videoVisitHistoryCoordinator.ts', {
      './videoVisitHistoryDatabase': await import('../src/background/videoVisitHistoryDatabase'),
      'webextension-polyfill': { default: {} },
      '~/constants/contentScript': {},
      '~/utils/messaging': {},
      '~/utils/videoVisitRecord': model,
    }, { crypto })
    let stored
    const receivers = []
    const owner = coordinator.createVideoVisitHistoryCoordinator({
      get: async () => structuredClone(stored),
      set: async (value) => { stored = structuredClone(value) },
      broadcast: async value => receivers.forEach(receive => receive(structuredClone(value))),
    })
    let delayedRecord
    const normalSiteStorage = new Map([['bewlycat_video_visit_history', JSON.stringify({ 'bv:bv1nyea6zesv': 1000 })]])
    async function page(privateContext = false, activeOwner = owner) {
      const sourceEvents = new Map()
      const siteStorage = privateContext ? new Map([['bewlycat_video_visit_history', JSON.stringify({ 'bv:bv1nyea6zesv': 1000 })]]) : normalSiteStorage
      let legacyReads = 0
      const module = await loadSourceModule('../src/utils/videoVisitHistory.ts', {
        'vue': Vue,
        'webextension-polyfill': { default: { extension: { inIncognitoContext: privateContext }, storage: { local: { remove: async () => {}, get: async () => {
          legacyReads++
          return {}
        } } } } },
        '~/logic': { settings: Vue.ref({ showVideoWatchedBadge: true }), settingsReady: Promise.resolve() },
        '~/utils/abort': await import('../src/utils/abort'),
        '~/utils/playbackTab': await import('../src/utils/playbackTab'),
        '~/utils/playbackProgress': await import('../src/utils/playbackProgress'),
        '~/utils/videoVisitRecord': model,
        '~/utils/messaging': {
          isExtensionContextInvalidatedError: () => false,
          reportRuntimeFailure: (_context, error) => assert.fail(String(error)),
          onMessage: (_type, receive) => receivers.push(receive),
          sendMessage: async (_type, command) => {
            if (command.type === 'record' && delayedRecord) {
              const waiting = delayedRecord
              delayedRecord = undefined
              waiting.started.resolve()
              await waiting.release.promise
            }
            return structuredClone(await activeOwner.handle(structuredClone(command)))
          },
        },
      }, {
        crypto,
        location: { origin: privateContext ? 'https://private-fixture.bilibili.com' : 'https://www.bilibili.com' },
        localStorage: { getItem: key => siteStorage.get(key) ?? null, setItem: (key, value) => siteStorage.set(key, value), removeItem: key => siteStorage.delete(key) },
        window: { addEventListener: (name, fn) => sourceEvents.set(name, fn), removeEventListener: name => sourceEvents.delete(name) },
      })
      return { module, legacyReads: () => legacyReads, dispose: () => sourceEvents.get('pagehide')({ persisted: false }) }
    }
    const a = await page()
    const b = await page()
    for (let i = 0; i < 20; i++) await flush()
    assert.equal(a.module.getVideoWatchState({ bvid: 'BV1NyeA6zESV' }).status, 'browsed')
    const epoch = a.module.videoVisitHistoryEpoch.value
    const recycledIdentity = { aid: 1 }
    a.module.recordVideoVisit(recycledIdentity, 2000)
    recycledIdentity.aid = 99
    b.module.recordVideoWatchProgress({ aid: 2, cid: 21, page: 1, pageCount: 1 }, 40, 100, false, epoch)
    await Promise.all([a.module.flushVideoVisitHistory(), b.module.flushVideoVisitHistory()])
    assert.equal(a.module.getVideoWatchState({ aid: 1 }).status, 'browsed')
    assert.equal(a.module.getVideoWatchState({ aid: 99 }), undefined)
    assert.equal(b.module.getVideoWatchState({ aid: 2, cid: 21 }).progress, 40)
    assert.equal(a.module.getVideoProgressPercentage({ aid: 2, cid: 21 }, 10, 100), 10)
    assert.equal(a.module.getVideoProgressPercentage({ aid: 2, cid: 21 }, -1, 100), 100)
    assert.equal(a.module.getVideoProgressPercentage({ aid: 2, cid: 21 }, undefined, undefined), 40)
    assert.equal(a.module.getVideoProgressPercentage({ aid: 2, cid: 22 }, undefined, undefined), 0)
    const { normalizeWatchLaterItem } = await import('../src/utils/watchLaterList')
    const withoutServerProgress = normalizeWatchLaterItem({ aid: 2, cid: 21, duration: 100 })
    assert.equal(withoutServerProgress.progress, undefined, 'missing server progress is not an explicit zero')
    assert.equal(a.module.getVideoPlaybackProgress(withoutServerProgress, withoutServerProgress.progress, withoutServerProgress.duration).progress, 40)
    assert.equal(a.module.getVideoPlaybackProgress({ aid: 2, cid: 21 }, 0, 100).progress, 0, 'a real server zero retains priority')
    b.module.recordVideoVisit({ aid: 1 }, 3000)
    await a.module.removeVideoVisitHistory({ aid: 1 })
    await b.module.flushVideoVisitHistory()
    assert.equal(a.module.getVideoWatchState({ aid: 1 }), undefined)
    assert.equal(b.module.getVideoWatchState({ aid: 1 }), undefined)
    const delayed = { started: deferred(), release: deferred() }
    delayedRecord = delayed
    b.module.recordVideoVisit({ aid: 3 }, 4000)
    const old = b.module.flushVideoVisitHistory()
    await delayed.started.promise
    await a.module.clearVideoVisitHistory()
    delayed.release.resolve()
    await old
    assert.deepEqual(stored.records, {})
    assert.equal(b.module.getVideoWatchState({ aid: 3 }), undefined)
    assert.equal(b.module.recordVideoWatchProgress({ aid: 3, cid: 31 }, 90, 100, true, epoch), false)
    let privateStored
    const privateOwner = coordinator.createVideoVisitHistoryCoordinator({
      get: async () => structuredClone(privateStored),
      set: async (value) => { privateStored = structuredClone(value) },
      broadcast: async () => {},
    })
    const privatePage = await page(true, privateOwner)
    for (let i = 0; i < 10; i++) await flush()
    assert.equal(privatePage.legacyReads(), 0, 'private history never imports regular extension-local history')
    assert.ok(privateStored.records['bv:bv1nyea6zesv'], 'private site history can still migrate into its own store')
    assert.deepEqual(stored.records, {})
    b.module.recordVideoVisit({ aid: 4 }, 5500)
    await b.module.flushVideoVisitHistory()
    assert.ok(stored.records['av:4'])
    a.dispose()
    b.dispose()
    privatePage.dispose()
    normalSiteStorage.clear()
    const reopened = await page()
    await until(() => reopened.module.videoVisitHistoryEpoch.value && !stored.records['av:4'])
    await flush()
    assert.equal(reopened.module.getVideoWatchState({ aid: 4 }), undefined, 'site-data clearing while no page is alive still clears the migrated history')
    assert.equal(normalSiteStorage.get('bewlycat_video_visit_history_migrated'), 'v2')
    reopened.dispose()
  })

  check('data history database: transactions commit before acknowledgement, worker restart restores, browser contexts stay isolated', async () => {
    const { IDBFactory, IDBObjectStore } = await import('fake-indexeddb')
    const { createVideoVisitHistoryDatabase } = await import('../src/background/videoVisitHistoryDatabase')
    const regularContext = new IDBFactory()
    const privateContext = new IDBFactory()
    const regular = createVideoVisitHistoryDatabase(regularContext)
    const privateStorage = createVideoVisitHistoryDatabase(privateContext, 'private')
    const snapshot = { epoch: 'e1', revision: 1, records: { 'av:1': { visitedAt: 100 } }, deleted: {}, migratedSources: [], migrationClosed: false, recentOperations: [] }
    await regular.set(snapshot)
    snapshot.records['av:1'].visitedAt = 999
    const restarted = createVideoVisitHistoryDatabase(regularContext)
    assert.equal((await restarted.get()).records['av:1'].visitedAt, 100, 'the committed transaction owns a structured copy')
    assert.equal(await privateStorage.get(), undefined)
    await privateStorage.set({ ...snapshot, epoch: 'private', records: { 'av:2': { visitedAt: 200 } } })
    assert.equal((await createVideoVisitHistoryDatabase(privateContext, 'private').get()).epoch, 'private')
    assert.equal((await regular.get()).epoch, 'e1')
    assert.equal(await createVideoVisitHistoryDatabase(new IDBFactory(), 'private').get(), undefined, 'a new private browser context starts with a fresh native database')
    const records = Object.fromEntries(Array.from({ length: 1000 }, (_, i) => [`av:${i + 1}`, { visitedAt: i + 1 }]))
    await regular.set({ ...snapshot, records })
    const originalPut = IDBObjectStore.prototype.put
    const originalDelete = IDBObjectStore.prototype.delete
    let puts = 0
    let deletes = 0
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'records')
        puts++
      return originalPut.apply(this, args)
    }
    IDBObjectStore.prototype.delete = function (...args) {
      if (this.name === 'records')
        deletes++
      return originalDelete.apply(this, args)
    }
    try {
      const changed = { visitedAt: 5000 }
      const next = { ...records, 'av:500': changed }
      delete next['av:1']
      await regular.set({ ...snapshot, revision: 2, records: next }, { records: { 'av:500': changed }, removed: ['av:1'], reset: false })
      assert.equal(puts, 1)
      assert.equal(deletes, 1)
      const result = await regular.get()
      assert.equal(result.records['av:1'], undefined)
      assert.equal(result.records['av:500'].visitedAt, 5000)
      assert.equal(result.revision, 2)
    }
    finally {
      IDBObjectStore.prototype.put = originalPut
      IDBObjectStore.prototype.delete = originalDelete
    }
  })

  check('data playback: main media measures real play, ignores seek/ad/preview, keeps quality identity and separates parts', async () => {
    const abort = await deadlineModule()
    const module = await loadSourceModule('../src/utils/videoPlaybackHistory.ts', { '~/utils/abort': abort.module })
    const video = document.createElement('video')
    const preview = document.createElement('video')
    let time = 0
    let now = 1000
    let src = 'first'
    let duration = 120
    let paused = false
    let seeking = false
    let ended = false
    let ad = false
    let navigation = 'p1'
    let identity = { aid: 100, cid: 1, page: 1, pageCount: 2, duration: 120 }
    Object.defineProperties(video, {
      currentTime: { get: () => time },
      currentSrc: { get: () => src },
      duration: { get: () => duration },
      paused: { get: () => paused },
      seeking: { get: () => seeking },
      ended: { get: () => ended },
      readyState: { value: 4 },
    })
    const records = []
    let flushes = 0
    const tracker = module.createVideoPlaybackHistory({
      media: () => video,
      navigation: () => navigation,
      epoch: () => 'e1',
      eligible: () => true,
      advertisement: () => ad,
      identity: async () => identity,
      now: () => now,
      record: (...args) => records.push(args),
      flush: () => flushes++,
    })
    const tick = (target = video) => {
      time += 0.25
      now += 250
      tracker.event({ type: 'timeupdate', target })
    }
    await tracker.ready(video)
    for (let i = 0; i < 160; i++) tick()
    paused = true
    tracker.event({ type: 'pause', target: video })
    assert.equal(flushes, 4, '160 updates produce four bounded/final progress flushes')
    assert.equal(records.at(-1)[2], 120)
    assert.equal(records.every(record => record[3] === false), true, 'a few seconds never means completed')
    const before = records.length
    for (let i = 0; i < 100; i++) tick(preview)
    paused = false
    ad = true
    for (let i = 0; i < 20; i++) tick()
    assert.equal(records.length, before)
    ad = false
    seeking = true
    tracker.event({ type: 'seeking', target: video })
    time = 119.5
    seeking = false
    tracker.event({ type: 'seeked', target: video })
    tick()
    ended = true
    tracker.event({ type: 'ended', target: video })
    assert.equal(records.at(-1)[3], false)
    navigation = 'p2'
    tracker.invalidate()
    identity = { aid: 100, cid: 2, page: 2, pageCount: 2, duration: 300 }
    const count = records.length
    await tracker.ready(video)
    tick()
    assert.equal(records.length, count, 'old-source frames cannot bind to the next part')
    src = 'second'
    ended = false
    time = 0
    duration = 30 // trial media is shorter than the authoritative part
    await tracker.ready(video)
    for (let i = 0; i < 16; i++) tick()
    assert.equal(records.at(-1)[0].cid, 2)
    assert.equal(records.at(-1)[1], 3)
    src = 'second-hd'
    await tracker.ready(video)
    time = 30
    ended = true
    tracker.event({ type: 'ended', target: video })
    assert.equal(records.at(-1)[3], false, 'trial endings never complete the full part')
    tracker.dispose()
    assert.equal(abort.timers.size, 0)
  })

  check('data history: URI without p, protocol-relative URL and resume require matching archive/episode identity', async () => {
    const { getHistoryUrl, getHistoryResumeUrl } = await import('../src/utils/historyTarget')
    const item = { uri: '//www.bilibili.com/video/BV1NyeA6zESV?from=history#reply', history: { business: 'archive', bvid: 'BV1NyeA6zESV', oid: 1, page: 3 }, progress: 12.8, duration: 100 }
    const target = new URL(getHistoryResumeUrl(item))
    assert.equal(target.searchParams.get('p'), '3')
    assert.equal(target.searchParams.get('t'), '12')
    assert.equal(target.searchParams.get('from'), 'history')
    assert.equal(target.hash, '#reply')
    assert.equal(new URL(getHistoryUrl({ ...item, uri: '' })).searchParams.get('p'), '3')
    for (const uri of ['https://example.com/video/BV1NyeA6zESV', 'https://www.bilibili.com/video/BV14ReF6NEWN', 'https://www.bilibili.com/video/BV1NyeA6zESV?p=2']) {
      assert.equal(getHistoryResumeUrl({ ...item, uri }), undefined)
      assert.equal(getHistoryUrl({ ...item, uri }), uri)
    }
    const pgc = { ...item, uri: '//www.bilibili.com/bangumi/play/ep123?foo=1', history: { business: 'pgc', epid: 123 } }
    assert.equal(new URL(getHistoryResumeUrl(pgc)).searchParams.get('t'), '12')
    assert.equal(getHistoryResumeUrl({ ...pgc, history: { business: 'pgc', epid: 124 } }), undefined)
    assert.equal(getHistoryUrl({ history: { business: 'live', oid: 123 } }), 'https://live.bilibili.com/123')
    assert.equal(getHistoryUrl({ history: { business: 'article', oid: 123, cid: 0 } }), 'https://www.bilibili.com/read/cv123')
  })
}
