import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'

import { compileString } from 'sass'

export function registerPlatformCompatibilityChecks(check, { Vue, flush, compileComponent }) {
  check('Platform: PiP carries its Shadow styles and theme, closes on unmount, and retires late or rejected windows', async () => {
    const previous = Object.getOwnPropertyDescriptor(window, 'documentPictureInPicture')
    const previousWarn = console.warn
    const warnings = []
    console.warn = (...args) => warnings.push(args)
    const dark = Vue.ref(true)
    const Pip = await compileComponent('../src/components/PipWindow.vue', {
      '~/composables/useDark': { useDark: () => ({ isDark: dark, appearanceStyle: Vue.ref({}), accentColor: Vue.ref('#00a1d6'), motionPreference: Vue.ref('system') }) },
      '~/components/Button.vue': { default: { render: () => Vue.h('button') } },
      '~/utils/appearance': await import('../src/utils/appearance'),
      '~/utils/reducedMotion': { applyMotionPreference() {} },
      '~/utils/themeColor': await import('../src/utils/themeColor'),
    }, { globals: { console } })
    try {
      for (const mode of ['opened', 'unmounted', 'rejected']) {
        const sourceHost = document.body.appendChild(document.createElement('div'))
        sourceHost.className = 'dark disable-frosted-glass'
        sourceHost.style.setProperty('--bew-font-scale', '1.5')
        const source = sourceHost.attachShadow({ mode: 'open' })
        const stylesheet = source.appendChild(document.createElement('style'))
        stylesheet.textContent = ':host { --bew-bg: #171717; } .bewly-wrapper { color: white; }'
        const mount = source.appendChild(document.createElement('div'))
        const pipDocument = document.implementation.createHTMLDocument('PiP')
        const listeners = new Map()
        let closes = 0
        const opened = Vue.markRaw({
          document: pipDocument,
          getComputedStyle: () => ({ getPropertyValue: () => '#171717' }),
          addEventListener: (name, listener) => listeners.set(name, listener),
          close() {
            closes++
            listeners.get('pagehide')?.()
          },
        })
        let resolve
        let reject
        window.documentPictureInPicture = { requestWindow: () => new Promise((done, fail) => {
          resolve = done
          reject = fail
        }) }
        let emitted = 0
        const app = Vue.createApp(Pip, { url: 'https://www.bilibili.com/video/BVfixture', onClose: () => emitted++ })
        app.config.globalProperties.$t = key => key
        let unmounted = false
        try {
          app.mount(mount)
          if (mode === 'unmounted') {
            app.unmount()
            unmounted = true
            await flush()
          }
          if (mode === 'rejected')
            reject(new DOMException('User activation required', 'NotAllowedError'))
          else resolve(opened)
          await flush()
          if (mode === 'opened') {
            const host = pipDocument.body.firstElementChild
            assert.equal(host.shadowRoot.querySelector('style').textContent, stylesheet.textContent)
            assert.equal(stylesheet.getRootNode(), source, 'the opener keeps its own stylesheet')
            assert.ok(host.shadowRoot.querySelector('.bewly-wrapper iframe'))
            assert.equal(host.style.getPropertyValue('--bew-font-scale'), '1.5')
            assert.equal(host.classList.contains('disable-frosted-glass'), true)
            dark.value = false
            await flush()
            assert.equal(host.classList.contains('dark'), false, 'theme changes reach the PiP shadow host')
            dark.value = true
            app.unmount()
            unmounted = true
            await flush()
            assert.equal(closes, 1)
            assert.equal(emitted, 0, 'unmount does not call back into its retired parent')
          }
          else if (mode === 'unmounted') {
            assert.equal(closes, 1, 'a late window is immediately closed')
            assert.equal(pipDocument.body.childElementCount, 0)
            assert.equal(emitted, 0)
          }
          else {
            assert.equal(emitted, 1, 'request rejection releases the open-menu state')
            assert.equal(warnings.length, 1)
          }
        }
        finally {
          if (!unmounted)
            app.unmount()
          await flush()
          sourceHost.remove()
        }
      }
    }
    finally {
      if (previous)
        Object.defineProperty(window, 'documentPictureInPicture', previous)
      else delete window.documentPictureInPicture
      console.warn = previousWarn
    }
  })

  check('Platform: fallback popup centers on the browser window even on a monitor with negative coordinates', async () => {
    const { loadSourceFunctions } = await import('./sourceFunctionHarness.ts')
    const calls = []
    let closed = 0
    const context = await loadSourceFunctions('../src/components/PipWindow.vue', ['openPipWindow'], {
      window: { innerWidth: 1000, innerHeight: 800, outerWidth: 1200, outerHeight: 900, screenX: -1920, screenY: 100, open: (...args) => calls.push(args) },
      currentUrl: { value: 'https://www.bilibili.com/video/BVfixture' },
      handleClose: () => closed++,
    })
    await context.openPipWindow()
    assert.equal(calls[0][0], 'https://www.bilibili.com/video/BVfixture')
    assert.match(calls[0][2], /^width=800,height=640,left=-1720,top=230,/)
    assert.equal(closed, 1)
  })

  check('Platform: elastic rows preserve browser zoom and schedule rebound work only beyond an edge', async () => {
    const { createElasticWheelScroll } = await import('../src/utils/elasticScroll')
    const previousMedia = window.matchMedia
    const previousSetTimeout = globalThis.setTimeout
    const previousClearTimeout = globalThis.clearTimeout
    const timers = new Map()
    let timerId = 0
    const media = { matches: false }
    window.matchMedia = () => media
    globalThis.setTimeout = (callback) => {
      timers.set(++timerId, callback)
      return timerId
    }
    globalThis.clearTimeout = id => timers.delete(id)
    const scroller = document.createElement('div')
    const track = document.createElement('div')
    Object.defineProperties(scroller, { clientWidth: { value: 400 }, scrollWidth: { value: 1000 } })
    const elastic = createElasticWheelScroll(scroller, track)
    const wheel = (options) => {
      const event = new window.WheelEvent('wheel', { cancelable: true, ...options })
      elastic.handleWheel(event)
      return event
    }
    try {
      for (let index = 0; index < 10; index++)
        assert.equal(wheel({ deltaY: 3, deltaMode: 1 }).defaultPrevented, true)
      assert.equal(scroller.scrollLeft, 480)
      assert.equal(timerId, 0, 'ordinary scrolling has no rebound timers')
      assert.equal(wheel({ deltaY: 100, ctrlKey: true }).defaultPrevented, false)
      assert.equal(scroller.scrollLeft, 480, 'Ctrl+wheel/pinch zoom does not move the row')
      const consumed = new window.WheelEvent('wheel', { deltaY: 100, cancelable: true })
      consumed.preventDefault()
      elastic.handleWheel(consumed)
      assert.equal(scroller.scrollLeft, 480, 'a nested control already owns this event')
      wheel({ deltaX: 1, deltaMode: 2 })
      assert.equal(scroller.scrollLeft, 600)
      assert.notEqual(track.style.translate, '')
      assert.equal(timers.size, 1)
      elastic.dispose()
      assert.equal(timers.size, 0)
      assert.equal(track.style.translate, '')
      media.matches = true
      scroller.scrollLeft = 0
      wheel({ deltaY: 900 })
      assert.equal(scroller.scrollLeft, 600)
      assert.equal(track.style.translate, '', 'reduced motion also skips the stretch, not just its return')
      assert.equal(timers.size, 0)
    }
    finally {
      elastic.dispose()
      window.matchMedia = previousMedia
      globalThis.setTimeout = previousSetTimeout
      globalThis.clearTimeout = previousClearTimeout
    }
  })

  check('Platform: horizontal lists normalize pixel, line and page wheels without consuming zoom or edge scrolling', async () => {
    window.matchMedia ??= () => ({ matches: false, addEventListener() {}, removeEventListener() {} })
    const enabled = Vue.ref({ enableHorizontalScrolling: true })
    const Horizontal = await compileComponent('../src/components/HorizontalScrollView.vue', { '~/logic': { settings: enabled } })
    const host = document.body.appendChild(document.createElement('div'))
    const app = Vue.createApp(Horizontal)
    try {
      app.mount(host)
      await flush()
      const scroller = host.querySelector('.horizontal-scroll-view__scroller')
      Object.defineProperties(scroller, { clientWidth: { value: 400 }, scrollWidth: { value: 2000 } })
      const wheel = (options) => {
        const event = new window.WheelEvent('wheel', { cancelable: true, ...options })
        scroller.dispatchEvent(event)
        return event
      }
      wheel({ deltaY: 20 })
      wheel({ deltaY: 3, deltaMode: 1 })
      wheel({ deltaY: 1, deltaMode: 2 })
      assert.equal(scroller.scrollLeft, 468)
      assert.equal(wheel({ deltaY: 100, ctrlKey: true }).defaultPrevented, false)
      assert.equal(wheel({ deltaX: 50, deltaY: 10 }).defaultPrevented, true, 'trackpad swipes scroll through the shared elastic handler')
      assert.equal(scroller.scrollLeft, 518)
      scroller.scrollLeft = 0
      assert.equal(wheel({ deltaY: -100 }).defaultPrevented, false, 'the start hands vertical wheels back to the page')
      scroller.scrollLeft = 1600
      assert.equal(wheel({ deltaY: 100 }).defaultPrevented, false, 'so does the end')
      enabled.value.enableHorizontalScrolling = false
      await flush()
      assert.equal(wheel({ deltaY: 100 }).defaultPrevented, false, 'with the preference off, vertical wheels scroll the page')
      assert.equal(wheel({ deltaX: 40 }).defaultPrevented, true, 'sideways swipes still scroll the row')
    }
    finally {
      app.unmount()
      host.remove()
    }
  })

  check('Platform: smooth scroll no-ops settle immediately at clamped and fractional Windows coordinates', async () => {
    const { scrollToPosition, getScrollIntent, cancelScrollIntent } = await import('../src/utils/scrollIntent')
    const previousMedia = window.matchMedia
    window.matchMedia = () => ({ matches: false })
    const viewport = document.body.appendChild(document.createElement('div'))
    Object.defineProperties(viewport, { clientHeight: { value: 400 }, scrollHeight: { value: 1000 } })
    const calls = []
    viewport.scrollTo = options => calls.push(options)
    try {
      for (const [from, to] of [[600, 800], [0, -20], [599.5, 600]]) {
        viewport.scrollTop = from
        const done = scrollToPosition(viewport, to, 'smooth')
        assert.equal(getScrollIntent(viewport).active, false, `${from} → ${to} must not wait for an absent scrollend`)
        await done
      }
      assert.equal(calls.length, 0)
      window.matchMedia = () => ({ matches: true })
      viewport.scrollTop = 0
      await scrollToPosition(viewport, 300, 'smooth')
      assert.deepEqual(calls, [{ top: 300, behavior: 'instant' }])
      assert.equal(getScrollIntent(viewport).active, false)
    }
    finally {
      cancelScrollIntent(viewport)
      viewport.remove()
      window.matchMedia = previousMedia
    }
  })

  check('Platform: IME confirmation does not submit or clear the shared search or send a private message', async () => {
    const Search = await compileComponent('../src/components/SidebarSearchControl.vue', {
      'vue-i18n': { useI18n: () => ({ t: key => key }) },
    })
    const host = document.body.appendChild(document.createElement('div'))
    const events = []
    const app = Vue.createApp(Search, { modelValue: '中文', label: '搜索', clearOnEscape: true, onSubmit: () => events.push('search'), onClear: () => events.push('clear') })
    const { loadSourceFunctions } = await import('./sourceFunctionHarness.ts')
    const composer = await loadSourceFunctions('../src/contentScripts/views/Notifications/whisper/experimental/MessageComposer.vue', ['handleKeydown'], {
      isComposing: { value: false },
      submitCurrent: () => events.push('send'),
    })
    try {
      app.mount(host)
      const input = host.querySelector('input')
      for (const key of ['Enter', 'Escape']) {
        const event = new KeyboardEvent('keydown', { key, keyCode: 229, bubbles: true, cancelable: true })
        input.dispatchEvent(event)
        assert.equal(event.defaultPrevented, false)
        composer.handleKeydown(event)
      }
      assert.deepEqual(events, [])
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
      composer.handleKeydown(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }))
      assert.deepEqual(events, ['search', 'send'])
    }
    finally {
      app.unmount()
      host.remove()
    }
  })

  check('Platform: production CSS minification preserves every shared motion duration', async () => {
    const { getMotionDuration } = await import('../src/utils/motionTiming')
    const require = createRequire(import.meta.url)
    const { transform } = createRequire(require.resolve('vite'))('esbuild')
    const variablesUrl = new URL('../src/styles/variables.scss', import.meta.url)
    const css = compileString(await readFile(variablesUrl, 'utf8'), { url: variablesUrl }).css
    // Exercise Vite's actual CSS compressor without building extension artifacts.
    const { code } = await transform(css, { loader: 'css', minify: true })
    const readToken = (source, name) => source.match(new RegExp(`${name}:\\s*([^;}]+)`))?.[1].trim()
    const style = document.createElement('div').style
    for (const [name, expected] of [['fast', 150], ['normal', 200], ['moderate', 300]]) {
      const key = `--bew-duration-${name}`
      const raw = readToken(css, key)
      const minified = readToken(code, key)
      assert.ok(raw && minified)
      style.setProperty(key, raw)
      assert.equal(getMotionDuration(style, key), expected)
      style.setProperty(key, minified)
      assert.equal(getMotionDuration(style, key), expected, `${key}: ${raw} → ${minified}`)
    }
    for (const [value, expected] of [['0s', 0], ['0ms', 0], ['0', 0], ['.25s', 250], ['250ms', 250], ['-2s', 200], ['Infinityms', 200], ['bad', 200], ['', 200]]) {
      style.setProperty('--test-time', value)
      assert.equal(getMotionDuration(style, '--test-time'), expected)
    }
  })

  check('Platform: panel timing accepts CSS seconds without turning 300ms into 0.3ms', async () => {
    const { useGlassPanelMotion } = await import('../src/composables/useGlassPanelMotion')
    const previous = window.matchMedia
    window.matchMedia = () => ({ matches: false })
    const root = document.body.appendChild(document.createElement('div'))
    const panel = root.appendChild(document.createElement('section'))
    panel.className = 'panel'
    panel.style.setProperty('--bew-panel-enter-duration', '.3s')
    let timing
    panel.animate = (_frames, options) => {
      timing = options
      return { finished: new Promise(() => {}), cancel() {} }
    }
    const scope = Vue.effectScope()
    const motion = scope.run(() => useGlassPanelMotion('.panel'))
    try {
      motion.onEnter(root, () => {})
      assert.equal(timing.duration, 300)
    }
    finally {
      scope.stop()
      root.remove()
      window.matchMedia = previous
    }
  })

  check('Platform: actual wheel keeps intermediate frames, input semantics and reduced motion with compressed CSS', async () => {
    const previousMedia = window.matchMedia
    const previousFrame = globalThis.requestAnimationFrame
    const previousCancel = globalThis.cancelAnimationFrame
    const previousNow = Object.getOwnPropertyDescriptor(performance, 'now')
    const frames = new Map()
    let frameId = 0
    let now = 0
    globalThis.requestAnimationFrame = (callback) => {
      frames.set(++frameId, callback)
      return frameId
    }
    globalThis.cancelAnimationFrame = id => frames.delete(id)
    Object.defineProperty(performance, 'now', { configurable: true, value: () => now })
    const step = async (milliseconds) => {
      now += milliseconds
      const callbacks = [...frames.values()]
      frames.clear()
      callbacks.forEach(callback => callback(now))
      await Vue.nextTick()
    }
    const firstFrames = []
    try {
      for (const reduced of [false, true]) {
        window.matchMedia = media => ({ media, get matches() {
          return reduced
        }, addEventListener() {}, removeEventListener() {} })
        const Wheel = await compileComponent('../src/components/WheelSelector.vue')
        for (const time of ['200ms', '.2s']) {
          const value = Vue.ref('a')
          const updates = []
          const host = document.body.appendChild(document.createElement('div'))
          const app = Vue.createApp({ render: () => Vue.h(Wheel, {
            modelValue: value.value,
            label: '分类',
            panelId: 'content',
            items: ['a', 'b', 'c', 'd'].map(value => ({ value, label: value, ariaLabel: value })),
            'onUpdate:modelValue': (next) => {
              value.value = next
              updates.push(next)
            },
          }) })
          try {
            app.mount(host)
            await flush()
            const root = host.querySelector('.wheel-selector')
            root.style.setProperty('--bew-duration-normal', time)
            const tabs = [...host.querySelectorAll('[role="tab"]')]
            const angle = () => Number(tabs[0].style.transform.match(/rotateX\(([-\d.]+)deg\)/)[1])
            tabs[1].click()
            await Vue.nextTick()
            assert.equal(value.value, 'b', 'the first click commits the page immediately')
            if (reduced) {
              assert.equal(angle(), 24)
              assert.equal(frames.size, 0, 'reduced motion does not manufacture a minimum animated frame')
            }
            else {
              await step(1000 / 60)
              const first = angle()
              assert.ok(first > 0 && first < 24, `${time} must not snap to the destination in one display frame`)
              firstFrames.push(first)
            }
            const wheel = async (deltaY, deltaMode, timeStamp, ctrlKey = false) => {
              const event = new window.WheelEvent('wheel', { deltaY, deltaMode, ctrlKey, bubbles: true, cancelable: true })
              Object.defineProperty(event, 'timeStamp', { value: timeStamp })
              root.dispatchEvent(event)
              await Vue.nextTick()
              return event
            }
            await wheel(3, 1, 1000)
            assert.equal(value.value, 'c', 'line-based mouse-wheel input remains supported')
            await wheel(4, 0, 1100)
            assert.equal(value.value, 'c', 'the inertial tail cannot select another page')
            await wheel(-3, 1, 1110)
            assert.equal(value.value, 'b', 'reversal is accepted during the current transition')
            const zoom = await wheel(120, 0, 1400, true)
            assert.equal(zoom.defaultPrevented, false, 'Ctrl+wheel remains browser zoom')
            assert.equal(value.value, 'b')
            tabs[1].focus()
            tabs[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }))
            await flush()
            assert.equal(document.activeElement, tabs[2])
            assert.equal(value.value, 'b', 'keyboard focus previews without committing a page')
            tabs[2].click()
            await Vue.nextTick()
            assert.deepEqual(updates, ['b', 'c', 'b', 'c'])
          }
          finally {
            app.unmount()
            host.remove()
          }
          assert.equal(frames.size, 0, 'unmount cancels pending spring frames')
        }
      }
      assert.ok(Math.abs(firstFrames[0] - firstFrames[1]) < 1e-9, 'ms and compressed s drive the same spring response')
    }
    finally {
      window.matchMedia = previousMedia
      globalThis.requestAnimationFrame = previousFrame
      globalThis.cancelAnimationFrame = previousCancel
      if (previousNow)
        Object.defineProperty(performance, 'now', previousNow)
      else delete performance.now
    }
  })

  check('Platform: compressed durations preserve folder exit and selection-anchor lifetimes', async () => {
    const { keepSelectionScrollAnchor } = await import('../src/utils/selectionScrollAnchor')
    const previousMedia = window.matchMedia
    const previousObserver = globalThis.ResizeObserver
    const previousSetTimeout = globalThis.setTimeout
    const previousClearTimeout = globalThis.clearTimeout
    const timers = new Map()
    const observers = []
    let timerId = 0
    const setTimer = (callback, delay) => {
      timers.set(++timerId, { callback, delay })
      return timerId
    }
    const clearTimer = id => timers.delete(id)
    globalThis.ResizeObserver = class {
      constructor() { observers.push(this) }
      observe() {}
      disconnect() { this.disconnected = true }
    }
    window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} })
    const viewport = document.body.appendChild(document.createElement('ul'))
    const expanded = Vue.ref(true)
    let app
    try {
      const Folder = await compileComponent('../src/contentScripts/views/Favorites/FavoriteSidebarItem.vue', {
        '@vueuse/core': { useIntersectionObserver: () => ({ stop() {} }) },
        '~/utils/main': { removeHttpFromUrl: value => value },
      }, { globals: { setTimeout: setTimer, clearTimeout: clearTimer } })
      app = Vue.createApp({ render: () => Vue.h(Folder, { title: '收藏夹', count: 0, icon: '', expanded: expanded.value }, () => Vue.h('button', '操作')) })
      app.mount(viewport)
      await flush()
      const row = viewport.querySelector('li')
      row.style.setProperty('--bew-duration-normal', '.2s')
      expanded.value = false
      await Vue.nextTick()
      assert.equal(timers.size, 1)
      assert.equal([...timers.values()][0].delay, 250, 'content stays mounted for 200ms plus the existing completion allowance')
      assert.ok(viewport.querySelector('.favorite-sidebar-item__actions'))
      const finish = [...timers.values()][0].callback
      timers.clear()
      finish()
      await Vue.nextTick()
      assert.equal(viewport.querySelector('.favorite-sidebar-item__actions'), null)

      globalThis.setTimeout = setTimer
      globalThis.clearTimeout = clearTimer
      viewport.style.overflowAnchor = 'auto'
      const release = keepSelectionScrollAnchor(row, viewport)
      assert.equal([...timers.values()][0].delay, 250, 'anchoring must not stop after only 50.2ms')
      assert.equal(viewport.style.overflowAnchor, 'none')
      viewport.dispatchEvent(new window.WheelEvent('wheel'))
      assert.equal(viewport.style.overflowAnchor, 'auto', 'user scroll intent still releases the anchor immediately')
      assert.equal(timers.size, 0)
      assert.equal(observers.at(-1).disconnected, true)
      release()

      // An opened row cut off by the list's edges glides into full view.
      const { revealSelectionRow } = await import('../src/utils/selectionScrollAnchor')
      const glides = []
      viewport.scrollTo = options => glides.push(options)
      viewport.getBoundingClientRect = () => ({ top: 100, bottom: 400, height: 300 })
      row.style.setProperty('--bew-space-2', '8px')
      viewport.scrollTop = 50
      row.getBoundingClientRect = () => ({ top: 300, bottom: 500, height: 200 })
      revealSelectionRow(row, viewport)
      assert.deepEqual(glides.at(-1), { top: 50 + 108, behavior: 'smooth' }, 'a row cut at the bottom rises until it ends 8px inside')
      row.getBoundingClientRect = () => ({ top: 60, bottom: 260, height: 200 })
      revealSelectionRow(row, viewport)
      assert.deepEqual(glides.at(-1), { top: 50 - 48, behavior: 'smooth' }, 'a row cut at the top drops to 8px inside')
      const count = glides.length
      row.getBoundingClientRect = () => ({ top: 150, bottom: 350, height: 200 })
      revealSelectionRow(row, viewport)
      assert.equal(glides.length, count, 'a row in full view stays')
    }
    finally {
      app?.unmount()
      viewport.remove()
      window.matchMedia = previousMedia
      globalThis.ResizeObserver = previousObserver
      globalThis.setTimeout = previousSetTimeout
      globalThis.clearTimeout = previousClearTimeout
    }
  })

  check('Platform: cancelled browser animation completes only its current transition', async () => {
    const { useGlassPanelMotion } = await import('../src/composables/useGlassPanelMotion')
    const previous = window.matchMedia
    window.matchMedia = () => ({ matches: false })
    const root = document.body.appendChild(document.createElement('div'))
    const panel = root.appendChild(document.createElement('section'))
    panel.className = 'panel'
    const records = []
    panel.animate = () => {
      let reject
      const record = { finished: new Promise((_resolve, r) => reject = r), cancel() {
        reject(new Error('cancelled'))
      } }
      records.push(record)
      return record
    }
    const scope = Vue.effectScope()
    const motion = scope.run(() => useGlassPanelMotion('.panel'))
    let completed = 0
    try {
      motion.onEnter(root, () => completed++)
      motion.onEnterCancelled(root)
      motion.onLeave(root, () => completed++)
      await flush()
      assert.equal(completed, 0, 'our interrupted entry cannot finish the newer exit')
      records[1].cancel()
      await flush()
      assert.equal(completed, 1, 'external/browser cancellation must not strand Vue leave/focus/Dock settlement')
      motion.onEnter(root, () => completed++)
      scope.stop()
      await flush()
      assert.equal(completed, 1, 'unmounted transitions never call back into Vue')
    }
    finally {
      scope.stop()
      root.remove()
      window.matchMedia = previous
    }
  })

  check('Platform: a failed paint animation cannot leave a partially animated modal blocking the page', async () => {
    const { useGlassPanelMotion } = await import('../src/composables/useGlassPanelMotion')
    const previous = window.matchMedia
    window.matchMedia = () => ({ matches: false })
    const root = document.body.appendChild(document.createElement('div'))
    const panel = root.appendChild(document.createElement('section'))
    panel.className = 'panel'
    const paint = panel.appendChild(document.createElement('div'))
    paint.className = 'paint'
    let cancelled = false
    panel.animate = () => ({ finished: new Promise(() => {}), cancel() {
      cancelled = true
    } })
    paint.animate = () => {
      throw new TypeError('Animation unavailable')
    }
    const originalWarn = console.warn
    const warnings = []
    console.warn = (...args) => warnings.push(args)
    const scope = Vue.effectScope()
    const motion = scope.run(() => useGlassPanelMotion('.panel', undefined, '.paint'))
    let completed = 0
    try {
      assert.doesNotThrow(() => motion.onLeave(root, () => completed++))
      await flush()
      assert.equal(completed, 1)
      assert.equal(cancelled, true)
      assert.equal(warnings.length, 1)
      assert.match(String(warnings[0][1]), /Animation unavailable/)
    }
    finally {
      scope.stop()
      root.remove()
      window.matchMedia = previous
      console.warn = originalWarn
    }
  })

  check('Platform: classic scrollbars preserve existing padding, nested locks and inline priorities', async () => {
    const { lockPageScroll, unlockPageScroll } = await import('../src/utils/pageScrollLock')
    const html = document.documentElement
    const body = document.body
    const oldHtml = html.getAttribute('style')
    const oldBody = body.getAttribute('style')
    const client = Object.getOwnPropertyDescriptor(html, 'clientWidth')
    html.style.setProperty('padding-right', '12px', 'important')
    html.style.setProperty('overflow-x', 'clip', 'important')
    html.style.setProperty('overflow-y', 'scroll')
    Object.defineProperty(html, 'clientWidth', { configurable: true, get: () => window.innerWidth - (html.style.overflow === 'hidden' ? 0 : 15) })
    try {
      lockPageScroll()
      assert.equal(html.style.paddingRight, '27px')
      lockPageScroll()
      assert.equal(html.style.paddingRight, '27px')
      unlockPageScroll()
      assert.equal(html.style.overflow, 'hidden')
      unlockPageScroll()
      assert.equal(html.style.paddingRight, '12px')
      assert.equal(html.style.getPropertyPriority('padding-right'), 'important')
      assert.equal(html.style.overflowX, 'clip')
      assert.equal(html.style.getPropertyPriority('overflow-x'), 'important')
      assert.equal(html.style.overflowY, 'scroll')
      // A stable gutter is still reserved when overflow becomes hidden.
      Object.defineProperty(html, 'clientWidth', { configurable: true, get: () => window.innerWidth - 15 })
      lockPageScroll()
      assert.equal(html.style.paddingRight, '12px', 'do not compensate a gutter that was never removed')
      unlockPageScroll()
    }
    finally {
      unlockPageScroll()
      unlockPageScroll()
      if (client)
        Object.defineProperty(html, 'clientWidth', client)
      else delete html.clientWidth
      if (oldHtml === null)
        html.removeAttribute('style')
      else html.setAttribute('style', oldHtml)
      if (oldBody === null)
        body.removeAttribute('style')
      else body.setAttribute('style', oldBody)
    }
  })
}
