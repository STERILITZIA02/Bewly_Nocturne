import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'

import { JSDOM } from 'jsdom'
import ts from 'typescript'
import { compileScript, parse } from 'vue/compiler-sfc'

import { loadSourceFunctions } from './sourceFunctionHarness'
import { registerAccountTransactionChecks } from './verify-account-transactions.mjs'
import { registerAdvertisingRuleChecks } from './verify-advertising-rules.mjs'
import { registerDockGlassChecks } from './verify-dock-glass.mjs'
import { registerLiquidGlassSurfaceChecks } from './verify-liquid-glass-surfaces.mjs'
import { registerLoadingSkeletonChecks } from './verify-loading-skeletons.mjs'
import { registerLongListResourceChecks } from './verify-long-list-resources.mjs'
import { registerPlaybackContentChecks } from './verify-playback-content-lifecycle.mjs'
import { registerPlaybackVisualFixChecks } from './verify-playback-visual-fixes.mjs'
import { registerRequestedAuditFixChecks } from './verify-requested-audit-fixes.mjs'
import { registerSurfaceMaterialChecks } from './verify-surface-materials.mjs'
import { registerTopBarSyncChecks } from './verify-top-bar-sync.mjs'
import { registerViewLifetimeChecks } from './verify-view-lifetimes.mjs'

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://www.bilibili.com/', pretendToBeVisual: true })
const savedGlobals = new Map()
for (const name of ['window', 'document', 'navigator', 'Document', 'Node', 'Element', 'HTMLElement', 'SVGElement', 'ShadowRoot', 'MutationObserver', 'Event', 'KeyboardEvent', 'MouseEvent', 'CustomEvent', 'FocusEvent', 'AbortController', 'AbortSignal']) {
  savedGlobals.set(name, Object.getOwnPropertyDescriptor(globalThis, name))
  Object.defineProperty(globalThis, name, { value: name === 'window' ? dom.window : dom.window[name], writable: true, configurable: true })
}
for (const name of ['getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame']) {
  savedGlobals.set(name, Object.getOwnPropertyDescriptor(globalThis, name))
  Object.defineProperty(globalThis, name, { value: dom.window[name].bind(dom.window), writable: true, configurable: true })
}

// JSDOM provides focus/Shadow DOM/events, but has no layout engine. Give visible
// fixtures rectangles so tabbable can keep its production display checks.
dom.window.HTMLElement.prototype.getClientRects = function () {
  let element = this
  while (element) {
    if (element.hidden || element.style.display === 'none')
      return []
    element = element.parentElement || element.getRootNode().host
  }
  return [{ x: 0, y: 0, left: 0, top: 0, right: 100, bottom: 30, width: 100, height: 30 }]
}
dom.window.HTMLElement.prototype.scrollIntoView = function () {}

const Vue = await import('vue')
const VueUse = await import('@vueuse/core')
const focus = await import('../src/utils/dialogFocus')
const { tabbable } = await import('tabbable')
const keyboard = await import('../src/utils/dialogKeyboard')
const { computeAnchoredFloatingMenuPosition } = await import('../src/utils/floatingMenu')
const { mergeWatchLaterItemsByAid } = await import('../src/utils/watchLaterList')
const { createSelectOptionKey } = await import('../src/utils/selectOptionKey')
const fieldLabels = await import('../src/components/formFieldLabel')
const imageLoadQueue = await import('../src/utils/imageLoadQueue')
const { useLoadMore } = await import('../src/contentScripts/views/SearchResults/composables/useLoadMore')
const r = value => ({ value })
const checks = []
const check = (name, run) => checks.push({ name, run })
registerRequestedAuditFixChecks(check, { Vue, compileComponent, flush })
registerAccountTransactionChecks(check, { Vue, compileComponent, flush })
registerLongListResourceChecks(check, { Vue, compileComponent, flush })
registerViewLifetimeChecks(check, { Vue, compileComponent, flush })
registerDockGlassChecks(check, { Vue, compileComponent, flush })
registerTopBarSyncChecks(check, { Vue, flush })
registerSurfaceMaterialChecks(check, { Vue, compileComponent, flush })
registerLoadingSkeletonChecks(check, { Vue, compileComponent, flush })
registerLiquidGlassSurfaceChecks(check, { Vue, compileComponent, flush })
registerPlaybackContentChecks(check)
registerAdvertisingRuleChecks(check, { flush })
function noop() {}
async function flush() {
  for (let turn = 0; turn < 8; turn++)
    await Vue.nextTick()
}
function deferred() {
  let resolve
  const promise = new Promise(done => resolve = done)
  return { promise, resolve }
}

