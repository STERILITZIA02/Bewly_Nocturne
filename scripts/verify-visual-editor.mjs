import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import process from 'node:process'
import vm from 'node:vm'

import { parse as parseYaml } from 'yaml'

import { loadSourceModule } from './sourceModuleHarness'

async function loadLayout(Vue) {
  const settings = Vue.ref({ dockPosition: 'bottom', sidebarPosition: 'left', momentsGridColumns: '3', watchLaterLayoutMode: 'list' })
  const gridLayout = Vue.ref({ home: 'adaptive' })
  const layout = await loadSourceModule('../src/logic/layoutEdit.ts', {
    'vue': Vue,
    '~/constants/dock': await import('../src/constants/dock'),
    '~/enums/appEnums': await import('../src/enums/appEnums'),
    '~/logic/storage': { settings, gridLayout },
    './layoutEditPreview': await import('../src/logic/layoutEditPreview'),
    './recommendationMode': { getRecommendationModeOption: () => 'web', selectRecommendationMode() {} },
  }, { SVGElement: window.SVGElement })
  return { layout, settings, gridLayout }
}

function box(element, left, top, width, height) {
  element.getBoundingClientRect = () => ({ x: left, y: top, left, top, right: left + width, bottom: top + height, width, height })
  for (const [name, value] of Object.entries({ offsetWidth: width, offsetHeight: height, clientWidth: width, clientHeight: height }))
    Object.defineProperty(element, name, { value, configurable: true })
}

