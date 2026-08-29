<script lang="ts" setup>
import { ref } from 'vue'

import { useSearchFocusEffect } from '~/composables/useSearchFocusEffect'
import { settings } from '~/logic'

const searchInput = ref<string>('')
const searchFocusEffect = useSearchFocusEffect()
</script>

<template>
  <div
    flex="~ col"
    justify-center
    items-center
    w-full z-10
    pos="relative"
    m="t-20vh"
  >
    <Logo
      v-if="settings.searchPageShowLogo" :size="180" :color="settings.searchPageLogoColor === 'white' ? 'white' : 'var(--bew-theme-color)'"
      :glow="settings.searchPageLogoGlow"
      mb-12 z-1
    />
    <SearchBar
      v-model="searchInput"
      :darken-on-focus="searchFocusEffect.darkened"
      :blurred-on-focus="searchFocusEffect.blurred"
      :focused-character="settings.searchPageSearchBarFocusCharacter"
      :show-hot-search="settings.showHotSearchInTopBar"
      :top-bar-appearance="true"
    />
  </div>
</template>