check('P2-01/02 history clear invalidates old reads; submitted query owns pagination', async () => {
  const { useHistoryTimeline } = await import('../src/contentScripts/views/History/useHistoryTimeline')
  const oldRead = deferred()
  const cleared = deferred()
  const searches = []
  const errors = []
  const api = {
    getHistoryList: () => oldRead.promise,
    clearAllHistory: () => cleared.promise,
    searchHistoryList: async (options) => {
      searches.push(options)
      return { code: 0, data: { list: Array.from({ length: 20 }, (_, i) => ({ view_at: i })) } }
    },
  }
  const timeline = useHistoryTimeline({ api, getAccountId: () => 1, getCSRF: () => 'fixture', haveScrollbar: async () => true, onWriteError: error => errors.push(error) })
  const reading = timeline.load()
  const clearing = timeline.clearAllHistory()
  cleared.resolve({ code: 0 })
  await clearing
  oldRead.resolve({ code: 0, data: { list: [{ view_at: 100 }] } })
  await reading
  assert.equal(timeline.historyList.length, 0)
  assert.equal(timeline.noMoreContent.value, true)
  assert.equal(timeline.isClearingHistory.value, false)
  timeline.noMoreContent.value = false
  timeline.historyList.push({ view_at: 50 })
  api.clearAllHistory = async () => ({ code: -1, message: 'rejected' })
  await timeline.clearAllHistory()
  assert.equal(timeline.historyList.length, 1, 'failed clear retains the list')
  assert.equal(errors.length, 1)
  timeline.submittedKeyword.value = 'old'
  timeline.keyword.value = 'draft'
  await timeline.load()
  await timeline.load()
  assert.equal(searches.at(-1).keyword, 'old')
  assert.equal(searches.at(-1).pn, 2)
  timeline.handleSearch()
  await flush()
  assert.equal(searches.at(-1).keyword, 'draft')
  assert.equal(searches.at(-1).pn, 1)
  timeline.dispose()
})

function watchLaterItem(aid) {
  return { aid, bvid: `BV${aid}`, title: `${aid}`, pic: 'fixture', duration: 10, progress: 0, pubdate: 1, owner: { mid: 1, name: 'fixture', face: '' } }
}

check('P2-03 watch-later re-reads the shifted boundary after single and repeated removals', async () => {
  const server = Array.from({ length: 65 }, (_, index) => watchLaterItem(index + 1))
  const requestedPages = []
  const context = await loadSourceFunctions('../src/contentScripts/views/WatchLater/WatchLater.vue', [
    'getCurrentAccountId',
    'invalidateRequests',
    'isCurrentRequest',
    'isRecord',
    'isValidWatchLaterItem',
    'getWatchLaterListByPage',
    'deleteWatchLaterItem',
  ], {
    topBarStore: { isLogin: true, userInfo: { mid: 1 }, commitWatchLaterMutation: async () => {} },
    watchLaterExtensionContextInvalidated: false,
    requestGeneration: 0,
    isLoading: r(false),
    requestFailed: r(false),
    noMoreContent: r(false),
    pageNum: r(1),
    pageSize: r(20),
    watchLaterCount: r(0),
    currentWatchLaterList: r([]),
    pendingAction: r(null),
    haveScrollbar: async () => true,
    getCSRF: () => 'fixture',
    settleExtensionContextInvalidation: () => false,
    mergeWatchLaterItemsByAid,
    api: { watchlater: {
      getWatchLaterListByPage: async ({ pn, ps }) => {
        requestedPages.push(pn)
        return { code: 0, data: { list: server.slice((pn - 1) * ps, pn * ps), count: server.length } }
      },
      removeFromWatchLater: async ({ aid }) => {
        server.splice(server.findIndex(item => item.aid === aid), 1)
        return { code: 0 }
      },
    } },
  })
  await context.getWatchLaterListByPage(0, 1)
  await context.deleteWatchLaterItem(2)
  await context.deleteWatchLaterItem(3)
  await context.getWatchLaterListByPage(context.requestGeneration, 1)
  assert.deepEqual(requestedPages, [1, 1])
  assert.deepEqual(context.currentWatchLaterList.value.map(item => item.aid), server.slice(0, 20).map(item => item.aid))
  await context.getWatchLaterListByPage(context.requestGeneration, 1)
  await context.deleteWatchLaterItem(25)
  await context.getWatchLaterListByPage(context.requestGeneration, 1)
  assert.deepEqual(context.currentWatchLaterList.value.map(item => item.aid), server.slice(0, 40).map(item => item.aid))
  assert.equal(new Set(context.currentWatchLaterList.value.map(item => item.aid)).size, 40)
})

