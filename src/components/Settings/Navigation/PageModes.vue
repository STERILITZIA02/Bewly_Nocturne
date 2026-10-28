<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { useBewlyApp } from '~/composables/useAppProvider'
import { pageModeChangePending, selectPageMode } from '~/composables/usePageModeSwitcher'
import { settings } from '~/logic'
import { useMainStore } from '~/stores/mainStore'
import { useSettingsStore } from '~/stores/settingsStore'
import type { PageMode } from '~/utils/pageMode'

import SettingsItem from '../components/SettingsItem.vue'
import SettingsItemGroup from '../components/SettingsItemGroup.vue'
import SettingsSegmentedControl from '../components/SettingsSegmentedControl.vue'

const { t } = useI18n()
const mainStore = useMainStore()
const settingsStore = useSettingsStore()
const { activatedPage } = useBewlyApp()
const pageMode = computed({
  get: () => settings.value.pageMode,
  set: (mode: PageMode) => {
    void selectPageMode(mode, activatedPage.value)
  },
})
const pageModeOptions = computed(() => [
  { label: t('dock.page_mode_original'), value: 'original' },
  { label: t('dock.page_mode_bewly'), value: 'bewly' },
  { label: t('dock.page_mode_custom'), value: 'custom' },
])
const topBarModeOptions = computed(() => [
  {
    label: t('settings.topbar_mode_bewly'),
    value: 'bewly',
  },
  {
    label: t('settings.topbar_mode_bilibili'),
    value: 'original',
  },
])

const topBarMode = computed({
  get: () => settingsStore.getUseOriginalBilibiliTopBar() ? 'original' : 'bewly',
  set: (mode: string) => {
    if (settings.value.pageMode === 'custom')
      settingsStore.setCustomUseOriginalBilibiliTopBar(mode === 'original')
  },
})

const topBarModeDisabled = computed(() => settings.value.pageMode !== 'custom')
</script>

<template>
  <SettingsItemGroup>
    <SettingsItem setting-id="navigation.pageMode" :title="$t('settings.page_mode')" right-width="auto">
      <SettingsSegmentedControl v-model="pageMode" :disabled="pageModeChangePending" :label="$t('settings.page_mode')" :options="pageModeOptions" />
    </SettingsItem>
    <SettingsItem setting-id="navigation.topBar.mode" :title="$t('settings.topbar_mode')" :desc="topBarModeDisabled ? $t('settings.custom_page_mode_required') : undefined" right-width="auto">
      <SettingsSegmentedControl v-model="topBarMode" :disabled="topBarModeDisabled" :label="$t('settings.topbar_mode')" :options="topBarModeOptions" />
    </SettingsItem>
    <SettingsItem
      v-for="item in mainStore.dockItems.filter(item => item.hasBewlyPage)" :key="item.page"
      :setting-id="`navigation.pageMode.${item.page}`" :title="$t(item.i18nKey)" right-width="auto"
    >
      <SettingsSegmentedControl
        :model-value="settingsStore.getDockItemIsUseOriginalBiliPage(item.page) ? 'original' : 'bewly'"
        :disabled="topBarModeDisabled" :label="$t(item.i18nKey)" :options="topBarModeOptions"
        @update:model-value="settingsStore.setDockItemCustomUseOriginalBiliPage(item.page, $event === 'original')"
      />
    </SettingsItem>
  </SettingsItemGroup>
</template>
