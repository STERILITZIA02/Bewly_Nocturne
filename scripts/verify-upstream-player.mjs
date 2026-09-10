import assert from 'node:assert/strict'

import { loadSourceFunctions } from './sourceFunctionHarness'
import { loadSourceModule } from './sourceModuleHarness'

export function registerUpstreamPlayerChecks(check) {
  check('player scroll: sending bar remains default; center mode and every delayed media/layout boundary are respected', async () => {
    const video = document.createElement('video')
    video.src = 'https://example.com/current.mp4'
    let currentVideo = video
    let href = 'https://www.bilibili.com/video/BV1/'
    let current = true
    let ended = false
    let screen = 'wide'
    const calls = []
    const jobs = []
    const preferences = { videoPlayerScroll: true, videoPlayerScrollMode: 'sendingBar' }
    const page = { hidden: false, fullscreenElement: null, body: { classList: { contains: () => false } } }
    const root = { querySelector: () => ({ getBoundingClientRect: () => ({ bottom: 900 }) }) }
    const container = { getAttribute: () => screen, scrollIntoView: value => calls.push(['center', value]) }
    const state = await loadSourceFunctions('../src/utils/player.ts', ['scrollPlayerToOptimalPosition'], {
      settings: { value: preferences },
      getVideoElement: () => currentVideo,
      location: { get href() { return href } },
      document: page,
      window: { innerHeight: 800, scrollBy: value => calls.push(['bar', value]) },
      getPlayerModeContainer: () => container,
      getPlayerRoot: () => root,
      playbackSelectors: { danmakuInput: ['.sending'] },
      isPlayerShowingEndingRecommendation: () => ended,
      schedulePlayerLayoutTask: callback => jobs.push(callback),
    })
    state.scrollPlayerToOptimalPosition(0)
    assert.equal(calls[0][0], 'bar')
    preferences.videoPlayerScrollMode = 'playerCenter'
    state.scrollPlayerToOptimalPosition(0)
    assert.equal(calls[1][0], 'center')
    for (const invalidate of [
      () => { current = false },
      () => { currentVideo = document.createElement('video') },
      () => { href += '?p=2' },
      () => { video.src += '?new=1' },
      () => { page.hidden = true },
      () => { ended = true },
      () => { screen = 'web' },
      () => { page.fullscreenElement = container },
      () => { preferences.videoPlayerScroll = false },
      () => { page.body.classList.contains = () => true },
    ]) {
      state.scrollPlayerToOptimalPosition(1000, () => current)
      invalidate()
      jobs.splice(0).forEach(run => run())
      assert.equal(calls.length, 2, 'a delayed scroll cannot affect an invalidated media or fixed layout')
      current = true
      currentVideo = video
      page.hidden = false
      ended = false
      screen = 'wide'
      page.fullscreenElement = null
      preferences.videoPlayerScroll = true
      page.body.classList.contains = () => false
    }
  })

  check('player navigation: old URL/media overlap, manual exit, Drawer and background cannot confirm a new navigation', async () => {
    const { createPlayerModeApplication } = await import('../src/utils/playerModeApplication')
    const oldVideo = document.createElement('video')
    const newVideo = document.createElement('video')
    for (const video of [oldVideo, newVideo])
      Object.defineProperty(video, 'readyState', { value: 2 })
    oldVideo.setAttribute('src', 'old.mp4')
    newVideo.setAttribute('src', 'new.mp4')
    let video = oldVideo
    let key = 'BV1:p1'
    let drawer = false
    let ended = false
    const timers = []
    let readiness = {}
    let companions = 0
    const pageDocument = { visibilityState: 'visible' }
    const state = await loadSourceFunctions('../src/contentScripts/index.ts', ['getCurrentPlayerModeApplication', 'invalidatePlayerModeApplication', 'isPlayerModeRetryBlocked', 'resolveApplicablePlayerMode'], {
      createPlayerModeApplication,
      playerModeApplication: undefined,
      playerModeApplicationStarted: false,
      failedPlayerModeState: undefined,
      getPlayerModeReadiness: () => [video, readiness],
      clearPlayerModeRetry() {},
      playerModeGeneration: 0,
      navigationVideo: oldVideo,
      navigationMediaSource: 'old.mp4',
      awaitingNavigationMedia: false,
      contentScriptSignal: { aborted: false },
      getVideoElement: () => video,
      location: { href: 'https://www.bilibili.com/video/BV1/' },
      document: pageDocument,
      HTMLMediaElement: window.HTMLMediaElement,
      getVideoNavigationKey: () => key,
      isIframeDrawerHost: () => drawer,
      isPgcPlaybackPage: () => false,
      isFestivalPage: () => false,
      isVideoPage: () => true,
      readVideoPageMetadata: () => ({ bvid: key }),
      resolveDefaultVideoPlayerMode: () => 'widescreen',
      isPlayerShowingEndingRecommendation: () => ended,
      shouldSuppressWidescreenAutoEntry: (key, exited) => key === exited,
      userExitedWidescreenNavigationKey: undefined,
      lastAppliedPlayerModeNavigationKey: undefined,
      autoContinuationNavigationKey: undefined,
      lastVideoEndedAt: 0,
      settings: { value: { showVerticalVideoZoomButton: false } },
      pageLoading: { dispose() {} },
      applyDefaultDanmakuState: () => companions++,
      applyDefaultCaptionState() {},
      initVerticalVideoZoom() {},
      resetVerticalVideoZoom() {},
      scheduleDetachedTimer: callback => timers.push(callback),
      applyAutoPlayByVideoType: () => companions++,
      startAutoExitFullscreenMonitoring() {},
      scheduleAddWatchLaterButton() {},
      cancelPlayerRetryTasks() {},
      isBewlyWidescreenActive: () => true,
      isBewlyWidescreenEngaged: () => true,
      exitBewlyWidescreen: () => assert.fail('an active shell is retained'),
    })
    const old = state.getCurrentPlayerModeApplication(key)
    key = 'EP2'
    state.awaitingNavigationMedia = true
    state.invalidatePlayerModeApplication()
    old.onApplied()
    assert.equal(companions, 0)
    assert.equal(state.getCurrentPlayerModeApplication(key), undefined, 'new URL with old connected media is not ready')
    video = newVideo
    const current = state.getCurrentPlayerModeApplication(key)
    drawer = true
    current.onApplied()
    drawer = false
    pageDocument.visibilityState = 'hidden'
    current.onApplied()
    pageDocument.visibilityState = 'visible'
    ended = true
    current.onApplied()
    ended = false
    state.userExitedWidescreenNavigationKey = key
    current.onApplied()
    assert.equal(companions, 0)
    state.userExitedWidescreenNavigationKey = undefined
    current.onApplied()
    assert.equal(companions, 1)
    assert.equal(state.lastAppliedPlayerModeNavigationKey, key)
    key = 'BV2:p3'
    timers.forEach(run => run())
    assert.equal(companions, 1, 'old companion timers also belong to the submitted media/navigation')
    const failed = state.getCurrentPlayerModeApplication(key)
    state.playerModeApplicationStarted = true
    failed.fail()
    assert.equal(state.playerModeApplicationStarted, false)
    assert.equal(state.getCurrentPlayerModeApplication(key), undefined, 'unchanged failed readiness never immediately restarts')
    readiness = {}
    const retry = state.getCurrentPlayerModeApplication(key)
    assert.ok(retry, 'a real control replacement allows a new application')
    state.playerModeApplicationStarted = true
    failed.cancel()
    assert.equal(state.playerModeApplicationStarted, true, 'an old terminal callback cannot clear a new application')
    retry.onApplied()
    assert.equal(state.playerModeApplicationStarted, false)
    assert.equal(companions, 2)
  })

  check('player mode: click is pending; actual native state confirms once and stale tasks stop', async () => {
    const { createPlayerModeApplication } = await import('../src/utils/playerModeApplication')
    const jobs = new Map()
    let id = 0
    const player = await loadSourceModule('../src/utils/player.ts', {
      'vue': { watch: () => () => {} },
      '~/contentScripts/playerDomLifecycle': { observePlayerDom: () => () => {} },
      '~/logic': { settings: { value: { videoPlayerScroll: false, rememberPlaybackRate: false } } },
      '~/utils/playbackRate': {},
      '~/utils/videoMetadataBridge': { readVideoPageMetadata: () => null },
      '~/utils/bewlyWidescreen/constants': await import('../src/utils/bewlyWidescreen/constants'),
      './playerMedia': await loadSourceModule('../src/utils/playerMedia.ts', { './videoMetadataBridge': { isNativeVideoComponentReady: () => undefined } }),
    }, {
      location: window.location,
      setTimeout: (callback) => {
        jobs.set(++id, callback)
        return id
      },
      clearTimeout: id => jobs.delete(id),
    })
    const host = document.body.appendChild(document.createElement('div'))
    host.id = 'bilibili-player'
    host.innerHTML = '<div class="bpx-player-container" data-screen="normal"><video></video><button class="bpx-player-ctrl-wide"></button><button class="bpx-player-ctrl-web"></button></div>'
    const root = host.firstElementChild
    let active = true
    let completed = 0
    let clicks = 0
    root.addEventListener('click', () => clicks++)
    const application = createPlayerModeApplication(() => active, () => completed++)
    const tick = () => {
      const queued = [...jobs.values()]
      jobs.clear()
      queued.forEach(run => run())
    }
    try {
      player.widescreen(application)
      assert.equal(clicks, 1)
      assert.equal(completed, 0)
      tick()
      assert.equal(clicks, 1, 'a pending button must not toggle back and forth')
      assert.equal(completed, 0)
      root.dataset.screen = 'wide'
      tick()
      assert.equal(completed, 1)
      application.onApplied()
      assert.equal(completed, 1)
      player.cancelPlayerRetryTasks()
      root.dataset.screen = 'normal'
      player.webFullscreen(createPlayerModeApplication(() => active, () => completed++))
      active = false
      root.dataset.screen = 'web'
      tick()
      assert.equal(completed, 1, 'a superseded navigation cannot complete even when the old button finally switches')
      active = true
      root.dataset.screen = 'normal'
      const ending = root.appendChild(document.createElement('div'))
      ending.className = 'bpx-player-ending-wrap'
      player.widescreen(createPlayerModeApplication(() => active, () => completed++))
      assert.equal(clicks, 2, 'an ending recommendation never triggers another mode click')
      assert.equal(completed, 1)
      ending.hidden = true
      player.defaultMode(createPlayerModeApplication(() => active, () => completed++))
      assert.equal(completed, 2, 'hiding the ending screen permits replay without a sticky ended flag')
      player.cancelPlayerRetryTasks()
      assert.equal(jobs.size, 0)
      root.dataset.screen = 'normal'
      const outcomes = []
      const failed = createPlayerModeApplication(() => active, () => completed++, outcome => outcomes.push(outcome))
      player.widescreen(failed)
      for (let attempt = 0; attempt < 20; attempt++)
        tick()
      assert.equal(failed.status, 'failed', 'exhausted mode work reaches a terminal state')
      assert.deepEqual(outcomes, ['failed'])
      root.dataset.screen = 'wide'
      failed.onApplied()
      assert.equal(completed, 2, 'late native mode state cannot revive an exhausted application')
      const stateAnchor = root.appendChild(document.createElement('div'))
      stateAnchor.className = 'bpx-player-state-wrap'
      player.showState('first')
      const oldHide = [...jobs.values()][0]
      player.showState('second')
      assert.equal(jobs.size, 1, 'a new HUD replaces its previous hide timer')
      const hud = [...root.children].find(element => element.textContent === 'second')
      assert.ok(hud)
      oldHide()
      assert.notEqual(getComputedStyle(hud).display, 'none', 'an already queued old hide callback cannot hide the new prompt')
      player.cancelPlayerRetryTasks()
      assert.equal(hud.isConnected, false)
      assert.equal(jobs.size, 0)
    }
    finally {
      player.cancelPlayerRetryTasks()
      host.remove()
    }
  })

  check('PGC React: only committed moved roots bridge click/hover/long-press, with exact cleanup', async () => {
    const constants = await import('../src/utils/bewlyWidescreen/constants')
    const metadata = await import('../src/utils/videoMetadataBridge')
    const { createMovedPgcReactBridge, getMountedPgcEventRoot } = await loadSourceModule('../src/inject/movedPgcReact.ts', {
      '~/utils/bewlyWidescreen/constants': constants,
      '~/utils/videoMetadataBridge': metadata,
    })
    const origin = document.body.appendChild(document.createElement('div'))
    const target = document.body.appendChild(document.createElement('aside'))
    const boundary = origin.appendChild(document.createElement('div'))
    const button = boundary.appendChild(document.createElement('button'))
    const icon = button.appendChild(document.createElement('span'))
    const root = { child: null, return: null, alternate: null, sibling: null, stateNode: null }
    const fiber = { child: null, return: root, alternate: null, sibling: null, stateNode: boundary }
    const state = { current: root, containerInfo: origin }
    root.stateNode = state
    root.child = fiber
    boundary.__reactFiber$fixture = fiber
    const calls = []
    button.__reactProps$fixture = Object.fromEntries(['Click', 'MouseEnter', 'MouseLeave', 'MouseDown', 'MouseMove', 'MouseUp'].map(name => [`on${name}`, (e) => {
      assert.equal(e.currentTarget, button)
      e.persist()
      calls.push(name)
    }]))
    const bridge = createMovedPgcReactBridge()
    try {
      assert.equal(getMountedPgcEventRoot(boundary), origin)
      bridge.bind(boundary)
      button.click()
      assert.deepEqual(calls, [], 'native delegation is untouched inside the event root')
      target.append(boundary)
      bridge.bind(boundary)
      bridge.bind(boundary)
      button.click()
      button.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
      icon.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, relatedTarget: button }))
      for (const name of ['mousedown', 'mousemove', 'mouseup', 'mouseout'])
        icon.dispatchEvent(new MouseEvent(name, { bubbles: true, relatedTarget: origin }))
      assert.deepEqual(calls, ['Click', 'MouseEnter', 'MouseDown', 'MouseMove', 'MouseUp', 'MouseLeave'])
      root.child = null
      assert.equal(getMountedPgcEventRoot(boundary), null)
      button.click()
      assert.equal(calls.length, 6, 'a destroyed native subtree is never reactivated from a surviving expando')
      assert.equal(boundary.hasAttribute(constants.PGC_REACT_BRIDGE_ATTRIBUTE), false)
      root.child = fiber
      bridge.bind(boundary)
      boundary.remove()
      boundary.dispatchEvent(new CustomEvent(metadata.VIDEO_COMPONENT_REQUEST, { detail: JSON.stringify({ release: true }) }))
      assert.equal(boundary.hasAttribute(constants.PGC_REACT_BRIDGE_ATTRIBUTE), false)
      target.append(boundary)
      button.click()
      assert.equal(calls.length, 6, 'detached release removes the actual event listeners')
      const alternateRoot = { ...root, child: fiber }
      root.alternate = alternateRoot
      alternateRoot.alternate = root
      state.current = alternateRoot
      assert.equal(getMountedPgcEventRoot(boundary), origin, 'bailout branches reused by the committed alternate remain mounted')
    }
    finally {
      bridge.dispose()
      origin.remove()
      target.remove()
    }
  })
}