async function favoriteContext() {
  const { loadSourceModule } = await import('./sourceModuleHarness')
  const lifetime = await import('../src/utils/accountLifetime')
  const folders = await import('../src/utils/favoriteFolder')
  const context = { api: { favorite: {} }, haveScrollbar: async () => true, enrichFavoriteSeasonMediaFaces: async items => items }
  const module = await loadSourceModule('../src/contentScripts/views/Favorites/useFavoritesData.ts', {
    vue: Vue,
    '~/utils/accountLifetime': lifetime,
    '~/utils/favoriteFolder': folders,
    '~/utils/favoriteSeason': {
      FAVORITE_SEASON_PAGE_SIZE: 20,
      fetchFavoriteSeasonPage: async () => ({ ok: true, pageMedias: [{ id: 'A' }], mediaCount: 40, cover: '' }),
      mergeFavoriteSeasonPage: options => ({ medias: options.pageMedias, hasMore: true }),
      enrichFavoriteSeasonMediaFaces: items => context.enrichFavoriteSeasonMediaFaces(items),
    },
    './favoriteAdapters': { getFavoriteArticleCover: () => 'cover', normalizeSeasonMedia: item => item },
  })
  Object.assign(context, module.useFavoritesData({ api: context.api.favorite, haveScrollbar: () => context.haveScrollbar(), getAccountId: () => 1, t: key => key }))
  context.selectedCategory.value = { id: 1 }
  context.selectedSeason.value = { id: 77 }
  return context
}

check('P2-04 favorites retains the failed page, retries in place, and serializes autofill', async () => {
  const context = await favoriteContext()
  const requests = []
  let fail = false
  context.api.favorite.getFavoriteResources = async ({ pn }) => {
    requests.push(pn)
    if (fail)
      return { code: -412 }
    return { code: 0, data: { medias: [{ id: pn }], info: { cover: '' }, has_more: true } }
  }
  assert.equal(await context.loadNextPage(), true)
  fail = true
  assert.equal(await context.loadNextPage(), false)
  assert.equal(context.currentPageNum.value, 1)
  assert.equal(context.failedContentPage.value, 2)
  assert.equal(context.noMoreContent.value, false)
  assert.equal(context.favoriteResources.length, 1)
  await context.loadNextPage()
  assert.deepEqual(requests, [1, 2])
  fail = false
  context.retryFavoriteContent()
  await flush()
  assert.deepEqual(requests, [1, 2, 2])
  assert.equal(context.currentPageNum.value, 2)
  assert.equal(context.favoriteResources.length, 2)

  context.api.favorite.getFavoriteCategories = async () => ({ code: -1 })
  context.api.favorite.getCollectedFavoriteSeasons = async () => ({ code: -1 })
  context.api.favorite.getFavoriteArticles = async () => ({ code: -1 })
  context.favoriteView.value = 'article'
  assert.equal(await context.loadNextPage(), false)
  assert.equal(context.failedContentPage.value, 3)
  assert.equal(context.currentPageNum.value, 2)

  const measuring = deferred()
  let measurements = 0
  context.favoriteView.value = 'video'
  context.failedContentPage.value = null
  context.haveScrollbar = () => ++measurements === 1 ? measuring.promise : Promise.resolve(true)
  const pending = context.loadNextPage()
  await flush()
  assert.equal(context.isLoading.value, true)
  await context.loadNextPage()
  assert.equal(requests.at(-1), 3)
  measuring.resolve(false)
  await pending
  assert.deepEqual(requests.slice(-2), [3, 4], 'autofill does not race the observer')
  await context.initData()
  assert.equal(context.bootstrapFailed.value, true, 'both category API failures reach the bootstrap error state')
})

