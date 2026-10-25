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
  { value: 'page-modes', titleKey: 'settings.page_mode', descriptionKey: 'settings.page_mode_desc', icon: 'i-tabler:adjustments-horizontal', iconActivated: 'i-tabler:adjustments-horizontal', component: defineAsyncComponent(() => import('./PageModes.vue')) },
  {
    value: 'home',
    titleKey: 'settings.plugin.home',
    descriptionKey: 'settings.category_browsing_home_desc',
    icon: 'i-tabler:home',
    iconActivated: 'i-tabler:home-filled',
    component: defineAsyncComponent(() => import('../PluginComponentsAndPages/Home/Home.vue')),
  },
  {
    value: 'moments',
    titleKey: 'settings.plugin.moments',
    descriptionKey: 'settings.category_navigation_moments_desc',
    icon: 'i-tabler:windmill',
    iconActivated: 'i-tabler:windmill-filled',
    component: defineAsyncComponent(() => import('../PluginComponentsAndPages/Moments/Moments.vue')),
  },
  {
    value: 'lists',
    titleKey: 'settings.list_layouts',
    descriptionKey: 'settings.list_layouts_desc',
    icon: 'i-tabler:playlist',
    iconActivated: 'i-tabler:playlist',
    component: defineAsyncComponent(() => import('./ListLayouts.vue')),
  },
  {
    value: 'search',
    titleKey: 'settings.plugin.search',
    descriptionKey: 'settings.category_navigation_search_desc',
    icon: 'i-tabler:search',
    iconActivated: 'i-tabler:search',
    component: defineAsyncComponent(() => import('../PluginComponentsAndPages/SearchPage/SearchPage.vue')),
  },

  {
    value: 'messages',
    titleKey: 'settings.plugin.messages_page',
    descriptionKey: 'settings.category_navigation_messages_page_desc',
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