export function registerVisualEditorChecks(check, { Vue, compileComponent, flush }) {
  check('visual editor: a reused control updates its settings identity without losing the selected object', async () => {
    const { layout } = await loadLayout(Vue)
    const node = document.body.appendChild(document.createElement('button'))
    try {
      layout.vLayoutEditable.mounted(node, { value: 'dock-undo-refresh-action' })
      layout.enterLayoutEditMode('dock-undo-refresh-action', node)
      layout.vLayoutEditable.updated(node, { value: 'dock-forward-refresh-action' })
      await flush()
      assert.equal(layout.activeLayoutEditTargetId.value, 'dock-forward-refresh-action')
      assert.equal(layout.activeLayoutEditTargetElement.value, node)
      layout.vLayoutEditable.updated(node, { value: '' })
      await flush()
      assert.equal(layout.activeLayoutEditTargetId.value, null)
      assert.equal(layout.activeLayoutEditTargetElement.value, undefined, 'objects without setting mappings are no longer selectable')
    }
    finally {
      layout.vLayoutEditable.unmounted(node)
      layout.exitLayoutEditMode()
      node.remove()
    }
  })

  check('visual editor: every preview setting cancels and commits consistently', async () => {
    const { layout } = await loadLayout(Vue)
    const controls = new Map(layout.getLayoutEditableDescriptors().filter(target => target.previewControl).map(target => [target.settingId, target.previewControl]))
    const values = [...controls].map(([id, control]) => {
      const setting = layout.getSettingDescriptor(id)
      const before = setting.get()
      return { id, setting, before, after: control.options.find(option => option.value !== before).value, effective: layout.useLayoutEditSettingValue(id, setting.get) }
    })
    for (const commit of [false, true]) {
      layout.enterLayoutEditMode()
      for (const value of values) {
        layout.beginLayoutEditSettingPreview(value.id)
        layout.updateLayoutEditSettingPreview(value.after)
      }
      for (const value of values) {
        assert.equal(value.setting.get(), value.before, `${value.id} writes only on completion`)
        assert.equal(value.effective.value, value.after, `${value.id} retains its preview while switching targets`)
      }
      if (commit)
        layout.completeLayoutEditMode()
      else layout.exitLayoutEditMode()
      for (const value of values) {
        assert.equal(value.setting.get(), commit ? value.after : value.before, value.id)
        assert.equal(value.effective.value, value.setting.get(), value.id)
      }
    }
  })

  check('visual editor: shared library spacing follows Dock preview and cancellation', async () => {
    const { layout, settings } = await loadLayout(Vue)
    const Component = await compileComponent('../src/components/LibraryWorkspace.vue', {
      '~/composables/useSidebarHost': { useSidebarRail: () => undefined },
      '~/logic': { settings },
      '~/logic/layoutEdit': layout,
    }, { globals: {} })
    const host = document.body.appendChild(document.createElement('div'))
    const app = Vue.createApp(Component, { label: 'Library' })
    app.mount(host)
    const hasBottomSpace = () => host.querySelector('.library-workspace').classList.contains('library-workspace--bottom-dock')
    try {
      assert.equal(hasBottomSpace(), true)
      layout.enterLayoutEditMode()
      layout.beginLayoutEditSettingPreview('navigation.dock.position')
      layout.updateLayoutEditSettingPreview('right')
      await flush()
      assert.equal(hasBottomSpace(), false)
      assert.equal(settings.value.dockPosition, 'bottom')
      layout.exitLayoutEditMode()
      await flush()
      assert.equal(hasBottomSpace(), true)
    }
    finally {
      layout.exitLayoutEditMode()
      app.unmount()
      host.remove()
    }
  })

  check('visual editor: every registered target has current settings, labels and a selectable exact instance', async () => {
    const { layout } = await loadLayout(Vue)
    const locales = await Promise.all(['cmn-CN', 'cmn-TW', 'en', 'jyut'].map(async locale => parseYaml(await readFile(new URL(`../src/_locales/${locale}.yml`, import.meta.url), 'utf8'))))
    for (const locale of locales) {
      for (const key of ['no_settings'])
        assert.equal(typeof locale.layout_editor[key], 'string', key)
    }
    const files = await readdir(new URL('../src/components/Settings/', import.meta.url), { recursive: true })
    const sources = await Promise.all(files.filter(file => file.endsWith('.vue')).map(file => readFile(new URL(`../src/components/Settings/${file}`, import.meta.url), 'utf8')))
    const host = document.body.appendChild(document.createElement('div'))
    try {
      for (const descriptor of layout.getLayoutEditableDescriptors()) {
        const setting = layout.getSettingDescriptor(descriptor.settingId)
        assert.ok(setting, descriptor.id)
        assert.ok(sources.some(source => source.includes(`"${setting.id}"`) || source.includes(`'${setting.id}'`)), `${descriptor.id}: setting target ${setting.id} is absent`)
        for (const locale of locales) {
          for (const key of [descriptor.titleKey, setting.titleKey, ...descriptor.previewControl?.options.map(option => option.labelKey) ?? []])
            assert.equal(typeof key.split('.').reduce((value, part) => value?.[part], locale), 'string', `${descriptor.id}: missing ${key}`)
        }
        const node = host.appendChild(document.createElement('button'))
        const release = layout.registerLayoutEditableElement(descriptor.id, node)
        assert.equal(layout.findVisualEditTarget([node, host]), node)
        layout.selectVisualEditElement(node)
        assert.equal(layout.activeLayoutEditTargetId.value, descriptor.id)
        assert.equal(layout.activeLayoutEditTargetElement.value, node)
        release()
        node.remove()
      }
      console.log(`Verified ${layout.getLayoutEditableDescriptors().length} editor targets against current setting rows and all four locales`)
    }
    finally {
      layout.exitLayoutEditMode()
      host.remove()
    }
  })

  check('visual editor: content selects its setting region, never individual text, graphics or cards', async () => {
    const { layout } = await loadLayout(Vue)
    const host = document.body.appendChild(document.createElement('div'))
    const region = host.appendChild(document.createElement('div'))
    const release = layout.registerLayoutEditableElement('home-video-grid', region)
    const button = region.appendChild(document.createElement('button'))
    const icon = button.appendChild(document.createElement('span'))
    const svg = region.appendChild(document.createElementNS('http://www.w3.org/2000/svg', 'svg'))
    const path = svg.appendChild(document.createElementNS('http://www.w3.org/2000/svg', 'path'))
    try {
      assert.equal(layout.findVisualEditTarget([icon, button, region, host]), region)
      assert.equal(layout.findVisualEditTarget([path, svg, region, host]), region)
      assert.equal(layout.findVisualEditTarget([host]), undefined)
      const releaseInner = layout.registerLayoutEditableElement('home-grid-switcher', button)
      assert.equal(layout.findVisualEditTarget([icon, button, region, host]), region, 'nested targets sharing one setting resolve to the whole setting surface')
      releaseInner()
      layout.enterLayoutEditMode('home-video-grid', region)
      layout.beginLayoutEditSettingPreview('page.home.gridLayout')
      layout.updateLayoutEditSettingPreview('twoColumns')
      layout.selectVisualEditElement(button)
      assert.equal(layout.activeLayoutEditTargetId.value, 'home-video-grid')
      assert.equal(layout.activeLayoutEditTargetElement.value, region)
      assert.equal(layout.activeLayoutEditPreviewValue.value, 'twoColumns')
    }
    finally {
      layout.exitLayoutEditMode()
      release()
      host.remove()
    }
  })
  check('visual editor: multiple previews survive target changes and save/cancel as one session', async () => {
    const { layout, settings, gridLayout } = await loadLayout(Vue)
    const host = document.body.appendChild(document.createElement('div'))
    const dock = host.appendChild(document.createElement('button'))
    const grid = host.appendChild(document.createElement('div'))
    const releaseDock = layout.registerLayoutEditableElement('dock', dock)
    const releaseGrid = layout.registerLayoutEditableElement('home-video-grid', grid)
    const dockValue = layout.useLayoutEditSettingValue('navigation.dock.position', () => settings.value.dockPosition)
    const gridValue = layout.useLayoutEditSettingValue('page.home.gridLayout', () => gridLayout.value.home)
    try {
      layout.enterLayoutEditMode('dock', dock)
      layout.beginLayoutEditSettingPreview('navigation.dock.position')
      layout.updateLayoutEditSettingPreview('right')
      layout.setActiveLayoutEditTarget('home-video-grid', grid)
      layout.beginLayoutEditSettingPreview('page.home.gridLayout')
      layout.updateLayoutEditSettingPreview('twoColumns')
      assert.equal(dockValue.value, 'right')
      assert.equal(gridValue.value, 'twoColumns')
      assert.equal(settings.value.dockPosition, 'bottom')
      assert.equal(gridLayout.value.home, 'adaptive')
      layout.setActiveLayoutEditTarget('dock', dock)
      layout.beginLayoutEditSettingPreview('navigation.dock.position')
      assert.equal(layout.activeLayoutEditPreviewValue.value, 'right')
      layout.completeLayoutEditMode()
      assert.equal(settings.value.dockPosition, 'right')
      assert.equal(gridLayout.value.home, 'twoColumns')
      layout.enterLayoutEditMode('dock', dock)
      layout.beginLayoutEditSettingPreview('navigation.dock.position')
      layout.updateLayoutEditSettingPreview('bottom')
      layout.setActiveLayoutEditTarget(null)
      assert.equal(dockValue.value, 'bottom', 'clearing selection keeps the session draft')
      layout.exitLayoutEditMode()
      assert.equal(dockValue.value, 'right')
      layout.enterLayoutEditMode('home-video-grid', grid)
      releaseGrid()
      await flush()
      assert.equal(layout.isLayoutEditing.value, true, 'a disappearing target must not silently cancel other changes')
      assert.equal(layout.activeLayoutEditTargetId.value, null)
    }
    finally {
      layout.exitLayoutEditMode()
      releaseDock()
      host.remove()
    }
  })

  check('visual editor: outline follows the painted shape and clips scroll owners across Shadow DOM', async () => {
    const { measureLayoutEditTarget } = await import('../src/utils/layoutEditGeometry')
    const host = document.body.appendChild(document.createElement('div'))
    box(host, 0, 0, 400, 300)
    host.style.overflowY = 'hidden'
    const root = host.attachShadow({ mode: 'open' })
    const scroll = root.appendChild(document.createElement('div'))
    scroll.style.overflowY = 'auto'
    box(scroll, 10, 50, 200, 100)
    const target = scroll.appendChild(document.createElement('div'))
    const bodyOverflow = document.body.style.overflowY
    box(target, 20, 30, 80, 180)
    target.style.borderTopLeftRadius = '50%'
    target.style.borderTopRightRadius = '12px'
    target.style.setProperty('corner-shape', 'superellipse(1.1)')
    Object.defineProperty(target, 'offsetWidth', { value: 40, configurable: true })
    Object.defineProperty(target, 'offsetHeight', { value: 90, configurable: true })
    try {
      let geometry = measureLayoutEditTarget(target)
      assert.equal(geometry.style.left, '20px')
      assert.equal(geometry.style.height, '180px', 'clip the real box, never redraw a false rounded box at the viewport edge')
      assert.equal(geometry.style.borderTopLeftRadius, '50% 50%')
      assert.equal(geometry.style.borderTopRightRadius, '24px 24px')
      assert.equal(geometry.style.clipPath, 'inset(20px 0px 60px 0px)')
      assert.equal(geometry.visible.top, 50)
      assert.equal(geometry.visible.bottom, 150)
      scroll.style.opacity = '0'
      assert.equal(measureLayoutEditTarget(target), undefined, 'hidden ancestor suppresses the target')
      scroll.style.opacity = '1'
      box(target, 20, -200, 80, 180)
      assert.equal(measureLayoutEditTarget(target), undefined, 'offscreen target has no outline')
      box(target, 20, 80, 80, 40)
      geometry = measureLayoutEditTarget(target)
      assert.equal(geometry.style.top, '80px')
      host.style.position = 'fixed'
      document.body.style.overflowY = 'auto'
      assert.ok(measureLayoutEditTarget(target), 'a fixed app escapes the zero-height body even when its overflow computes to auto')
      target.remove()
      assert.equal(measureLayoutEditTarget(target), undefined)
    }
    finally {
      document.body.style.overflowY = bodyOverflow
      host.remove()
    }
  })

  check('visual editor: actual overlay selects exact instances, blocks business events, tracks scrolling and releases resources', async () => {
    const { layout, settings } = await loadLayout(Vue)
    const geometry = await import('../src/utils/layoutEditGeometry')
    const oldAnimations = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'getAnimations')
    const oldScrolling = Object.getOwnPropertyDescriptor(document, 'scrollingElement')
    HTMLElement.prototype.getAnimations = () => []
    Object.defineProperty(document, 'scrollingElement', { value: document.documentElement, configurable: true })
    const host = document.body.appendChild(document.createElement('div'))
    const shadow = host.attachShadow({ mode: 'open' })
    const viewport = shadow.appendChild(document.createElement('main'))
    const original = viewport.appendChild(document.createElement('button'))
    const target = viewport.appendChild(document.createElement('button'))
    const duplicate = viewport.appendChild(document.createElement('button'))
    const other = viewport.appendChild(document.createElement('button'))
    const frame = viewport.appendChild(document.createElement('iframe'))
    const mount = viewport.appendChild(document.createElement('div'))
    box(target, 20, 100, 120, 40)
    box(duplicate, 200, 100, 120, 40)
    box(other, 400, 100, 80, 40)
    const releases = [layout.registerLayoutEditableElement('dock', target), layout.registerLayoutEditableElement('dock', duplicate)]
    let businessEvents = 0
    for (const type of ['click', 'pointerup', 'mousedown', 'mouseenter', 'dragstart', 'contextmenu', 'keydown', 'wheel'])
      target.addEventListener(type, () => businessEvents++)
    const Button = { setup: (_props, { attrs, slots }) => () => Vue.h('button', { ...attrs, type: 'button' }, slots.default?.()) }
    const Overlay = await compileComponent('../src/components/LayoutEditorOverlay.vue', {
      'vue-i18n': { useI18n: () => ({ t: key => key }) },
      '~/composables/useAppProvider': { useBewlyApp: () => ({ mainAppRef: Vue.ref(viewport), scrollViewportRef: Vue.ref(viewport) }) },
      '~/logic/layoutEdit': layout,
      '~/utils/layoutEditGeometry': geometry,
      './Button.vue': { default: Button },
      './IconButton.vue': { default: Button },
      '~/utils/wheelStep': await import('../src/utils/wheelStep'),
    }, { globals: { MouseEvent, HTMLIFrameElement: window.HTMLIFrameElement, PointerEvent: window.PointerEvent, ResizeObserver: class { observe() {} unobserve() {} disconnect() {} } } })
    const opened = []
    const app = Vue.createApp(Overlay, { onOpenSetting: id => opened.push(id) })
    app.mount(mount)
    const menuLogic = await loadSourceModule('../src/logic/elementSettingsMenu.ts', {
      '~/enums/appEnums': await import('../src/enums/appEnums'),
      './layoutEdit': layout,
      './storage': { settings },
      '~/utils/topBarBadge': { getBadgeType() {}, getComponentConfig() {}, isComponentVisible() {} },
    })
    const ContextMenu = { props: ['options'], emits: ['select', 'close'], setup: (props, { emit }) => () => Vue.h('div', { role: 'menu' }, props.options.map(option => Vue.h('button', { role: 'menuitem', onClick: () => emit('select', option.value) }, option.label))) }
    const ElementMenu = await compileComponent('../src/components/ElementSettingsContextMenu.vue', {
      '@vueuse/core': await import('@vueuse/core'),
      'vue-i18n': { useI18n: () => ({ t: key => key }) },
      '~/components/ContextMenu.vue': { default: ContextMenu },
      '~/composables/useAppProvider': { useBewlyApp: () => ({ mainAppRef: Vue.ref(viewport) }) },
      '~/composables/useCurrentLocationHref': { useCurrentLocationHref: () => Vue.ref('https://www.bilibili.com/') },
      '~/logic/elementSettingsMenu': menuLogic,
      '~/logic/layoutEdit': layout,
      '~/stores/mainStore': { useMainStore: () => ({ dockItems: [] }) },
      '~/stores/settingsStore': { useSettingsStore: () => ({}) },
    }, { globals: { MouseEvent } })
    const menuApp = Vue.createApp(ElementMenu)
    menuApp.mount(viewport.appendChild(document.createElement('div')))
    const settle = async () => {
      await flush()
      await new Promise(resolve => setTimeout(resolve, 35))
      await flush()
    }
    const fire = (element, type, options = {}) => {
      const event = type === 'keydown' ? new KeyboardEvent(type, { bubbles: true, composed: true, cancelable: true, ...options }) : new MouseEvent(type, { bubbles: true, composed: true, cancelable: true, ...options })
      element.dispatchEvent(event)
      return event
    }
    try {
      original.focus()
      assert.equal(fire(duplicate, 'contextmenu').defaultPrevented, true)
      await settle()
      assert.ok([...shadow.querySelectorAll('[role="menuitem"]')].some(button => button.textContent.includes('position.right')), 'the current element settings menu keeps its direct controls')
      ;[...shadow.querySelectorAll('[role="menuitem"]')].find(button => button.textContent.includes('quick_edit')).click()
      await settle()
      assert.equal(frame.hasAttribute('inert'), false, 'the editor does not mutate iframe interactivity')
      assert.equal(shadow.querySelector('.layout-editor-outline').style.left, '200px', 'right-click entry must retain the exact duplicate instance')
      for (const type of ['mousedown', 'pointerup', 'mouseenter', 'dragstart', 'contextmenu'])
        fire(target, type)
      fire(target, 'keydown', { key: 'Enter' })
      assert.equal(fire(target, 'wheel').defaultPrevented, false, 'native scrolling remains available')
      assert.equal(businessEvents, 0)
      fire(target, 'click')
      await settle()
      assert.equal(shadow.querySelector('.layout-editor-outline').style.left, '20px')
      box(target, 20, 180, 120, 40)
      viewport.dispatchEvent(new Event('scroll'))
      await settle()
      assert.equal(shadow.querySelector('.layout-editor-outline').style.top, '180px')
      const right = [...shadow.querySelectorAll('.layout-editor-menu button')].find(button => button.textContent.includes('position.right'))
      right.click()
      await settle()
      assert.equal(layout.activeLayoutEditPreviewValue.value, 'right')
      assert.equal(settings.value.dockPosition, 'bottom')
      fire(other, 'click', { clientX: 30, clientY: 190 })
      await settle()
      assert.equal(layout.activeLayoutEditTargetId.value, null, 'an overlapping unrelated element must not select a rectangle underneath it')
      assert.equal(layout.activeLayoutEditTargetElement.value, undefined)
      assert.equal(shadow.querySelector('.layout-editor-menu'), null)
      assert.equal(shadow.querySelector('.layout-editor-menu__choices'), null)
      assert.ok(shadow.querySelector('.layout-editor-toolbar'), 'cancel/done stay available without selection')
      fire(shadow.querySelector('.layout-editor-toolbar button'), 'keydown', { key: 'Tab' })
      assert.ok(shadow.querySelector('.layout-editor-overlay').contains(shadow.activeElement))
      fire(shadow.activeElement, 'keydown', { key: 'Escape' })
      await settle()
      assert.equal(layout.isLayoutEditing.value, false)
      assert.equal(settings.value.dockPosition, 'bottom')
      assert.equal(frame.hasAttribute('inert'), false)
      assert.equal(shadow.activeElement, original)
      fire(target, 'click')
      assert.equal(businessEvents, 1, 'normal interaction resumes after exit')
      layout.enterLayoutEditMode('dock', target)
      await settle()
      ;[...shadow.querySelectorAll('.layout-editor-menu button')].find(button => button.textContent.includes('apply_open_setting')).click()
      await settle()
      assert.deepEqual(opened, ['navigation.dock.position'])
      assert.equal(layout.isLayoutEditing.value, false)
    }
    finally {
      menuApp.unmount()
      app.unmount()
      releases.forEach(release => release())
      host.remove()
      if (oldAnimations)
        Object.defineProperty(HTMLElement.prototype, 'getAnimations', oldAnimations)
      else delete HTMLElement.prototype.getAnimations
      if (oldScrolling)
        Object.defineProperty(document, 'scrollingElement', oldScrolling)
      else delete document.scrollingElement
    }
  })

  check('visual editor: localized entry names and targets follow current controls instead of page wrappers', async () => {
    for (const [locale, name] of [['cmn-CN', '可视化编辑'], ['cmn-TW', '視覺化編輯'], ['jyut', '視覺化編輯'], ['en', 'Visual editing']]) {
      const source = await readFile(new URL(`../src/_locales/${locale}.yml`, import.meta.url), 'utf8')
      assert.ok(source.includes(`quick_edit: ${name}`))
    }
    const read = path => readFile(new URL(`../src/${path}`, import.meta.url), 'utf8')
    assert.doesNotMatch(await read('components/TopBar/TopBar.vue'), /data-layout-editable-id="topbar"/)
    assert.match(await read('components/TopBar/components/TopBarRight.vue'), /v-layout-editable="'topbar'" class="top-bar-tools"/)
    assert.doesNotMatch(await read('components/SideBar/SideBar.vue'), /v-layout-editable="'sidebar-auto-hide'"/)
    assert.match(await read('components/Dock/Dock.vue'), /useLayoutEditableRoot\('dock', dockShellSurfaceRef\)/)
    assert.match(await read('components/SearchBar/SearchBar.vue'), /v-layout-editable="layoutEditableId \?\? ''"\s+class="search-bar/)
    assert.doesNotMatch(await read('contentScripts/views/WatchLater/WatchLater.vue'), /<main\s+v-layout-editable/)
  })
}