check('P2-05 stale favorite-season enrichment cannot replace a newer collection', async () => {
  const context = await favoriteContext()
  const enrichment = deferred()
  context.enrichFavoriteSeasonMediaFaces = () => enrichment.promise
  context.favoriteView.value = 'season'
  const pending = context.loadNextPage()
  await flush()
  context.contentVersion.value++
  context.loadedSeasonMedias.value = [{ id: 'B' }]
  context.favoriteResources.push({ id: 'B' })
  enrichment.resolve([{ id: 'A' }])
  await pending
  assert.equal(context.loadedSeasonMedias.value[0].id, 'B')
  assert.equal(context.favoriteResources[0].id, 'B')
})

check('P2-07 filtered empty pages pause automation without marking server exhaustion', async () => {
  const requests = []
  const scope = Vue.effectScope()
  const controller = scope.run(() => useLoadMore(() => {
    const task = deferred()
    requests.push(task)
    return task.promise
  }, { cooldownMs: 0 }))
  controller.requestLoadMore()
  requests[0].resolve({ success: true, appendedCount: 0 })
  await flush()
  assert.equal(controller.exhausted.value, false)
  assert.equal(controller.hasMore.value, true)
  assert.equal(controller.needsManualLoadMore.value, true)
  controller.requestLoadMore()
  assert.equal(requests.length, 1)
  controller.resumeLoadMore()
  requests[1].resolve({ success: true, appendedCount: 20 })
  await flush()
  assert.equal(controller.needsManualLoadMore.value, false)
  assert.equal(controller.page.value, 2)
  controller.requestLoadMore()
  controller.reset()
  requests[2].resolve({ success: true, appendedCount: 0 })
  await flush()
  assert.equal(controller.page.value, 0)
  assert.equal(controller.needsManualLoadMore.value, false)
  const renderWait = controller.handleLoadMoreCompletion(async () => false)
  await Vue.nextTick()
  scope.stop()
  await renderWait
  controller.requestLoadMore()
  assert.equal(requests.length, 3)
})

let sharedSkeletonComponent
const glassSurfaceContext = Symbol('fixture-glass-surface')
async function compileComponent(file, mocks = {}, { renderTemplate = true, globals = {} } = {}) {
  const text = await readFile(new URL(file, import.meta.url), 'utf8')
  const { descriptor } = parse(text)
  const source = compileScript(descriptor, { id: file, inlineTemplate: renderTemplate }).content.replaceAll('import.meta.env.DEV', 'true')
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText
  const exports = {}
  const modules = {
    'vue': Vue,
    '@vueuse/core': VueUse,
    '~/components/formFieldLabel': fieldLabels,
    '~/utils/imageLoadQueue': imageLoadQueue,
    // Non-material checks keep their existing leaf boundary. Material checks
    // replace these dependencies with the real production modules.
    '~/utils/liquidGlass': { vLiquidGlass: {} },
    '~/composables/useLiquidGlass': { GLASS_SURFACE_CONTEXT: glassSurfaceContext, liquidGlassEnabled: Vue.ref(false) },
    ...mocks,
  }
  vm.runInNewContext(code, {
    ...Vue,
    exports,
    window,
    document,
    HTMLElement,
    HTMLImageElement: window.HTMLImageElement,
    HTMLIFrameElement: window.HTMLIFrameElement,
    HTMLVideoElement: window.HTMLVideoElement,
    HTMLMediaElement: window.HTMLMediaElement,
    location: window.location,
    history: window.history,
    CustomEvent,
    Document,
    Element,
    ShadowRoot,
    Node,
    ResizeObserver: globalThis.ResizeObserver,
    getComputedStyle,
    setTimeout,
    clearTimeout,
    requestAnimationFrame,
    cancelAnimationFrame,
    require: (name) => {
      assert.ok(name in modules, `Unexpected component dependency: ${name}`)
      return modules[name]
    },
    ...globals,
  })
  if (!renderTemplate)
    exports.default.render = () => null
  if (!file.endsWith('/SkeletonBlock.vue')) {
    sharedSkeletonComponent ??= await compileComponent('../src/components/SkeletonBlock.vue')
    exports.default.components = { SkeletonBlock: sharedSkeletonComponent, ...exports.default.components }
  }
  return exports.default
}

