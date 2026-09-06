import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import { compileStyleAsync, parse } from 'vue/compiler-sfc'

export function registerDockGlassChecks(check, { Vue, compileComponent, flush }) {
  check('Dock glass settings: real form writes blur, custom color and opacity without losing the saved tint', async () => {
    const parameters = await import('../src/constants/liquidGlass')
    const range = await import('../src/utils/range')
    const Radio = await compileComponent('../src/components/Radio.vue')
    const Slider = await compileComponent('../src/components/Slider.vue', { '~/utils/range': range })
    const Item = await compileComponent('../src/components/Settings/components/SettingsItem.vue')
    const Group = await compileComponent('../src/components/Settings/components/SettingsItemGroup.vue')
    const Select = {
      props: ['modelValue', 'options'],
      emits: ['update:modelValue'],
      setup: (props, { emit }) => () => Vue.h('select', { value: String(props.modelValue), onChange: event => emit('update:modelValue', event.target.value) }, props.options.map(option => Vue.h('option', { value: String(option.value) }, option.label))),
    }
    const settings = Vue.ref({ alwaysUseDock: false, dockCollapseMode: 'button', dockPosition: 'bottom', dockItemsConfig: [], pageMode: 'bewly', disableDockGlowingEffect: false, showBewlyOrBiliPageSwitcher: true, disableLightDarkModeSwitcherOnDock: false, backToTopAndRefreshButtonsAreSeparated: false, enableUndoRefreshButton: false, sidebarPosition: 'right', autoHideSidebar: false, enableDockLiquidGlass: false, disableFrostedGlass: false, dockLiquidGlassMode: 'standard', dockLiquidGlassRefraction: 35, dockLiquidGlassBlur: 6, dockLiquidGlassTintSource: 'theme', dockLiquidGlassTintColor: '#ffffff', dockLiquidGlassTintOpacity: 30, dockLiquidGlassDispersion: 1.5, dockLiquidGlassSaturation: 140 })
    const page = await compileComponent('../src/components/Settings/PluginComponentsAndPages/DockAndSidebar/DockAndSidebar.vue', {
      'vue-i18n': { useI18n: () => ({ t: key => key }) },
      'vuedraggable': { default: { render: () => null } },
      '~/components/Button.vue': { default: { render: () => null } },
      '~/components/Radio.vue': { default: Radio },
      '~/components/Select.vue': { default: Select },
      '~/components/Slider.vue': { default: Slider },
      '~/constants/liquidGlass': parameters,
      '~/logic': { settings },
      '~/stores/mainStore': { useMainStore: () => ({ dockItems: [] }) },
      '~/stores/settingsStore': { useSettingsStore: () => ({ getUseOriginalBilibiliTopBar: () => false }) },
      '../../components/SettingsItem.vue': { default: Item },
      '../../components/SettingsItemGroup.vue': { default: Group },
    })
    const host = document.body.appendChild(document.createElement('div'))
    const app = Vue.createApp(page)
    app.config.globalProperties.$t = key => key
    app.mount(host)
    host.querySelector('[data-setting-id="navigation.dock.liquidGlass"] input').click()
    await flush()
    assert.equal(settings.value.enableDockLiquidGlass, true)
    const blur = host.querySelector('[data-settings-title="settings.dock_glass_blur"] input')
    blur.value = '20'
    blur.dispatchEvent(new Event('input', { bubbles: true }))
    await flush()
    assert.equal(settings.value.dockLiquidGlassBlur, 20)
    const source = host.querySelector('[data-setting-id="navigation.dock.glassTint"] select')
    source.value = 'custom'
    source.dispatchEvent(new Event('change', { bubbles: true }))
    await flush()
    const color = host.querySelector('input[type="color"]')
    color.value = '#7a3f91'
    color.dispatchEvent(new Event('input', { bubbles: true }))
    const opacity = host.querySelector('[data-settings-title="settings.dock_glass_tint_opacity"] input')
    opacity.value = '65'
    opacity.dispatchEvent(new Event('input', { bubbles: true }))
    await flush()
    assert.equal(settings.value.dockLiquidGlassTintColor, '#7a3f91')
    assert.equal(settings.value.dockLiquidGlassTintOpacity, 65)
    source.value = 'theme'
    source.dispatchEvent(new Event('change', { bubbles: true }))
    await flush()
    assert.equal(host.querySelector('input[type="color"]'), null)
    assert.equal(settings.value.dockLiquidGlassTintColor, '#7a3f91')
    settings.value.disableFrostedGlass = true
    await flush()
    assert.ok(host.textContent.includes('settings.dock_liquid_glass_paused'))
    app.unmount()
    host.remove()
  })

  async function withResizeObserver(run) {
    const previous = window.ResizeObserver
    const previousGlobal = globalThis.ResizeObserver
    const observers = []
    window.ResizeObserver = class {
      elements = new Set()
      constructor(callback) {
        this.callback = callback
        observers.push(this)
      }

      observe(element) { this.elements.add(element) }
      unobserve(element) { this.elements.delete(element) }
      disconnect() { this.elements.clear() }
    }
    globalThis.ResizeObserver = window.ResizeObserver
    const resize = async (width, height) => {
      for (const observer of observers) {
        const entries = [...observer.elements].map(target => ({ target, contentBoxSize: [{ inlineSize: width, blockSize: height }], borderBoxSize: [{ inlineSize: width, blockSize: height }], contentRect: { width, height } }))
        if (entries.length)
          observer.callback(entries)
      }
      await flush()
    }
    try {
      await run({ observers, resize })
    }
    finally {
      window.ResizeObserver = previous
      globalThis.ResizeObserver = previousGlobal
    }
  }

  check('Dock glass: real library filter has one backdrop per surface, unique IDs and symmetric resize cleanup', async () => {
    await withResizeObserver(async ({ observers, resize }) => {
      const library = await import('@wxperia/liquid-glass-vue')
      const Surface = await compileComponent('../src/components/LiquidGlassSurface.vue', { '@wxperia/liquid-glass-vue': library })
      const enabled = Vue.ref(true)
      const mode = Vue.ref('standard')
      const options = Vue.reactive({ blur: 6, tintColor: '#446688', tintOpacity: 30 })
      const file = new URL('../src/components/LiquidGlassSurface.vue', import.meta.url)
      const descriptor = parse(await readFile(file, 'utf8')).descriptor
      const compiled = await compileStyleAsync({ source: descriptor.styles[0].content, filename: file.pathname, id: 'glass-test', preprocessLang: 'scss' })
      assert.equal(compiled.errors.length, 0)
      const style = document.head.appendChild(document.createElement('style'))
      style.textContent = compiled.code
      const host = document.body.appendChild(document.createElement('div'))
      const app = Vue.createApp({ setup: () => () => enabled.value ? Vue.h('div', [0, 1].map(key => Vue.h(Surface, { key, mode: mode.value, refraction: 35, ...options, dispersion: 1.5, saturation: 140 }))) : null })
      app.mount(host)
      await flush()
      await resize(600, 60)
      const filters = [...host.querySelectorAll('filter')]
      assert.equal(filters.length, 2)
      assert.notEqual(filters[0].id, filters[1].id)
      for (const surface of host.querySelectorAll('.bew-liquid-glass-surface')) {
        const warp = surface.querySelector('.bew-liquid-glass-surface__warp')
        assert.equal([...surface.querySelectorAll('*')].filter(element => element.style?.backdropFilter && element.style.backdropFilter !== 'none').length, 1)
        assert.equal(warp.style.backdropFilter, 'blur(6px) saturate(140%)')
        assert.equal(warp.style.filter, `url(#${surface.querySelector('filter').id})`)
        const tint = surface.querySelector('.bew-liquid-glass-surface__tint')
        assert.equal(tint.parentElement, surface, 'tint must not be distorted inside the optical layer')
        assert.equal(getComputedStyle(warp).backgroundColor, 'rgba(0, 0, 0, 0)')
        assert.equal(tint.style.backgroundColor, 'rgb(68, 102, 136)')
        assert.equal(tint.style.opacity, '0.3')
        assert.equal(getComputedStyle(tint).position, 'absolute')
        assert.equal(getComputedStyle(tint).inset, '0')
      }
      options.blur = 18
      options.tintColor = '#22aa66'
      options.tintOpacity = 65
      await flush()
      assert.equal(host.querySelector('.bew-liquid-glass-surface__warp').style.backdropFilter, 'blur(18px) saturate(140%)')
      assert.equal(host.querySelector('.bew-liquid-glass-surface__tint').style.backgroundColor, 'rgb(34, 170, 102)')
      assert.equal(host.querySelector('.bew-liquid-glass-surface__tint').style.opacity, '0.65')
      options.tintOpacity = 0
      await flush()
      assert.equal(host.querySelector('.bew-liquid-glass-surface__tint').style.opacity, '0')
      const map = host.querySelector('feImage').getAttribute('href')
      mode.value = 'polar'
      await flush()
      assert.notEqual(host.querySelector('feImage').getAttribute('href'), map)
      const polarMap = host.querySelector('feImage').getAttribute('href')
      mode.value = 'prominent'
      await flush()
      assert.notEqual(host.querySelector('feImage').getAttribute('href'), polarMap)
      assert.equal(host.querySelectorAll('filter').length, 2)
      await resize(64, 64)
      assert.equal(host.querySelector('svg').style.width, '64px')
      assert.equal(host.querySelector('svg').style.height, '64px')
      enabled.value = false
      await flush()
      assert.equal(host.querySelectorAll('filter').length, 0)
      assert.ok(observers.every(observer => observer.elements.size === 0))
      app.unmount()
      host.remove()
      style.remove()
    })
  })

  check('Dock glass: actual Dock replaces each surface, honors global disable and keeps its shell and controls', async () => {
    const { AppPage } = await import('../src/enums/appEnums')
    const { HomeSubPage } = await import('../src/contentScripts/views/Home/types')
    const dockPolicy = await import('../src/constants/dock')
    const layout = await import('../src/constants/layout')
    const activeItem = await import('../src/utils/dockActiveItem')
    const undoState = Vue.ref(0)
    const item = { page: AppPage.Home, visible: true, icon: '', iconActivated: '', i18nKey: 'Home' }
    const settings = Vue.ref({ dockPosition: 'bottom', dockCollapseMode: 'button', dockItemsConfig: [item], pageMode: 'bewly', useSearchPageModeOnHomePage: true, showBewlyOrBiliPageSwitcher: true, enableDockLiquidGlass: false, disableFrostedGlass: false, dockLiquidGlassMode: 'standard', dockLiquidGlassRefraction: 35, dockLiquidGlassBlur: 6, dockLiquidGlassTintSource: 'theme', dockLiquidGlassTintColor: '#ffffff', dockLiquidGlassTintOpacity: 30, dockLiquidGlassDispersion: 1.5, dockLiquidGlassSaturation: 140, frostedGlassBlurIntensity: 20 })
    const passthrough = { setup: (_props, { slots }) => () => Vue.h('div', slots.default?.()) }
    const Surface = { props: ['blur', 'tintColor', 'tintOpacity'], setup: props => () => Vue.h('span', { 'class': 'optical-test-surface', 'data-blur': props.blur, 'data-tint': props.tintColor, 'data-opacity': props.tintOpacity }) }
    const Dock = await compileComponent('../src/components/Dock/Dock.vue', {
      '@iconify/vue': { Icon: { render: () => Vue.h('svg') } },
      '@vueuse/core': { useElementSize: () => ({ width: Vue.ref(600), height: Vue.ref(60) }), useWindowSize: () => ({ width: Vue.ref(1280), height: Vue.ref(900) }), usePreferredReducedMotion: () => Vue.ref('reduce') },
      '~/composables/useAppProvider': { UndoForwardState: { ShowUndo: 1, ShowForward: 2 }, useBewlyApp: () => ({ reachTop: Vue.ref(true), homeActivatedPage: Vue.ref(HomeSubPage.ForYou), undoForwardState: undoState, canRefreshHomeSubPage: Vue.ref(true), getDockPageHref: () => '/' }) },
      '~/composables/useDark': { useDark: () => ({ isDark: Vue.ref(false), toggleDark: () => {} }) },
      '~/composables/useDelayedHover': { useDelayedHover: () => Vue.ref(null) },
      '~/constants/dock': dockPolicy,
      '~/constants/layout': layout,
      '~/contentScripts/views/Home/types': { HomeSubPage },
      '~/enums/appEnums': { AppPage },
      '~/logic': { settings },
      '~/logic/layoutEdit': { isLayoutEditing: Vue.ref(false), useLayoutEditableRoot: () => {}, useLayoutEditSettingValue: (_key, getValue) => Vue.computed(getValue), getDockItemLayoutEditableId: () => 'home', vLayoutEditable: {} },
      '~/stores/settingsStore': { useSettingsStore: () => ({ getDockItemIsUseOriginalBiliPage: () => false, ensureDockItemsConfig: () => settings.value.dockItemsConfig, getEffectiveDockItemByPage: () => item }) },
      '~/utils/dockActiveItem': activeItem,
      '~/utils/main': { isHomePage: () => true, openLinkToNewTab: () => {} },
      '../IconButton.vue': { default: { setup: (_props, { slots, attrs }) => () => Vue.h('button', attrs, slots.default?.()) } },
      '../LiquidGlassSurface.vue': { default: Surface },
      '../LiquidSegmentIndicator.vue': { default: { setup: (_props, { expose }) => {
        expose({ updateIndicator: () => {} })
        return () => Vue.h('span')
      } } },
      '../PageModeSwitcherButton.vue': { default: { render: () => Vue.h('button') } },
      '../Tooltip.vue': { default: passthrough },
    })
    const dockFile = new URL('../src/components/Dock/Dock.vue', import.meta.url)
    const descriptor = parse(await readFile(dockFile, 'utf8')).descriptor
    const compiled = await compileStyleAsync({ source: descriptor.styles[0].content, filename: fileURLToPath(dockFile), id: 'dock-test', preprocessLang: 'scss' })
    assert.equal(compiled.errors.length, 0)
    const style = document.head.appendChild(document.createElement('style'))
    style.textContent = compiled.code
    const host = document.body.appendChild(document.createElement('div'))
    const app = Vue.createApp(Dock, { activatedPage: AppPage.Home, settingsOpen: false })
    app.config.globalProperties.$t = key => key
    app.mount(host)
    await flush()
    const shell = host.querySelector('.dock-shell-surface')
    const frostedShadow = getComputedStyle(shell).boxShadow
    assert.notEqual(frostedShadow, 'none')
    const buttons = host.querySelectorAll('button').length
    assert.equal(host.querySelectorAll('.optical-test-surface').length, 0)
    settings.value.enableDockLiquidGlass = true
    await flush()
    assert.equal(host.querySelector('.dock-shell-surface'), shell, 'material changes preserve the morph owner')
    assert.equal(shell.querySelectorAll('.optical-test-surface').length, 1)
    assert.equal(host.querySelectorAll('.back-to-top-or-refresh-btn .optical-test-surface').length, 1)
    assert.equal(host.querySelectorAll('button').length, buttons)
    for (const owner of host.querySelectorAll('.dock-shell-surface, .back-to-top-or-refresh-btn')) {
      assert.equal(getComputedStyle(owner).borderColor, 'transparent', 'the backdrop must not sample its own border')
      assert.equal(getComputedStyle(owner).boxShadow, 'none', 'edge glow is painted by the foreground frame')
      // JSDOM does not compute backdrop-filter; check the matching compiled CSS
      // declaration here and verify the rendered effect in the browser.
      const backdropRule = [...style.sheet.cssRules].findLast(rule => rule.selectorText && rule.style.getPropertyValue('backdrop-filter') && owner.matches(rule.selectorText))
      assert.equal(backdropRule?.style.getPropertyValue('backdrop-filter'), 'none')
    }
    shell.parentElement.classList.add('collapsed')
    await flush()
    assert.equal(getComputedStyle(shell).boxShadow, 'none', 'collapsed styling must keep decorations out of the sampled backdrop')
    shell.parentElement.classList.remove('collapsed')
    settings.value.enableUndoRefreshButton = true
    undoState.value = 1
    await flush()
    assert.equal(host.querySelectorAll('.optical-test-surface').length, 3)
    undoState.value = 2
    await flush()
    assert.equal(host.querySelectorAll('.optical-test-surface').length, 3, 'undo/redo shares the same single optical surface')
    settings.value.frostedGlassBlurIntensity = 10
    await flush()
    assert.equal(shell.querySelector('[data-blur]').getAttribute('data-blur'), '6', 'liquid glass blur is independently adjustable')
    assert.equal(shell.querySelector('[data-tint]').getAttribute('data-tint'), 'var(--bew-liquid-glass-color)')
    settings.value.dockLiquidGlassBlur = 14.5
    settings.value.dockLiquidGlassTintSource = 'custom'
    settings.value.dockLiquidGlassTintColor = '#2a8f70'
    settings.value.dockLiquidGlassTintOpacity = 65
    await flush()
    for (const surface of host.querySelectorAll('.optical-test-surface')) {
      assert.equal(surface.getAttribute('data-blur'), '14.5')
      assert.equal(surface.getAttribute('data-tint'), '#2a8f70')
      assert.equal(surface.getAttribute('data-opacity'), '65')
    }
    settings.value.dockLiquidGlassTintSource = 'theme'
    await flush()
    assert.equal(shell.querySelector('[data-tint]').getAttribute('data-tint'), 'var(--bew-liquid-glass-color)')
    assert.equal(settings.value.dockLiquidGlassTintColor, '#2a8f70', 'switching tint source keeps the custom color')
    settings.value.disableFrostedGlass = true
    await flush()
    assert.equal(host.querySelectorAll('.optical-test-surface').length, 0)
    assert.equal(host.querySelector('.dock-content.liquid-glass'), null)
    assert.equal(getComputedStyle(shell).boxShadow, frostedShadow, 'global disable restores the original surface owner')
    settings.value.disableFrostedGlass = false
    settings.value.enableDockLiquidGlass = false
    await flush()
    assert.equal(host.querySelector('.dock-shell-surface'), shell)
    app.unmount()
    host.remove()
    style.remove()
  })
}
