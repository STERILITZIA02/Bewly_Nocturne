<script lang="ts" setup>
import Logo from '~/components/Logo.vue'
import SearchBar from '~/components/SearchBar/SearchBar.vue'
import { usePageViewState } from '~/composables/usePageViewState'
import { uiPx } from '~/composables/useUiScale'
import { settings } from '~/logic'

const searchInput = usePageViewState('search').ref('input', '')
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
      v-if="settings.searchPageShowLogo" :size="uiPx(180)" :color="settings.searchPageLogoColor === 'white' ? 'white' : 'var(--bew-theme-color)'"
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
