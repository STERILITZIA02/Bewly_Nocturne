<script setup lang="ts">
import SettingsCategoryLayout from '../components/SettingsCategoryLayout.vue'

const storageKey = 'bewly-settings-bilibili-page'
const legacyStorageKey = 'bewly-settings-playback-page'
const bilibiliPageValues = ['player', 'auto-play']
const legacyPage = sessionStorage.getItem(legacyStorageKey)

if (!sessionStorage.getItem(storageKey) && legacyPage && bilibiliPageValues.includes(legacyPage))
  sessionStorage.setItem(storageKey, legacyPage)

const pages = [
  {
    value: 'player',
    titleKey: 'settings.bilibili_features.video_playback',
    descriptionKey: 'settings.category_playback_player_desc',
    icon: 'i-tabler:player-play',
    iconActivated: 'i-tabler:player-play-filled',
    component: defineAsyncComponent(() => import('./VideoPlayback/VideoPlayback.vue')),
  },
  {
    value: 'auto-play',
    titleKey: 'settings.bilibili_features.auto_play',
    descriptionKey: 'settings.category_playback_autoplay_desc',
    icon: 'i-tabler:layout-list',
    iconActivated: 'i-tabler:layout-list-filled',
    component: defineAsyncComponent(() => import('./AutoPlay/AutoPlay.vue')),
  },
  {
    value: 'comments',
    titleKey: 'settings.bilibili_features.comments',
    descriptionKey: 'settings.category_bilibili_comments_desc',
    icon: 'i-tabler:message',
    iconActivated: 'i-tabler:message-filled',
    component: defineAsyncComponent(() => import('./Comments/Comments.vue')),
  },
  {
    value: 'vip-features',
    titleKey: 'settings.bilibili_features.vip_features',
    descriptionKey: 'settings.category_bilibili_vip_desc',
    icon: 'i-tabler:crown',
    iconActivated: 'i-tabler:crown',
    component: defineAsyncComponent(() => import('./VipFeatures/VipFeatures.vue')),
  },
  {
    value: 'compatibility',
    titleKey: 'settings.menu_compatibility',
    descriptionKey: 'settings.category_advanced_compatibility_desc',
    icon: 'i-tabler:polygon',
    iconActivated: 'i-tabler:polygon',
    component: defineAsyncComponent(() => import('../Compatibility/Compatibility.vue')),
  },
]
</script>

<template>
  <SettingsCategoryLayout :pages="pages" :storage-key="storageKey" />
</template>
