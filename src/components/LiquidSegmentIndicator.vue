<script setup lang="ts">
import { onMounted, ref } from 'vue'

import { useLiquidSegmentIndicator } from '~/composables/useLiquidSegmentIndicator'
import type { MotionScope } from '~/utils/motionPriority'

const props = defineProps<{
  activeKey: unknown
  /** The content swap that waits for this slide (a page or tab transition). */
  motionScope?: MotionScope
}>()

const indicatorRef = ref<HTMLElement | null>(null)
const containerRef = ref<HTMLElement | null>(null)

// The indicator is always a direct child of the measured segmented-control
// container. Resolve it here so callers never repeat ref/composable wiring.
onMounted(() => {
  containerRef.value = indicatorRef.value?.parentElement ?? null
})

const {
  indicatorStyle,
  isMoving,
  updateIndicator,
} = useLiquidSegmentIndicator({
  containerRef,
  indicatorRef,
  activeKey: () => props.activeKey,
  motionScope: props.motionScope,
})

defineExpose({
  updateIndicator,
})
</script>

<template>
  <div
    ref="indicatorRef"
    class="bew-liquid-indicator"
    :class="{ 'is-moving': isMoving }"
    :style="indicatorStyle"
    aria-hidden="true"
  />
</template>
