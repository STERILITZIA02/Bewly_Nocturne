<script setup lang="ts">
import LiquidSegmentIndicator from '~/components/LiquidSegmentIndicator.vue'
import { PLAYBACK_SEGMENTS } from '~/utils/bewlyWidescreen/railTabs'

// The playback rail's tabs and the danmaku panel's views use the same sliding
// indicator as the other track selectors (see bewlyWidescreen/railTabs.ts).
</script>

<template>
  <template v-for="(segment, index) in PLAYBACK_SEGMENTS" :key="index">
    <Teleport v-if="segment.state.value" :to="segment.state.value.tablist">
      <LiquidSegmentIndicator :key="segment.state.value.generation" :active-key="segment.state.value.activeKey" :motion-scope="segment.motion" />
    </Teleport>
  </template>
</template>