check('P2-08 real Input composition-confirm Enter does not submit', async () => {
  const Input = await compileComponent('../src/components/Input.vue')
  const host = document.body.appendChild(document.createElement('div'))
  let enters = 0
  const app = Vue.createApp(Input, { modelValue: '中文', onEnter: () => enters++ })
  app.mount(host)
  const input = host.querySelector('input')
  for (const options of [{ isComposing: true }, { keyCode: 229 }])
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, ...options }))
  assert.equal(enters, 0)
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  assert.equal(enters, 1)
  app.unmount()
  host.remove()
})

check('settings controls reference their visible field title without changing the layout', async () => {
  const SettingsItem = await compileComponent('../src/components/Settings/components/SettingsItem.vue')
  const Radio = await compileComponent('../src/components/Radio.vue')
  const Input = await compileComponent('../src/components/Input.vue')
  const Slider = await compileComponent('../src/components/Slider.vue', {
    '~/utils/range': await import('../src/utils/range'),
  })
  const host = document.body.appendChild(document.createElement('div'))
  const title = Vue.ref('Setting title')
  const app = Vue.createApp({ setup: () => () => Vue.h('div', [
    Vue.h(SettingsItem, { title: title.value }, () => Vue.h(Radio, { modelValue: false })),
    Vue.h(SettingsItem, { title: 'Text setting' }, () => Vue.h(Input, { modelValue: 'value' })),
    Vue.h(SettingsItem, { title: 'Range setting' }, () => Vue.h(Slider, { modelValue: 50, label: '50' })),
    Vue.h(SettingsItem, { title: 'Parent' }, () => Vue.h(Radio, { modelValue: false, label: 'Explicit label' })),
  ]) })
  app.mount(host)
  const inputs = [...host.querySelectorAll('input')]
  const labels = inputs.slice(0, 3).map(input => document.getElementById(input.getAttribute('aria-labelledby')))
  assert.deepEqual(labels.map(label => label.textContent), ['Setting title', 'Text setting', 'Range setting'])
  assert.equal(new Set(labels.map(label => label.id)).size, 3)
  assert.equal(inputs[3].hasAttribute('aria-labelledby'), false, 'an explicit Radio label keeps precedence')
  title.value = 'Translated title'
  await Vue.nextTick()
  assert.equal(labels[0].textContent, 'Translated title')
  app.unmount()
  host.remove()
})

