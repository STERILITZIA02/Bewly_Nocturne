<script setup lang="ts">
import { ref } from 'vue'

import { useSidebarHost } from '~/composables/useSidebarHost'
import { settings } from '~/logic'

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
// The rail's destination state, flipped as navigation starts (with its fold).
const sidebarHost = useSidebarHost()
</script>

<template>
  <main
    class="top-bar-header"
    :class="{
      'top-bar-header--solid': settings.disableFrostedGlass,
      'top-bar-header--solid-force-white': settings.disableFrostedGlass && forceWhiteIcon,
      'top-bar-header--rail': sidebarHost?.railOpen.value,
      'top-bar-header--brand-logo': settings.topBarLogoStyle === 'brand',
      'top-bar-header--pinned': settings.topBarPinnedChannels.length > 0,
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
      class="top-bar-header__search"
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
@use "../../../styles/breakpoints";

// The header spans the window: the logo is pinned to the rail content line on
// every page, and the search follows it rather than centring in the bar.
.top-bar-header {
  display: grid;
  grid-template-columns:
    auto minmax(0, var(--bew-search-bar-max-width)) minmax(var(--top-bar-channels-min-width, 0px), 1fr)
    max-content;
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
  margin-inline-start: 0;
  // Keep the space until the search has returned; only the release is delayed.
  transition: margin-inline-start 0s var(--bew-sidebar-morph-duration);
}

.top-bar-header__search {
  grid-column: 2;
  display: flex;
  min-width: 0;
}

// With the rail open the search (and the channels after it) start right after
// the rail instead of after the logo. Shifted, not re-laid out, so it glides with
// the rail's fold; the rail width itself transitions between page kinds.
.top-bar-header {
  --top-bar-logo-slot: var(--bew-top-bar-primary-control-height);
  --top-bar-rail-offset: max(
    0px,
    calc(var(--bew-messages-sidebar-width) - var(--bew-home-logo-inline-start) - var(--top-bar-logo-slot))
  );
}

.top-bar-header--brand-logo {
  --top-bar-logo-slot: calc(var(--bew-top-bar-brand-logo-width) + var(--bew-space-2) * 2);
}

.top-bar-header__search,
.top-bar-header__side--channels {
  transition: translate var(--bew-sidebar-morph-duration) var(--bew-ease-standard);
}

.top-bar-header--rail {
  .top-bar-header__side--right {
    // Translation does not take space in Grid: reserve its full distance first.
    margin-inline-start: var(--top-bar-rail-offset);
    transition: none;
  }

  .top-bar-header__search,
  .top-bar-header__side--channels {
    translate: var(--top-bar-rail-offset) 0;
  }
}

@media (min-width: breakpoints.$grid-xl) {
  .top-bar-header--pinned {
    // The collapsed channel list still needs room for its +N indicator.
    --top-bar-channels-min-width: calc(
      var(--bew-control-item-height) + var(--bew-space-2) * 2 +
        (var(--bew-control-padding) + var(--bew-control-border-width)) * 2 + var(--bew-control-gap)
    );
  }
}

@media (prefers-reduced-motion: reduce) {
  .top-bar-header__search,
  .top-bar-header__side--channels,
  .top-bar-header__side--right {
    transition: none;
  }
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
