import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import { readSettingsTargetDeclarations } from './settingsSearchCatalogFixture'
import { loadSourceModule } from './sourceModuleHarness'

export function registerUpstreamSettingsChecks(check, { Vue, flush, compileComponent }) {
  check('settings catalog: search routes resolve declared controls or conditional parents', async () => {
    const { settingsSearchEntries } = await import('../src/components/Settings/searchCatalog')
    const layout = await loadSourceModule('../src/logic/layoutEdit.ts', {
      'vue': Vue,
      '~/constants/dock': await import('../src/constants/dock'),
      '~/enums/appEnums': await import('../src/enums/appEnums'),
      '~/logic/storage': { settings: Vue.ref({}), gridLayout: Vue.ref({}) },
      './layoutEditPreview': await import('../src/logic/layoutEditPreview'),
      './recommendationMode': { getRecommendationModeOption: () => 'web', selectRecommendationMode() {} },
    }, { SVGElement: window.SVGElement })
    const aliases = new Map(layout.getSettingDescriptors().map(item => [item.titleKey, item.id]))
    const declarations = await readSettingsTargetDeclarations()
    const unresolved = []
    for (const entry of settingsSearchEntries) {
      const ids = await declarations(entry.menu, (entry.storageValues ?? []).map(item => item.value))
      const targets = [entry.targetId, ...(entry.fallbackIds ?? [])].map(id => aliases.get(id) ?? id)
      if (!targets.some(id => ids.has(id)))
        unresolved.push({ title: entry.titleKey ?? entry.title, menu: entry.menu, route: entry.storageValues, targets })
    }
    assert.deepEqual(unresolved, [], 'every search result needs a control in its own route, including a parent for conditional controls')
    console.log(`Settings catalog: ${settingsSearchEntries.length} routes resolved to declared control targets`)
  })

  check('player scroll settings: actual form keeps the master switch, persists both choices and exposes translated search terms', async () => {
    const preferences = Vue.ref({ videoPlayerScroll: true, videoPlayerScrollMode: 'sendingBar' })
    const slot = { props: ['title', 'desc', 'rightWidth'], setup: (props, { slots }) => () => Vue.h('section', [props.title, slots.default?.()]) }
    const select = { props: ['modelValue', 'options'], emits: ['update:modelValue'], setup: (props, { emit }) => () => Vue.h('select', { value: props.modelValue, onChange: event => emit('update:modelValue', event.target.value) }, props.options.map(option => Vue.h('option', { value: option.value }, option.label))) }
    const Form = await compileComponent('../src/components/Settings/PluginComponentsAndPages/PlaybackPage/PlaybackPage.vue', {
      'vue-i18n': { useI18n: () => ({ t: key => key }) },
      '~/logic': { settings: preferences },
      '~/components/Select.vue': { default: select },
      '~/components/Radio.vue': { default: { render: () => null } },
      '../../components/SettingsItem.vue': { default: slot },
      '../../components/SettingsItemGroup.vue': { default: slot },
      '../../components/SettingsItemSubgroup.vue': { default: slot },
    })
    const host = document.body.appendChild(document.createElement('div'))
    const app = Vue.createApp(Form)
    app.mount(host)
    const control = [...host.querySelectorAll('select')].find(element => element.querySelector('[value="playerCenter"]'))
    assert.equal(control.value, 'sendingBar')
    control.value = 'playerCenter'
    control.dispatchEvent(new Event('change'))
    assert.equal(preferences.value.videoPlayerScrollMode, 'playerCenter')
    preferences.value.videoPlayerScroll = false
    await flush()
    assert.equal(control.isConnected, false)
    preferences.value.videoPlayerScroll = true
    await flush()
    assert.equal([...host.querySelectorAll('select')].find(element => element.querySelector('[value="playerCenter"]')).value, 'playerCenter')
    app.unmount()
    host.remove()
    const { settingsSearchEntries } = await import('../src/components/Settings/searchCatalog')
    const entry = settingsSearchEntries.find(item => item.titleKey === 'settings.video_player_scroll_position')
    assert.ok(entry.storageValues.some(item => item.key === 'bewly-settings-playback-page' && item.value === 'layout'))
    assert.deepEqual(entry.keywordKeys, ['settings.video_player_scroll_sending_bar', 'settings.video_player_scroll_center'])
    for (const locale of ['cmn-CN', 'cmn-TW', 'jyut', 'en']) {
      const source = await readFile(new URL(`../src/_locales/${locale}.yml`, import.meta.url), 'utf8')
      for (const key of [...entry.keywordKeys, entry.titleKey])
        assert.match(source, new RegExp(`^  ${key.split('.').at(-1)}: .+`, 'm'))
    }
  })
}
