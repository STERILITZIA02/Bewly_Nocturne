<script setup lang="ts">
import type { SettingsNavigationRequest } from '~/composables/useAppProvider'

import SettingsCategoryLayout from '../components/SettingsCategoryLayout.vue'

const props = defineProps<{ navigationTarget?: SettingsNavigationRequest | null }>()

const storageKey = 'bewly-settings-bewly-components-page'
const legacyStorageKey = 'bewly-settings-navigation-page'
const pageValues = ['video-card', 'topbar', 'dock']
const legacyPage = sessionStorage.getItem(legacyStorageKey)

if (!sessionStorage.getItem(storageKey) && legacyPage && pageValues.includes(legacyPage))
  sessionStorage.setItem(storageKey, legacyPage)

const pages = [
  {
    value: 'video-card',
    titleKey: 'settings.plugin.video_card',
    icon: 'i-tabler:video',
    iconActivated: 'i-tabler:video-filled',
    component: defineAsyncComponent(() => import('../PluginComponentsAndPages/VideoCard/VideoCard.vue')),
  },
  {
    value: 'topbar',
    titleKey: 'settings.plugin.topbar',
    icon: 'i-tabler:layout-navbar',
    iconActivated: 'i-tabler:layout-navbar-filled',
    component: defineAsyncComponent(() => import('../PluginComponentsAndPages/TopBar/TopBar.vue')),
  },
  {
    value: 'dock',
    titleKey: 'settings.plugin.dock_and_sidebar',
    icon: 'i-tabler:navigation',
    iconActivated: 'i-tabler:navigation-filled',
    component: defineAsyncComponent(() => import('../PluginComponentsAndPages/DockAndSidebar/DockAndSidebar.vue')),
  },
]
</script>

<template>
  <SettingsCategoryLayout
    :pages="pages" :storage-key="storageKey"
    :navigation-page="props.navigationTarget?.target.category === 'bewly-components' ? props.navigationTarget.target.page : undefined"
    :navigation-request-id="props.navigationTarget?.id"
  />
</template>
