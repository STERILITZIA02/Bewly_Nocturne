<script lang="ts" setup>
import { useI18n } from 'vue-i18n'

import Radio from '~/components/Radio.vue'
import Select from '~/components/Select.vue'
import { settings } from '~/logic'

import SettingsItem from '../../components/SettingsItem.vue'
import SettingsItemGroup from '../../components/SettingsItemGroup.vue'
import SettingsSectionHeading from '../../components/SettingsSectionHeading.vue'

const { t, locale } = useI18n()

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

watch(() => settings.value.language, (newValue) => {
  locale.value = newValue
})
</script>

<template>
  <div>
    <SettingsSectionHeading
      :title="$t('settings.menu_general')"
      :desc="$t('settings.category_general_desc')"
      icon="i-mingcute:settings-3-fill"
    />

    <SettingsItemGroup :title="$t('settings.group_language')">
      <SettingsItem :title="$t('settings.select_language')" right-width="auto">
        <Select
          v-model="settings.language"
          :options="langOptions"
          w="160px"
        />
      </SettingsItem>
    </SettingsItemGroup>

    <SettingsItemGroup :title="$t('settings.group_interaction_layout')">
      <SettingsItem :title="$t('settings.touch_screen_optimization')" :desc="$t('settings.touch_screen_optimization_desc')" right-width="auto">
        <Radio v-model="settings.touchScreenOptimization" />
      </SettingsItem>

      <SettingsItem :title="$t('settings.enable_grid_layout_switcher')" right-width="auto">
        <Radio v-model="settings.enableGridLayoutSwitcher" />
      </SettingsItem>

      <SettingsItem :title="$t('settings.enable_horizontal_scrolling')" :desc="$t('settings.enable_horizontal_scrolling_desc')" right-width="auto">
        <Radio v-model="settings.enableHorizontalScrolling" />
      </SettingsItem>
    </SettingsItemGroup>

    <SettingsItemGroup :title="$t('settings.group_memory_saving')">
      <SettingsItem
        :title="$t('settings.release_offscreen_images')"
        :badge="$t('settings.badge_use_with_caution')"
        right-width="auto"
      >
        <template #desc>
          <span>{{ $t('settings.release_offscreen_images_desc') }}</span>
          <span block class="bew-warning-text">
            {{ $t('settings.release_offscreen_images_warning') }}
          </span>
        </template>
        <Radio v-model="settings.releaseOffscreenVideoCardImages" />
      </SettingsItem>
    </SettingsItemGroup>

    <SettingsItemGroup :title="$t('settings.group_drawer_behavior')">
      <SettingsItem :title="$t('settings.drawer_escape_behavior')" right-width="auto">
        <Select v-model="settings.drawerEscapeBehavior" :options="drawerEscapeBehaviorOptions" w="160px" />
      </SettingsItem>
    </SettingsItemGroup>
  </div>
</template>

<style lang="scss" scoped>
</style>
