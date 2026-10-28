import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import { loadSourceModule } from './sourceModuleHarness'

export function registerControlChecks(check, { Vue, flush, compileComponent }) {
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

  check('immersive recommendations stay removed: no entry, frame, rail tab or settings', async () => {
    const { stat } = await import('node:fs/promises')
    for (const file of [
      'contentScripts/immersiveFrame.ts',
      'contentScripts/views/ImmersivePlaybackRail.vue',
      'contentScripts/views/Home/components/ImmersiveFeed.vue',
      'contentScripts/views/Home/components/ImmersiveVideoFrame.vue',
      'constants/immersive.ts',
      'utils/iframeActivity.ts',
      'utils/immersivePlayback.ts',
      'utils/immersiveRecommendation.ts',
    ])
      await assert.rejects(stat(new URL(`../src/${file}`, import.meta.url)), `${file} must not return`)
    const { RETIRED_SETTINGS_FIELDS } = await import('../src/constants/retiredSettings')
    const storage = await readFile(new URL('../src/logic/storage.ts', import.meta.url), 'utf8')
    for (const key of ['showImmersiveModeEntry', 'immersiveWheelSwitch', 'immersiveKeyboardSwitch', 'immersiveAutoPlay', 'immersiveAutoNext', 'immersivePreloadNext']) {
      assert.ok(RETIRED_SETTINGS_FIELDS.includes(key), `${key} is cleaned and excluded from sync`)
      assert.doesNotMatch(storage, new RegExp(`\\b${key}\\b`))
    }
    const shell = await readFile(new URL('../src/utils/bewlyWidescreen/shell.ts', import.meta.url), 'utf8')
    assert.doesNotMatch(shell, /recommendations: createTabButton/)
  })
}
