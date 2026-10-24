import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import { loadSourceFunctions } from './sourceFunctionHarness'
import { loadSourceModule } from './sourceModuleHarness'

export function registerImmersiveAndControlChecks(check, { Vue, flush, compileComponent }) {
  check('batch two: Tooltip separates keyboard focus from pointer residue, preserves copied feedback and stays in its Dialog layer', async () => {
    const timers = new Map()
    let id = 0
    const Tooltip = await compileComponent('../src/components/Tooltip.vue', {}, { globals: {
      setTimeout: (callback) => {
        timers.set(++id, callback)
        return id
      },
      clearTimeout: key => timers.delete(key),
    } })
    const host = document.body.appendChild(document.createElement('div'))
    const target = document.body.appendChild(document.createElement('div'))
    const label = Vue.ref('Copy')
    const app = Vue.createApp({ render: () => Vue.h(Tooltip, { content: label.value, teleport: true }, () => Vue.h('button', { onClick: () => label.value = 'Copied' }, 'Copy')) })
    app.provide((await import('../src/utils/dialogFocus')).DIALOG_TELEPORT_TARGET, Vue.ref(target))
    app.mount(host)
    const wrapper = host.querySelector('.b-tooltip-wrapper')
    const button = host.querySelector('button')
    let keyboard = false
    const matches = button.matches.bind(button)
    button.matches = selector => selector === ':focus-visible' ? keyboard : matches(selector)
    const query = wrapper.querySelector.bind(wrapper)
    wrapper.querySelector = selector => selector === ':focus-visible' ? keyboard ? button : null : query(selector)
    try {
      wrapper.dispatchEvent(new Event('mouseenter'))
      timers.forEach(callback => callback())
      timers.clear()
      await flush()
      button.dispatchEvent(new window.FocusEvent('focusin', { bubbles: true }))
      button.click()
      await flush()
      assert.equal(target.querySelector('.b-tooltip').textContent, 'Copied')
      assert.equal(target.querySelector('.b-tooltip').classList.contains('is-visible'), true)
      wrapper.dispatchEvent(new Event('mouseleave'))
      await flush()
      assert.equal(target.querySelector('.b-tooltip').classList.contains('is-visible'), false)
      keyboard = true
      button.dispatchEvent(new window.FocusEvent('focusin', { bubbles: true }))
      await flush()
      assert.equal(target.querySelector('.b-tooltip').classList.contains('is-visible'), true)
      wrapper.dispatchEvent(new Event('mouseleave'))
      await flush()
      assert.equal(target.querySelector('.b-tooltip').classList.contains('is-visible'), true)
      keyboard = false
      button.dispatchEvent(new window.FocusEvent('focusout', { bubbles: true }))
      await flush()
      assert.equal(target.querySelector('.b-tooltip').classList.contains('is-visible'), false)
    }
    finally {
      app.unmount()
      host.remove()
      target.remove()
    }
  })

  check('batch two: Slider reserves signed fractional labels and units without changing range input semantics', async () => {
    const Slider = await compileComponent('../src/components/Slider.vue', { '~/utils/range': await import('../src/utils/range') })
    const props = Vue.reactive({ modelValue: -9.25, min: -1000, max: 55.5, step: 0.01, label: '-9.25 ms', accessibleLabel: 'Duration' })
    const changes = []
    const host = document.body.appendChild(document.createElement('div'))
    const app = Vue.createApp({ render: () => Vue.h(Slider, { ...props, 'onUpdate:modelValue': value => changes.push(value) }) })
    app.mount(host)
    try {
      const sample = host.querySelector('.slider-label__sizer')
      assert.equal(sample.textContent, '−0000.00 ms')
      for (const value of [-1000, 0, 55.5]) {
        props.modelValue = value
        props.label = `${value.toFixed(2)} ms`
        await flush()
        assert.equal(sample.textContent, '−0000.00 ms')
      }
      const input = host.querySelector('input')
      assert.equal(input.type, 'range')
      assert.equal(input.step, '0.01')
      assert.equal(input.getAttribute('aria-label'), 'Duration')
      input.value = '-25.25'
      input.dispatchEvent(new Event('input', { bubbles: true }))
      assert.equal(changes.at(-1), -25.25)
      const css = await readFile(new URL('../src/components/Slider.vue', import.meta.url), 'utf8')
      assert.match(css, /font-variant-numeric: tabular-nums/)
      assert.doesNotMatch(css, /(?:measureText|getBoundingClientRect|ResizeObserver)/)
    }
    finally {
      app.unmount()
      host.remove()
    }
  })

  check('batch two: control fitting measures after size settlement, bounds long transitions and keeps immediate structural updates', async () => {
    const root = document.body.appendChild(document.createElement('div'))
    root.innerHTML = '<div class="bpx-player-control-bottom"><div class="left"></div><div class="bpx-player-control-bottom-right"><button class="native"><span>Time</span></button><button class="extra">Extra</button></div></div><div class="bpx-player-contextmenu"></div>'
    const bar = root.firstElementChild
    const native = root.querySelector('.native')
    const extra = root.querySelector('.extra')
    let width = 800
    let nativeWidth = 100
    let reads = 0
    let now = 0
    const frames = new Map()
    let id = 0
    let resized
    let structure
    for (const [element, size] of [[bar, () => width], [root.querySelector('.left'), () => 100], [native, () => nativeWidth], [extra, () => 40]]) {
      element.getBoundingClientRect = () => {
        reads++
        return { width: size(), height: 36, top: 0, left: 0, right: size(), bottom: 36 }
      }
    }
    const module = await loadSourceModule('../src/contentScripts/playerControlFit.ts', {
      '~/utils/playerMedia': { getPlayerRoot: () => root },
      '~/utils/motionPriority': { getMotionRemaining: () => 0, MAX_MOTION_WAIT_MS: 800 },
      './playerDomLifecycle': { observePlayerDom: (callback) => {
        structure = callback
        return () => {}
      } },
    }, {
      performance: { now: () => now },
      ResizeObserver: class { constructor(callback) { resized = callback } observe() {} unobserve() {} disconnect() {} },
      requestAnimationFrame: (callback) => {
        frames.set(++id, callback)
        return id
      },
      cancelAnimationFrame: key => frames.delete(key),
    })
    const step = () => {
      now += 16
      const callbacks = [...frames.values()]
      frames.clear()
      callbacks.forEach(callback => callback())
    }
    const resize = () => resized([{ target: bar, contentRect: { width, height: 36 } }])
    const registration = module.registerPlayerControlFit(extra, { priority: 20, label: () => 'Extra', activate() {} })
    try {
      step()
      assert.ok(reads > 0)
      resized([{ target: native, contentRect: { width: nativeWidth, height: 36 } }])
      reads = 0
      for (let index = 0; index < 30; index++) {
        width--
        resize()
        step()
      }
      assert.equal(reads, 0, 'transition frames only consume observer sizes, without measuring controls')
      registration.refresh()
      step()
      assert.ok(reads > 0, 'explicit control changes remain immediate during a size transition')
      reads = 0
      for (let index = 0; index < 5; index++) step()
      assert.ok(reads > 0)
      reads = 0
      for (let index = 0; index < 60; index++) {
        width--
        resize()
        step()
      }
      assert.ok(reads > 0, 'a transition that never settles cannot starve fitting beyond its bound')
      for (let index = 0; index < 5; index++) step()
      reads = 0
      structure()
      step()
      assert.ok(reads > 0, 'control insertion/removal is immediate outside a size transition')
      reads = 0
      native.querySelector('span').firstChild.data = 'Longer native label'
      await flush()
      nativeWidth = 160
      resized([{ target: native, contentRect: { width: nativeWidth, height: 36 } }])
      step()
      assert.ok(reads > 0, 'intrinsic native text width changes join the same measurement owner immediately')
      reads = 0
      for (let index = 0; index < 5; index++) step()
      reads = 0
      native.querySelector('span').firstChild.data = 'Same width ticking label'
      structure([{ type: 'childList', target: native.querySelector('span'), addedNodes: [document.createTextNode('tick')], removedNodes: [] }])
      await flush()
      step()
      assert.equal(reads, 0, 'same-width text ticks do not start another layout measurement')
    }
    finally {
      registration.dispose()
      assert.equal(frames.size, 0)
      root.remove()
    }
  })

  check('batch two: complete Lit reply parts follow tree DOM order, preserve real mutation records and restore for native updates', async () => {
    const module = await loadSourceModule('../src/inject/commentReplyDomOrder.ts', { './commentMissingParents': await import('../src/inject/commentMissingParents') })
    const container = document.body.appendChild(document.createElement('div'))
    const groups = []
    function part(text) {
      const renderer = document.createElement('bili-comment-reply-renderer')
      renderer.textContent = text
      const group = [document.createComment(''), renderer, document.createComment('')]
      groups.push(group)
      container.append(...group)
      return renderer
    }
    const first = part('Parent A ')
    const second = part('Parent B ')
    const child = part('Child A ')
    const footer = container.appendChild(document.createElement('footer'))
    footer.textContent = 'Footer'
    const observer = new MutationObserver(() => {})
    observer.observe(container, { childList: true })
    const native = document.createElement('i')
    container.insertBefore(native, container.firstChild)
    const result = module.moveCommentReplyParts(container, [first, second, child], [first, child, second], observer)
    try {
      assert.equal(result.reordered, true)
      assert.equal(container.textContent, 'Parent A Child A Parent B Footer')
      assert.equal(result.external.length, 1, 'a pending native insertion is preserved')
      assert.equal(result.external[0].addedNodes[0], native)
      assert.equal(observer.takeRecords().length, 0, 'only exact self-move records are consumed')
      for (const [start, renderer, end] of groups) {
        assert.equal(start.nextSibling, renderer)
        assert.equal(renderer.nextSibling, end)
      }
      module.moveCommentReplyParts(container, [first, second, child], [first, second, child], observer)
      assert.equal(container.textContent, 'Parent A Parent B Child A Footer')
      // A keyed native update removes the complete original child part and appends its replacement.
      groups[2].forEach(node => node.remove())
      const replacement = document.createElement('bili-comment-reply-renderer')
      replacement.textContent = 'Updated child '
      container.insertBefore(document.createComment(''), footer)
      container.insertBefore(replacement, footer)
      container.insertBefore(document.createComment(''), footer)
      const updated = module.moveCommentReplyParts(container, [first, second, replacement], [first, replacement, second], observer)
      assert.equal(updated.reordered, true)
      assert.equal(container.querySelectorAll('bili-comment-reply-renderer').length, 3)
      assert.equal(container.textContent, 'Parent A Updated child Parent B Footer')
      replacement.previousSibling.remove()
      const before = Array.from(container.childNodes)
      assert.equal(module.moveCommentReplyParts(container, [first, second, replacement], [second, first, replacement], observer).reordered, false)
      assert.deepEqual(Array.from(container.childNodes), before, 'an unconfirmed part is never moved as a bare renderer')
    }
    finally {
      observer.disconnect()
      container.remove()
    }
  })

  check('batch two: immersive recommendations keep one canonical queue, a bounded virtual sidebar and at most one reusable preparation page', async () => {
    const helpers = await import('../src/utils/immersiveRecommendation')
    const settings = Vue.reactive({ immersivePreloadNext: false, immersiveAutoNext: true, immersiveKeyboardSwitch: true })
    const items = Array.from({ length: 1000 }, (_, index) => ({ uniqueId: String(index), isAdvertisement: false, displayData: { id: index + 1, aid: index + 1, title: String(index), threePointV2: [] } }))
    assert.ok(helpers.getImmersiveWindow(items, 500).length <= helpers.IMMERSIVE_WINDOW_SIZE)
    const mount = document.body.appendChild(document.createElement('div'))
    const surface = document.body.appendChild(document.createElement('div'))
    const viewport = document.body.appendChild(document.createElement('div'))
    const trigger = document.body.appendChild(document.createElement('button'))
    trigger.focus()
    viewport.scrollTop = 123
    let loadMore
    let sidebarItems
    let loads = 0
    const messages = new Map()
    const instances = new Map()
    const button = { inheritAttrs: false, props: ['label'], setup: (props, { slots, attrs }) => () => Vue.h('button', { ...attrs, 'aria-label': props.label }, slots.default?.()) }
    const frame = {
      props: ['itemKey', 'url', 'active'],
      emits: ['action'],
      setup(props, { emit }) {
        instances.set(props.itemKey, Vue.getCurrentInstance().uid)
        messages.set(props.itemKey, action => emit('action', action))
        return () => Vue.h('div', { class: 'fixture-frame', 'data-key': props.itemKey, 'data-active': props.active })
      },
    }
    const grid = {
      props: ['items', 'cardClickHandler'],
      emits: ['loadMore', 'refresh'],
      setup(props, { emit }) {
        loadMore = () => emit('loadMore')
        return () => {
          sidebarItems = props.items
          return Vue.h('div', { class: 'fixture-grid' })
        }
      },
    }
    const Component = await compileComponent('../src/contentScripts/views/Home/components/ImmersiveFeed.vue', {
      '~/components/CloseButton.vue': { default: button },
      '~/components/IconButton.vue': { default: button },
      '~/components/VideoCardGrid.vue': { default: grid },
      './ImmersiveVideoFrame.vue': { default: frame },
      '~/composables/useAppProvider': { useBewlyApp: () => ({ activatedPage: Vue.ref('Home'), homeActivatedPage: Vue.ref('ForYou'), mainAppRef: Vue.ref(surface), scrollViewportRef: Vue.ref(viewport) }) },
      '~/logic': { settings: Vue.ref(settings) },
      '~/utils/immersiveRecommendation': helpers,
      '~/utils/pageScrollLock': { lockPageScroll() {}, unlockPageScroll() {} },
    })
    const props = Vue.reactive({ items, initialIndex: 1, loading: false, noMoreContent: false, requestFailed: false, trigger })
    const app = Vue.createApp({ render: () => Vue.h(Component, { ...props, onLoadMore: () => loads++ }) })
    app.config.globalProperties.$t = key => key
    const initialHref = window.location.href
    const initialState = window.history.state
    app.mount(mount)
    try {
      await flush()
      assert.equal(surface.querySelectorAll('.fixture-frame').length, 1)
      assert.ok(sidebarItems.length <= 48)
      const oldAction = messages.get('1')
      loadMore()
      await flush()
      assert.equal(loads, 0, 'browsing already accepted recommendations does not request another network page')
      assert.ok(sidebarItems.length <= 48)
      settings.immersivePreloadNext = true
      await flush()
      assert.equal(surface.querySelectorAll('.fixture-frame').length, 2)
      assert.equal(surface.querySelectorAll('[data-active="true"]').length, 1)
      const prepared = instances.get('2')
      surface.querySelector('[aria-label="settings.immersive_next"]').click()
      await flush()
      assert.equal(instances.get('2'), prepared, 'promotion reuses the single prepared document')
      assert.equal(surface.querySelector('[data-active="true"]').dataset.key, '2')
      oldAction('ended')
      await flush()
      assert.equal(surface.querySelector('[data-active="true"]').dataset.key, '2', 'old frame actions cannot advance the new queue position')
      settings.immersivePreloadNext = false
      await flush()
      assert.equal(surface.querySelectorAll('.fixture-frame').length, 1)
      assert.equal(window.location.href, initialHref)
      assert.equal(window.history.state, initialState)
      const staleLoad = loadMore
      app.unmount()
      await flush()
      const count = loads
      staleLoad()
      assert.equal(loads, count)
      assert.equal(document.activeElement, trigger)
    }
    finally {
      if (mount.__vue_app__)
        app.unmount()
      mount.remove()
      surface.remove()
      viewport.remove()
      trigger.remove()
    }
  })

  check('batch two: delayed recommendation pages respect cancelled navigation and a changed automatic-next setting', async () => {
    const entries = Array.from({ length: 5 }, (_, index) => ({ uniqueId: String(index), displayData: { id: index + 1, aid: index + 1, title: String(index), threePointV2: [] } }))
    const settings = Vue.ref({ immersivePreloadNext: false, immersiveAutoNext: true, immersiveKeyboardSwitch: true })
    const host = document.body.appendChild(document.createElement('div'))
    const blank = { render: () => null }
    const Component = await compileComponent('../src/contentScripts/views/Home/components/ImmersiveFeed.vue', {
      '~/components/CloseButton.vue': { default: blank },
      '~/components/IconButton.vue': { default: blank },
      '~/components/VideoCardGrid.vue': { default: blank },
      './ImmersiveVideoFrame.vue': { default: blank },
      '~/composables/useAppProvider': { useBewlyApp: () => ({ activatedPage: Vue.ref('Home'), homeActivatedPage: Vue.ref('ForYou'), mainAppRef: Vue.ref(host), scrollViewportRef: Vue.ref(null) }) },
      '~/logic': { settings },
      '~/utils/immersiveRecommendation': await import('../src/utils/immersiveRecommendation'),
      '~/utils/pageScrollLock': { lockPageScroll() {}, unlockPageScroll() {} },
    }, { renderTemplate: false })
    Component.render = () => null
    const props = Vue.reactive({ items: entries.slice(0, 3), initialIndex: 2, loading: false, noMoreContent: false, requestFailed: false })
    let state
    let requests = 0
    const app = Vue.createApp({ render: () => Vue.h(Component, { ...props, onLoadMore: () => requests++, ref: value => state = value?.$?.setupState }) })
    app.mount(host)
    try {
      state.action('2', 'ended')
      assert.equal(requests, 1)
      props.loading = true
      await flush()
      settings.value.immersiveAutoNext = false
      await flush()
      props.items = entries.slice(0, 4)
      props.loading = false
      await flush()
      assert.equal(state.index, 2, 'turning auto-next off cancels an already pending automatic advance')
      state.next()
      assert.equal(state.index, 3, 'explicit navigation remains available')
      state.next()
      assert.equal(requests, 2)
      props.loading = true
      await flush()
      state.previous()
      props.items = entries
      props.loading = false
      await flush()
      assert.equal(state.index, 2, 'a completed old page does not override a later previous command')
      state.action('3', 'ended')
      assert.equal(state.index, 2)
    }
    finally {
      app.unmount()
      host.remove()
    }
  })

  check('batch two: preparation iframe is inactive and layout readiness does not wait for playback; old document events are rejected', async () => {
    const constants = await import('../src/constants/immersive')
    const settings = Vue.ref({ immersiveAutoPlay: true, immersiveAutoNext: true, immersiveKeyboardSwitch: true, immersiveWheelSwitch: true })
    const commands = []
    const currentHref = Vue.ref('')
    let token = 'current'
    let released = 0
    const actions = []
    const timers = new Map()
    let id = 0
    const Component = await compileComponent('../src/contentScripts/views/Home/components/ImmersiveVideoFrame.vue', {
      '~/composables/useIframeDocumentHost': { useIframeDocumentHost: () => ({ currentHref, channel: { send: message => commands.push(message), matches: data => data.token === token, clear() {} } }) },
      '~/logic': { settings },
      '~/constants/immersive': constants,
      '~/utils/iframeMessage': { getIframeMessageData: event => event.data, markIframeReadyForMessaging() {} },
      '~/utils/mediaResources': { releaseIframeMedia: () => released++ },
    }, { globals: { setTimeout: (callback) => {
      timers.set(++id, callback)
      return id
    }, clearTimeout: key => timers.delete(key) } })
    const props = Vue.reactive({ active: false, itemKey: 'one', title: 'One', url: 'https://www.bilibili.com/video/av1' })
    const host = document.body.appendChild(document.createElement('div'))
    const app = Vue.createApp({ render: () => Vue.h(Component, { ...props, onAction: value => actions.push(value) }) })
    app.config.globalProperties.$t = key => key
    app.mount(host)
    const message = (action, extra = {}) => window.dispatchEvent(new window.MessageEvent('message', { data: { type: constants.IMMERSIVE_EVENT, key: 'one', playbackId: commands.at(-1)?.playbackId, token: 'current', action, ...extra } }))
    try {
      await flush()
      const iframe = host.querySelector('iframe')
      assert.equal(iframe.tabIndex, -1)
      assert.equal(iframe.name, constants.IMMERSIVE_PRELOAD_NAME)
      const policy = iframe.getAttribute('allow')
      assert.match(policy, /autoplay;/)
      assert.equal(iframe.parentElement.style.display, 'none')
      currentHref.value = props.url
      await flush()
      assert.equal(commands.at(-1).active, false)
      props.active = true
      await flush()
      assert.equal(commands.at(-1).active, true)
      assert.equal(iframe.getAttribute('allow'), policy, 'promotion reuses the navigation policy instead of locking autoplay off')
      assert.ok(host.querySelector('.immersive-frame__loading'))
      message('status', { layoutReady: true, playing: false })
      await flush()
      assert.equal(host.querySelector('.immersive-frame__loading'), null, 'a paused or autoplay-blocked player is already visible after layout')
      token = 'replacement'
      message('ended')
      message('next')
      assert.deepEqual(actions, [])
      token = 'current'
      settings.value.immersiveWheelSwitch = false
      message('next', { input: 'wheel' })
      assert.deepEqual(actions, [])
      props.active = false
      await flush()
      message('ended')
      assert.deepEqual(actions, [])
      const oldPlaybackId = commands.at(-1).playbackId
      props.active = true
      await flush()
      message('ended', { playbackId: oldPlaybackId })
      assert.deepEqual(actions, [], 'an old ending packet cannot advance a reactivated instance of the same iframe')
      message('ended')
      assert.deepEqual(actions, ['ended'])
    }
    finally {
      app.unmount()
      host.remove()
    }
    assert.equal(released, 1)
    assert.equal(timers.size, 0)
  })

  check('batch two: immersive media binds only the current native manuscript/part and rejects stale or unrelated ended events', async () => {
    const constants = await import('../src/constants/immersive')
    const root = document.body.appendChild(document.createElement('div'))
    root.innerHTML = '<div class="bpx-player-video-wrap"><video></video><textarea></textarea></div>'
    const video = root.querySelector('video')
    const unrelated = document.body.appendChild(document.createElement('video'))
    let selected = video
    let metadata = { aid: 1, bvid: 'BV1fYes6xEmq', pageCount: 2, isCollection: false }
    let episodeResult = Promise.resolve({ hasNextEpisode: false })
    const location = { href: 'https://www.bilibili.com/video/av1?p=1' }
    let route
    let dom
    let binding
    let documentActive = false
    let layoutReady = false
    let subscriptions = 0
    let unsubscriptions = 0
    let playRequests = 0
    const sent = []
    const listeners = []
    const add = video.addEventListener.bind(video)
    video.addEventListener = (name, callback, options) => {
      if (name === 'ended')
        listeners.push(callback)
      add(name, callback, options)
    }
    for (const media of [video, unrelated]) {
      Object.defineProperty(media, 'ended', { configurable: true, value: true })
      Object.defineProperty(media, 'readyState', { configurable: true, value: 4 })
      media.pause = () => {}
      media.play = () => {
        playRequests++
        return Promise.resolve()
      }
    }
    const client = { matches: data => data.token === 'current', send: data => sent.push(data), subscribe: (callback) => {
      binding = callback
      callback()
      return () => {}
    } }
    const module = await loadSourceModule('../src/contentScripts/immersiveFrame.ts', {
      '~/composables/useRouteState': { onRouteChange: (callback) => {
        route = callback
        return () => {}
      } },
      '~/constants/globalEvents': await import('../src/constants/globalEvents'),
      '~/utils/bewlyWidescreen': { isBewlyPlaybackLayoutReady: () => layoutReady },
      '~/utils/escapePriority': { hasIframeEscapePriorityState: () => false, isBrowserFullscreenActive: () => false },
      '~/utils/iframeActivity': { isImmersiveFrame: () => true, isIframeDocumentActive: () => documentActive, setIframeDocumentActive: active => documentActive = active },
      '~/utils/iframeMessage': { getParentMessageData: event => event.data },
      '~/utils/immersiveRecommendation': await import('../src/utils/immersiveRecommendation'),
      '~/utils/pageBridgeChannel': { getPageBridgeChannelId: () => 'bridge' },
      '~/utils/pgcEpisode': { resolvePgcEpisodeVideoIds: () => episodeResult },
      '~/utils/playbackTab': await import('../src/utils/playbackTab'),
      '~/utils/playerMedia': { getVideoElement: () => selected, getPlayerRoot: () => root, getPlayerModeContainer: () => root, isPlayerAdvertisement: () => false },
      '~/utils/videoMetadataBridge': { ...(await import('../src/utils/videoMetadataBridge')), isNativeVideoComponentReady: () => true, readVideoPageMetadata: () => metadata, readNativeQualityState: () => ({ ready: true, preview: false }), readNativePlaybackEpisodeId: () => Number(/ep(\d+)/.exec(location.href)?.[1]) },
      '~/utils/wheelStep': await import('../src/utils/wheelStep'),
      './playerDomLifecycle': { observePlayerDom: (callback) => {
        subscriptions++
        dom = callback
        callback()
        return () => unsubscriptions++
      }, hasPlayerMediaMutation: () => true },
    }, { location })
    const stop = module.setupImmersiveFrame(client, () => {})
    assert.equal(subscriptions, 0, 'inactive preparation documents do not own player observers')
    const configure = extra => window.dispatchEvent(new window.MessageEvent('message', { data: { token: 'current', documentId: 'current-doc', sessionId: 'current-session', playbackId: 1, type: constants.IMMERSIVE_CONFIG, key: 'one', targetUrl: 'https://www.bilibili.com/video/av1', active: true, autoPlay: false, autoNext: true, keyboard: true, wheel: true, ...extra } }))
    const finish = (current) => {
      Object.defineProperty(current, 'ended', { configurable: true, value: false })
      Object.defineProperty(current, 'paused', { configurable: true, value: false })
      current.dispatchEvent(new Event('playing'))
      Object.defineProperty(current, 'ended', { configurable: true, value: true })
      Object.defineProperty(current, 'paused', { configurable: true, value: true })
      current.dispatchEvent(new Event('ended'))
    }
    try {
      configure()
      layoutReady = true
      window.dispatchEvent(new Event((await import('../src/constants/globalEvents')).IFRAME_PLAYER_CONTEXT))
      assert.equal(sent.at(-1).layoutReady, true, 'the existing applied-mode notification reveals a paused native layout')
      assert.equal(sent.at(-1).playing, false)
      const picture = root.querySelector('.bpx-player-video-wrap')
      for (const deltaY of [120, 2]) {
        const wheel = new window.WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY })
        picture.dispatchEvent(wheel)
        assert.equal(wheel.defaultPrevented, true, 'wheel tails remain owned by the mode rather than falling through to native volume or page scrolling')
      }
      const inputWheel = new window.WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 120 })
      picture.querySelector('textarea').dispatchEvent(inputWheel)
      assert.equal(inputWheel.defaultPrevented, false)
      const repeat = new window.KeyboardEvent('keydown', { key: 'ArrowDown', repeat: true, bubbles: true, cancelable: true })
      picture.dispatchEvent(repeat)
      assert.equal(repeat.defaultPrevented, true, 'a held navigation key cannot become a native volume shortcut')
      binding({ documentId: 'current-doc', sessionId: 'current-session', revision: 2, href: location.href })
      assert.equal(documentActive, true)
      assert.equal(subscriptions, 1, 'a same-document route revision reuses its active observer')
      configure({ autoPlay: true })
      const attempts = playRequests
      video.setAttribute('src', 'quality-change')
      dom()
      assert.equal(playRequests, attempts, 'changing quality cannot restart a video the user paused')
      configure({ autoPlay: false })
      unrelated.dispatchEvent(new Event('ended'))
      finish(video)
      await flush()
      assert.equal(sent.filter(data => data.action === 'ended').length, 0, 'an internal part or unrelated media never advances the recommendation queue')
      location.href = 'https://www.bilibili.com/video/av1?p=2'
      route()
      finish(video)
      await flush()
      assert.equal(sent.filter(data => data.action === 'ended').length, 1)
      const oldEnded = listeners.at(-1)
      selected = unrelated
      metadata = { ...metadata, pageCount: 1 }
      dom()
      const count = sent.length
      oldEnded({ target: video })
      await flush()
      assert.equal(sent.length, count, 'a detached native media listener cannot report the replacement media as ended')
      binding()
      unrelated.dispatchEvent(new Event('ended'))
      await flush()
      assert.equal(sent.length, count, 'a document waiting for a new binding is inactive')
      configure({ token: 'old-document' })
      unrelated.dispatchEvent(new Event('ended'))
      await flush()
      assert.equal(sent.length, count)
      let finishEpisode
      episodeResult = new Promise(resolve => finishEpisode = resolve)
      metadata = null
      location.href = 'https://www.bilibili.com/bangumi/play/ep99'
      route()
      configure({ targetUrl: 'https://www.bilibili.com/bangumi/play/ss10' })
      finish(unrelated)
      const beforeEpisodeEnd = sent.filter(data => data.action === 'ended').length
      location.href = 'https://www.bilibili.com/bangumi/play/ep100'
      route()
      finishEpisode({ hasNextEpisode: false })
      await flush()
      assert.equal(sent.filter(data => data.action === 'ended').length, beforeEpisodeEnd, 'an old EP lookup cannot advance the new episode session')
      episodeResult = Promise.resolve({ hasNextEpisode: true })
      finish(unrelated)
      await flush()
      assert.equal(sent.filter(data => data.action === 'ended').length, beforeEpisodeEnd, 'native episode continuation retains the same recommendation')
      let finishLate
      episodeResult = new Promise(resolve => finishLate = resolve)
      finish(unrelated)
      binding()
      configure({ targetUrl: 'https://www.bilibili.com/bangumi/play/ss10' })
      finishLate({ hasNextEpisode: false })
      await flush()
      assert.equal(sent.filter(data => data.action === 'ended').length, beforeEpisodeEnd, 'a late ending lookup cannot cross a reactivated document session')
      episodeResult = Promise.resolve({ hasNextEpisode: false })
      unrelated.dispatchEvent(new Event('ended'))
      await flush()
      assert.equal(sent.filter(data => data.action === 'ended').length, beforeEpisodeEnd, 'an already-ended preparation media must actually play in its new session')
      let finishCancelled
      episodeResult = new Promise(resolve => finishCancelled = resolve)
      finish(unrelated)
      configure({ targetUrl: 'https://www.bilibili.com/bangumi/play/ss10', autoNext: false })
      configure({ targetUrl: 'https://www.bilibili.com/bangumi/play/ss10', autoNext: true })
      finishCancelled({ hasNextEpisode: false })
      await flush()
      assert.equal(sent.filter(data => data.action === 'ended').length, beforeEpisodeEnd, 'disabling automatic next cancels a pending episode lookup even if enabled again')
      episodeResult = Promise.resolve({ hasNextEpisode: false })
      finish(unrelated)
      await flush()
      assert.equal(sent.filter(data => data.action === 'ended').length, beforeEpisodeEnd + 1)
      const endedCount = sent.filter(data => data.action === 'ended').length
      metadata = { aid: 77, bvid: 'BVforeign', pageCount: 1 }
      location.href = 'https://www.bilibili.com/video/av77'
      configure({ targetUrl: 'https://www.bilibili.com/video/av1' })
      route()
      await flush()
      assert.equal(sent.filter(data => data.action === 'ended').length, endedCount, 'foreign manuscript navigation is not a recommendation queue end event')
      assert.equal(sent.some(data => data.action === 'close'), true)
    }
    finally {
      stop()
      assert.equal(unsubscriptions, subscriptions)
      root.remove()
      unrelated.remove()
    }
  })

  check('batch two: inactive document activity suppresses native play and extension history until an authenticated activation', async () => {
    const constants = await import('../src/constants/immersive')
    const listeners = new Map()
    const media = document.createElement('video')
    let plays = 0
    let pauses = 0
    const prototype = window.HTMLMediaElement.prototype
    const originalPlay = prototype.play
    const originalPause = prototype.pause
    prototype.play = function () {
      plays++
      return Promise.resolve()
    }
    prototype.pause = function () {
      pauses++
    }
    const module = await loadSourceModule('../src/inject/immersiveMediaGate.ts', {
      '~/utils/iframeActivity': { isImmersiveFrame: () => true },
      '~/utils/videoMetadataBridge': { parseVideoMetadataEvent: event => JSON.parse(event.detail) },
    }, { window: { addEventListener: (name, callback) => listeners.set(name, callback), removeEventListener: name => listeners.delete(name) }, location: { href: 'https://www.bilibili.com/video/av1' }, HTMLMediaElement: window.HTMLMediaElement })
    module.setupImmersiveMediaGate('bridge')
    const activate = (active, autoPlay, channelId = 'bridge') => listeners.get(constants.IMMERSIVE_MAIN_ACTIVITY)({ detail: JSON.stringify({ channelId, href: 'https://www.bilibili.com/video/av1', active, autoPlay }) })
    try {
      await assert.rejects(media.play(), { name: 'NotAllowedError' })
      assert.equal(plays, 0)
      activate(true, true, 'stale')
      await assert.rejects(media.play(), { name: 'NotAllowedError' })
      assert.equal(plays, 0)
      activate(true, false)
      await assert.rejects(media.play(), { name: 'NotAllowedError' })
      assert.equal(plays, 0, 'the entry gesture does not silently enable native autoplay')
      const controls = document.createElement('div')
      controls.className = 'bpx-player-control-wrap'
      const quality = document.createElement('button')
      listeners.get('pointerdown')({ type: 'pointerdown', isTrusted: true, composedPath: () => [quality, controls] })
      await assert.rejects(media.play(), { name: 'NotAllowedError' })
      const play = document.createElement('button')
      play.className = 'bpx-player-ctrl-play'
      listeners.get('pointerdown')({ type: 'pointerdown', isTrusted: true, composedPath: () => [play, controls] })
      await media.play()
      assert.equal(plays, 1, 'only an actual native play gesture enables playback when automatic start is off')
      activate(true, true)
      await media.play()
      assert.equal(plays, 2)
      activate(false, true)
      await assert.rejects(media.play(), { name: 'NotAllowedError' })
      assert.equal(plays, 2)
      listeners.get('play')({ target: media })
      assert.ok(pauses > 0)
      const activity = await loadSourceModule('../src/utils/iframeActivity.ts', {}, { window: { parent: {}, name: constants.IMMERSIVE_PRELOAD_NAME, dispatchEvent() {} } })
      assert.equal(activity.isIframeDocumentActive(), false)
      const history = await loadSourceFunctions('../src/utils/videoVisitHistory.ts', ['recordVideoVisit', 'recordVideoWatchProgress'], { isIframeDocumentActive: activity.isIframeDocumentActive, record: () => assert.fail('inactive history write') })
      assert.equal(history.recordVideoVisit({ aid: 1 }), false)
      assert.equal(history.recordVideoWatchProgress({ aid: 1 }, 10, 20, false, 'epoch'), false)
    }
    finally {
      listeners.get('pagehide')({ persisted: false })
      prototype.play = originalPlay
      prototype.pause = originalPause
    }
  })
}
