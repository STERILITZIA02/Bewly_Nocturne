import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import { compileString } from 'sass'

import { loadSourceFunctions } from './sourceFunctionHarness'

export function registerMotionContinuityChecks(check, { Vue, flush }) {
  check('Motion: cached page refresh and account-placeholder handoff do not reenter the Vue renderer', async () => {
    const { useReadyPageTransition } = await import('../src/composables/useReadyPageTransition')
    const revision = Vue.ref(0)
    const accountReady = Vue.ref(false)
    const errors = []
    let mounted = 0
    let maxMounted = 0
    const Page = Vue.defineComponent({
      props: ['revision'],
      setup(props) {
        mounted++
        maxMounted = Math.max(maxMounted, mounted)
        Vue.onBeforeUnmount(() => mounted--)
        return () => Vue.h('section', { 'data-ready-page': props.revision }, `videos ${props.revision}`)
      },
    })
    const Loading = { render: () => Vue.h('div', { 'data-account-placeholder': '' }, 'loading') }
    const host = document.body.appendChild(document.createElement('div'))
    const app = Vue.createApp({
      setup() {
        const hooks = useReadyPageTransition(() => Page, () => Promise.resolve(Page))
        return () => Vue.h(Vue.Transition, { ...hooks, mode: 'out-in' }, {
          default: () => accountReady.value ? Vue.h(Page, { key: revision.value, revision: revision.value }) : Vue.h(Loading),
        })
      },
    })
    app.config.errorHandler = error => errors.push(String(error))
    try {
      app.mount(host)
      await flush()
      assert.ok(host.querySelector('[data-account-placeholder]'))
      accountReady.value = true
      await flush()
      assert.deepEqual(errors, [], 'initial account readiness must safely replace its placeholder')
      assert.equal(host.querySelector('[data-ready-page]')?.textContent, 'videos 0')
      for (let value = 1; value <= 3; value++) {
        revision.value = value
        await flush()
        assert.deepEqual(errors, [], 'cached modules must not call afterLeave inside an unfinished render patch')
        assert.equal(host.querySelector('[data-ready-page]')?.textContent, `videos ${value}`)
      }
      accountReady.value = false
      await flush()
      assert.ok(host.querySelector('[data-account-placeholder]'))
      accountReady.value = true
      await flush()
      assert.equal(host.querySelector('[data-ready-page]')?.textContent, 'videos 3')
      assert.deepEqual(errors, [])
      assert.equal(maxMounted, 1, 'out-in keeps a single data owner')
    }
    finally {
      try {
        app.unmount()
      }
      catch (error) {
        // A corrupt old tree can fail teardown too; keep the first assertion.
        errors.push(String(error))
      }
      host.remove()
    }
    assert.deepEqual(errors, [], 'teardown must also remain valid after repeated refreshes')
  })

  check('Motion: queued cached leaves are invalidated by cancellation, replacement and scope disposal', async () => {
    const { useReadyPageTransition } = await import('../src/composables/useReadyPageTransition')
    const component = Vue.shallowRef({ id: 'ready' })
    const pending = new Map()
    const scope = Vue.effectScope()
    const hooks = scope.run(() => useReadyPageTransition(() => component.value, target => target.id === 'ready'
      ? Promise.resolve()
      : new Promise(resolve => pending.set(target.id, resolve))))
    const root = document.body.appendChild(document.createElement('section'))
    let finished = 0
    try {
      await flush()
      hooks.onLeave(root, () => finished++)
      assert.equal(finished, 0, 'cached readiness must never complete a leave synchronously')
      hooks.onLeaveCancelled(root)
      await flush()
      assert.equal(finished, 0)
      hooks.onLeave(root, () => finished++)
      component.value = { id: 'pending' }
      await flush()
      assert.equal(finished, 0, 'a previously queued ready completion cannot remove the page for an unready new target')
      pending.get('pending')()
      await flush()
      assert.equal(finished, 1)
      hooks.onLeave(root, () => finished++)
      scope.stop()
      await flush()
      assert.equal(finished, 1, 'disposed transitions cannot call back into the renderer')
    }
    finally {
      scope.stop()
      root.remove()
    }
  })

  check('Motion: Settings holds Dock through exit, waits before release and cancels release on reopening or disposal', async () => {
    const timers = new Map()
    let id = 0
    const context = await loadSourceFunctions('../src/composables/useSettingsPanel.ts', ['useSettingsPanel'], {
      ...Vue,
      setTimeout: (callback, delay) => {
        timers.set(++id, { callback, delay })
        return id
      },
      clearTimeout: id => timers.delete(id),
    })
    const scope = Vue.effectScope()
    const panel = scope.run(context.useSettingsPanel)
    panel.showSettings.value = true
    assert.equal(panel.settingsDockHeld.value, true)
    panel.showSettings.value = false
    assert.equal(panel.settingsDockHeld.value, true, 'closing visibility does not release Dock during the flight')
    assert.equal(timers.size, 0)
    panel.onSettingsAfterLeave()
    assert.equal([...timers.values()][0].delay, 250)
    panel.showSettings.value = true
    assert.equal(timers.size, 0, 'reopening cancels the pending release')
    panel.onSettingsAfterLeave()
    assert.equal(timers.size, 0, 'a late leave completion cannot release an open Settings panel')
    panel.showSettings.value = false
    panel.onSettingsAfterLeave()
    const release = [...timers.values()][0].callback
    timers.clear()
    release()
    assert.equal(panel.settingsDockHeld.value, false)
    panel.showSettings.value = true
    panel.showSettings.value = false
    panel.onSettingsAfterLeave()
    scope.stop()
    assert.equal(timers.size, 0)
  })

  check('Motion: settings flies from the real trigger and returns to it without changing glass opacity', async () => {
    const { useSettingsMotion } = await import('../src/composables/useSettingsMotion')
    const previous = window.matchMedia
    window.matchMedia = () => ({ matches: false })
    const root = document.body.appendChild(document.createElement('div'))
    const panel = root.appendChild(document.createElement('section'))
    panel.id = 'settings-window'
    panel.style.setProperty('--bew-settings-source-x', '1150px')
    panel.style.setProperty('--bew-settings-source-y', '750px')
    panel.style.setProperty('--bew-settings-source-size', '40px')
    panel.getBoundingClientRect = () => ({ left: 100, top: 50, width: 1000, height: 700 })
    const frames = []
    panel.animate = (keyframes) => {
      frames.push(keyframes)
      return { finished: new Promise(() => {}), cancel() {} }
    }
    const scope = Vue.effectScope()
    const hooks = scope.run(useSettingsMotion)
    try {
      hooks.onEnter(root, () => {})
      const start = frames[0][0].transform.trim()
      assert.equal(start, 'translate3d(550px, 350px, 0) scale(0.04)')
      hooks.onEnterCancelled(root)
      hooks.onLeave(root, () => {})
      assert.equal(frames[1][1].transform.trim(), start, 'close targets the exact opening anchor')
      assert.ok(frames.flat().every(frame => Object.keys(frame).join() === 'transform'))
      hooks.onLeaveCancelled(root)
      panel.style.setProperty('--bew-settings-source-size', '0px')
      hooks.onEnter(root, () => {})
      assert.ok(frames.at(-1)[1].transform === 'none')
    }
    finally {
      scope.stop()
      root.remove()
      window.matchMedia = previous
    }
  })

  check('Motion: page handoff waits only for the latest module and cancellation restores the old view', async () => {
    const { useReadyPageTransition } = await import('../src/composables/useReadyPageTransition')
    const gates = new Map()
    const selected = Vue.shallowRef({ id: 'a' })
    const scope = Vue.effectScope()
    const hooks = scope.run(() => useReadyPageTransition(() => selected.value, component => new Promise(resolve => gates.set(component.id, resolve))))
    const root = document.body.appendChild(document.createElement('section'))
    root.inert = false
    let finishes = 0
    gates.get('a')()
    await flush()
    selected.value = { id: 'b' }
    hooks.onBeforeLeave(root)
    hooks.onLeave(root, () => finishes++)
    assert.equal(root.inert, true)
    assert.equal(root.isConnected, true)
    assert.equal(finishes, 0)
    selected.value = { id: 'c' }
    gates.get('c')()
    await flush()
    assert.equal(finishes, 1, 'a slow obsolete B cannot hold up ready C')
    gates.get('b')()
    await flush()
    assert.equal(finishes, 1)
    selected.value = { id: 'd' }
    hooks.onLeave(root, () => finishes++)
    hooks.onLeaveCancelled(root)
    gates.get('d')()
    await flush()
    assert.equal(root.inert, false)
    assert.equal(finishes, 1)
    scope.stop()
    root.remove()
  })

  check('Motion: skeleton groups share one observer, pause offscreen, and release the last subscriber', async () => {
    const { observeSkeletonGroup } = await import('../src/utils/skeletonVisibility')
    const previous = globalThis.IntersectionObserver
    const hidden = Object.getOwnPropertyDescriptor(document, 'hidden')
    const observers = []
    globalThis.IntersectionObserver = class {
      targets = new Set()
      constructor(callback) {
        this.callback = callback
        observers.push(this)
      }

      observe(node) { this.targets.add(node) }
      unobserve(node) { this.targets.delete(node) }
      disconnect() { this.targets.clear() }
    }
    Object.defineProperty(document, 'hidden', { value: false, configurable: true })
    const group = document.body.appendChild(document.createElement('article'))
    group.setAttribute('aria-hidden', 'true')
    const a = group.appendChild(document.createElement('span'))
    a.setAttribute('data-bew-skeleton', '')
    const style = document.head.appendChild(document.createElement('style'))
    style.textContent = compileString(await readFile(new URL('../src/styles/skeleton.scss', import.meta.url), 'utf8')).css
    const b = group.appendChild(document.createElement('span'))
    const releaseA = observeSkeletonGroup(a)
    const releaseB = observeSkeletonGroup(b)
    try {
      assert.equal(observers.length, 1)
      assert.equal(observers[0].targets.size, 1)
      observers[0].callback([{ target: group, isIntersecting: true }])
      assert.equal(group.hasAttribute('data-bew-skeleton-paused'), false)
      assert.equal(getComputedStyle(a).animationPlayState, 'running', 'decorative aria-hidden skeletons remain animated when visible')
      Object.defineProperty(document, 'hidden', { value: true, configurable: true })
      document.dispatchEvent(new window.Event('visibilitychange'))
      assert.equal(group.hasAttribute('data-bew-skeleton-paused'), true)
      assert.equal(getComputedStyle(a).animationPlayState, 'paused', 'background pages still pause')
      Object.defineProperty(document, 'hidden', { value: false, configurable: true })
      document.dispatchEvent(new window.Event('visibilitychange'))
      assert.equal(group.hasAttribute('data-bew-skeleton-paused'), false)
      assert.equal(getComputedStyle(a).animationPlayState, 'running', 'returning to the page resumes the same skeleton')
      observers[0].callback([{ target: group, isIntersecting: false }])
      assert.equal(group.hasAttribute('data-bew-skeleton-paused'), true)
      releaseA()
      assert.equal(observers[0].targets.size, 1)
      releaseB()
      assert.equal(observers[0].targets.size, 0)
      assert.equal(group.hasAttribute('data-bew-skeleton-paused'), false)
    }
    finally {
      releaseA()
      releaseB()
      group.remove()
      style.remove()
      globalThis.IntersectionObserver = previous
      if (hidden)
        Object.defineProperty(document, 'hidden', hidden)
      else delete document.hidden
    }
  })

  check('Motion: glass panel entry keeps material opaque and reverses from the painted frame', async () => {
    const { useGlassPanelMotion } = await import('../src/composables/useGlassPanelMotion')
    const previousMatchMedia = window.matchMedia
    window.matchMedia = () => ({ matches: false })
    const root = document.createElement('div')
    const panel = root.appendChild(document.createElement('section'))
    panel.className = 'glass-panel'
    panel.style.transform = 'translate(0px, 0px)'
    panel.style.setProperty('--bew-panel-enter-transform', 'translateY(8px)')
    panel.style.setProperty('--bew-panel-leave-transform', 'translateY(4px)')
    document.body.append(root)
    const records = []
    const paintRecords = []
    const paint = panel.appendChild(document.createElement('div'))
    paint.className = 'paint'
    paint.style.opacity = '1'
    paint.animate = (frames, options) => {
      const record = {
        frames,
        options,
        cancel() { this.cancelled = true },
        pause() { this.paused = true },
      }
      paintRecords.push(record)
      return record
    }
    panel.animate = (frames, options) => {
      let finish
      const record = { frames, options, cancelled: false, finished: new Promise(resolve => finish = resolve), cancel() {
        this.cancelled = true
      }, pause() { this.paused = true }, finish: () => finish() }
      records.push(record)
      return record
    }
    const scope = Vue.effectScope()
    const hooks = scope.run(() => useGlassPanelMotion('.glass-panel', undefined, '.paint'))
    let completed = 0
    try {
      hooks.onEnter(root, () => completed++)
      assert.equal(root.inert, false)
      assert.ok(records[0].frames.every(frame => Object.keys(frame).length === 1 && 'transform' in frame), 'no opacity/filter transition on glass or its ancestors')
      assert.equal(paintRecords[0].frames[0].opacity, '0')
      paint.style.opacity = '0.4'
      panel.style.transform = 'matrix(1, 0, 0, 1, 0, 3)'
      hooks.onEnterCancelled(root)
      panel.style.transform = 'translate(0px, 0px)'
      hooks.onLeave(root, () => completed++)
      assert.equal(records[1].frames[0].transform, 'matrix(1, 0, 0, 1, 0, 3)')
      assert.equal(paintRecords[1].frames[0].opacity, '0.4', 'reverse continues from the painted opacity')
      assert.deepEqual(paintRecords[1].frames.slice(1), [{ opacity: 0, offset: 0.72 }, { opacity: 0, offset: 1 }], 'paint disappears before the shell reaches the trigger')
      assert.equal(root.inert, true)
      records[0].finish()
      await flush()
      assert.equal(completed, 0, 'obsolete entry cannot finish the current exit')
      records[1].finish()
      await flush()
      assert.equal(completed, 1)
      hooks.onLeave(root, () => completed++)
      root.remove()
      hooks.onLeaveCancelled(root)
      assert.equal(records[2].paused, true, 'detached KeepAlive leave freezes until reattachment')
      assert.equal(paintRecords[2].paused, true, 'paint and geometry pause together')
      assert.equal(records[2].cancelled, false)
      document.body.append(root)
      panel.style.transform = 'matrix(0.5, 0, 0, 0.5, 20, 30)'
      hooks.onEnter(root, () => completed++)
      assert.equal(records[3].frames[0].transform, 'matrix(0.5, 0, 0, 0.5, 20, 30)')
      records[3].finish()
      await flush()
      window.matchMedia = () => ({ matches: true })
      hooks.onEnter(root, () => completed++)
      assert.equal(root.inert, false)
      assert.equal(records.length, 4, 'reduced motion resolves immediately')
      assert.equal(paintRecords.length, 4)
      assert.equal(completed, 3)
    }
    finally {
      scope.stop()
      root.remove()
      window.matchMedia = previousMatchMedia
    }
  })

  check('Motion: Dock expansion cancels a collapse awaiting its layout frame', async () => {
    let release
    let frames = 0
    const tick = new Promise(resolve => release = resolve)
    const context = await loadSourceFunctions('../src/components/Dock/Dock.vue', ['clearDockMorphSchedule', 'startDockShellCollapse', 'expandDock'], {
      dockMorphGeneration: 0,
      dockContentTimer: undefined,
      dockMorphFrame: undefined,
      dockMorphCompletionTimer: undefined,
      dockReady: Vue.ref(true),
      isDockCollapsed: Vue.ref(false),
      isDockTransitioning: Vue.ref(false),
      isDockContentVisible: Vue.ref(true),
      isDockCollapsedTriggerVisible: Vue.ref(false),
      dockMorphDirection: Vue.ref(undefined),
      dockShellSurfaceRef: Vue.ref({ offsetHeight: 50 }),
      cacheExpandedDockSize() {},
      completeDockMorph() {},
      scheduleDockMorphCompletion() {},
      clearTimeout() {},
      cancelAnimationFrame() {},
      nextTick: () => tick,
      requestAnimationFrame: () => ++frames,
    })
    const pending = context.startDockShellCollapse()
    context.expandDock()
    release()
    await pending
    assert.equal(frames, 0, 'the obsolete collapse cannot enqueue another frame')
    assert.equal(context.isDockCollapsed.value, false)
    assert.equal(context.isDockContentVisible.value, true)
    assert.equal(context.isDockTransitioning.value, false)
  })

  check('Motion: critical spring is frame-rate independent and settles after reversal', async () => {
    const { stepCriticalSpring } = await import('../src/composables/useSpringValue')
    const outcomes = [30, 60, 120].map((rate) => {
      let state = { position: 0, velocity: 0 }
      for (let frame = 0; frame < rate; frame++)
        state = stepCriticalSpring(state.position, state.velocity, frame < rate / 2 ? 3 : 0, 1 / rate, 0.2)
      return state
    })
    for (const state of outcomes) {
      assert.ok(Math.abs(state.position - outcomes[0].position) < 1e-10)
      assert.ok(Math.abs(state.position) < 0.001)
      assert.ok(Math.abs(state.velocity) < 0.01)
    }
  })

  check('Motion: retiring rows retain geometry and restore interaction on cancellation', async () => {
    const { retiringListTransition } = await import('../src/utils/motionPresence')
    const parent = document.createElement('div')
    const row = parent.appendChild(document.createElement('button'))
    row.style.color = 'red'
    row.inert = false
    document.body.append(parent)
    Object.defineProperty(row, 'offsetParent', { value: parent })
    parent.getBoundingClientRect = () => ({ top: 10, left: 20 })
    row.getBoundingClientRect = () => ({ top: 50, left: 60, width: 200, height: 80 })
    retiringListTransition.onBeforeLeave(row)
    assert.equal(row.inert, true)
    assert.equal(row.style.position, 'absolute')
    assert.equal(row.style.top, '40px')
    assert.equal(row.style.width, '200px')
    retiringListTransition.onLeaveCancelled(row)
    assert.equal(row.inert, false)
    assert.equal(row.style.position, '')
    assert.equal(row.getAttribute('aria-hidden'), null)
    assert.equal(row.style.color, 'red')
    parent.remove()
  })

  check('Motion: visible layout changes cancel obsolete frames without animating offscreen rows', async () => {
    const { useLayoutMotion } = await import('../src/composables/useLayoutMotion')
    const previousMatchMedia = window.matchMedia
    window.matchMedia = () => ({ matches: false })
    const root = document.createElement('div')
    root.animate = () => {}
    document.body.append(root)
    const records = []
    let top = 30
    const makeRow = (key, position) => {
      const row = root.appendChild(document.createElement('article'))
      row.style.opacity = '1'
      row.dataset.motionKey = key
      row.getBoundingClientRect = () => ({ left: 0, top: position(), bottom: position() + 100, width: 200, height: 100 })
      row.animate = (frames) => {
        const record = { frames, cancelled: false, finished: new Promise(() => {}), cancel() {
          this.cancelled = true
        } }
        records.push(record)
        return record
      }
    }
    makeRow('visible', () => top)
    makeRow('offscreen', () => 10000)
    const revision = Vue.ref(0)
    const scope = Vue.effectScope()
    scope.run(() => {
      useLayoutMotion(Vue.ref(root), revision)
      Vue.watch(revision, value => top = value === 1 ? 90 : 120, { flush: 'post' })
    })
    revision.value++
    await flush()
    assert.equal(records.length, 1)
    assert.equal(records[0].frames[0].transform, 'translate(0px, -60px)')
    revision.value++
    await flush()
    assert.equal(records[0].cancelled, true)
    scope.stop()
    assert.ok(records.every(record => record.cancelled))
    root.remove()
    window.matchMedia = previousMatchMedia
  })
}
