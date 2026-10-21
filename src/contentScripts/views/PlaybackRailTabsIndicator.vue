<script setup lang="ts">
import LiquidSegmentIndicator from '~/components/LiquidSegmentIndicator.vue'
import { playbackRailTabs } from '~/utils/bewlyWidescreen/railTabs'

// The playback rail's comment / danmaku / list tabs use the same sliding
// indicator as the other track selectors (see bewlyWidescreen/railTabs.ts).
</script>

<template>
  <Teleport v-if="playbackRailTabs" :to="playbackRailTabs.tablist">
    <LiquidSegmentIndicator :key="playbackRailTabs.generation" :active-key="playbackRailTabs.activeTab" />
  </Teleport>
</template>
