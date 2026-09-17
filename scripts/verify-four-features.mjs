import assert from 'node:assert/strict'
import { webcrypto } from 'node:crypto'

import { loadSourceFunctions } from './sourceFunctionHarness'
import { loadSourceModule } from './sourceModuleHarness'

function deferred() {
  let resolve
  const promise = new Promise(done => resolve = done)
  return { promise, resolve }
}

export function registerFourFeatureChecks(check, { Vue, flush, compileComponent }) {
  check('split contexts: private settings still use the original single patch coordinator', async () => {
    const protocol = await import('../src/utils/settingsStorageProtocol')
    const cloud = await import('../src/utils/settingsCloudSyncProtocol')
    let stored = { [protocol.SETTINGS_STORAGE_KEY]: JSON.stringify({ retained: true }) }
    const listeners = new Set()
    const storage = {
      local: {
        get: async keys => keys === null ? structuredClone(stored) : Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map(key => [key, structuredClone(stored[key])])),
        set: async (values) => {
          const changes = Object.fromEntries(Object.entries(values).map(([key, newValue]) => [key, { oldValue: stored[key], newValue: structuredClone(newValue) }]))
          stored = { ...stored, ...structuredClone(values) }
          queueMicrotask(() => listeners.forEach(listener => listener(changes, 'local')))
        },
        remove: async (key) => {
          const oldValue = stored[key]
          delete stored[key]
          queueMicrotask(() => listeners.forEach(listener => listener({ [key]: { oldValue } }, 'local')))
        },
      },
      onChanged: { addListener: listener => listeners.add(listener), removeListener: listener => listeners.delete(listener) },
    }
    const normalBrowser = { extension: { inIncognitoContext: false }, storage }
    const privateBrowser = { extension: { inIncognitoContext: true }, storage }
    const relayModule = await loadSourceModule('../src/background/settingsContextRelay.ts', {
      'webextension-polyfill': { default: normalBrowser },
      '~/utils/messaging': { onMessage() {} },
      '~/utils/settingsCloudSyncProtocol': cloud,
      '~/utils/settingsStorageProtocol': protocol,
    }, { crypto: webcrypto })
    const normalRelay = relayModule.createSettingsContextRelay(normalBrowser)
    const privateRelay = relayModule.createSettingsContextRelay(privateBrowser)
    const normalMessages = new Map()
    const privateMessages = new Map()
    async function coordinator(extension, relay, messages) {
      const module = await loadSourceModule('../src/background/settingsStorageCoordinator.ts', {
        'webextension-polyfill': { default: extension },
        '~/utils/settingsCloudSyncProtocol': cloud,
        '~/utils/settingsStorageProtocol': protocol,
        './settingsContextRelay': { onSettingsMessage: (type, handler) => messages.set(type, relay.register(type, handler)) },
      }, { crypto: webcrypto })
      module.setupSettingsStorageCoordinator()
    }
    await coordinator(normalBrowser, normalRelay, normalMessages)
    await coordinator(privateBrowser, privateRelay, privateMessages)
    const initial = await normalMessages.get(protocol.SETTINGS_STORAGE_READ_MESSAGE)()
    const patch = (clientId, set) => ({ clientId, operationId: 1, epoch: initial.epoch, patch: { set, remove: [] } })
    const [normal, privateResult] = await Promise.all([
      normalMessages.get(protocol.SETTINGS_STORAGE_PATCH_MESSAGE)(patch('normal', { normalField: 1 })),
      privateMessages.get(protocol.SETTINGS_STORAGE_PATCH_MESSAGE)(patch('private', { privateField: 2 })),
    ])
    assert.equal(normal.accepted, true)
    assert.equal(privateResult.accepted, true)
    assert.deepEqual(JSON.parse(stored[protocol.SETTINGS_STORAGE_KEY]), { retained: true, normalField: 1, privateField: 2 })
    const read = await privateMessages.get(protocol.SETTINGS_STORAGE_READ_MESSAGE)()
    assert.equal(read.revision, 2)
    await privateMessages.get(protocol.SETTINGS_STORAGE_PATCH_MESSAGE)(patch('private', { privateField: 2 }))
    assert.equal((await normalMessages.get(protocol.SETTINGS_STORAGE_READ_MESSAGE)()).revision, 2, 'existing operation IDs remain idempotent across contexts')
    assert.equal(Object.keys(stored).some(key => key.startsWith('bewly:private-settings:')), false)
    assert.equal(listeners.size, 2, 'only normal reset and relay listeners survive completed requests')
  })

  check('open tabs view: reopens running progress, refreshes unconfirmed candidates and releases only its subscription', async () => {
    const store = Vue.reactive({ isLogin: true, userInfo: { mid: 1 } })
    let cookie = '1'
    const listeners = new Set()
    const commands = []
    let snapshot = { id: 'running', accountId: 1, incognito: false, status: 'running', items: [] }
    const module = await loadSourceModule('../src/composables/useOpenTabsWatchLater.ts', {
      'vue': Vue,
      'webextension-polyfill': { default: { runtime: { onMessage: { addListener: fn => listeners.add(fn), removeListener: fn => listeners.delete(fn) } } } },
      '~/constants/openTabsWatchLater': await import('../src/constants/openTabsWatchLater'),
      '~/stores/topBarStore': { useTopBarStore: () => store },
      '~/utils/main': { getUserID: () => cookie },
      '~/utils/messaging': { sendMessage: async (_name, data) => {
        commands.push(data.action)
        return snapshot
      } },
    })
    let scope = Vue.effectScope()
    const first = scope.run(() => module.useOpenTabsWatchLater())
    await flush()
    assert.equal(first.task.value.id, 'running')
    assert.deepEqual(commands, ['get'])
    scope.stop()
    assert.deepEqual(commands, ['get', 'unsubscribe'])
    assert.equal(listeners.size, 0)
    snapshot = { ...snapshot, id: 'candidate', status: 'ready' }
    scope = Vue.effectScope()
    const second = scope.run(() => module.useOpenTabsWatchLater())
    await flush()
    assert.deepEqual(commands.slice(-2), ['get', 'prepare'])
    cookie = '2'
    store.userInfo.mid = 2
    await flush()
    for (const callback of listeners)
      callback({ type: 'watchLater:open-tabs:updated', data: snapshot })
    assert.equal(second.task.value, null, 'old-account push cannot revive the old task')
    scope.stop()
    assert.equal(commands.includes('stop'), false, 'closing a view never cancels the background task')
  })

  check('new settings: import accepts the new link mode and boolean, rejects invalid/video-card expansion', async () => {
    const settings = { value: { topBarLinkOpenMode: 'currentTabIfNotHomepage', searchBarLinkOpenMode: 'currentTabIfNotHomepage', videoCardLinkOpenMode: 'newTab', autoRemoveWatchLaterOnEnd: false } }
    const module = await loadSourceFunctions('../src/components/Settings/Advanced/Maintenance.vue', ['handleImportFile', 'matchesSettingType', 'hasBlockedProperty', 'isPlainObject', 'blockedPropertyNames', 'settingEnumValues'], {
      ...(await import('../src/utils/sidebarCoverSettings')),
      settings,
      originalSettings: { ...settings.value },
      settingValueValidators: {},
      FileReader: class {
        readAsText(file) {
          this.result = file
          this.onload()
        }
      },
      toast: { success() {}, warning() {}, error() { assert.fail('import failed') } },
      t: key => key,
    })
    module.handleImportFile({ target: { files: [JSON.stringify({ topBarLinkOpenMode: 'currentTabIfHomepage', searchBarLinkOpenMode: 'currentTabIfHomepage', videoCardLinkOpenMode: 'currentTabIfHomepage', autoRemoveWatchLaterOnEnd: true })] } })
    assert.deepEqual({ ...settings.value }, { topBarLinkOpenMode: 'currentTabIfHomepage', searchBarLinkOpenMode: 'currentTabIfHomepage', videoCardLinkOpenMode: 'newTab', autoRemoveWatchLaterOnEnd: true })
    module.handleImportFile({ target: { files: [JSON.stringify({ topBarLinkOpenMode: 'invalid', autoRemoveWatchLaterOnEnd: 'true' })] } })
    assert.equal(settings.value.topBarLinkOpenMode, 'currentTabIfHomepage')
    assert.equal(settings.value.autoRemoveWatchLaterOnEnd, true)
  })

  check('auto removal: authority-first removal and manual deletion share the actual single write', async () => {
    const write = deferred()
    const member = deferred()
    let mid = '1'
    let reads = 0
    let sends = 0
    let commits = 0
    const module = await loadSourceModule('../src/utils/watchLater.ts', {
      '~/utils/api': { default: { watchlater: { removeFromWatchLater: () => {
        sends++
        return write.promise
      } } } },
      '~/utils/main': { getUserID: () => mid, getCSRF: () => 'csrf' },
      '~/utils/pgcEpisode': {},
      '~/utils/watchLaterWrite': await import('../src/utils/watchLaterWrite'),
    })
    const membership = {
      isLogin: true,
      userInfo: { mid: 1 },
      isInWatchLater: () => true,
      ensureWatchLaterState: () => {
        reads++
        return member.promise
      },
      commitWatchLaterMutation: async () => { commits++ },
    }
    const owner = { accountId: 1, isCurrent: () => true }
    const resolve = async () => 101
    const cancelled = module.updateOwnedWatchLater({ aid: 101 }, 'removeIfPresent', owner, membership, resolve)
    await flush()
    mid = '2'
    member.resolve(true)
    assert.equal((await cancelled).status, 'cancelled')
    assert.equal(sends, 0, 'Cookie-first account change prevents sending')
    mid = '1'
    const manual = module.updateOwnedWatchLater({ aid: 101 }, 'remove', owner, membership, resolve)
    const automatic = module.updateOwnedWatchLater({ aid: 101 }, 'removeIfPresent', owner, membership, resolve)
    await flush()
    assert.equal(sends, 1)
    write.resolve({ code: 0 })
    await Promise.all([manual, automatic])
    assert.equal(commits, 1)
    assert.equal(reads, 2)
  })

  check('refresh prompt: stable buttons, explicit confirmation, finite timeout and visible retry', async () => {
    const copy = {
      ...(await import('../src/constants/refreshTabs')).getRefreshTabsCopy('en'),
      currentVersion: '0.1.1',
      refresh: 'Refresh',
      later: 'Later',
      missingTitle: 'Refresh needed',
      missingDescription: 'Disconnected',
      updatedTitle: 'Updated',
      updatedDescription: 'Update',
    }
    const timers = new Map()
    const messages = []
    let hang = false
    const result = { id: 'refresh', sourceTabId: 1, incognito: false, running: false, items: [{ tabId: 1, url: window.location.href, status: 'pending' }, { tabId: 2, url: window.location.href, status: 'success' }] }
    const previousConfirm = window.confirm
    window.confirm = () => true
    const context = await loadSourceFunctions('../src/background/contentScriptRefreshPrompt.ts', ['showRefreshPrompt'], {
      window,
      document,
      location: window.location,
      performance: { timeOrigin: 1 },
      getComputedStyle,
      matchMedia: () => ({ matches: false }),
      chrome: { runtime: { sendMessage: async (message) => {
        messages.push(message.data.action)
        if (hang)
          return new Promise(() => {})
        if (message.data.action === 'finish') {
          assert.match(document.getElementById('bewlycat-refresh-required').shadowRoot.querySelector('[data-refresh-status]').textContent, /Refreshed 1/)
          result.items[0].status = 'success'
        }
        return result
      } } },
      setTimeout: (callback, delay) => {
        if (delay < 1000)
          queueMicrotask(callback)
        else timers.set(callback, delay)
        return callback
      },
      clearTimeout: callback => timers.delete(callback),
    })
    try {
      context.showRefreshPrompt(copy)
      const host = document.getElementById('bewlycat-refresh-required')
      const button = host.shadowRoot.querySelector('[data-refresh-all]')
      button.focus()
      context.showRefreshPrompt({ ...copy, reasonDescription: 'More specific diagnosis' })
      assert.equal(host.shadowRoot.querySelector('[data-refresh-all]'), button)
      assert.equal(host.shadowRoot.activeElement, button)
      await button.onclick({ isTrusted: true })
      assert.deepEqual(messages, ['start', 'finish', 'status'])
      assert.equal(button.disabled, false)
      hang = true
      const pending = button.onclick({ isTrusted: true })
      await flush()
      for (const [callback, delay] of timers) {
        if (delay === 5000)
          callback()
      }
      await pending
      assert.equal(button.disabled, false)
      assert.equal(host.shadowRoot.querySelector('[data-refresh-status]').textContent, copy.refreshAllFailed)
      window.confirm = () => false
      const count = messages.length
      await button.onclick({ isTrusted: true })
      assert.equal(messages.length, count)
      host.remove()
    }
    finally {
      window.confirm = previousConfirm
      document.getElementById('bewlycat-refresh-required')?.remove()
    }
  })

  check('open tabs: strict identities, multipart dedupe, existing membership and unknown SS', async () => {
    const episodes = await loadSourceModule('../src/utils/pgcEpisode.ts', { '~/utils/api': { default: {} } })
    assert.equal(episodes.findPgcEpisodeVideoIds({ episodes: [{ id: 1, aid: 10 }] }, 2), undefined, 'never substitute the first episode')
    assert.equal(episodes.findPgcEpisodeVideoIds({ section: [{ episodes: [{ id: 2, aid: 20 }] }] }, 2).aid, 20)
    const { parsePlaybackTabUrl } = await import('../src/utils/playbackTab')
    const { createOpenTabsWatchLaterTask } = await import('../src/background/openTabsWatchLaterTask')
    const { countOpenTabsTask } = await import('../src/constants/openTabsWatchLater')
    for (const url of ['https://evil.test/video/BV1xx411c7mD/', 'https://space.bilibili.com/1?bvid=BV1xx411c7mD', 'https://www.bilibili.com/?aid=1', 'https://www.bilibili.com/video/avNaN', 'https://www.bilibili.com/video/av9007199254740992'])
      assert.equal(parsePlaybackTabUrl(url), undefined)
    const urls = ['/video/BV1xx411c7mD/?p=1', '/video/BV1xx411c7mD/?p=2', '/video/av1', '/list/watchlater?bvid=BV1xx411c7mD', '/bangumi/play/ep2', '/bangumi/play/ss3', '/video/av4']
    const task = { id: 'one', accountId: 1, incognito: false, status: 'ready', items: urls.map((path, tabId) => ({ tabId, windowId: tabId % 2, incognito: false, url: `https://www.bilibili.com${path}`, target: parsePlaybackTabUrl(`https://www.bilibili.com${path}`), title: path, status: 'pending' })) }
    let reads = 0
    let reconciles = 0
    const sends = []
    const owner = createOpenTabsWatchLaterTask(task, {
      accountCurrent: async () => true,
      sourceCurrent: async () => true,
      readMembership: async () => {
        reads++
        return [4]
      },
      resolveAid: async item => 'seasonId' in item.target ? undefined : item.target.aid ?? item.target.epid ?? 1,
      add: async (aid) => {
        sends.push(aid)
        return { code: 0 }
      },
      changed: async () => {},
      reconcile: async () => { reconciles++ },
    })
    const first = owner.start()
    assert.equal(owner.start(), first, 'duplicate start shares the active task')
    await first
    assert.deepEqual(sends, [1, 2])
    assert.equal(reads, 1)
    assert.equal(reconciles, 1)
    assert.equal(task.items[5].reason, 'unresolved')
    assert.deepEqual(countOpenTabsTask(task), { total: 7, added: 2, skipped: 5, failed: 0, unprocessed: 0 })
    console.log('PERF open-tabs fixture: 7 tabs, 1 membership read, 2 writes, 1 final invalidation')
  })

  check('open tabs: account/source changes at every await, stop settles sent work, safe retry only', async () => {
    const { createOpenTabsWatchLaterTask } = await import('../src/background/openTabsWatchLaterTask')
    const make = () => ({ id: 'task', accountId: 1, incognito: false, status: 'ready', items: [1, 2, 3].map(aid => ({ tabId: aid, windowId: 1, url: `https://www.bilibili.com/video/av${aid}`, incognito: false, target: { aid }, title: String(aid), status: 'pending' })) })
    for (const stage of ['membership', 'resolve', 'persist', 'source']) {
      const task = make()
      let current = true
      const sends = []
      const owner = createOpenTabsWatchLaterTask(task, {
        accountCurrent: async () => current,
        sourceCurrent: async () => stage !== 'source',
        readMembership: async () => {
          if (stage === 'membership')
            current = false
          return []
        },
        resolveAid: async (item) => {
          if (stage === 'resolve')
            current = false
          return item.target.aid
        },
        changed: async () => {
          if (stage === 'persist' && task.items[0].status === 'sending')
            current = false
        },
        add: async (aid) => {
          sends.push(aid)
          return { code: 0 }
        },
        reconcile: async () => {},
      })
      await owner.start()
      assert.deepEqual(sends, [], `${stage} never sends under the wrong identity`)
    }
    const storageFailure = make()
    let changes = 0
    await createOpenTabsWatchLaterTask(storageFailure, {
      accountCurrent: async () => true,
      sourceCurrent: async () => true,
      readMembership: async () => [],
      resolveAid: async item => item.target.aid,
      changed: async () => {
        if (++changes === 1)
          throw new Error('session storage unavailable')
      },
      add: async () => assert.fail('must persist before sending'),
      reconcile: async () => {},
    }).start()
    assert.equal(storageFailure.status, 'stopped')
    assert.equal(storageFailure.items.every(item => item.status === 'pending'), true)
    const task = make()
    const sent = deferred()
    const sends = []
    const owner = createOpenTabsWatchLaterTask(task, {
      accountCurrent: async () => true,
      sourceCurrent: async () => true,
      readMembership: async () => [],
      resolveAid: async item => item.target.aid,
      changed: async () => {},
      reconcile: async () => {},
      add: (aid) => {
        sends.push(aid)
        return sent.promise
      },
    })
    const running = owner.start()
    for (let i = 0; i < 30 && !sends.length; i++) await flush()
    owner.stop()
    sent.resolve({ code: 0 })
    await running
    assert.equal(task.status, 'stopped')
    assert.deepEqual(task.items.map(item => item.status), ['added', 'pending', 'pending'])
    const retryTask = make()
    let retry = false
    const attempts = []
    const retryOwner = createOpenTabsWatchLaterTask(retryTask, {
      accountCurrent: async () => true,
      sourceCurrent: async () => true,
      readMembership: async () => [],
      resolveAid: async item => item.target.aid,
      changed: async () => {},
      reconcile: async () => {},
      add: async (aid) => {
        attempts.push(aid)
        if (aid === 1)
          throw new Error('transport unknown')
        return { code: aid === 2 && !retry ? -400 : 0 }
      },
    })
    await retryOwner.start()
    retry = true
    await retryOwner.start(true)
    assert.deepEqual(attempts, [1, 2, 3, 2])
    assert.equal(retryTask.items[0].status, 'unknown')
  })

  check('open tabs backend: privacy isolation, frozen metadata, re-open and interrupted worker', async () => {
    const constants = await import('../src/constants/openTabsWatchLater')
    const playback = await import('../src/utils/playbackTab')
    const core = await import('../src/background/openTabsWatchLaterTask')
    const tabs = [{ id: 1, windowId: 11, incognito: false, url: 'https://www.bilibili.com/video/av1' }, { id: 2, windowId: 22, incognito: true, url: 'https://www.bilibili.com/video/av2' }, { id: 3, windowId: 33, incognito: false, url: 'https://www.bilibili.com/video/av3' }]
    let stored = {}
    let handler
    const sends = []
    const response = deferred()
    const extension = {
      runtime: { id: 'fixture' },
      extension: { inIncognitoContext: false },
      cookies: {
        getAllCookieStores: async () => [{ id: 'normal', tabIds: [1, 3] }],
        get: async ({ name, storeId }) => {
          assert.equal(storeId, 'normal')
          return { value: name === 'DedeUserID' ? '7' : name }
        },
      },
      tabs: { query: async () => tabs, get: async id => tabs.find(tab => tab.id === id), sendMessage: async () => {}, onRemoved: { addListener() {} } },
      storage: { session: { get: async () => structuredClone(stored), set: async (data) => { stored = { ...stored, ...structuredClone(data) } } } },
    }
    const context = await loadSourceModule('../src/background/tabContext.ts', { 'webextension-polyfill': { default: extension }, '~/constants/contentScript': await import('../src/constants/contentScript') })
    const imports = {
      'webextension-polyfill': { default: extension },
      '~/constants/openTabsWatchLater': constants,
      '~/utils/messaging': { onMessage: (_type, listener) => { handler = listener } },
      '~/utils/pgcEpisode': { findPgcEpisodeVideoIds() {} },
      '~/utils/playbackTab': playback,
      './messageListeners/api/anime': { default: {} },
      './loginStateWatcher': { onAccountCookieChange() {} },
      './messageListeners/api/video': { default: {} },
      './messageListeners/api/watchLater': { default: {} },
      './openTabsWatchLaterTask': core,
      './tabContext': context,
      './utils': { apiListenerFactory: () => async (params) => {
        if (params.contentScriptQuery === 'getAllWatchLaterList')
          return { code: 0, data: { list: [] } }
        sends.push(params)
        return response.promise
      } },
    }
    const module = await loadSourceModule('../src/background/openTabsWatchLater.ts', imports, { crypto: webcrypto })
    module.setupOpenTabsWatchLater(async () => {})
    const sender = { id: 'fixture', url: tabs[0].url, frameId: 0, tab: tabs[0] }
    const snapshot = await handler({ action: 'prepare', accountId: 7 }, sender)
    assert.deepEqual(Array.from(snapshot.items, item => [item.tabId, item.windowId]), [[1, 11], [3, 33]])
    assert.equal(sends.length, 0, 'preparation never submits')
    await handler({ action: 'start', accountId: 7, taskId: snapshot.id }, sender)
    for (let i = 0; i < 30 && !sends.length; i++) await flush()
    await handler({ action: 'unsubscribe', accountId: 7 }, sender)
    const reopened = await handler({ action: 'get', accountId: 7 }, { ...sender, tab: tabs[2] })
    assert.equal(reopened.id, snapshot.id)
    assert.equal(reopened.status, 'running')
    assert.equal((await handler({ action: 'prepare', accountId: 7 }, sender)).id, snapshot.id)
    const restart = await loadSourceModule('../src/background/openTabsWatchLater.ts', imports, { crypto: webcrypto })
    restart.setupOpenTabsWatchLater(async () => {})
    const recovered = await handler({ action: 'get', accountId: 7 }, sender)
    assert.equal(recovered.status, 'stopped')
    assert.equal(recovered.items[0].status, 'unknown')
    assert.equal(sends.length, 1)
    response.resolve({ code: 0 })
    await flush()
  })

  check('watch later completion: actual media identity, final part, preview/trial and stale navigation', async () => {
    const { createWatchLaterCompletion, isCompletedWatchLaterManuscript } = await import('../src/utils/watchLaterCompletion')
    const href = 'https://www.bilibili.com/list/watchlater?bvid=BV1xx411c7mD&p=2'
    const info = { code: 0, data: { aid: 1, bvid: 'BV1xx411c7mD', videos: 2, pages: [{ page: 1, cid: 10, duration: 100 }, { page: 2, cid: 20, duration: 200 }] } }
    assert.equal(isCompletedWatchLaterManuscript(href, 200, info), true)
    for (const [url, duration] of [[href.replace('p=2', 'p=1'), 100], [href, 30], [`${href}&cid=10`, 200], [href.replace('BV1xx411c7mD', 'BV2xx411c7mD'), 200]])
      assert.equal(isCompletedWatchLaterManuscript(url, duration, info), false)
    const video = document.createElement('video')
    Object.defineProperties(video, { currentSrc: { value: 'blob:first', configurable: true }, readyState: { value: 4 }, ended: { value: false, configurable: true }, duration: { value: 200 }, currentTime: { value: 200 } })
    let url = href
    let account = 1
    let ad = false
    const sends = []
    const read = deferred()
    const owner = createWatchLaterCompletion({
      getVideo: () => video,
      getHref: () => url,
      capture: () => {
        const accountId = account
        return { accountId, isCurrent: () => accountId === account }
      },
      isEligible: () => true,
      isAdvertisement: () => ad,
      readInfo: () => read.promise,
      remove: async (aid, isCurrent) => {
        if (isCurrent())
          sends.push(aid)
      },
      onFailure() {},
    })
    owner.ready(document.createElement('video'))
    owner.ready(video)
    Object.defineProperty(video, 'ended', { value: true, configurable: true })
    ad = true
    await owner.ended(video)
    ad = false
    const old = owner.ended(video)
    url = href.replace('BV1xx411c7mD', 'BV2xx411c7mD')
    owner.invalidate()
    read.resolve(info)
    await old
    assert.deepEqual(sends, [])
    Object.defineProperty(video, 'ended', { value: false, configurable: true })
    owner.ready(video)
    Object.defineProperty(video, 'ended', { value: true, configurable: true })
    await owner.ended(video)
    assert.deepEqual(sends, [], 'old stream cannot be relabelled as the new URL')
    url = href
    Object.defineProperty(video, 'currentSrc', { value: 'blob:new', configurable: true })
    Object.defineProperty(video, 'ended', { value: false, configurable: true })
    owner.ready(video)
    Object.defineProperty(video, 'ended', { value: true, configurable: true })
    await Promise.all([owner.ended(video), owner.ended(video)])
    assert.deepEqual(sends, [1])
    account = 2
    await owner.ended(video)
    assert.deepEqual(sends, [1])
  })

  check('refresh task: same-context windows, closed/navigated/discarded skips, failed-only retry and source last', async () => {
    const { createRefreshTabsTask } = await import('../src/background/refreshTabsTask')
    const tabs = [1, 2, 3, 4, 5, 6].map(id => ({ id, windowId: id, url: `https://www.bilibili.com/video/av${id}`, incognito: id === 6, discarded: id === 5 }))
    const reloaded = []
    let fail = true
    const api = { query: async () => tabs, get: async id => id === 3 ? undefined : id === 4 ? { ...tabs[3], url: 'https://example.org' } : tabs.find(tab => tab.id === id), reload: async (id) => {
      if (id === 2 && fail)
        throw new Error('reload denied')
      reloaded.push(id)
    } }
    const module = await loadSourceModule('../src/background/refreshTabsTask.ts', { '~/constants/contentScript': await import('../src/constants/contentScript') }, { crypto: webcrypto })
    assert.equal(typeof createRefreshTabsTask, 'function')
    const owner = module.createRefreshTabsTask(api, tabs[0])
    await owner.run()
    assert.deepEqual(reloaded, [])
    assert.deepEqual(Array.from(owner.task.items, item => item.status), ['pending', 'failed', 'skipped', 'skipped', 'skipped'])
    await owner.finish()
    assert.deepEqual(reloaded, [])
    fail = false
    await owner.run(true)
    assert.deepEqual(reloaded, [2])
    await owner.finish()
    assert.deepEqual(reloaded, [2, 1])
    await owner.finish()
    assert.deepEqual(reloaded, [2, 1])
    const obsolete = module.createRefreshTabsTask(api, tabs[0])
    await obsolete.run()
    obsolete.invalidateSource()
    await obsolete.finish()
    assert.equal(obsolete.task.items[0].status, 'skipped')
  })

  check('refresh backend: accepted navigation, context tasks, sender validation and two-phase acknowledgement', async () => {
    let listener
    let updated
    const timers = new Map()
    const tabs = [1, 2, 3, 4].map(id => ({ id, windowId: id, url: `https://www.bilibili.com/video/av${id}`, incognito: id === 3, discarded: id === 4 }))
    const reloads = []
    let stored = {}
    const extension = {
      runtime: { id: 'fixture' },
      tabs: {
        query: async () => tabs,
        get: async id => tabs.find(tab => tab.id === id),
        reload: async (id) => { reloads.push(id) },
        onUpdated: { addListener: (fn) => { updated = fn } },
        onRemoved: { addListener() {} },
      },
      storage: { session: { get: async () => structuredClone(stored), set: async (data) => { stored = { ...stored, ...structuredClone(data) } } } },
    }
    const constants = await import('../src/constants/contentScript')
    const core = await loadSourceModule('../src/background/refreshTabsTask.ts', { '~/constants/contentScript': constants }, { crypto: webcrypto })
    const context = await loadSourceModule('../src/background/tabContext.ts', { 'webextension-polyfill': { default: extension }, '~/constants/contentScript': constants })
    const module = await loadSourceModule('../src/background/refreshTabs.ts', {
      'webextension-polyfill': { default: extension },
      '~/constants/refreshTabs': await import('../src/constants/refreshTabs'),
      '~/utils/messaging': { onMessage: (_name, handler) => { listener = handler } },
      './refreshTabsTask': core,
      './tabContext': context,
    }, {
      setTimeout: (callback, delay) => {
        timers.set(callback, delay)
        return callback
      },
      clearTimeout: callback => timers.delete(callback),
    })
    module.setupRefreshTabs()
    const sender = { id: 'fixture', frameId: 0, url: tabs[0].url, tab: tabs[0], documentId: 'doc-one' }
    await assert.rejects(listener({ action: 'start' }, { ...sender, id: 'other-extension' }))
    await assert.rejects(listener({ action: 'start' }, { ...sender, frameId: 1 }))
    const pending = listener({ action: 'start' }, sender)
    for (let turn = 0; turn < 20 && !reloads.length; turn++) await flush()
    assert.deepEqual(reloads, [2])
    const duplicate = await listener({ action: 'start' }, sender)
    assert.equal(duplicate.running, true, 'reload API acceptance alone does not claim navigation succeeded')
    const privateTask = await listener({ action: 'start' }, { ...sender, tab: tabs[2], url: tabs[2].url })
    assert.deepEqual(Array.from(privateTask.items, item => item.tabId), [3])
    updated(2, { status: 'loading' })
    const completedOthers = await pending
    assert.equal(completedOthers.items.find(item => item.tabId === 2).status, 'success')
    assert.equal(completedOthers.items[0].status, 'pending')
    await listener({ action: 'finish', taskId: completedOthers.id }, sender)
    assert.deepEqual(reloads, [2])
    for (const [callback, delay] of timers) {
      if (delay === 100)
        callback()
    }
    await flush()
    assert.deepEqual(reloads, [2, 1])
    updated(1, { status: 'loading' })
    await flush()
    assert.equal(completedOthers.items[0].status, 'success')
  })

  check('links: current-on-home follows actual outlet and native anchor modifier semantics', async () => {
    const links = await import('../src/utils/linkNavigation')
    const searchCore = await import('../src/utils/searchNavigationCore')
    const enums = await import('../src/enums/appEnums')
    const settings = Vue.ref({ topBarLinkOpenMode: 'currentTabIfHomepage', searchBarLinkOpenMode: 'currentTabIfHomepage', videoCardLinkOpenMode: 'newTab', pageMode: 'bewly', dockItemsConfig: [{ page: 'Favorites', visible: true }] })
    const main = { isHomePage: href => new URL(href).pathname === '/', isInIframe: () => false, openLinkToNewTab() {} }
    const policy = await loadSourceModule('../src/utils/configuredLinkNavigation.ts', {
      '~/enums/appEnums': enums,
      './homeRoute': await import('../src/utils/homeRoute'),
      '~/logic': { settings },
      './linkNavigation': links,
      './main': main,
      './searchNavigationCore': searchCore,
    })
    assert.equal(policy.resolveConfiguredLinkAction('currentTabIfHomepage', 'https://www.bilibili.com/'), 'newTab')
    settings.value.pageMode = 'original'
    assert.equal(policy.resolveConfiguredLinkAction('currentTabIfHomepage', 'https://www.bilibili.com/'), 'currentTab')
    settings.value.pageMode = 'bewly'
    const active = Vue.ref('Home')
    const href = Vue.ref('https://www.bilibili.com/?page=Home')
    const Component = await compileComponent('../src/components/ALink.vue', {
      '~/components/TopBar/composables/useTopBarInteraction': { resetTopBarTransientInteraction() {} },
      '~/composables/useAppProvider': { useBewlyApp: () => ({ activatedPage: active, openIframeDrawer() {} }) },
      '~/composables/useCurrentLocationHref': { useCurrentLocationHref: () => href },
      '~/logic': { settings },
      '~/utils/configuredLinkNavigation': policy,
      '~/utils/linkNavigation': links,
      '~/utils/main': main,
      '~/utils/tabs': {},
    })
    const host = document.body.appendChild(document.createElement('div'))
    const app = Vue.createApp(Component, { href: 'https://www.bilibili.com/video/av1', type: 'topBar' })
    app.mount(host)
    const anchor = host.querySelector('a')
    assert.equal(anchor.target, '_top')
    for (const page of ['SearchResults', 'History', 'Favorites', 'Home']) {
      window.history.replaceState({}, '', `/?page=${page}`)
      href.value = window.location.href
      active.value = page
      await flush()
      assert.equal(anchor.target, page === 'Home' ? '_top' : '_blank')
      for (const modifiers of [{ button: 1 }, { ctrlKey: true }, { metaKey: true }, { shiftKey: true }]) {
        const event = new MouseEvent('click', { bubbles: true, cancelable: true, ...modifiers })
        anchor.dispatchEvent(event)
        assert.equal(event.defaultPrevented, false)
      }
    }
    window.history.replaceState({}, '', '/?page=History')
    anchor.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }))
    assert.equal(anchor.target, '_blank', 'activation rechecks a route ahead of the reactive microtask')
    app.unmount()
    host.remove()
    window.history.replaceState({}, '', '/')
  })
}
