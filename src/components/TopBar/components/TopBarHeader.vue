<script setup lang="ts">
import { ref } from 'vue'

import { settings } from '~/logic'
import { vLayoutEditable } from '~/logic/layoutEdit'

import { useTopBarInteraction } from '../composables/useTopBarInteraction'
import TopBarLogo from './TopBarLogo.vue'
import TopBarPinnedChannels from './TopBarPinnedChannels.vue'
import TopBarRight from './TopBarRight.vue'
import TopBarSearch from './TopBarSearch.vue'

withDefaults(defineProps<{
  active?: boolean
  reachTop: boolean
  isDark: boolean
}>(), { active: true })

const { forceWhiteIcon, showSearchBar } = useTopBarInteraction()
const topBarSearchFocused = ref(false)
</script>

<template>
  <main
    class="top-bar-header"
    :class="{
      'top-bar-header--solid': settings.disableFrostedGlass,
      'top-bar-header--solid-force-white': settings.disableFrostedGlass && forceWhiteIcon,
    }"
    h="$bew-top-bar-height"
  >
    <!-- Top bar theme color gradient -->
    <Transition name="fade">
      <div
        v-if="!settings.disableFrostedGlass && settings.useLinearGradientThemeColorBackground && reachTop && isDark"
        pos="absolute top-0 left-0" w-full h="$bew-top-bar-height" pointer-events-none
        :style="{ background: 'linear-gradient(to bottom, rgb(255 255 255 / 10%), transparent)' }"
      />
    </Transition>

    <!-- Reserves the floating logo's box; the search sits right after it. -->
    <div class="top-bar-header__side top-bar-header__side--left">
      <TopBarLogo :force-white-icon="forceWhiteIcon" placeholder />
    </div>

    <!-- search bar -->
    <div
      v-layout-editable="'topbar-search'"
      class="top-bar-header__search"
      data-layout-editable-id="topbar-search"
      :class="{ 'top-bar-header__search--focused': topBarSearchFocused }"
    >
      <div v-if="showSearchBar" class="top-bar-header__search-control">
        <TopBarSearch :active="active" @focus-change="topBarSearchFocused = $event" />
      </div>
    </div>

    <div class="top-bar-header__side top-bar-header__side--channels">
      <TopBarPinnedChannels :force-white-icon="forceWhiteIcon" />
    </div>

    <!-- right content -->
    <div class="top-bar-header__side top-bar-header__side--right">
      <TopBarRight />
    </div>
  </main>
</template>

<style scoped lang="scss">
// The header spans the window: the logo is pinned to the rail content line on
// every page, and the search follows it rather than centring in the bar.
.top-bar-header {
  display: grid;
  grid-template-columns: auto minmax(0, var(--b-search-bar-max-width, 550px)) minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--bew-top-bar-section-gap);
  box-sizing: border-box;
  min-width: 0;
  min-height: var(--bew-top-bar-height);
  // The logo sits on the rail content line; the avatar's right edge matches the
  // page content inset (the Moments right column's distance from the edge).
  padding-inline: var(--bew-home-logo-inline-start) var(--bew-page-inline-inset);
}

.top-bar-header--solid {
  background: var(--bew-top-bar-solid-background);
  box-shadow: var(--bew-top-bar-solid-shadow);
  transition:
    background-color var(--bew-duration-moderate) var(--bew-ease-standard),
    box-shadow var(--bew-duration-moderate) var(--bew-ease-standard);
}

.top-bar-header--solid-force-white {
  background: var(--bew-top-bar-solid-background-force-white);
}

.top-bar-header__side {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: var(--bew-space-2);
}

.top-bar-header__side--left {
  grid-column: 1;
}

.top-bar-header__side--channels {
  grid-column: 3;
}

.top-bar-header__side--right {
  grid-column: 4;
  justify-self: end;
}

.top-bar-header__search {
  grid-column: 2;
  display: flex;
  min-width: 0;
}

.top-bar-header__search--focused {
  position: relative;
  z-index: 1;
}

.top-bar-header__search-control {
  width: 100%;
  min-width: 0;
}
</style>
