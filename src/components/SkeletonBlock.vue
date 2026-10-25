<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import { observeSkeletonGroup } from '~/utils/skeletonVisibility'

type SkeletonRadius = 'sm' | 'half' | 'control' | 'interactive' | 'media' | 'card' | 'panel' | 'full' | 'circle'

const props = withDefaults(defineProps<{
  width?: string
  height?: string
  radius?: SkeletonRadius
}>(), {
  width: '100%',
  height: 'var(--bew-space-4)',
  radius: 'sm',
})

const blockStyle = computed(() => ({
  '--bew-skeleton-block-width': props.width,
  '--bew-skeleton-block-height': props.height,
}))
const block = ref<HTMLElement>()
let releaseVisibility: (() => void) | undefined
onMounted(() => {
  if (block.value)
    releaseVisibility = observeSkeletonGroup(block.value)
})
onBeforeUnmount(() => releaseVisibility?.())
</script>

<template>
  <span
    ref="block"
    class="bew-skeleton-block"
    data-bew-skeleton
    :class="`bew-skeleton-block--${radius}`"
    :style="blockStyle"
    aria-hidden="true"
  />
</template>

<style scoped lang="scss">
.bew-skeleton-block {
  display: block;
  flex: 0 0 auto;
  width: var(--bew-skeleton-block-width);
  max-width: 100%;
  height: var(--bew-skeleton-block-height);
  overflow: hidden;
}

.bew-skeleton-block--sm {
  border-radius: var(--bew-radius-tiny);
  corner-shape: var(--bew-corner-shape);
}
.bew-skeleton-block--half {
  border-radius: var(--bew-interactive-radius);
  corner-shape: var(--bew-corner-shape);
}

.bew-skeleton-block--control {
  border-radius: var(--bew-control-radius);
  corner-shape: var(--bew-corner-shape-capsule);
}

.bew-skeleton-block--interactive {
  border-radius: var(--bew-interactive-radius);
  corner-shape: var(--bew-corner-shape);
}

.bew-skeleton-block--media {
  border-radius: var(--bew-thumb-radius);
  corner-shape: var(--bew-corner-shape);
}

.bew-skeleton-block--card {
  border-radius: var(--bew-surface-radius);
  corner-shape: var(--bew-corner-shape);
}

.bew-skeleton-block--panel {
  border-radius: var(--bew-surface-radius);
  corner-shape: var(--bew-corner-shape);
}

.bew-skeleton-block--full {
  border-radius: var(--bew-pill-radius);
  corner-shape: var(--bew-corner-shape-capsule);
}

.bew-skeleton-block--circle {
  border-radius: 50%;
  corner-shape: var(--bew-corner-shape-round);
}
</style>
