<script setup lang="ts">
import SettingsCategoryLayout from '../../components/SettingsCategoryLayout.vue'

const pages = [
  {
    value: 'preferences',
    titleKey: 'settings.general_preferences',
    icon: 'i-tabler:adjustments-horizontal',
    iconActivated: 'i-tabler:adjustments-horizontal',
    component: defineAsyncComponent(() => import('./Preferences.vue')),
  },
  {
    value: 'authorization',
    titleKey: 'settings.authorize_app',
    icon: 'i-tabler:key',
    iconActivated: 'i-tabler:key',
    component: defineAsyncComponent(() => import('./AppAuthorization.vue')),
  },
  {
    value: 'data',
    titleKey: 'settings.settings_data',
    icon: 'i-tabler:database',
    iconActivated: 'i-tabler:database',
    component: defineAsyncComponent(() => import('./SettingsData.vue')),
  },
]
</script>

<template>
  <SettingsCategoryLayout :pages="pages" storage-key="bewly-settings-general-page" />
</template>
