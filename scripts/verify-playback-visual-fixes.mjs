import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import { shouldContinueWidescreenSidebarHydration } from '../src/utils/bewlyWidescreenPolicy'
import { patchCommentTransferLifecycle, transferCommentNode } from '../src/utils/commentDomTransfer'
import { buildCommentTree } from '../src/utils/commentTree'
import * as geometry from '../src/utils/commentTreeGeometry'
import { isPhotoViewerOpen } from '../src/utils/photoViewer'
import { loadSourceFunctions } from './sourceFunctionHarness'

const widescreenFile = '../src/utils/bewlyWidescreen.ts'
const rect = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height })

function clock() {
  let now = 0
  let id = 0
  const tasks = new Map()
  return {
    tasks,
    Date: { now: () => now },
    setTimeout: (run, delay) => {
      tasks.set(++id, { at: now + delay, run })
      return id
    },
    clearTimeout: id => tasks.delete(id),
    tick(duration) {
      const until = now + duration
      for (let count = 0; count < 1000; count++) {
        const next = [...tasks].filter(([, task]) => task.at <= until).sort((a, b) => a[1].at - b[1].at)[0]
        if (!next)
          break
        tasks.delete(next[0])
        now = next[1].at
        next[1].run()
      }
      now = until
    },
  }
}

