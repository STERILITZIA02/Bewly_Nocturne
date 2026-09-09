import assert from 'node:assert/strict'

import { MOMENTS_SOURCE_FILES } from './refactoredSources'
import { loadSourceFunctions } from './sourceFunctionHarness'
import { loadSourceModule } from './sourceModuleHarness'

function deferred() {
  let resolve
  const promise = new Promise(done => resolve = done)
  return { promise, resolve }
}

export function registerLongListResourceChecks(check, { Vue, compileComponent, flush }) {
  check('A17/A19 actual forward patches share canonical rows while pending likes never enter persisted snapshots', async () => {
    const account = await import('../src/utils/accountScope')
    const { createAccountLifetime } = await import('../src/utils/accountLifetime')
    const post = Vue.reactive({ id: 'one', forwardCount: 1, isLiked: false, likeCount: 0 })
    const row = Vue.ref([post])
    const list = Vue.ref([post])
    let stored = Vue.shallowRef({ accountId: 1, entries: { all: { items: [post], offset: 'cursor', hasMore: true } } })
    const cacheModule = await loadSourceModule('../src/contentScripts/views/Moments/useMomentsFeedCache.ts', {
      '~/composables/useStorageLocal': { useStorageLocal: (_key, _initial, options) => {
        queueMicrotask(() => options.onReady())
        return stored
      } },
      '~/utils/accountScope': account,
    })
    const cache = cacheModule.useMomentsFeedCache(() => 1)
    const readerModule = await loadSourceModule('../src/contentScripts/views/Moments/momentFeedReader.ts', {
      '~/utils/api': { default: { moment: { getMoments: async () => ({ code: 0, data: { items: [{}], offset: 'one', has_more: false } }) } } },
      '~/utils/messaging': { isExtensionContextInvalidatedError: () => false },
      '~/utils/momentHostFollowState': {},
      './useMomentsFeedCache': cacheModule,
    })
    const reader = readerModule.createMomentFeedReader(cache, () => post)
    await reader.read({ reset: true, type: 'all', group: 'all', hostMid: '', offset: '', updateBaseline: '', page: 1, filtered: false }, () => true)
    const request = deferred()
    const actionModule = await loadSourceModule('../src/contentScripts/views/Moments/useMomentActions.ts', {
      vue: Vue,
      'vue-i18n': { useI18n: () => ({ t: key => key }) },
      'vue-toastification': { useToast: () => ({ error: () => {}, warning: () => {} }) },
      '~/components/MomentCard/utils': {},
      '~/stores/topBarStore': { useTopBarStore: () => ({}) },
      '~/utils/accountLifetime': { createAccountLifetime },
      '~/utils/api': { default: { moment: { setMomentLike: () => request.promise } } },
      '~/utils/main': { getCSRF: () => 'csrf' },
      '~/utils/messaging': {},
      '~/utils/watchLater': {},
    })
    const selected = Vue.ref(post)
    const handler = await loadSourceFunctions(MOMENTS_SOURCE_FILES, ['handleMomentForwardCountChange', 'applyMomentPatch'], {
      normalizeForwardCount: (await import('../src/components/MomentCard/momentForwardContent')).normalizeForwardCount,
      forwardCountOverrides: new Map(),
      getCurrentAccountId: () => 1,
      moments: list,
      feedCache: cache,
      feedReader: reader,
      momentLayout: { updateMoment: moment => row.value = [moment] },
      selectedMoment: selected,
      details: { updateMoment: moment => selected.value = moment },
    })
    const scope = Vue.effectScope()
    const actions = scope.run(() => actionModule.useMomentActions(() => 1, handler.applyMomentPatch))
    const liking = actions.toggleMomentLike(post)
    assert.equal(actions.getDisplayMoment(list.value[0]).isLiked, true)
    assert.equal(stored.value.entries.all.items[0].isLiked, false)
    handler.handleMomentForwardCountChange('one', 5)
    assert.equal(list.value[0], row.value[0])
    assert.equal(row.value[0].forwardCount, 5)
    assert.equal(selected.value, list.value[0])
    assert.equal(stored.value.entries.all.items[0].forwardCount, 5)
    assert.equal(stored.value.entries.all.items[0].isLiked, false)
    assert.equal(actions.getDisplayMoment(list.value[0]).isLiked, true)
    request.resolve({ code: -1 })
    await liking
    assert.equal(actions.getDisplayMoment(row.value[0]).isLiked, false)
    assert.equal(list.value[0].likeCount, 0)
    scope.stop()
    stored = null
  })

  check('A10 real VideoCardGrid bounds components/slots, preserves focus and interaction state, and remeasures columns', async () => {
    const cardWindow = await import('../src/composables/useCardWindow')
    const tabState = await import('../src/composables/useHomeTabState')
    const cardTypes = await import('../src/components/VideoCard/types')
    const gridPolicy = await import('../src/utils/gridLayout')
    const coverPolicy = await import('../src/utils/videoCardLayout')
    const events = await import('../src/constants/globalEvents')
    const settings = Vue.ref({ gridColumns: { base: 4, sm: 4, md: 4, lg: 4, xl: 4, xxl: 4 }, autoSwitchListLayout: false, videoCardLayout: 'modern', videoCardCoverRatioOneColumn: 40, videoCardCoverRatioTwoColumns: 50 })
    const editing = Vue.ref(false)
    const mode = Vue.ref('adaptive')
    const pins = Vue.reactive(new Set())
    const gridLayout = await loadSourceModule('../src/composables/useGridLayout.ts', { vue: Vue, '~/logic': { settings } })
    const grid = await compileComponent('../src/components/VideoCardGrid.vue', {
      '~/components/VideoCard/types': cardTypes,
      '~/composables/useCardWindow': cardWindow,
      '~/composables/useGridLayout': gridLayout,
      '~/composables/useHomeTabState': tabState,
      '~/composables/useVideoCardShadowStyle': { useVideoCardShadowStyle: () => ({ shadowStyleVars: Vue.ref({}) }) },
      '~/constants/globalEvents': events,
      '~/logic': { settings, originalSettings: settings.value },
      '~/logic/layoutEdit': { isLayoutEditing: editing },
      '~/utils/gridLayout': gridPolicy,
      '~/utils/mitt': { default: { on: () => {}, off: () => {} } },
      '~/utils/videoCardLayout': coverPolicy,
      './SmoothLoading.vue': { default: { render: () => null } },
    })
    const root = document.body.appendChild(document.createElement('section'))
    root.style.overflowY = 'auto'
    Object.defineProperties(root, { clientWidth: { value: 1200 }, clientHeight: { value: 700 }, scrollHeight: { value: 450000 } })
    const previousRect = HTMLElement.prototype.getBoundingClientRect
    const width = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth')
    HTMLElement.prototype.getBoundingClientRect = function () {
      let top = 0
      let height = 700
      if (this.classList.contains('video-card-grid-container'))
        top = -root.scrollTop
      if (this.classList.contains('video-card-slot')) {
        top = -root.scrollTop
        let column = 0
        const columns = mode.value === 'adaptive' ? 4 : 2
        for (const sibling of this.parentElement.children) {
          if (sibling === this)
            break
          if (sibling.classList.contains('video-card-spacer')) {
            top += Number.parseFloat(sibling.style.height) || 0
            column = 0
          }
          else if (sibling.classList.contains('video-card-slot') && ++column === columns) {
            top += 180
            column = 0
          }
        }
        height = 180
      }
      return { x: 0, y: top, top, bottom: top + height, left: 0, right: 1200, width: 1200, height, toJSON: () => ({}) }
    }
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 1200 })
    let mounted = 0
    const card = {
      props: ['video', 'persistentState'],
      setup(props, { expose }) {
        Vue.onMounted(() => mounted++)
        Vue.onBeforeUnmount(() => mounted--)
        expose({ canRecycle: Vue.computed(() => !pins.has(props.video.id)) })
        return () => Vue.h('div', { 'data-video-id': props.video.id }, [Vue.h('button', { onClick: () => props.persistentState.videoCurrentTime = 17 }, String(props.persistentState.videoCurrentTime))])
      },
    }
    const items = Array.from({ length: 5000 }, (_, id) => ({ id: id + 1 }))
    const app = Vue.createApp({ setup: () => () => Vue.h(grid, { items, gridLayout: mode.value, noMoreContent: true, transformItem: item => item, getItemKey: item => item.id }) })
    app.component('VideoCard', card).component('Empty', { render: () => null }).component('Button', { render: () => null })
    app.config.globalProperties.$t = key => key
    app.provide('BEWLY_APP', { scrollViewportRef: Vue.ref(root), isHomeTabSwitching: Vue.ref(false) })
    const settle = async () => {
      await new Promise(resolve => setTimeout(resolve, 60))
      await flush()
    }
    try {
      app.mount(root)
      await settle()
      assert.ok(mounted > 0 && mounted < 250)
      const first = root.querySelector('[data-video-id="1"] button')
      first.click()
      first.focus()
      pins.add(2)
      root.scrollTop = 18000
      root.dispatchEvent(new Event('scroll'))
      await settle()
      assert.ok(root.querySelector('[data-video-id="1"]'), 'focused card survives outside the window')
      assert.ok(root.querySelector('[data-video-id="2"]'), 'open interaction survives outside the window')
      assert.ok(mounted < 350)
      const outside = document.body.appendChild(document.createElement('button'))
      outside.focus()
      pins.clear()
      root.scrollTop++
      root.dispatchEvent(new Event('scroll'))
      await settle()
      assert.equal(root.querySelector('[data-video-id="1"]'), null)
      root.scrollTop = 0
      root.dispatchEvent(new Event('scroll'))
      await settle()
      assert.equal(root.querySelector('[data-video-id="1"] button').textContent, '17')
      mode.value = 'twoColumns'
      await settle()
      assert.ok(mounted > 0 && mounted < 350)
      assert.equal(root.querySelectorAll('.video-card-slot').length, mounted)
      outside.remove()
    }
    finally {
      app.unmount()
      assert.equal(mounted, 0)
      HTMLElement.prototype.getBoundingClientRect = previousRect
      if (width)
        Object.defineProperty(HTMLElement.prototype, 'clientWidth', width)
      else
        delete HTMLElement.prototype.clientWidth
      root.remove()
    }
  })

  check('Home entry: explicit top reset wins over cached card anchor; ordinary tab restoration retains it', async () => {
    const { useCardWindow } = await import('../src/composables/useCardWindow')
    for (const resetPosition of [true, false]) {
      const root = document.body.appendChild(document.createElement('section'))
      const card = document.createElement('article')
      root.append(card)
      Object.defineProperties(root, { clientHeight: { value: 600 }, scrollHeight: { value: 10000 } })
      const rect = (top, height) => ({ x: 0, y: top, top, bottom: top + height, left: 0, right: 500, width: 500, height })
      root.getBoundingClientRect = () => rect(0, 600)
      card.getBoundingClientRect = () => rect(5000 - root.scrollTop, 100)
      const mount = root.appendChild(document.createElement('div'))
      let controller
      const app = Vue.createApp({
        setup() {
          controller = useCardWindow({
            root: Vue.ref(root),
            container: Vue.ref(root),
            keys: Vue.ref(Array.from({ length: 100 }, (_, key) => key)),
            columns: Vue.ref(1),
            gap: Vue.ref(0),
            estimatedHeight: Vue.ref(100),
            layout: Vue.ref('adaptive'),
            enabled: Vue.ref(true),
            canRelease: () => true,
            snapshot: { measurements: [], renderedKeys: [50], anchor: { key: 50, offset: 17 } },
            restoreScroll: () => {
              root.scrollTop = 0
              return resetPosition
            },
          })
          controller.setElement(50, card)
          return () => null
        },
      })
      try {
        app.mount(mount)
        await flush()
        assert.equal(root.scrollTop, resetPosition ? 0 : 4983)
        if (resetPosition)
          assert.equal(controller.ranges.value[0].start, 0, 'the first rows replace the old offscreen cached window')
      }
      finally {
        app.unmount()
        root.remove()
      }
    }
  })

  check('A09/A12 real height index matches exhaustive geometry beyond 1000 items and after measurement/layout changes', async () => {
    const { createMomentColumnIndex } = await import('../src/utils/momentColumnIndex')
    const columns = Array.from({ length: 3 }, (_, col) => Array.from({ length: 1500 }, (_, row) => ({ id: `${col}:${row}`, height: 100 + (row * 37 % 250) })))
    const index = createMomentColumnIndex(item => item.id, item => item.height, 16)
    index.sync(columns, 400)
    for (const start of [0, 99, 500, 10000, 150000, 320000]) {
      const result = index.window(start, start + 900)
      for (const [col, items] of columns.entries()) {
        let offset = 0
        const expected = []
        let before = 0
        let after = 0
        for (const item of items) {
          if (offset + item.height < start)
            before += item.height + 16
          else if (offset > start + 900)
            after += item.height + 16
          else
            expected.push(item.id)
          offset += item.height + 16
        }
        assert.deepEqual(result[col].items.map(item => item.id), expected)
        assert.equal(result[col].topPad, Math.max(0, before - 16))
        assert.equal(result[col].bottomPad, Math.max(0, after - 16))
      }
    }
    columns[0][0].height = 500
    index.updateHeight('0:0', 500)
    assert.equal(index.window(300, 400)[0].items[0].id, '0:0')
    columns[0].push({ id: 'extra', height: 400 })
    index.sync(columns, 400)
    index.sync([columns.flat()], 900)
    assert.equal(index.window(0, 600)[0].items[0].height, 500)
  })

  check('A09 actual reader/cache continue past 1000 and persist a tail aligned with its continuation cursor', async () => {
    const { createMomentAdapter } = await import('../src/contentScripts/views/Moments/momentAdapter')
    const account = await import('../src/utils/accountScope')
    const follow = await import('../src/utils/momentHostFollowState')
    const messaging = await loadSourceModule('../src/utils/messaging.ts', { 'webextension-polyfill': { default: {} } })
    let stored
    const cacheModule = await loadSourceModule('../src/contentScripts/views/Moments/useMomentsFeedCache.ts', {
      '~/composables/useStorageLocal': { useStorageLocal: (_key, initial, options) => {
        assert.equal(options.deep, false)
        assert.equal(options.shallow, true)
        stored = Vue.shallowRef(initial)
        queueMicrotask(() => options.onReady())
        return stored
      } },
      '~/utils/accountScope': account,
    })
    const requests = []
    const raw = id => ({ id_str: String(id), type: 'DYNAMIC_TYPE_WORD', modules: { module_author: { mid: '1', pub_ts: 20000 - id }, module_dynamic: { desc: { text: `post ${id}` } } } })
    const api = { moment: { getMoments: async (request) => {
      requests.push(request.offset || '')
      const start = Number(request.offset || 0)
      return { code: 0, data: { items: Array.from({ length: 50 }, (_, i) => raw(start + i + 1)), offset: String(start + 50), has_more: start + 50 < 1350 } }
    } } }
    const readerModule = await loadSourceModule('../src/contentScripts/views/Moments/momentFeedReader.ts', {
      '~/utils/api': { default: api },
      '~/utils/messaging': messaging,
      '~/utils/momentHostFollowState': follow,
      './useMomentsFeedCache': cacheModule,
    })
    const cache = cacheModule.useMomentsFeedCache(() => 1)
    await cache.ready
    const adapter = createMomentAdapter(key => key, (_id, count) => Number(count) || 0)
    const reader = readerModule.createMomentFeedReader(cache, adapter.mapMoment)
    const query = { reset: true, type: 'all', group: 'all', hostMid: '', offset: '', updateBaseline: '', page: 1, filtered: false, hasWantedUsers: true }
    for (let page = 0; page < 26; page++) {
      const result = await reader.read(query, () => true)
      assert.equal(result.normalizedItems.length, 50)
      assert.equal(result.hasMore, true)
      query.offset = result.nextOffset
      query.reset = false
    }
    assert.equal(reader.getLoaded('all', 'all', '').length, 1300)
    assert.equal(stored.value.entries.all.items.length, 1000)
    assert.equal(stored.value.entries.all.items[0].id, '301')
    assert.equal(stored.value.entries.all.offset, '1300')
    const resumed = readerModule.createMomentFeedReader(cache, adapter.mapMoment)
    const wanted = { ...query, group: 'wanted', offset: '', reset: false }
    const restored = await resumed.read(wanted, () => true)
    assert.equal(restored.normalizedItems[0].id, '301')
    assert.equal(restored.nextOffset, '1300')
    const continued = await resumed.read({ ...wanted, offset: restored.nextOffset }, () => true)
    assert.equal(continued.normalizedItems[0].id, '1301')
    assert.equal(continued.hasMore, false)
    assert.equal(requests.at(-1), '1300')
    assert.equal(stored.value.entries.all.items.length, 1000)
    assert.equal(stored.value.entries.all.items[0].id, '351')
    assert.equal(stored.value.entries.all.offset, '1350')
    const delayed = deferred()
    api.moment.getMoments = () => delayed.promise
    let current = true
    const stale = reader.read({ ...query, offset: '1300' }, () => current)
    current = false
    delayed.resolve({ code: 0, data: { items: [raw(2000)], offset: '2000', has_more: true } })
    assert.equal(await stale, undefined)
    assert.equal(reader.getLoaded('all', 'all', '').length, 1300)
    reader.reset()
    assert.equal(reader.getLoaded('all', 'all', ''), undefined)

    // A refreshed head can be separated from the persisted tail by many API pages.
    // Reopening halfway through must consume that gap before using its continuation.
    const pages = []
    let failNext = false
    api.moment.getMoments = async (request) => {
      const start = Number(request.offset || 0)
      pages.push(start)
      if (failNext) {
        failNext = false
        throw new Error('retry fixture')
      }
      return { code: 0, data: { items: Array.from({ length: 50 }, (_, i) => raw(start + i + 1)), offset: String(start + 50), has_more: start + 50 < 3000 } }
    }
    cache.saveMomentsCache('all', { items: Array.from({ length: 800 }, (_, i) => adapter.mapMoment(raw(2201 + i))), offset: '3000', hasMore: false, updateBaseline: '', updatedAt: Date.now() })
    let gapReader = readerModule.createMomentFeedReader(cache, adapter.mapMoment)
    let gapQuery = { ...query, group: 'wanted', reset: true, offset: '' }
    const ids = []
    for (let batch = 0; batch < 40; batch++) {
      const before = pages.length
      const response = await gapReader.read(gapQuery, () => true)
      assert.ok(pages.length - before <= 2, 'wanted scans retain the two-page request budget')
      ids.push(...response.normalizedItems.map(item => Number(item.id)))
      gapQuery = { ...gapQuery, reset: false, offset: response.nextOffset }
      if (batch === 3) {
        failNext = true
        await assert.rejects(gapReader.read(gapQuery, () => true), /retry fixture/)
        assert.equal(pages.at(-1), Number(gapQuery.offset), 'failed request retains its committed cursor')
      }
      if (!response.hasMore)
        break
    }
    assert.deepEqual(ids, Array.from({ length: 3000 }, (_, i) => i + 1), 'gap and continuation are consumed exactly once')
    gapReader = readerModule.createMomentFeedReader(cache, adapter.mapMoment)
    const reopened = await gapReader.read({ ...gapQuery, offset: '' }, () => true)
    assert.equal(reopened.normalizedItems[0].id, '2001')
    assert.equal(reopened.normalizedItems.at(-1).id, '3000')
    assert.equal(reopened.hasMore, false)
    const filtered = readerModule.createMomentFeedReader(cache, adapter.mapMoment)
    const filteredResponse = await filtered.read({ ...query, reset: true, offset: '', filtered: true }, () => true)
    assert.equal(filteredResponse.normalizedItems.length, 100)
    assert.equal(filteredResponse.hasMore, true, 'filter budget is not server exhaustion')
    assert.equal(filteredResponse.nextOffset, '100')
  })

  check('A11 actual tab cache transfers data without cloning and clears old account generations', async () => {
    const { createHomeTabCache } = await import('../src/composables/useHomeTabState')
    const cache = createHomeTabCache()
    const snapshot = { items: Array.from({ length: 2000 }, (_, id) => ({ id })), selection: 5 }
    cache.save('tab', snapshot, cache.generation)
    assert.equal(cache.take('tab'), snapshot)
    assert.equal(cache.take('tab'), undefined)
    const generation = cache.generation
    cache.clear()
    cache.save('old', snapshot, generation)
    assert.equal(cache.take('old'), undefined)
  })

  check('A18 actual image queue limits concurrent work and frees cancelled slots', async () => {
    const queue = await import('../src/utils/imageLoadQueue')
    const running = new Set()
    const tasks = []
    const handles = []
    for (let i = 0; i < 30; i++) {
      const task = deferred()
      tasks.push(task)
      handles.push(queue.enqueueImageLoad({
        start: async () => {
          running.add(i)
          assert.ok(running.size <= queue.IMAGE_LOAD_QUEUE_LIMIT)
          await task.promise
          running.delete(i)
        },
        onCancel: () => {
          running.delete(i)
          task.resolve()
        },
      }))
    }
    await flush()
    assert.equal(running.size, queue.IMAGE_LOAD_QUEUE_LIMIT)
    handles[0].cancel()
    await flush()
    assert.equal(running.size, queue.IMAGE_LOAD_QUEUE_LIMIT)
    handles.forEach(handle => handle.cancel())
    await flush()
    assert.equal(running.size, 0)
    assert.equal(handles.some(handle => handle.isActive() || handle.isQueued()), false)
  })

  check('A18 actual media owners destroy both transports, abort listeners and detach media sources', async () => {
    const { createPreviewMediaSession } = await import('../src/utils/previewMediaSession')
    const resources = await import('../src/utils/mediaResources')
    const session = createPreviewMediaSession()
    const calls = []
    session.hls = { destroy: () => calls.push('hls') }
    session.flv = { pause: () => calls.push('pause'), unload: () => calls.push('unload'), detachMediaElement: () => calls.push('detach'), destroy: () => calls.push('flv') }
    const signal = session.signal
    session.clear()
    session.clear()
    assert.equal(signal.aborted, true)
    assert.equal(session.signal.aborted, false)
    assert.deepEqual(calls, ['hls', 'pause', 'unload', 'detach', 'flv'])
    const video = document.createElement('video')
    const source = document.createElement('source')
    video.append(source)
    video.pause = () => calls.push('media-pause')
    video.load = () => calls.push('media-load')
    video.src = 'https://example.com/fixture.mp4'
    source.src = 'https://example.com/fixture.mp4'
    video.srcObject = { fixture: true }
    resources.releaseMediaElement(video)
    assert.equal(video.srcObject, null)
    assert.equal(video.hasAttribute('src'), false)
    assert.equal(source.hasAttribute('src'), false)
    assert.deepEqual(calls.slice(-2), ['media-pause', 'media-load'])
    session.clear()
  })
}
