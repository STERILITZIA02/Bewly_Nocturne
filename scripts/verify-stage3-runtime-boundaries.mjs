import assert from 'node:assert/strict'

import { isHostOnlySelector, isShadowOnlySelector, splitContentStyles } from './contentStyleSplit'
import { loadSourceFunctions } from './sourceFunctionHarness'
import { loadSourceModule } from './sourceModuleHarness'

async function createRegistry(sent, options = {}) {
  const module = await loadSourceModule('../src/background/stateConsumers.ts', {
    'webextension-polyfill': { default: {} },
    '~/constants/stateConsumers': await import('../src/constants/stateConsumers'),
    '~/utils/messaging': { onMessage() {} },
  })
  return module.createStateConsumerRegistry({
    tabs: {
      sendMessage: async (tabId, message, target) => {
        if (options.closed?.has(tabId))
          throw new Error('Could not establish connection. Receiving end does not exist.')
        sent.push({ tabId, frameId: target?.frameId, type: message.type })
      },
    },
  })
}

const sender = (tabId, frameId = 0, incognito = false) => ({ tab: { id: tabId, incognito }, frameId })

export function registerStage3RuntimeChecks(check) {
  check('stage 3 broker: only active subscribers of the topic and privacy context receive; hidden ones reconcile once on return', async () => {
    const sent = []
    const closed = new Set()
    const registry = await createRegistry(sent, { closed })
    await registry.touch('topBar', sender(1))
    await registry.touch('topBar', sender(2))
    await registry.touch('topBar', sender(3, 0, true))
    await registry.touch('watchLater', sender(4))
    await registry.register({ topic: 'topBar', active: false }, sender(2))
    await registry.deliver('topBar', { type: 'updated' }, 'normal', { resource: '9:unread', revision: '1:1' })
    assert.deepEqual(sent.map(item => item.tabId), [1], 'no other topic, privacy context or hidden page receives it')
    await registry.deliver('topBar', { type: 'updated' }, 'normal', { resource: '9:unread', revision: '1:1' })
    assert.equal(sent.length, 1, 'an unchanged snapshot is not resent')
    assert.equal((await registry.register({ topic: 'topBar', active: true }, sender(2))).stale, true)
    assert.equal((await registry.register({ topic: 'topBar', active: true }, sender(2))).stale, false, 'one reconcile per missed period')
    closed.add(1)
    await registry.deliver('topBar', { type: 'invalidated' }, 'normal')
    sent.length = 0
    await registry.deliver('topBar', { type: 'invalidated' }, 'normal')
    assert.deepEqual(sent.map(item => item.tabId), [2], 'a document without a receiver leaves the registry')
    await registry.touch('watchLater', sender(2))
    sent.length = 0
    await registry.deliverOnce(['topBar', 'watchLater'], { type: 'login' })
    assert.deepEqual(sent.map(item => item.tabId).sort(), [2, 3, 4], 'one login message per document across topics, all privacy contexts')
    registry.release({}, sender(2))
    sent.length = 0
    await registry.deliver('topBar', { type: 'invalidated' }, 'normal')
    assert.equal(sent.length, 0, 'pagehide release removes the document')
  })

  check('stage 3 broker: TopBar resources persist and serialize per record; a slow write never blocks another resource', async () => {
    const sent = []
    const writes = []
    let releaseFirst
    const session = {
      get: async () => ({}),
      set: values => new Promise((resolve) => {
        if (!Object.keys(values).some(key => key.startsWith('topBarStateBroker'))) {
          resolve()
          return
        }
        writes.push(Object.keys(values))
        if (!releaseFirst) {
          releaseFirst = resolve
          return
        }
        resolve()
      }),
    }
    const { createTopBarStateBroker } = await loadSourceModule('../src/background/topBarStateBroker.ts', {
      'webextension-polyfill': { default: {} },
      '~/constants/topBarState': await import('../src/constants/topBarState'),
      '~/utils/messaging': { onMessage() {} },
    })
    const broker = createTopBarStateBroker({ storage: { session }, tabs: { sendMessage: async (tabId, message) => sent.push({ tabId, type: message.type }) } })
    const unread = broker.claimRefresh({ accountId: 9, maxAge: 1000, resource: 'unread' }, sender(1))
    await new Promise(resolve => setTimeout(resolve, 0))
    const moments = await broker.claimRefresh({ accountId: 9, maxAge: 1000, resource: 'moments' }, sender(1))
    assert.equal(moments.shouldRefresh, true, 'the moments lease is granted while the unread write is still pending')
    assert.deepEqual(writes.map(keys => keys.length), [1, 1], 'each write carries only its own record')
    assert.notDeepEqual(writes[0], writes[1])
    releaseFirst()
    assert.equal((await unread).shouldRefresh, true)
  })

  check('stage 3 settings: structural equality treats undefined as missing, and normalize records the fields it depends on', async () => {
    const { settingsValuesEqual } = await import('../src/utils/settingsStorageProtocol')
    assert.ok(settingsValuesEqual({ a: 1, b: undefined }, { a: 1 }))
    assert.ok(settingsValuesEqual([{ x: [1, 2] }], [{ x: [1, 2] }]))
    assert.ok(!settingsValuesEqual({ a: [1] }, { a: [1, 2] }))
    const { runRecordedNormalize } = await loadSourceFunctions('../src/composables/useSettingsStorage.ts', ['runRecordedNormalize'], { Proxy, Reflect, Set })
    const working = { mode: 'x', retired: true, untouched: 1 }
    const touched = runRecordedNormalize(working, (value) => {
      if (value.mode !== 'a')
        value.mode = 'a'
      Reflect.deleteProperty(value, 'retired')
    })
    assert.deepEqual([...touched].sort(), ['mode', 'retired'])
    assert.deepEqual(working, { mode: 'a', untouched: 1 })
    assert.equal(runRecordedNormalize({ a: 1 }, value => Object.keys(value)), undefined, 'enumeration depends on every field')
  })

  check('stage 3 styles: the host copy drops Shadow-only and scoped rules; the Shadow copy drops host-only rules; order holds', () => {
    assert.ok(isShadowOnlySelector(':host(.dark) .x') && isShadowOnlySelector('.card[data-v-12ab]'))
    assert.ok(isHostOnlySelector('html.bewly-design body') && isHostOnlySelector(':root.disable-frosted-glass') && !isHostOnlySelector(':host, :root'))
    const css = `@charset "UTF-8";
:root,:host{--a:1}
/* a comment before a nested block */
@container (max-width: 96px){.pic span[data-v-1]{display:none}.toast{x:1}}
html.bewly-design>body{y:1}
.card[data-v-2]{z:1}
.bewly-watch-later-btn{content:"{"}
@keyframes spin{from{a:0}to{a:1}}
:host(.dark){--b:2}`
    const { host, shadow } = splitContentStyles(css)
    assert.ok(!/data-v-|:host/.test(host))
    assert.ok(host.includes(':root{--a:1}') && host.includes('.toast{x:1}') && host.includes('html.bewly-design>body{y:1}'))
    assert.ok(host.includes('content:"{"') && host.includes('@keyframes spin'))
    assert.ok(!/html\.bewly-design/.test(shadow) && shadow.includes(':host{--a:1}') && shadow.includes('.card[data-v-2]{z:1}'))
    assert.ok(host.indexOf(':root{--a:1}') < host.indexOf('.toast{x:1}') && host.indexOf('.toast') < host.indexOf('html.bewly-design'), 'rule order (cascade) is preserved')
  })

  check('stage 3 payload: a count reply omits a member list the client already holds and keeps it otherwise', async () => {
    const { withoutKnownEntries } = await loadSourceFunctions('../src/background/messageListeners/api/watchLater.ts', ['withoutKnownEntries'], {
      entriesFirstRevision: new WeakMap(),
      Number,
    })
    const entries = [{ aid: 1 }]
    const snapshot = { accountId: 1, epoch: 'e', revision: 4, entries, complete: true, count: 1, updatedAt: 1, countUpdatedAt: 1 }
    assert.equal(withoutKnownEntries(snapshot, {}).entries, entries, 'a client without a list receives it')
    assert.deepEqual(Object.keys(withoutKnownEntries({ ...snapshot, revision: 6 }, { knownEpoch: 'e', knownRevision: 5 })).includes('entries'), false)
    assert.equal(withoutKnownEntries({ ...snapshot, revision: 6 }, { knownEpoch: 'e', knownRevision: 3 }).entries, entries, 'an older client receives the list')
    assert.equal(withoutKnownEntries(snapshot, { knownEpoch: 'other', knownRevision: 9 }).entries, entries, 'another epoch receives the list')
  })
}
