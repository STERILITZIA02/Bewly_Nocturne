import assert from 'node:assert/strict'

import { loadSourceFunctions } from './sourceFunctionHarness'
import { loadSourceModule } from './sourceModuleHarness'

const deferred = () => Promise.withResolvers()

export function registerReliabilityChecks(
  check,
  { Vue, flush, compileComponent },
) {
  check(
    'reliability audio: initialization, CDN fallback and retry preserve all playback intent',
    async () => {
      const { prepareListenAudio } = await loadSourceModule(
        '../src/contentScripts/listenAudio.ts',
        {},
      )
      for (const playing of [false, true]) {
        const state = {
          time: 24,
          playing,
          rate: 1.75,
          volume: 0.31,
          muted: true,
        }
        const prepare = (owner) => {
          const prepared = prepareListenAudio(
            state,
            [
              'https://primary.bilivideo.com/a',
              'https://backup.bilivideo.com/a',
            ],
            owner.signal,
            () => assert.fail('unexpected exhaustion'),
          )
          const audio = prepared.audio
          let paused = true
          Object.defineProperties(audio, {
            paused: { get: () => paused },
            duration: { get: () => 100 },
            readyState: { get: () => 1 },
            play: {
              value: async () => {
                paused = false
                audio.dispatchEvent(new Event('play'))
              },
            },
            pause: {
              value: () => {
                paused = true
                audio.dispatchEvent(new Event('pause'))
              },
            },
            load: { value() {} },
          })
          audio.dispatchEvent(new Event('loadedmetadata'))
          return prepared
        }
        const owner = new AbortController()
        const initial = prepare(owner)
        await initial.ready
        assert.equal(initial.audio.currentTime, 0)
        initial.commit()
        const values = audio => [
          audio.paused,
          audio.muted,
          audio.volume,
          audio.playbackRate,
          audio.defaultPlaybackRate,
          audio.currentTime,
        ]
        assert.deepEqual(values(initial.audio), [
          !playing,
          true,
          0.31,
          1.75,
          1.75,
          24,
        ])
        initial.audio.currentTime = 37
        initial.audio.dispatchEvent(new Event('error'))
        initial.audio.dispatchEvent(new Event('loadedmetadata'))
        assert.deepEqual(values(initial.audio), [
          !playing,
          true,
          0.31,
          1.75,
          1.75,
          37,
        ])
        const retryOwner = new AbortController()
        const retry = prepare(retryOwner)
        await retry.ready
        owner.abort()
        retry.commit()
        assert.deepEqual(values(retry.audio), [
          !playing,
          true,
          0.31,
          1.75,
          1.75,
          37,
        ])
        retryOwner.abort()
      }
    },
  )
  check(
    'reliability HistoryPop: real loader carries complete cursors, deduplicates, retries stalls and aborts account changes',
    async () => {
      const { Business } = await import('../src/models/history/history')
      const cursorPolicy = await import('../src/utils/historyCursor')
      const historys = []
      const requests = []
      const account = Vue.ref(1)
      const failedRequest = Vue.ref(null)
      const loadError = Vue.ref(false)
      const item = oid => ({
        view_at: 100,
        history: { oid, business: 'archive' },
      })
      const page = (max, list) => ({
        code: 0,
        data: { cursor: { max, view_at: 100, business: 'archive' }, list },
      })
      const pages = [
        page(2, [item(3)]),
        page(1, [item(3), item(2)]),
        page(1, [item(1)]),
        page(0, [item(1)]),
      ]
      let deferredRead
      const state = await loadSourceFunctions(
        '../src/components/TopBar/components/pops/HistoryPop.vue',
        [
          'getHistoryList',
          'handleReachBottom',
          'retryFailedLoad',
          'resetHistoryState',
        ],
        {
          historys,
          failedRequest,
          loadError,
          currentAccountId: account,
          isLoading: Vue.ref(false),
          noMoreContent: Vue.ref(false),
          activatedTab: Vue.ref(0),
          historysWrap: Vue.ref(),
          requestGeneration: 0,
          readController: undefined,
          cursor: { max: 0, view_at: 0, business: '' },
          seenCursors: new Set(),
          seenItems: new Set(),
          ...cursorPolicy,
          ...(await import('../src/utils/accountScope')),
          Business,
          AbortController,
          isExtensionContextInvalidatedError: () => false,
          console: { error() {} },
          scrollToTop() {},
          api: {
            history: {
              getHistoryList: async (params, options) => {
                requests.push({ params, signal: options.signal })
                return deferredRead ? deferredRead.promise : pages.shift()
              },
            },
          },
        },
      )
      await state.getHistoryList(Business.ARCHIVE)
      await state.getHistoryList(Business.ARCHIVE)
      assert.equal(historys.length, 2)
      assert.deepEqual(
        { ...requests[1].params },
        { type: 'archive', max: 2, view_at: 100, business: 'archive' },
      )
      await state.getHistoryList(Business.ARCHIVE)
      assert.equal(loadError.value, true)
      state.handleReachBottom()
      assert.equal(requests.length, 3, 'a stalled scroll does not spin')
      state.retryFailedLoad()
      await flush()
      assert.deepEqual(requests[3].params, requests[2].params)
      assert.equal(historys.length, 3)
      deferredRead = deferred()
      const late = state.getHistoryList(Business.ARCHIVE)
      account.value = 2
      state.resetHistoryState()
      assert.equal(requests.at(-1).signal.aborted, true)
      deferredRead.resolve(page(0, [item(99)]))
      await late
      assert.equal(historys.length, 0)
    },
  )
  check(
    'reliability DNR: navigation and close during DNR/storage writes share the grant queue',
    async () => {
      const policy = await import('../src/utils/listenPlayback')
      const unit = { aid: 1, cid: 10, page: 1 }
      const href = 'https://www.bilibili.com/video/av1/'
      for (const phase of ['dnr', 'storage', 'restore']) {
        for (const navigation of ['navigate', 'close']) {
          const waiting = deferred()
          const entered = deferred()
          const rules = new Map(
            phase === 'restore'
              ? [[10001, { id: 10001, condition: { tabIds: [1] } }]]
              : [],
          )
          const storage
            = phase === 'restore' ? { 'listenGate:1': { unit } } : {}
          let tab = { id: 1, url: href }
          let updated, removed
          const handlers = new Map()
          const { setupListenPlayback } = await loadSourceModule(
            '../src/background/listenPlayback.ts',
            {
              'webextension-polyfill': {
                default: {
                  declarativeNetRequest: {
                    getSessionRules: async () => [...rules.values()],
                    updateSessionRules: async ({
                      addRules = [],
                      removeRuleIds = [],
                    }) => {
                      if (phase === 'dnr' && addRules.length) {
                        entered.resolve()
                        await waiting.promise
                      }
                      removeRuleIds.forEach(id => rules.delete(id))
                      addRules.forEach(rule => rules.set(rule.id, rule))
                    },
                  },
                  tabs: {
                    get: async () => {
                      if (!tab)
                        throw new Error('closed')
                      return { ...tab }
                    },
                    onUpdated: { addListener: fn => (updated = fn) },
                    onRemoved: { addListener: fn => (removed = fn) },
                  },
                  storage: {
                    session: {
                      get: async () => {
                        entered.resolve()
                        await waiting.promise
                        return structuredClone(storage)
                      },
                      set: async (values) => {
                        if (phase === 'storage') {
                          entered.resolve()
                          await waiting.promise
                        }
                        Object.assign(storage, values)
                      },
                      remove: async (key) => {
                        delete storage[key]
                      },
                    },
                  },
                },
              },
              '~/constants/audioCdn': await import('../src/constants/audioCdn'),
              '~/utils/listenPlayback': policy,
              '~/utils/messaging': {
                onMessage: (name, handler) => handlers.set(name, handler),
              },
            },
            { crypto },
          )
          setupListenPlayback()
          const sender = { tab: { id: 1 }, frameId: 0, url: href }
          const granted
            = phase === 'restore'
              ? Promise.resolve()
              : handlers.get(policy.LISTEN_GATE)(
                  {
                    unit,
                    sources: [
                      'https://upos-sz-mirrorcos.bilivideo.com/audio.m4s',
                    ],
                  },
                  sender,
                )
          await entered.promise
          if (navigation === 'close') {
            tab = undefined
            removed(1)
          }
          else {
            tab.pendingUrl = 'https://www.bilibili.com/video/av2/'
            updated(1, { status: 'loading' })
          }
          waiting.resolve()
          assert.equal(await granted, undefined)
          await handlers.get(policy.LISTEN_RECOVER)(undefined, sender)
          assert.equal(
            rules.size,
            0,
            `${phase}/${navigation}: no orphan rules`,
          )
          assert.deepEqual(storage, {})
        }
      }
    },
  )

  check(
    'reliability consumers: restored subscriptions release by document and failed old deliveries preserve new owners',
    async () => {
      const ready = deferred()
      const sent = []
      let delivery
      const module = await loadSourceModule(
        '../src/background/stateConsumers.ts',
        {
          'webextension-polyfill': { default: {} },
          '~/constants/stateConsumers':
            await import('../src/constants/stateConsumers'),
          '~/utils/messaging': {},
        },
      )
      const registry = module.createStateConsumerRegistry({
        storage: { session: { get: () => ready.promise, set: async () => {} } },
        tabs: {
          sendMessage: async (_tab, _message, target) => {
            sent.push(target)
            if (delivery)
              await delivery.promise
          },
        },
      })
      const old = { tab: { id: 1 }, frameId: 0, documentId: 'old' }
      const current = { ...old, documentId: 'new' }
      const released = registry.release({}, old)
      ready.resolve({
        'stateConsumers:v1': {
          '1:0': {
            tabId: 1,
            frameId: 0,
            documentId: 'old',
            privacy: 'normal',
            topics: {
              videoHistory: { active: true, stale: false, delivered: {} },
            },
          },
        },
      })
      await released
      await registry.deliver('videoHistory', {}, 'normal')
      assert.equal(sent.length, 0)
      await registry.touch('videoHistory', old)
      delivery = deferred()
      const first = registry.deliver('videoHistory', {}, 'normal')
      await flush()
      await registry.touch('videoHistory', current)
      await registry.release({}, old)
      delivery.reject(new Error('old document gone'))
      await first
      delivery = undefined
      await registry.deliver('videoHistory', {}, 'normal')
      await registry.deliverOnce(['videoHistory'], {})
      assert.deepEqual(
        sent.map(target => target.documentId),
        ['old', 'new', 'new'],
      )
      await registry.release({}, current)
      const registration = deferred()
      let activity
      let reconciliations = 0
      const protocol = await import('../src/constants/stateConsumers')
      const client = await loadSourceModule('../src/utils/stateConsumer.ts', {
        '~/constants/stateConsumers': protocol,
        './messaging': {
          sendMessage: async name => name === protocol.STATE_CONSUMER_MESSAGE.REGISTER ? registration.promise : undefined,
          isExtensionContextInvalidatedError: () => false,
          reportRuntimeFailure: () => assert.fail('unexpected subscription failure'),
        },
      }, {
        document: { hidden: false, addEventListener: (_name, callback) => activity = callback },
        window: { addEventListener() {} },
      })
      client.followStateTopic('videoHistory', () => reconciliations++)
      activity()
      client.unfollowStateTopic('videoHistory')
      registration.resolve({ stale: true })
      await flush()
      assert.equal(reconciliations, 0, 'a late visibility reply cannot revive a released topic')
    },
  )

  check(
    'reliability native bar: stable chapters measure once, event bursts paint once, paused replacement rebinds',
    async () => {
      const root = document.body.appendChild(document.createElement('div'))
      const markup
        = '<video></video><div class="bpx-player-ctrl-play"><div class="bpx-player-ctrl-btn-icon"></div></div><span class="bpx-player-ctrl-time-current"></span><span class="bpx-player-ctrl-time-duration"></span><div class="bpx-player-progress"><div class="bpx-player-progress-schedule"><i class="bpx-player-progress-schedule-current"></i></div><div class="bpx-player-progress-schedule"><i class="bpx-player-progress-schedule-current"></i></div><i class="bpx-player-progress-thumb"></i></div>'
      let reads = 0
      let paints = 0
      let domChanged
      let resized
      function mount() {
        root.innerHTML = markup
        const progress = root.querySelector('.bpx-player-progress')
        progress.getBoundingClientRect = () => {
          reads++
          return { left: 0, width: 200 }
        }
        Object.defineProperty(progress, 'offsetWidth', { get: () => 200 })
        root.querySelectorAll('.bpx-player-progress-schedule').forEach(
          (element, index) =>
            (element.getBoundingClientRect = () => {
              reads++
              return { left: index * 100, width: 100 }
            }),
        )
      }
      mount()
      const frames = new Map()
      let id = 0
      const module = await loadSourceModule(
        '../src/contentScripts/listenNativeBar.ts',
        {
          '~/utils/dataFormatter': {
            calcCurrentTime: value => String(value),
          },
          '~/utils/playerMedia': {
            getVideoElement: () => root.querySelector('video'),
          },
          './playerDomLifecycle': {
            observePlayerDom(fn) {
              domChanged = fn
              fn()
              return () => {}
            },
          },
        },
        {
          requestAnimationFrame: (fn) => {
            frames.set(++id, fn)
            return id
          },
          cancelAnimationFrame: key => frames.delete(key),
          ResizeObserver: class {
            constructor(fn) {
              resized = fn
            }

            observe() {}
            disconnect() {}
          },
        },
      )
      const audio = document.createElement('audio')
      Object.defineProperty(audio, 'duration', { get: () => 100 })
      audio.volume = 0.31
      audio.muted = true
      audio.playbackRate = 1.75
      audio.currentTime = 40
      const owner = new AbortController()
      const draw = () => {
        const queued = [...frames.values()]
        frames.clear()
        queued.forEach((fn) => {
          paints++
          fn()
        })
      }
      try {
        module.bindListenNativeBar(root, audio, owner.signal)
        draw()
        assert.equal(reads, 3)
        assert.equal(root.querySelector('video').volume, 0.31)
        for (let i = 0; i < 50; i++)
          audio.dispatchEvent(new Event('timeupdate'))
        assert.equal(frames.size, 1)
        draw()
        assert.equal(reads, 3)
        assert.equal(paints, 2)
        resized()
        draw()
        assert.equal(reads, 6)
        mount()
        domChanged([{ addedNodes: [root.firstChild], removedNodes: [] }])
        draw()
        assert.equal(reads, 9)
        assert.ok(root.querySelector('.bewly-player-glyph'))
        assert.equal(root.querySelector('video').playbackRate, 1.75)
        console.log(
          `PERF native bar fixture: 50 timeupdates => 1 paint, 0 layout reads; resize/replacement => 3 reads each`,
        )
      }
      finally {
        owner.abort()
        root.remove()
      }
    },
  )

  check(
    'reliability MediaSession: native callbacks and metadata restore; old cleanup cannot release a new audio owner',
    async () => {
      const callbacks = new Map()
      const originalMetadata = { title: 'native' }
      const session = {
        metadata: originalMetadata,
        playbackState: 'paused',
        setActionHandler(action, handler) {
          callbacks.set(action, handler)
        },
      }
      const isolatedSet = session.setActionHandler.bind(session)
      const { createListenMediaSession } = await loadSourceModule(
        '../src/inject/listenMediaSession.ts',
        {},
      )
      const bridge = createListenMediaSession(session)
      const nativePlay = () => {}
      const nativePause = () => {}
      const replacementPlay = () => {}
      session.setActionHandler('play', nativePlay)
      session.setActionHandler('pause', nativePause)
      bridge.claim(1)
      isolatedSet('play', () => assert.fail('retired audio'))
      session.metadata = { title: 'audio' }
      session.setActionHandler('play', replacementPlay)
      bridge.claim(2)
      assert.equal(bridge.release(1), false)
      assert.notEqual(callbacks.get('play'), replacementPlay)
      bridge.release(2)
      assert.equal(callbacks.get('play'), replacementPlay)
      assert.equal(callbacks.get('pause'), nativePause)
      assert.equal(session.metadata, originalMetadata)
      bridge.dispose()
    },
  )

  check(
    'reliability history cursor: complete cursors distinguish equal timestamps and detect loops',
    async () => {
      const { readHistoryCursor } = await import('../src/utils/historyCursor')
      const previous = { max: 10, view_at: 100, business: 'archive' }
      const next = readHistoryCursor(
        { max: 9, view_at: 100, business: 'pgc' },
        previous,
        new Set(),
        false,
      )
      assert.equal(next.stalled, false)
      assert.deepEqual(next.cursor, { max: 9, view_at: 100, business: 'pgc' })
      assert.equal(
        readHistoryCursor(previous, previous, new Set(), false).stalled,
        true,
      )
      assert.equal(
        readHistoryCursor(next.cursor, previous, new Set([next.key]), false)
          .stalled,
        true,
      )
      assert.equal(
        readHistoryCursor(
          { max: 0, view_at: 0, business: '' },
          previous,
          new Set(),
          true,
        ).ended,
        true,
      )
    },
  )

  check(
    'reliability history: patch ACKs settle once, gaps recover a baseline, and consumers outlive badge changes',
    async () => {
      const model = await import('../src/utils/videoVisitRecord')
      const coordinator = await loadSourceModule(
        '../src/background/videoVisitHistoryCoordinator.ts',
        {
          './videoVisitHistoryDatabase':
            await import('../src/background/videoVisitHistoryDatabase'),
          'webextension-polyfill': { default: {} },
          '~/utils/messaging': {},
          '~/utils/videoVisitRecord': model,
        },
        { crypto },
      )
      const origin = 'https://www.bilibili.com'
      let stored = {
        epoch: 'fixture',
        revision: 1,
        records: Object.fromEntries(
          Array.from({ length: 1000 }, (_, index) => [
            `av:${index + 1}`,
            { visitedAt: index + 1 },
          ]),
        ),
        deleted: {},
        migratedSources: [origin],
        migrationClosed: true,
        recentOperations: [],
      }
      let receiver
      let reconcile
      let broadcast = true
      let rejectWrite = false
      let duplicateAck = false
      let lastUpdate
      const owner = coordinator.createVideoVisitHistoryCoordinator({
        get: async () => structuredClone(stored),
        set: async (value) => {
          stored = structuredClone(value)
        },
        broadcast: async (update) => {
          lastUpdate = update
          if (broadcast)
            receiver(update)
        },
      })
      const counts = {
        indexBuilds: 0,
        indexKeys: 0,
        updates: 0,
        updateKeys: 0,
        reads: 0,
        releases: 0,
      }
      const settings = Vue.ref({ showVideoWatchedBadge: false })
      const siteStorage = new Map([
        ['bewlycat_video_visit_history_migrated', 'v2'],
      ])
      const client = await loadSourceModule(
        '../src/utils/videoVisitHistory.ts',
        {
          vue: Vue,
          'webextension-polyfill': {
            default: {
              storage: {
                local: { get: async () => ({}), remove: async () => {} },
              },
            },
          },
          '~/logic': { settings, settingsReady: Promise.resolve() },
          '~/utils/abort': await import('../src/utils/abort'),
          '~/utils/playbackTab': await import('../src/utils/playbackTab'),
          '~/utils/playbackProgress':
            await import('../src/utils/playbackProgress'),
          '~/utils/stateConsumer': {
            followStateTopic: (_topic, fn) => (reconcile = fn),
            unfollowStateTopic: () => counts.releases++,
          },
          '~/utils/videoVisitRecord': {
            ...model,
            createVideoHistoryIndex(records) {
              counts.indexBuilds++
              counts.indexKeys += Object.keys(records).length
              const query = model.createVideoHistoryIndex(records)
              const update = query.update
              query.update = (changed, removed) => {
                counts.updates++
                counts.updateKeys
                  += Object.keys(changed).length + removed.length
                update(changed, removed)
              }
              return query
            },
          },
          '~/utils/messaging': {
            onMessage: (_type, fn) => (receiver = fn),
            isExtensionContextInvalidatedError: () => false,
            reportRuntimeFailure() {},
            sendMessage: async (_type, command) => {
              if (command.type === 'read')
                counts.reads++
              if (command.type === 'record' && rejectWrite)
                throw new Error('unknown write')
              const result = await owner.handle(command)
              return structuredClone(duplicateAck && command.type === 'record' ? await owner.handle(command) : result)
            },
          },
        },
        {
          crypto,
          location: { origin },
          localStorage: {
            getItem: key => siteStorage.get(key) ?? null,
            setItem: (key, value) => siteStorage.set(key, value),
            removeItem: key => siteStorage.delete(key),
          },
          window: { addEventListener() {}, removeEventListener() {} },
        },
      )
      await flush()
      assert.equal(counts.reads, 0)
      const historyReader = client.acquireVideoVisitHistory()
      const progressReader = client.acquireVideoVisitHistory()
      for (let i = 0; i < 20 && !client.videoVisitHistoryEpoch.value; i++)
        await flush()
      assert.equal(client.getVideoWatchState({ aid: 10 }).status, 'browsed')
      const builds = counts.indexBuilds
      const keys = counts.indexKeys
      client.recordVideoWatchProgress(
        { aid: 10, cid: 100, page: 1 },
        20,
        100,
        false,
        'fixture',
      )
      await client.flushVideoVisitHistory()
      assert.equal(lastUpdate.type, 'patch')
      assert.equal(Object.keys(lastUpdate.records).length, 2)
      assert.equal(lastUpdate.snapshot, undefined)
      const projections = counts.updates
      const ordinaryKeys = counts.updateKeys
      receiver(lastUpdate)
      await flush()
      assert.equal(
        counts.updates,
        projections,
        'the same revision from reply/broadcast never reprojects',
      )
      assert.equal(counts.indexBuilds, builds)
      assert.equal(
        counts.indexKeys,
        keys,
        'ordinary writes do not rebuild the 1000-entry index',
      )
      assert.equal(
        client.getVideoWatchState({ aid: 10, cid: 100 }).progress,
        20,
      )
      historyReader()
      assert.equal(
        counts.releases,
        0,
        'native progress still owns history with badges off',
      )
      broadcast = false
      await owner.handle({
        type: 'record',
        epoch: 'fixture',
        operationId: 'other-page',
        baseRevision: stored.revision,
        edits: [{ identity: { aid: 1001 }, record: { visitedAt: 2000 } }],
      })
      client.recordVideoWatchProgress(
        { aid: 10, cid: 100, page: 1 },
        35,
        100,
        false,
        'fixture',
      )
      await client.flushVideoVisitHistory()
      await flush()
      assert.equal(
        client.getVideoWatchState({ aid: 1001 }).status,
        'browsed',
        'a missing broadcast is recovered from the canonical read',
      )
      assert.equal(
        client.getVideoWatchState({ aid: 10, cid: 100 }).progress,
        35,
      )
      duplicateAck = true
      client.recordVideoWatchProgress({ aid: 10, cid: 100, page: 1 }, 47, 100, false, 'fixture')
      await client.flushVideoVisitHistory()
      await flush()
      assert.equal(client.getVideoWatchState({ aid: 10, cid: 100 }).progress, 47, 'an empty duplicate ACK recovers the missing display baseline before settling')
      assert.equal(client.getVideoWatchState({ aid: 1001 }).status, 'browsed')
      rejectWrite = true
      client.recordVideoWatchProgress(
        { aid: 2000, cid: 20000 },
        12,
        100,
        false,
        'fixture',
      )
      await client.flushVideoVisitHistory()
      await flush()
      assert.equal(
        client.getVideoWatchState({ aid: 2000, cid: 20000 }),
        undefined,
        'equal-revision recovery clears rejected optimistic edits',
      )
      reconcile()
      await flush()
      progressReader()
      for (let i = 0; i < 20 && !counts.releases; i++) await flush()
      assert.ok(counts.releases > 0)
      console.log(
        `PERF history fixture: 1000-entry baseline, ordinary write updated ${projections} projections/${ordinaryKeys} touched keys; duplicate revision added 0 projections`,
      )
    },
  )

  check(
    'reliability comment snapshots: same-sized edits are detected and byte accounting survives eviction, sort and account changes',
    async () => {
      const { createMomentCommentSessionCache }
        = await import('../src/utils/momentCommentSession')
      const cache = createMomentCommentSessionCache('1', 5)
      const target = id => ({ type: 17, oid: id })
      const snapshot = text => ({
        comments: [{ id: '1', rpid: '1', replies: [], text }],
        nextPage: 2,
        hasMore: true,
        threads: [],
        likedIds: [],
        likeCounts: {},
        scrollTop: 20,
      })
      const lease = cache.open('1', 'a', target('a'))
      const data = snapshot('before')
      assert.equal(cache.save(lease, data), true)
      const bytes = cache.cachedBytes
      assert.equal(cache.save(lease, data), false)
      data.comments[0].text = 'after!'
      assert.equal(cache.save(lease, data), true)
      assert.equal(cache.cachedBytes, bytes)
      assert.equal(cache.restore(lease).comments[0].text, 'after!')
      cache.restore(lease).comments[0].text = 'mutated outside'
      assert.equal(cache.restore(lease).comments[0].text, 'after!')
      const leases = [lease]
      for (const id of ['b', 'c', 'd', 'e']) {
        const next = cache.open('1', id, target(id))
        leases.push(next)
        cache.save(next, snapshot('x'.repeat(1_100_000)))
      }
      assert.ok(cache.cachedBytes <= 8 * 1024 * 1024)
      assert.equal(
        cache.cachedBytes,
        leases.reduce((sum, entry) => {
          const value = cache.restore(entry)
          return sum + (value ? JSON.stringify(value).length * 2 : 0)
        }, 0),
      )
      const sorted = cache.open('1', 'e', target('e'), 0)
      assert.equal(cache.restore(sorted), null)
      assert.equal(cache.save(leases.at(-1), snapshot('stale')), undefined)
      cache.setAccount('2')
      assert.equal(cache.cachedBytes, 0)
      assert.equal(cache.restore(lease), null)
    },
  )

  check(
    'reliability vote: one deadline timer sleeps while hidden, restores expiry and releases on unmount',
    async () => {
      let now = 0
      let hidden = false
      const previousHidden = Object.getOwnPropertyDescriptor(
        document,
        'hidden',
      )
      Object.defineProperty(document, 'hidden', {
        configurable: true,
        get: () => hidden,
      })
      const timers = new Map()
      let id = 0
      class Clock extends Date {
        static now() {
          return now
        }
      }
      const host = document.body.appendChild(document.createElement('div'))
      const Vote = await compileComponent(
        '../src/components/MomentCard/MomentVote.vue',
        {
          'vue-i18n': {
            useI18n: () => ({ t: key => key, locale: Vue.ref('en') }),
          },
          '~/stores/topBarStore': {
            useTopBarStore: () => ({ userInfo: { mid: '1' } }),
          },
          '~/utils/api': {
            default: {
              moment: {
                getMomentVote: async () => ({
                  code: 0,
                  data: {
                    vote_info: {
                      title: 'vote',
                      choice_cnt: 1,
                      options: [{ opt_idx: 1, opt_desc: 'a', cnt: 0 }],
                    },
                  },
                }),
              },
            },
          },
          '~/utils/main': { getCSRF: () => 'fixture', getUserID: () => '1' },
          '~/utils/momentVote': await import('../src/utils/momentVote'),
          './utils': { getMomentThumbnailUrl: value => value },
          '~/components/ChartRungs.vue': { default: { render: () => null } },
        },
        {
          globals: {
            Date: Clock,
            setTimeout: (fn, delay) => {
              timers.set(++id, { fn, delay })
              return id
            },
            clearTimeout: timer => timers.delete(timer),
          },
        },
      )
      const app = Vue.createApp(Vote, {
        voteId: '1',
        momentId: '1',
        fallbackTitle: '',
        fallbackEndTime: 100,
      })
      try {
        app.mount(host)
        await flush()
        assert.equal(timers.size, 1)
        assert.equal([...timers.values()][0].delay, 100001)
        hidden = true
        document.dispatchEvent(new Event('visibilitychange'))
        assert.equal(timers.size, 0)
        now = 110_000
        hidden = false
        document.dispatchEvent(new Event('visibilitychange'))
        await flush()
        assert.equal(timers.size, 0)
        assert.ok(host.querySelector('.moment-vote__result'))
      }
      finally {
        app.unmount()
        host.remove()
        if (previousHidden)
          Object.defineProperty(document, 'hidden', previousHidden)
        else delete document.hidden
      }
      assert.equal(timers.size, 0)
    },
  )

  check(
    'reliability Watch Later: actual batch commit waits for dissolve and rejects an old account',
    async () => {
      const { useLibraryBatchSelection }
        = await import('../src/composables/useLibraryBatchSelection')
      let account = 1
      let animation = deferred()
      const items = Vue.ref([{ aid: 1 }, { aid: 2 }])
      const commits = []
      const source = await loadSourceFunctions(
        '../src/contentScripts/views/WatchLater/WatchLater.vue',
        ['batch'],
        {
          useLibraryBatchSelection: options => options,
          filteredItems: items,
          actionLifetime: {
            capture: () => {
              const captured = account
              return { isCurrent: () => account === captured }
            },
          },
          deleteWatchLaterItem: async () => true,
          watchLaterCards: ids => ids,
          dissolveElements: () => ({ released: animation.promise }),
          commitRemovedItems: ids => commits.push([...ids]),
        },
      )
      const scope = Vue.effectScope()
      const batch = scope.run(() => useLibraryBatchSelection(source.batch))
      try {
        batch.toggleManaging()
        batch.toggleAll()
        const pending = batch.removeSelected()
        await flush()
        assert.equal(batch.busy.value, true)
        assert.equal(batch.selected.value.size, 2)
        assert.equal(commits.length, 0)
        account = 2
        batch.reset()
        animation.resolve()
        await pending
        assert.equal(commits.length, 0)
        animation = deferred()
        batch.toggleManaging()
        batch.toggleAll()
        const current = batch.removeSelected()
        await flush()
        animation.resolve()
        await current
        assert.deepEqual(commits, [[1, 2]])
        assert.equal(batch.busy.value, false)
        assert.equal(batch.selected.value.size, 0)
      }
      finally {
        scope.stop()
      }
    },
  )

  check(
    'reliability search: mode changes abort old scope immediately and reset the parent page/URL',
    async () => {
      const settings = Vue.ref({
        searchResultsPaginationMode: 'pagination',
        depersonalizeSearchResults: false,
      })
      const waiting = deferred()
      let signal
      const module = await loadSourceModule(
        '../src/contentScripts/views/SearchResults/composables/useSearchRequest.ts',
        {
          vue: Vue,
          'vue-i18n': { useI18n: () => ({ t: key => key }) },
          '~/logic': { settings },
          '~/stores/topBarStore': {
            useTopBarStore: () => ({ isLogin: true, userInfo: { mid: 1 } }),
          },
          '~/utils/abort': await import('../src/utils/abort'),
          '~/utils/accountScope': await import('../src/utils/accountScope'),
          '~/utils/main': { getUserID: () => '1' },
          '~/utils/messaging': {
            isExtensionContextInvalidatedError: () => false,
          },
          '~/utils/searchRequest': {
            requestSearch: (_request, requestSignal) => {
              signal = requestSignal
              return waiting.promise
            },
          },
        },
      )
      const scope = Vue.effectScope()
      const search = scope.run(() => module.useSearchRequest('live'))
      try {
        const previous = search.requestScope.value
        const pending = search.search({ keyword: 'fixture', page: 7 }, () =>
          assert.fail('retired response rendered'))
        settings.value.searchResultsPaginationMode = 'scroll'
        assert.equal(signal.aborted, true)
        assert.notEqual(search.requestScope.value, previous)
        waiting.resolve({ code: 0, data: {} })
        assert.equal(await pending, false)
        const page = Vue.ref(7)
        const urls = []
        const parent = await loadSourceFunctions(
          '../src/contentScripts/views/SearchResults/SearchResults.vue',
          ['resetSearchIdentityPage'],
          {
            urlRestoreGeneration: 1,
            restoringFromUrl: true,
            currentPage: page,
            updateUrlParams: value => urls.push(value),
          },
        )
        parent.resetSearchIdentityPage()
        assert.equal(page.value, 1)
        assert.equal(urls[0].pn, 1)
        assert.equal(parent.restoringFromUrl, false)
      }
      finally {
        scope.stop()
      }
    },
  )

  check(
    'reliability search: live-user page two renders and more-streamers emits to the owner',
    async () => {
      const settings = Vue.ref({ searchResultsPaginationMode: 'pagination' })
      const response = {
        code: 0,
        data: {
          result: { live_user: [{ mid: 10, uname: 'host' }], live_room: [] },
          numResults: 50,
          pagesize: 30,
          pageinfo: { live_user: { total: 50 }, live_room: { total: 0 } },
        },
      }
      const relations = Vue.reactive({})
      const Live = await compileComponent(
        '../src/contentScripts/views/SearchResults/pages/LiveSearchPage.vue',
        {
          'vue-i18n': { useI18n: () => ({ t: key => key }) },
          '~/logic': { settings },
          '~/composables/useAppProvider': {
            useBewlyApp: () => ({
              haveScrollbar: async () => true,
              handleBackToTop() {},
            }),
          },
          '~/composables/useUserRelations': {
            useUserRelations: () => ({
              userRelations: relations,
              batchQueryUserRelations: async () => {},
              reset() {},
            }),
          },
          '~/utils/dataFormatter': { numFormatter: String },
          '../composables/useSearchRequest': {
            useSearchRequest: () => {
              const results = Vue.shallowRef(null)
              return {
                results,
                requestScope: Vue.ref('initial'),
                isLoading: Vue.ref(false),
                error: Vue.ref(''),
                search: (_request, process) => process(response, () => true),
                reset: () => (results.value = null),
              }
            },
          },
          '../composables/usePagination':
            await import('../src/contentScripts/views/SearchResults/composables/usePagination'),
          '../composables/useLoadMore':
            await import('../src/contentScripts/views/SearchResults/composables/useLoadMore'),
          '../searchTransforms': {
            convertLiveRoomData: value => value,
            convertUserCardData: value => value,
          },
          '../utils/searchHelpers':
            await import('../src/contentScripts/views/SearchResults/utils/searchHelpers'),
          '~/components/UserCard/UserCard.vue': {
            default: {
              render: () => Vue.h('div', { class: 'streamer-fixture' }, 'host'),
            },
          },
          '~/components/UserCard/UserCardSkeleton.vue': {
            default: { render: () => null },
          },
          '~/components/VideoCardGrid.vue': { default: { render: () => null } },
          '../components/Pagination.vue': { default: { render: () => null } },
          '../components/SearchEmptyState.vue': {
            default: { render: () => null },
          },
        },
      )
      for (const [subCategory, initialPage] of [
        ['live_user', 2],
        ['all', 1],
      ]) {
        const host = document.body.appendChild(document.createElement('div'))
        let selected = 0
        const app = Vue.createApp(Live, {
          keyword: 'host',
          filters: { subCategory, roomOrder: '', userOrder: '' },
          initialPage,
          onSelectLiveUsers: () => selected++,
        })
        try {
          app.mount(host)
          await flush()
          assert.equal(host.querySelectorAll('.streamer-fixture').length, 1)
          if (subCategory === 'all') {
            host.querySelector('.view-more-btn').click()
            assert.equal(selected, 1)
          }
        }
        finally {
          app.unmount()
          host.remove()
        }
      }
    },
  )

  check(
    'reliability playback locale: label refresh preserves icon/count nodes and disclosure state',
    async () => {
      const root = document.createElement('section')
      root.innerHTML
        = '<div class="bewly-widescreen-toolbar"><button class="toggle" aria-expanded="false"></button></div>'
      const tabButtons = Object.fromEntries(
        ['overview', 'comment', 'danmaku'].map((tab) => {
          const button = document.createElement('button')
          button.innerHTML
            = '<i class="icon"></i><span class="bewly-widescreen-tab__label">old</span><span class="count">23</span>'
          return [tab, button]
        }),
      )
      const icons = Object.values(tabButtons).map(
        button => button.firstChild,
      )
      const counts = Object.values(tabButtons).map(
        button => button.lastChild,
      )
      const disclosure = []
      const module = await loadSourceFunctions(
        '../src/utils/bewlyWidescreen/shell.ts',
        ['TAB_LABELS', 'syncShellLabels'],
        {
          t: key => `translated:${key}`,
          DISCLOSURE_TOGGLE_CLASS: 'toggle',
          INFO_LABELS: ['more', 'less'],
          setDisclosureToggle: (button, labels, expanded) =>
            disclosure.push({ button, labels, expanded }),
        },
      )
      module.syncShellLabels({ root, tabButtons })
      Object.values(tabButtons).forEach((button, index) => {
        assert.equal(button.firstChild, icons[index])
        assert.equal(button.lastChild, counts[index])
        assert.equal(button.lastChild.textContent, '23')
        assert.ok(
          button
            .querySelector('.bewly-widescreen-tab__label')
            .textContent.startsWith('translated:'),
        )
      })
      assert.equal(disclosure[0].expanded, false)
      assert.equal(
        root.style.getPropertyValue('--bewly-widescreen-up-next-label'),
        '"translated:widescreen.up_next"',
      )
    },
  )

  check(
    'reliability conversation directory: windowed rows keep far selection, keyboard focus, menus and local search reachable',
    async () => {
      const actionsKey = Symbol('session-actions')
      const actions = { state: Vue.reactive({ target: null }) }
      const Row = {
        props: ['session'],
        setup(props) {
          const element = Vue.ref(null)
          Vue.onMounted(() =>
            Object.defineProperty(element.value, 'offsetHeight', {
              get: () => 72,
            }),
          )
          return () =>
            Vue.h('div', { ref: element, class: 'directory-row' }, [
              Vue.h(
                'button',
                { 'data-session-key': props.session.key },
                props.session.name,
              ),
            ])
        },
      }
      const List = await compileComponent(
        '../src/contentScripts/views/Notifications/whisper/ConversationList.vue',
        {
          'vue-i18n': { useI18n: () => ({ t: key => key }) },
          '~/composables/usePageViewState': {
            usePageViewState: () => ({
              ref: (_key, initial) => Vue.ref(initial),
            }),
          },
          '~/composables/useUiScale': {
            uiPx: value => value,
            uiScale: Vue.ref({ scale: 1 }),
          },
          './usePrivateSessionActions': {
            privateSessionActionsKey: actionsKey,
          },
          './privateSession':
            await import('../src/contentScripts/views/Notifications/whisper/privateSession'),
          './privateRecipientSearch':
            await import('../src/contentScripts/views/Notifications/whisper/privateRecipientSearch'),
          './privateSearchPolicy':
            await import('../src/contentScripts/views/Notifications/whisper/privateSearchPolicy'),
          './ConversationListItem.vue': { default: Row },
          './ConversationListSkeleton.vue': { default: { render: () => null } },
          './PrivateRecipientSearchResultItem.vue': {
            default: { props: ['recipient'], setup: props => () => Vue.h('button', { 'data-recipient-mid': props.recipient.mid }, props.recipient.name) },
          },
          '~/components/LibraryFilterMenu.vue': {
            default: { render: () => null },
          },
          '~/components/LibrarySearchField.vue': {
            default: { render: () => null },
          },
        },
        {
          globals: {
            IntersectionObserver: class {
              observe() {}
              disconnect() {}
            },
          },
        },
      )
      const props = Vue.reactive({
        active: true,
        compact: false,
        loadingMore: false,
        noMore: true,
        paginationStalled: false,
        loadMoreFailed: false,
        items: Array.from({ length: 500 }, (_, index) => ({
          key: `1:${index}`,
          talkerId: String(index),
          sessionType: 1,
          kind: 'user',
          name: `person ${index}`,
          summary: '',
          pinned: false,
          unreadCount: 0,
        })),
        selectedSessionKey: '1:0',
        showOfficialAssistants: true,
        query: '',
        recipientSearch: {
          state: {
            groups: { following: { items: [] }, global: { items: [] } },
            complete: true,
            loading: false,
            searching: false,
          },
          setQuery() {},
          pause() {},
          resume: async () => {},
        },
      })
      const list = Vue.ref(null)
      const host = document.body.appendChild(document.createElement('div'))
      const app = Vue.createApp({
        render: () => Vue.h(List, { ...props, ref: list }),
      })
      app.provide(actionsKey, actions)
      try {
        app.mount(host)
        await flush()
        const viewport = host.querySelector('.conversation-list__items')
        const rows = viewport.firstElementChild
        Object.defineProperties(viewport, {
          clientHeight: { get: () => 300 },
          clientWidth: { get: () => 300 },
        })
        viewport.getBoundingClientRect = () => ({
          top: 0,
          left: 0,
          width: 300,
          height: 300,
        })
        rows.getBoundingClientRect = () => ({
          top: -viewport.scrollTop,
          left: 0,
          width: 300,
          height: 36000,
        })
        await list.value.focusSession('1:400')
        assert.equal(document.activeElement.dataset.sessionKey, '1:400')
        assert.ok(host.querySelectorAll('.directory-row').length < 40)
        document.activeElement.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }),
        )
        await flush()
        assert.equal(document.activeElement.dataset.sessionKey, '1:401')
        actions.state.target = props.items[401]
        await list.value.focusSession('1:20')
        assert.ok(
          host.querySelector('[data-session-key="1:401"]'),
          'menu owner remains mounted outside the reading window',
        )
        props.query = 'person'
        await flush()
        await list.value.focusSession('1:499')
        assert.ok(
          host.querySelectorAll('.directory-row').length < 40,
          'broad search shares the same window owner',
        )
        // JSDOM does not clamp scrollTop when the next filtered list becomes short.
        viewport.scrollTop = 0
        props.query = 'person 499'
        await flush()
        assert.ok(
          host.querySelector('[data-session-key="1:499"]'),
          'search includes off-window sessions',
        )
        await list.value.focusSession('1:499')
        document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }))
        await flush()
        assert.equal(document.activeElement.dataset.sessionKey, '1:0', 'filtered-out selection stays in keyboard navigation')
        props.query = 'remote'
        props.recipientSearch.state.groups.global.items = Array.from({ length: 100 }, (_, index) => ({ mid: String(600 + index), name: `remote ${index}`, source: 'global' }))
        await flush()
        await list.value.focusSession('recipient:650')
        assert.equal(document.activeElement.dataset.recipientMid, '650')
        document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
        await flush()
        assert.equal(document.activeElement.dataset.recipientMid, '651', 'remote search rows use the same window and keyboard owner')
        console.log(
          'PERF conversation fixture: 500 sessions keep fewer than 40 mounted rows in the directory and broad search; distant keyboard/search targets remain reachable',
        )
      }
      finally {
        app.unmount()
        host.remove()
      }
    },
  )
}
