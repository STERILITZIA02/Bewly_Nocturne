import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import { compileStyleAsync } from 'vue/compiler-sfc'

export function registerSurfaceMaterialChecks(check, { Vue, compileComponent, flush }) {
  check('surface materials: actual segmented controls stay solid, retain selection and preserve the top blur exception', async () => {
    const indicator = await compileComponent('../src/components/LiquidSegmentIndicator.vue', {
      '~/composables/useLiquidSegmentIndicator': await import('../src/composables/useLiquidSegmentIndicator'),
    })
    const segmented = await compileComponent('../src/components/Settings/components/SettingsSegmentedControl.vue', {
      '~/components/LiquidSegmentIndicator.vue': { default: indicator },
    })
    const topBlur = await compileComponent('../src/components/PanelTopBlur.vue')
    const styles = []
    for (const file of ['segmentControl.scss', 'segmentLiquidIndicator.scss', 'popover.scss']) {
      const compiled = await compileStyleAsync({ source: await readFile(new URL(`../src/styles/${file}`, import.meta.url), 'utf8'), filename: file, id: 'surface-test', preprocessLang: 'scss' })
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
      Vue.h(topBlur, { enabled: true }),
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
      assert.equal(host.querySelectorAll('.bew-panel-top-blur:not(.bew-panel-top-blur--disabled)').length, 1)
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
      assert.equal(property(host.querySelector('#external-pop'), 'backdrop-filter'), 'var(--bew-filter-glass-1)')
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
