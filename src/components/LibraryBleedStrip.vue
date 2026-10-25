<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

import { createElasticWheelScroll } from '~/utils/elasticScroll'

/**
 * The scroller of a sideways strip at the top of library content (styles in
 * `bleedStrip.scss`): it passes under the rail's glass to the window edge,
 * and wheels and trackpads scroll it with elastic ends. Touch and keyboard
 * keep native scrolling. The host section applies `bleedStrip.bar`.
 */
defineProps<{ label: string, compact?: boolean }>()
const scroller = ref<HTMLElement | null>(null)
const track = ref<HTMLElement | null>(null)
let elastic: ReturnType<typeof createElasticWheelScroll> | undefined
onMounted(() => {
  if (scroller.value && track.value)
    elastic = createElasticWheelScroll(scroller.value, track.value)
})
onBeforeUnmount(() => elastic?.dispose())
defineExpose({ scroller })
</script>

<template>
  <div ref="scroller" class="library-bleed-strip" role="group" :aria-label="label" @wheel="elastic?.handleWheel($event)">
    <div ref="track" class="library-bleed-strip__track" :class="{ 'library-bleed-strip__track--compact': compact }">
      <slot />
    </div>
  </div>
</template>

<style scoped lang="scss">
@use "../styles/bleedStrip";

.library-bleed-strip {
  @include bleedStrip.scroller;
}
.library-bleed-strip__track {
  @include bleedStrip.track;
}
.library-bleed-strip__track--compact {
  gap: var(--bew-space-2);
}
</style>
