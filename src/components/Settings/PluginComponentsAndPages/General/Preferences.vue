<script lang="ts" setup>
import { useI18n } from 'vue-i18n'

import Button from '~/components/Button.vue'
import Radio from '~/components/Radio.vue'
import Select from '~/components/Select.vue'
import { settings } from '~/logic'

import SettingsItem from '../../components/SettingsItem.vue'
import SettingsItemGroup from '../../components/SettingsItemGroup.vue'

const { t } = useI18n()
const startQuickLayoutEdit = inject<() => void>('startQuickLayoutEdit')

const langOptions = computed(() => {
  return [
    {
      label: t('settings.select_language_opt.mandarin_cn'),
      value: 'cmn-CN',
    },
    {
      label: t('settings.select_language_opt.mandarin_tw'),
      value: 'cmn-TW',
    },
    {
      label: t('settings.select_language_opt.english'),
      value: 'en',
    },
    {
      label: t('settings.select_language_opt.jyut'),
      value: 'jyut',
    },
  ]
})

const drawerEscapeBehaviorOptions = computed(() => [
  { label: t('settings.drawer_escape_immediate'), value: 'immediate' },
  { label: t('settings.drawer_escape_second_press'), value: 'secondPress' },
])
</script>

<template>
  <div>
    <p class="bew-help" mb-4>
      {{ $t('settings.category_general_desc') }}
    </p>

    <SettingsItemGroup data-setting-id="settings.group_language" :title="$t('settings.group_language')">
      <SettingsItem setting-id="settings.select_language" :title="$t('settings.select_language')" right-width="auto">
        <Select
          v-model="settings.language"
          :options="langOptions"
          w="160px"
        />
      </SettingsItem>
    </SettingsItemGroup>

    <SettingsItemGroup data-setting-id="settings.group_interaction_layout" :title="$t('settings.group_interaction_layout')">
      <SettingsItem
        setting-id="layout_editor.quick_edit" :title="$t('layout_editor.quick_edit')"
        :desc="$t('layout_editor.quick_edit_desc')"
        right-width="auto"
      >
        <Button
          type="primary"
          size="small"
          :disabled="!startQuickLayoutEdit"
          @click="startQuickLayoutEdit?.()"
        >
          <template #left>
            <i i-tabler:edit />
          </template>
          {{ $t('layout_editor.start_quick_edit') }}
        </Button>
      </SettingsItem>

      <SettingsItem setting-id="settings.touch_screen_optimization" :title="$t('settings.touch_screen_optimization')" :desc="$t('settings.touch_screen_optimization_desc')" right-width="auto">
        <Radio v-model="settings.touchScreenOptimization" />
      </SettingsItem>

      <SettingsItem setting-id="settings.enable_grid_layout_switcher" :title="$t('settings.enable_grid_layout_switcher')" right-width="auto">
        <Radio v-model="settings.enableGridLayoutSwitcher" />
      </SettingsItem>

      <SettingsItem setting-id="settings.enable_horizontal_scrolling" :title="$t('settings.enable_horizontal_scrolling')" :desc="$t('settings.enable_horizontal_scrolling_desc')" right-width="auto">
        <Radio v-model="settings.enableHorizontalScrolling" />
      </SettingsItem>
    </SettingsItemGroup>

    <SettingsItemGroup data-setting-id="settings.group_drawer_behavior" :title="$t('settings.group_drawer_behavior')">
      <SettingsItem setting-id="settings.drawer_escape_behavior" :title="$t('settings.drawer_escape_behavior')" right-width="auto">
        <Select v-model="settings.drawerEscapeBehavior" :options="drawerEscapeBehaviorOptions" w="160px" />
      </SettingsItem>
    </SettingsItemGroup>
  </div>
</template>

<style lang="scss" scoped>
</style>