// Also runnable on its own while unrelated feature fixtures are being updated.
if (process.argv[1]?.endsWith('/verify-visual-editor.mjs')) {
  const { JSDOM } = await import('jsdom')
  const { default: ts } = await import('typescript')
  const { compileScript, parse } = await import('vue/compiler-sfc')
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true })
  const names = ['window', 'document', 'Document', 'ShadowRoot', 'Element', 'HTMLElement', 'SVGElement', 'Node', 'Event', 'MouseEvent', 'KeyboardEvent', 'MutationObserver', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame']
  const saved = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]))
  for (const name of names) {
    const value = name === 'window' ? dom.window : ['getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame'].includes(name) ? dom.window[name].bind(dom.window) : dom.window[name]
    Object.defineProperty(globalThis, name, { value, writable: true, configurable: true })
  }
  dom.window.HTMLElement.prototype.getClientRects = function () {
    return this.isConnected && !this.closest('[hidden]') ? [{ width: 100, height: 40 }] : []
  }
  const Vue = await import('vue')
  const checks = []
  async function flush() {
    for (let turn = 0; turn < 8; turn++)
      await Vue.nextTick()
  }
  async function compileComponent(file, mocks, { globals }) {
    const { descriptor } = parse(await readFile(new URL(file, import.meta.url), 'utf8'))
    const source = compileScript(descriptor, { id: file, inlineTemplate: true }).content
    const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: false } }).outputText
    const modules = {
      'vue': Vue,
      '~/constants/layout': await import('../src/constants/layout'),
      '~/utils/dialogFocus': await import('../src/utils/dialogFocus'),
      '~/utils/floatingMenu': await import('../src/utils/floatingMenu'),
      '~/utils/viewportGeometry': await import('../src/utils/viewportGeometry'),
      ...mocks,
    }
    const exports = {}
    vm.runInNewContext(code, {
      ...Object.fromEntries(names.map(name => [name, globalThis[name]])),
      console,
      exports,
      require: (name) => {
        assert.ok(name in modules, `Missing test dependency: ${name}`)
        return modules[name]
      },
      ...globals,
    }, { filename: file })
    return exports.default
  }
  try {
    registerVisualEditorChecks((name, run) => checks.push({ name, run }), { Vue, compileComponent, flush })
    for (const { name, run } of checks) {
      await run()
      console.log(`PASS ${name}`)
    }
  }
  finally {
    dom.window.close()
    for (const [name, descriptor] of saved) {
      if (descriptor)
        Object.defineProperty(globalThis, name, descriptor)
      else
        delete globalThis[name]
    }
  }
}
