<script setup lang="ts">
import SettingsCategoryLayout from '../components/SettingsCategoryLayout.vue'

const storageKey = 'bewly-settings-bilibili-page'
const pages = [
  {
    value: 'comments',

    titleKey: 'settings.bilibili_features.comments',
    icon: 'i-tabler:message',
    iconActivated: 'i-tabler:message-filled',
    component: defineAsyncComponent(() => import('./Comments/Comments.vue')),
  },
  {
    value: 'vip-features',
    titleKey: 'settings.bilibili_features.vip_features',
    icon: 'i-tabler:crown',
    iconActivated: 'i-tabler:crown',
    component: defineAsyncComponent(() => import('./VipFeatures/VipFeatures.vue')),
  },
  {
    value: 'compatibility',
    titleKey: 'settings.menu_compatibility',
    icon: 'i-tabler:polygon',
    iconActivated: 'i-tabler:polygon',
    component: defineAsyncComponent(() => import('../Compatibility/Compatibility.vue')),
  },
]
</script>

<template>
  <SettingsCategoryLayout :pages="pages" :storage-key="storageKey" />
</template>
