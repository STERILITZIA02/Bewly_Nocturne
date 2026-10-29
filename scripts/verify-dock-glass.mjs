import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import { compileStyleAsync, parse } from 'vue/compiler-sfc'

export function registerDockGlassChecks(check, { Vue, compileComponent, flush }) {
  check('Dock glass: actual Dock keeps one frosted owner per surface, its shell and controls', async () => {
    const { AppPage } = await import('../src/enums/appEnums')
    const { HomeSubPage } = await import('../src/contentScripts/views/Home/types')
    const dockPolicy = await import('../src/constants/dock')
    const layout = await import('../src/constants/layout')
    const activeItem = await import('../src/utils/dockActiveItem')
    const undoState = Vue.ref(0)
    const item = { page: AppPage.Home, visible: true, icon: '', dockIcon: '', i18nKey: 'Home' }
    const items = [item, ...[AppPage.Notifications, AppPage.Moments, AppPage.WatchLater].map(page => ({ ...item, page, i18nKey: page }))]
    const topBarStore = Vue.reactive({ isLogin: true, unReadMessageCount: 120, newMomentsCount: 3, watchLaterCount: 12 })
    const settings = Vue.ref({ dockPosition: 'bottom', dockCollapseMode: 'button', dockItemsConfig: [item], pageMode: 'bewly', useSearchPageModeOnHomePage: true, showBewlyOrBiliPageSwitcher: true, showDockItemNames: true, showDockBadges: true, disableFrostedGlass: false, frostedGlassBlurIntensity: 20 })
    const passthrough = { setup: (_props, { slots }) => () => Vue.h('div', slots.default?.()) }
    settings.value.dockItemsConfig = items
    const Badge = await compileComponent('../src/components/CountBadge.vue')
    const Dock = await compileComponent('../src/components/Dock/Dock.vue', {
      'vue-i18n': { useI18n: () => ({ t: (key, params) => `${key}:${params.count}` }) },
      '@iconify/vue': { Icon: { render: () => Vue.h('svg') } },
      // 64px = the Dock tab (56px) plus its 4px rim on each side.
      '@vueuse/core': { useElementSize: () => ({ width: Vue.ref(600), height: Vue.ref(64) }), useWindowSize: () => ({ width: Vue.ref(1280), height: Vue.ref(900) }), usePreferredReducedMotion: () => Vue.ref('reduce') },
      '~/composables/useAppProvider': { UndoForwardState: { ShowUndo: 1, ShowForward: 2 }, useBewlyApp: () => ({ reachTop: Vue.ref(true), homeActivatedPage: Vue.ref(HomeSubPage.ForYou), undoForwardState: undoState, canRefreshHomeSubPage: Vue.ref(true), getDockPageHref: () => '/' }) },
      '~/composables/useDark': { useDark: () => ({ isDark: Vue.ref(false), toggleDark: () => {} }) },
      '~/composables/useReducedMotion': { useReducedMotion: () => Vue.ref(true) },
      '~/composables/useDelayedHover': { useDelayedHover: () => Vue.ref(null) },
      '~/constants/dock': dockPolicy,
      '~/constants/layout': layout,
      '~/contentScripts/views/Home/types': { HomeSubPage },
      '~/enums/appEnums': { AppPage },
      '~/logic': { settings },
      '~/logic/layoutEdit': { isLayoutEditing: Vue.ref(false), useLayoutEditableRoot: () => {}, useLayoutEditSettingValue: (_key, getValue) => Vue.computed(getValue), getDockItemLayoutEditableId: () => 'home', vLayoutEditable: {} },
      '~/stores/settingsStore': { useSettingsStore: () => ({ getDockItemIsUseOriginalBiliPage: () => false, ensureDockItemsConfig: () => settings.value.dockItemsConfig, getEffectiveDockItemByPage: page => items.find(item => item.page === page) }) },
      '~/stores/topBarStore': { useTopBarStore: () => topBarStore },
      '~/utils/dockActiveItem': activeItem,
      '~/utils/main': { isHomePage: () => true, openLinkToNewTab: () => {} },
      '../IconButton.vue': { default: { setup: (_props, { slots, attrs }) => () => Vue.h('button', attrs, slots.default?.()) } },
      '../CountBadge.vue': { default: Badge },
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
    const bottomShifts = []
    const app = Vue.createApp(Dock, { activatedPage: AppPage.Home, settingsOpen: false, onBottomShiftChange: value => bottomShifts.push(value) })
    app.config.globalProperties.$t = key => key
    app.mount(host)
    await flush()
    const edge = host.querySelector('.dock-wrap')
    assert.equal(getComputedStyle(edge).height, '0px', 'bottom shell is only an edge, not a full viewport')
    assert.ok(host.querySelector('.dock-content.bottom'))
    settings.value.dockPosition = 'right'
    await flush()
    assert.equal(getComputedStyle(edge).width, '0px', 'right shell is only an edge')
    assert.ok(host.querySelector('.dock-content.right'))
    settings.value.dockPosition = 'bottom'
    await flush()
    const shell = host.querySelector('.dock-shell-surface')
    assert.deepEqual([...host.querySelectorAll('.dock-count-badge')].map(badge => badge.textContent), ['99+', '3', '12'])
    assert.equal(host.querySelector('.dock-count-badge').closest('button').getAttribute('aria-label'), 'dock.unread_messages:120')
    topBarStore.unReadMessageCount = 0
    topBarStore.newMomentsCount = Number.NaN
    await flush()
    assert.deepEqual([...host.querySelectorAll('.dock-count-badge')].map(badge => badge.textContent), ['12'])
    settings.value.showDockBadges = false
    await flush()
    assert.equal(host.querySelectorAll('.dock-count-badge').length, 0, 'badges can be turned off')
    settings.value.showDockBadges = true
    settings.value.showDockItemNames = false
    await flush()
    assert.equal(host.querySelectorAll('.dock-tab__label').length, 0, 'names can be hidden')
    assert.equal(host.querySelector('.dock-content').style.getPropertyValue('--bew-dock-item-height'), 'var(--bew-dock-item-height-icon-only)', 'hidden names shorten the tabs')
    assert.equal(host.querySelector('.dock-page-navigation .dock-tab').getAttribute('aria-label'), 'Home', 'hidden names stay readable')
    settings.value.showDockItemNames = true
    await flush()
    topBarStore.isLogin = false
    await flush()
    assert.equal(host.querySelectorAll('.dock-count-badge').length, 0, 'sign-out hides account counts without a new Dock request')
    topBarStore.isLogin = true
    topBarStore.watchLaterCount = 2
    await flush()
    assert.equal(host.querySelector('.dock-count-badge').textContent, '2', 'authoritative store updates reach the same Dock shell')
    const frostedShadow = getComputedStyle(shell).boxShadow
    assert.notEqual(frostedShadow, 'none')
    const buttons = host.querySelectorAll('button').length
    assert.equal(host.querySelector('.dock-shell-surface').children.length, 0, 'the shell paints its own backdrop without optical children')
    // One capsule: a hairline divider sets the pages apart from page mode, theme, settings and collapse.
    const divider = host.querySelector('.dock-expanded-content > .divider')
    assert.ok(divider && divider.nextElementSibling)
    assert.ok(host.querySelector('.dock-content-inner [aria-label="dock.settings"]'))
    const dividerWidth = [...style.sheet.cssRules].findLast(rule => rule.selectorText && !rule.selectorText.includes(':deep') && rule.style.getPropertyValue('width') && divider.matches(rule.selectorText))?.style.getPropertyValue('width')
    assert.equal(dividerWidth, 'var(--bew-hairline)', 'the divider is a hairline')
    const backdropOf = owner => [...style.sheet.cssRules].findLast(rule => rule.selectorText && rule.style.getPropertyValue('backdrop-filter') && owner.matches(rule.selectorText))?.style.getPropertyValue('backdrop-filter')
    settings.value.enableUndoRefreshButton = true
    undoState.value = 1
    await flush()
    assert.ok(host.querySelectorAll('button').length > buttons)
    for (const owner of host.querySelectorAll('.dock-shell-surface, .back-to-top-or-refresh-btn')) {
      // JSDOM does not compute backdrop-filter; read the compiled declaration. The
      // token resolves to none under disable-frosted-glass, so no sample remains.
      assert.equal(backdropOf(owner), 'var(--bew-filter-glass-1)')
      // JSDOM also leaves border shorthands containing var() unresolved.
      const border = [...style.sheet.cssRules].findLast(rule => rule.selectorText && rule.style.getPropertyValue('border') && owner.matches(rule.selectorText))?.style.getPropertyValue('border')
      assert.equal(border, 'var(--bew-glass-edge-width) solid var(--bew-glass-edge-color)', 'glass surfaces draw the glass rim')
      assert.equal(owner.querySelector('svg filter, [data-bew-liquid-glass]'), null)
    }
    assert.equal(host.querySelector('[data-bew-liquid-glass]'), null)
    settings.value.disableFrostedGlass = true
    await flush()
    assert.equal(host.querySelector('.dock-shell-surface'), shell, 'material changes preserve the morph owner')
    assert.equal(getComputedStyle(shell).boxShadow, frostedShadow, 'global disable keeps the original surface owner')
    settings.value.disableFrostedGlass = false
    undoState.value = 0
    await flush()
    const collapsedTrigger = host.querySelector('.dock-collapsed-trigger')
    // Dock tabs name themselves under the glyph (no hover tooltips).
    const collapseButton = () => [...host.querySelectorAll('button')].find(button => button.textContent.trim() === 'dock.collapse_dock')
    assert.equal(host.querySelector('.b-tooltip, [role="tooltip"]'), null)
    assert.deepEqual([...host.querySelectorAll('.dock-page-navigation .dock-tab__label')].map(label => label.textContent), items.map(item => item.i18nKey))
    assert.equal(collapsedTrigger.querySelectorAll('.dock-collapsed-mark__dot').length, 3)
    assert.ok(collapsedTrigger.querySelector('.dock-collapsed-mark__line'))
    collapseButton().click()
    await flush()
    const geometry = host.querySelector('.dock-content-inner').style
    assert.equal(geometry.getPropertyValue('--dock-collapsed-width'), '128px')
    assert.ok(Math.abs(Number.parseFloat(geometry.getPropertyValue('--dock-collapsed-height')) - 64 / 3) < 0.01)
    assert.ok(Math.abs(bottomShifts.at(-1) - (64 - 64 / 3)) < 0.01, 'composer uses the actual scaled height released by Dock')
    const ended = new window.Event('transitionend', { bubbles: true })
    Object.defineProperty(ended, 'propertyName', { value: 'transform' })
    shell.dispatchEvent(ended)
    await flush()
    collapsedTrigger.click()
    await flush()
    assert.equal(bottomShifts.at(-1), 0, 'expansion returns the composer to its original clearance')
    settings.value.dockPosition = 'right'
    await flush()
    collapseButton().click()
    await flush()
    const expectedSideShell = layout.DOCK_LAYOUT.controlSize + layout.DOCK_LAYOUT.shellPadding
    assert.equal(Number.parseFloat(geometry.getPropertyValue('--dock-collapsed-width')), expectedSideShell / 3)
    assert.equal(Number.parseFloat(geometry.getPropertyValue('--dock-collapsed-height')), expectedSideShell * 2)
    assert.equal(Number.parseFloat(geometry.getPropertyValue('--dock-collapsed-mark-length')), expectedSideShell * 2 - expectedSideShell / 3)
    assert.equal(getComputedStyle(collapsedTrigger.querySelector('.dock-collapsed-mark')).transform, 'rotate(90deg)')
    const radiusX = Number.parseFloat(geometry.getPropertyValue('--dock-collapse-radius-x'))
    const radiusY = Number.parseFloat(geometry.getPropertyValue('--dock-collapse-radius-y'))
    assert.ok(Math.abs(radiusX * Number(geometry.getPropertyValue('--dock-collapse-scale-x')) - expectedSideShell / 6) < 1e-9)
    assert.ok(Math.abs(radiusY * Number(geometry.getPropertyValue('--dock-collapse-scale-y')) - expectedSideShell / 6) < 1e-9, 'both painted end radii match the thin side after scaling')
    assert.equal(bottomShifts.at(-1), 0, 'side Dock does not move the composer vertically')
    shell.dispatchEvent(ended)
    await flush()
    collapsedTrigger.click()
    await flush()
    assert.equal(host.querySelector('.dock-content.collapsed'), null)
    app.unmount()
    host.remove()
    style.remove()
  })
}
