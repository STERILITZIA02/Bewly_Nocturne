<script setup lang="ts">
import type { SettingsNavigationRequest } from '~/composables/useAppProvider'

import SettingsCategoryLayout from '../components/SettingsCategoryLayout.vue'

const props = defineProps<{ navigationTarget?: SettingsNavigationRequest | null }>()
const pages = [
  { value: 'layout', titleKey: 'settings.playback_layout', icon: 'i-tabler:layout', iconActivated: 'i-tabler:layout', component: defineAsyncComponent(() => import('../PluginComponentsAndPages/PlaybackPage/PlaybackPage.vue')) },
  { value: 'controls', titleKey: 'settings.playback_controls', icon: 'i-tabler:adjustments-horizontal', iconActivated: 'i-tabler:adjustments-horizontal', component: defineAsyncComponent(() => import('../BilibiliFeaturesEnhancement/VideoPlayback/VideoPlayback.vue')) },
  { value: 'behavior', titleKey: 'settings.playback_behavior', icon: 'i-tabler:player-play', iconActivated: 'i-tabler:player-play-filled', component: defineAsyncComponent(() => import('../BilibiliFeaturesEnhancement/AutoPlay/AutoPlay.vue')) },
]
</script>

<template>
  <SettingsCategoryLayout
    :pages="pages" storage-key="bewly-settings-playback-page"
    :navigation-page="props.navigationTarget?.target.category === 'playback' ? props.navigationTarget.target.page : undefined"
    :navigation-request-id="props.navigationTarget?.id"
  />
</template>
