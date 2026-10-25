import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'

import { compileString } from 'sass'

export function registerPlatformCompatibilityChecks(check, { Vue, flush, compileComponent }) {
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
        window.matchMedia = media => ({ media, matches: reduced, addEventListener() {}, removeEventListener() {} })
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
