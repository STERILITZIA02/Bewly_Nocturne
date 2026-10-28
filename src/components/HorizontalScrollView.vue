<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

import { settings } from '~/logic'
import { createElasticWheelScroll } from '~/utils/elasticScroll'

/**
 * A sideways row with the shared horizontal behaviour: trackpad swipes scroll
 * it with elastic ends (`elasticScroll`), and its ends fade only while more of
 * the row lies beyond them (`scrollEdgeFade.horizontal`). With the horizontal
 * scrolling preference on, vertical mouse wheels scroll it too, handing back
 * to the page once the row reaches that end.
 */
const scroller = ref<HTMLElement>()
const track = ref<HTMLElement>()
let elastic: ReturnType<typeof createElasticWheelScroll> | undefined
onMounted(() => {
  elastic = createElasticWheelScroll(scroller.value!, track.value!)
})
onBeforeUnmount(() => elastic?.dispose())

function handleWheel(event: WheelEvent) {
  const element = scroller.value
  if (!element)
    return
  if (Math.abs(event.deltaY) >= Math.abs(event.deltaX)) {
    const end = element.scrollWidth - element.clientWidth
    if (!settings.value.enableHorizontalScrolling
      || (event.deltaY < 0 && element.scrollLeft <= 0)
      || (event.deltaY > 0 && element.scrollLeft >= end - 1)) {
      return
    }
  }
  elastic?.handleWheel(event)
}

defineExpose({ getScrollElement: () => scroller.value ?? null })
</script>

<template>
  <div class="horizontal-scroll-view">
    <div ref="scroller" class="horizontal-scroll-view__scroller" @wheel="handleWheel">
      <div ref="track">
        <slot />
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use "../styles/scrollEdgeFade";

.horizontal-scroll-view {
  position: relative;
}

// The scroller reaches past the row on every side so hover lifts and shadows
// of the cards are not clipped; the padding returns the content to its place.
.horizontal-scroll-view__scroller {
  position: relative;
  width: calc(100% + var(--bew-space-10) * 2);
  margin: calc(var(--bew-space-5) * -1) calc(var(--bew-space-10) * -1);
  padding: var(--bew-space-5) var(--bew-space-10);
  overflow: auto hidden;
  overscroll-behavior-x: contain;
  @include scrollEdgeFade.horizontal;
}
</style>
