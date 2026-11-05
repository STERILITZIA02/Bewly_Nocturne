<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'

import SearchBar from '~/components/SearchBar/SearchBar.vue'
import { settings } from '~/logic'
import { useTopBarStore } from '~/stores/topBarStore'
import { session as playbackSession } from '~/utils/bewlyWidescreen/session'
import { arriveSearchAt, departSearchFrom } from '~/utils/searchHandoff'

import { useTopBarInteraction } from '../composables/useTopBarInteraction'
import PlaybackHistoryControls from './PlaybackHistoryControls.vue'

withDefaults(defineProps<{ active?: boolean }>(), { active: true })
const emit = defineEmits<{
  focusChange: [focused: boolean]
}>()
const { showSearchBar, forceWhiteIcon } = useTopBarInteraction()
const topBarStore = useTopBarStore()
const { searchKeyword } = storeToRefs(topBarStore)
const playback = computed(() => playbackSession.current?.displayMode === 'card')
const collapsed = ref(true)

const useLightText = computed(() => forceWhiteIcon.value && !settings.value.disableFrostedGlass)
</script>

<template>
  <div flex="inline 1 items-center" w="full" data-top-bar-search :class="{ 'playback-search': playback }">
    <!-- Leaving for Home hands its position to the home search, and arriving from
         Home starts where the home search was. -->
    <Transition name="slide-out" @before-leave="departSearchFrom" @enter="(element: Element) => arriveSearchAt(element as HTMLElement)">
      <SearchBar
        v-if="showSearchBar"
        v-model="searchKeyword"
        layout-editable-id="topbar-search"
        :active="active"
        :collapsible="playback || settings.collapseTopBarSearch"
        class="search-bar"
        :force-light-text="useLightText"
        :show-hot-search="settings.showHotSearchInTopBar"
        :top-bar-appearance="true"
        :top-bar-mode="true"
        @focus-change="emit('focusChange', $event)"
        @collapse-change="collapsed = $event"
      />
    </Transition>
    <PlaybackHistoryControls v-if="playback" :inert="collapsed ? undefined : true" />
  </div>
</template>

<style lang="scss" scoped>
@use "../styles/index.scss";

.playback-search {
  position: relative;
  isolation: isolate;

  .search-bar {
    z-index: 1;
  }

  // A control of its own after the collapsed search, the header's section gap
  // away, as the search is from the logo.
  .playback-history-controls {
    position: absolute;
    inset-inline-start: calc(var(--bew-top-bar-primary-control-height) + var(--bew-top-bar-section-gap));
    transition:
      opacity var(--bew-duration-fast) var(--bew-ease-out) var(--bew-duration-moderate),
      visibility 0s var(--bew-duration-moderate);

    &[inert] {
      opacity: 0;
      visibility: hidden;
      pointer-events: none;
      transition-delay: 0s, var(--bew-duration-fast);
    }

    @media (prefers-reduced-motion: reduce) {
      transition: none;
    }
  }
}
</style>
