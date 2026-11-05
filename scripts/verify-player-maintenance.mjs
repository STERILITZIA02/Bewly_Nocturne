import assert from 'node:assert/strict'

import { loadSourceModule } from './sourceModuleHarness'

export function registerPlayerMaintenanceChecks(check, { Vue, flush }) {
  check('listen playback: requests only separate playable audio, including CDN fallback and episode manifests', async () => {
    const policy = await import('../src/utils/listenPlayback')
    const a = 'https://upos-sz-mirrorcos.bilivideo.com/audio.m4s'
    const b = 'https://upos-hz-mirrorakam.akamaized.net/audio.m4s'
    const video = 'https://upos-sz-mirrorcos.bilivideo.com/video.m4s'
    const dash = { video: [{ baseUrl: video }], audio: [
      { bandwidth: 96, base_url: b },
      { bandwidth: 128, codecs: 'mp4a', baseUrl: a, backupUrl: [b, 'https://bilivideo.com.example.org/other'] },
      { mimeType: 'video/mp4', baseUrl: video },
      { codecs: 'unsupported', baseUrl: video },
    ] }
    const canPlay = type => type.includes('unsupported') ? '' : 'probably'
    const calls = []
    const { readListenSources } = await loadSourceModule('../src/utils/listenStreams.ts', {
      './api': { default: {
        video: { async getVideoPreview(params) {
          calls.push(params)
          return { code: 0, data: { dash } }
        } },
        anime: { async getEpisodeAudio(params) {
          calls.push(params)
          return { code: 0, result: { dash } }
        } },
      } },
      './listenPlayback': policy,
    })
    const unit = { aid: 170001, bvid: 'BV17x411w7KC', page: 2, cid: 279786 }
    const signal = new AbortController().signal
    assert.deepEqual(await readListenSources(unit, canPlay, signal), [a, b])
    assert.equal(calls[0].fnval, 16)
    assert.equal(calls[0].cid, unit.cid)
    assert.deepEqual(await readListenSources({ ...unit, episodeId: 42 }, canPlay, signal), [a, b])
    assert.equal(calls[1].ep_id, 42)
    for (const data of [{ durl: [{ url: video }] }, { dash: { video: dash.video } }, { is_drm: true, dash }])
      assert.deepEqual(policy.getListenSources({ code: 0, data }, canPlay), [])
    assert.equal(policy.returnVideoUrl({ unit, time: 54.8 }), 'https://www.bilibili.com/video/BV17x411w7KC/?p=2&t=54')
    assert.equal(policy.returnVideoUrl({ unit: { ...unit, episodeId: 42 }, time: 54 }), 'https://www.bilibili.com/bangumi/play/ep42?t=54')
    assert.equal(policy.returnVideoUrl({ href: 'https://www.bilibili.com/zh-Hans/video/BV17x411w7KC/?p=2&t=3', unit, time: 54.8 }), 'https://www.bilibili.com/zh-Hans/video/BV17x411w7KC/?p=2&t=54')
    assert.equal(policy.matchesListenUnit('https://www.bilibili.com/bangumi/play/ep43', { ...unit, episodeId: 42 }), false)
    assert.deepEqual(policy.getListenSources({ code: 0, data: { dash: { audio: [{ base_url: '//upos-hz-mirrorakam.akamaized.net/audio.m4s' }] } } }, canPlay), [b])
  })

  check('listen playback: preparation, cancellation, paused seeks, a failed CDN and exhausted sources', async () => {
    const { prepareListenAudio } = await loadSourceModule('../src/contentScripts/listenAudio.ts', {})
    const urls = ['https://primary.bilivideo.com/audio', 'https://backup.bilivideo.com/audio']
    const state = { time: 12, playing: false, volume: 0.5, muted: false, rate: 1.25 }
    const controller = new AbortController()
    let failed = 0
    const player = prepareListenAudio(state, urls, controller.signal, () => failed++)
    const { audio } = player
    audio.play = () => assert.fail('a paused listener must not autoplay')
    audio.load = () => {}
    audio.dispatchEvent(new Event('loadedmetadata'))
    await player.ready
    assert.equal(audio.currentTime, 0, 'preparing an audio track does not steal playback')
    player.commit()
    assert.equal(audio.currentTime, 12)
    audio.currentTime = 23
    audio.dispatchEvent(new Event('timeupdate'))
    audio.dispatchEvent(new Event('error'))
    assert.equal(audio.getAttribute('src'), urls[1])
    audio.dispatchEvent(new Event('loadedmetadata'))
    assert.equal(audio.currentTime, 23)
    audio.dispatchEvent(new Event('error'))
    assert.equal(failed, 1)
    controller.abort()
    assert.equal(audio.getAttribute('src'), null)
    const cancelled = new AbortController()
    const pending = prepareListenAudio(state, urls, cancelled.signal, () => assert.fail())
    pending.audio.load = () => {}
    cancelled.abort()
    await assert.rejects(pending.ready, error => error.name === 'AbortError')
    pending.audio.dispatchEvent(new Event('error'))
    assert.equal(pending.audio.getAttribute('src'), null)
  })

  check('listen playback: per-tab request rules allow only audio and stale releases cannot unblock a new owner', async () => {
    const policy = await import('../src/utils/listenPlayback')
    const messages = new Map()
    const rules = new Map()
    let closed
    const { setupListenPlayback } = await loadSourceModule('../src/background/listenPlayback.ts', {
      'webextension-polyfill': { default: {
        declarativeNetRequest: {
          getSessionRules: async () => [],
          updateSessionRules: async ({ addRules = [], removeRuleIds = [] }) => {
            removeRuleIds.forEach(id => rules.delete(id))
            addRules.forEach(rule => rules.set(rule.id, rule))
          },
        },
        tabs: { onUpdated: { addListener() {} }, onRemoved: { addListener: fn => closed = fn } },
        storage: { session: { async set() {}, async remove() {} } },
      } },
      '~/constants/audioCdn': await import('../src/constants/audioCdn'),
      '~/utils/listenPlayback': policy,
      '~/utils/messaging': { onMessage: (type, handler) => messages.set(type, handler) },
    }, { crypto: globalThis.crypto })
    setupListenPlayback()
    const source = 'https://upos-sz-mirrorcos.bilivideo.com/a.m4s?x=1'
    const data = { unit: { aid: 1, cid: 2, page: 1 }, sources: [source] }
    const sender = id => ({ tab: { id }, frameId: 0, url: 'https://www.bilibili.com/video/av1/' })
    const take = messages.get(policy.LISTEN_GATE)
    const release = messages.get(policy.LISTEN_RELEASE)
    assert.equal(await take({ ...data, sources: ['https://invalid.example/a.m4s'] }, sender(1)), undefined)
    const [a, b] = await Promise.all([take(data, sender(1)), take(data, sender(2))])
    assert.notEqual(a, b)
    assert.equal(rules.get(a).action.type, 'block')
    assert.deepEqual([...rules.get(a).condition.tabIds], [1])
    assert.equal(rules.get(a + 2).condition.urlFilter, `|${source}|`)
    assert.deepEqual([...rules.get(a + 2).condition.resourceTypes], ['media'])
    const next = await take(data, sender(1))
    await release(a, sender(1))
    assert.ok(rules.has(next) && rules.has(b))
    const paused = { href: sender(1).url, unit: data.unit, gate: next, time: 65, playing: false, muted: false, volume: 0.4, rate: 1.5 }
    await messages.get(policy.LISTEN_SAVE)(paused, sender(1))
    await messages.get(policy.LISTEN_SAVE)({ ...paused, gate: a, time: 0 }, sender(1))
    const restored = await messages.get(policy.LISTEN_RECOVER)(undefined, sender(1))
    assert.equal(restored.time, 65)
    assert.equal(restored.playing, false)
    assert.equal(await messages.get(policy.LISTEN_RECOVER)(undefined, sender(2)), undefined)
    closed(2)
    await release(next, sender(1))
    assert.equal(rules.size, 0)
  })

  check('listen playback: a second click, a late grant and a user navigation cannot steal the current player', async () => {
    const policy = await import('../src/utils/listenPlayback')
    const unit = { aid: 1, cid: 10, page: 1 }
    const location = {
      href: 'https://www.bilibili.com/video/av1/',
      replace() { assert.fail('user navigation must win') },
    }
    const root = document.body.appendChild(document.createElement('div'))
    root.innerHTML = '<video></video><div class="bpx-player-control-bottom-right"></div>'
    const native = root.querySelector('video')
    const rail = document.body.appendChild(document.createElement('aside'))
    const panels = rail.appendChild(document.createElement('div'))
    const overview = panels.appendChild(document.createElement('section'))
    const shell = document.body.appendChild(document.createElement('div'))
    const routes = new Set()
    const checkpoint = new Map()
    const released = []
    let savedTime
    const deferred = () => {
      let resolve
      const promise = new Promise(done => resolve = done)
      return { promise, resolve }
    }
    let read = deferred()
    let grant = deferred()
    let suspensions = 0
    let commits = 0
    let audio, failed
    const { listenStage } = { listenStage: Vue.shallowRef(null) }
    let stageHost, bound
    const { setupListenControl } = await loadSourceModule('../src/contentScripts/listenControl.ts', {
      'vue': Vue,
      'vue-toastification': { useToast: () => ({ info() {}, error() {} }) },
      '~/composables/useRouteState': { onRouteChange(fn) {
        routes.add(fn)
        return () => routes.delete(fn)
      } },
      '~/logic': { settings: { value: { language: 'en' } } },
      '~/utils/bewlyWidescreen/appHost': { createPlaybackAppHost() {
        stageHost = document.createElement('div')
        const mount = stageHost.appendChild(document.createElement('div'))
        return { host: stageHost, mount, dispose: () => stageHost.remove() }
      } },
      '~/utils/bewlyWidescreen/displayMode': { setWidescreenDisplayMode() {} },
      '~/utils/bewlyWidescreen/nativeControls': { syncNativePlayerControlVisibility() {} },
      '~/utils/bewlyWidescreen/session': { session: { current: { root: shell, sidebarEl: rail, panels: { overview } } } },
      '~/utils/i18n': { i18n: { global: { t: key => key } } },
      '~/utils/listenPlayback': policy,
      '~/utils/listenStage': { listenStage },
      '~/utils/listenStreams': { readListenSources: () => read.promise },
      '~/utils/loadingRing': { createLoadingRingElement: () => document.createElementNS('http://www.w3.org/2000/svg', 'svg') },
      '~/utils/main': { getUserID: () => 1 },
      '~/utils/messaging': { sendMessage: async (type, data) => {
        if (type === policy.LISTEN_GATE)
          return grant.promise
        if (type === policy.LISTEN_RELEASE)
          released.push(data)
        if (type === policy.LISTEN_SAVE)
          savedTime = data.time
      } },
      '~/utils/playerMedia': { getPlayerRoot: () => root, getVideoElement: () => native, isPlayerAdvertisement: () => false },
      '~/utils/videoMetadataBridge': {
        ...await import('../src/utils/videoMetadataBridge'),
        readNativeMediaSnapshot: () => ({ unit }),
        suspendNativePlayback: () => {
          suspensions += 1
          return true
        },
      },
      './listenAudio': { prepareListenAudio: (_state, _sources, _signal, onFailed) => {
        audio = document.createElement('audio')
        failed = onFailed
        return { audio, ready: Promise.resolve(), commit: () => commits++ }
      } },
      './listenNativeBar': { bindListenNativeBar: (barRoot, barAudio, signal) => bound = { root: barRoot, audio: barAudio, signal } },
      './listenReturn': { restoreListenReturn() {}, saveListenReturn() {} },
      './playerControlFit': { registerPlayerControlFit: () => ({ dispose() {}, refresh() {} }) },
      './playerControlTooltip': { createPlayerControlTooltip: () => document.createElement('span'), updatePlayerControlTooltip() {} },
      './playerDomLifecycle': { observePlayerDom(fn) {
        fn()
        return () => {}
      } },
    }, {
      location,
      history: { replaceState(_state, _title, href) { location.href = href } },
      sessionStorage: { getItem: key => checkpoint.get(key), setItem: (key, value) => checkpoint.set(key, value), removeItem: key => checkpoint.delete(key) },
    })
    const stop = setupListenControl()
    try {
      const button = root.querySelector('button')
      button.click()
      button.click()
      read.resolve(['audio'])
      await flush()
      assert.equal(suspensions, 0)
      button.click()
      await flush()
      location.href = 'https://www.bilibili.com/video/av2/'
      routes.forEach(fn => fn())
      grant.resolve(10001)
      await flush()
      assert.deepEqual(released, [10001])
      assert.equal(suspensions, 0)
      location.href = 'https://www.bilibili.com/video/av1/'
      grant = deferred()
      button.click()
      await flush()
      native.currentTime = 18
      grant.resolve(10002)
      await flush()
      assert.equal(suspensions, 1)
      assert.equal(commits, 1)
      // The stage lies over the picture; Bpx's own bar drives the audio.
      assert.ok(root.hasAttribute(policy.LISTEN_ATTRIBUTE) && listenStage.value?.audio === audio && root.contains(stageHost))
      assert.ok(bound.root === root && bound.audio === audio && !bound.signal.aborted && !native.inert)
      assert.equal(savedTime, 18)
      failed()
      assert.equal(listenStage.value.failed, true)
      read = deferred()
      listenStage.value.retry()
      location.href = 'https://www.bilibili.com/video/av2/'
      routes.forEach(fn => fn())
      read.resolve(['late'])
      await flush()
      assert.equal(root.hasAttribute(policy.LISTEN_ATTRIBUTE), false)
      assert.equal(listenStage.value, null)
      assert.ok(bound.signal.aborted && !root.contains(stageHost))
      assert.equal(commits, 1)
      assert.equal(location.href, 'https://www.bilibili.com/video/av2/')
    }
    finally {
      stop()
      root.remove()
      rail.remove()
      shell.remove()
    }
  })

  check('listen playback: Bpx\'s bar plays the audio while its video stays suspended', async () => {
    const root = document.body.appendChild(document.createElement('div'))
    root.innerHTML = `<video></video>
      <div class="bpx-player-ctrl-btn bpx-player-ctrl-play"><div class="bpx-player-ctrl-btn-icon"></div></div>
      <span class="bpx-player-ctrl-time-current">00:00</span><span class="bpx-player-ctrl-time-duration">00:00</span>`
    const native = root.querySelector('video')
    const play = root.querySelector('.bpx-player-ctrl-play')
    let paused = true
    let nativeClicks = 0
    play.addEventListener('click', () => nativeClicks++)
    const audio = document.createElement('audio')
    Object.defineProperties(audio, {
      paused: { get: () => paused },
      duration: { get: () => 120 },
      play: { value: async () => { paused = false } },
      pause: { value: () => { paused = true } },
    })
    audio.currentTime = 0
    const { bindListenNativeBar } = await loadSourceModule('../src/contentScripts/listenNativeBar.ts', {
      '~/utils/dataFormatter': { calcCurrentTime: seconds => `${seconds}` },
      '~/utils/playerMedia': { getVideoElement: () => native },
    }, { ResizeObserver: class { observe() {} disconnect() {} } })
    const controller = new AbortController()
    try {
      audio.playbackRate = 1.5
      bindListenNativeBar(root, audio, controller.signal)
      // Bpx's controls start from the audio's speed, and its later changes reach the audio.
      assert.equal(native.playbackRate, 1.5)
      native.playbackRate = 2
      native.dispatchEvent(new Event('ratechange'))
      assert.equal(audio.playbackRate, 2)
      assert.ok(play.querySelector('.bewly-player-glyph'))
      play.click()
      await Promise.resolve()
      assert.deepEqual([paused, nativeClicks], [false, 0], 'the play button toggles the audio, not the suspended video')
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }))
      assert.equal(paused, true, 'Space acts on the audio')
      controller.abort()
      assert.equal(play.querySelector('.bewly-player-glyph'), null)
      play.click()
      assert.equal(nativeClicks, 1, 'the bar is Bpx\'s again once the session ends')
    }
    finally {
      controller.abort()
      root.remove()
    }
  })

  check('listen playback: a paused return restores the media once, and a user gesture takes precedence', async () => {
    const policy = await import('../src/utils/listenPlayback')
    const bridge = await import('../src/utils/videoMetadataBridge')
    const href = 'https://www.bilibili.com/video/av1/?t=25'
    const unit = { aid: 1, cid: 10, page: 1 }
    const saved = { href, gate: 10002, unit, time: 25.5, playing: false, muted: true, volume: 0.4, rate: 1.5 }
    const cache = new Map()
    const native = document.createElement('video')
    document.body.append(native)
    let loaded = false
    let pauses = 0
    Object.defineProperties(native, { readyState: { get: () => loaded ? 4 : 0 }, paused: { get: () => false } })
    native.pause = () => {
      pauses += 1
    }
    const { saveListenReturn, restoreListenReturn } = await loadSourceModule('../src/contentScripts/listenReturn.ts', {
      '~/composables/useRouteState': { onRouteChange: () => () => {} },
      '~/utils/listenPlayback': policy,
      '~/utils/playerMedia': { getVideoElement: () => native },
      '~/utils/videoMetadataBridge': { ...bridge, applyNativeListenReturn(video, intent) {
        assert.equal(intent.unit, bridge.getNativePlaybackUnitKey(unit))
        video.pause()
        video.currentTime = intent.time
        video.playbackRate = intent.rate
        video.muted = intent.muted
        return true
      } },
    }, {
      location: { href },
      sessionStorage: { getItem: k => cache.get(k), setItem: (k, v) => cache.set(k, v), removeItem: k => cache.delete(k) },
    })
    const scope = new AbortController()
    try {
      saveListenReturn(saved)
      restoreListenReturn(scope.signal)
      window.dispatchEvent(new Event('pointerdown'))
      loaded = true
      native.dispatchEvent(new Event('loadedmetadata'))
      assert.equal(pauses, 0)
      saveListenReturn(saved)
      restoreListenReturn(scope.signal)
      assert.equal(pauses, 1)
      assert.equal(native.currentTime, 25.5)
      assert.equal(native.playbackRate, 1.5)
      assert.equal(native.muted, true)
      window.dispatchEvent(new Event('keydown'))
      native.dispatchEvent(new Event('play'))
      assert.equal(pauses, 1)
      assert.equal(cache.size, 0)
    }
    finally {
      scope.abort()
      native.remove()
    }
  })

  check('playback trail: skips non-video routes, restores the cursor and branches after going back', async () => {
    const base = 'https://www.bilibili.com'
    const video = id => `${base}/video/av${id}/`
    const route = { href: video(1), applicationHref: video(1) }
    const history = {
      state: { site: true },
      replaceState(state) { this.state = state },
    }
    const storage = new Map()
    const assigned = []
    const traversed = []
    const navigation = {
      currentEntry: { key: 'first' },
      entries: () => [{ key: 'first', url: video(1), sameDocument: true }],
      traverseTo(key) {
        traversed.push(key)
        return { committed: Promise.resolve() }
      },
    }
    const playbackTab = await import('../src/utils/playbackTab')
    const media = document.createElement('video')
    let hasNativeSwitch = false
    let resolveLegacy
    const switched = []
    const bridge = await import('../src/utils/videoMetadataBridge')
    let sync
    const load = () => loadSourceModule('../src/composables/usePlaybackTrail.ts', {
      'vue': Vue,
      '~/utils/playbackTab': playbackTab,
      '~/utils/playbackVideoInfo': {
        getPlaybackPart: (_url, pages) => pages[0],
        getPlaybackVideoInfo: () => new Promise(resolve => resolveLegacy = resolve),
      },
      '~/utils/playerMedia': { getVideoElement: () => media },
      '~/utils/videoMetadataBridge': {
        ...bridge,
        readNativeMediaSnapshot: () => undefined,
        switchNativePlaybackVisit(_media, href, unit) {
          if (hasNativeSwitch === 'legacy')
            return unit ?? 'needs-unit'
          if (hasNativeSwitch) {
            switched.push(href)
            return { aid: 3, bvid: 'BV14ReF6NEWN', cid: 30, page: 1 }
          }
        },
      },
      '~/composables/useRouteState': {
        useRouteState: () => route,
        onRouteChange(fn) {
          sync = fn
          fn()
          return () => {}
        },
      },
    }, {
      history,
      sessionStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
      window: { navigation, location: { assign: url => assigned.push(url) }, addEventListener() {}, removeEventListener() {} },
    })
    function visit(href, key, state = null, applicationHref = href) {
      Object.assign(route, { href, applicationHref })
      navigation.currentEntry = { key }
      history.state = state
      sync()
    }
    const page = await load()
    page.setupPlaybackTrail()
    const firstState = history.state
    assert.equal(firstState.site, true)
    page.goToPlaybackVisit(-1)
    page.goToPlaybackVisit(1)
    assert.deepEqual(assigned, [])
    visit(video(9), 'drawer', null, base)
    visit(base, 'home')
    visit(video(2), 'second')
    visit(`${video(2)}?t=30`, 'second')
    assert.equal(page.playbackTrail.value.visits.length, 2)
    page.goToPlaybackVisit(-1)
    assert.deepEqual(traversed, ['first'])
    visit(video(1), 'first', firstState)
    assert.equal(page.playbackTrail.value.index, 0)
    page.goToPlaybackVisit(1)
    assert.deepEqual(assigned, [`${video(2)}?t=30`])
    visit(assigned[0], 'third')
    const reloaded = await load()
    reloaded.setupPlaybackTrail()
    assert.equal(reloaded.playbackTrail.value.index, 1)
    visit(video(1), 'first', firstState)
    visit(video(3), 'fourth')
    assert.deepEqual(Array.from(reloaded.playbackTrail.value.visits, v => v.href), [video(1), video(3)])
    visit(video(4), 'fourth', history.state)
    hasNativeSwitch = true
    const previousAssignCount = assigned.length
    reloaded.goToPlaybackVisit(-1)
    reloaded.goToPlaybackVisit(-1)
    assert.deepEqual(switched, [video(3)], 'repeated clicks wait for the native manifest')
    assert.equal(reloaded.playbackTrail.value.index, 2, 'cursor moves only on route commit')
    visit(`${base}/video/BV14ReF6NEWN/`, 'fifth')
    assert.equal(reloaded.playbackTrail.value.index, 1, 'canonical BV commit restores the AV visit')
    assert.equal(reloaded.playbackTrail.value.visits.length, 3)
    assert.equal(assigned.length, previousAssignCount, 'replaced history entry reuses the current document')
    hasNativeSwitch = 'legacy'
    const pending = reloaded.goToPlaybackVisit(1)
    visit(video(5), 'sixth')
    resolveLegacy({ code: 0, data: { aid: 4, bvid: 'BV1NyeA6zESV', pages: [{ cid: 40, page: 1 }] } })
    await pending
    assert.equal(reloaded.playbackTrail.value.visits.at(-1).href, video(5), 'a superseded lookup cannot navigate the new page')
    assert.equal(assigned.length, previousAssignCount)
  })

  check('playback resources: overlapping readers share a request and revisits reuse only successful same-account results', async () => {
    const requests = []
    let account = '1'
    const { getPlaybackVideoInfo } = await loadSourceModule('../src/utils/playbackVideoInfo.ts', {
      '~/utils/main': { getUserID: () => account },
      '~/utils/api': { default: { video: { getVideoInfo: (_, { signal }) => new Promise(resolve => requests.push({ resolve, signal })) } } },
    })
    const params = { bvid: 'BV14ReF6NEWN' }
    const result = { code: 0, data: { ...params, aid: 1 } }
    const controller = new AbortController()
    const a = getPlaybackVideoInfo(params, controller.signal)
    const b = getPlaybackVideoInfo(params)
    controller.abort()
    await assert.rejects(a, { name: 'AbortError' })
    assert.equal(requests.length, 1)
    assert.equal(requests[0].signal.aborted, false)
    requests[0].resolve(result)
    assert.equal(await b, result)
    assert.equal(await getPlaybackVideoInfo({ aid: '1' }), result)
    account = '2'
    const failed = getPlaybackVideoInfo(params)
    requests[1].resolve({ code: -404 })
    await failed
    const retry = getPlaybackVideoInfo(params)
    requests[2].resolve(result)
    assert.equal(await retry, result)
  })

  check('playback author messages: page preference and native uploader changes select the exact conversation', async () => {
    const { AppPage } = await import('../src/enums/appEnums')
    const routes = await import('../src/utils/privateConversationRoute')
    const original = Vue.ref(true)
    const { bindAuthorMessageLinks } = await loadSourceModule('../src/utils/bewlyWidescreen/authorMessages.ts', {
      'vue': Vue,
      '~/enums/appEnums': { AppPage },
      '~/stores/settingsStore': { useSettingsStore: () => ({ getDockItemIsUseOriginalBiliPage: (page) => {
        assert.equal(page, AppPage.Notifications)
        return original.value
      } }) },
      '~/utils/privateConversationRoute': routes,
    })
    const slot = document.createElement('div')
    const link = slot.appendChild(document.createElement('a'))
    const native = '//message.bilibili.com/?spm_id_from=333.788.upinfo.head.click#whisper/mid123'
    link.setAttribute('href', native)
    const stop = bindAuthorMessageLinks(slot)
    try {
      assert.equal(link.getAttribute('href'), native)
      original.value = false
      assert.deepEqual(routes.parsePrivateConversationRoute(link.href), { sessionType: 1, talkerId: '123' })
      const next = 'https://message.bilibili.com/#/whisper/mid9007199254740993'
      link.href = next
      await flush()
      assert.deepEqual(routes.parsePrivateConversationRoute(link.href), { sessionType: 1, talkerId: '9007199254740993' })
      original.value = true
      assert.equal(link.href, next)
      original.value = false
      link.remove()
      await flush()
      assert.equal(link.href, next)
      slot.append(link)
      await flush()
      assert.equal(routes.parsePrivateConversationRoute(link.href)?.talkerId, '9007199254740993')
    }
    finally { stop() }
    assert.equal(link.hostname, 'message.bilibili.com')
  })

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
    const emptyImports = Object.fromEntries(['actionEffects', 'actionRolls', 'authorMessages', 'commentComposer', 'danmaku', 'danmakuViews', 'description', 'displayMode', 'geometry', 'idleProgress', 'labels', 'nativeControls', 'playlist', 'shell', 'sidebar', 'styles/layout', 'videoInfo'].map(name => [`~/utils/bewlyWidescreen/${name}`, {}]))
    emptyImports['~/utils/bewlyWidescreen/videoInfo'] = { clearViewerCount() {} }
    emptyImports['~/utils/bewlyWidescreen/actionRolls'] = { clearActionRolls() {} }
    emptyImports['~/utils/bewlyWidescreen/danmakuViews'] = { clearDanmakuViews() {}, refreshDanmakuViewLabels() {} }
    emptyImports['~/utils/bewlyWidescreen/railTabs'] = await import('../src/utils/bewlyWidescreen/railTabs')
    const constants = await import('../src/utils/bewlyWidescreen/constants')
    const module = await loadSourceModule('../src/utils/bewlyWidescreen.ts', {
      ...emptyImports,
      'vue': Vue,
      '~/composables/useDark': {},
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
      '~/contentScripts/playerDomLifecycle': { observePlayerDom: () => () => {} },
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
      // Quality memory is scoped per account; this fixture plays as a guest
      // with no active store, which only affects login/VIP-restricted levels.
      'pinia': { getActivePinia: () => undefined },
      '~/stores/topBarStore': { useTopBarStore: () => ({}) },
      '~/utils/main': { getUserID: () => '' },
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
    let manifest = { aid: 1, bvid: 'BV1NyeA6zESV', p: 1, cid: 10, episodeId: null, seasonId: null }
    let realQuality = 80
    let fullDuration = 200
    const oldPlayer = window.player
    const oldBtr = window.__biliThreadRipperDebug
    window.player = { mediaElement: () => video, getManifest: () => manifest, getQuality: () => ({ nowQ: 64, realQ: realQuality }), getDuration: full => full ? fullDuration : 200 }
    const bridge = await loadSourceModule('../src/utils/videoMetadataBridge.ts', { './pageBridgeChannel': { getPageBridgeChannelId: () => 'fixture-channel' } }, { CustomEvent: window.CustomEvent, location: window.location })
    const main = await loadSourceModule('../src/inject/videoMetadata.ts', {
      '~/inject/movedPgcReact': { createMovedPgcReactBridge: () => ({ dispose() {} }) },
      '~/utils/bewlyWidescreen/constants': await import('../src/utils/bewlyWidescreen/constants'),
      '~/utils/videoMetadataBridge': bridge,
    }, { CustomEvent: window.CustomEvent, location: window.location })
    const stop = main.setupVideoMetadataBridge('fixture-channel')
    try {
      app.setAttribute('data-btr-mse-active', 'true')
      const snapshot = bridge.readNativeMediaSnapshot(video)
      assert.equal(snapshot.btr.ownsMedia, true)
      assert.deepEqual({ ...snapshot.unit }, { aid: 1, bvid: 'BV1NyeA6zESV', cid: 10, page: 1 })
      const transport = []
      const dash = {
        getVideoElement: () => video,
        getActiveStream: () => ({ getProcessors: () => [{
          getScheduleController: () => ({ stop: () => transport.push('stop') }),
          getFragmentModel: () => ({ abortRequests: () => transport.push('abort') }),
        }] }),
      }
      window.player.__core = () => ({ getCorePlayer: () => dash })
      window.player.pause = () => transport.push('pause')
      window.__biliThreadRipperDebug = { getPlayer: () => ({ video, destroy: options => transport.push(options.resumeNative) }) }
      assert.equal(bridge.suspendNativePlayback(video, { ...snapshot.unit, cid: 11 }), false)
      assert.deepEqual(transport, [])
      assert.equal(bridge.suspendNativePlayback(video, snapshot.unit), true)
      assert.deepEqual(transport, ['pause', 'stop', 'abort', false])
      window.player.pause = () => {
        throw new Error('native owner retired')
      }
      assert.equal(bridge.suspendNativePlayback(video, snapshot.unit), 'interrupted')
      Object.defineProperties(video, { readyState: { value: 4 }, duration: { value: 120 } })
      video.pause = () => transport.push('return-pause')
      const intent = { unit: bridge.getNativePlaybackUnitKey(snapshot.unit), time: 65, rate: 1.5, volume: 0.5, muted: true, playing: false, bind: true }
      assert.equal(bridge.applyNativeListenReturn(video, { ...intent, unit: 'other' }), false)
      assert.equal(bridge.applyNativeListenReturn(video, intent), true)
      assert.equal(video.currentTime, 65)
      assert.equal(video.playbackRate, 1.5)
      assert.equal(transport.at(-1), 'return-pause')
      const switches = []
      app.__vue__.player = window.player
      app.__vue__.switchVideo = target => switches.push(target)
      const unit = { aid: 2, bvid: 'BV14ReF6NEWN', page: 2, cid: 22 }
      const next = 'https://www.bilibili.com/video/av2/?p=2&t=9'
      assert.equal(bridge.switchNativePlaybackVisit(video, next), 'needs-unit')
      assert.equal(bridge.switchNativePlaybackVisit(video, next, { ...unit, page: 1 }), undefined)
      assert.equal(bridge.switchNativePlaybackVisit(video, next, unit).cid, 22)
      assert.equal(switches.length, 1)
      assert.deepEqual({ ...switches[0] }, { aid: 2, bvid: unit.bvid, p: 2, cid: 22, t: 9 })
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
      window.history.replaceState(null, '', '/zh-Hans/bangumi/play/ep85046')
      manifest = { aid: 2325306, cid: 3629601, bvid: null, p: 1, episodeId: 85046, seasonId: 3423 }
      const episode = bridge.readNativeMediaSnapshot(video)?.unit
      assert.equal(episode.episodeId, 85046)
      assert.equal(episode.cid, 3629601)
      assert.equal(episode.bvid, undefined)
    }
    finally {
      stop()
      window.player = oldPlayer
      window.__biliThreadRipperDebug = oldBtr
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
      '~/utils/playbackVideoInfo': { getPlaybackVideoInfo: (identifier, signal) => new Promise(resolve => requests.push({ identifier, options: { signal }, resolve })) },
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

  check('maintenance 05: the player anchors to the video pane, fills the overlay, and zooms between them from its painted frame', async () => {
    const root = document.body.appendChild(document.createElement('div'))
    const frame = root.appendChild(document.createElement('div'))
    const backdrop = document.body.appendChild(document.createElement('div'))
    const host = document.body.appendChild(document.createElement('div'))
    host.id = 'bewly'
    const player = document.body.appendChild(document.createElement('div'))
    const bar = player.appendChild(document.createElement('div'))
    bar.className = 'bpx-player-control-bottom-right'
    const rect = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height })
    const px = name => Number.parseFloat(player.style.getPropertyValue(name))
    const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-6, `${message ?? ''} ${actual} ≈ ${expected}`)
    root.getBoundingClientRect = () => rect(0, 0, 1440, 900)
    // The square pane: half the window, its full height.
    frame.getBoundingClientRect = () => rect(0, 0, 720, 900)
    // Layout follows the anchored geometry; a running zoom transform does not resize it.
    player.getBoundingClientRect = () => rect(px('--bewly-widescreen-player-left'), px('--bewly-widescreen-player-top'), px('--bewly-widescreen-player-width'), px('--bewly-widescreen-player-height'))
    Object.defineProperty(player, 'offsetWidth', { configurable: true, get: () => px('--bewly-widescreen-player-width') })
    Object.defineProperty(player, 'offsetHeight', { configurable: true, get: () => px('--bewly-widescreen-player-height') })
    const sidebar = root.appendChild(document.createElement('aside'))
    const info = sidebar.appendChild(document.createElement('section'))
    const state = { root, backdrop, playerEl: player, playerFrame: frame, infoEl: info, sidebarEl: sidebar, displayMode: 'card', sidebarPosition: 'right' }
    const session = { current: state }
    let nativePlayerRoot = player
    const constants = await import('../src/utils/bewlyWidescreen/constants')
    const policy = await import('../src/utils/bewlyWidescreenPolicy')
    let resizeSyncs = 0
    const geometry = await loadSourceModule('../src/utils/bewlyWidescreen/geometry.ts', {
      '~/logic': { settings: { value: { alwaysUseDock: true } } },
      '~/utils/bewlyWidescreen/actionEffects': { scheduleActionGeometrySync() {} },
      '~/utils/bewlyWidescreen/constants': constants,
      '~/utils/bewlyWidescreen/description': {},
      '~/utils/bewlyWidescreen/nativeControls': { syncNativePlayerControlVisibility() {} },
      '~/utils/bewlyWidescreen/nativeDom': { exitNativeMiniPlayer() {} },
      '~/utils/bewlyWidescreen/session': { session },
      '~/utils/bewlyWidescreenPolicy': policy,
      '~/utils/player': { getVideoElement: () => null, isPlayerShowingEndingRecommendation: () => false },
      '~/utils/playerMedia': { getPlayerRoot: () => nativePlayerRoot },
    }, { requestAnimationFrame: () => 1, cancelAnimationFrame() {}, MutationObserver: window.MutationObserver, ResizeObserver: class { observe() {} unobserve() {} disconnect() {} } })
    const animations = []
    player.animate = (keyframes, options) => {
      let finish
      const animation = { keyframes, options, cancelled: false, progress: 0, finished: new Promise((resolve, reject) => finish = { resolve, reject }) }
      // Browsers create `finished` only when read; an unread one never rejects unhandled.
      animation.finished.catch(() => {})
      animation.effect = { getComputedTiming: () => ({ progress: animation.progress }) }
      animation.cancel = () => {
        animation.cancelled = true
        finish.reject(new Error('cancelled'))
      }
      animation.finish = () => finish.resolve()
      animations.push(animation)
      return animation
    }
    let reducedMotion = false
    const holds = []
    const displayMode = await loadSourceModule('../src/utils/bewlyWidescreen/displayMode.ts', {
      '~/contentScripts/playerControlTooltip': await import('../src/contentScripts/playerControlTooltip'),
      '~/contentScripts/playerDomLifecycle': { observePlayerDom: () => () => {} },
      '~/utils/bewlyWidescreen/constants': constants,
      '~/utils/bewlyWidescreen/geometry': { ...geometry, schedulePlayerResizeSync() { resizeSyncs++ } },
      '~/utils/bewlyWidescreen/labels': { t: key => key },
      '~/utils/bewlyWidescreen/session': { session },
      '~/utils/bewlyWidescreenPolicy': policy,
      '~/utils/motionPriority': { holdAnimation: animation => holds.push(animation) },
      '~/utils/motionTiming': await import('../src/utils/motionTiming'),
    }, { window: { matchMedia: () => ({ get matches() {
      return reducedMotion
    } }) } })
    const flushMicrotasks = () => new Promise(resolve => setTimeout(resolve, 0))
    const parseTransform = (value) => {
      const match = /^translate\((\S+)px, (\S+)px\) scale\((\S+)\)$/.exec(value)
      assert.ok(match, value)
      return match.slice(1).map(Number)
    }
    const modeOf = element => element.getAttribute(constants.PLAYER_DISPLAY_MODE_ATTRIBUTE)
    try {
      geometry.syncAnchoredPlayerGeometry(state)
      assert.deepEqual([px('--bewly-widescreen-player-left'), px('--bewly-widescreen-player-top'), px('--bewly-widescreen-player-width'), px('--bewly-widescreen-player-height')], [0, 0, 720, 900])
      assert.deepEqual([modeOf(player), root.dataset.displayMode, backdrop.dataset.displayMode], ['card', 'card', 'card'])

      displayMode.setupFillToggle(state)
      const button = bar.querySelector(`.${constants.FILL_TOGGLE_CLASS}`)
      assert.equal(button?.getAttribute('aria-label'), 'widescreen.fill_window')
      assert.ok(button.querySelector('.i-tabler\\:maximize'))

      const bodyClasses = document.body.className
      button.click()
      assert.equal(state.displayMode, 'fill')
      // The shell fades at once; the player's rest styles and the column's
      // inertness restyle whole trees, so they wait for the settled frame.
      assert.deepEqual([modeOf(player), root.dataset.displayMode, backdrop.dataset.displayMode], ['card', 'fill', 'fill'])
      assert.equal(sidebar.inert, false)
      assert.equal(document.body.className, bodyClasses, 'mode and zoom never restyle the whole document through <body>')
      assert.deepEqual([px('--bewly-widescreen-player-width'), px('--bewly-widescreen-player-height')], [1440, 900], 'filled, the player covers the overlay at once')
      assert.equal(button.getAttribute('aria-label'), 'widescreen.exit_fill_window')
      assert.ok(button.querySelector('.i-tabler\\:minimize'))
      assert.equal(animations.length, 2)
      const [motion, shape] = animations
      assert.deepEqual(holds, [motion], 'content swaps wait for the zoom')
      assert.equal(JSON.stringify(motion.keyframes.map(keyframe => Object.keys(keyframe))), '[["transform"],["transform"]]', 'the motion stays compositor-only')
      // The picture keeps its width and centre in the pane; the scaled player
      // is only as tall as the picture, the backdrop paints the pane around it.
      assert.equal(motion.keyframes[0].transform, 'translate(0px, 225px) scale(0.5)', 'the first frame covers the picture in the pane')
      assert.equal(motion.keyframes[1].transform, 'translate(0px, 0px) scale(1)')
      assert.equal(shape.keyframes[0].clipPath, 'inset(0px 0px)', 'both ends are square')
      assert.equal(shape.keyframes[1].clipPath, 'inset(0px 0px)')
      assert.equal(JSON.stringify(shape.keyframes.map(keyframe => Object.keys(keyframe))), '[["clipPath"],["clipPath"]]', 'no corner radius animates')
      assert.equal(shape.options, motion.options, 'clip and motion share one timing')
      assert.equal(root.dataset.zooming, 'true')
      assert.ok(player.hasAttribute(constants.PLAYER_ZOOMING_ATTRIBUTE))
      assert.ok(host.hasAttribute(constants.HOST_ZOOMING_ATTRIBUTE))
      assert.equal(state.zoom?.motion, motion)

      // Reversing halfway continues from the frame on screen, not the layout box.
      motion.progress = 0.5
      const syncsBeforeReverse = resizeSyncs
      displayMode.setWidescreenDisplayMode(state, 'card')
      assert.equal(motion.cancelled, true)
      assert.equal(shape.cancelled, true)
      assert.equal(animations.length, 4)
      assert.equal(modeOf(player), 'card')
      assert.deepEqual([px('--bewly-widescreen-player-left'), px('--bewly-widescreen-player-width')], [0, 720])
      const [x, y, scale] = parseTransform(animations[2].keyframes[0].transform)
      near(scale, 1080 / 720, 'video width carries over')
      near(x, 0)
      near(y, -225)
      // The tall pane is clipped to the half-zoomed frame on screen.
      assert.equal(animations[3].keyframes[0].clipPath, 'inset(225px 0px)')
      assert.equal(animations[3].keyframes[1].clipPath, 'inset(0px 0px)')
      assert.ok(resizeSyncs > syncsBeforeReverse)
      await flushMicrotasks()
      assert.equal(state.zoom?.motion, animations[2], 'a cancelled zoom never settles over its successor')
      const syncsBeforeSettle = resizeSyncs
      animations[2].finish()
      await flushMicrotasks()
      assert.equal(state.zoom, undefined)
      assert.equal(animations[3].cancelled, true, 'the shape animation ends with the motion')
      assert.equal(root.dataset.zooming, undefined)
      assert.equal(player.hasAttribute(constants.PLAYER_ZOOMING_ATTRIBUTE), false)
      assert.equal(host.hasAttribute(constants.HOST_ZOOMING_ATTRIBUTE), false)
      assert.equal(resizeSyncs, syncsBeforeSettle + 1, 'the settled layout re-measures glass and auxiliary controls once')
      assert.equal(modeOf(player), 'card')

      // Filling settles into the player's fill styles and inert, faded panels.
      displayMode.setWidescreenDisplayMode(state, 'fill')
      assert.equal(modeOf(player), 'card')
      animations[4].finish()
      await flushMicrotasks()
      assert.equal(modeOf(player), 'fill')
      // The info lives in the column and goes inert with it.
      assert.deepEqual([sidebar.inert, info.parentElement], [true, sidebar])

      // Reduced motion switches without animating; repeating the mode is a no-op.
      reducedMotion = true
      displayMode.setWidescreenDisplayMode(state, 'card')
      displayMode.setWidescreenDisplayMode(state, 'card')
      assert.equal(animations.length, 6)
      assert.equal(state.displayMode, 'card')
      assert.equal(modeOf(player), 'card')
      assert.equal(sidebar.inert, false)
      assert.equal(state.zoom, undefined)

      // Bilibili may re-render its whole app after the shell commits. The new
      // player is anchored in the observer microtask, before it can paint at
      // its native place.
      const app = document.body.appendChild(document.createElement('div'))
      app.append(player)
      state.danmakuDock = root.appendChild(document.createElement('div'))
      state.descriptionSlot = root.appendChild(document.createElement('div'))
      geometry.setupAspectObservers(state)
      const nextApp = document.createElement('div')
      const nextPlayer = nextApp.appendChild(document.createElement('div'))
      nativePlayerRoot = nextPlayer
      app.replaceWith(nextApp)
      await Promise.resolve()
      assert.equal(state.playerEl, nextPlayer)
      assert.ok(nextPlayer.classList.contains(constants.NATIVE_PLAYER_CLASS))
      assert.equal(modeOf(nextPlayer), 'card')
      assert.equal(player.classList.contains(constants.NATIVE_PLAYER_CLASS), false, 'the discarded player is released')
      geometry.clearAspectObservers(state)
      nextApp.remove()

      state.fillToggleCleanup()
      assert.equal(bar.querySelector(`.${constants.FILL_TOGGLE_CLASS}`), null)
      assert.equal(state.fillToggleButton, undefined)
    }
    finally {
      state.fillToggleCleanup?.()
      geometry.clearAspectObservers(state)
      geometry.clearPlayerResizeSync(state)
      geometry.clearAnchoredPlayerElement(player)
      geometry.clearAuxiliaryControlGeometry()
      assert.equal(modeOf(player), null, 'a released player keeps no mode state')
      root.remove()
      backdrop.remove()
      host.remove()
      player.remove()
    }
  })

  check('maintenance 05b: the playback comment composer takes over native replies and the native list shows confirmed ones', async () => {
    const bridge = await import('../src/utils/commentComposerBridge')
    const pageBridge = await import('../src/constants/pageBridge')
    // The bridge reads the page origin from the global `location`.
    const previousLocation = Object.getOwnPropertyDescriptor(globalThis, 'location')
    Object.defineProperty(globalThis, 'location', { value: window.location, configurable: true, writable: true })
    const constants = await import('../src/utils/bewlyWidescreen/constants')
    const channelId = 'composer-channel'
    const flushMicrotasks = () => new Promise(resolve => setTimeout(resolve, 0))
    const main = await loadSourceModule('../src/inject/externalCommentComposer.ts', {
      '~/constants/pageBridge': pageBridge,
      '~/utils/commentComposerBridge': bridge,
    })
    const isolated = await loadSourceModule('../src/utils/bewlyWidescreen/commentComposer.ts', {
      'vue': Vue,
      '~/components/MomentCard/commentUtils': await import('../src/components/MomentCard/commentUtils'),
      '~/constants/pageBridge': pageBridge,
      '~/styles/reset.css?raw': { __esModule: true, default: '' },
      '~/utils/bewlyWidescreen/constants': constants,
      '~/utils/commentComposerBridge': bridge,
      '~/utils/pageBridgeChannel': { getPageBridgeChannelId: () => channelId },
    }, {
      MutationObserver: window.MutationObserver,
      ResizeObserver: class {
        constructor(callback) { this.callback = callback }
        observe(target) { this.callback([{ target }]) }
        disconnect() {}
      },
    })
    const messages = []
    const record = event => messages.push(event.data)
    // A browser clones posted data into the receiving realm and sets its
    // origin and source; jsdom does neither.
    const deliver = data => window.dispatchEvent(new window.MessageEvent('message', { data: JSON.parse(JSON.stringify(data)), origin: window.location.origin, source: window }))
    window.addEventListener('message', record)
    const appHost = document.body.appendChild(document.createElement('div'))
    appHost.id = 'bewly'
    appHost.className = 'dark disable-frosted-glass'
    appHost.style.setProperty('--bew-custom-background', '#123456')
    appHost.style.setProperty('visibility', 'hidden')
    const panels = document.body.appendChild(document.createElement('div'))
    const panel = panels.appendChild(document.createElement('section'))
    const outside = document.body.appendChild(document.createElement('bili-comment-thread-renderer'))
    const raw = (rpid, root, extra = {}) => ({ rpid_str: rpid, root_str: root, parent_str: root, oid_str: '100', type: 1, mid_str: '7', ctime: 1, member: { mid: 7, uname: 'Author' }, content: { message: 'hello', pictures: [] }, replies: [{ rpid_str: '9' }], ...extra })
    let cleanup
    try {
      cleanup = isolated.setupPlaybackCommentComposer(panel)
      // Pinned beside the panels, outside the scroller, which keeps its height clear.
      const host = panels.lastElementChild
      assert.ok(host?.classList.contains(constants.COMMENT_COMPOSER_HOST_CLASS))
      assert.equal(host.parentElement, panels)
      // The height sits on the panel that reads it (registered without inheritance).
      assert.equal(panel.style.getPropertyValue(constants.COMMENT_COMPOSER_HEIGHT_PROPERTY), '0px')
      assert.equal(panels.style.getPropertyValue(constants.COMMENT_COMPOSER_HEIGHT_PROPERTY), '')
      assert.ok(host.shadowRoot, 'the composer renders in its own styled shadow root')
      assert.ok(panel.hasAttribute(bridge.EXTERNAL_COMMENT_COMPOSER_ATTRIBUTE))
      assert.equal(isolated.playbackCommentComposer.value, null, 'no comment list yet, nothing to post to')
      // The app host's theme reaches the composer; its own layout styles do not.
      assert.ok(host.classList.contains('dark') && host.classList.contains('disable-frosted-glass'))
      assert.equal(host.style.getPropertyValue('--bew-custom-background'), '#123456')
      assert.equal(host.style.getPropertyValue('visibility'), '')

      // The native list arrives later (moved in by hydration); the host stays outside it.
      const list = document.createElement('bili-comments')
      list.setAttribute('data-params', '1,100')
      panel.prepend(document.createElement('div'))
      panel.append(list)
      await flushMicrotasks()
      assert.equal(host.parentElement, panels)
      assert.ok(!panel.contains(host))
      const context = isolated.playbackCommentComposer.value
      assert.equal(context?.oid, '100')
      assert.equal(context?.type, 1)
      assert.ok(host.shadowRoot.contains(context.mount))

      // MAIN: a native reply click in the panel targets the composer instead.
      const listShadow = list.attachShadow({ mode: 'open' })
      const thread = listShadow.appendChild(document.createElement('bili-comment-thread-renderer'))
      const replies = thread.attachShadow({ mode: 'open' }).appendChild(document.createElement('bili-comment-replies-renderer'))
      replies.root = '500'
      const nativeCalls = []
      class ThreadRenderer {
        handleReply(target) {
          nativeCalls.push(target)
        }
      }
      assert.equal(main.patchExternalComposerReply(ThreadRenderer, channelId), true)
      assert.equal(main.patchExternalComposerReply(ThreadRenderer, channelId), false, 'patched once')
      ThreadRenderer.prototype.handleReply.call(thread, raw('501', '500'))
      await flushMicrotasks()
      const target = messages.find(message => message?.type === pageBridge.PAGE_BRIDGE_MESSAGE.COMMENT_COMPOSER_TARGET)
      assert.equal(target?.channelId, channelId)
      assert.equal(target.data.reply.rpid_str, '501')
      assert.equal('replies' in target.data.reply, false, 'only the targeting fields cross the bridge')
      assert.equal(nativeCalls.length, 0, 'no native reply box opens')
      // Isolated: the request reaches the composer, for this list only.
      deliver(target)
      assert.equal(isolated.playbackCommentReplyRequest.value?.reply.rpid, '501')
      assert.equal(isolated.playbackCommentReplyRequest.value.reply.author.name, 'Author')
      deliver({ ...target, data: { reply: { ...target.data.reply, rpid_str: '777', oid_str: '999' } } })
      assert.equal(isolated.playbackCommentReplyRequest.value.reply.rpid, '501', 'another list cannot retarget the composer')

      // The native path stays for disabled lists, foreign threads and unusable targets.
      list.commentBoxDisabledState = { source: 'unlogin' }
      ThreadRenderer.prototype.handleReply.call(thread, raw('502', '500'))
      delete list.commentBoxDisabledState
      ThreadRenderer.prototype.handleReply.call(outside, raw('503', '0'))
      ThreadRenderer.prototype.handleReply.call(thread, { member: {} })
      assert.equal(nativeCalls.length, 3)

      // Confirmed replies enter the native list the way the native box adds them.
      const rootReply = raw('600', '0')
      const nestedReply = raw('601', '500')
      assert.equal(main.insertExternalComposerReply(rootReply), true)
      assert.equal(list.newItems[0], rootReply)
      assert.equal(main.insertExternalComposerReply(nestedReply), true)
      assert.equal(replies.newItems.at(-1), nestedReply)
      assert.equal(main.insertExternalComposerReply(raw('602', '999')), false, 'an unrendered thread loads it later')
      assert.equal(main.insertExternalComposerReply({ ...rootReply, oid_str: '999' }), false)
      assert.equal(isolated.showPostedPlaybackComment(rootReply), true)
      await flushMicrotasks()
      assert.equal(messages.at(-1)?.type, pageBridge.PAGE_BRIDGE_MESSAGE.COMMENT_COMPOSER_INSERT)
      assert.equal(messages.at(-1).data.reply.rpid_str, '600')

      cleanup()
      cleanup = undefined
      assert.equal(host.isConnected, false)
      assert.equal(panel.style.getPropertyValue(constants.COMMENT_COMPOSER_HEIGHT_PROPERTY), '')
      assert.equal(panel.hasAttribute(bridge.EXTERNAL_COMMENT_COMPOSER_ATTRIBUTE), false)
      assert.equal(isolated.playbackCommentComposer.value, null)
      assert.equal(isolated.playbackCommentReplyRequest.value, null)
    }
    finally {
      cleanup?.()
      window.removeEventListener('message', record)
      if (previousLocation)
        Object.defineProperty(globalThis, 'location', previousLocation)
      else
        delete globalThis.location
      appHost.remove()
      panels.remove()
      outside.remove()
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
      for (let i = 0; i < 30; i++) observers[0].callback([{ target: bar, contentRect: { width, height: 36 } }])
      assert.equal(frames.size, 1)
      loudness.focus()
      for (let i = 0; i < 5; i++) step()
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
      observers[0].callback([{ target: bar, contentRect: { width, height: 36 } }])
      for (let i = 0; i < 5; i++) step()
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
      '~/styles/segmentControl.scss?inline': { default: '' },
      '~/styles/segmentLiquidIndicator.scss?inline': { default: '' },
      '~/styles/sendButton.scss?inline': { default: '' },
      '~/styles/skeleton.scss?inline': { default: '' },
      '~/styles/loadingRing.scss?inline': { default: '' },
      '~/utils/bewlyWidescreen/constants': constants,
      '~/utils/bewlyWidescreen/styles/cardLayout': await import('../src/utils/bewlyWidescreen/styles/cardLayout'),
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

  check('playback info: the viewer count reads at the end of the meta line, follows the native count and leaves on cleanup', async () => {
    const constants = await import('../src/utils/bewlyWidescreen/constants')
    const session = { current: null }
    const module = await loadSourceModule('../src/utils/bewlyWidescreen/videoInfo.ts', {
      '~/components/MomentCard/utils': {},
      '~/utils/coverField': {},
      '~/utils/imageTone': {},
      '~/utils/playbackVideoInfo': {},
      '~/utils/pgcEpisode': {},
      '~/utils/bewlyWidescreen/constants': constants,
      '~/utils/bewlyWidescreen/labels': { t: key => key },
      '~/utils/bewlyWidescreen/nativeDom': {},
      '~/utils/bewlyWidescreen/session': { session },
      '~/utils/bilibiliApiError': {},
      '~/utils/bilibiliUrl': {},
      '~/utils/dataFormatter': {},
      '~/utils/messaging': {},
      '~/utils/videoMetadataBridge': { isPgcPlaybackPage: () => false },
    }, { MutationObserver: globalThis.MutationObserver ?? window.MutationObserver })
    const sendingArea = document.body.appendChild(document.createElement('div'))
    const viewerInfo = sendingArea.appendChild(document.createElement('div'))
    viewerInfo.className = 'bpx-player-video-info'
    const online = viewerInfo.appendChild(document.createElement('div'))
    online.className = 'bpx-player-video-info-online'
    online.innerHTML = '<span class="bpx-player-video-info-online-num">4</span>人正在看'
    const metadataSlot = document.createElement('div')
    metadataSlot.append(document.createElement('div'))
    const state = { danmakuSemanticsSource: sendingArea, metadataSlot }
    session.current = state
    const label = () => metadataSlot.querySelector('.bewly-widescreen-viewers__label')?.textContent

    module.syncViewerCount(state)
    assert.ok(metadataSlot.lastElementChild.classList.contains('bewly-widescreen-viewers'))
    assert.equal(label(), '4人正在看')
    assert.ok(viewerInfo.hasAttribute(constants.VIEWER_COUNT_MIRRORED_ATTRIBUTE), 'the card hides the pill only while the meta line shows it')

    // The metadata clone is replaced whenever its text changes.
    metadataSlot.prepend(document.createElement('div'))
    module.syncViewerCount(state)
    assert.ok(metadataSlot.lastElementChild.classList.contains('bewly-widescreen-viewers'))
    assert.equal(metadataSlot.querySelectorAll('.bewly-widescreen-viewers').length, 1)

    online.firstElementChild.textContent = '12'
    await new Promise(resolve => setTimeout(resolve, 0))
    assert.equal(label(), '12人正在看', 'native count updates reach the meta line')

    online.textContent = ''
    await new Promise(resolve => setTimeout(resolve, 0))
    assert.equal(metadataSlot.querySelector('.bewly-widescreen-viewers'), null, 'an empty count leaves the meta line')
    assert.equal(viewerInfo.hasAttribute(constants.VIEWER_COUNT_MIRRORED_ATTRIBUTE), false)

    online.textContent = '7人正在看'
    await new Promise(resolve => setTimeout(resolve, 0))
    assert.equal(label(), '7人正在看')
    module.clearViewerCount(state)
    assert.equal(metadataSlot.querySelector('.bewly-widescreen-viewers'), null)
    assert.equal(viewerInfo.hasAttribute(constants.VIEWER_COUNT_MIRRORED_ATTRIBUTE), false)
    online.textContent = '9人正在看'
    await new Promise(resolve => setTimeout(resolve, 0))
    assert.equal(metadataSlot.querySelector('.bewly-widescreen-viewers'), null, 'cleanup disconnects the observer')
    sendingArea.remove()
  })

  check('playback info: the cloned meta line drops the reprint notice, gives every item an icon and follows late-filled icons', async () => {
    const constants = await import('../src/utils/bewlyWidescreen/constants')
    const session = { current: null }
    const native = document.body.appendChild(document.createElement('div'))
    native.className = 'video-info-meta'
    native.innerHTML = [
      '<div class="video-info-detail-list">',
      '<div class="view item"><svg class="view-icon"></svg><div class="view-text">9.7万</div></div>',
      '<div class="pubdate-ip item"><div class="pubdate-ip-text">2026-10-20 23:30:00</div></div>',
      '<div class="video-argue item"><div class="video-argue-inner"><svg class="remark-icon"></svg><div class="argue-text">含AI生成内容</div></div></div>',
      '<div class="video-argue item"><div class="video-argue-inner"><div class="argue-text">其他声明</div></div></div>',
      '<div class="copyright item"><svg class="copyright-icon"></svg><div class="copyright-text">未经作者授权，禁止转载</div></div>',
      '</div>',
    ].join('')
    const module = await loadSourceModule('../src/utils/bewlyWidescreen/videoInfo.ts', {
      '~/components/MomentCard/utils': {},
      '~/utils/coverField': {},
      '~/utils/imageTone': {},
      '~/utils/playbackVideoInfo': {},
      '~/utils/pgcEpisode': {},
      '~/utils/bewlyWidescreen/constants': constants,
      '~/utils/bewlyWidescreen/labels': { t: key => key },
      '~/utils/bewlyWidescreen/nativeDom': { findMovable: () => native },
      '~/utils/bewlyWidescreen/session': { session },
      '~/utils/bilibiliApiError': {},
      '~/utils/bilibiliUrl': { normalizeBilibiliImageUrl: src => src },
      '~/utils/dataFormatter': {},
      '~/utils/messaging': {},
      '~/utils/videoMetadataBridge': { isPgcPlaybackPage: () => false },
    }, { MutationObserver: globalThis.MutationObserver ?? window.MutationObserver })
    const metadataSlot = document.createElement('div')
    const state = { metadataSlot, navigationPending: false }
    session.current = state
    try {
      assert.equal(module.syncVideoMetadata(state), true)
      const items = [...metadataSlot.querySelectorAll('.item')]
      assert.deepEqual(items.map(item => item.className), ['view item', 'pubdate-ip item', 'video-argue item', 'video-argue item'])
      assert.equal(metadataSlot.querySelector('.copyright'), null, 'the reprint notice leaves the meta line')
      assert.ok(native.querySelector('.copyright'), 'the native notice stays in place')
      for (const item of items)
        assert.ok(item.querySelector('svg, .bewly-widescreen-metadata-icon'), `${item.textContent} leads with an icon`)
      assert.equal(items[1].firstElementChild.className, 'i-tabler:clock bewly-widescreen-metadata-icon')
      assert.equal(items[3].firstElementChild.className, 'i-tabler:info-circle bewly-widescreen-metadata-icon')
      assert.equal(items[1].firstElementChild.getAttribute('aria-hidden'), 'true')
      assert.equal(items[0].querySelectorAll('.bewly-widescreen-metadata-icon').length, 0, 'native icons are kept, not doubled')
      assert.equal(native.querySelectorAll('.bewly-widescreen-metadata-icon').length, 0, 'the native line is not touched')

      // Bilibili renders the icon boxes first and fills their paths later. The
      // clone follows, and the mirrored viewer count stays last.
      const viewers = metadataSlot.appendChild(document.createElement('span'))
      viewers.className = 'bewly-widescreen-viewers item'
      const clone = metadataSlot.firstElementChild
      assert.equal(clone.querySelector('.view-icon').childElementCount, 0)
      native.querySelector('.view-icon').innerHTML = '<path d="M0 0h1v1z"></path>'
      await new Promise(resolve => setTimeout(resolve, 0))
      assert.notEqual(metadataSlot.firstElementChild, clone, 'a late-filled icon refreshes the clone')
      assert.equal(metadataSlot.querySelector('.view-icon').childElementCount, 1)
      assert.equal(metadataSlot.lastElementChild, viewers)
      assert.equal(metadataSlot.querySelector('.copyright'), null)

      // Mid-navigation the native line still shows the old video.
      state.navigationPending = true
      const settled = metadataSlot.firstElementChild
      native.querySelector('.view-text').textContent = '10万'
      await new Promise(resolve => setTimeout(resolve, 0))
      assert.equal(metadataSlot.firstElementChild, settled)
      state.navigationPending = false

      module.clearVideoMetadataObserver(state)
      native.querySelector('.view-text').textContent = '11万'
      await new Promise(resolve => setTimeout(resolve, 0))
      assert.equal(metadataSlot.firstElementChild, settled, 'cleanup disconnects the observer')
      assert.equal(state.metadataSource, undefined)
    }
    finally {
      session.current = null
      native.remove()
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
    const { getNotificationBadgeCounts, getNotificationCounts } = await import('../src/utils/notificationBadge')
    const message = { reply: 3, at: 2, like: 8, recv_like: 9, sys_msg: 1, chat: 90 }
    const dm = { follow_unread: 4, unfollow_unread: 5 }
    assert.equal(getNotificationCounts(message, dm).total, 24)
    assert.equal(getNotificationCounts(message, { follow_unread: 0 }).privateMessages, 0, 'one present group suppresses legacy fallback')
    assert.equal(getNotificationBadgeCounts({ showReplyNotificationReminder: false }, message, dm).reply, 0)
    assert.equal(getNotificationCounts(message, dm).reply, 3, 'category facts survive disabled badge reminders')
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
