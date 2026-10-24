import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

export function registerUpstreamSettingsChecks(check, { Vue, flush, compileComponent }) {
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
    assert.ok(entry.storageValues.some(item => item.value === 'playback'))
    assert.deepEqual(entry.keywordKeys, ['settings.video_player_scroll_sending_bar', 'settings.video_player_scroll_center'])
    for (const locale of ['cmn-CN', 'cmn-TW', 'jyut', 'en']) {
      const source = await readFile(new URL(`../src/_locales/${locale}.yml`, import.meta.url), 'utf8')
      for (const key of [...entry.keywordKeys, entry.titleKey])
        assert.match(source, new RegExp(`^  ${key.split('.').at(-1)}: .+`, 'm'))
    }
  })
}
