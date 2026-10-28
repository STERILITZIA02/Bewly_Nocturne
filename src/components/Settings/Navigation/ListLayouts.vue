<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { settings } from '~/logic'
import type { HistoryGroupInterval, WatchLaterLayoutMode } from '~/logic/storage'

import SettingsItem from '../components/SettingsItem.vue'
import SettingsItemGroup from '../components/SettingsItemGroup.vue'
import SettingsSegmentedControl from '../components/SettingsSegmentedControl.vue'

const { t } = useI18n()
const layoutOptions = computed<{ label: string, value: WatchLaterLayoutMode }[]>(() => [
  { label: t('watch_later.layout_list'), value: 'list' },
  { label: t('watch_later.layout_grid'), value: 'grid' },
])
const historyGroupOptions = computed<{ label: string, value: HistoryGroupInterval }[]>(() => (['hour', 'period', 'day'] as const).map(value => ({ label: t(`history.group_${value}`), value })))
</script>

<template>
  <div>
    <SettingsItemGroup>
      <SettingsItem
        setting-id="page.watchLater.layout"
        :title="$t('settings.watch_later_layout_mode')"
        right-width="auto"
      >
        <SettingsSegmentedControl
          v-model="settings.watchLaterLayoutMode"
          :label="$t('settings.watch_later_layout_mode')"
          :options="layoutOptions"
        />
      </SettingsItem>
      <SettingsItem setting-id="settings.history_group_interval" :title="$t('settings.history_group_interval')" right-width="auto">
        <SettingsSegmentedControl v-model="settings.historyGroupInterval" :label="$t('settings.history_group_interval')" :options="historyGroupOptions" />
      </SettingsItem>
    </SettingsItemGroup>
  </div>
</template>
