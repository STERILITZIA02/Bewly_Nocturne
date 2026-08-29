<script setup lang="ts">
type SkeletonRadius = 'sm' | 'control' | 'interactive' | 'media' | 'card' | 'panel' | 'full' | 'circle'

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
</script>

<template>
  <span
    class="bew-skeleton-block"
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
  background:
    linear-gradient(
      100deg,
      transparent 20%,
      color-mix(in oklab, var(--bew-fill-4), transparent 28%) 50%,
      transparent 80%
    ),
    var(--bew-skeleton);
  background-size: 220% 100%;
  animation: bew-skeleton-shimmer 1.4s linear infinite;
}

.bew-skeleton-block--sm {
  border-radius: var(--bew-radius-sm);
  corner-shape: var(--bew-corner-shape);
}

.bew-skeleton-block--control {
  border-radius: var(--bew-control-radius);
  corner-shape: var(--bew-corner-shape-round);
}

.bew-skeleton-block--interactive {
  border-radius: var(--bew-interactive-radius);
  corner-shape: var(--bew-corner-shape);
}

.bew-skeleton-block--media {
  border-radius: var(--bew-media-radius);
  corner-shape: var(--bew-corner-shape);
}

.bew-skeleton-block--card {
  border-radius: var(--bew-card-radius);
  corner-shape: var(--bew-corner-shape);
}

.bew-skeleton-block--panel {
  border-radius: var(--bew-panel-radius);
  corner-shape: var(--bew-corner-shape);
}

.bew-skeleton-block--full {
  border-radius: var(--bew-badge-radius);
  corner-shape: var(--bew-corner-shape-round);
}

.bew-skeleton-block--circle {
  border-radius: 50%;
  corner-shape: var(--bew-corner-shape-round);
}

@keyframes bew-skeleton-shimmer {
  from {
    background-position: 100% 0;
  }

  to {
    background-position: -120% 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .bew-skeleton-block {
    animation: none;
  }
}
</style>
