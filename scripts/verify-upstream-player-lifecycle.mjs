import assert from 'node:assert/strict'

import { loadSourceModule } from './sourceModuleHarness'

function clock() {
  const jobs = new Map()
  let id = 0
  return {
    jobs,
    setTimeout(callback, delay) {
      jobs.set(++id, { callback, delay })
      return id
    },
    clearTimeout: key => jobs.delete(key),
    run(delay) {
      for (const [key, job] of [...jobs]) {
        if (job.delay === delay && jobs.delete(key))
          job.callback()
      }
    },
  }
}

export function registerPlayerLifecycleChecks(check) {
  check('vertical zoom geometry: opposite sidebar, native toolbar clearance, zoomed frame and narrow space share one coordinate system', async () => {
    const { getVerticalZoomGeometry } = await import('../src/utils/verticalVideoZoomGeometry')
    const input = { width: 1000, height: 600, aspect: 9 / 16, zoomed: false, side: 'left', gap: 12, buttonWidth: 72, buttonHeight: 36, bottom: 540, toolbarBottom: 80 }
    const left = getVerticalZoomGeometry(input)
    assert.equal(left.side, 'left')
    assert.ok(left.top >= 92)
    assert.ok(left.left + Math.max(72, left.mapWidth) <= (1000 - 600 * 9 / 16) / 2)
    const right = getVerticalZoomGeometry({ ...input, side: 'right', zoomed: true })
    assert.equal(right.side, 'right')
    assert.ok(right.left >= 800)
    assert.ok(right.mapTop + right.mapHeight <= input.bottom)
    const narrow = getVerticalZoomGeometry({ ...input, width: 100, height: 150, bottom: 95, toolbarBottom: 48 })
    assert.equal(narrow.mapAvailable, false)
    assert.ok(narrow.top + 36 <= 95)
    assert.equal(getVerticalZoomGeometry({ ...input, width: 60 }).buttonAvailable, false)
  })

  check('player media: shared observation follows the owned replacement while the old video stays connected', async () => {
    const host = document.body.appendChild(document.createElement('div'))
    host.innerHTML = '<div id="bilibili-player"><div class="bpx-player-container"><div class="bpx-player-video-wrap"><video></video></div></div></div>'
    let current = host.querySelector('video')
    const old = current
    const media = await loadSourceModule('../src/utils/playerMedia.ts', { './videoMetadataBridge': { isNativeVideoComponentReady: node => node === current } })
    const observers = []
    class Observer {
      targets = new Map()
      constructor(callback) {
        this.callback = callback
        observers.push(this)
      }

      observe(target, options) { this.targets.set(target, options) }
      disconnect() { this.targets.clear() }
    }
    const lifecycle = await loadSourceModule('../src/contentScripts/playerDomLifecycle.ts', { '~/utils/playerMedia': media }, { MutationObserver: Observer })
    const seen = []
    const dispose = lifecycle.observePlayerDom(() => seen.push(media.getVideoElement()))
    try {
      assert.equal(seen.at(-1), old)
      const next = host.appendChild(document.createElement('div'))
      next.id = 'bilibili-player-wrap'
      next.innerHTML = '<div id="bilibili-player"><div class="bpx-player-container"><div class="bpx-player-video-wrap"><video></video></div></div></div>'
      current = next.querySelector('video')
      const bootstrap = observers.find(observer => observer.targets.get(document.body)?.subtree)
      bootstrap.callback([{ target: host, addedNodes: [next], removedNodes: [] }])
      assert.equal(old.isConnected, true)
      assert.equal(seen.at(-1), current)
      assert.equal(media.getPlayerRoot(), next)
      assert.ok(observers.some(observer => observer.targets.get(next)?.subtree), 'the observer actually binds the new root')
      const count = seen.length
      const clockNode = document.createElement('span')
      bootstrap.callback([{ target: next, addedNodes: [clockNode], removedNodes: [] }])
      assert.equal(seen.length, count)
      assert.equal(lifecycle.hasPlayerMediaMutation([{ addedNodes: [clockNode], removedNodes: [] }]), false)
    }
    finally {
      dispose()
      host.remove()
    }
    assert.equal(observers.reduce((count, observer) => count + observer.targets.size, 0), 0)
  })

  check('random play: replaced playlists are rediscovered; unrelated controls and stale rebuilds do no work', async () => {
    const time = clock()
    const host = document.body.appendChild(document.createElement('div'))
    host.innerHTML = '<section><div class="video-pod"><div class="auto-play"></div></div></section>'
    const observers = []
    let onRoute
    const href = { href: 'https://www.bilibili.com/video/BVfixture/', origin: 'https://www.bilibili.com', pathname: '/video/BVfixture/', search: '' }
    const module = await loadSourceModule('../src/utils/randomPlay.ts', {
      '~/composables/useRouteState': { onRouteChange: (callback) => {
        onRoute = callback
        return () => onRoute = undefined
      } },
      '~/contentScripts/playerDomLifecycle': { observePlayerDom: () => () => {}, hasPlayerMediaMutation: () => false },
      '~/logic': { settings: { value: { enableRandomPlay: true, randomPlayMode: 'manual', defaultCustomPlayOrder: 'sequential' } } },
      '~/utils/debug': { debugLog() {} },
      '~/utils/customPlayControls': await import('../src/utils/customPlayControls'),
      '~/utils/i18n': { i18n: { global: { t: key => key } } },
      '~/utils/randomPlayRetry': await import('../src/utils/randomPlayRetry'),
      './player': { VideoType: { MULTIPART: 'multipart', COLLECTION: 'collection' }, detectVideoType: () => 'multipart', supportsCustomPlaybackForVideoType: () => true, getVideoElement: () => null, setCustomEndPlaybackHandlerActive() {}, applyAutoPlayByVideoType() {} },
    }, {
      ...time,
      location: href,
      window: { location: href, setTimeout: time.setTimeout, clearTimeout: time.clearTimeout },
      MutationObserver: class {
        targets = new Map()
        constructor(callback) {
          this.callback = callback
          observers.push(this)
        }

        observe(target, options) { this.targets.set(target, options) }
        disconnect() { this.targets.clear() }
      },
    })
    try {
      module.initRandomPlay()
      const observer = observers[0]
      const controls = document.createElement('div')
      controls.className = 'bpx-player-container'
      observer.callback([{ target: controls, addedNodes: [document.createElement('span')], removedNodes: [] }])
      assert.equal([...time.jobs.values()].filter(job => job.delay === 300).length, 0)
      const old = host.firstElementChild
      const next = document.createElement('section')
      next.innerHTML = '<div class="video-pod"><div class="auto-play"></div></div>'
      host.replaceChild(next, old)
      observer.callback([{ target: host, addedNodes: [next], removedNodes: [old] }])
      assert.equal(observer.targets.size, 0)
      assert.ok(observers.at(-1).targets.has(next))
      const firstPending = [...time.jobs].find(([, job]) => job.delay === 300)?.[0]
      for (let i = 0; i < 100; i++)
        observers.at(-1).callback([{ target: next, addedNodes: [document.createElement('span')], removedNodes: [] }])
      assert.equal([...time.jobs].find(([, job]) => job.delay === 300)?.[0], firstPending, 'continuous DOM activity cannot postpone the pending update')
      const late = [...time.jobs.values()].map(job => job.callback)
      href.href = 'https://www.bilibili.com/'
      href.pathname = '/'
      onRoute({ pathname: '/', search: '' })
      late.forEach(callback => callback())
      assert.equal(host.querySelector('.random-play'), null)
      assert.equal(time.jobs.size, 0)
    }
    finally {
      module.destroyRandomPlay()
      host.remove()
    }
    assert.equal(onRoute, undefined)
  })

  check('random play: a real modern episode header hosts one control set and remounting preserves manual state', async () => {
    const time = clock()
    const settings = { value: { enableRandomPlay: true, defaultCustomPlayOrder: 'sequential', customPlayOrderOverrides: {} } }
    const host = document.body.appendChild(document.createElement('div'))
    host.innerHTML = '<div class="video-pod"><div class="video-pod__header"></div><div class="video-pod__list"><div class="simple-base-item" data-bvid="BV1xx411c7mD"></div><div class="simple-base-item" data-bvid="BV2xx411c7mD"></div></div></div>'
    const module = await loadSourceModule('../src/utils/randomPlay.ts', {
      '~/composables/useRouteState': { onRouteChange: () => () => {} },
      '~/contentScripts/playerDomLifecycle': { observePlayerDom: () => () => {}, hasPlayerMediaMutation: () => false },
      '~/logic': { settings },
      '~/utils/debug': { debugLog() {} },
      '~/utils/customPlayControls': await import('../src/utils/customPlayControls'),
      '~/utils/i18n': { i18n: { global: { t: key => key } } },
      '~/utils/randomPlayRetry': await import('../src/utils/randomPlayRetry'),
      './player': { VideoType: { MULTIPART: 'multipart', COLLECTION: 'collection', RECOMMEND: 'recommend' }, detectVideoType: () => 'collection', supportsCustomPlaybackForVideoType: () => true, getVideoElement: () => null, setCustomEndPlaybackHandlerActive() {}, applyAutoPlayByVideoType() {}, disableNativeEndPlaybackBehavior() {} },
    }, { ...time, location: { href: 'https://www.bilibili.com/video/BV1xx411c7mD/', pathname: '/video/BV1xx411c7mD/' }, window: { setTimeout: time.setTimeout, clearTimeout: time.clearTimeout } })
    try {
      const header = host.querySelector('.video-pod__header')
      const controls = module.createRandomPlayUI()
      assert.ok(controls, 'a playlist without the withdrawn native auto-play switch still gets controls')
      assert.equal(controls.parentElement, header)
      const select = controls.querySelector('select')
      select.value = 'reverse'
      select.dispatchEvent(new Event('change'))
      assert.equal(module.isRandomPlayActive(), true)
      const nextHeader = document.createElement('div')
      nextHeader.className = 'video-pod__header'
      header.replaceWith(nextHeader)
      host.append(controls)
      assert.equal(module.createRandomPlayUI(), controls)
      assert.equal(controls.parentElement, nextHeader)
      assert.equal(select.value, 'reverse')
      assert.equal(module.isRandomPlayActive(), true)
      assert.equal(host.querySelectorAll('.random-play').length, 1)
      settings.value.enableRandomPlay = false
      module.destroyRandomPlay()
      module.initRandomPlayOnVideoPage()
      assert.equal(host.querySelector('.random-play'), null)
      assert.equal(time.jobs.size, 0)
    }
    finally {
      module.destroyRandomPlay()
      host.remove()
    }
  })

  check('vertical zoom: pointer activity avoids layout reads, dimensions coalesce, media replacement and reset release work', async () => {
    const time = clock()
    const frames = new Map()
    let frameId = 0
    const host = document.body.appendChild(document.createElement('div'))
    host.className = 'bpx-player-container'
    host.innerHTML = '<div class="bpx-player-top-issue"></div><video></video><div class="bpx-player-control-wrap"></div>'
    let current = host.querySelector('video')
    let domChange
    let height = 500
    let reads = 0
    const rect = (top, h) => ({ left: 0, right: 800, top, bottom: top + h, width: 800, height: h })
    host.getBoundingClientRect = () => {
      reads++
      return rect(0, height)
    }
    Object.defineProperty(host, 'offsetHeight', { get: () => height })
    host.firstElementChild.getBoundingClientRect = () => rect(10, 48)
    host.lastElementChild.getBoundingClientRect = () => rect(height - 55, 55)
    Object.defineProperty(current, 'videoWidth', { value: 1080 })
    Object.defineProperty(current, 'videoHeight', { value: 1920 })
    const module = await loadSourceModule('../src/utils/verticalVideoZoom.ts', {
      'vue': await import('vue'),
      '~/contentScripts/playerDomLifecycle': { hasPlayerMediaMutation: () => true, observePlayerDom: (callback) => {
        domChange = callback
        return () => domChange = undefined
      } },
      '~/logic': { settings: { value: { language: 'en' } } },
      '~/utils/i18n': { i18n: { global: { t: key => key } } },
      './main': { injectCSS: (text) => {
        const style = document.head.appendChild(document.createElement('style'))
        style.textContent = text
        return style
      } },
      './playerMedia': { getVideoElement: () => current, getPlayerModeContainer: () => current?.closest('.bpx-player-container'), getPlayerRoot: () => host },
      './verticalVideoZoomGeometry': await import('../src/utils/verticalVideoZoomGeometry'),
    }, {
      ...time,
      ResizeObserver: class { observe() {} unobserve() {} disconnect() {} },
      requestAnimationFrame: (callback) => {
        frames.set(++frameId, callback)
        return frameId
      },
      cancelAnimationFrame: id => frames.delete(id),
    })
    const step = () => {
      const tasks = [...frames.values()]
      frames.clear()
      tasks.forEach(callback => callback())
    }
    try {
      module.initVerticalVideoZoom()
      time.run(0)
      step()
      const before = reads
      for (let i = 0; i < 100; i++)
        host.dispatchEvent(new MouseEvent('pointermove', { bubbles: true }))
      assert.equal(reads, before)
      assert.equal(frames.size, 0)
      assert.equal([...time.jobs.values()].filter(job => job.delay === 0).length, 0, 'hidden minimaps schedule no frame drawing')
      for (let i = 0; i < 100; i++)
        window.dispatchEvent(new Event('resize'))
      assert.equal(frames.size, 1)
      height = 180
      step()
      assert.equal(host.dataset.bewlyZoomMapAvailable, 'false')
      assert.ok(Number.parseInt(host.style.getPropertyValue('--bewly-vertical-video-controls-top')) + 36 <= 180 - 55)
      const replacement = host.appendChild(document.createElement('video'))
      current = replacement
      domChange()
      time.run(0)
      assert.equal(host.classList.contains('is-bewly-vertical-video'), false)
      console.log('PERF vertical controls fixture: 100 pointer moves = 0 layout reads; 100 size signals = 1 RAF')
    }
    finally {
      module.resetVerticalVideoZoom()
      host.remove()
    }
    assert.equal(time.jobs.size, 0)
    assert.equal(frames.size, 0)
    assert.equal(domChange, undefined)
  })
}
