import assert from 'node:assert/strict'

import { loadSourceModule } from './sourceModuleHarness'

export function registerPlayerMaintenanceChecks(check, { Vue, flush }) {
  check('playback layout: stalled readiness stops idle polling, ignores clock churn and wakes for late media without losing cleanup', async () => {
    let now = 0
    let nextId = 0
    let probes = 0
    let mediaReady = false
    let rootReads = 0
    const jobs = new Map()
    const frames = new Map()
    const observers = []
    const root = document.body.appendChild(document.createElement('div'))
    root.id = 'playerWrap'
    const video = root.appendChild(document.createElement('video'))
    const clockNode = root.appendChild(document.createElement('span'))
    const session = { current: null, entering: false }
    const emptyImports = Object.fromEntries(['actionEffects', 'danmaku', 'description', 'geometry', 'idleProgress', 'interactions', 'labels', 'nativeControls', 'playlist', 'shell', 'sidebar', 'styles/layout', 'videoInfo'].map(name => [`~/utils/bewlyWidescreen/${name}`, {}]))
    const constants = await import('../src/utils/bewlyWidescreen/constants')
    const module = await loadSourceModule('../src/utils/bewlyWidescreen.ts', {
      ...emptyImports,
      'vue': Vue,
      '~/constants/globalEvents': await import('../src/constants/globalEvents'),
      '~/logic': { settings: Vue.ref({ language: 'en' }) },
      '~/utils/bewlyWidescreen/constants': constants,
      '~/utils/bewlyWidescreen/loading': { createWidescreenLoading: () => ({ show() {}, reset() {} }) },
      '~/utils/bewlyWidescreen/nativeDom': {
        leaveMutuallyExclusivePlayerModes() {},
        restoreCommentPrewarm() {},
        startCommentPrewarm() {},
        isReadyForLayout() {
          probes++
          return mediaReady
        },
        isWidescreenTransferContentReady: () => true,
      },
      '~/utils/bewlyWidescreen/session': { session },
      '~/utils/bewlyWidescreenPolicy': await import('../src/utils/bewlyWidescreenPolicy'),
      '~/utils/interfaceLanguage': {},
      '~/utils/pageBridgeChannel': {},
      '~/utils/playerMedia': { getPlayerRoot: () => ++rootReads === 1 ? root : null },
      '~/utils/verticalVideoZoom': {},
      '~/utils/videoMetadataBridge': {},
    }, {
      Date: { now: () => now },
      setTimeout: (callback, delay) => {
        jobs.set(++nextId, { callback, at: now + delay })
        return nextId
      },
      clearTimeout: id => jobs.delete(id),
      requestAnimationFrame: (callback) => {
        frames.set(++nextId, callback)
        return nextId
      },
      cancelAnimationFrame: id => frames.delete(id),
      MutationObserver: class {
        constructor(callback) {
          this.callback = callback
          observers.push(this)
        }

        observe() {}
        disconnect() { this.disconnected = true }
      },
    })
    const frame = () => {
      const pending = [...frames.values()]
      frames.clear()
      pending.forEach(callback => callback())
    }
    const advance = (end) => {
      for (let i = 0; i < 1000; i++) {
        frame()
        const next = [...jobs].sort((a, b) => a[1].at - b[1].at)[0]
        if (!next || next[1].at > end)
          break
        now = next[1].at
        jobs.delete(next[0])
        next[1].callback()
      }
      now = end
      frame()
    }
    try {
      module.applyBewlyWidescreen('right', false, { shouldApply: () => true, cancel() {} })
      advance(60_000)
      assert.equal(probes, 51)
      assert.equal(jobs.size, 0)
      assert.equal(frames.size, 0)
      for (let count = 0; count < 100; count++)
        observers[0].callback([{ target: clockNode, addedNodes: [document.createTextNode(String(count))], removedNodes: [] }])
      advance(120_000)
      assert.equal(probes, 51, 'another idle minute and 100 timer-label mutations do not scan the layout')
      mediaReady = true
      video.dispatchEvent(new Event('loadeddata'))
      advance(120_300)
      assert.equal(rootReads, 2, 'late media starts and settles a real layout commit attempt even after the polling window')
      assert.equal(jobs.size, 0, 'a disappeared root returns to the event-driven wait')
      module.exitBewlyWidescreen()
      video.dispatchEvent(new Event('loadeddata'))
      assert.equal(frames.size, 0)
      assert.ok(observers.every(observer => observer.disconnected))
      console.log('PERF playback layout fixture: 51 readiness checks / 60s stall; 0 extra checks / next 60s + 100 clock mutations')
    }
    finally {
      module.exitBewlyWidescreen()
      root.remove()
      assert.equal(jobs.size, 0)
      assert.equal(frames.size, 0)
    }
  })

  check('playback boot: native media errors and retry removal use the shared player observer without accepting blank or hidden panels', async () => {
    const media = await loadSourceModule('../src/utils/playerMedia.ts', { './videoMetadataBridge': { isNativeVideoComponentReady: () => true } })
    const lifecycle = await loadSourceModule('../src/contentScripts/playerDomLifecycle.ts', { '~/utils/playerMedia': media }, { MutationObserver: window.MutationObserver })
    const root = document.body.appendChild(document.createElement('div'))
    root.id = 'playerWrap'
    root.innerHTML = '<div class="bpx-player-container"><div class="bpx-player-video-wrap"><video></video></div></div>'
    const panel = document.createElement('div')
    panel.className = 'bpx-player-error-sign'
    panel.innerHTML = '<div class="bpx-player-error-sign-code"></div>'
    let width = 120
    panel.getBoundingClientRect = () => new window.DOMRect(0, 0, width, 60)
    const seen = []
    const stop = lifecycle.observePlayerDom(() => seen.push(media.hasNativePlayerError()))
    try {
      root.firstElementChild.append(panel)
      await flush()
      assert.equal(media.hasNativePlayerError(), false)
      panel.firstElementChild.textContent = 'Error: 4004'
      await flush()
      assert.equal(seen.at(-1), true, 'the shared observer discovers an explicit native error')
      root.style.visibility = 'hidden'
      assert.equal(media.hasNativePlayerError(), false)
      root.style.visibility = 'visible'
      panel.style.display = 'none'
      assert.equal(media.hasNativePlayerError(), false)
      panel.style.display = ''
      width = 0
      assert.equal(media.hasNativePlayerError(), false)
      width = 120
      assert.equal(media.hasNativePlayerError(), true)
      document.body.append(panel)
      await flush()
      assert.equal(seen.at(-1), false, 'native retry/removal clears the failure; an unrelated panel cannot keep the player blocked')
    }
    finally {
      stop()
      panel.remove()
      root.remove()
    }
  })

  check('maintenance 06 integration: actual screenshot consumer discovers late native controls and shares fitting through route/settings changes', async () => {
    const frames = new Map()
    let frameId = 0
    let resizeOwners = 0
    const clock = {
      requestAnimationFrame: (callback) => {
        frames.set(++frameId, callback)
        return frameId
      },
      cancelAnimationFrame: id => frames.delete(id),
      MutationObserver: window.MutationObserver,
    }
    const media = await loadSourceModule('../src/utils/playerMedia.ts', { './videoMetadataBridge': { isNativeVideoComponentReady: () => true } })
    const lifecycle = await loadSourceModule('../src/contentScripts/playerDomLifecycle.ts', { '~/utils/playerMedia': media }, clock)
    const fitting = await loadSourceModule('../src/contentScripts/playerControlFit.ts', { '~/utils/playerMedia': media, './playerDomLifecycle': lifecycle }, {
      ...clock,
      ResizeObserver: class {
        constructor() { resizeOwners++ }
        observe() {}
        unobserve() {}
        disconnect() { resizeOwners-- }
      },
    })
    const settings = Vue.ref({ showVideoScreenshotButton: true, videoScreenshotShortcut: 'Shift+S', language: 'en' })
    const route = Vue.reactive({ href: 'https://www.bilibili.com/video/BV1fYes6xEmq/', navigationId: 1 })
    const screenshot = await loadSourceModule('../src/contentScripts/videoScreenshotControl.ts', {
      'vue': Vue,
      '~/composables/useRouteState': { useRouteState: () => route },
      '~/logic': { settings },
      '~/utils/i18n': { i18n: { global: { t: () => 'Screenshot' } } },
      '~/utils/main': await import('../src/utils/main'),
      '~/utils/videoScreenshot': { videoScreenshotBusy: Vue.ref(false), captureVideoScreenshot() {}, handleVideoScreenshotShortcut() {} },
      './playerControlFit': fitting,
      './playerControlTooltip': await import('../src/contentScripts/playerControlTooltip'),
      './playerDomLifecycle': lifecycle,
    }, { location: window.location })
    const host = document.body.appendChild(document.createElement('div'))
    screenshot.initVideoScreenshotControl()
    try {
      assert.equal(host.querySelector('.bewly-video-screenshot-control'), null)
      host.innerHTML = '<div id="playerWrap"><div id="bilibiliPlayer"><video></video><div class="bpx-player-control-bottom"><div class="bpx-player-control-bottom-right"><div class="bpx-player-ctrl-volume"><div class="bpx-player-ctrl-btn-icon"></div></div></div></div></div></div>'
      await flush()
      assert.equal(host.querySelectorAll('.bewly-video-screenshot-control').length, 1)
      assert.equal(resizeOwners, 1)
      settings.value.showVideoScreenshotButton = false
      await flush()
      assert.equal(host.querySelectorAll('.bewly-video-screenshot-control').length, 0)
      assert.equal(resizeOwners, 0)
      settings.value.showVideoScreenshotButton = true
      await flush()
      assert.equal(host.querySelectorAll('.bewly-video-screenshot-control').length, 1)
      route.navigationId++
      await flush()
      assert.equal(host.querySelectorAll('.bewly-video-screenshot-control').length, 1)
      assert.equal(resizeOwners, 1)
    }
    finally {
      screenshot.stopVideoScreenshotControl()
      host.remove()
      assert.equal(resizeOwners, 0)
      assert.equal(frames.size, 0)
    }
  })

  check('maintenance 04 lifecycle: native mode reporting follows replaced controls and releases all observations', async () => {
    const media = await loadSourceModule('../src/utils/playerMedia.ts', { './videoMetadataBridge': { isNativeVideoComponentReady: () => true } })
    const lifecycle = await loadSourceModule('../src/contentScripts/playerDomLifecycle.ts', { '~/utils/playerMedia': media }, { MutationObserver: window.MutationObserver })
    const root = document.body.appendChild(document.createElement('div'))
    root.id = 'bilibili-player-wrap'
    root.innerHTML = '<div id="bilibiliPlayer" class="bpx-player-container" data-screen="wide"><video></video><button class="bpx-player-ctrl-wide"></button><button class="bpx-player-ctrl-web"></button></div>'
    const container = root.firstElementChild
    const modes = []
    const stop = lifecycle.observePlayerMode(mode => modes.push(mode))
    try {
      assert.deepEqual(modes, ['widescreen'])
      container.dataset.screen = 'web'
      await flush()
      assert.deepEqual(modes, ['widescreen', 'webFullscreen'])
      const old = root.querySelector('.bpx-player-ctrl-web')
      const replacement = old.cloneNode()
      old.replaceWith(replacement)
      await flush()
      container.dataset.screen = 'wide'
      await flush()
      assert.equal(modes.at(-1), 'widescreen', 'exiting web fullscreen restores native widescreen rather than default')
      const count = modes.length
      old.classList.add('bpx-state-entered')
      await flush()
      assert.equal(modes.length, count)
      replacement.classList.add('bpx-state-entered')
      await flush()
      assert.equal(modes.at(-1), 'webFullscreen')
      stop()
      container.dataset.screen = 'normal'
      replacement.classList.remove('bpx-state-entered')
      await flush()
      assert.equal(modes.at(-1), 'webFullscreen')
    }
    finally {
      stop()
      root.remove()
    }
  })

  check('maintenance 01: quality remembers confirmed choices, not automatic/trial changes; replacement and navigation retain ownership', async () => {
    const root = document.body.appendChild(document.createElement('div'))
    const video = root.appendChild(document.createElement('video'))
    Object.defineProperty(video, 'readyState', { value: 4 })
    const makeMenu = () => {
      const element = document.createElement('div')
      element.className = 'bpx-player-ctrl-quality'
      element.innerHTML = '<button class="bpx-player-ctrl-quality-menu-item bpx-state-active" data-value="80">1080P</button><button class="bpx-player-ctrl-quality-menu-item" data-value="64">720P</button><button class="bpx-player-ctrl-quality-menu-item disabled" data-value="120">4K</button>'
      return element
    }
    let menu = root.appendChild(makeMenu())
    const config = Vue.ref({ rememberVideoQuality: false, savedVideoQuality: null })
    const route = Vue.reactive({ href: 'https://www.bilibili.com/video/BV1NyeA6zESV/', navigationId: 0 })
    const handlers = new Map()
    const frames = new Map()
    const timers = new Map()
    let id = 0
    let observer
    let observers = 0
    let clicks = 0
    let nativeQuality
    root.addEventListener('click', () => clicks++)
    const module = await loadSourceModule('../src/contentScripts/videoQualityMemory.ts', {
      'vue': Vue,
      '~/logic': { settings: config },
      '~/composables/useRouteState': { useRouteState: () => route },
      '~/utils/playerMedia': { getPlayerRoot: () => root, getVideoElement: () => video },
      '~/utils/playbackTab': await import('../src/utils/playbackTab'),
      '~/utils/videoMetadataBridge': { isNativeVideoComponentReady: () => true, readNativePlaybackEpisodeId: () => undefined, readNativeQualityState: () => nativeQuality },
      './playerDomLifecycle': { hasPlayerMediaMutation: records => !records, observePlayerDom: (callback) => {
        observer = callback
        observers++
        callback()
        return () => observers--
      } },
    }, {
      MutationObserver: window.MutationObserver,
      document: { addEventListener: (name, callback) => handlers.set(name, callback), removeEventListener: name => handlers.delete(name) },
      requestAnimationFrame: (callback) => {
        frames.set(++id, callback)
        return id
      },
      cancelAnimationFrame: id => frames.delete(id),
      setTimeout: (callback) => {
        timers.set(++id, callback)
        return id
      },
      clearTimeout: id => timers.delete(id),
    })
    const drain = async () => {
      await Vue.nextTick()
      await flush()
      const callbacks = [...frames.values()]
      frames.clear()
      callbacks.forEach(callback => callback())
      await Vue.nextTick()
    }
    const select = (quality) => {
      menu.querySelectorAll('button').forEach(button => button.classList.toggle('bpx-state-active', button.dataset.value === String(quality)))
    }
    const stop = module.setupVideoQualityMemory()
    try {
      assert.equal(observers, 0)
      nativeQuality = { ready: true, quality: 80, actualQuality: 64 }
      config.value.rememberVideoQuality = true
      await drain()
      assert.equal(config.value.savedVideoQuality, null, 'enabling during a pending quality change waits for actual media quality')
      nativeQuality.actualQuality = 80
      handlers.get('playing')({ target: video })
      await drain()
      assert.equal(config.value.savedVideoQuality, 80)
      nativeQuality = { ready: true, quality: 80, actualQuality: 80, preview: true }
      handlers.get('click')({ isTrusted: true, target: menu.querySelector('[data-value="64"]') })
      await drain()
      assert.equal(timers.size, 0, 'confirmed native preview state cannot create a remembered user intent')
      nativeQuality = undefined
      assert.equal(clicks, 0)
      handlers.get('click')({ isTrusted: true, target: menu.querySelector('[data-value="64"]') })
      select(64)
      await drain()
      assert.equal(config.value.savedVideoQuality, 80, 'the menu alone does not prove the media accepted the choice')
      handlers.get('loadeddata')({ target: video })
      await drain()
      assert.equal(config.value.savedVideoQuality, 64)
      assert.equal(timers.size, 0)
      select(80)
      await drain()
      assert.equal(config.value.savedVideoQuality, 64)
      assert.equal(clicks, 0, 'automatic downgrade does not start a restoration loop')
      config.value.savedVideoQuality = 120
      await drain()
      assert.equal(clicks, 0, 'known unavailable quality is never clicked')
      config.value.savedVideoQuality = 64
      await drain()
      assert.equal(clicks, 1)
      const replacement = makeMenu()
      menu.replaceWith(replacement)
      menu = replacement
      observer([{ addedNodes: [replacement], removedNodes: [] }])
      await drain()
      assert.equal(clicks, 1, 'rebuilding the menu cannot reset permission-prompt suppression')
      root.dataset.trial = 'true'
      handlers.get('click')({ isTrusted: true, target: menu.querySelector('[data-value="80"]') })
      handlers.get('playing')({ target: video })
      await drain()
      assert.equal(config.value.savedVideoQuality, 64)
      root.removeAttribute('data-trial')
      route.href = 'https://www.bilibili.com/video/BV14ReF6NEWN/?p=2'
      route.navigationId++
      await drain()
      assert.equal(clicks, 1, 'route overlap cannot restore the preference into old media')
      handlers.get('loadeddata')({ target: video })
      await drain()
      assert.equal(clicks, 2)
      handlers.get('click')({ isTrusted: true, target: menu.querySelector('[data-value="80"]') })
      stop()
      assert.equal(timers.size, 0)
      assert.equal(frames.size, 0)
      assert.equal(observers, 0)
      assert.equal(handlers.size, 0)
    }
    finally {
      stop()
      root.remove()
    }
  })

  check('maintenance 01/12 bridge: native quality, preview and folder capacity come from the current MAIN owner', async () => {
    const previousUrl = window.location.href
    window.history.replaceState(null, '', '/video/BV1NyeA6zESV/')
    const app = document.body.appendChild(document.createElement('div'))
    app.id = 'app'
    app.__vue__ = { videoData: { aid: 1, bvid: 'BV1NyeA6zESV', videos: 1 } }
    const video = app.appendChild(document.createElement('video'))
    const dialog = app.appendChild(document.createElement('div'))
    dialog.className = 'collection-m-exp'
    const favoriteOwner = { $el: dialog, _isMounted: true, aid: 1, list: [{ id: 42, favoured: true, media_count: 2500, max_count: 5000 }] }
    dialog.__vue__ = favoriteOwner
    let manifest = { aid: 1, bvid: 'BV1NyeA6zESV', p: 1, cid: 10 }
    let realQuality = 80
    let fullDuration = 200
    const oldPlayer = window.player
    window.player = { mediaElement: () => video, getManifest: () => manifest, getQuality: () => ({ nowQ: 64, realQ: realQuality }), getDuration: full => full ? fullDuration : 200 }
    const bridge = await loadSourceModule('../src/utils/videoMetadataBridge.ts', { './pageBridgeChannel': { getPageBridgeChannelId: () => 'fixture-channel' } }, { CustomEvent: window.CustomEvent, location: window.location })
    const main = await loadSourceModule('../src/inject/videoMetadata.ts', {
      '~/inject/movedPgcReact': { createMovedPgcReactBridge: () => ({ dispose() {} }) },
      '~/utils/bewlyWidescreen/constants': await import('../src/utils/bewlyWidescreen/constants'),
      '~/utils/videoMetadataBridge': bridge,
    }, { CustomEvent: window.CustomEvent, location: window.location })
    const stop = main.setupVideoMetadataBridge('fixture-channel')
    try {
      assert.equal(bridge.readNativeQualityState(video).actualQuality, 80)
      realQuality = 64
      assert.equal(bridge.readNativeQualityState(video).quality, 64)
      assert.equal(bridge.readNativeQualityState(video).actualQuality, 64)
      fullDuration = 400
      assert.equal(bridge.readNativeQualityState(video).preview, true)
      const folders = bridge.readNativeFavoriteDialog(dialog)
      assert.equal(folders.folders[0].capacity, 5000, 'the native hard-coded label threshold is not used')
      assert.equal(folders.folders[0].original, true)
      favoriteOwner.aid = 2
      assert.equal(bridge.readNativeFavoriteDialog(dialog), undefined)
      favoriteOwner.aid = 1
      favoriteOwner._isDestroyed = true
      assert.equal(bridge.readNativeFavoriteDialog(dialog), undefined)
      manifest = { ...manifest, p: 2 }
      assert.equal(bridge.readNativeQualityState(video).ready, false, 'a prior part cannot confirm the new selection')
    }
    finally {
      stop()
      window.player = oldPlayer
      app.remove()
      window.history.replaceState(null, '', previousUrl)
    }
  })

  check('maintenance 02: collection wrappers do not imply multipart, verified manuscript metadata wins', async () => {
    let metadata = null
    const root = document.body.appendChild(document.createElement('div'))
    const player = await loadSourceModule('../src/utils/player.ts', {
      'vue': Vue,
      '~/contentScripts/playerDomLifecycle': { observePlayerDom: () => () => {} },
      '~/logic': { settings: { value: {} } },
      '~/utils/playbackRate': {},
      '~/logic/iframePageState': { useIframePlaybackContext: () => Vue.ref() },
      '~/utils/videoMetadataBridge': { readVideoPageMetadata: () => metadata },
      '~/utils/bewlyWidescreen/constants': await import('../src/utils/bewlyWidescreen/constants'),
      './playerMedia': {},
    }, { location: new URL('https://www.bilibili.com/video/BV1NyeA6zESV/') })
    try {
      root.innerHTML = '<div class="video-pod"><div class="video-pod__list"><div class="video-pod__item"><div class="simple-base-item"></div></div></div></div>'
      assert.equal(player.detectVideoType(), player.VideoType.COLLECTION)
      root.insertAdjacentHTML('beforeend', '<div class="view-mode"></div>')
      assert.equal(player.detectVideoType(), player.VideoType.COLLECTION)
      root.insertAdjacentHTML('beforeend', '<div class="multi-page"><ul class="cur-list"><li></li></ul></div>')
      assert.equal(player.detectVideoType(), player.VideoType.MULTIPART)
      metadata = { pageCount: 1, isCollection: true }
      assert.equal(player.detectVideoType(), player.VideoType.COLLECTION)
      metadata = { pageCount: 2, isCollection: true }
      assert.equal(player.detectVideoType(), player.VideoType.MULTIPART)
    }
    finally {
      player.cancelPlayerRetryTasks()
      root.remove()
    }
  })

  check('maintenance 03: comment navigation ignores empty/inactive roots, waits for MAIN identity and aborts old reads and retries', async () => {
    const constants = await import('../src/utils/bewlyWidescreen/constants')
    const nativeDom = await loadSourceModule('../src/utils/bewlyWidescreen/nativeDom.ts', {
      '~/utils/bewlyWidescreen/constants': constants,
      '~/utils/commentDomTransfer': await import('../src/utils/commentDomTransfer'),
      '~/utils/player': {},
      '~/utils/playerMedia': {},
      '~/utils/videoMetadataBridge': {},
    })
    const timers = new Map()
    let timerId = 0
    const abort = await loadSourceModule('../src/utils/abort.ts', {}, {
      setTimeout: (callback) => {
        timers.set(++timerId, callback)
        return timerId
      },
      clearTimeout: id => timers.delete(id),
    })
    const host = document.body.appendChild(document.createElement('div'))
    const addComments = (parent, aid) => {
      const root = parent.appendChild(document.createElement('div'))
      root.className = 'comment-container'
      const element = root.appendChild(document.createElement('bili-comments'))
      element.setAttribute('data-params', `1,${aid},0`)
      element.attachShadow({ mode: 'open' }).innerHTML = '<div id="header"></div><div id="feed"></div>'
      return root
    }
    const empty = host.appendChild(document.createElement('div'))
    empty.id = 'commentapp'
    const wide = host.appendChild(document.createElement('div'))
    wide.id = constants.ROOT_ID
    const oldWide = addComments(wide, 1)
    const original = addComments(host, 1)
    const hidden = addComments(host, 1)
    hidden.hidden = true
    let key = 'B'
    let metadata = { aid: 2 }
    const requests = []
    const module = await loadSourceModule('../src/utils/videoCommentNavigation.ts', {
      '~/utils/abort': abort,
      '~/utils/api': { default: { video: { getVideoInfo: (identifier, options) => new Promise(resolve => requests.push({ identifier, options, resolve })) } } },
      '~/utils/bewlyWidescreen/nativeDom': nativeDom,
      '~/utils/playbackTab': await import('../src/utils/playbackTab'),
      '~/utils/videoMetadataBridge': { readVideoPageMetadata: () => metadata },
    })
    const owner = module.createVideoCommentNavigation(() => key, () => false)
    try {
      const read = owner.start('B', 'https://www.bilibili.com/video/BV14ReF6NEWN/')
      requests[0].resolve({ code: 0, data: { aid: 2, bvid: 'BV14ReF6NEWN' } })
      await read
      await flush()
      assert.equal(original.firstElementChild.getAttribute('data-params'), '1,2,0')
      assert.equal(oldWide.firstElementChild.getAttribute('data-params'), '1,1,0')
      assert.equal(hidden.firstElementChild.getAttribute('data-params'), '1,1,0')
      assert.equal(empty.children.length, 0)
      assert.equal(owner.start('B', 'https://www.bilibili.com/video/BV14ReF6NEWN/'), read)
      const current = original.firstElementChild
      current.attachShadow({ mode: 'open' }).innerHTML = '<div id="header"></div><div id="feed"></div>'
      key = 'C'
      const pending = owner.start('C', 'https://www.bilibili.com/video/BV1NyeA6zESV/')
      requests[1].resolve({ code: 0, data: { aid: 3, bvid: 'BV1NyeA6zESV' } })
      await pending
      await flush()
      assert.equal(timers.size, 1)
      assert.equal(original.firstElementChild, current, 'URL/API identity alone cannot replace a tree still owned by the previous manuscript')
      owner.cancelIfChanged('C')
      assert.equal(requests[1].options.signal.aborted, false, 'removing tracking parameters must not cancel the same manuscript repair')
      assert.equal(timers.size, 1)
      owner.cancelIfChanged('D')
      assert.equal(requests[1].options.signal.aborted, true)
      assert.equal(timers.size, 0)
      owner.cancel()
      assert.equal(requests[1].options.signal.aborted, true)
      assert.equal(timers.size, 0)
      key = 'D'
      const late = owner.start('D', 'https://www.bilibili.com/video/av4/')
      key = 'E'
      owner.cancel()
      metadata = { aid: 5 }
      requests[2].resolve({ code: 0, data: { aid: 4 } })
      await late
      await flush()
      assert.equal(original.firstElementChild, current)
      assert.equal(timers.size, 0)
    }
    finally {
      owner.cancel()
      host.remove()
    }
  })

  check('maintenance 05: actual widescreen geometry retains ultrawide, 16:9, 4:3 and portrait source ratios', async () => {
    const root = document.body.appendChild(document.createElement('div'))
    const frame = root.appendChild(document.createElement('div'))
    const sidebar = root.appendChild(document.createElement('div'))
    const player = document.body.appendChild(document.createElement('div'))
    const video = player.appendChild(document.createElement('video'))
    let width = 2560
    let height = 1080
    Object.defineProperties(video, { videoWidth: { get: () => width }, videoHeight: { get: () => height } })
    const rect = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height })
    root.getBoundingClientRect = () => rect(0, 0, 1440, 900)
    frame.getBoundingClientRect = () => rect(0, 0, 700, 800)
    sidebar.getBoundingClientRect = () => rect(720, 0, 720, 900)
    const state = { root, playerEl: player, playerFrame: frame, playerSlot: frame, sidebarEl: sidebar, sidebarPosition: 'right', sidebarLayout: 'expanded' }
    const session = { current: state }
    const module = await loadSourceModule('../src/utils/bewlyWidescreen/geometry.ts', {
      '~/logic': { settings: { value: { alwaysUseDock: true, bewlyWidescreenCenterVideo: false } } },
      '~/utils/bewlyWidescreen/actionEffects': { scheduleActionGeometrySync() {} },
      '~/utils/bewlyWidescreen/constants': await import('../src/utils/bewlyWidescreen/constants'),
      '~/utils/bewlyWidescreen/description': {},
      '~/utils/bewlyWidescreen/nativeControls': { syncNativePlayerControlVisibility() {} },
      '~/utils/bewlyWidescreen/nativeDom': { exitNativeMiniPlayer() {} },
      '~/utils/bewlyWidescreen/session': { session },
      '~/utils/bewlyWidescreenPolicy': await import('../src/utils/bewlyWidescreenPolicy'),
      '~/utils/player': { getVideoElement: () => video, isPlayerShowingEndingRecommendation: () => false },
      '~/utils/playerMedia': { getPlayerRoot: () => player },
    }, { requestAnimationFrame: () => 1, cancelAnimationFrame() {} })
    try {
      for (const pair of [[2560, 1080], [1920, 1080], [1440, 1080], [1080, 1920]]) {
        [width, height] = pair
        module.updateAspectRatio(state)
        assert.equal(Number(root.style.getPropertyValue('--bewly-widescreen-layout-aspect')), width / height)
        assert.equal(Number(root.style.getPropertyValue('--bewly-widescreen-aspect')), width / height)
      }
    }
    finally {
      module.clearPlayerResizeSync(state)
      module.clearAnchoredPlayerElement(player)
      module.clearAuxiliaryControlGeometry()
      root.remove()
      player.remove()
    }
  })

  check('maintenance 06: actual control space and input font scale set priorities; one observer/frame owns all alternatives', async () => {
    const root = document.body.appendChild(document.createElement('div'))
    root.innerHTML = '<div class="bpx-player-control-bottom"><div class="left"></div><div class="bpx-player-control-bottom-center"><input style="font-size:16px;padding:0;border:0"></div><div class="bpx-player-control-bottom-right"><button class="bpx-player-ctrl-volume">native</button><button class="screenshot">screenshot</button><button class="loudness">loudness</button></div></div><div class="bpx-player-contextmenu"></div>'
    const bar = root.firstElementChild
    const left = bar.querySelector('.left')
    const center = bar.querySelector('.bpx-player-control-bottom-center')
    const input = center.firstElementChild
    const native = bar.querySelector('.bpx-player-ctrl-volume')
    const screenshot = bar.querySelector('.screenshot')
    const loudness = bar.querySelector('.loudness')
    let width = 600
    let measurements = 0
    for (const [element, value] of [[bar, () => width], [left, () => 120], [center, () => 220], [input, () => 180], [native, () => 200], [screenshot, () => 40], [loudness, () => 40]]) {
      element.getBoundingClientRect = () => {
        measurements++
        return { width: value(), height: 36, left: 0, right: value(), top: 0, bottom: 36 }
      }
    }
    const observers = []
    const frames = new Map()
    let id = 0
    let subscriptions = 0
    let busy = false
    let activated = 0
    const module = await loadSourceModule('../src/contentScripts/playerControlFit.ts', {
      '~/utils/playerMedia': { getPlayerRoot: () => root },
      './playerDomLifecycle': { observePlayerDom: (callback) => {
        subscriptions++
        callback()
        return () => subscriptions--
      } },
    }, {
      ResizeObserver: class {
        targets = new Set()
        constructor(callback) {
          this.callback = callback
          observers.push(this)
        }

        observe(element) { this.targets.add(element) }
        unobserve(element) { this.targets.delete(element) }
        disconnect() { this.targets.clear() }
      },
      requestAnimationFrame: (callback) => {
        frames.set(++id, callback)
        return id
      },
      cancelAnimationFrame: id => frames.delete(id),
    })
    const camera = module.registerPlayerControlFit(screenshot, { priority: 20, label: () => 'Screenshot', activate() {} })
    const audio = module.registerPlayerControlFit(loudness, { priority: 30, label: () => 'Loudness', disabled: () => busy, activate: (trigger) => {
      assert.equal(trigger.tagName, 'BUTTON')
      activated++
    } })
    const step = () => {
      const callbacks = [...frames.values()]
      frames.clear()
      callbacks.forEach(callback => callback())
    }
    try {
      assert.equal(observers.length, 1)
      assert.equal(subscriptions, 1)
      step()
      assert.equal(screenshot.classList.contains('bewly-player-control-collapsed'), false)
      assert.equal(loudness.classList.contains('bewly-player-control-collapsed'), false)
      width = 560
      for (let i = 0; i < 30; i++) observers[0].callback()
      assert.equal(frames.size, 1)
      loudness.focus()
      step()
      assert.equal(screenshot.classList.contains('bewly-player-control-collapsed'), false)
      assert.equal(loudness.inert, true)
      assert.equal(document.activeElement, native, 'collapsing a focused injected action returns focus to a native control')
      const alternative = root.querySelector('.bewly-player-control-alternative')
      assert.equal(alternative.textContent, 'Loudness')
      alternative.click()
      assert.equal(activated, 1)
      const composing = new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, cancelable: true })
      alternative.dispatchEvent(composing)
      assert.equal(composing.defaultPrevented, true)
      busy = true
      audio.refresh()
      step()
      assert.equal(alternative.disabled, true)
      width = 600
      input.style.fontSize = '24px'
      input.focus()
      observers[0].callback()
      step()
      assert.equal(screenshot.inert, true, 'larger input text keeps usable native entry width instead of following a window breakpoint')
      assert.equal(document.activeElement, input)
      assert.equal(root.querySelectorAll('.bewly-player-control-alternative').length, 2)
      width = 720
      camera.refresh()
      step()
      assert.equal(screenshot.inert, false)
      assert.equal(loudness.inert, false)
      assert.equal(root.querySelector('.bewly-player-control-alternatives'), null)
      assert.equal(frames.size, 0)
      assert.ok(measurements > 0)
    }
    finally {
      camera.dispose()
      audio.dispose()
      root.remove()
      assert.equal(observers[0].targets.size, 0)
      assert.equal(subscriptions, 0)
      assert.equal(frames.size, 0)
    }
  })

  check('maintenance 07/08: native shaking icons keep their box; effects, borders and guides retain native semantics', async () => {
    const constants = await import('../src/utils/bewlyWidescreen/constants')
    const style = document.head.appendChild(document.createElement('style'))
    const original = document.head.appendChild(document.createElement('style'))
    original.textContent = '.native-box { box-sizing: content-box; border: 3px solid rgb(1, 2, 3); border-radius: 7px; }'
    const layout = await loadSourceModule('../src/utils/bewlyWidescreen/styles/layout.ts', {
      '~/constants/globalEvents': await import('../src/constants/globalEvents'),
      '~/styles/liquidGlass.scss?inline': { default: '' },
      '~/styles/segmentControl.scss?inline': { default: '' },
      '~/styles/skeleton.scss?inline': { default: '' },
      '~/utils/bewlyWidescreen/constants': constants,
      '~/utils/bewlyWidescreenPolicy': await import('../src/utils/bewlyWidescreenPolicy'),
      '~/utils/main': { injectCSS: (css) => {
        style.textContent = css
        return style
      } },
      '~/utils/photoViewer': await import('../src/utils/photoViewer'),
    })
    const root = document.body.appendChild(document.createElement('div'))
    root.id = constants.ROOT_ID
    root.innerHTML = '<div class="bewly-widescreen-action-slot"><div class="toolbar-left-item-wrap"><button class="video-toolbar-left-item"><i class="video-toolbar-item-icon"></i><canvas></canvas></button></div></div><div class="player-wrap"><div class="bpx-player-container"><div class="bpx-player-ending-panel native-box"></div><div class="bili-danmaku-x-guide"><span class="bili-danmaku-x-guide-three native-box"></span></div><div class="bui-switch native-box"></div><div class="bui-select native-box"></div></div></div>'
    try {
      layout.injectLayoutStyle()
      const icon = root.querySelector('i')
      for (const animation of ['', 'shake-anime', 'nativeAnimation']) {
        icon.className = `video-toolbar-item-icon ${animation}`
        assert.notEqual(getComputedStyle(icon).position, 'absolute')
        assert.equal(getComputedStyle(root.querySelector('canvas')).position, 'absolute')
      }
      root.querySelectorAll('.native-box').forEach((element) => {
        const css = getComputedStyle(element)
        assert.equal(css.boxSizing, 'content-box')
        assert.equal(css.borderTopColor, 'rgb(1, 2, 3)')
        assert.equal(css.borderBottomColor, 'rgb(1, 2, 3)')
        assert.notEqual(css.display, 'none')
      })
    }
    finally {
      root.remove()
      style.remove()
      original.remove()
    }
  })

  check('maintenance 09: optional idle progress follows media and control ownership without timers, layout reads or extra records', async () => {
    const root = document.body.appendChild(document.createElement('div'))
    const frame = root.appendChild(document.createElement('div'))
    const player = root.appendChild(document.createElement('div'))
    let video = player.appendChild(document.createElement('video'))
    let time = 50
    let paused = false
    let ended = false
    function configure(target) {
      Object.defineProperties(target, { currentTime: { get: () => time }, duration: { value: 200 }, readyState: { value: 4 }, paused: { get: () => paused }, ended: { get: () => ended } })
    }
    configure(video)
    const config = Vue.ref({ showWidescreenIdleProgress: false })
    const state = { root, playerFrame: frame, playerEl: player, navigationPending: false }
    const session = { current: state }
    const module = await loadSourceModule('../src/utils/bewlyWidescreen/idleProgress.ts', {
      'vue': Vue,
      '~/logic': { settings: config },
      '~/utils/bewlyWidescreen/session': { session },
      '~/utils/playerMedia': { getVideoElement: () => video },
      '~/utils/playbackProgress': await import('../src/utils/playbackProgress'),
    }, { setTimeout: () => assert.fail('no idle-progress timer'), requestAnimationFrame: () => assert.fail('no idle-progress RAF'), getComputedStyle: () => assert.fail('no idle-progress layout/style read') })
    module.setupIdleProgress(state)
    try {
      assert.equal(frame.children.length, 0)
      root.dataset.playerControlsHidden = 'true'
      config.value.showWidescreenIdleProgress = true
      await Vue.nextTick()
      const bar = frame.firstElementChild
      assert.equal(bar.hidden, false)
      assert.equal(bar.firstElementChild.style.transform, 'scaleX(0.25)')
      time = 100
      video.dispatchEvent(new Event('timeupdate'))
      assert.equal(bar.firstElementChild.style.transform, 'scaleX(0.5)')
      root.dataset.playerControlsHidden = 'false'
      state.updateIdleProgress()
      assert.equal(bar.hidden, true)
      root.dataset.playerControlsHidden = 'true'
      for (const mode of ['paused', 'ended', 'navigation']) {
        paused = mode === 'paused'
        ended = mode === 'ended'
        state.navigationPending = mode === 'navigation'
        state.updateIdleProgress()
        assert.equal(bar.hidden, true)
      }
      paused = false
      ended = false
      state.navigationPending = false
      video.dispatchEvent(new Event('emptied'))
      assert.equal(bar.hidden, true)
      const next = document.createElement('video')
      configure(next)
      video.replaceWith(next)
      video = next
      time = 20
      video.dispatchEvent(new Event('loadedmetadata'))
      assert.equal(bar.firstElementChild.style.transform, 'scaleX(0.1)')
      config.value.showWidescreenIdleProgress = false
      await Vue.nextTick()
      assert.equal(frame.children.length, 0)
      assert.equal(state.updateIdleProgress, undefined)
    }
    finally {
      state.idleProgressCleanup()
      root.remove()
    }
  })

  check('maintenance 12: full favorite folders handle input/label/keyboard preactivation, original membership, reuse and cleanup', async () => {
    const dialog = document.body.appendChild(document.createElement('div'))
    dialog.className = 'collection-m-exp'
    dialog.innerHTML = '<div class="group-list"><ul><li><label><input type="checkbox"><i></i>full</label></li><li><label><input type="checkbox" checked disabled><i></i>original</label></li><li><label><input type="checkbox"><i></i>unknown capacity</label></li></ul></div><div class="bottom"><button class="btn">submit</button></div>'
    const labels = Array.from(dialog.querySelectorAll('label'))
    const inputs = labels.map(label => label.querySelector('input'))
    let snapshot = { aid: 1, folders: [{ id: '1', original: false, count: 2, capacity: 2 }, { id: '2', original: true, count: 2000, capacity: 2000 }, { id: '3', original: false, count: 100000 }] }
    const config = Vue.ref({ enlargeFavoriteDialog: true, language: 'en' })
    const timers = new Map()
    let id = 0
    const setTimeout = (callback) => {
      timers.set(++id, callback)
      return id
    }
    const clearTimeout = id => timers.delete(id)
    const module = await loadSourceModule('../src/utils/favoriteDialog.ts', {
      'vue': Vue,
      '~/logic': { settings: config },
      '~/utils/i18n': { i18n: { global: { t: key => `${config.value.language}:${key}` } } },
      '~/utils/videoMetadataBridge': { readNativeFavoriteDialog: () => snapshot },
    }, { MutationObserver: window.MutationObserver, window: { setTimeout, clearTimeout, innerWidth: 1440 }, setTimeout, clearTimeout })
    let changes = 0
    dialog.addEventListener('change', () => changes++)
    const activate = element => element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 0 }))
    module.initFavoriteDialogEnhancement()
    try {
      assert.equal(dialog.classList.contains('bewly-enlarged-favorite-dialog'), true)
      assert.equal(inputs[1].disabled, false)
      inputs[0].click()
      assert.equal(inputs[0].checked, false)
      labels[0].click()
      assert.equal(inputs[0].checked, false)
      activate(inputs[0])
      assert.equal(inputs[0].checked, false, 'keyboard activation is reverted by the browser, not manual checked assignment')
      assert.equal(changes, 0)
      inputs[1].click()
      assert.equal(inputs[1].checked, false)
      activate(inputs[1])
      assert.equal(inputs[1].checked, true, 'the original member can be selected again even while full')
      labels[2].click()
      assert.equal(inputs[2].checked, true, 'unknown capacity keeps native behavior')
      assert.equal(changes, 3)
      snapshot = { aid: 2, folders: [{ id: '4', original: false, count: 2, capacity: 5000 }, ...snapshot.folders.slice(1)] }
      labels[0].click()
      assert.equal(inputs[0].checked, true, 'reused rows and a new manuscript do not retain the old blocked marker')
      assert.equal(labels[0].classList.contains('bewly-full-disabled'), false)
      dialog.querySelector('.bewly-clear-selection-btn').click()
      assert.equal(inputs.some(input => input.checked), false)
      config.value.language = 'cmn-CN'
      config.value.enlargeFavoriteDialog = false
      await Vue.nextTick()
      assert.equal(dialog.classList.contains('bewly-enlarged-favorite-dialog'), false)
      assert.equal(dialog.querySelector('.bewly-clear-selection-btn').textContent, 'cmn-CN:common.clear_selection')
      module.stopFavoriteDialogEnhancement()
      await flush()
      assert.equal(dialog.querySelector('.bewly-clear-selection-btn'), null)
      assert.equal(document.querySelector('.bewly-favorite-full-message'), null)
      assert.equal(dialog.querySelector('[aria-disabled]'), null)
      assert.equal(timers.size, 0)
    }
    finally {
      module.stopFavoriteDialogEnhancement()
      dialog.remove()
    }
  })

  check('maintenance 13: notification categories are finite, preserve private defaults and deduplicate aliases and legacy chat', async () => {
    const { getNotificationBadgeCounts } = await import('../src/utils/notificationBadge')
    const message = { reply: 3, at: 2, like: 8, recv_like: 9, sys_msg: 1, chat: 90 }
    const dm = { follow_unread: 4, unfollow_unread: 5 }
    assert.equal(getNotificationBadgeCounts({}, message, dm).total, 15)
    assert.equal(getNotificationBadgeCounts({ showLikeNotificationReminder: true }, message, dm).total, 24)
    assert.equal(getNotificationBadgeCounts({}, message).privateMessages, 90)
    assert.equal(getNotificationBadgeCounts({ showUnfollowedPrivateMessageUnreadCount: false }, message, dm).privateMessages, 4)
    assert.equal(getNotificationBadgeCounts({ showUnfollowedPrivateMessageUnreadCount: false }, message).privateMessages, 0, 'an unclassified legacy count cannot be assigned to one category')
    const invalid = getNotificationBadgeCounts({}, { reply: -1, at: Infinity, chat: Number.NaN, sys_msg: 0.5 }, { follow_unread: Infinity, unfollow_unread: -4 })
    assert.equal(invalid.total, 0)
    assert.equal(getNotificationBadgeCounts({}, { reply: Number.MAX_VALUE, at: Number.MAX_VALUE }).total, Number.MAX_SAFE_INTEGER)
    assert.deepEqual(dm, { follow_unread: 4, unfollow_unread: 5 }, 'display switches never mutate unread facts')
  })
}
