import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import { compileString } from 'sass'

import { loadSourceFunctions } from './sourceFunctionHarness'
import { loadSourceModule } from './sourceModuleHarness'

export function registerMotionContinuityChecks(check, { Vue, flush }) {
  check('Motion: dialog source survives menu removal, uses Shadow DOM activation and expires after its event', async () => {
    const { providePanelOrigin, usePanelOrigin } = await import('../src/composables/usePanelOrigin')
    const host = document.body.appendChild(document.createElement('div'))
    const shadow = host.attachShadow({ mode: 'open' })
    const mount = shadow.appendChild(document.createElement('div'))
    let resolveOrigin
    const Receiver = { setup() {
      resolveOrigin = usePanelOrigin()
      return () => null
    } }
    const app = Vue.createApp({ setup() {
      const capture = providePanelOrigin()
      return () => Vue.h('section', { onClickCapture: capture, onKeydownCapture: capture }, [
        Vue.h('button', { id: 'source' }, [Vue.h('span', 'open')]),
        Vue.h(Receiver),
      ])
    } })
    try {
      app.mount(mount)
      const button = shadow.querySelector('button')
      let reads = 0
      button.getBoundingClientRect = () => {
        reads++
        return { left: 20, top: 60, width: 80, height: 32 }
      }
      button.querySelector('span').dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }))
      button.remove()
      assert.deepEqual(resolveOrigin(), { x: 60, y: 76, size: 80 }, 'capture uses the control, not the icon, even after its menu unmounts')
      assert.equal(reads, 1)
      await new Promise(resolve => setTimeout(resolve, 0))
      assert.equal(resolveOrigin(), undefined, 'unrelated timer-driven dialogs never reuse an old click')
      mount.querySelector('section').append(button)
      button.focus()
      button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, composed: true }))
      assert.deepEqual(resolveOrigin(), { x: 60, y: 76, size: 80 })
      app.unmount()
      button.remove()
      assert.equal(resolveOrigin(), undefined, 'scope disposal releases the captured source')
    }
    finally {
      host.remove()
    }
  })

  check('Motion: dialogs fly to their source, fade only paint layers and retain the exit until completion', async () => {
    const { useSourcePanelMotion } = await import('../src/composables/useSourcePanelMotion')
    const previous = window.matchMedia
    window.matchMedia = () => ({ matches: false })
    const root = document.body.appendChild(document.createElement('div'))
    const panel = root.appendChild(document.createElement('section'))
    panel.className = 'panel'
    panel.style.transform = 'translate(-50%, -50%)'
    panel.getBoundingClientRect = () => ({ left: 200, top: 100, width: 400, height: 300 })
    const surface = panel.appendChild(document.createElement('div'))
    surface.className = 'surface'
    const backdrop = root.appendChild(document.createElement('div'))
    backdrop.className = 'backdrop'
    const records = []
    for (const target of [panel, surface, backdrop]) {
      target.animate = (frames) => {
        let finish
        const record = { target, frames, finished: new Promise(resolve => finish = resolve), cancel() {
          this.cancelled = true
        }, finish: () => finish() }
        records.push(record)
        return record
      }
    }
    let hooks
    const app = Vue.createApp({ setup() {
      hooks = useSourcePanelMotion('.panel', ':scope > .panel > .surface, :scope > .backdrop', () => ({ x: 100, y: 600, size: 40 }))
      return () => null
    } })
    const mount = document.body.appendChild(document.createElement('div'))
    let done = 0
    try {
      app.mount(mount)
      hooks.onBeforeEnter(root)
      hooks.onEnter(root, () => done++)
      assert.equal(records[0].frames[0].transform, 'translate(-50%, -50%) translate3d(-300px, 350px, 0) scale(0.1)')
      assert.ok(records[0].frames.every(frame => Object.keys(frame).join() === 'transform'))
      assert.equal(records.length, 3, 'one geometry animation and one per paint surface, no per-frame observers')
      records[0].finish()
      await flush()
      assert.equal(done, 1)
      hooks.onLeave(root, () => done++)
      assert.equal(root.inert, true)
      assert.equal(records[3].frames[1].transform, records[0].frames[0].transform)
      assert.equal(records[4].frames[1].opacity, 0)
      assert.equal(records[4].frames[1].offset, 0.72, 'paint fades out before reaching the source')
      assert.equal(done, 1)
      app.unmount()
      assert.ok(records.every(record => record.cancelled))
      records[3].finish()
      await flush()
      assert.equal(done, 1, 'disposed completion cannot remove a replacement dialog')
    }
    finally {
      root.remove()
      mount.remove()
      window.matchMedia = previous
    }
  })

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
    const { stepCriticalSpring } = await import('../src/utils/spring')
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

  check('Motion: every deletion dissolves through the one particle effect, and restores on failure', async () => {
    const { dissolveElements, isDissolving } = await import('../src/utils/particleDissolve')
    const previous = document.documentElement.dataset.bewMotion
    document.documentElement.dataset.bewMotion = 'reduce'
    const row = document.body.appendChild(document.createElement('article'))
    row.inert = false
    const fades = []
    row.animate = (frames, options) => {
      const fade = { frames, options, cancelled: false, cancel() {
        this.cancelled = true
      } }
      fades.push(fade)
      return fade
    }
    const dissolve = dissolveElements(row)
    assert.equal(dissolveElements(row).released, dissolve.released, 'a second request joins the running dissolve')
    assert.equal(row.inert, true)
    assert.equal(fades[0].frames.at(-1).opacity, 0, 'reduced motion only fades out')
    assert.equal(fades[0].options.fill, 'forwards', 'the element stays hidden until its owner removes it')
    assert.equal(isDissolving(), false, 'no particles under reduced motion')
    await dissolve.released
    dissolve.restore()
    assert.equal(fades[0].cancelled, true)
    assert.equal(row.inert, false)
    row.remove()
    await dissolveElements(row).released
    assert.equal(fades.length, 1, 'detached elements release at once')
    if (previous === undefined)
      delete document.documentElement.dataset.bewMotion
    else document.documentElement.dataset.bewMotion = previous

    // Full motion: one bounded canvas of particles that outlives the element.
    document.documentElement.dataset.bewMotion = 'full'
    const globals = ['HTMLImageElement', 'HTMLVideoElement', 'HTMLCanvasElement', 'OffscreenCanvas', 'requestAnimationFrame']
    const saved = Object.fromEntries(globals.map(name => [name, globalThis[name]]))
    for (const name of globals.slice(0, 3))
      globalThis[name] = window[name]
    const getContext = HTMLCanvasElement.prototype.getContext
    let draws = 0
    const context = () => new Proxy({}, { get: (_, key) => key === 'getImageData' ? (_x, _y, width, height) => ({ data: new Uint8ClampedArray(width * height * 4).fill(255) }) : key === 'drawImage' ? () => draws++ : () => {}, set: () => true })
    globalThis.OffscreenCanvas = class {
      constructor(width, height) {
        Object.assign(this, { width, height })
      }

      getContext() { return context() }
    }
    HTMLCanvasElement.prototype.getContext = context
    globalThis.requestAnimationFrame = callback => setTimeout(() => callback(performance.now()), 16)
    const card = document.body.appendChild(document.createElement('article'))
    card.style.backgroundColor = 'rgb(20, 20, 20)'
    card.inert = false
    card.getBoundingClientRect = () => ({ left: 100, top: 100, width: 320, height: 280, right: 420, bottom: 380 })
    card.animate = () => ({ cancel() {} })
    try {
      const full = dissolveElements(card)
      const canvas = document.body.querySelector('canvas')
      assert.ok(canvas && Number.parseFloat(canvas.style.width) > 320, 'the canvas covers the element plus its drift')
      assert.equal(isDissolving(), true)
      await full.released
      card.remove()
      await new Promise(resolve => setTimeout(resolve, 600))
      assert.ok(draws > 100, 'cells of the element are drawn as particles')
      assert.equal(document.body.querySelector('canvas'), null, 'the canvas leaves when the particles end')
      assert.equal(isDissolving(), false)
    }
    finally {
      card.remove()
      HTMLCanvasElement.prototype.getContext = getContext
      Object.assign(globalThis, saved)
      if (previous === undefined)
        delete document.documentElement.dataset.bewMotion
      else document.documentElement.dataset.bewMotion = previous
    }

    const source = await readFile('src/utils/particleDissolve.ts', 'utf8')
    assert.match(source, /holdMotion\(duration\)/, 'the particle clock registers with motion priority')
    assert.match(source, /PARTICLE_BUDGET = \d+/, 'particles are bounded across running dissolves')
    assert.match(source, /canvas\.remove\(\)\s*canvas\.width = 0/, 'the canvas is released when the particles end')
    const entries = [
      'src/components/TopBar/components/pops/HistoryPop.vue',
      'src/components/TopBar/components/pops/WatchLaterPop.vue',
      'src/contentScripts/views/WatchLater/WatchLater.vue',
      'src/contentScripts/views/History/History.vue',
      'src/contentScripts/views/Favorites/FavoritesPage.vue',
      'src/contentScripts/views/Moments/Moments.vue',
      'src/components/MomentCard/MomentCommentSection.vue',
      'src/components/SearchBar/SearchBar.vue',
      'src/contentScripts/views/Home/following/FollowingGroupActions.vue',
      'src/contentScripts/views/Notifications/Notifications.vue',
      'src/components/Settings/PluginComponentsAndPages/MessagesPage/MessagesPage.vue',
      'src/components/Settings/PluginComponentsAndPages/Home/components/FilterByTitleTable.vue',
      'src/components/Settings/PluginComponentsAndPages/Home/components/FilterByUserTable.vue',
    ]
    for (const file of entries)
      assert.match(await readFile(file, 'utf8'), /dissolveElements\(/, `${file} dissolves what it deletes`)
    assert.doesNotMatch(await readFile('src/styles/transitionAndTransitionGroup.scss', 'utf8'), /library-list-leave/, 'no per-page removal fade')
  })

  check('Motion: extracted native comment motion preserves interruption, compressed duration and original inline styles', async () => {
    const { createCommentReplyMotion } = await import('../src/inject/commentReplyMotion')
    const preference = document.documentElement.dataset.bewMotion
    document.documentElement.dataset.bewMotion = 'full'
    const host = document.body.appendChild(document.createElement('div'))
    const target = document.createElement('div')
    target.id = 'expander'
    host.attachShadow({ mode: 'open' }).append(target)
    target.style.setProperty('--bew-duration-moderate', '.3s')
    target.style.overflow = 'auto'
    let height = 120
    let settled = 0
    const animations = []
    target.getBoundingClientRect = () => ({ height })
    target.animate = (frames, timing) => {
      const animation = { frames, timing, cancel() {
        this.cancelled = true
      } }
      animations.push(animation)
      return animation
    }
    const motion = createCommentReplyMotion(() => settled++)
    try {
      motion.captureCommentReplyMotion(host)
      height = 260
      motion.animateCommentReplyMotion(host)
      assert.equal(animations[0].timing.duration, 300)
      assert.deepEqual(animations[0].frames, [{ height: '120px' }, { height: '260px' }])
      height = 180
      motion.captureCommentReplyMotion(host)
      assert.equal(animations[0].cancelled, true)
      height = 80
      motion.animateCommentReplyMotion(host)
      animations[1].onfinish()
      assert.equal(target.style.height, '')
      assert.equal(target.style.overflow, 'auto')
      assert.equal(settled, 1)
      document.documentElement.dataset.bewMotion = 'reduce'
      motion.captureCommentReplyMotion(host)
      height = 200
      motion.animateCommentReplyMotion(host)
      assert.equal(animations.length, 2)
      assert.equal(settled, 2)
    }
    finally {
      host.remove()
      if (preference === undefined)
        delete document.documentElement.dataset.bewMotion
      else document.documentElement.dataset.bewMotion = preference
    }
  })

  check('Motion: concurrent deletion stays within the global particle budget and hidden pages release every canvas and frame', async () => {
    const { dissolveElements, isDissolving } = await import('../src/utils/particleDissolve')
    const preference = document.documentElement.dataset.bewMotion
    const hidden = Object.getOwnPropertyDescriptor(document, 'hidden')
    const names = ['HTMLImageElement', 'HTMLVideoElement', 'HTMLCanvasElement', 'OffscreenCanvas', 'requestAnimationFrame', 'cancelAnimationFrame']
    const saved = Object.fromEntries(names.map(name => [name, globalThis[name]]))
    for (const name of names.slice(0, 3))
      globalThis[name] = window[name]
    const getContext = HTMLCanvasElement.prototype.getContext
    const frames = new Map()
    let sequence = 0
    let draws = 0
    const context = () => new Proxy({}, { get: (_, key) => key === 'getImageData' ? (_x, _y, width, height) => ({ data: new Uint8ClampedArray(width * height * 4).fill(255) }) : key === 'drawImage' ? () => draws++ : () => {}, set: () => true })
    globalThis.OffscreenCanvas = class {
      constructor(width, height) { Object.assign(this, { width, height }) }
      getContext() { return context() }
    }
    HTMLCanvasElement.prototype.getContext = context
    globalThis.requestAnimationFrame = (callback) => {
      frames.set(++sequence, callback)
      return sequence
    }
    globalThis.cancelAnimationFrame = id => frames.delete(id)
    document.documentElement.dataset.bewMotion = 'full'
    const cards = Array.from({ length: 4 }, () => {
      const card = document.body.appendChild(document.createElement('article'))
      card.style.backgroundColor = 'rgb(20, 20, 20)'
      card.getBoundingClientRect = () => ({ left: 100, top: 100, width: 320, height: 280, right: 420, bottom: 380 })
      card.animate = () => ({ cancel() {} })
      return card
    })
    const runs = []
    try {
      cards.forEach(card => runs.push(dissolveElements(card)))
      const pending = [...frames.values()]
      frames.clear()
      pending.forEach(callback => callback(performance.now()))
      assert.equal(draws, 2400, 'four concurrent deletions still draw at most the one global budget')
      Object.defineProperty(document, 'hidden', { configurable: true, value: true })
      document.dispatchEvent(new Event('visibilitychange'))
      assert.equal(isDissolving(), false)
      assert.equal(document.querySelectorAll('canvas').length, 0)
      assert.equal(frames.size, 0, 'no RAF waits for the hidden page to resume')
      await Promise.all(runs.map(run => run.released))
    }
    finally {
      runs.forEach(run => run.restore())
      cards.forEach(card => card.remove())
      HTMLCanvasElement.prototype.getContext = getContext
      Object.assign(globalThis, saved)
      if (hidden)
        Object.defineProperty(document, 'hidden', hidden)
      else delete document.hidden
      if (preference === undefined)
        delete document.documentElement.dataset.bewMotion
      else document.documentElement.dataset.bewMotion = preference
    }
  })

  check('Motion: card and sidebar lists fade only inner edges with more content; screen edges and composers stay crisp', async () => {
    const css = compileString('@use "scrollEdgeFade"; @include scrollEdgeFade.global;', { loadPaths: ['src/styles'] }).css
    assert.match(css, /@property --bew-scroll-edge-top-clear\s*\{[^}]*initial-value: 1/, 'a list that fits keeps both edges opaque')
    assert.match(css, /animation-timeline: scroll\(self\), scroll\(self\)/)
    assert.match(css, /@supports \(animation-timeline: scroll\(\)\)/, 'browsers without scroll timelines keep the list unmasked')
    // Lists in cards and panels fade their inner edges.
    const owners = {
      'src/contentScripts/views/Moments/MomentsHotSearch.vue': '.moments-hot-search__loading {',
      'src/components/MomentCard/MomentCommentSection.vue': '.moment-comments__list',
      'src/contentScripts/views/Home/components/SubscribedSeries.vue': '.series-updates-list',
    }
    for (const [file, selector] of Object.entries(owners)) {
      const source = await readFile(file, 'utf8')
      const start = source.indexOf(selector)
      assert.ok(start >= 0 && source.slice(start, source.indexOf('}', start)).includes('@include scrollEdgeFade.vertical'), `${file} fades ${selector}`)
    }
    // Left rails never fade (user-specified): a hairline closes an edge while
    // more lies beyond it; a bottom at the screen edge has none.
    const rails = {
      'src/components/LibraryWorkspace.vue': ['.library-workspace__rail-scroll', '($bottom: false)'],
      'src/contentScripts/views/Home/following/FollowingSidebar.vue': ['.following-sidebar__scroll', '($bottom: false)'],
      'src/contentScripts/views/Moments/MomentsSidebar.vue': ['.moments-live-card__list {', '($bottom: false)'],
    }
    for (const [file, [selector, args]] of Object.entries(rails)) {
      const source = await readFile(file, 'utf8')
      const start = source.indexOf(selector)
      assert.ok(start >= 0, `${file}: ${selector}`)
      assert.ok(source.slice(start, source.indexOf('}', start)).includes(`@include scrollEdgeFade.lines${args}`), `${file}: ${selector} closes its edges with hairlines`)
      assert.doesNotMatch(source, /scrollEdgeFade\.vertical/, `${file}: no fade in a rail`)
    }
    // A list right under a standing hairline draws no top line (two would
    // stack) and starts at that hairline, so its rows are cut there, not a
    // gap below it (user-specified).
    const favoritesSource = await readFile('src/contentScripts/views/Favorites/FavoritesPage.vue', 'utf8')
    const ruleOf = (source, selector) => {
      const start = source.indexOf(selector)
      assert.ok(start >= 0, selector)
      return source.slice(start, source.indexOf('}', start))
    }
    const categoryList = ruleOf(favoritesSource, '.category-list {')
    assert.doesNotMatch(categoryList, /scrollEdgeFade\.lines/, 'the folder list adds no line under the tools\' hairline')
    assert.match(ruleOf(favoritesSource, '.favorites-sidebar-content .favorites-old-nav {'), /margin-top: calc\(-1 \* var\(--bew-sidebar-section-gap\)\);\s*padding-top: var\(--bew-sidebar-section-gap\);/, 'the rail gap moves into the nav')
    assert.match(categoryList, /margin: calc\(-1 \* var\(--bew-sidebar-section-gap\)\) calc\(-1 \* var\(--bew-sidebar-inline-padding\)\) 0;\s*padding: var\(--bew-sidebar-section-gap\) var\(--bew-sidebar-inline-padding\) 0;/, 'the folder list scrolls up to the hairline')
    const historyResults = await readFile('src/contentScripts/views/Notifications/whisper/PrivateHistorySearchResults.vue', 'utf8')
    assert.doesNotMatch(ruleOf(historyResults, '.private-history-results__list {'), /scrollEdgeFade\.lines/, 'message results add no line under the tools\' hairline')
    const conversationList = await readFile('src/contentScripts/views/Notifications/whisper/ConversationList.vue', 'utf8')
    assert.match(conversationList, /\.conversation-list__items \{\s*flex: 1 1 auto;\s*min-height: 0;\s*padding: var\(--bew-space-1\);\s*\}[\s\S]*?\.conversation-list__history-results \{\s*padding-top: 0;/, 'message results start at the tools\' hairline')
    const linesCss = compileString('@use "scrollEdgeFade"; @include scrollEdgeFade.global; .x { @include scrollEdgeFade.lines($bottom: false); }', { loadPaths: ['src/styles'] }).css
    assert.match(linesCss, /@keyframes bew-scroll-edge-line-top \{\s*from \{\s*border-top-color: transparent;\s*\}\s*to \{\s*border-top-color: var\(--bew-separator-color\);/)
    assert.match(linesCss, /\.x \{\s*border-top: var\(--bew-hairline\) solid transparent;\s*\}/)
    assert.doesNotMatch(linesCss, /\.x \{[^}]*border-bottom/)
    assert.match(linesCss, /animation: bew-scroll-edge-line-top linear both;\s*animation-timeline: scroll\(self\);/)
    assert.match(await readFile('src/contentScripts/views/Favorites/FavoritesPage.vue', 'utf8'), /overflow: visible clip;/, 'the folder list reaches the rail edges')
    // The conversation list is closed at its top by the tools' hairline, always drawn.
    const conversations = await readFile('src/contentScripts/views/Notifications/whisper/ConversationList.vue', 'utf8')
    assert.doesNotMatch(conversations, /scrollEdgeFade|tools--pinned/)
    assert.match(conversations, /\.conversation-list__tools \{[^}]*border-bottom: var\(--bew-hairline\) solid var\(--bew-separator-color\);/)
    assert.match(await readFile('src/contentScripts/views/Home/components/Ranking.vue', 'utf8'), /bew-scroll-edge-fade--no-bottom/)
    assert.match(await readFile('src/components/MomentCard/MomentCommentSection.vue', 'utf8'), /has-composer[\s\S]*?--bew-scroll-edge-bottom-off: 1/, 'the pinned composer closes the comment list without a fade')
    const offCss = compileString('@use "scrollEdgeFade"; .x { @include scrollEdgeFade.vertical($bottom: false); }', { loadPaths: ['src/styles'] }).css
    assert.match(offCss, /--bew-scroll-edge-bottom-off: 1/)
    assert.match(offCss, /max\(var\(--bew-scroll-edge-bottom-clear\), var\(--bew-scroll-edge-bottom-off, 0\)\)/)
    assert.match(await readFile('src/contentScripts/views/Moments/MomentsLiveRow.vue', 'utf8'), /\.moments-live-row__preview \{\s*@include contentCard\.media-frame;\s*box-shadow: none;/, 'the preview carries the video cover hairline')
    const hotSearch = await readFile('src/contentScripts/views/Moments/MomentsHotSearch.vue', 'utf8')
    const card = hotSearch.slice(hotSearch.indexOf('.moments-hot-search {'), hotSearch.indexOf('}', hotSearch.indexOf('.moments-hot-search {')))
    assert.doesNotMatch(card, /scrollEdgeFade|vertical-scroll/, 'the glass card never carries the mask')
  })

  check('Motion: interaction motion plays first; swaps fade across it and mount only after it settles', async () => {
    const priority = await import('../src/utils/motionPriority')
    const { useReadyPageTransition } = await import('../src/composables/useReadyPageTransition')
    const { useSpringValue } = await loadSourceModule('../src/composables/useSpringValue.ts', {
      'vue': Vue,
      '~/utils/motionPriority': await import('../src/utils/motionPriority'),
      '~/utils/spring': await import('../src/utils/spring'),
      './useReducedMotion': { useReducedMotion: () => Vue.ref(false) },
    })
    assert.equal(priority.getMotionRemaining(), 0)
    await priority.afterMotion()
    const release = priority.holdMotion(60_000)
    assert.ok(priority.getMotionRemaining() <= priority.MAX_MOTION_WAIT_MS, 'a hold can never block loading beyond the cap')
    let waited = false
    const wait = priority.afterMotion().then(() => waited = true)
    await flush()
    assert.equal(waited, false)
    release()
    release()
    await wait
    assert.equal(priority.getMotionRemaining(), 0)

    const target = Vue.ref(0)
    const springScope = Vue.effectScope()
    springScope.run(() => useSpringValue(() => target.value, () => 0.2))
    target.value = 3
    assert.ok(priority.getMotionRemaining() > 0, 'a moving wheel spring holds content swaps')
    springScope.stop()
    assert.equal(priority.getMotionRemaining(), 0, 'disposal releases the spring hold')

    const previousMatchMedia = window.matchMedia
    window.matchMedia = () => ({ matches: false })
    const component = Vue.shallowRef({ id: 'a' })
    const scope = Vue.effectScope()
    const hooks = scope.run(() => useReadyPageTransition(() => component.value, () => Promise.resolve()))
    const root = document.body.appendChild(document.createElement('section'))
    const durations = []
    root.animate = (_frames, options) => {
      durations.push(options.duration)
      return { finished: Promise.resolve(), cancel() {} }
    }
    try {
      await flush()
      const slide = priority.holdMotion(300)
      let finished = 0
      component.value = { id: 'b' }
      hooks.onLeave(root, () => finished++)
      await flush()
      assert.ok(durations[0] >= 250, 'the old view fades across the slide instead of idling blank')
      assert.equal(finished, 0, 'the new view does not mount while the slide is running')
      slide()
      await flush()
      assert.equal(finished, 1, 'the swap follows as soon as the slide settles')
    }
    finally {
      scope.stop()
      root.remove()
      window.matchMedia = previousMatchMedia
    }
  })
}
