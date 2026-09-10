import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import { loadSourceFunctions } from './sourceFunctionHarness'
import { loadSourceModule } from './sourceModuleHarness'

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
      for (const key of [...entry.keywordKeys, entry.titleKey, 'settings.enable_sidebar_cover_blur'])
        assert.match(source, new RegExp(`^  ${key.split('.').at(-1)}: .+`, 'm'))
    }
  })

  check('settings migration: raw persisted and imported cover keys respect explicit new values before defaults', async () => {
    const migration = await import('../src/utils/sidebarCoverSettings')
    const protocol = await import('../src/utils/settingsStorageProtocol')
    for (const [raw, expected] of [
      [{ enableFavoriteCoverBlur: false }, false],
      [{ enableFavoriteCoverBlur: true }, true],
      [{ enableFavoriteCoverBlur: false, enableSidebarCoverBlur: true }, true],
      [{ enableFavoriteCoverBlur: true, enableSidebarCoverBlur: false }, false],
      [{ enableFavoriteCoverBlur: 'false' }, true],
    ]) {
      let stored = { ...raw, preserved: 7 }
      let revision = 0
      const listeners = new Set()
      const storage = await loadSourceModule('../src/composables/useSettingsStorage.ts', {
        'vue': Vue,
        'webextension-polyfill': { default: { storage: { onChanged: { addListener: fn => listeners.add(fn), removeListener: fn => listeners.delete(fn) } } } },
        '~/utils/sidebarCoverSettings': migration,
        '~/utils/settingsStorageProtocol': protocol,
        '~/utils/messaging': { isExtensionContextInvalidatedError: () => false, sendMessage: async (name, payload) => {
          if (name === protocol.SETTINGS_STORAGE_PATCH_MESSAGE) {
            stored = protocol.applySettingsStoragePatch(stored, payload.patch)
            revision++
          }
          return { accepted: true, epoch: 'fixture', revision, storedValue: JSON.stringify(stored) }
        } },
      }, { crypto: { randomUUID: () => 'fixture-client' }, structuredClone })
      const scope = Vue.effectScope()
      const settings = scope.run(() => storage.useSettingsStorage({ enableSidebarCoverBlur: true }))
      await flush()
      await settings.flush()
      assert.equal(settings.value.enableSidebarCoverBlur, expected)
      assert.equal('enableFavoriteCoverBlur' in stored, false)
      assert.equal(stored.preserved, 7)
      scope.stop()
      assert.equal(listeners.size, 0)

      const imported = { value: { enableSidebarCoverBlur: true, videoPlayerScrollMode: 'sendingBar' } }
      const maintenance = await loadSourceFunctions('../src/components/Settings/Advanced/Maintenance.vue', ['handleImportFile', 'matchesSettingType', 'hasBlockedProperty', 'isPlainObject', 'blockedPropertyNames', 'settingEnumValues'], {
        ...migration,
        settings: imported,
        originalSettings: { ...imported.value },
        settingValueValidators: {},
        FileReader: class {
          readAsText(file) {
            this.result = file
            this.onload()
          }
        },
        toast: { success() {}, warning() {}, error() { assert.fail('valid import rejected') } },
        t: key => key,
      })
      maintenance.handleImportFile({ target: { files: [JSON.stringify({ ...raw, videoPlayerScrollMode: 'playerCenter' })] } })
      assert.equal(imported.value.enableSidebarCoverBlur, expected)
      assert.equal(imported.value.videoPlayerScrollMode, 'playerCenter')
      assert.equal('enableFavoriteCoverBlur' in imported.value, false)
      maintenance.handleImportFile({ target: { files: [JSON.stringify({ videoPlayerScrollMode: 'invalid' })] } })
      assert.equal(imported.value.videoPlayerScrollMode, 'playerCenter')
    }
    assert.deepEqual(migration.migrateSidebarCoverSetting({ enableSidebarCoverBlur: 'invalid', enableFavoriteCoverBlur: false }), { enableSidebarCoverBlur: 'invalid' }, 'an existing invalid new key is validated separately, not silently replaced by legacy state')
  })

  check('cover sidebar: one surface follows the shared setting, releases the decorative image and preserves slot instances', async () => {
    const settings = Vue.ref({ enableSidebarCoverBlur: true })
    const Surface = await compileComponent('../src/components/CoverSidebarSurface.vue', { vue: Vue, '~/logic': { settings } })
    const cover = Vue.ref('https://example.com/cover.jpg')
    const host = document.body.appendChild(document.createElement('div'))
    const app = Vue.createApp({ setup: () => () => Vue.h(Surface, { cover: cover.value }, () => [Vue.h('input', { value: 'preserve draft' }), Vue.h('button', 'Play all')]) })
    app.mount(host)
    const input = host.querySelector('input')
    host.querySelector('img').dispatchEvent(new Event('error'))
    await flush()
    assert.equal(host.querySelector('[data-cover-background]').dataset.coverBackground, 'false', 'a failed cover restores readable neutral colors')
    cover.value = 'https://example.com/new-cover.jpg'
    await flush()
    for (const theme of ['', 'dark', 'dark oled-dark']) {
      host.className = theme
      settings.value.enableSidebarCoverBlur = true
      await flush()
      assert.equal(host.querySelectorAll('img').length, 1)
      settings.value.enableSidebarCoverBlur = false
      await flush()
      assert.equal(host.querySelector('img'), null)
      assert.equal(host.querySelector('[data-cover-background]').dataset.coverBackground, 'false')
      assert.equal(host.querySelector('input'), input)
    }
    settings.value.enableSidebarCoverBlur = true
    cover.value = ''
    await flush()
    assert.equal(host.querySelector('[data-cover-background]').dataset.coverBackground, 'false', 'missing covers use a complete neutral palette')
    app.unmount()
    host.remove()
  })
}
