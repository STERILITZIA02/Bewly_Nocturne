import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import { Worker } from 'node:worker_threads'

import ts from 'typescript'

import { filterFavoriteItems } from '../src/contentScripts/views/Favorites/favoriteSearch'
import { buildCommentTree } from '../src/utils/commentTree'
import * as filterRules from '../src/utils/filterRules'
import { matchRegexBatch } from '../src/utils/regexBatch'
import { loadSourceModule } from './sourceModuleHarness'

export function registerPerformanceImplementationChecks(check, { Vue, compileComponent, flush }) {
  check('performance: ordinary filtering normalizes once, bypasses followed content once and sends only regex candidates', async () => {
    let executions = 0
    const settings = Vue.ref({ recommendationMode: 'web', disableFilterForFollowedUser: true, enableFilterByTitle: true, enableFilterByUser: true, filterByTitle: [{ keyword: 'SPOILER' }, { keyword: '/(?<=episode )42$/' }], filterByUser: [{ keyword: 'blocked' }, { keyword: '/^(bot)\\1$/' }] })
    const { useFilter, FilterType } = await loadSourceModule('../src/composables/useFilter.ts', {
      '~/logic': { settings },
      'vue-i18n': { useI18n: () => ({ t: key => key }) },
      'vue-toastification': { useToast: () => ({ error: message => assert.fail(message) }) },
      '~/utils/filterRules': filterRules,
      '~/utils/uriParse': { isVerticalVideo: () => false },
      '~/utils/regexBatchRunner': { createRegexBatchRunner: () => ({ dispose() {}, run: async (groups) => {
        executions++
        return matchRegexBatch(groups)
      } }) },
    }, Vue)
    const scope = Vue.effectScope()
    const filter = scope.run(() => useFilter(['followed'], [FilterType.title, FilterType.user], [['title'], ['author']]))
    try {
      const items = [
        { title: 'Spoiler', author: 'ok' },
        { title: 'episode 42', author: 'ok' },
        { title: 'normal', author: 'BLOCKED' },
        { title: 'normal', author: 'botbot' },
        { title: 'episode 42', author: 'blocked', followed: true },
        { title: 'normal', author: 'ok' },
        null,
      ]
      assert.deepEqual(await filter.value(items), [false, false, false, false, true, true, true])
      assert.equal(executions, 1)
      settings.value.filterByTitle = [{ keyword: 'spoiler' }]
      settings.value.filterByUser = [{ keyword: 'blocked' }]
      await flush()
      assert.deepEqual(await filter.value(items), [false, true, false, true, true, true, true])
      assert.equal(executions, 1, 'ordinary keywords never start worker jobs')
    }
    finally { scope.stop() }
  })

  check('performance: regex host preserves packaged URLs, relays failures and releases workers on unload', async () => {
    const events = new Map()
    const messages = []
    const timers = new Map()
    const parent = {}
    let worker
    class FakeWorker {
      constructor(url) {
        this.url = url
        worker = this
      }

      postMessage(data) { this.request = data }
      terminate() { this.terminated = true }
    }
    const source = (await readFile(new URL('../src/regex/host.ts', import.meta.url), 'utf8')).replaceAll('import.meta.url', JSON.stringify('chrome-extension://fixture/dist/regex/host.js'))
    vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
      exports: {},
      parent,
      URL,
      Worker: FakeWorker,
      window: { addEventListener: (key, listener) => events.set(key, listener), removeEventListener: key => events.delete(key) },
      setTimeout: (callback, delay, ...args) => {
        timers.set(1, { callback: () => callback(...args), delay })
        return 1
      },
      clearTimeout: id => timers.delete(id),
    })
    const port = { postMessage: message => messages.push(message), close() {} }
    events.get('message')({ source: parent, ports: [port] })
    assert.equal(worker.url.href, 'chrome-extension://fixture/dist/regex/worker.js')
    worker.onmessage({ data: { ready: true } })
    port.onmessage({ data: { id: 1, groups: [{ rules: ['a'], values: [['a']] }] } })
    assert.equal(timers.get(1).delay, 250)
    worker.onmessage({ data: { id: 1, matches: [[true]] } })
    assert.equal(timers.size, 0)
    port.onmessage({ data: { id: 2, groups: [{ rules: ['^(a+)+$'], values: [['aaaa!']] }] } })
    timers.get(1).callback()
    assert.equal(worker.terminated, true)
    assert.match(messages.at(-1).error, /250 ms/)
    assert.equal(messages.at(-1).id, 2)
    events.get('pagehide')()
    assert.equal(worker.terminated, true)
  })

  check('performance: actual regex worker supports JS syntax and pathological matches cannot stall its owner', async () => {
    const source = await readFile(new URL('../src/regex/worker.ts', import.meta.url), 'utf8')
    const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
    const code = `import {parentPort} from 'node:worker_threads'; const exports={}; const require=()=>({matchRegexBatch:${matchRegexBatch.toString()}}); globalThis.postMessage=data=>parentPort.postMessage(data); parentPort.on('message',data=>globalThis.onmessage({data})); ${compiled}`
    const worker = new Worker(new URL(`data:text/javascript,${encodeURIComponent(code)}`))
    const once = () => new Promise((resolve, reject) => {
      worker.once('message', resolve)
      worker.once('error', reject)
    })
    try {
      await once()
      const normal = once()
      worker.postMessage({ id: 1, groups: [{ rules: ['(?<=episode )42$', '^(bot)\\1$'], values: [['episode 42'], ['botbot'], ['safe']] }] })
      assert.deepEqual(await normal, { id: 1, matches: [[true, true, false]] })
      let responsive = false
      const tick = setTimeout(() => {
        responsive = true
      }, 10)
      worker.postMessage({ id: 2, groups: [{ rules: ['^(a+)+$'], values: [[`${'a'.repeat(30)}!`]] }] })
      await new Promise(resolve => setTimeout(resolve, 250))
      assert.equal(responsive, true)
      clearTimeout(tick)
    }
    finally { await worker.terminate() }
  })

  check('performance: regex runner reuses its host and cancels startup, pending work and stale ports', async () => {
    const frames = []
    const channels = []
    const timers = new Map()
    let timerId = 0
    class Channel {
      constructor() {
        this.sent = []
        this.port1 = { postMessage: data => this.sent.push(data), close: () => this.closed = true }
        this.port2 = {}
        channels.push(this)
      }
    }
    const { createRegexBatchRunner } = await loadSourceModule('../src/utils/regexBatchRunner.ts', {
      'webextension-polyfill': { default: { runtime: { getURL: path => `chrome-extension://fixture/${path}` } } },
    }, {
      DOMException,
      MessageChannel: Channel,
      setTimeout: (callback, delay) => {
        timers.set(++timerId, { callback, delay })
        return timerId
      },
      clearTimeout: id => timers.delete(id),
      document: {
        createElement: () => {
          const frame = {
            contentWindow: { postMessage: (_message, origin) => assert.equal(origin, 'chrome-extension://fixture/') },
            remove() { this.removed = true },
          }
          frames.push(frame)
          return frame
        },
        documentElement: { append() {} },
      },
    })
    const runner = createRegexBatchRunner()
    const groups = [{ rules: ['a'], values: [['a']] }]
    const first = runner.run(groups)
    frames[0].onload()
    channels[0].port1.onmessage({ data: { ready: true } })
    await flush()
    const id = channels[0].sent[0].id
    channels[0].port1.onmessage({ data: { id, matches: [[true]] } })
    assert.deepEqual(await first, [[true]])
    const second = runner.run(groups)
    await flush()
    assert.equal(frames.length, 1, 'reuse the idle worker between pages')
    const cancelled = assert.rejects(second, { name: 'AbortError' })
    runner.dispose()
    await cancelled
    assert.equal(frames[0].removed, true)
    assert.equal(channels[0].closed, true)
    const third = runner.run(groups)
    channels[0].port1.onmessage({ data: { ready: true } })
    assert.equal(timers.size, 1, 'an old port cannot settle the new startup')
    frames[1].onload()
    channels[1].port1.onmessage({ data: { ready: true } })
    await flush()
    const deadline = [...timers.values()][0]
    assert.equal(deadline.delay, 1000)
    const timedOut = assert.rejects(third, /did not finish/)
    deadline.callback()
    await timedOut
    assert.equal(frames[1].removed, true, 'timeout destroys the frame that owns the worker')
    const fourth = runner.run(groups)
    const startupCancelled = assert.rejects(fourth, { name: 'AbortError' })
    runner.dispose()
    await startupCancelled
    assert.equal(frames[2].removed, true)
    assert.equal(timers.size, 0)
  })

  check('performance: favorite search reuses text, invalidates edits and does no work for an empty query', () => {
    const items = [{ title: 'Ａlpha title', author: 'User' }, { title: 'Beta', author: 'Other' }]
    const values = item => [item.title, item.author]
    assert.equal(filterFavoriteItems(items, '  ', () => assert.fail('empty query must not read rows')), items)
    assert.deepEqual(filterFavoriteItems(items, 'alpha USER', values), [items[0]])
    assert.deepEqual(filterFavoriteItems(items, 'beta', values), [items[1]])
    items[0].title = 'Beta edited'
    assert.deepEqual(filterFavoriteItems(items, 'beta', values), items)
    assert.deepEqual(filterFavoriteItems(items, 'user', item => [item.title]), [], 'changing search scope invalidates cached fields')
  })

  check('performance: 10000-node reversed comment chains have bounded traversal stacks and stable depth', () => {
    const items = Array.from({ length: 10000 }, (_, index) => ({ id: String(index + 1), rootId: '1', parentId: String(index), createdAt: index, originalOrder: index })).reverse()
    const capped = buildCommentTree(items, 6)
    assert.equal(capped.length, items.length)
    assert.equal(Math.max(...capped.map(item => item.depth)), 6)
    const uncapped = buildCommentTree(items)
    assert.equal(uncapped.at(-1).depth, 9999)
  })

  check('performance: notification masonry retains bounded DOM, focused rows and indexed offsets across 10000 items', async () => {
    const viewport = document.body.appendChild(document.createElement('section'))
    const items = Vue.shallowRef(Vue.shallowReactive(Array.from({ length: 10000 }, (_, index) => ({ id: String(index) }))))
    let columns = 2
    let frame
    let releases = 0
    const observers = []
    class Observer {
      constructor(callback) {
        this.callback = callback
        observers.push(this)
      }

      observe() {}
      unobserve() {}
      disconnect() { this.disconnected = true }
    }
    const Grid = await compileComponent('../src/components/WindowedMasonryGrid.vue', {
      '~/utils/viewportGeometry': {
        readViewportGeometry: () => ({ top: 0, scrollTop: viewport.scrollTop, clientHeight: 600 }),
        subscribeViewportFrame: (_root, listener) => {
          frame = listener
          return () => releases++
        },
        invalidateViewportGeometry() {},
      },
      '~/utils/scrollIntent': { getScrollIntent: () => ({ active: false }) },
    }, { globals: {
      ResizeObserver: Observer,
      getComputedStyle: () => ({ getPropertyValue: () => String(columns), columnGap: '12' }),
    } })
    const width = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth')
    const rectangle = HTMLElement.prototype.getBoundingClientRect
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 1000 })
    HTMLElement.prototype.getBoundingClientRect = () => ({ top: -viewport.scrollTop, bottom: 600 - viewport.scrollTop, left: 0, right: 1000, width: 1000, height: 600 })
    const grid = Vue.ref()
    let snapshot
    const createApp = () => Vue.createApp({ setup: () => () => Vue.h(Grid, { ref: grid, items: items.value, itemKey: item => item.id, viewport, active: true, snapshot, onSnapshot: value => snapshot = value }, { default: ({ item }) => Vue.h('button', item.id) }) })
    let app = createApp()
    try {
      app.mount(viewport)
      await flush()
      assert.ok(viewport.querySelectorAll('button').length <= 16)
      observers[0].callback([...viewport.querySelectorAll('[data-masonry-key]')].slice(0, 2).map(target => ({ target, borderBoxSize: [{ blockSize: 180 }], contentRect: { height: 180 } })))
      await flush()
      const first = viewport.querySelector('button')
      const stableOffset = grid.value.itemOffset('100')
      items.value.push(...Array.from({ length: 20 }, (_, index) => ({ id: String(10000 + index) })))
      await flush()
      assert.equal(grid.value.itemOffset('100'), stableOffset, 'appending never reassigns existing columns')
      first.focus()
      await flush()
      viewport.scrollTop = 1_000_000
      frame({}, 'scroll')
      await flush()
      assert.equal(document.activeElement, first)
      assert.ok(viewport.querySelectorAll('button').length <= 18)
      assert.ok(grid.value.itemOffset('9999') > 1_000_000, 'unmounted rows retain exact indexed offsets')
      assert.equal(viewport.querySelector('[data-masonry-key="9999"]'), null)
      items.value = [{ id: 'new' }, ...items.value]
      await flush()
      assert.ok(grid.value.itemOffset('9999') > 1_000_000)
      const offset = grid.value.itemOffset('9999')
      app.unmount()
      assert.ok(snapshot.heights.length > 0)
      app = createApp()
      app.mount(viewport)
      await flush()
      assert.equal(grid.value.itemOffset('9999'), offset, 'category remount restores column assignment and measured heights')
      assert.ok(viewport.querySelectorAll('button').length <= 18)
      columns = 1
      grid.value.layout()
      await flush()
      assert.ok([...viewport.querySelectorAll('[data-masonry-key]')].every(element => element.style.left === '0px'))
      const keys = [...viewport.querySelectorAll('[data-masonry-key]')].map(element => Number(element.dataset.masonryKey))
      assert.deepEqual(keys, [...keys].sort((a, b) => a - b), 'windowed DOM keeps source order after reflow')
    }
    finally {
      app.unmount()
      viewport.remove()
      HTMLElement.prototype.getBoundingClientRect = rectangle
      if (width)
        Object.defineProperty(HTMLElement.prototype, 'clientWidth', width)
      else delete HTMLElement.prototype.clientWidth
    }
    assert.equal(releases, 2)
    assert.ok(observers.every(observer => observer.disconnected))
  })
}
