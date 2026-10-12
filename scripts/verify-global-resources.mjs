import assert from 'node:assert/strict'

import { loadSourceModule } from './sourceModuleHarness'

export function registerGlobalResourceChecks(check, { Vue, flush }) {
  check('Global resources: episode metadata cache is bounded, shares in-flight reads and rejects invalid IDs without a request', async () => {
    const calls = []
    const api = { anime: { getAnimeDetail: async ({ ep_id }) => {
      calls.push(ep_id)
      return { code: 0, result: { episodes: [{ id: ep_id, aid: ep_id + 1000 }] } }
    } } }
    const { resolvePgcEpisodeVideoIds: resolve, PGC_EPISODE_CACHE_LIMIT: limit } = await loadSourceModule('../src/utils/pgcEpisode.ts', { '~/utils/api': { default: api } })
    await Promise.all([resolve(1), resolve(1)])
    assert.deepEqual(calls, [1])
    for (const invalid of [0, -1, Number.NaN, 1.5, Number.POSITIVE_INFINITY])
      assert.equal(await resolve(invalid), undefined)
    assert.equal(calls.length, 1)
    for (let id = 2; id <= limit; id++)
      await resolve(id)
    await resolve(1)
    await resolve(limit + 1)
    await resolve(1)
    assert.equal(calls.length, limit + 1, 'a recently used ID survives eviction')
    await resolve(2)
    assert.equal(calls.length, limit + 2, 'the least recently used ID is read again instead of retained indefinitely')
  })

  check('Global resources: photo viewers ignore unrelated mutations, track shadow roots and coalesce visibility reads', async () => {
    const { isPhotoViewerOpen, observePhotoViewerState } = await import('../src/utils/photoViewer')
    const doc = document.implementation.createHTMLDocument('viewer-fixture')
    const noise = doc.body.appendChild(doc.createElement('div'))
    const viewer = doc.body.appendChild(doc.createElement('div'))
    viewer.className = 'pswp'
    viewer.getBoundingClientRect = () => ({ width: 300, height: 200 })
    const query = doc.querySelectorAll.bind(doc)
    let queries = 0
    doc.querySelectorAll = (...args) => {
      queries++
      return query(...args)
    }
    const legacy = new MutationObserver(() => isPhotoViewerOpen(doc))
    legacy.observe(doc.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] })
    for (let index = 0; index < 20; index++) {
      noise.className = `before-${index}`
      await flush()
    }
    assert.equal(queries, 20, 'baseline performs a full scan for every unrelated mutation batch')
    legacy.disconnect()
    const previousFrame = globalThis.requestAnimationFrame
    const previousCancel = globalThis.cancelAnimationFrame
    const frames = new Map()
    let sequence = 0
    globalThis.requestAnimationFrame = (callback) => {
      frames.set(++sequence, callback)
      return sequence
    }
    globalThis.cancelAnimationFrame = id => frames.delete(id)
    const tick = () => {
      const pending = [...frames.values()]
      frames.clear()
      pending.forEach(callback => callback())
    }
    const states = []
    const stop = observePhotoViewerState(open => states.push(open), doc)
    queries = 0
    try {
      for (let index = 0; index < 20; index++) {
        noise.className = `after-${index}`
        await flush()
      }
      assert.equal(queries, 0)
      assert.equal(frames.size, 0, 'unrelated mutations do not even schedule a visibility measurement')
      viewer.className = 'pswp pswp--open'
      await flush()
      viewer.style.backgroundColor = 'red'
      await flush()
      assert.equal(frames.size, 1, 'relevant mutations in one frame share a measurement')
      tick()
      assert.deepEqual(states, [false, true])
      viewer.style.display = 'none'
      await flush()
      tick()
      assert.deepEqual(states, [false, true, false])
      const host = doc.createElement('div')
      host.id = 'bewly'
      const shadow = host.attachShadow({ mode: 'open' })
      doc.body.append(host)
      await flush()
      tick()
      const inner = shadow.appendChild(doc.createElement('div'))
      inner.className = 'moment-image-viewer'
      inner.getBoundingClientRect = () => ({ width: 300, height: 200 })
      await flush()
      tick()
      assert.equal(states.at(-1), true, 'shadow-only viewer insertion must notify the parent')
      inner.remove()
      await flush()
      tick()
      assert.equal(states.at(-1), false)
      viewer.style.display = 'block'
      await flush()
      assert.equal(frames.size, 1)
      stop()
      assert.equal(frames.size, 0)
      noise.className = 'disposed'
      await flush()
      assert.equal(frames.size, 0)
    }
    finally {
      stop()
      globalThis.requestAnimationFrame = previousFrame
      globalThis.cancelAnimationFrame = previousCancel
    }
  })

  check('Global resources: anchored floating UI batches scroll, follows resized text and cannot restart after disposal', async () => {
    const { useAnchoredPopoverPosition } = await import('../src/composables/useAnchoredPopoverPosition')
    const { computeTooltipPosition } = await import('../src/utils/floatingMenu')
    const previousObserver = globalThis.ResizeObserver
    const previousFrame = globalThis.requestAnimationFrame
    const previousCancel = globalThis.cancelAnimationFrame
    const frames = new Map()
    const observers = []
    let sequence = 0
    let reads = 0
    let tipWidth = 80
    globalThis.requestAnimationFrame = (callback) => {
      frames.set(++sequence, callback)
      return sequence
    }
    globalThis.cancelAnimationFrame = id => frames.delete(id)
    globalThis.ResizeObserver = class {
      constructor(callback) {
        this.callback = callback
        this.targets = new Set()
        observers.push(this)
      }

      observe(target) { this.targets.add(target) }
      disconnect() { this.targets.clear() }
    }
    const trigger = document.body.appendChild(document.createElement('button'))
    const popup = document.body.appendChild(document.createElement('div'))
    trigger.getBoundingClientRect = () => {
      reads++
      return { top: 40, bottom: 68, left: 400, right: 440, width: 40 }
    }
    popup.getBoundingClientRect = () => {
      reads++
      return { width: tipWidth * 0.8, height: 24 * 0.8 }
    }
    Object.defineProperty(popup, 'offsetWidth', { configurable: true, get: () => tipWidth })
    Object.defineProperty(popup, 'offsetHeight', { configurable: true, get: () => 24 })
    const visible = Vue.ref(true)
    const scope = Vue.effectScope()
    try {
      scope.run(() => useAnchoredPopoverPosition(Vue.shallowRef(trigger), Vue.shallowRef(popup), visible, (anchor, rect, width, height) => computeTooltipPosition(anchor, rect, width, height, 'bottom-right')))
      await flush()
      assert.equal(observers.length, 1)
      assert.equal(popup.style.left, '360px', 'entry scale does not distort the final anchor')
      reads = 0
      for (let index = 0; index < 30; index++)
        window.dispatchEvent(new Event('scroll'))
      assert.equal(frames.size, 1)
      assert.equal(reads, 0, 'events do not synchronously force layout')
      tipWidth = 160
      observers[0].callback([])
      const callbacks = [...frames.values()]
      frames.clear()
      callbacks.forEach(callback => callback())
      assert.equal(reads, 2, 'one anchor read and one tooltip read per frame')
      assert.equal(popup.style.left, '280px', 'longer text re-aligns its right edge to the trigger')
      visible.value = false
      await flush()
      assert.equal(observers[0].targets.size, 0)
      visible.value = true
      await Vue.nextTick()
      scope.stop()
      await flush()
      assert.equal(observers.length, 1, 'a queued nextTick start cannot revive disposed observers')
      window.dispatchEvent(new Event('scroll'))
      assert.equal(frames.size, 0)
    }
    finally {
      scope.stop()
      trigger.remove()
      popup.remove()
      globalThis.ResizeObserver = previousObserver
      globalThis.requestAnimationFrame = previousFrame
      globalThis.cancelAnimationFrame = previousCancel
    }
  })
}