export function registerPlaybackVisualFixChecks(check, { Vue, compileComponent, flush }) {
  check('visual QA: photo preview keeps the sidebar open, including an already queued collapse', async () => {
    const time = clock()
    const changes = []
    const context = await loadSourceFunctions(widescreenFile, [
      'NATIVE_ACTION_OVERLAY_SELECTOR',
      'isNativeActionOverlayOpen',
      'scheduleCollapse',
    ], {
      document,
      getComputedStyle,
      isPhotoViewerOpen,
      ...time,
      collapseTimer: undefined,
      resizingPointerId: undefined,
      canTemporarilyExpand: () => true,
      sidebarResizer: document.createElement('div'),
      currentState: { playerEl: document.createElement('div') },
      lastPointerX: undefined,
      lastPointerY: undefined,
      lastPointerEvent: undefined,
      WIDESCREEN_SIDEBAR_EDGE_EXIT_DELAY: 200,
      setHoverExpanded: value => changes.push(value),
    })
    context.scheduleCollapse()
    const viewer = document.createElement('div')
    viewer.className = 'pswp pswp--open'
    viewer.getBoundingClientRect = () => rect(0, 0, 1000, 800)
    document.body.append(viewer)
    assert.equal(context.isNativeActionOverlayOpen(), true)
    time.tick(200)
    assert.deepEqual(changes, [])
    viewer.style.display = 'none'
    assert.equal(context.isNativeActionOverlayOpen(), false)
    context.scheduleCollapse()
    time.tick(200)
    assert.deepEqual(changes, [false])
    viewer.remove()
    const source = await readFile(new URL(widescreenFile, import.meta.url), 'utf8')
    assert.match(source, /body\.\$\{BODY_CLASS\} > :is\(\$\{PHOTO_VIEWER_SELECTOR\}\) \{\s*z-index: var\(--bew-z-hud\)/)
  })

  check('visual QA: transferring native comments preserves state; real removal still cleans up', () => {
    const calls = { connect: 0, disconnect: 0 }
    class Comment extends HTMLElement {
      connectedCallback() {
        calls.connect++
        this.list = []
      }

      disconnectedCallback() {
        calls.disconnect++
        this.list = []
      }
    }
    class Editor extends Comment {}
    patchCommentTransferLifecycle('bili-comments', Comment)
    patchCommentTransferLifecycle('bili-fixture-editor', Editor)
    window.customElements.define('bili-comments', Comment)
    window.customElements.define('bili-fixture-editor', Editor)
    const original = document.createElement('div')
    const panel = document.createElement('section')
    const root = document.createElement('div')
    root.id = 'commentapp'
    const comments = document.createElement('bili-comments')
    const editor = document.createElement('bili-fixture-editor')
    comments.attachShadow({ mode: 'open' }).append(editor)
    root.append(comments)
    original.append(root)
    document.body.append(original, panel)
    const connected = calls.connect
    comments.list = ['loaded root', 'loaded replies']
    editor.list = ['draft']
    transferCommentNode(root, panel)
    transferCommentNode(root, original)
    assert.deepEqual(calls, { connect: connected, disconnect: 0 })
    assert.deepEqual(comments.list, ['loaded root', 'loaded replies'])
    assert.deepEqual(editor.list, ['draft'])
    assert.equal(root.hasAttribute('data-bewly-comment-transfer'), false)
    assert.throws(() => transferCommentNode(root, comments))
    assert.equal(root.hasAttribute('data-bewly-comment-transfer'), false)
    root.remove()
    assert.equal(calls.disconnect, 2)
    assert.deepEqual(comments.list, [])
    original.append(root)
    const removed = calls.disconnect
    panel.append(root)
    assert.equal(calls.disconnect, removed + 2, 'ordinary page moves retain the native lifecycle')
    original.remove()
    panel.remove()
  })

  check('visual QA: native comment readiness accepts empty feeds and rejects a spinner/editor shell', async () => {
    const context = await loadSourceFunctions(widescreenFile, [
      'isCommentRootUsable',
      'hasCommentShadowTree',
      'COMMENT_SHADOW_HOST_SELECTOR',
    ], { Element })
    const root = document.createElement('div')
    const comments = document.createElement('bili-comments')
    const shadow = comments.attachShadow({ mode: 'open' })
    shadow.innerHTML = '<div id="spinner-container"></div><bili-comment-box></bili-comment-box>'
    root.append(comments)
    document.body.append(root)
    assert.equal(context.isCommentRootUsable(root), false)
    shadow.innerHTML = '<div id="header"></div><div id="feed"></div>'
    assert.equal(context.isCommentRootUsable(root), true, 'zero replies is a completed native feed')
    shadow.querySelector('#feed').innerHTML = '<bili-comment-thread-renderer></bili-comment-thread-renderer>'
    assert.equal(context.isCommentRootUsable(root), true)
    root.remove()
    assert.equal(context.isCommentRootUsable(root), false)
  })

  check('visual QA: native danmaku empty/error/disabled states are not covered by a skeleton', async () => {
    const context = await loadSourceFunctions(widescreenFile, [
      'isDanmakuPanelReady',
      'DANMAKU_LIST_VIEWPORT_SELECTOR',
      'DANMAKU_LIST_ITEM_SELECTOR',
      'DANMAKU_EMPTY_STATE_SELECTOR',
    ], { getComputedStyle })
    const panel = document.createElement('section')
    panel.innerHTML = '<div class="bpx-player-dm"><div class="bpx-player-dm-container"></div><div class="bpx-player-dm-load-status">Loading</div></div>'
    document.body.append(panel)
    assert.equal(context.isDanmakuPanelReady(panel), false)
    panel.firstElementChild.classList.add('bpx-player-hide-status')
    assert.equal(context.isDanmakuPanelReady(panel), true, 'successful empty native list')
    panel.firstElementChild.classList.remove('bpx-player-hide-status')
    const status = panel.querySelector('.bpx-player-dm-load-status')
    status.innerHTML = 'Failed <span class="bpx-player-reset">Retry</span>'
    assert.equal(context.isDanmakuPanelReady(panel), true, 'native retry must remain actionable')
    status.innerHTML = 'Disabled'
    status.classList.add('bpx-player-dm-close')
    assert.equal(context.isDanmakuPanelReady(panel), true)
    panel.remove()
  })

  check('visual QA: danmaku activation retries an unbound header and preserves its relayout sequence', async () => {
    const time = clock()
    const panel = document.createElement('section')
    panel.innerHTML = '<div class="danmaku-box"><div class="bui-collapse-wrap-folded"><button class="bui-collapse-header"></button><div class="bui-collapse-body" style="height:0"></div></div></div>'
    document.body.append(panel)
    const source = panel.firstElementChild
    const currentState = { panels: { danmaku: panel }, activeTab: 'danmaku' }
    let resizes = 0
    const context = await loadSourceFunctions(widescreenFile, [
      'activateDanmakuTab',
      'clearDanmakuActivation',
      'scheduleDanmakuNativeRelayout',
      'DANMAKU_RESIZE_DELAYS',
      'findFirst',
    ], {
      ...time,
      Event,
      state: currentState,
      window: { dispatchEvent: () => resizes++ },
      selectors: { danmaku: ['.danmaku-box'], danmakuFocusable: ['.bui-collapse-header'] },
      isDanmakuPanelReady: () => false,
    })
    context.activateDanmakuTab(currentState)
    time.tick(120)
    assert.equal(currentState.danmakuActivatedSource, undefined)
    panel.querySelector('button').onclick = () => {
      panel.querySelector('.bui-collapse-wrap-folded').classList.remove('bui-collapse-wrap-folded')
      panel.querySelector('.bui-collapse-body').style.height = '400px'
    }
    context.activateDanmakuTab(currentState)
    time.tick(120)
    assert.equal(currentState.danmakuActivatedSource, source)
    const scheduled = currentState.danmakuResizeTimers
    context.activateDanmakuTab(currentState)
    assert.equal(currentState.danmakuResizeTimers, scheduled, 'polling must not cancel the later relayouts')
    time.tick(720)
    assert.ok(resizes >= 5)
    context.activateDanmakuTab(currentState)
    context.clearDanmakuActivation(currentState)
    assert.equal(time.tasks.size, 0)
    panel.remove()
  })

  check('visual QA: sidebar hydration stops at its deadline and exposes recovery instead of infinite loading', async () => {
    const time = clock()
    const root = document.createElement('div')
    const panels = Object.fromEntries(['comment', 'danmaku', 'playlist'].map(tab => [tab, document.createElement('section')]))
    root.append(...Object.values(panels))
    document.body.append(root)
    const currentState = { root, panels, activeTab: 'comment', navigationPending: false }
    let restores = 0
    let exits = 0
    let reloads = 0
    const context = await loadSourceFunctions(widescreenFile, [
      'startSidebarHydration',
      'clearSidebarHydration',
      'ensureSidebarHydrationFailure',
      'createPanelEmpty',
      'clearEmptyPanel',
      'clearDanmakuSkeleton',
      'SIDEBAR_HYDRATION_TIMEOUT',
      'SIDEBAR_HYDRATION_FAST_DURATION',
      'SIDEBAR_HYDRATION_FAST_INTERVAL',
      'SIDEBAR_HYDRATION_INTERVAL',
      'EMPTY_CLASS',
      'DANMAKU_SKELETON_CLASS',
    ], {
      ...time,
      document,
      state: currentState,
      shouldContinueWidescreenSidebarHydration,
      findCommentRoot: () => null,
      startCommentPrewarm: () => {},
      restoreCommentPrewarm: () => restores++,
      runSidebarHydration: () => ({ top: true, comment: false, complete: false }),
      t: key => key,
      location: { reload: () => reloads++ },
      exitBewlyWidescreen: ({ userInitiated }) => exits += Number(userInitiated),
    })
    context.startSidebarHydration(currentState)
    time.tick(12_000)
    assert.equal(currentState.sidebarHydrationTimedOut, true)
    assert.equal(time.tasks.size, 0)
    assert.equal(restores, 1)
    const buttons = [...panels.comment.querySelectorAll('button')]
    assert.equal(buttons.length, 2)
    buttons[0].click()
    buttons[1].click()
    assert.equal(reloads, 1)
    assert.equal(exits, 1)
    currentState.navigationPending = true
    buttons[0].click()
    assert.equal(reloads, 1, 'a stale panel cannot reload the next navigation')
    context.state = null
    buttons[1].click()
    assert.equal(exits, 1)
    root.remove()
  })

  check('visual QA: moment/native trees share continuous avatar-based geometry and bounded visual depth', async () => {
    const inputs = Array.from({ length: 10 }, (_, i) => ({ id: `id-${i}`, rootId: 'id-0', parentId: i ? `id-${i - 1}` : '', createdAt: i, originalOrder: i }))
    const layout = buildCommentTree(inputs, 3)
    assert.equal(Math.max(...layout.map(node => node.depth)), 3)
    const depths = new Map(layout.map(node => [node.id, node.depth]))
    layout.forEach((node) => {
      if (node.parentId)
        assert.equal(depths.get(node.parentId), node.depth - 1)
    })
    const parent = { centerX: 16, centerY: 16, bottom: 32, left: 0 }
    const children = [{ centerX: 48, centerY: 112, bottom: 128, left: 32 }, { centerX: 48, centerY: 216, bottom: 232, left: 32 }]
    const path = geometry.buildCommentBranchPath(parent, children, 12)
    assert.equal(path, 'M 16 32 V 204 M 16 100 A 12 12 0 0 0 28 112 H 32 M 16 204 A 12 12 0 0 0 28 216 H 32')
    const native = await loadSourceFunctions('../src/inject/index.ts', ['getCommentReplyBranchPath', 'formatCommentReplyGuideCoordinate'], { ...geometry })
    assert.equal(native.getCommentReplyBranchPath({ parentAnchor: parent, childAnchors: children }, 12, 12), path)
    assert.equal(native.getCommentReplyBranchPath({ parentAnchor: parent, childAnchors: [], collapsed: true, collapseParentBody: true }, 12, 12), 'M 16 16')
  })

  check('visual QA: late native comment completion refreshes the current shell and cleans up on exit', async () => {
    const root = document.createElement('div')
    const panel = document.createElement('section')
    const comments = document.createElement('bili-comments')
    panel.append(comments)
    root.append(panel)
    document.body.append(root)
    const currentState = { root, panels: { comment: panel }, activeTab: 'comment', sidebarHydrationTimedOut: true }
    const frames = []
    let refreshes = 0
    const context = await loadSourceFunctions(widescreenFile, ['setupDomRefreshObserver', 'scheduleSidebarRefresh'], {
      document,
      HTMLElement,
      state: currentState,
      sidebarRefreshFrame: undefined,
      selectors: { danmakuInput: [] },
      NATIVE_LIGHT_OFF_CONTROL_SELECTORS: [],
      MutationObserver: class { observe() {} disconnect() {} },
      disableNativeLightOffMode: () => {},
      requestAnimationFrame: callback => frames.push(callback),
      findCommentRoot: () => null,
      runSidebarHydration: () => {
        refreshes++
        return { complete: true }
      },
      clearSidebarHydration: () => {},
    })
    context.setupDomRefreshObserver(currentState)
    comments.dispatchEvent(new CustomEvent('inited'))
    assert.equal(frames.length, 1, 'capture the native non-bubbling event after the polling deadline')
    frames.shift()()
    assert.equal(refreshes, 1)
    context.state = { root: document.createElement('div') }
    comments.dispatchEvent(new CustomEvent('inited'))
    assert.equal(frames.length, 0, 'old native completion cannot refresh another shell')
    context.state = currentState
    currentState.commentReadyCleanup()
    comments.dispatchEvent(new CustomEvent('inited'))
    assert.equal(frames.length, 0)
    root.remove()
  })

  check('visual QA: moment rails recompute after reply image resize and release observers/RAF on unmount', async () => {
    const previousObserver = globalThis.ResizeObserver
    const observers = []
    class Observer {
      constructor(callback) {
        this.callback = callback
        this.targets = new Set()
        observers.push(this)
      }

      observe(node) { this.targets.add(node) }
      disconnect() { this.targets.clear() }
    }
    globalThis.ResizeObserver = Observer
    const component = await compileComponent('../src/components/MomentCard/MomentCommentTreeGuides.vue', { '~/utils/commentTreeGeometry': geometry })
    const nodes = [{ id: 'root', parentId: null }, { id: 'a', parentId: 'root' }, { id: 'b', parentId: 'root' }]
    const host = document.createElement('div')
    document.body.append(host)
    const app = Vue.createApp({ setup: () => () => Vue.h('section', [Vue.h(component, { nodes }), ...nodes.map(node => Vue.h('article', { 'data-comment-id': node.id }, [Vue.h('img', { class: 'moment-comments__avatar' })]))]) })
    try {
      app.mount(host)
      const svg = host.querySelector('svg')
      const thread = svg.parentElement
      thread.style.setProperty('--bew-radius-lg', '12px')
      Object.defineProperties(svg, { clientWidth: { value: 400 }, clientHeight: { value: 400 } })
      svg.getBoundingClientRect = () => rect(0, 0, 400, 400)
      const avatars = [...host.querySelectorAll('img')]
      avatars[0].getBoundingClientRect = () => rect(0, 0, 32, 32)
      avatars[1].getBoundingClientRect = () => rect(32, 96, 32, 32)
      avatars[2].getBoundingClientRect = () => rect(32, 200, 32, 32)
      await new Promise(resolve => requestAnimationFrame(resolve))
      await flush()
      const initialPath = host.querySelector('path').getAttribute('d')
      assert.match(initialPath, /^M 16 32 V 204 /)
      avatars[2].getBoundingClientRect = () => rect(32, 320, 32, 32)
      observers[0].callback()
      await new Promise(resolve => requestAnimationFrame(resolve))
      await flush()
      assert.match(host.querySelector('path').getAttribute('d'), /^M 16 32 V 324 /)
      observers[0].callback()
      app.unmount()
      assert.equal(observers[0].targets.size, 0)
      await new Promise(resolve => requestAnimationFrame(resolve))
      assert.equal(host.querySelector('path'), null)
    }
    finally {
      host.remove()
      globalThis.ResizeObserver = previousObserver
    }
  })
}
