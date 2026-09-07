import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

import { compile } from 'sass'

import { loadSourceModule } from './sourceModuleHarness'

export function registerLiquidGlassSurfaceChecks(check, { Vue, compileComponent, flush }) {
  check('liquid surfaces: injected playback CSS keeps optics outside the opacity backdrop root', async () => {
    const constants = await import('../src/utils/bewlyWidescreen/constants')
    const { BEWLY_WIDESCREEN_CONTROLS_HIDDEN_CLASS } = await import('../src/constants/globalEvents')
    const style = document.head.appendChild(document.createElement('style'))
    const layout = await loadSourceModule('../src/utils/bewlyWidescreen/styles/layout.ts', {
      '~/constants/globalEvents': { BEWLY_WIDESCREEN_CONTROLS_HIDDEN_CLASS },
      '~/styles/liquidGlass.scss?inline': { default: compile(fileURLToPath(new URL('../src/styles/liquidGlass.scss', import.meta.url))).css },
      '~/styles/segmentControl.scss?inline': { default: compile(fileURLToPath(new URL('../src/styles/segmentControl.scss', import.meta.url))).css },
      '~/styles/skeleton.scss?inline': { default: '' },
      '~/utils/bewlyWidescreen/constants': constants,
      '~/utils/bewlyWidescreenPolicy': await import('../src/utils/bewlyWidescreenPolicy'),
      '~/utils/main': { injectCSS: (css) => {
        style.textContent = css
        return style
      } },
      '~/utils/photoViewer': await import('../src/utils/photoViewer'),
    })
    const glass = document.body.appendChild(document.createElement('div'))
    glass.className = constants.DANMAKU_GLASS_CLASS
    glass.setAttribute('data-bew-liquid-glass', '')
    document.body.classList.add(constants.BODY_CLASS)
    try {
      layout.injectLayoutStyle()
      // JSDOM does not expose computed backdrop-filter. Read the matching
      // declaration from the real injected stylesheet; optical QA uses Chromium.
      const backdropDeclaration = () => [...style.sheet.cssRules]
        .filter(rule => rule.selectorText && glass.matches(rule.selectorText) && rule.style.getPropertyValue('backdrop-filter'))
        .at(-1)
        ?.style
        .getPropertyValue('backdrop-filter')
      for (const hidden of [false, true, false]) {
        document.body.classList.toggle(BEWLY_WIDESCREEN_CONTROLS_HIDDEN_CLASS, hidden)
        assert.equal(getComputedStyle(glass).opacity, '1', 'both steady states leave background sampling open')
        assert.equal(getComputedStyle(glass).willChange, 'auto')
        assert.equal(backdropDeclaration(), 'none', 'legacy blur is removed from the host')
      }
      glass.removeAttribute('data-bew-liquid-glass')
      assert.equal(backdropDeclaration(), 'var(--bew-filter-glass-1)', 'disabling liquid glass restores the original material')
    }
    finally {
      glass.remove()
      style.remove()
      document.body.classList.remove(constants.BODY_CLASS, BEWLY_WIDESCREEN_CONTROLS_HIDDEN_CLASS)
    }
  })

  check('liquid surfaces: first paint has optics before any ResizeObserver delivery', async () => {
    let resized
    let cleanups = 0
    const Surface = await compileComponent('../src/components/LiquidGlassSurface.vue', {
      '@wxperia/liquid-glass-vue': await import('@wxperia/liquid-glass-vue'),
      '@vueuse/core': { useResizeObserver: (_target, callback) => {
        resized = callback
        Vue.onScopeDispose(() => cleanups++)
      } },
    })
    const style = document.head.appendChild(document.createElement('style'))
    style.textContent = '.bew-liquid-glass-surface { width:480px; height:120px; }'
    const host = document.body.appendChild(document.createElement('div'))
    const app = Vue.createApp(Surface, { mode: 'standard', refraction: 35, blur: 6, dispersion: 1.5, saturation: 140, tintColor: '#000000', tintOpacity: 60 })
    try {
      app.mount(host)
      await flush()
      assert.equal(host.querySelectorAll('filter').length, 1)
      assert.equal(host.querySelector('svg').style.width, '480px')
      assert.equal(host.querySelector('svg').style.height, '120px')
      resized([{ contentRect: { width: 640.5, height: 240.5 } }])
      await flush()
      assert.equal(host.querySelector('svg').style.width, '640.5px')
      assert.equal(host.querySelector('svg').style.height, '240.5px')
    }
    finally {
      app.unmount()
      host.remove()
      style.remove()
    }
    assert.equal(cleanups, 1)
  })

  async function materialFixture() {
    const settings = Vue.ref({ enableDockLiquidGlass: true, disableFrostedGlass: false, dockLiquidGlassMode: 'standard', dockLiquidGlassRefraction: 35, dockLiquidGlassBlur: 6, dockLiquidGlassDispersion: 1.5, dockLiquidGlassSaturation: 140, dockLiquidGlassTintSource: 'theme', dockLiquidGlassTintColor: '#7a3f91', dockLiquidGlassTintOpacity: 30 })
    const isDark = Vue.ref(false)
    const isOledDark = Vue.ref(false)
    const material = await loadSourceModule('../src/composables/useLiquidGlass.ts', {
      'vue': Vue,
      '~/logic': { settings },
      '~/constants/liquidGlass': await import('../src/constants/liquidGlass'),
      '~/composables/useDark': { useDark: () => ({ isDark, isOledDark }) },
    })
    const library = await import('@wxperia/liquid-glass-vue')
    let mounted = 0
    const Surface = await compileComponent('../src/components/LiquidGlassSurface.vue', {
      '@wxperia/liquid-glass-vue': library,
      '@vueuse/core': { useResizeObserver: (_target, callback) => {
        mounted++
        Vue.onScopeDispose(() => mounted--)
        Vue.onMounted(() => callback([{ contentRect: { width: 420, height: 160 } }]))
      } },
    })
    const attachment = await loadSourceModule('../src/utils/liquidGlass.ts', {
      'vue': Vue,
      '~/components/LiquidGlassSurface.vue': { default: Surface },
      '~/composables/useLiquidGlass': material,
    })
    return {
      settings,
      isDark,
      isOledDark,
      material,
      attachment,
      get mounted() { return mounted },
    }
  }

  check('liquid surfaces: native and Shadow DOM hosts retain content, focus and events through theme and material changes', async () => {
    const fixture = await materialFixture()
    const shadowHost = document.body.appendChild(document.createElement('div'))
    const shadow = shadowHost.attachShadow({ mode: 'open' })
    const native = document.body.appendChild(document.createElement('aside'))
    const floating = shadow.appendChild(document.createElement('section'))
    native.innerHTML = '<button>Native action</button><input value="draft">'
    floating.innerHTML = '<button>Settings action</button>'
    const button = native.querySelector('button')
    const input = native.querySelector('input')
    let clicks = 0
    button.addEventListener('click', () => clicks++)
    input.focus()
    const nativeGlass = fixture.attachment.attachLiquidGlass(native)
    const floatingGlass = fixture.attachment.attachLiquidGlass(floating)
    try {
      await flush()
      assert.equal(fixture.mounted, 2)
      assert.equal(native.querySelector('button'), button)
      assert.equal(document.activeElement, input)
      assert.equal(input.value, 'draft')
      assert.notEqual(native.querySelector('filter').id, floating.querySelector('filter').id, 'separately rendered roots need unique filter IDs')
      const tint = () => Number(native.querySelector('.bew-liquid-glass-surface__tint').style.opacity)
      assert.ok(Math.abs(tint() - 0.83193) < 0.00001)
      fixture.isDark.value = true
      await flush()
      assert.ok(Math.abs(tint() - 0.799118) < 0.00001)
      fixture.isOledDark.value = true
      await flush()
      assert.ok(Math.abs(tint() - 0.901568) < 0.00001)
      assert.equal(fixture.mounted, 2, 'theme changes update existing optics without remounting')
      fixture.settings.value.dockLiquidGlassTintSource = 'custom'
      await flush()
      assert.equal(tint(), 0.3)
      assert.equal(native.querySelector('.bew-liquid-glass-surface__tint').style.backgroundColor, 'rgb(122, 63, 145)')
      fixture.settings.value.dockLiquidGlassTintOpacity = 100
      await flush()
      assert.equal(native.querySelectorAll('filter').length, 0)
      assert.equal(floating.querySelectorAll('.bew-liquid-glass-surface__warp').length, 0, 'solid tint must not sample an invisible backdrop')
      fixture.settings.value.disableFrostedGlass = true
      await flush()
      assert.equal(fixture.mounted, 0)
      assert.equal(native.hasAttribute('data-bew-liquid-glass'), false)
      assert.equal(native.querySelector('.bew-liquid-glass-layer'), null)
      button.click()
      assert.equal(clicks, 1)
      assert.equal(native.querySelector('input'), input)
      fixture.settings.value.disableFrostedGlass = false
      fixture.settings.value.dockLiquidGlassTintOpacity = 0
      await flush()
      assert.equal(native.querySelectorAll('filter').length, 1)
      floatingGlass.setActive(false)
      await flush()
      assert.equal(fixture.mounted, 1)
      assert.equal(floating.hasAttribute('data-bew-liquid-glass'), false)
      floatingGlass.setActive(true)
      await flush()
      assert.equal(fixture.mounted, 2)
    }
    finally {
      nativeGlass.dispose()
      floatingGlass.dispose()
      native.remove()
      shadowHost.remove()
    }
    fixture.settings.value.dockLiquidGlassBlur = 18
    await flush()
    assert.equal(fixture.mounted, 0, 'disposed surfaces no longer react to settings')
  })

  check('liquid surfaces: actual playback tabs retain keyboard, panels and original native nodes', async () => {
    const fixture = await materialFixture()
    const session = { current: null }
    const sidebarSettings = { value: { bewlyWidescreenSidebarWidth: 440 } }
    const shell = await loadSourceModule('../src/utils/bewlyWidescreen/shell.ts', {
      '~/logic': { settings: sidebarSettings },
      '~/utils/bewlyWidescreen/constants': await import('../src/utils/bewlyWidescreen/constants'),
      '~/utils/bewlyWidescreen/geometry': { schedulePlayerResizeSync() {}, updateSidebarLayoutState() {} },
      '~/utils/bewlyWidescreen/labels': { t: key => key },
      '~/utils/bewlyWidescreen/nativeDom': { getTitleText: () => 'Native title' },
      '~/utils/bewlyWidescreen/session': { session },
      '~/utils/bewlyWidescreenPolicy': await import('../src/utils/bewlyWidescreenPolicy'),
    })
    const state = shell.createRoot('right')
    state.hydratedTabs = new Set()
    let hydrations = 0
    state.hydrateSidebar = () => hydrations++
    session.current = state
    const comments = document.createElement('bili-comments')
    const follow = document.createElement('button')
    const action = document.createElement('button')
    state.panels.comment.append(comments)
    state.upSlot.append(follow)
    state.toolbarSlot.append(action)
    try {
      assert.equal(state.root.style.getPropertyValue('--bewly-widescreen-sidebar-user-width'), '440px')
      assert.equal(state.upSlot.parentElement, state.toolbarSlot.parentElement, 'author and native action slots share the responsive row')
      assert.equal(state.descriptionSlot.parentElement, state.tagsSlot.parentElement, 'description and tags share one inset surface')
      const clicked = []
      for (const name of ['Like', 'Coin', 'Favorite', 'Share', 'Watch later']) {
        const button = document.createElement('button')
        button.textContent = name
        button.addEventListener('click', () => clicked.push(name))
        state.toolbarSlot.append(button)
        button.click()
      }
      assert.deepEqual(clicked, ['Like', 'Coin', 'Favorite', 'Share', 'Watch later'])
      shell.setActiveTab('comment')
      state.tabButtons.comment.focus()
      state.tabButtons.comment.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }))
      assert.equal(state.activeTab, 'danmaku')
      assert.equal(document.activeElement, state.tabButtons.danmaku)
      assert.equal(state.tabButtons.danmaku.getAttribute('aria-selected'), 'true')
      assert.equal(state.tabButtons.danmaku.dataset.active, 'true')
      assert.equal(state.tabButtons.comment.tabIndex, -1)
      assert.equal(state.panels.comment.hidden, true)
      assert.equal(state.panels.danmaku.hidden, false)
      state.tabButtons.danmaku.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true }))
      assert.equal(state.activeTab, 'playlist')
      assert.equal(hydrations, 3)
      sidebarSettings.value.bewlyWidescreenSidebarWidth = 0
      const autoState = shell.createRoot('left')
      assert.equal(autoState.root.style.getPropertyValue('--bewly-widescreen-sidebar-user-width'), '', 'automatic width stays in responsive CSS instead of freezing the initial viewport')
      autoState.root.remove()
      assert.equal(state.sidebarEl.querySelector('filter'), null, 'sidebar keeps its frosted surface')
      fixture.settings.value.enableDockLiquidGlass = false
      await flush()
      assert.equal(state.panels.comment.firstElementChild, comments)
      assert.equal(state.upSlot.firstElementChild, follow)
      assert.equal(state.toolbarSlot.firstElementChild, action)
    }
    finally {
      state.root.remove()
      session.current = null
    }
  })

  check('liquid surfaces: actual native input binding keeps one bottom surface through replacement and cleanup', async () => {
    const fixture = await materialFixture()
    const player = document.body.appendChild(document.createElement('div'))
    player.innerHTML = '<div><div class="input-host"><div class="bpx-player-sending-bar"><input value="danmaku draft"><button class="bpx-player-dm-btn-send">Send</button></div></div></div>'
    const state = { playerEl: player }
    const binding = await loadSourceModule('../src/utils/bewlyWidescreen/danmaku.ts', {
      '~/utils/bewlyWidescreen/constants': await import('../src/utils/bewlyWidescreen/constants'),
      '~/utils/bewlyWidescreen/geometry': { resetControlsLayout() {}, schedulePlayerResizeSync() {}, syncControlsGlassGeometry() {} },
      '~/utils/bewlyWidescreen/labels': { t: key => key },
      '~/utils/bewlyWidescreen/nativeDom': { findFirst: (selectors, root) => root.querySelector(selectors.join(',')), findMovable: () => null },
      '~/utils/bewlyWidescreen/session': { session: { current: state } },
      '~/utils/bewlyWidescreenNative': await import('../src/utils/bewlyWidescreenNative'),
      '~/utils/liquidGlass': fixture.attachment,
    })
    try {
      const input = player.querySelector('input')
      const button = player.querySelector('button')
      let clicks = 0
      button.addEventListener('click', () => clicks++)
      input.focus()
      assert.equal(binding.syncDanmakuInputSource(state), true)
      await flush()
      const glass = state.danmakuGlass
      assert.equal(player.querySelectorAll('filter').length, 1)
      assert.equal(fixture.mounted, 1)
      assert.equal(document.activeElement, input)
      assert.equal(input.value, 'danmaku draft')
      assert.equal(binding.syncDanmakuInputSource(state), true)
      assert.equal(state.danmakuGlass, glass, 'stable native input retains the same optics')
      button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      assert.equal(clicks, 1)
      binding.syncDanmakuInputSource(state, true)
      await flush()
      assert.equal(glass.isConnected, false)
      assert.equal(player.querySelectorAll('filter').length, 1)
      assert.equal(fixture.mounted, 1, 'forced native rebinding releases the previous observer')
      assert.equal(player.querySelector('input'), input)
      fixture.settings.value.disableFrostedGlass = true
      await flush()
      assert.equal(player.querySelector('filter'), null)
      assert.equal(fixture.mounted, 0)
    }
    finally {
      state.danmakuSemanticsCleanup?.()
      state.danmakuSettingsCleanup?.()
      state.danmakuGlassCleanup?.()
      player.remove()
    }
  })

  check('liquid surfaces: actual Settings shell keeps navigation and drafts without liquid filters', async () => {
    const fixture = await materialFixture()
    const host = document.body.appendChild(document.createElement('div'))
    const Settings = await compileComponent('../src/components/Settings/Settings.vue', {
      'vue-i18n': { useI18n: () => ({ t: key => key, tm: () => [], rt: key => key }) },
      '~/components/CloseButton.vue': { default: { render: () => Vue.h('button') } },
      '~/components/PanelTopBlur.vue': { default: { props: ['enabled'], setup: props => () => Vue.h('span', { 'data-top-blur': String(props.enabled) }) } },
      '~/composables/useAppProvider': { useBewlyApp: () => ({ mainAppRef: Vue.ref(host) }) },
      '~/composables/useLiquidGlass': fixture.material,
      '~/logic': { settings: fixture.settings },
      '~/logic/layoutEdit': { enterLayoutEditMode() {}, subscribeSettingNavigation: () => () => {} },
      '~/utils/dialogFocus': await import('../src/utils/dialogFocus'),
      '~/utils/liquidGlass': fixture.attachment,
      './searchCatalog': { settingsSearchEntries: [] },
      './types': await import('../src/components/Settings/types'),
    }, { globals: { sessionStorage: window.sessionStorage, defineAsyncComponent: () => ({ render: () => null }) } })
    const app = Vue.createApp(Settings)
    app.config.globalProperties.$t = key => key
    try {
      app.mount(host)
      await flush()
      const navigation = host.querySelector('.settings-primary-navigation__list')
      const search = host.querySelector('.settings-search input')
      assert.ok(navigation)
      assert.ok(host.querySelector('.settings-content__surface'))
      host.querySelector('.settings-content__scroll').scrollTo = () => {}
      search.value = 'saved draft'
      search.dispatchEvent(new Event('input', { bubbles: true }))
      host.querySelector('[aria-label="settings.menu_appearance"]').click()
      await flush()
      assert.equal(host.querySelector('[aria-current="page"]').getAttribute('aria-label'), 'settings.menu_appearance')
      fixture.settings.value.dockLiquidGlassRefraction = 70
      fixture.settings.value.enableDockLiquidGlass = false
      await flush()
      fixture.settings.value.enableDockLiquidGlass = true
      await flush()
      assert.equal(host.querySelector('.settings-primary-navigation__list'), navigation)
      assert.equal(search.value, 'saved draft')
      assert.equal(host.querySelector('filter'), null)
      assert.equal(fixture.mounted, 0, 'settings and navigation never allocate optical observers')
      assert.equal(host.querySelector('[data-top-blur]').getAttribute('data-top-blur'), 'true')
    }
    finally {
      app.unmount()
      host.remove()
      window.sessionStorage.removeItem('bewly-settings-active-menu')
    }
  })

  check('liquid surfaces: Dialogs retain frosted glass without optics and keep nested surfaces solid', async () => {
    const fixture = await materialFixture()
    const host = document.body.appendChild(document.createElement('div'))
    const Dialog = await compileComponent('../src/components/Dialog.vue', {
      '~/components/Button.vue': { default: { render: () => Vue.h('button') } },
      '~/components/CloseButton.vue': { default: { render: () => Vue.h('button') } },
      '~/components/PanelTopBlur.vue': { default: { props: ['enabled'], setup: props => () => Vue.h('span', { 'data-top-blur': String(props.enabled) }) } },
      '~/composables/useAppProvider': { useBewlyApp: () => ({ mainAppRef: Vue.ref(host) }) },
      '~/composables/useLiquidGlass': fixture.material,
      '~/logic': { settings: fixture.settings },
      '~/utils/dialogFocus': await import('../src/utils/dialogFocus'),
      '~/utils/dialogKeyboard': await import('../src/utils/dialogKeyboard'),
      '~/utils/liquidGlass': fixture.attachment,
    })
    const app = Vue.createApp({ setup: () => () => Vue.h(Dialog, { title: 'Outer', showFooter: false }, () => [
      Vue.h('input', { value: 'outer draft' }),
      Vue.h(Dialog, { title: 'Inner', showFooter: false }, () => Vue.h('input', { value: 'inner draft' })),
    ]) })
    app.config.globalProperties.$t = key => key
    try {
      app.mount(host)
      await flush()
      const surfaces = host.querySelectorAll('.dialog__surface')
      assert.equal(surfaces.length, 2)
      assert.equal(host.querySelectorAll('.dialog__surface[data-bew-liquid-glass]').length, 0)
      assert.equal(host.querySelectorAll('filter').length, 0)
      assert.equal(fixture.mounted, 0, 'large dialogs allocate no liquid-glass resize observers')
      assert.equal(surfaces[0].style.backdropFilter, 'var(--bew-filter-glass-2)')
      assert.equal(surfaces[1].style.backdropFilter, 'none')
      assert.equal(host.querySelectorAll('[data-top-blur="true"]').length, 2, 'protected top blur retains its original enabled state')
      assert.match(surfaces[1].style.backgroundColor, /bew-elevated-alt-solid/)
      fixture.settings.value.disableFrostedGlass = true
      await flush()
      assert.equal(host.querySelectorAll('filter').length, 0)
      assert.equal(host.querySelectorAll('[data-top-blur="false"]').length, 2)
      assert.deepEqual([...host.querySelectorAll('input')].map(input => input.value), ['outer draft', 'inner draft'])
    }
    finally {
      app.unmount()
      host.remove()
    }
    assert.equal(fixture.mounted, 0)
  })

  check('liquid surfaces: the Dock mode switcher never adds a second glass layer', async () => {
    const fixture = await materialFixture()
    const ModeSwitcher = await compileComponent('../src/components/PageModeSwitcherButton.vue', {
      '@iconify/vue': { Icon: { render: () => Vue.h('svg') } },
      '~/composables/usePageModeSwitcher': { usePageModeSwitcher: () => ({ currentIcon: Vue.ref('fixture'), nextIcon: Vue.ref('next'), disabled: Vue.ref(false), tooltip: Vue.ref('Mode'), cyclePageMode() {} }) },
      '~/logic/layoutEdit': { vLayoutEditable: {} },
      '~/utils/liquidGlass': fixture.attachment,
      './Tooltip.vue': { default: { props: ['content', 'placement'], setup: (_props, { slots }) => () => slots.default?.() } },
    })
    const host = document.body.appendChild(document.createElement('div'))
    const props = Vue.reactive({ activatedPage: 'Home', placement: 'top', variant: 'dock' })
    const app = Vue.createApp({ setup: () => () => Vue.h(ModeSwitcher, props) })
    try {
      app.mount(host)
      await flush()
      const button = host.querySelector('button')
      assert.equal(host.querySelector('filter'), null, 'an omitted opt-in stays false')
      props.liquidGlass = true
      await flush()
      assert.equal(host.querySelector('filter'), null, 'Dock already owns the surrounding glass')
      props.variant = 'sidebar'
      await flush()
      assert.equal(host.querySelector('button'), button)
      assert.equal(host.querySelectorAll('filter').length, 1)
      props.liquidGlass = false
      await flush()
      assert.equal(host.querySelector('filter'), null, 'docking into playback removes standalone optics')
    }
    finally {
      app.unmount()
      host.remove()
    }
    assert.equal(fixture.mounted, 0)
  })
}
