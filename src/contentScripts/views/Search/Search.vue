<script lang="ts" setup>
import { ref } from 'vue'

import { settings } from '~/logic'

const searchInput = ref<string>('')
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
      mb-12 z-1
    />
    <SearchBar
      v-model="searchInput"
      :focused-character="settings.searchPageSearchBarFocusCharacter"
      :show-hot-search="settings.showHotSearchInTopBar"
      :top-bar-appearance="true"
    />
  </div>
</template>