check('P2-09 Dialog focuses inside Shadow DOM, traps Tab, supports Select portals and restores origin', async () => {
  const host = document.body.appendChild(document.createElement('div'))
  const shadow = host.attachShadow({ mode: 'open' })
  const appRoot = shadow.appendChild(document.createElement('div'))
  const trigger = appRoot.appendChild(document.createElement('button'))
  trigger.textContent = 'Open'
  trigger.focus()
  const mountPoint = appRoot.appendChild(document.createElement('div'))
  const appProvider = { useBewlyApp: () => ({ mainAppRef: Vue.ref(appRoot) }) }
  const Select = await compileComponent('../src/components/Select.vue', {
    '~/utils/dialogFocus': focus,
    '~/utils/selectOptionKey': { createSelectOptionKey },
    '~/composables/useAppProvider': appProvider,
    '~/composables/useFloatingMenuPosition': { useFloatingMenuPosition: () => ({
      position: Vue.ref({ top: 0, left: 0, width: 140, maxHeight: 300, openUp: false }),
      scheduleUpdate: noop,
      start: noop,
      stop: noop,
    }) },
  })
  const StubButton = { props: ['type', 'label', 'size'], emits: ['click'], setup: (props, { emit, slots }) => () => Vue.h('button', { type: 'button', 'aria-label': props.label, 'onClick': event => emit('click', event) }, slots.default?.()) }
  const Dialog = await compileComponent('../src/components/Dialog.vue', {
    '~/utils/dialogFocus': focus,
    '~/utils/dialogKeyboard': keyboard,
    '~/composables/useAppProvider': appProvider,
    '~/logic': { settings: Vue.ref({ disableFrostedGlass: false }) },
    '~/components/Button.vue': { default: StubButton },
    '~/components/CloseButton.vue': { default: StubButton },
    '~/components/PanelTopBlur.vue': { default: { render: () => null } },
  })
  const visible = Vue.ref(true)
  let closes = 0
  const app = Vue.createApp({ setup: () => () => visible.value
    ? Vue.h(Dialog, {
        title: 'Fixture dialog',
        onClose: () => {
          closes++
          visible.value = false
        },
      }, {
        default: () => [Vue.h('input', { disabled: true }), Vue.h('iframe', { tabindex: 0 }), Vue.h(Select, { options: [{ label: 'One', value: 1 }, { label: 'Two', value: 2 }], modelValue: 1 }), Vue.h('button', { id: 'after-select' }, 'Next')],
      })
    : null })
  app.config.globalProperties.$t = key => key
  app.mount(mountPoint)
  await flush()
  const panel = shadow.querySelector('.dialog__panel')
  assert.equal(focus.getDeepActiveElement(document), panel)
  assert.equal(panel.getAttribute('role'), 'dialog')
  const candidates = tabbable(panel, { getShadowRoot: true })
  assert.ok(!candidates.includes(panel.querySelector('input[disabled]')))
  assert.ok(candidates.includes(panel.querySelector('iframe')))
  candidates.at(-1).focus()
  candidates.at(-1).dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, composed: true, cancelable: true }))
  assert.equal(focus.getDeepActiveElement(document), candidates[0])
  candidates[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, composed: true, cancelable: true }))
  assert.equal(focus.getDeepActiveElement(document), candidates.at(-1))
  panel.querySelector('.select-trigger').click()
  await flush()
  const option = shadow.querySelector('[role="option"][tabindex="0"]')
  assert.ok(option)
  option.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, composed: true, cancelable: true }))
  await flush()
  assert.equal(focus.getDeepActiveElement(document).id, 'after-select')
  panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true, cancelable: true }))
  await new Promise(resolve => setTimeout(resolve, 70))
  await flush()
  assert.equal(closes, 1)
  assert.equal(focus.getDeepActiveElement(document), trigger)
  app.unmount()
  host.remove()
})

check('P2-09 nested dialogs own keys above their ancestors and respect independent viewers', () => {
  const root = document.body.appendChild(document.createElement('div'))
  root.innerHTML = '<div data-bewly-dialog-active="outer" style="z-index:10"><section aria-modal="true"><div data-bewly-dialog-active="inner" style="z-index:20"><button>Inner</button></div></section></div><section role="dialog" aria-modal="true"><button>Viewer</button></section>'
  const outer = root.querySelector('[data-bewly-dialog-active="outer"]')
  const inner = root.querySelector('[data-bewly-dialog-active="inner"]')
  const button = inner.querySelector('button')
  const event = { composedPath: () => [button, inner, inner.parentElement, outer, root] }
  assert.equal(focus.ownsDialogKeyboard(inner, event), true)
  assert.equal(focus.ownsDialogKeyboard(outer, event), false)
  const viewer = root.lastElementChild
  assert.equal(focus.ownsDialogKeyboard(inner, { composedPath: () => [viewer.firstElementChild, viewer, root] }), false)
  const nativeInput = document.body.appendChild(document.createElement('input'))
  nativeInput.focus()
  assert.equal(focus.ownsDialogKeyboard(inner, { composedPath: () => [nativeInput, document.body] }), false)
  nativeInput.remove()
  root.remove()
})

