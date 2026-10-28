<script setup lang="ts">
import type { SettingsNavigationRequest } from '~/composables/useAppProvider'

import SettingsCategoryLayout from '../components/SettingsCategoryLayout.vue'

const props = defineProps<{
  navigationTarget?: SettingsNavigationRequest | null
}>()

const storageKey = 'bewly-settings-bewly-pages-page'
const legacyStorageKey = 'bewly-settings-navigation-page'
const pageValues = ['page-modes', 'home', 'moments', 'lists', 'search', 'messages']
const legacyPage = sessionStorage.getItem(legacyStorageKey)

if (!sessionStorage.getItem(storageKey) && legacyPage && pageValues.includes(legacyPage))
  sessionStorage.setItem(storageKey, legacyPage)
if (!pageValues.includes(sessionStorage.getItem(storageKey) ?? ''))
  sessionStorage.setItem(storageKey, pageValues[0])

const pages = [
  { value: 'page-modes', titleKey: 'settings.page_mode', icon: 'i-tabler:adjustments-horizontal', iconActivated: 'i-tabler:adjustments-horizontal', component: defineAsyncComponent(() => import('./PageModes.vue')) },
  {
    value: 'home',
    titleKey: 'settings.plugin.home',
    icon: 'i-tabler:home',
    iconActivated: 'i-tabler:home-filled',
    component: defineAsyncComponent(() => import('../PluginComponentsAndPages/Home/Home.vue')),
  },
  {
    value: 'moments',
    titleKey: 'settings.plugin.moments',
    icon: 'i-tabler:windmill',
    iconActivated: 'i-tabler:windmill-filled',
    component: defineAsyncComponent(() => import('../PluginComponentsAndPages/Moments/Moments.vue')),
  },
  {
    value: 'lists',
    titleKey: 'settings.list_layouts',
    icon: 'i-tabler:playlist',
    iconActivated: 'i-tabler:playlist',
    component: defineAsyncComponent(() => import('./ListLayouts.vue')),
  },
  {
    value: 'search',
    titleKey: 'settings.plugin.search',
    icon: 'i-tabler:search',
    iconActivated: 'i-tabler:search',
    component: defineAsyncComponent(() => import('../PluginComponentsAndPages/SearchPage/SearchPage.vue')),
  },

  {
    value: 'messages',
    titleKey: 'settings.plugin.messages_page',
    icon: 'i-tabler:message-circle',
    iconActivated: 'i-tabler:message-circle-filled',
    component: defineAsyncComponent(() => import('../PluginComponentsAndPages/MessagesPage/MessagesPage.vue')),
  },
]
</script>

<template>
  <SettingsCategoryLayout
    :navigation-page="props.navigationTarget?.target.category === 'bewly-pages' ? props.navigationTarget.target.page : undefined"
    :navigation-request-id="props.navigationTarget?.id"
    :pages="pages"
    :storage-key="storageKey"
  />
</template>
