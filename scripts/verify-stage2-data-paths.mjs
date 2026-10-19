import assert from 'node:assert/strict'

import { loadSourceModule } from './sourceModuleHarness'

function seeded(seed) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 2 ** 32
    return seed / 2 ** 32
  }
}

export function registerStage2DataPathChecks(check, { Vue, flush }) {
  check('stage 2 index: Fenwick append, partial-row update and truncate match a full rebuild', async () => {
    const { CardRowMetrics } = await import('../src/utils/cardRowMetrics')
    const random = seeded(7)
    const incremental = new CardRowMetrics()
    let heights = []
    for (let round = 0; round < 60; round++) {
      const action = random()
      if (action < 0.55) {
        const added = Array.from({ length: 1 + Math.floor(random() * 9) }, () => Math.round(50 + random() * 300))
        heights = heights.concat(added)
        incremental.append(added)
      }
      else if (action < 0.8 && heights.length) {
        const row = Math.floor(random() * heights.length)
        heights[row] = Math.round(50 + random() * 300)
        incremental.set(row, heights[row])
      }
      else {
        const rows = Math.floor(random() * heights.length)
        heights = heights.slice(0, rows)
        incremental.truncate(rows)
      }
      const reference = new CardRowMetrics()
      reference.reset(heights.slice())
      assert.equal(incremental.length, heights.length)
      for (let row = 0; row <= heights.length; row++)
        assert.equal(incremental.offset(row), reference.offset(row), `prefix ${row} after round ${round}`)
      for (const offset of [0, 1, 400, incremental.total / 2, incremental.total - 1, incremental.total + 50])
        assert.equal(incremental.rowAt(offset), reference.rowAt(offset))
    }
  })

  check('stage 2 index: moment columns extend appended rows, rebuild only a replaced column and keep totals current', async () => {
    const { createMomentColumnIndex } = await import('../src/utils/momentColumnIndex')
    const heights = new Map()
    let reads = 0
    const heightOf = (item) => {
      reads++
      return heights.get(item.id)
    }
    const make = (id, height) => {
      heights.set(id, height)
      return { id }
    }
    const index = createMomentColumnIndex(item => item.id, heightOf, 16)
    const columns = [[make('a', 100), make('b', 200)], [make('c', 150)]]
    index.sync(columns, 'layout')
    assert.equal(index.stackHeight(columns[0]), 316)
    reads = 0
    columns[0].push(make('d', 50), make('e', 80))
    index.sync(columns, 'layout')
    assert.equal(reads, 2, 'an appended page reads only the new rows')
    assert.equal(index.stackHeight(columns[0]), 100 + 200 + 50 + 80 + 16 * 3)
    assert.equal(index.stackHeight(columns[1]), 150, 'the untouched column keeps its rows')
    index.updateHeight('b', 260)
    assert.equal(index.stackHeight(columns[0]), 100 + 260 + 50 + 80 + 16 * 3, 'a measured row updates the column total')
    const replacement = { id: 'b' }
    columns[0][index.locate('b').row] = replacement
    reads = 0
    index.sync(columns, 'layout')
    assert.equal(reads, 0, 'replacing an entity with the same key, order and height rebuilds nothing')
    const moved = [columns[1][0], make('f', 40)]
    columns[1] = moved
    reads = 0
    index.sync(columns, 'layout')
    assert.equal(reads, 2, 'a replaced column rebuilds alone')
    assert.deepEqual(index.locate('f'), { column: 1, row: 1 })
    const window = index.window(0, 10_000)
    assert.deepEqual(window.map(column => column.items.map(item => item.id)), [['a', 'b', 'd', 'e'], ['c', 'f']])
    assert.equal(window[0].items[1], replacement)
    reads = 0
    index.sync(columns, 'wider')
    assert.equal(reads, 6, 'a new layout version rebuilds every column')
  })

  check('stage 2 cache: parked tabs shrink derivable fields before whole tabs are evicted; totals follow take and evict', async () => {
    const { createHomeTabCache } = await loadSourceModule('../src/composables/useHomeTabState.ts', { vue: Vue })
    const cache = createHomeTabCache(100)
    const shrink = new Map([['grid', value => ({ ...value, measurements: [] })]])
    const tab = count => ({ list: Array.from({ length: count }, (_, id) => ({ id })), cursor: `c${count}`, grid: { anchor: { key: 1, offset: 0 }, measurements: Array.from({ length: count }, (_, id) => [id, { height: 1 }]) } })
    cache.save('a', tab(30), cache.generation, shrink)
    cache.save('b', tab(30), cache.generation, shrink)
    assert.ok(cache.parkedEntries <= 100)
    const a = cache.take('a')
    assert.ok(a, 'the older tab survives by shedding its measurements first')
    assert.equal(a.grid.measurements.length, 0)
    assert.equal(a.list.length, 30, 'the list, its cursor and anchor stay paired')
    assert.equal(a.cursor, 'c30')
    assert.deepEqual(a.grid.anchor, { key: 1, offset: 0 })
    const remaining = cache.parkedEntries
    cache.save('c', tab(80), cache.generation, shrink)
    assert.equal(cache.take('b'), undefined, 'a tab that cannot shrink enough is evicted whole')
    assert.ok(cache.parkedEntries <= 100 && cache.parkedEntries > remaining)
    cache.clear()
    assert.equal(cache.parkedEntries, 0)
  })

  check('stage 2 feed: appends index and project only their batch; hidden ads stay accepted and replacements rebuild', async () => {
    const { createRecommendationFeed } = await loadSourceModule('../src/contentScripts/views/Home/recommendationFeed.ts', { vue: Vue })
    const blockAds = Vue.ref(true)
    const list = Vue.shallowRef([])
    let keyReads = 0
    const scope = Vue.effectScope()
    const feed = scope.run(() => createRecommendationFeed(list, { blockAds: () => blockAds.value, keysOf: (entry) => {
      keyReads++
      return [entry.uniqueId]
    } }))
    const entry = (id, ad = false) => ({ uniqueId: id, isAdvertisement: ad })
    feed.append([entry('a'), entry('ad1', true), entry('b')])
    assert.deepEqual(feed.visible.value.map(item => item.uniqueId), ['a', 'b'])
    keyReads = 0
    const firstVisible = feed.visible.value
    feed.append([entry('c')])
    assert.equal(keyReads, 1, 'the next page touches only its own entries')
    assert.equal(feed.visible.value[0], firstVisible[0], 'unchanged entries keep their references')
    assert.ok(feed.has('ad1') && feed.has('c'))
    assert.equal(list.value.length, 4, 'the accepted list keeps the advertisement')
    blockAds.value = false
    await flush()
    assert.deepEqual(feed.visible.value.map(item => item.uniqueId), ['a', 'ad1', 'b', 'c'], 'turning the filter off restores it')
    const snapshot = list.value
    list.value = [entry('z')]
    assert.ok(!feed.has('a') && feed.has('z'), 'a replaced list rebuilds the index')
    list.value = snapshot
    assert.deepEqual(feed.visible.value.map(item => item.uniqueId), ['a', 'ad1', 'b', 'c'], 'undo restores the shared snapshot unchanged')
    scope.stop()
  })

  check('stage 2 images: ranks are measured once per geometry version, freed slots reuse them and visible work keeps reserved slots', async () => {
    const documentState = { hidden: false, listeners: new Map() }
    const fakeDocument = {
      get hidden() { return documentState.hidden },
      addEventListener: (name, fn) => documentState.listeners.set(name, fn),
      fonts: undefined,
    }
    const queue = await loadSourceModule('../src/utils/imageLoadQueue.ts', { './viewportGeometry': { subscribeViewportFrame: () => () => {} } }, {
      document: fakeDocument,
      window: { innerHeight: 1000 },
    })
    let rectReads = 0
    const element = top => ({ getBoundingClientRect: () => {
      rectReads++
      return { top, bottom: top + 100 }
    } })
    const finishers = []
    const started = []
    const elements = new Map()
    const enqueue = (name, top) => {
      elements.set(name, element(top))
      return queue.enqueueImageLoad({
        geometry: () => ({ element: elements.get(name), root: null }),
        start: () => new Promise((resolve) => {
          started.push(name)
          finishers.push(resolve)
        }),
      })
    }
    const settle = async () => {
      for (let i = 0; i < 4; i++)
        await Promise.resolve()
    }
    for (let index = 0; index < 8; index++)
      enqueue(`ahead${index}`, 1500 + index * 100)
    await settle()
    assert.equal(rectReads, 8)
    assert.equal(started.length, 4, 'off-screen pictures leave two slots for visible ones')
    enqueue('visible', 100)
    await settle()
    assert.equal(started.at(-1), 'visible')
    rectReads = 0
    finishers.shift()()
    await settle()
    assert.equal(rectReads, 0, 'a freed slot with unchanged geometry neither measures nor re-sorts')
    documentState.hidden = true
    finishers.splice(0).forEach(finish => finish())
    await settle()
    const startedWhileHidden = started.length
    queue.invalidateImageLoadPriorities()
    await settle()
    assert.equal(started.length, startedWhileHidden, 'a hidden page starts nothing')
    documentState.hidden = false
    documentState.listeners.get('visibilitychange')()
    await settle()
    assert.ok(started.length > startedWhileHidden, 'becoming visible resumes with fresh ranks')
  })

  check('stage 2 preview: HLS media recovery is bounded per instance, resets only after stable playback and stops with the session', async () => {
    const timers = new Map()
    let timerId = 0
    const { createPreviewMediaSession, HLS_MEDIA_RECOVERY_DELAYS_MS } = await loadSourceModule('../src/utils/previewMediaSession.ts', {}, {
      setTimeout: (fn) => {
        timers.set(++timerId, fn)
        return timerId
      },
      clearTimeout: id => timers.delete(id),
    })
    const runTimers = () => {
      const pending = [...timers.values()]
      timers.clear()
      pending.forEach(fn => fn())
    }
    const session = createPreviewMediaSession()
    const video = document.createElement('video')
    Object.defineProperty(video, 'paused', { value: false, configurable: true })
    let time = 0
    Object.defineProperty(video, 'currentTime', { get: () => time, configurable: true })
    let recovered = 0
    let exhausted = 0
    const player = { recoverMediaError: () => recovered++, destroy() {} }
    session.hls = player
    const fail = () => session.recoverHlsMediaError(player, video, () => exhausted++)
    fail()
    fail()
    assert.equal(timers.size, 1, 'a pending recovery absorbs repeated errors')
    runTimers()
    for (let attempt = 1; attempt < HLS_MEDIA_RECOVERY_DELAYS_MS.length; attempt++) {
      video.dispatchEvent(new Event('timeupdate'))
      fail()
      runTimers()
    }
    assert.equal(recovered, HLS_MEDIA_RECOVERY_DELAYS_MS.length)
    video.dispatchEvent(new Event('canplay'))
    fail()
    assert.equal(exhausted, 1, 'canplay/play do not restore the budget; exhaustion hands over once')
    session.hls = player
    fail()
    runTimers()
    video.dispatchEvent(new Event('timeupdate'))
    time = 5
    video.dispatchEvent(new Event('timeupdate'))
    fail()
    assert.equal(timers.size, 1, 'stable playback after a recovery restores the budget')
    session.clear()
    assert.equal(timers.size, 0, 'closing clears the pending recovery')
  })

  check('stage 2 preview: static cards register no fullscreen listener; media owners share one pair', async () => {
    const fullscreen = await loadSourceModule('../src/utils/fullscreenChange.ts', {})
    const added = []
    const removed = []
    const originalAdd = document.addEventListener
    const originalRemove = document.removeEventListener
    document.addEventListener = name => added.push(name)
    document.removeEventListener = name => removed.push(name)
    try {
      let calls = 0
      const first = fullscreen.subscribeFullscreenChange(() => calls++)
      const second = fullscreen.subscribeFullscreenChange(() => calls++)
      assert.deepEqual(added, ['fullscreenchange', 'webkitfullscreenchange'])
      first()
      first()
      assert.equal(removed.length, 0)
      second()
      assert.deepEqual(removed, ['fullscreenchange', 'webkitfullscreenchange'])
      assert.equal(calls, 0)
    }
    finally {
      document.addEventListener = originalAdd
      document.removeEventListener = originalRemove
    }
  })
}
