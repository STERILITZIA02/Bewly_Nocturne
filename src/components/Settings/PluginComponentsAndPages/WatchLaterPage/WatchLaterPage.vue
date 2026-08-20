<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { settings } from '~/logic'
import type { WatchLaterLayoutMode } from '~/logic/storage'

import SettingsItem from '../../components/SettingsItem.vue'
import SettingsItemGroup from '../../components/SettingsItemGroup.vue'
import SettingsSegmentedControl from '../../components/SettingsSegmentedControl.vue'

const { t } = useI18n()
const layoutOptions = computed<{ label: string, value: WatchLaterLayoutMode }[]>(() => [
  { label: t('watch_later.layout_list'), value: 'list' },
  { label: t('watch_later.layout_grid'), value: 'grid' },
])
</script>

<template>
  <div>
    <SettingsItemGroup
      :title="$t('settings.group_watch_later_layout')"
      :desc="$t('settings.group_watch_later_layout_desc')"
    >
      <SettingsItem
        setting-id="page.watchLater.layout"
        :title="$t('settings.watch_later_layout_mode')"
        :desc="$t('settings.watch_later_layout_mode_desc')"
        right-width="auto"
      >
        <SettingsSegmentedControl
          v-model="settings.watchLaterLayoutMode"
          :label="$t('settings.watch_later_layout_mode')"
          :options="layoutOptions"
        />
      </SettingsItem>
    </SettingsItemGroup>
  </div>
</template>