function cssPixels(css, width, height) {
  return Number(vm.runInNewContext(css.replace(/var\(--bew-space-4\)/g, '16px').replace(/var\(--bew-space-2\)/g, '8px')
    .replace(/([\d.]+)(d?vw|d?vh|px)/g, (_match, value, unit) => String(Number(value) * (unit.endsWith('vw') ? width / 100 : unit.endsWith('vh') ? height / 100 : 1)))
    .replace(/\bcalc\(/g, '(').replace(/\b(min|max)\(/g, 'Math.$1(')))
}

check('P2-10/12 dialog and context-menu geometry stay inside narrow/zoomed viewports', async () => {
  const props = { width: 1200, maxWidth: undefined, height: 1000, topOffset: undefined }
  const context = await loadSourceFunctions('../src/components/Dialog.vue', ['dialogWidth', 'dialogMaxWidth', 'dialogHeight', 'dialogTopOffset', 'dialogMaxHeight'], {
    props,
    computed: getter => ({ get value() { return getter() } }),
  })
  const menu = await loadSourceFunctions('../src/components/ContextMenu.vue', ['updatePosition'], {
    props: { anchor: { x: 0, y: 0 } },
    menuRef: r(null),
    menuStyles: r({}),
    window: { innerWidth: 0, innerHeight: 0 },
    computeAnchoredFloatingMenuPosition,
  })
  for (const zoom of [1, 1.25, 1.5]) {
    for (const windowWidth of [360, 768, 1440]) {
      const width = windowWidth / zoom
      const height = 600 / zoom
      assert.ok(cssPixels(context.dialogMaxWidth.value, width, height) <= width - 16)
      assert.ok(cssPixels(context.dialogMaxHeight.value, width, height) <= height - 16)
      props.topOffset = 40
      assert.ok(cssPixels(context.dialogMaxHeight.value, width, height) <= height - 48)
      props.topOffset = undefined
      for (const x of [-20, 0, 20, width - 1, width + 300]) {
        for (const y of [-20, 0, height / 2, height - 1, height + 300]) {
          const popupWidth = Math.min(140, width - 16)
          menu.props.anchor = { x, y }
          menu.window.innerWidth = width
          menu.window.innerHeight = height
          menu.menuRef.value = { getBoundingClientRect: () => ({ width: popupWidth }), scrollHeight: 200 }
          menu.updatePosition()
          const position = menu.menuStyles.value
          const renderedHeight = Math.min(200, Number.parseFloat(position.maxHeight))
          const top = Number.parseFloat(position.top) - (position.transform ? renderedHeight : 0)
          const left = Number.parseFloat(position.left)
          assert.ok(left >= 8 && left + popupWidth <= width - 8)
          assert.ok(top >= 8 && top + renderedHeight <= height - 8)
        }
      }
    }
  }
})

check('P2-13 popular videos retain a failed page and retry without discarding loaded cards', async () => {
  const requests = []
  let fail = false
  const context = await loadSourceFunctions('../src/contentScripts/views/Home/components/Trending.vue', ['getTrendingVideos', 'getData', 'retryTrendingRequest'], {
    tabState: { isCurrent: () => true },
    hasSettled: r(false),
    requestGeneration: 1,
    pn: r(1),
    noMoreContent: r(false),
    requestFailed: r(false),
    isLoading: r(false),
    videoList: r([]),
    emit: noop,
    reportRuntimeFailure: noop,
    initData: noop,
    transformTrendingVideo: item => item.item,
    api: { video: { getPopularVideos: async ({ pn }) => {
      requests.push(pn)
      return fail ? { code: -412 } : { code: 0, data: { no_more: false, list: Array.from({ length: 30 }, (_, index) => ({ aid: pn * 30 + index })) } }
    } } },
  })
  await context.getData(1)
  fail = true
  await context.getData(1)
  assert.equal(context.requestFailed.value, true)
  assert.equal(context.pn.value, 2)
  assert.equal(context.videoList.value.length, 30)
  fail = false
  context.retryTrendingRequest()
  await flush()
  assert.deepEqual(requests, [1, 2, 2])
  assert.equal(context.videoList.value.length, 60)
})

check('P2-13 weekly retries the failed edition; ranking and anime settle network/API failures', async () => {
  let fail = true
  let seriesCalls = 0
  const editions = []
  const weekly = await loadSourceFunctions('../src/contentScripts/views/Home/components/Weekly.vue', ['initData', 'fetchSeriesOne', 'getSeriesOne', 'retryWeeklyRequest'], {
    tabState: { isCurrent: () => true },
    hasSettled: r(false),
    requestGeneration: 0,
    isLoading: r(false),
    requestFailed: r(false),
    videoList: r([]),
    seriesList: r([]),
    activatedSeries: r(null),
    settings: { value: {} },
    HOME_SEARCH_STAGE_HEIGHT: 336,
    emit: noop,
    handleBackToTop: noop,
    reportRuntimeFailure: noop,
    transformWeeklyVideo: item => item,
    api: { ranking: {
      getPopularSeriesList: async () => {
        seriesCalls++
        return { code: 0, data: { list: [{ number: 42 }] } }
      },
      getPopularSeriesOne: async ({ number }) => {
        editions.push(number)
        return fail ? { code: -1 } : { code: 0, data: { list: [{ aid: 1 }] } }
      },
    } },
  })
  await weekly.initData()
  assert.equal(weekly.requestFailed.value, true)
  fail = false
  weekly.retryWeeklyRequest()
  await flush()
  assert.equal(seriesCalls, 1)
  assert.deepEqual(editions, [42, 42])
  assert.equal(weekly.requestFailed.value, false)
  const ranking = await loadSourceFunctions('../src/contentScripts/views/Home/components/Ranking.vue', ['getRankingVideos', 'getRankingPgc'], {
    tabState: { isCurrent: () => true },
    hasSettled: r(false),
    requestGeneration: 1,
    isLoading: r(false),
    requestFailed: r(false),
    videoList: [],
    PgcList: [],
    emit: noop,
    reportRuntimeFailure: noop,
    api: { ranking: { getRankingVideos: async () => { throw new Error('offline') }, getRankingPgc: async () => ({ code: -1 }) } },
  })
  await ranking.getRankingVideos(1, { rid: 0 })
  assert.equal(ranking.requestFailed.value, true)
  assert.equal(ranking.isLoading.value, false)
  ranking.requestFailed.value = false
  await ranking.getRankingPgc(1, 1)
  assert.equal(ranking.requestFailed.value, true)
  assert.equal(ranking.isLoading.value, false)
  const anime = await loadSourceFunctions('../src/contentScripts/views/Anime/Anime.vue', ['getPopularAnimeList'], {
    requestGeneration: 1,
    isLoadingPopularAnime: r(false),
    popularRequestFailed: r(false),
    popularAnimeList: [],
    getAnimeAccountId: () => '1',
    isAnimeRequestCurrent: () => true,
    reportRuntimeFailure: noop,
    api: { anime: { getPopularAnimeList: async () => ({ code: -1 }) } },
  })
  await anime.getPopularAnimeList()
  assert.equal(anime.popularRequestFailed.value, true)
  assert.equal(anime.isLoadingPopularAnime.value, false)
  anime.api.anime.getPopularAnimeList = async () => ({ code: 0, result: { list: [{ id: 'ok' }] } })
  await anime.getPopularAnimeList()
  assert.equal(anime.popularRequestFailed.value, false)
  assert.equal(anime.popularAnimeList.length, 1)
})

check('P2-14 custom multipart order excludes collection manuscripts and preserves list contexts', async () => {
  const fixture = document.body.appendChild(document.createElement('section'))
  fixture.innerHTML = '<div class="video-pod"><div class="video-pod__list"><div class="simple-base-item" id="collection-a"></div><div class="simple-base-item" id="collection-b"></div></div><div class="video-pod__item" id="part-1"></div><div class="video-pod__item" id="part-2"></div></div>'
  let type = 'multipart'
  const context = await loadSourceFunctions('../src/utils/randomPlay.ts', ['episodeRootSelector', 'queryEpisodeItems', 'getVideoEpisodes'], {
    document,
    detectVideoType: () => type,
    VideoType: { MULTIPART: 'multipart' },
  })
  assert.deepEqual(Array.from(context.getVideoEpisodes(), item => item.id), ['part-1', 'part-2'])
  for (type of ['collection', 'watchLater', 'playlist'])
    assert.equal(context.getVideoEpisodes().length, 4)
  fixture.querySelectorAll('.video-pod__item').forEach(item => item.remove())
  type = 'multipart'
  assert.equal(context.getVideoEpisodes().length, 0, 'missing multipart DOM must not fall through to other manuscripts')
  type = 'collection'
  assert.equal(context.getVideoEpisodes().length, 2)
  fixture.remove()
})

registerPlaybackVisualFixChecks(check, { Vue, compileComponent, flush })

try {
  for (const { name, run } of checks) {
    await run()
    console.log(`PASS ${name}`)
  }
}
finally {
  dom.window.close()
  for (const [name, descriptor] of savedGlobals) {
    if (descriptor)
      Object.defineProperty(globalThis, name, descriptor)
    else
      delete globalThis[name]
  }
}
