import assert from 'node:assert/strict'

import { loadSourceFunctions } from './sourceFunctionHarness'
import { loadSourceModule } from './sourceModuleHarness'

function clock() {
  let id = 0
  let now = 1000
  const timers = new Map()
  const frames = new Map()
  return {
    timers,
    frames,
    performance: { now: () => now },
    Date: { now: () => now },
    setTimeout(fn) {
      timers.set(++id, fn)
      return id
    },
    clearTimeout(id) { timers.delete(id) },
    requestAnimationFrame(fn) {
      frames.set(++id, fn)
      return id
    },
    cancelAnimationFrame(id) { frames.delete(id) },
    frame() {
      now += 16
      const pending = [...frames.values()]
      frames.clear()
      pending.forEach(fn => fn(now))
    },
  }
}

export function registerUpstreamMomentChecks(check, { Vue, flush, compileComponent }) {
  check('Home drag selection: only unmodified empty background is intercepted; titles, links, selection and layout editing remain native', async () => {
    const editing = Vue.ref(false)
    const selection = { isCollapsed: true }
    const home = await loadSourceFunctions('../src/contentScripts/views/Home/Home.vue', ['preventBackgroundSelection'], { isLayoutEditing: editing, window: { getSelection: () => selection }, HTMLElement })
    const wrapper = document.createElement('main')
    const grid = wrapper.appendChild(document.createElement('div'))
    grid.className = 'video-card-grid-container'
    const title = grid.appendChild(document.createElement('a'))
    title.textContent = 'Selectable title'
    const event = target => ({ target, currentTarget: wrapper, button: 0, preventDefault() {
      this.prevented = true
    } })
    const empty = event(grid)
    home.preventBackgroundSelection(empty)
    assert.equal(empty.prevented, true)
    for (const target of [title, document.createElement('input')]) {
      const text = event(target)
      home.preventBackgroundSelection(text)
      assert.equal(text.prevented, undefined)
    }
    for (const option of ['shiftKey', 'ctrlKey', 'metaKey', 'altKey']) {
      const modified = { ...event(grid), [option]: true }
      home.preventBackgroundSelection(modified)
      assert.equal(modified.prevented, undefined)
    }
    editing.value = true
    const layout = event(grid)
    home.preventBackgroundSelection(layout)
    assert.equal(layout.prevented, undefined)
    editing.value = false
    selection.isCollapsed = false
    const selected = event(grid)
    home.preventBackgroundSelection(selected)
    assert.equal(selected.prevented, undefined)
  })
  check('moment preview: actual media ids, MP4/HLS/FLV first frames, fullscreen retention and stale releases', async () => {
    const settings = Vue.ref({ momentsEnableVideoPreview: true, momentsEnableLivePreview: true, momentsEnableVideoControls: true, momentsEnableVideoPreviewSwipeSeek: false, momentsOnlyCoverVideoPreview: true, momentsVideoPreviewDelayed: false })
    const hlsPlayers = []
    const flvPlayers = []
    const requests = []
    const pageRequests = []
    let url = 'https://example.com/preview.mp4'
    class Hls {
      static isSupported() { return true }
      static Events = { MANIFEST_PARSED: 'manifest', ERROR: 'error' }
      handlers = new Map()
      constructor() { hlsPlayers.push(this) }
      on(name, handler) { this.handlers.set(name, handler) }
      loadSource() {}
      attachMedia() {}
      destroy() { this.destroyed = true }
    }
    const module = await loadSourceModule('../src/contentScripts/views/Moments/useMomentPreviews.ts', {
      'vue': Vue,
      '~/constants/mediaPreview': await import('../src/constants/mediaPreview'),
      '~/logic': { settings },
      '~/utils/api': { default: { video: {
        getVideoPreview: async (request) => {
          requests.push(request)
          return { code: 0, data: { durl: [{ url }] } }
        },
        getVideoPageList: async (request) => {
          pageRequests.push(request)
          return { code: 0, data: [{ page: 1, cid: 111 }, { page: 2, cid: 222 }] }
        },
      } } },
      '~/utils/hls': { loadHlsModule: async () => ({ default: Hls }) },
      '~/utils/flv': { loadFlvModule: async () => ({ default: {
        isSupported: () => true,
        Events: { ERROR: 'error', LOADING_COMPLETE: 'complete' },
        createPlayer(options) {
          const player = {
            options,
            handlers: new Map(),
            on(name, handler) { this.handlers.set(name, handler) },
            attachMediaElement() {},
            load() {},
            pause() {},
            unload() {},
            detachMediaElement() {},
            destroy() { this.destroyed = true },
          }
          flvPlayers.push(player)
          return player
        },
      } }) },
      '~/utils/mediaResources': await import('../src/utils/mediaResources'),
      '~/utils/momentUrl': await import('../src/utils/momentUrl'),
      '~/utils/previewMediaSession': await import('../src/utils/previewMediaSession'),
    })
    const gesture = await loadSourceModule('../src/composables/useVideoPreviewSwipeSeek.ts', { vue: Vue }, { performance })
    const Preview = await compileComponent('../src/components/MomentCard/MomentVideoPreview.vue', {
      'vue': Vue,
      '~/logic': { settings },
      '~/composables/useVideoPreviewSwipeSeek': gesture,
      '~/components/SkeletonBlock.vue': { default: await compileComponent('../src/components/SkeletonBlock.vue') },
    })
    const media = window.HTMLMediaElement.prototype
    const originals = Object.fromEntries(['load', 'play', 'pause'].map(name => [name, media[name]]))
    media.load = () => {}
    media.pause = () => {}
    media.play = async () => {}
    const ready = new WeakMap()
    const fullscreen = new WeakSet()
    let previews
    let activations = 0
    const holds = []
    const moment = Vue.ref({ id: 'outer', isForward: true, bvid: 'WRONG_OUTER', forward: { video: { bvid: 'BVrealvideo', cid: 123 } } })
    const host = document.body.appendChild(document.createElement('div'))
    const app = Vue.createApp({ setup() {
      previews = module.useMomentPreviews(() => 1)
      return () => previews.hoveredMediaId.value
        ? Vue.h(Preview, {
            key: moment.value.id,
            url: previews.previewUrls[moment.value.id] ?? '',
            loading: previews.previewState.value !== 'ready',
            generation: previews.previewGeneration.value,
            onVideo: (element) => {
              if (element) {
                Object.defineProperty(element, 'readyState', { get: () => ready.get(element) ?? 0, configurable: true })
                const matches = element.matches.bind(element)
                element.matches = selector => selector === ':fullscreen' ? fullscreen.has(element) : matches(selector)
              }
              previews.bindPreviewVideo(element, moment.value)
            },
            onActivate: () => activations++,
            onInteractionChange: held => holds.push(held),
            onLeave: () => previews.handleMediaLeave(moment.value),
          })
        : null
    } })
    app.mount(host)
    try {
      await previews.handleMediaEnter(moment.value, new MouseEvent('mouseenter', { buttons: 1 }))
      assert.equal(requests.length, 0, 'dragging text or links cannot start a preview')
      settings.value.momentsVideoPreviewDelayed = true
      await flush()
      await previews.handleMediaEnter(moment.value)
      assert.equal(previews.previewState.value, 'waiting')
      await previews.handleMediaEnter(moment.value, new MouseEvent('mouseenter', { buttons: 1 }))
      assert.equal(previews.previewState.value, 'idle', 'dragging cancels an existing delayed preview')
      settings.value.momentsVideoPreviewDelayed = false
      await flush()
      await previews.handleMediaEnter(moment.value)
      await flush()
      assert.deepEqual({ ...requests[0] }, { bvid: 'BVrealvideo', cid: 123 })
      assert.equal(pageRequests.length, 0, 'an explicit native cid is used directly')
      let video = host.querySelector('video')
      assert.ok(video)
      assert.equal(previews.previewState.value, 'loading')
      assert.ok(host.querySelector('[data-bew-skeleton]'))
      video.dispatchEvent(new Event('canplay'))
      assert.equal(previews.previewState.value, 'loading')
      ready.set(video, 2)
      video.dispatchEvent(new Event('loadeddata'))
      await flush()
      assert.equal(previews.previewState.value, 'ready')
      assert.equal(host.querySelector('[data-bew-skeleton]'), null)
      const controlClick = new MouseEvent('click', { bubbles: true, cancelable: true })
      video.dispatchEvent(controlClick)
      assert.equal(activations, 0)
      assert.equal(controlClick.defaultPrevented, false, 'native media control defaults are preserved')
      const oldVideo = video
      moment.value = { ...moment.value, id: 'hls' }
      url = 'https://example.com/preview.m3u8'
      await previews.handleMediaEnter(moment.value)
      await flush()
      assert.equal(hlsPlayers.length, 1)
      video = host.querySelector('video')
      hlsPlayers[0].handlers.get('manifest')()
      oldVideo.dispatchEvent(new Event('loadeddata'))
      assert.equal(previews.previewState.value, 'loading')
      ready.set(video, 2)
      video.dispatchEvent(new Event('loadeddata'))
      await flush()
      assert.equal(previews.previewState.value, 'ready')
      moment.value = { ...moment.value, id: 'flv' }
      url = 'https://example.com/preview.flv'
      await previews.handleMediaEnter(moment.value)
      await flush()
      assert.equal(hlsPlayers[0].destroyed, true)
      assert.equal(flvPlayers.length, 1)
      assert.equal(flvPlayers[0].options.isLive, false)
      flvPlayers[0].handlers.get('complete')?.()
      assert.equal(previews.previewState.value, 'loading')
      video = host.querySelector('video')
      previews.bindPreviewVideo(video, moment.value)
      assert.equal(flvPlayers.length, 1, 'the same ref does not rebuild its transport')
      ready.set(video, 2)
      video.dispatchEvent(new Event('loadeddata'))
      await flush()
      fullscreen.add(video)
      document.dispatchEvent(new Event('fullscreenchange'))
      previews.handleMediaLeave(moment.value)
      previews.release(moment.value.id)
      assert.equal(previews.hoveredMediaId.value, 'flv')
      assert.equal(flvPlayers[0].destroyed, undefined)
      assert.equal(holds.at(-1), true)
      fullscreen.delete(video)
      document.dispatchEvent(new Event('fullscreenchange'))
      await flush()
      assert.equal(previews.hoveredMediaId.value, '')
      assert.equal(flvPlayers[0].destroyed, true)
      url = 'https://example.com/part.mp4'
      moment.value = { id: 'multipart', isVideo: true, bvid: 'BVmultipart', videoUrl: 'https://www.bilibili.com/video/BVmultipart/?p=2' }
      await previews.handleMediaEnter(moment.value)
      await flush()
      assert.deepEqual({ ...requests.at(-1) }, { bvid: 'BVmultipart', cid: 222 })
      moment.value = { ...moment.value, videoUrl: 'https://www.bilibili.com/video/BVmultipart/?p=1' }
      await previews.handleMediaEnter(moment.value)
      await flush()
      assert.deepEqual({ ...requests.at(-1) }, { bvid: 'BVmultipart', cid: 111 }, 'different parts cannot share the first cached cid')
      host.querySelector('video').dispatchEvent(new Event('error'))
      await flush()
      assert.equal(previews.hoveredMediaId.value, '', 'a later MP4 error restores the cover instead of keeping an endless skeleton')
    }
    finally {
      app.unmount()
      host.remove()
      Object.assign(media, originals)
    }
  })

  check('moment window: equal ranges and repeated refs reuse work; pinned gaps retain only interacting cards', async () => {
    const time = clock()
    const observations = []
    const observers = []
    class Observer {
      constructor(callback) {
        this.callback = callback
        observers.push(this)
      }

      observe(element) { observations.push(element) }
      unobserve() {}
      disconnect() { this.disconnected = true }
    }
    const rect = (top, width, height) => ({ left: 0, right: width, top, bottom: top + height, width, height })
    const viewport = document.body.appendChild(document.createElement('div'))
    Object.defineProperties(viewport, { clientHeight: { value: 700 }, scrollHeight: { value: 200000 } })
    viewport.getBoundingClientRect = () => rect(0, 1100, 700)
    const settings = Vue.ref({ momentsGridColumns: '2', fontFamily: '', momentsSidebarShowUserCard: false, momentsSidebarShowPublish: false, momentsSidebarShowLive: false })
    const module = await loadSourceModule('../src/contentScripts/views/Moments/useMomentLayout.ts', {
      'vue': Vue,
      '~/components/MomentCard/utils': await import('../src/components/MomentCard/utils'),
      '~/composables/useAppProvider': { useBewlyApp: () => ({ scrollViewportRef: Vue.ref(viewport) }) },
      '~/logic': { settings },
      '~/logic/layoutEdit': { useLayoutEditSettingValue: (_key, getter) => Vue.computed(getter) },
      '~/utils/momentCardLayout': await import('../src/utils/momentCardLayout'),
      '~/utils/momentColumnIndex': await import('../src/utils/momentColumnIndex'),
      '~/utils/momentsLayout': await import('../src/utils/momentsLayout'),
    }, { ...time, window: { innerWidth: 1100, innerHeight: 700, requestAnimationFrame: time.requestAnimationFrame }, ResizeObserver: Observer, IntersectionObserver: Observer })
    const items = Vue.ref(Array.from({ length: 3000 }, (_, index) => ({ id: String(index), text: 'post', images: [], title: '', isVideo: false, isForward: false })))
    const heights = new Map()
    const binders = new Map()
    let layout
    function bind(moment) {
      if (!binders.has(moment.id)) {
        binders.set(moment.id, (el) => {
          if (el)
            el.getBoundingClientRect = () => rect(0, 540, heights.get(moment.id) ?? 180)
          layout.bindCardEl(el, moment)
        })
      }
      return binders.get(moment.id)
    }
    const app = Vue.createApp({ setup() {
      layout = module.useMomentLayout(items, { onNearBottom() {}, onRecycle() {}, onViewportChange() {} })
      return () => Vue.h('div', { ref: (el) => {
        if (el) {
          Object.defineProperty(el, 'clientWidth', { value: 1100, configurable: true })
          el.getBoundingClientRect = () => rect(-viewport.scrollTop, 1100, 100000)
        }
        layout.gridRef.value = el
        layout.layoutRef.value = el
        layout.momentsContentRef.value = el
      } }, layout.virtualColumns.value.map((column, index) => Vue.h('section', { key: index }, column.items.map(moment => Vue.h('article', { key: moment.id, ref: bind(moment), 'data-id': moment.id }, moment.text)))))
    } })
    app.mount(viewport)
    await flush()
    layout.append(items.value, true)
    await flush()
    for (let frame = 0; frame < 4; frame++) {
      layout.updateVirtualColumns()
      time.frame()
      await flush()
    }
    try {
      const stable = layout.virtualColumns.value
      const card = viewport.querySelector('article')
      const item = stable.flatMap(column => column.items).find(item => item.id === card.dataset.id)
      const before = observations.filter(element => element === card).length
      for (let count = 0; count < 100; count++) {
        layout.updateVirtualColumns()
        layout.bindCardEl(card, item)
      }
      assert.equal(layout.virtualColumns.value, stable)
      assert.equal(observations.filter(element => element === card).length, before)
      const replacement = { ...Vue.toRaw(item), text: 'replacement with the same id' }
      layout.updateMoment(replacement)
      await flush()
      assert.notEqual(layout.virtualColumns.value, stable)
      assert.match(card.textContent, /replacement/)
      layout.setInteractionHeld(item.id, true)
      viewport.scrollTop = 20000
      layout.updateVirtualColumns()
      await flush()
      assert.equal(viewport.querySelector(`[data-id="${item.id}"]`), card, 'the same mounted card survives scrolling away')
      assert.ok(layout.virtualColumns.value.some(column => column.gaps?.some(value => value > 10000)))
      assert.ok(viewport.querySelectorAll('article').length < 100, 'retention does not mount the intervening history')
      const beforeResize = layout.virtualColumns.value
      heights.set(item.id, 500)
      observers[1].callback([{ target: card, contentRect: { height: 500 } }])
      time.frame()
      await flush()
      assert.notEqual(layout.virtualColumns.value, beforeResize)
      layout.setInteractionHeld(item.id, false)
      time.frame()
      await flush()
      assert.equal(viewport.querySelector(`[data-id="${item.id}"]`), null)
      console.log(`PERF moments fixture: 3000 posts; 100 equivalent windows = 0 assignments; 100 duplicate refs = 0 observer registrations; mounted ${viewport.querySelectorAll('article').length}`)
    }
    finally {
      app.unmount()
      viewport.remove()
      assert.equal(time.frames.size, 0)
      assert.equal(time.timers.size, 0)
      assert.ok(observers.every(observer => observer.disconnected))
    }
  })

  check('shared preview gesture: vertical intent/native controls remain free; stale seeks and click navigation are cancelled', async () => {
    const time = clock()
    const module = await loadSourceModule('../src/composables/useVideoPreviewSwipeSeek.ts', { vue: Vue }, time)
    const video = document.createElement('video')
    Object.defineProperties(video, { duration: { value: 100 }, readyState: { value: 2 } })
    video.currentTime = 50
    video.src = 'https://example.com/preview.mp4'
    const surface = document.createElement('span')
    surface.getBoundingClientRect = () => ({ width: 300, top: 0, bottom: 200 })
    let capture = false
    surface.setPointerCapture = () => {
      capture = true
    }
    surface.hasPointerCapture = () => capture
    surface.releasePointerCapture = () => {
      capture = false
    }
    const source = Vue.ref('one')
    const controls = Vue.ref(false)
    const scope = Vue.effectScope()
    const gesture = scope.run(() => module.useVideoPreviewSwipeSeek(Vue.ref(video), Vue.ref(true), controls, source))
    const event = (x, y) => ({
      currentTarget: surface,
      pointerId: 1,
      button: 0,
      clientX: x,
      clientY: y,
      defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true },
      stopPropagation() {},
    })
    gesture.handlePreviewPointerDown(event(100, 50))
    gesture.handlePreviewPointerMove(event(110, 50))
    assert.equal(capture, false)
    assert.equal(video.currentTime, 50)
    gesture.handlePreviewPointerMove(event(100, 90))
    gesture.handlePreviewPointerMove(event(170, 90))
    assert.equal(gesture.isScrubbing.value, false)
    controls.value = true
    gesture.handlePreviewPointerDown(event(100, 185))
    gesture.handlePreviewPointerMove(event(200, 185))
    assert.equal(gesture.isScrubbing.value, false)
    controls.value = false
    gesture.handlePreviewPointerDown(event(100, 50))
    gesture.handlePreviewPointerMove(event(170, 50))
    assert.equal(capture, true)
    assert.equal(video.currentTime, 57)
    gesture.handlePreviewPointerMove(event(200, 50))
    assert.equal(time.timers.size, 1)
    source.value = 'two'
    assert.equal(capture, false)
    assert.equal(time.timers.size, 0)
    time.frame()
    assert.equal(video.currentTime, 57)
    const cancelledClick = event(200, 50)
    gesture.handlePreviewClick(cancelledClick)
    assert.equal(cancelledClick.defaultPrevented, true, 'changing source mid-drag cannot turn its pointerup into navigation')
    gesture.handlePreviewPointerDown(event(100, 50))
    gesture.handlePreviewPointerMove(event(140, 50))
    gesture.finishPreviewScrub(event(140, 50))
    const click = event(140, 50)
    gesture.handlePreviewClick(click)
    assert.equal(click.defaultPrevented, true)
    scope.stop()
    gesture.handlePreviewPointerDown(event(100, 50))
    gesture.handlePreviewPointerMove(event(200, 50))
    assert.equal(gesture.isScrubbing.value, false)
    assert.equal(time.timers.size, 0)
  })

  check('forward adapter: re-poster, quoted author and actual video uploader stay separate across nested forwards', async () => {
    const { createMomentAdapter } = await import('../src/contentScripts/views/Moments/momentAdapter')
    const adapter = createMomentAdapter(key => key, (_id, count) => Number(count) || 0)
    const author = mid => ({ mid, name: `author-${mid}`, face: `https://example.com/${mid}.png` })
    const video = { id_str: '30', type: 'DYNAMIC_TYPE_AV', modules: { module_author: author(3), module_dynamic: { major: { archive: { aid: '40', bvid: 'BVfixture', cid: 50, title: 'video', desc: 'description', duration_text: '01:00', stat: { play: '100', danmaku: '5' } } } } } }
    const quoted = { id_str: '20', type: 'DYNAMIC_TYPE_FORWARD', orig: video, modules: { module_author: author(2), module_dynamic: { desc: { text: 'quoted post' } } } }
    const raw = { id_str: '10', type: 'DYNAMIC_TYPE_FORWARD', orig: quoted, modules: { module_author: author(1), module_dynamic: { desc: { text: 'outer post' } } } }
    const result = adapter.mapMoment(raw)
    assert.equal(result.author.mid, '1')
    assert.equal(result.forward.authorMid, '2')
    assert.equal(result.forward.video.author.mid, '3')
    assert.equal(result.forward.video.bvid, 'BVfixture')
    assert.equal(result.forward.video.cid, 50)
    assert.equal(result.forward.video.desc, 'description')
    assert.equal(result.isVideo, false)
    quoted.orig = quoted
    assert.equal(adapter.mapMoment(raw).forward.video, undefined, 'invalid cycles cannot manufacture a video identity')
  })
}
