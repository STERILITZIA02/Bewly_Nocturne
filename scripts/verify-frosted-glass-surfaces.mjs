import assert from 'node:assert/strict'
import { readdir, readFile, stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import { compile } from 'sass'

import { loadSourceModule } from './sourceModuleHarness'

const SOURCE_ROOT = new URL('../src/', import.meta.url)

async function listSourceFiles(directory = SOURCE_ROOT) {
  const files = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const url = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, directory)
    if (entry.isDirectory())
      files.push(...await listSourceFiles(url))
    else if (/\.(?:ts|vue|scss|yml)$/.test(entry.name))
      files.push(url)
  }
  return files
}

export function registerFrostedGlassSurfaceChecks(check, { Vue, compileComponent, flush }) {
  check('frosted surfaces: the liquid optical runtime, settings and dependency are fully removed', async () => {
    for (const file of [
      'components/LiquidGlassSurface.vue',
      'components/Settings/Appearance/LiquidGlassSettings.vue',
      'composables/useLiquidGlass.ts',
      'constants/liquidGlass.ts',
      'styles/liquidGlass.scss',
      'utils/liquidGlass.ts',
    ])
      await assert.rejects(stat(new URL(file, SOURCE_ROOT)), `${file} must not return`)
    const offenders = []
    for (const file of await listSourceFiles()) {
      const text = await readFile(file, 'utf8')
      // Segment indicators keep their geometry-only `--bew-liquid-indicator-*` tokens.
      if (/data-bew-liquid-glass|v-liquid-glass|vLiquidGlass|attachLiquidGlass|LiquidGlassSurface|@wxperia|bew-liquid-(?:glass|frame|outer|tint)|DockLiquidGlass|dockLiquidGlass|liquid_glass/.test(text.replace(/RETIRED_SETTINGS_FIELDS[^\n]*/, '')))
        offenders.push(fileURLToPath(file))
    }
    assert.deepEqual(offenders, [])
    const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
    assert.equal(manifest.dependencies?.['@wxperia/liquid-glass-vue'], undefined)
    assert.equal(manifest.devDependencies?.['@wxperia/liquid-glass-vue'], undefined)
    const { RETIRED_SETTINGS_FIELDS, removeRetiredSettings } = await import('../src/constants/retiredSettings')
    const legacy = { enableDockLiquidGlass: true, dockLiquidGlassMode: 'polar', dockLiquidGlassRefraction: 70, dockLiquidGlassBlur: 12, dockLiquidGlassTintSource: 'custom', dockLiquidGlassTintColor: '#7a3f91', dockLiquidGlassTintOpacity: 65, dockLiquidGlassDispersion: 2, dockLiquidGlassSaturation: 160, dockLiquidGlassFrost: 4, disableFrostedGlass: false, frostedGlassBlurIntensity: 14 }
    for (const key of Object.keys(legacy).filter(key => /LiquidGlass/.test(key)))
      assert.ok(RETIRED_SETTINGS_FIELDS.includes(key), `${key} is cleaned and excluded from sync`)
    removeRetiredSettings(legacy)
    assert.deepEqual(legacy, { disableFrostedGlass: false, frostedGlassBlurIntensity: 14 }, 'ordinary glass preferences survive the cleanup')
  })

  check('frosted surfaces: playback controls keep one ordinary backdrop that follows the global switch', async () => {
    const constants = await import('../src/utils/bewlyWidescreen/constants')
    const { BEWLY_WIDESCREEN_CONTROLS_HIDDEN_CLASS } = await import('../src/constants/globalEvents')
    const style = document.head.appendChild(document.createElement('style'))
    const layout = await loadSourceModule('../src/utils/bewlyWidescreen/styles/layout.ts', {
      '~/constants/globalEvents': { BEWLY_WIDESCREEN_CONTROLS_HIDDEN_CLASS },
      '~/styles/segmentControl.scss?inline': { default: compile(fileURLToPath(new URL('../src/styles/segmentControl.scss', import.meta.url))).css },
      '~/styles/sendButton.scss?inline': { default: compile(fileURLToPath(new URL('../src/styles/sendButton.scss', import.meta.url))).css },
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
    document.body.classList.add(constants.BODY_CLASS)
    try {
      layout.injectLayoutStyle()
      assert.doesNotMatch(style.textContent, /liquid-glass|bew-liquid-(?:frame|tint)/)
      // JSDOM does not expose computed backdrop-filter; read the matching declaration.
      const backdropDeclarations = [...style.sheet.cssRules]
        .filter(rule => rule.selectorText && rule.style.getPropertyValue('backdrop-filter') && glass.matches(rule.selectorText))
        .map(rule => rule.style.getPropertyValue('backdrop-filter'))
      assert.deepEqual(backdropDeclarations, ['var(--bew-filter-glass-1)'], 'one host-owned sample; disable-frosted-glass resolves the token to none')
      assert.notEqual(getComputedStyle(glass).borderStyle, 'none', 'the frame stays on the surface itself')
    }
    finally {
      glass.remove()
      style.remove()
      document.body.classList.remove(constants.BODY_CLASS, BEWLY_WIDESCREEN_CONTROLS_HIDDEN_CLASS)
    }
  })

  check('frosted surfaces: Dialogs keep one frosted owner and nested surfaces stay solid', async () => {
    const settings = Vue.ref({ disableFrostedGlass: false })
    const host = document.body.appendChild(document.createElement('div'))
    const Dialog = await compileComponent('../src/components/Dialog.vue', {
      '~/components/Button.vue': { default: { render: () => Vue.h('button') } },
      '~/components/CloseButton.vue': { default: { render: () => Vue.h('button') } },
      '~/components/PanelTopBlur.vue': { default: { props: ['enabled'], setup: props => () => Vue.h('span', { 'data-top-blur': String(props.enabled) }) } },
      '~/composables/useAppProvider': { useBewlyApp: () => ({ mainAppRef: Vue.ref(host) }) },
      '~/logic': { settings },
      '~/utils/dialogFocus': await import('../src/utils/dialogFocus'),
      '~/utils/dialogKeyboard': await import('../src/utils/dialogKeyboard'),
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
      assert.equal(surfaces[0].style.backdropFilter, 'var(--bew-filter-glass-2)')
      assert.equal(surfaces[1].style.backdropFilter, 'none')
      assert.match(surfaces[1].style.backgroundColor, /bew-elevated-alt-solid/)
      assert.equal(host.querySelectorAll('[data-top-blur]').length, 0, 'ordinary and nested dialogs have no top blur')
      settings.value.disableFrostedGlass = true
      await flush()
      assert.equal(surfaces[0].style.backdropFilter, 'none')
      assert.match(surfaces[0].style.backgroundColor, /bew-elevated-alt-solid/)
      assert.deepEqual([...host.querySelectorAll('input')].map(input => input.value), ['outer draft', 'inner draft'])
    }
    finally {
      app.unmount()
      host.remove()
    }
  })
}
