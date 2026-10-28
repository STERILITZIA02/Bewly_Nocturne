import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import { compileStyleAsync } from 'vue/compiler-sfc'

export function registerSurfaceMaterialChecks(check, { Vue, compileComponent, flush }) {
  check('surface materials: the settings window is one solid surface ruled into columns by hairlines', async () => {
    const read = file => readFile(new URL(`../src/${file}`, import.meta.url), 'utf8')
    const [shell, category, group, nav, motion] = await Promise.all([
      read('components/Settings/Settings.vue'),
      read('components/Settings/components/SettingsCategoryLayout.vue'),
      read('components/Settings/components/SettingsItemGroup.vue'),
      read('styles/settingsNav.scss'),
      read('composables/useSettingsMotion.ts'),
    ])
    // No glass, no top blur, no content mask (user-specified, after Claude Code).
    for (const source of [shell, category, group])
      assert.doesNotMatch(source, /backdrop-filter|glass-tint|PanelTopBlur|maskImage|GLASS_SURFACE_CONTEXT/)
    // The window and its header are the shared modal window (modalWindow.scss).
    assert.match(shell, /\.settings-window__surface \{\s*@include modalWindow\.surface;/)
    assert.match(shell, /\.settings-header \{\s*@include modalWindow\.header;/)
    // Categories | pages | page: both navigation columns are the shared column and row.
    assert.match(nav, /@mixin column \{[^}]*border-inline-end: var\(--bew-hairline\) solid var\(--bew-separator-color\);/)
    // The search is pinned above the categories; only the rows under it scroll.
    assert.match(shell, /\.settings-primary \{\s*@include settingsNav\.column;/)
    assert.match(shell, /\.settings-primary-navigation \{\s*@include settingsNav\.scroller;/)
    assert.ok(shell.indexOf('class="settings-primary"') < shell.indexOf('ref="settingsSearchRef"') && shell.indexOf('ref="settingsSearchRef"') < shell.indexOf('<nav class="settings-primary-navigation"'))
    // The header title is the path to the open page, reported by the pages column.
    assert.match(shell, /provide\('setSettingsPageTitle'/)
    // Kept per category and swapped in place: switching pages or returning to a
    // category never blanks the page step and fades it back in.
    assert.match(shell, /const pageTitle = computed\(\(\) => pageTitles\[activatedMenuItem\.value\]\)/)
    assert.match(shell, /<Transition name="settings-crumb">\s*<span v-if="pageTitle" class="settings-header__page">/)
    assert.doesNotMatch(shell, /pageTitle\.value = undefined/)
    assert.match(category, /watchEffect\(\(\) => setSettingsPageTitle\?\.\(currentPage\.value && t\(currentPage\.value\.titleKey\)\)\)/)
    // The page dims behind the window and fades with it.
    assert.match(shell, /\.settings-backdrop \{\s*@include modalWindow\.backdrop;/)
    assert.match(shell, /@include settingsNav\.row\("\.menu-item-activated"\)/)
    assert.match(category, /\.settings-category-nav \{\s*@include settingsNav\.column;\s*@include settingsNav\.scroller;\s*position: sticky;\s*top: 0;\s*height: 100cqh;/)
    assert.match(shell, /\.settings-content__scroll \{\s*container: settings-viewport \/ size;/)
    assert.match(category, /@include settingsNav\.row\("\.active"\)/)
    // Groups are flat sections, not cards.
    const panel = group.slice(group.indexOf('.group-panel {'), group.indexOf('}', group.indexOf('.group-panel {')))
    assert.doesNotMatch(panel, /background|border-radius/)
    assert.doesNotMatch(category, /setSettingsBreadcrumb/)
    assert.match(motion, /'\.settings-backdrop',\s*'\.settings-window__surface',\s*'\.settings-header',\s*'\.settings-body',/)
  })

  check('surface materials: actual segmented controls stay solid and retain selection', async () => {
    const indicator = await compileComponent('../src/components/LiquidSegmentIndicator.vue', {
      '~/composables/useLiquidSegmentIndicator': await import('../src/composables/useLiquidSegmentIndicator'),
    })
    const segmented = await compileComponent('../src/components/Settings/components/SettingsSegmentedControl.vue', {
      '~/components/LiquidSegmentIndicator.vue': { default: indicator },
    })
    const styles = []
    for (const file of ['segmentControl.scss', 'segmentLiquidIndicator.scss', 'popover.scss']) {
      const url = new URL(`../src/styles/${file}`, import.meta.url)
      // The full path lets Sass resolve the sheet's relative @use rules.
      const compiled = await compileStyleAsync({ source: await readFile(url, 'utf8'), filename: fileURLToPath(url), id: 'surface-test', preprocessLang: 'scss' })
      assert.deepEqual(compiled.errors, [])
      const style = document.head.appendChild(document.createElement('style'))
      style.textContent = compiled.code
      styles.push(style)
    }
    const selected = Vue.ref('first')
    const previousObserver = globalThis.ResizeObserver
    const previousWindowObserver = window.ResizeObserver
    const previousMatchMedia = window.matchMedia
    window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} })
    const observed = []
    globalThis.ResizeObserver = window.ResizeObserver = class {
      elements = new Set()
      constructor() { observed.push(this.elements) }
      observe(element) { this.elements.add(element) }
      unobserve(element) { this.elements.delete(element) }
      disconnect() { this.elements.clear() }
    }
    const host = document.body.appendChild(document.createElement('div'))
    const app = Vue.createApp({ setup: () => () => Vue.h('section', [
      Vue.h(segmented, { 'modelValue': selected.value, 'onUpdate:modelValue': value => selected.value = value, 'label': 'Navigation', 'options': [{ label: 'First', value: 'first' }, { label: 'Second', value: 'second' }] }),
      Vue.h('div', { class: 'bew-popover-surface', id: 'contained-menu' }),
      Vue.h('div', { class: 'bew-popover bew-popover-surface', id: 'external-pop' }),
    ]) })
    try {
      app.mount(host)
      await flush()
      assert.equal(host.querySelector('[role="radio"][aria-checked="true"]').textContent, 'First')
      host.querySelectorAll('[role="radio"]')[1].click()
      await flush()
      assert.equal(selected.value, 'second')
      assert.equal(host.querySelector('[role="radio"][aria-checked="true"]').textContent, 'Second')
      assert.equal(host.querySelectorAll('.bew-liquid-indicator').length, 1)
      // JSDOM does not compute backdrop-filter; use matched compiled CSSOM
      // declarations. Browser QA separately checks real compositing and colors.
      const rules = styles.flatMap(style => [...style.sheet.cssRules])
      const property = (element, name) => {
        const matched = rules.filter(rule => rule.selectorText && rule.style.getPropertyValue(name) && element.matches(rule.selectorText))
        return matched.at(-1)?.style.getPropertyValue(name)
      }
      const control = host.querySelector('[role="radiogroup"]')
      assert.equal(property(control, 'backdrop-filter'), 'none')
      assert.equal(property(control, 'background'), 'var(--bew-segment-surface-background, var(--bew-control-background))')
      assert.equal(property(host.querySelector('#contained-menu'), 'backdrop-filter'), 'none')
      assert.equal(property(host.querySelector('#contained-menu'), 'background'), 'var(--bew-popover-surface-background-solid)')
      // The top bar panels are solid windows like the settings window, not glass.
      assert.equal(property(host.querySelector('#external-pop'), 'backdrop-filter'), 'none')
      assert.equal(property(host.querySelector('#external-pop'), 'background'), 'var(--bew-elevated-solid)')
      assert.equal(property(host.querySelector('#external-pop'), 'border-radius'), 'var(--bew-modal-radius)')
      assert.equal(property(host.querySelector('[aria-checked="true"]'), 'color'), 'var(--bew-segment-item-current-color, var(--bew-segment-item-active-color))')
    }
    finally {
      app.unmount()
      assert.ok(observed.every(elements => elements.size === 0))
      globalThis.ResizeObserver = previousObserver
      window.ResizeObserver = previousWindowObserver
      window.matchMedia = previousMatchMedia
      host.remove()
      styles.forEach(style => style.remove())
    }
  })
}
