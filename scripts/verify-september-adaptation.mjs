import assert from 'node:assert/strict'

import { loadSourceFunctions } from './sourceFunctionHarness'
import { loadSourceModule } from './sourceModuleHarness'

function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

export function registerSeptemberAdaptationChecks(check, { Vue, flush, compileComponent }) {
  check('September runtime boot: first load marks healthy; cancelled or failed bootstrap never does', async () => {
    const policy = await import('../src/utils/settingsBootPolicy')
    for (const scenario of ['native', 'mounted', 'cancelled', 'failed']) {
      const ready = deferred()
      const prompt = document.body.appendChild(document.createElement('div'))
      prompt.id = 'bewlycat-refresh-required'
      prompt.dataset.promptVersion = '0.1.1'
      prompt.dataset.runtimeUrl = 'chrome-extension://fixture/'
      const calls = []
      const noops = Object.fromEntries(['applySettingsDependentPageStyles', 'applyEffectiveTopBarSource', 'ensureResponsiveViewport', 'captureOriginalBilibiliTopBar', 'ensureHomePageHiddenStyle', 'syncHomePageHiddenStyleScope', 'initVideoAspectRatioMemory', 'initVideoScreenshotControl', 'scheduleAddWatchLaterButton', 'initTouchPlayerGestures', 'syncFavoriteDialogLifecycle', 'initNativeFavoriteSeasonPlayAllIntercept', 'removeHomePageHiddenStyle'].map(name => [name, () => calls.push(name)]))
      const context = await loadSourceFunctions('../src/contentScripts/index.ts', ['onDOMLoaded', 'markContentScriptHealthy'], {
        ...noops,
        ...policy,
        document,
        settingsReady: ready.promise,
        settingsInitializationState: { value: 'loaded' },
        contentScriptSignal: { aborted: scenario === 'cancelled' },
        contentScriptReady: false,
        settingsBootLoaded: false,
        mountedVueApp: null,
        contentScriptGlobal: {},
        settings: { value: {} },
        isInIframe: () => false,
        isHomePage: () => true,
        isSupportedPages: () => scenario !== 'native',
        isSupportedIframePages: () => false,
        isIframeDrawerHost: () => false,
        isVideoOrBangumiPage: () => false,
        resolveEffectiveTopBarSource: () => 'bewly',
        injectApp: () => {
          if (scenario === 'failed')
            throw new Error('fixture mount failure')
          context.mountedVueApp = {}
        },
        restoreOriginalPageVisibility: () => calls.push('restore'),
        pageLoading: { dispose: () => calls.push('dispose') },
        isExtensionContextInvalidatedError: () => false,
        console: { error() {} },
        browser: { runtime: { getManifest: () => ({ version: '0.1.1' }), getURL: () => 'chrome-extension://fixture/' } },
      })
      const pending = context.onDOMLoaded()
      assert.equal(context.contentScriptReady, false)
      ready.resolve()
      await pending
      const succeeded = scenario === 'native' || scenario === 'mounted'
      assert.equal(context.contentScriptReady, succeeded)
      assert.equal(prompt.isConnected, !succeeded, 'healthy completion removes a queued startup warning without a SPA navigation')
      if (scenario === 'failed')
        assert.ok(calls.includes('restore'))
      prompt.remove()
    }
  })

  check('September settings: ACK retains references and later edits; deleted fields stay deleted', async () => {
    const protocol = await import('../src/utils/settingsStorageProtocol')
    const listeners = new Set()
    const writes = []
    let stored = { mode: 1, nested: { stable: ['a'], changed: 1 }, extra: true }
    const module = await loadSourceModule('../src/composables/useSettingsStorage.ts', {
      'vue': Vue,
      'webextension-polyfill': { default: { storage: { onChanged: { addListener: fn => listeners.add(fn), removeListener: fn => listeners.delete(fn) } } } },
      '~/utils/sidebarCoverSettings': await import('../src/utils/sidebarCoverSettings'),
      '~/utils/settingsStorageProtocol': protocol,
      '~/utils/messaging': { isExtensionContextInvalidatedError: () => false, sendMessage: (name, body) => {
        if (name === protocol.SETTINGS_STORAGE_READ_MESSAGE)
          return Promise.resolve({ accepted: true, epoch: 'a', revision: 0, storedValue: JSON.stringify(stored) })
        const request = deferred()
        writes.push({ ...request, body })
        return request.promise
      } },
    }, { crypto: { randomUUID: () => 'test' }, structuredClone })
    const scope = Vue.effectScope()
    const settings = scope.run(() => module.useSettingsStorage({ mode: 1, nested: { stable: ['a'], changed: 1 } }))
    try {
      await flush()
      const root = settings.value
      const nested = root.nested
      const stable = nested.stable
      let notifications = 0
      scope.run(() => Vue.watch(() => settings.value.nested.stable, () => notifications++, { flush: 'sync' }))
      settings.value.mode = 2
      settings.value.mode = 3
      stored = { mode: 2, nested: { stable: ['a'], changed: 2 } }
      writes[0].resolve({ accepted: true, epoch: 'a', revision: 1, storedValue: JSON.stringify(stored) })
      await flush()
      assert.equal(settings.value, root)
      assert.equal(settings.value.nested, nested)
      assert.equal(settings.value.nested.stable, stable)
      assert.equal(settings.value.nested.changed, 2)
      assert.equal(settings.value.mode, 3)
      assert.equal('extra' in settings.value, false)
      assert.equal(notifications, 0)
      assert.equal(writes.length, 2)
      writes[1].resolve({ accepted: true, epoch: 'a', revision: 2, storedValue: JSON.stringify({ ...stored, mode: 3 }) })
      await settings.flush()
      assert.equal(notifications, 0)
    }
    finally { scope.stop() }
  })

  check('September auth: fetch/body timeout and cancellation release single-flight', async () => {
    const requests = []
    const timers = new Map()
    let timerId = 0
    const tokens = Vue.ref({ accessToken: 'old', refreshToken: 'refresh', lastUpdatedAt: 1, accessTokenExpiresAt: 0 })
    const module = await loadSourceModule('../src/utils/authProvider.ts', {
      'webextension-polyfill': { default: { storage: { local: { get: async () => ({ appAuthTokens: { ...tokens.value } }) } } } },
      '~/logic/appAuthStorage': { appAuthTokens: tokens, defaultAppAuthTokens: {}, resetAppAuthTokens() {} },
      './appAuthTokenPolicy': await import('../src/utils/appAuthTokenPolicy'),
      './appSign': { appSign: () => 'signed' },
    }, {
      AbortController,
      DOMException: window.DOMException,
      URLSearchParams,
      setTimeout: (callback) => {
        timers.set(++timerId, callback)
        return timerId
      },
      clearTimeout: id => timers.delete(id),
      fetch: (_url, init) => {
        const response = deferred()
        init.signal.addEventListener('abort', () => response.reject(init.signal.reason), { once: true })
        requests.push({ ...response, init })
        return response.promise
      },
    })
    const controller = new AbortController()
    const qr = module.getTVLoginQRCode(controller.signal)
    controller.abort()
    await assert.rejects(qr)
    assert.equal(timers.size, 0)
    const pendingBody = module.getTVLoginQRCode()
    const current = requests.at(-1)
    current.resolve({ ok: true, json: () => new Promise((_resolve, reject) => current.init.signal.addEventListener('abort', () => reject(current.init.signal.reason), { once: true })) })
    await flush()
    for (const callback of [...timers.values()]) callback()
    await assert.rejects(pendingBody)
    assert.equal(timers.size, 0)
    const a = module.refreshInvalidAppAccessToken()
    const b = module.refreshInvalidAppAccessToken()
    await flush()
    assert.equal(requests.length, 3)
    requests.at(-1).resolve({ ok: true, json: async () => ({ code: -1 }) })
    await flush()
    requests.at(-1).resolve({ ok: true, json: async () => ({ code: -1 }) })
    await Promise.all([a, b])
    const next = module.refreshInvalidAppAccessToken()
    await flush()
    assert.equal(requests.length, 5)
    requests.at(-1).resolve({ ok: true, json: async () => ({ code: 0, data: { token_info: { access_token: 'new', expires_in: 3600 } } }) })
    assert.equal(await next, true)
    assert.equal(tokens.value.accessToken, 'new')
    assert.equal(timers.size, 0)
  })

  check('September comment graph: shared missing parent, known chain, late real parent and reset', async () => {
    const { buildMomentCommentThread } = await import('../src/components/MomentCard/commentThreadLayout')
    const comment = (id, parentRpid = '') => ({ id, rpid: id, rootRpid: '1', parentRpid, author: { id, name: id, avatar: '' }, message: id, segments: [], pictures: [], createdAt: Number(id), likeCount: 0, isLiked: false, replyCount: 0, replies: [] })
    const root = comment('1')
    const replies = [comment('4', '3'), comment('5', '3')]
    let nodes = buildMomentCommentThread(root, replies, [comment('3', '2')])
    assert.equal(nodes.filter(node => node.missing?.rpid === '3').length, 1)
    assert.equal(nodes.find(node => node.layout.id === '3').layout.parentId, '2')
    assert.equal(nodes.find(node => node.layout.id === '2').missing.authorName, null)
    nodes = buildMomentCommentThread(root, [...replies, comment('3', '1')])
    assert.equal(nodes.filter(node => node.layout.id === '3').length, 1)
    assert.equal(nodes.find(node => node.layout.id === '3').missing, undefined)
    assert.equal(nodes.find(node => node.layout.id === '4').layout.parentId, '3')
    assert.equal(buildMomentCommentThread(root, []).length, 1)
  })

  check('September PGC: optional display fields do not break a page or invent a playable video', async () => {
    const { normalizeWatchLaterItem, getWatchLaterAuthor, getWatchLaterPlaybackUrl } = await import('../src/utils/watchLaterList')
    const item = normalizeWatchLaterItem({ aid: 1, is_pgc: true, bangumi: { ep_id: 123, cover: 'cover', season: { title: 'Season' } } })
    assert.equal(item.title, 'Season')
    assert.equal(item.progress, 0)
    assert.equal(getWatchLaterAuthor(item).name, 'Season')
    assert.equal(getWatchLaterAuthor(item).authorFace, 'cover')
    assert.equal(getWatchLaterPlaybackUrl(item), 'https://www.bilibili.com/bangumi/play/ep123')
    assert.equal(getWatchLaterPlaybackUrl({ ...item, state: -1 }), '')
    assert.equal(getWatchLaterPlaybackUrl({ aid: 1, is_pgc: true }), '')
    assert.equal(normalizeWatchLaterItem({ aid: -1 }), undefined)
    const bv = normalizeWatchLaterItem({ aid: 2, bvid: 'BV1ab411c7mD', owner: { mid: 8, name: 'UP', face: 'face' } })
    assert.equal(getWatchLaterAuthor(bv).authorUrl, 'https://space.bilibili.com/8')
    assert.equal(getWatchLaterPlaybackUrl(bv, true), 'https://www.bilibili.com/list/watchlater?bvid=BV1ab411c7mD')
    assert.equal(getWatchLaterPlaybackUrl({ ...bv, bangumi: {} }, true), getWatchLaterPlaybackUrl(bv, true))
    assert.equal(getWatchLaterPlaybackUrl({ ...bv, redirect_url: 'https://www.bilibili.com/unknown/123' }), '')
    assert.equal(normalizeWatchLaterItem({ aid: 3, owner: { name: {}, face: null } }).owner.name, '')
  })

  check('September forward content: edited names lose mention identity; text emotes remain text', async () => {
    const { parseMomentForwardTokens, normalizeMomentForwardEmotePackages, serializeMomentForwardContents, findMomentForwardCompletion } = await import('../src/components/MomentCard/momentForwardContent')
    const mentions = [{ type: 'mention', text: '@UP', mid: '123' }]
    assert.ok(parseMomentForwardTokens('@UP @UPX email@UP', [], mentions).filter(token => token.type === 'mention').length === 1)
    assert.equal(parseMomentForwardTokens('@UPX @UP ', [], mentions).find(token => token.type === 'mention').mid, '123')
    assert.equal(parseMomentForwardTokens('@UP', [], [{ ...mentions[0], mid: '0' }]).some(token => token.type === 'mention'), false)
    assert.equal(findMomentForwardCompletion('text @U', 7).query, 'U')
    assert.equal(findMomentForwardCompletion('email@U', 7), null)
    const emote = normalizeMomentForwardEmotePackages({ data: { packages: [{ id: 1, type: 4, emote: [{ id: 2, text: '(^_^)' }] }] } })[0].emotes[0]
    assert.equal(emote.type, 4)
    assert.equal(serializeMomentForwardContents(parseMomentForwardTokens(emote.text, []))[0].type, 1)
  })

  check('September submission search: draft/committed query, collaborative author and stale account/UP responses', async () => {
    const requests = []
    const account = Vue.ref(1)
    const uploader = Vue.ref(10)
    const settings = Vue.ref({ followingFilterChargingVideos: false })
    const module = await loadSourceModule('../src/contentScripts/views/Home/following/useFollowingVideoSearch.ts', {
      'vue': Vue,
      '~/logic': { settings },
      '~/utils/api': { default: { user: {
        getUserVideos: (params) => {
          const request = deferred()
          requests.push({ ...request, params })
          return request.promise
        },
        getUserCard: async () => { assert.fail('known author face should be reused') },
      } } },
      '~/utils/dataFormatter': { parseStatNumber: Number },
      '~/utils/favoriteAvatar': await import('../src/utils/favoriteAvatar'),
      '~/utils/htmlDecode': { decodeHtmlEntities: value => value },
    })
    const scope = Vue.effectScope()
    const state = { ref: (_key, value) => Vue.ref(value), isCurrent: () => true }
    const search = scope.run(() => module.useFollowingVideoSearch(state, () => account.value, () => uploader.value, mid => ({ mid, face: 'known' })))
    const response = aid => ({ code: 0, data: { list: { vlist: [{ aid, bvid: 'BV1ab411c7mD', mid: 20, author: 'Collaborator', title: '<em>A</em>', pic: 'cover', created: 1 }] }, page: { ps: 30, count: 60 } } })
    try {
      search.draft.value = 'old'
      const old = search.submit()
      search.draft.value = 'new'
      const latest = search.submit()
      requests[1].resolve(response(2))
      await latest
      requests[0].resolve(response(1))
      await old
      assert.equal(search.items.value[0].id, 2)
      assert.equal(search.items.value[0].sourceUploaderMid, 10)
      assert.equal(search.items.value[0].author.mid, 20)
      search.draft.value = 'unsubmitted'
      const more = search.load()
      assert.equal(requests[2].params.keyword, 'new')
      assert.equal(requests[2].params.pn, 2)
      uploader.value = 11
      requests[2].resolve(response(3))
      await more
      assert.equal(search.items.value.length, 0)
      search.draft.value = 'last'
      const stale = search.submit()
      account.value = 2
      requests[3].resolve(response(4))
      await stale
      assert.equal(search.items.value.length, 0)
    }
    finally { scope.stop() }
  })

  check('September completion focus: manual topic picker focuses input; inline completion retains the editor', async () => {
    const Picker = await compileComponent('../src/components/MomentCard/MomentForwardTopicPicker.vue', {
      '~/utils/api': { default: { moment: {} } },
      './momentForwardContent': await import('../src/components/MomentCard/momentForwardContent'),
    })
    const editor = document.body.appendChild(document.createElement('textarea'))
    for (const autofocus of [undefined, false]) {
      editor.focus()
      const host = document.body.appendChild(document.createElement('div'))
      const app = Vue.createApp(Picker, { content: '', searchPlaceholder: 'topic', emptyLabel: 'empty', retryLabel: 'retry', errorLabel: 'failed', ...(autofocus === false ? { autofocus } : {}) })
      app.config.globalProperties.$t = key => key
      try {
        app.mount(host)
        await flush()
        assert.equal(document.activeElement, autofocus === false ? editor : host.querySelector('input'))
      }
      finally {
        app.unmount()
        host.remove()
      }
    }
    editor.remove()
    const state = Vue.reactive({ status: 'editing', tokens: [], selectedTopic: null })
    const Composer = await compileComponent('../src/components/MomentCard/MomentForwardComposer.vue', {
      'vue-i18n': { useI18n: () => ({ t: key => key }) },
      'vue-toastification': { useToast: () => ({ error() {}, success() {} }) },
      '~/stores/topBarStore': { useTopBarStore: () => ({ isLogin: true, userInfo: { mid: 1 } }) },
      './momentForwardContent': await import('../src/components/MomentCard/momentForwardContent'),
      './MomentForwardTopicPicker.vue': { default: Picker },
      './MomentForwardEmojiPicker.vue': { default: { render: () => null } },
      './useMomentForwardComposer': { useMomentForwardComposer: () => ({ state, beginEditing() {}, invalidate() {}, setTokens: (tokens) => { state.tokens = tokens }, selectTopic() {}, clearTopic() {}, submit: () => assert.fail('focus interactions cannot send') }) },
    })
    const host = document.body.appendChild(document.createElement('div'))
    const app = Vue.createApp(Composer, { moment: { id: '1' }, active: true })
    try {
      app.mount(host)
      const button = [...host.querySelectorAll('button')].find(item => item.textContent.includes('moment_card.forward_select_topic'))
      button.focus()
      button.click()
      await flush()
      const input = host.querySelector('.moment-forward-topic-picker input')
      assert.equal(document.activeElement, input)
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
      await flush()
      assert.equal(host.querySelector('.moment-forward-topic-picker'), null)
      assert.equal(document.activeElement, host.querySelector('textarea'), 'Escape returns to the live draft without scrolling or submitting')
    }
    finally {
      app.unmount()
      host.remove()
    }
  })

  check('September screenshot: A frame keeps A name after navigation; shared busy and URL cleanup', async () => {
    const captures = []
    const downloads = []
    const notices = []
    const released = []
    const timers = []
    const a = { readyState: 2, videoWidth: 1280, videoHeight: 720, currentTime: 1.5, currentSrc: 'A' }
    let media = a
    let title = 'Video A'
    let encode
    const location = { href: 'https://www.bilibili.com/video/A' }
    const module = await loadSourceModule('../src/utils/videoScreenshot.ts', {
      'vue': Vue,
      '~/logic': { settings: Vue.ref({ language: 'en', videoScreenshotShortcut: 'Shift+S' }) },
      '~/utils/i18n': { i18n: { global: { t: key => key } } },
      '~/utils/player': { showState: text => notices.push(text) },
      '~/utils/playerMedia': { getVideoElement: () => media },
      '~/utils/videoScreenshotShortcut': await import('../src/utils/videoScreenshotShortcut'),
    }, {
      location,
      URL: { createObjectURL: () => 'blob:screenshot', revokeObjectURL: url => released.push(url) },
      setTimeout: callback => timers.push(callback),
      HTMLMediaElement: window.HTMLMediaElement,
      document: {
        querySelector: () => ({ getAttribute: () => title }),
        body: { appendChild() {} },
        createElement: tag => tag === 'canvas'
          ? { getContext: () => ({ drawImage: video => captures.push(video) }), toBlob: (callback) => { encode = callback } }
          : { click() { downloads.push(this.download) }, remove() {} },
      },
    })
    const capture = module.captureVideoScreenshot()
    await module.captureVideoScreenshot()
    assert.equal(captures.length, 1)
    assert.equal(captures[0], a)
    media = { ...a, currentSrc: 'B' }
    title = 'Video B'
    location.href = 'https://www.bilibili.com/video/B'
    encode(new Blob(['png']))
    await capture
    assert.equal(downloads[0], 'Video A_00-00-01-500.png')
    assert.equal(notices.length, 0)
    assert.equal(module.videoScreenshotBusy.value, false)
    timers.forEach(run => run())
    assert.deepEqual(released, ['blob:screenshot'])
    const typing = new KeyboardEvent('keydown', { key: 'S', shiftKey: true, cancelable: true })
    Object.defineProperty(typing, 'composedPath', { value: () => [document.createElement('textarea')] })
    module.handleVideoScreenshotShortcut(typing)
    assert.equal(captures.length, 1)
    module.handleVideoScreenshotShortcut(new KeyboardEvent('keydown', { key: 'S', shiftKey: true, isComposing: true }))
    assert.equal(captures.length, 1)
  })

  check('September gesture: drag, long press and cleared selection do not navigate; modifiers/keyboard survive', async () => {
    const { createPointerNavigationGuard } = await import('../src/utils/linkNavigation')
    const element = document.body.appendChild(document.createElement('div'))
    element.textContent = 'select me'
    const guard = createPointerNavigationGuard(() => element)
    const pointer = (type, time, x = 0) => ({ type, timeStamp: time, clientX: x, clientY: 0, pointerId: 1, button: 0, isPrimary: true })
    const click = options => new MouseEvent('click', { detail: 1, cancelable: true, ...options })
    try {
      guard.down(pointer('pointerdown', 0))
      guard.move(pointer('pointermove', 10, 20))
      guard.end(pointer('pointerup', 20, 20))
      assert.equal(guard.prevent(click()), true)
      assert.equal(guard.prevent(click({ ctrlKey: true })), false)
      assert.equal(guard.prevent(click({ button: 1 })), false)
      assert.equal(guard.prevent(click({ detail: 0 })), false)
      guard.down(pointer('pointerdown', 100))
      guard.end(pointer('pointerup', 700))
      assert.equal(guard.prevent(click()), true)
      const range = document.createRange()
      range.selectNodeContents(element)
      window.getSelection().removeAllRanges()
      window.getSelection().addRange(range)
      assert.equal(window.getSelection().toString(), 'select me')
      guard.down(pointer('pointerdown', 1000))
      window.getSelection().removeAllRanges()
      guard.end(pointer('pointerup', 1010))
      assert.equal(guard.prevent(click()), true)
      guard.down(pointer('pointerdown', 1100))
      guard.end(pointer('pointerup', 1110))
      assert.equal(guard.prevent(click()), false)
    }
    finally {
      element.remove()
      window.getSelection().removeAllRanges()
    }
  })

  check('September metadata: whole tags only; equal updates reuse measurements; time leads both templates', async () => {
    const frames = []
    let resized
    let measured = 0
    const module = await loadSourceModule('../src/components/VideoCard/directives/wholeMeta.ts', {}, {
      ResizeObserver: class { constructor(callback) { resized = callback } observe() {} unobserve() {} disconnect() {} },
      requestAnimationFrame: callback => frames.push(callback),
      cancelAnimationFrame() {},
    })
    const row = document.body.appendChild(document.createElement('div'))
    const children = ['time', 'tag', 'hint'].map((text) => {
      const child = row.appendChild(document.createElement('span'))
      child.textContent = text
      return child
    })
    let width = 70
    Object.defineProperty(row, 'clientWidth', { get: () => width })
    children.forEach((child, index) => {
      Object.defineProperty(child, 'offsetWidth', { get: () => {
        measured++
        return 40
      } })
      Object.defineProperty(child, 'offsetTop', { get: () => width > 150 ? 0 : index * 24 })
    })
    module.vWholeMeta.mounted(row, { value: 'font' })
    frames.shift()()
    assert.equal(children[0].style.visibility, '')
    assert.equal(children[1].style.visibility, 'hidden')
    const initial = measured
    for (let index = 0; index < 100; index++) module.vWholeMeta.updated(row, { value: 'font' })
    assert.equal(frames.length, 0)
    assert.equal(measured, initial)
    width = 200
    resized([{ target: row }])
    frames.shift()()
    assert.ok(children.every(child => child.style.visibility === ''))
    Object.defineProperties(children[1], { scrollWidth: { value: 100 }, clientWidth: { value: 40 } })
    module.vWholeMeta.updated(row, { value: 'changed font' })
    frames.shift()()
    assert.equal(children[1].style.visibility, 'hidden', 'an internally clipped tag is hidden as a whole')
    module.vWholeMeta.beforeUnmount(row)
    row.remove()

    const blank = { render: () => null }
    const Component = await compileComponent('../src/components/VideoCard/components/VideoCardInfo.vue', {
      '~/logic': { settings: Vue.ref({ showVideoCardPublishTime: true, showVideoCardVideoTag: true, showVideoCardRecommendTag: true }) },
      '~/utils/dataFormatter': { calcTimeSince: () => 'TIME', numFormatter: String },
      '../../VideoWatchedTag.vue': { default: blank },
      '../directives/wholeMeta': { vWholeMeta: {} },
      '../tagPolicy': await import('../src/components/VideoCard/tagPolicy'),
      '../utils': { getTagSearchUrl: () => '#' },
      '../VideoCardAuthor/components/VideoCardAuthorAvatar.vue': { default: blank },
      '../VideoCardAuthor/components/VideoCardAuthorName.vue': { default: blank },
    })
    for (const layout of ['modern', 'old']) {
      const host = document.body.appendChild(document.createElement('div'))
      const app = Vue.createApp(Component, { layout, hideAuthor: true, video: { title: 'Title', publishedTimestamp: 1, tag: 'Tag', threePointV2: [] }, highlightTags: ['Hint'], moreBtn: false, showVideoOptions: false, titleFontSizeClass: '', titleStyle: {}, authorFontSizeClass: '', metaFontSizeClass: '', metaStyle: {} })
      app.mount(host)
      assert.equal(host.querySelector('.video-card-meta-row').firstElementChild.textContent.trim(), 'TIME')
      app.unmount()
      host.remove()
    }
    console.log(`PERF metadata fixture: 100 equal updates = 0 extra measurements; initial ${initial} width reads`)
  })

  check('September refresh: startup, finite timeout, same-URL cancellation and stable prompt buttons', async () => {
    const constants = await import('../src/constants/contentScript')
    const timers = new Map()
    const injections = []
    let timerId = 0
    let response = async () => ({ type: constants.CONTENT_SCRIPT_PONG, name: 'Bewly Nocturne', runtimeUrl: 'chrome-extension://fixture/', version: '0.1.1', commit: 'different', phase: 'ready' })
    const url = 'https://www.bilibili.com/'
    const extension = {
      runtime: { getManifest: () => ({ name: 'Bewly Nocturne', version: '0.1.1' }), getURL: () => 'chrome-extension://fixture/' },
      tabs: { get: async () => ({ active: true, status: 'complete', url }), sendMessage: () => response() },
      storage: { local: { get: async () => ({ settings: { language: 'en' } }) } },
      i18n: { getUILanguage: () => 'en' },
      scripting: { executeScript: async (request) => {
        injections.push(request)
        return []
      } },
    }
    const timing = { timeOrigin: 1 }
    const module = await loadSourceModule('../src/background/contentScriptRefreshPrompt.ts', {
      'webextension-polyfill': { default: extension },
      '~/constants/contentScript': { ...constants, CONTENT_SCRIPT_COMMIT: 'expected' },
      '~/constants/refreshTabs': await import('../src/constants/refreshTabs'),
      '~/enums/appEnums': await import('../src/enums/appEnums'),
    }, {
      performance: timing,
      location: { href: url, reload() {} },
      matchMedia: () => ({ matches: false }),
      setTimeout: (callback, delay) => {
        const id = ++timerId
        if (delay < 2000)
          queueMicrotask(callback)
        else timers.set(id, callback)
        return id
      },
      clearTimeout: id => timers.delete(id),
    })
    assert.equal(await module.promptContentScriptRefresh(1, extension), 'already-injected', 'Git difference alone never requires a refresh')
    assert.equal(injections.length, 0)
    let attempts = 0
    const healthy = response
    response = async () => ({ ...await healthy(), phase: ++attempts < 3 ? 'starting' : 'ready' })
    assert.equal(await module.promptContentScriptRefresh(1, extension), 'already-injected')
    assert.equal(attempts, 3)
    let current = true
    const pending = deferred()
    response = () => pending.promise
    const obsolete = module.promptContentScriptRefresh(1, extension, () => current)
    await flush()
    current = false
    pending.resolve(await healthy())
    assert.equal(await obsolete, 'ineligible')
    assert.equal(injections.length, 0)
    response = () => new Promise(() => {})
    const timeout = module.promptContentScriptRefresh(1, extension)
    for (let attempt = 0; attempt < 3; attempt++) {
      for (let turn = 0; turn < 10 && timers.size === 0; turn++) await flush()
      const callback = [...timers.values()][0]
      assert.ok(callback)
      callback()
      await flush()
    }
    assert.equal(await timeout, 'refresh-prompted')
    assert.equal(timers.size, 0)
    assert.equal(injections[0].args[0].reason, 'unreachable')
    const request = injections[0]
    request.func(...request.args)
    const prompt = document.getElementById('bewlycat-refresh-required')
    const button = prompt.shadowRoot.querySelector('button.primary')
    request.func({ ...request.args[0], reason: 'identity-mismatch', reasonDescription: 'identity changed' }, ...request.args.slice(1))
    assert.equal(prompt.shadowRoot.querySelector('button.primary'), button)
    assert.equal(prompt.shadowRoot.querySelector('.description').textContent, 'identity changed')
    prompt.remove()
    timing.timeOrigin = request.args[2] + 1
    request.func(...request.args)
    assert.equal(document.getElementById('bewlycat-refresh-required'), null, 'injection queued for an older same-URL document is ignored')
  })

  check('September scroll: intent versions survive zero movement and release on interruption/end', async () => {
    const { scrollToPosition, getScrollIntent, cancelScrollIntent } = await import('../src/utils/scrollIntent')
    const root = document.body.appendChild(document.createElement('div'))
    const calls = []
    root.scrollTop = 300
    root.scrollTo = options => calls.push(options)
    scrollToPosition(root, 0, 'smooth')
    const first = getScrollIntent(root)
    assert.equal(first.active, true)
    root.dispatchEvent(new Event('wheel'))
    assert.equal(getScrollIntent(root).active, false)
    assert.ok(getScrollIntent(root).version > first.version)
    scrollToPosition(root, 0, 'smooth')
    root.dispatchEvent(new Event('scrollend'))
    assert.equal(getScrollIntent(root).active, false)
    const before = getScrollIntent(root).version
    scrollToPosition(root, root.scrollTop)
    assert.ok(getScrollIntent(root).version > before, 'explicit zero-distance restore invalidates a queued old anchor')
    assert.equal(calls.length, 2)
    cancelScrollIntent(root)
    root.remove()
  })

  check('September relations serializer: only fids commas remain literal', async () => {
    const module = await loadSourceModule('../src/background/messageListeners/api/user.ts', { '../../utils': { AHS: { J_D: [] } } }, { URLSearchParams })
    const serialize = module.default.getRelations._fetch.querySerializer
    assert.equal(serialize(new URLSearchParams({ fids: '1,2&3', other: 'a,b&c' })), 'fids=1,2%263&other=a%2Cb%26c')
    assert.equal(module.default.getUserInfo._fetch.querySerializer, undefined)
  })

  check('September default search: cross-tab request coalescing is scoped to the authenticated request', async () => {
    const requests = []
    let mid = '1'
    let stored = {}
    const dependencies = {
      '~/constants/searchApi': await import('../src/constants/searchApi'),
      'webextension-polyfill': { default: {
        cookies: { get: async () => ({ value: mid }) },
        storage: { session: { get: async () => stored, set: async (value) => { stored = structuredClone(value) } } },
      } },
      '../../utils': { AHS: { J_D: [] }, doRequest: () => {
        const request = deferred()
        requests.push(request)
        return request.promise
      } },
    }
    const module = await loadSourceModule('../src/background/messageListeners/api/search.ts', dependencies)
    const load = module.default.getDefaultSearchRecommendation
    const first = load()
    const second = load()
    await flush()
    assert.equal(requests.length, 1)
    requests[0].resolve({ code: 0, data: { name: 'A', show_name: 'A', url: 'https://search.bilibili.com/all?keyword=A' } })
    await Promise.all([first, second])
    await load()
    assert.equal(requests.length, 1)
    mid = '2'
    const other = load()
    await flush()
    assert.equal(requests.length, 2)
    requests[1].resolve({ code: 0, data: { name: 'B' } })
    assert.equal((await other).data.name, 'B')
    const restarted = await loadSourceModule('../src/background/messageListeners/api/search.ts', dependencies)
    assert.equal((await restarted.default.getDefaultSearchRecommendation()).data.name, 'B')
    assert.equal(requests.length, 2, 'worker restarts retain the unexpired cross-tab cache')
  })

  check('September relations: malformed/failed reads preserve state; TTL, pinned budget and Cookie-first changes', async () => {
    const account = Vue.reactive({ isLogin: true, userInfo: { mid: 1 } })
    let cookie = '1'
    let now = 10_000
    let reply = { code: 0, data: { 10: { attribute: 2 } } }
    let queryCount = 0
    const changes = new Set()
    const module = await loadSourceModule('../src/composables/useUserRelations.ts', {
      '~/utils/messaging': { isExtensionContextInvalidatedError: () => false },
      '@vueuse/core': await import('@vueuse/core'),
      vue: Vue,
      '~/stores/topBarStore': { useTopBarStore: () => account },
      '~/utils/accountScope': await import('../src/utils/accountScope'),
      '~/utils/main': { getUserID: () => cookie },
      '~/utils/userRelation': { onUserRelationChange: (fn) => {
        changes.add(fn)
        return () => changes.delete(fn)
      } },
      '~/utils/api': { default: { user: { getRelations: async () => {
        queryCount++
        return reply
      } } } },
    }, { Date: class extends Date { static now() { return now } }, console: { error() {} } })
    const scope = Vue.effectScope()
    const state = scope.run(module.useUserRelations)
    try {
      await state.batchQueryUserRelations([10])
      const first = state.userRelations.value[10]
      now += 5 * 60_000
      reply = { code: 0, data: { unexpected: 'not a relation map' } }
      await state.batchQueryUserRelations([10])
      assert.equal(state.userRelations.value[10], first)
      assert.equal(first.isFollowing, true)
      now += 31_000
      reply = { code: -500, data: null }
      await state.batchQueryUserRelations([10])
      assert.equal(state.userRelations.value[10], first)
      const calls = queryCount
      await state.batchQueryUserRelations([10])
      assert.equal(queryCount, calls, 'failed requests have a bounded retry delay')
      now += 31_000
      reply = { code: 0, data: {} }
      const mids = Array.from({ length: 600 }, (_, index) => index + 100)
      await state.batchQueryUserRelations(mids)
      assert.equal(mids.filter(mid => state.userRelations.value[mid]).length, 600, 'active consumers remain pinned')
      state.reset()
      assert.ok(Object.keys(state.userRelations.value).length <= 512)
      const pending = deferred()
      reply = pending.promise
      const read = state.batchQueryUserRelations([2000])
      cookie = '2'
      pending.resolve({ code: 0, data: { 2000: { attribute: 2 } } })
      await read
      assert.equal(state.userRelations.value[2000], undefined)
      const before = queryCount
      await state.batchQueryUserRelations([2001])
      assert.equal(queryCount, before, 'Cookie disagreement stops requests before the store catches up')
      console.log(`PERF relations fixture: 600 pinned entries retained; released cache ${Object.keys(state.userRelations.value).length} entries`)
    }
    finally { scope.stop() }
  })

  check('September ads: hidden queues release DOM, nested candidates deduplicate and replaced roots are rediscovered', async () => {
    const hiddenDescriptor = Object.getOwnPropertyDescriptor(document, 'hidden')
    let hidden = false
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden })
    const sets = []
    const frames = new Map()
    const observed = []
    const observedRoots = new Set()
    let mutation
    let frame = 0
    const module = await loadSourceModule('../src/contentScripts/features/blockUselessFeedCards.ts', {}, {
      Set: class extends Set {
        constructor(...args) {
          super(...args)
          sets.push(this)
        }
      },
      MutationObserver: class {
        constructor(callback) { mutation = callback }
        observe(target, options) {
          observed.push({ target, options })
          observedRoots.add(target)
        }

        disconnect() { observedRoots.clear() }
      },
      requestAnimationFrame: (fn) => {
        frames.set(++frame, fn)
        return frame
      },
      cancelAnimationFrame: id => frames.delete(id),
    })
    const host = document.body.appendChild(document.createElement('section'))
    const createFeed = () => {
      const feed = document.createElement('div')
      feed.innerHTML = '<article class="feed-card"><div class="bili-video-card"><a href="https://cm.bilibili.com/ad">Ad</a></div></article>'
      return feed
    }
    let feed = host.appendChild(createFeed())
    const flushFrames = () => {
      const callbacks = [...frames.values()]
      frames.clear()
      callbacks.forEach(run => run())
    }
    try {
      assert.equal(module.shouldEnableUselessFeedCardBlocker({ blockAds: true, homePage: true, nativeHome: false }), false)
      module.setUselessFeedCardBlockerEnabled(true)
      assert.ok(feed.firstElementChild.classList.contains('bewly-blocked-feed-card'))
      mutation([{ type: 'childList', target: feed, removedNodes: [], addedNodes: [feed.firstElementChild, feed.querySelector('a')] }])
      assert.equal(sets[0].size, 1)
      hidden = true
      document.dispatchEvent(new Event('visibilitychange'))
      assert.equal(sets[0].size, 0)
      assert.equal(frames.size, 0)
      assert.equal(observedRoots.size, 0, 'hidden scanning must not retain a detached old feed root')
      const next = createFeed()
      feed.replaceWith(next)
      mutation([{ type: 'childList', target: host, removedNodes: [feed], addedNodes: [next] }])
      feed = next
      assert.equal(sets[0].size, 0)
      hidden = false
      document.dispatchEvent(new Event('visibilitychange'))
      flushFrames()
      assert.ok(feed.firstElementChild.classList.contains('bewly-blocked-feed-card'))
      assert.ok(observed.some(entry => entry.target === feed && entry.options.subtree))
      module.setUselessFeedCardBlockerEnabled(false)
      assert.equal(frames.size, 0)
      assert.equal(sets[0].size, 0)
    }
    finally {
      module.setUselessFeedCardBlockerEnabled(false)
      host.remove()
      if (hiddenDescriptor)
        Object.defineProperty(document, 'hidden', hiddenDescriptor)
      else delete document.hidden
    }
  })

  check('September following directory: 1200 members use one bounded window and retain focused DOM', async () => {
    const component = await compileComponent('../src/contentScripts/views/Home/following/FollowingSidebar.vue', {
      'vue-i18n': { useI18n: () => ({ t: key => key }) },
      '~/components/Input.vue': { default: { render: () => Vue.h('input') } },
      '~/components/SkeletonBlock.vue': { default: { render: () => null } },
      '~/composables/useCardWindow': await import('../src/composables/useCardWindow'),
      '~/utils/dataFormatter': { calcTimeSince: () => 'recent' },
      './model': await import('../src/contentScripts/views/Home/following/model'),
      './FollowingGroupActions.vue': { default: { setup: (_props, { expose }) => {
        expose({ interactionActive: false })
        return () => null
      } } },
    })
    const previousRect = HTMLElement.prototype.getBoundingClientRect
    const previousHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight')
    let scroller
    HTMLElement.prototype.getBoundingClientRect = function () {
      let top = 0
      let height = 500
      if (this.classList.contains('following-sidebar__list')) {
        top = -(scroller?.scrollTop ?? 0)
        height = 1201 * 60
      }
      if (this.parentElement?.classList.contains('following-sidebar__list')) {
        top = -(scroller?.scrollTop ?? 0)
        for (const sibling of this.parentElement.children) {
          if (sibling === this)
            break
          top += (Number.parseFloat(sibling.style.height) || 52) + 8
        }
        height = 52
      }
      return { top, bottom: top + height, left: 0, right: 240, width: 240, height }
    }
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 500 })
    const props = Vue.reactive({ uploaders: Array.from({ length: 1200 }, (_, index) => ({ mid: index + 1, name: `UP ${index + 1}`, face: '', groupIds: [0], lastUpdateTime: 1 })), groups: [], grouped: false, accountId: 1, selected: 1, query: '', expanded: [0], loading: false, failed: false, groupsLoading: false, groupsFailed: false, busy: false, loadGroups: async () => true, loadMember: async () => undefined, write: async () => ({ ok: true }) })
    const host = document.body.appendChild(document.createElement('div'))
    const app = Vue.createApp({ setup: () => () => Vue.h(component, { ...props, 'onUpdate:grouped': value => props.grouped = value, onScrollElement: element => scroller = element }) })
    app.config.globalProperties.$t = key => key
    const settle = async () => {
      await new Promise(resolve => setTimeout(resolve, 60))
      await flush()
    }
    try {
      app.mount(host)
      await settle()
      const mounted = host.querySelectorAll('[data-uploader-mid]').length
      assert.ok(mounted > 0 && mounted < 120)
      const first = host.querySelector('[data-uploader-mid="1"]')
      first.focus()
      scroller.scrollTop = 6000
      scroller.dispatchEvent(new Event('scroll'))
      await settle()
      assert.equal(host.querySelector('[data-uploader-mid="1"]'), first)
      assert.equal(document.activeElement, first)
      host.querySelectorAll('.bew-segment-control__item')[1].click()
      await settle()
      assert.equal(props.grouped, true)
      assert.equal(host.querySelectorAll('.following-sidebar__scroll').length, 1)
      assert.ok(host.querySelector('.following-sidebar__controls input'))
      assert.ok(host.querySelectorAll('[data-uploader-mid]').length < 200)
      console.log(`PERF Following fixture: 1200 members, ${mounted} mounted initially; focus retains the same element`)
    }
    finally {
      app.unmount()
      host.remove()
      HTMLElement.prototype.getBoundingClientRect = previousRect
      if (previousHeight)
        Object.defineProperty(HTMLElement.prototype, 'clientHeight', previousHeight)
      else delete HTMLElement.prototype.clientHeight
    }
  })

  check('September live avatar: normalized status, valid room links, fallback and visible-only animation', async () => {
    const transforms = await loadSourceModule('../src/contentScripts/views/SearchResults/searchTransforms.ts', {
      '~/utils/dataFormatter': { numFormatter: String, parseStatNumber: Number },
      '~/utils/htmlDecode': { decodeHtmlEntities: value => value },
    })
    const card = transforms.convertUserCardData({ mid: 10, is_live: '1', roomid: '123' }, String)
    assert.equal(card.liveStatus, 1)
    assert.equal(card.roomid, 123)
    assert.equal(transforms.convertUserCardData({ live_status: 1, roomid: -1 }, String).roomid, undefined)
    assert.doesNotThrow(() => transforms.convertUserCardData(null, String))
    const visible = Vue.ref(true)
    const visibility = Vue.ref('visible')
    const Component = await compileComponent('../src/components/UserCard/UserAvatarLink.vue', {
      '@vueuse/core': { useElementVisibility: () => visible, useDocumentVisibility: () => visibility },
      '~/components/ALink.vue': { default: { props: ['href'], setup: (props, { slots }) => () => Vue.h('a', { href: props.href }, slots.default?.()) } },
    })
    const props = Vue.reactive({ mid: 10, name: 'UP', roomid: 123, liveStatus: 1 })
    const host = document.body.appendChild(document.createElement('div'))
    const app = Vue.createApp({ setup: () => () => Vue.h(Component, props) })
    app.config.globalProperties.$t = key => key
    try {
      app.mount(host)
      assert.equal(host.querySelector('a').href, 'https://live.bilibili.com/123')
      assert.ok(host.querySelector('.is-animating'))
      visible.value = false
      await flush()
      assert.equal(host.querySelector('.is-animating'), null)
      visible.value = true
      visibility.value = 'hidden'
      props.roomid = undefined
      await flush()
      assert.equal(host.querySelector('.is-animating'), null)
      assert.equal(host.querySelector('a').href, 'https://space.bilibili.com/10')
      props.liveStatus = 0
      await flush()
      assert.equal(host.querySelector('.user-avatar-link__badge'), null)
    }
    finally {
      app.unmount()
      host.remove()
    }
  })

  check('September search navigation: TopBar updates results in place and late history never replaces a new navigation', async () => {
    const opened = []
    const pushes = []
    const location = { href: 'https://www.bilibili.com/?page=SearchResults&keyword=A', assign: url => opened.push(url) }
    const history = { state: { retained: 'native state' }, pushState: (state, _title, url) => pushes.push({ state, url }) }
    const module = await loadSourceModule('../src/utils/searchNavigation.ts', {
      '~/composables/useRouteState': { syncRouteState() {} },
      '~/utils/configuredLinkNavigation': { getLinkFallbackPage: () => 'Home' },
      '~/enums/appEnums': await import('../src/enums/appEnums'),
      '~/logic': { settings: Vue.ref({ searchBarLinkOpenMode: 'newTab' }) },
      '~/utils/main': { isHomePage: () => true, isInIframe: () => false, openLinkToNewTab: url => opened.push(url) },
      '~/utils/pageMode': {},
      '~/utils/searchNavigationCore': await import('../src/utils/searchNavigationCore'),
      './searchNavigationCore': await import('../src/utils/searchNavigationCore'),
      './searchUrl': await import('../src/utils/searchUrl'),
      '~/utils/tabs': { openLinkInBackground: url => opened.push(url) },
    }, { window: { location, history } })
    const destination = 'https://www.bilibili.com/?page=SearchResults&keyword=B'
    module.openSearchResults(destination, { fromSearchResultsTopBar: true })
    await flush()
    assert.equal(pushes.length, 1)
    assert.equal(pushes[0].state, history.state)
    assert.equal(opened.length, 0)
    module.openSearchResults(destination)
    assert.equal(opened.length, 1, 'other entry points retain the user\'s new-tab policy')
    const pending = deferred()
    module.openSearchResults(destination, { fromSearchResultsTopBar: true, persistHistory: () => pending.promise })
    assert.equal(pushes.length, 2, 'the target route commits before history persistence settles')
    location.href = 'https://www.bilibili.com/?page=History'
    pending.resolve()
    await flush()
    assert.equal(pushes.length, 2, 'late history completion cannot navigate again')
    assert.match(location.href, /page=History/)
  })

  check('September native TopBar: native mode is untouched and replaced managed headers release resources', async () => {
    const observers = []
    const module = await loadSourceModule('../src/utils/bilibiliTopBar.ts', { '~/utils/svgIcons': { SVG_ICONS: '' } }, {
      AbortController: window.AbortController,
      MutationObserver: class {
        constructor(callback) {
          this.callback = callback
          this.targets = []
          observers.push(this)
        }

        observe(target, options) { this.targets.push({ target, options }) }
        disconnect() { this.targets = [] }
      },
    })
    const doc = document.implementation.createHTMLDocument('native header fixture')
    doc.body.innerHTML = '<div id="app"><div class="bili-feed4"><div class="bili-header"><div class="bili-header__bar"><button class="login-btn">Login</button></div><div class="bili-header__banner">Banner</div></div></div></div>'
    const original = doc.querySelector('.bili-header')
    module.captureOriginalBilibiliTopBar(doc)
    module.setOriginalBilibiliTopBarScrolled(doc, true)
    assert.equal(observers.length, 0)
    assert.equal(original.querySelector('.bili-header__bar').classList.contains('slide-down'), false)
    doc.documentElement.classList.add('bewly-custom-homepage')
    doc.documentElement.dataset.bewlyTopBarSource = 'bilibili-native'
    assert.equal(module.ensureOriginalBilibiliTopBarAppended(doc), true)
    module.setOriginalBilibiliTopBarScrolled(doc, true)
    const previousScrollObserver = observers.find(observer => observer.targets.some(entry => entry.target === original && entry.options.attributes))
    const ancestorObserver = observers.find(observer => observer.targets.some(entry => entry.target === doc.body))
    assert.ok(ancestorObserver.targets.every(entry => !entry.options.subtree))
    assert.equal(original.querySelector('.login-btn').dataset.bewlyLoginHandler, 'true')
    const replacement = original.cloneNode(true)
    replacement.querySelector('.login-btn').removeAttribute('data-bewly-login-handler')
    original.replaceWith(replacement)
    ancestorObserver.callback([])
    assert.equal(original.querySelector('.login-btn').hasAttribute('data-bewly-login-handler'), false)
    assert.equal(previousScrollObserver.targets.length, 0)
    assert.equal(replacement.querySelector('.login-btn').dataset.bewlyLoginHandler, 'true')
    module.detachOriginalBilibiliTopBar(doc)
    assert.ok(observers.every(observer => observer.targets.length === 0))
    assert.equal(replacement.querySelector('.login-btn').hasAttribute('data-bewly-login-handler'), false)
  })

  check('September WatchLater: dedicated cards stay bounded and retain focused/pending items', async () => {
    const root = document.body.appendChild(document.createElement('section'))
    Object.defineProperties(root, { clientHeight: { value: 700 }, scrollHeight: { value: 100000 } })
    const settings = Vue.ref({ watchLaterLayoutMode: 'list', videoCardLinkOpenMode: 'drawer', enableSidebarCoverBlur: false })
    const pending = deferred()
    const raw = Array.from({ length: 500 }, (_, index) => ({ aid: index + 1, bvid: 'BV1ab411c7mD', title: `Video ${index + 1}`, duration: 1, add_at: 1 }))
    let writeRequests = 0
    const provider = { openIframeDrawer() {}, handlePageRefresh: Vue.ref(), handleReachBottom: Vue.ref(), haveScrollbar: async () => true, scrollViewportRef: Vue.ref(root) }
    const blank = { render: () => null }
    const account = Vue.reactive({ isLogin: true, userInfo: { mid: 1 } })
    const Component = await compileComponent('../src/contentScripts/views/WatchLater/WatchLater.vue', {
      '~/components/WatchLater/OpenTabsDialog.vue': { default: blank },
      '@vueuse/core': { useDateFormat: () => Vue.ref('date'), useResizeObserver() {} },
      'vue-i18n': { useI18n: () => ({ t: key => key }) },
      '~/components/IconButton.vue': { default: { props: ['label'], setup: (props, { slots }) => () => Vue.h('button', { 'aria-label': props.label }, slots.default?.()) } },
      '~/components/SkeletonBlock.vue': { default: blank },
      '~/components/VideoListSkeleton.vue': { default: blank },
      '~/composables/useAppProvider': { useBewlyApp: () => provider },
      '~/composables/useCardWindow': await import('../src/composables/useCardWindow'),
      '~/composables/useConfirmDialog': { useConfirmDialog: () => ({ confirm: async () => false }) },
      '~/composables/useGridLayout': { useGridLayout: () => ({ gridClass: Vue.ref(''), gridCssVars: Vue.ref({}) }) },
      '~/logic': { settings },
      '~/logic/layoutEdit': { isLayoutEditing: Vue.ref(false), useLayoutEditSettingValue: (_key, get) => Vue.computed(get), vLayoutEditable: {} },
      '~/stores/topBarStore': { useTopBarStore: () => account },
      '~/utils/accountLifetime': await import('../src/utils/accountLifetime'),
      '~/utils/api': { default: { watchlater: { getWatchLaterListByPage: async () => ({ code: 0, data: { count: raw.length, list: raw } }) } } },
      '~/utils/dataFormatter': { calcCurrentTime: String },
      '~/utils/main': { getCSRF: () => account.isLogin ? 'csrf' : '', getUserID: () => String(account.userInfo.mid), openLinkToNewTab() {}, removeHttpFromUrl: value => value ?? '' },
      '~/utils/messaging': { isExtensionContextInvalidatedError: () => false },
      '~/utils/playbackProgress': await import('../src/utils/playbackProgress'),
      '~/utils/tabs': {},
      '~/utils/watchLater': { updateOwnedWatchLater: () => {
        writeRequests++
        return pending.promise
      } },
      '~/utils/watchLaterList': await import('../src/utils/watchLaterList'),
      './WatchLaterGridCard.vue': { default: { props: ['item'], setup: props => () => Vue.h('button', { 'data-grid-aid': props.item.aid }, props.item.title) } },
    })
    const previousRect = HTMLElement.prototype.getBoundingClientRect
    HTMLElement.prototype.getBoundingClientRect = function () {
      const card = this.classList.contains('watch-later-list-card') || this.classList.contains('watch-later-grid-slot')
      let top = this === root ? 0 : -root.scrollTop
      if (card) {
        for (const sibling of this.parentElement.children) {
          if (sibling === this)
            break
          top += Number.parseFloat(sibling.style.height) || 190
        }
      }
      return { top, bottom: top + (card ? 190 : 95000), left: 0, right: 1000, width: 1000, height: card ? 190 : 95000 }
    }
    const app = Vue.createApp({ render: () => Vue.h(Vue.Transition, { name: 'page-fade' }, () => Vue.h(Component)) })
    const warnings = []
    app.config.warnHandler = message => warnings.push(message)
    const pass = { setup: (_props, { slots }) => () => Vue.h('div', slots.default?.()) }
    app.component('ALink', { setup: (_props, { attrs, slots }) => () => Vue.h('a', { href: attrs.href }, slots.default?.()) })
    for (const name of ['Button', 'Tooltip', 'CoverSidebarSurface']) app.component(name, pass)
    for (const name of ['Progress', 'Checkbox', 'Select', 'LiquidSegmentIndicator']) app.component(name, blank)
    app.component('Empty', await compileComponent('../src/components/Empty.vue', { '~/utils/messaging': { getExtensionAssetUrl: () => '' } }))
    app.config.globalProperties.$t = key => key
    const settle = async () => {
      await new Promise(resolve => setTimeout(resolve, 60))
      await flush()
    }
    try {
      app.mount(root)
      await settle()
      assert.ok(root.querySelector('.bew-page-heading').textContent.includes('500'), 'missing optional display fields do not reject the page')
      const mounted = root.querySelectorAll('.watch-later-list-card').length
      assert.ok(mounted > 0 && mounted < 80)
      const first = root.querySelector('.watch-later-list-card')
      first.querySelector('a').focus()
      first.querySelector('[aria-label="watch_later.remove_from_watch_later"]').click()
      assert.equal(writeRequests, 1)
      root.scrollTop = 19000
      root.dispatchEvent(new Event('scroll'))
      await settle()
      assert.ok(first.isConnected)
      assert.equal(root.querySelector('.watch-later-list-card'), first)
      pending.resolve({ status: 'cancelled' })
      await flush()
      first.querySelector('a').blur()
      root.scrollTop++
      root.dispatchEvent(new Event('scroll'))
      await settle()
      assert.equal(first.isConnected, false)
      settings.value.watchLaterLayoutMode = 'grid'
      root.scrollTop = 0
      await settle()
      assert.ok(root.querySelectorAll('[data-grid-aid]').length > 0)
      assert.ok(root.querySelectorAll('[data-grid-aid]').length < 80)
      root.scrollTop = 95000
      root.dispatchEvent(new Event('scroll'))
      await settle()
      assert.ok(root.querySelector('[data-grid-aid="500"]'), 'the last resource remains reachable')
      root.querySelector('.bew-page-heading').nextElementSibling.click()
      await settle()
      account.isLogin = false
      account.userInfo.mid = 0
      await settle()
      assert.match(root.textContent, /common.please_log_in_first/)
      account.isLogin = true
      account.userInfo.mid = 1
      await settle()
      assert.ok(root.querySelector('.bew-page-heading'))
      assert.deepEqual(warnings, [], 'actual Transition accepts loaded, dialog-open and logged-out roots')
      console.log(`PERF WatchLater fixture: 500 resources retained, ${mounted} list cards mounted initially`)
    }
    finally {
      app.unmount()
      HTMLElement.prototype.getBoundingClientRect = previousRect
      root.remove()
    }
  })
}
