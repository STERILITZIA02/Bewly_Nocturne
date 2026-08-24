<script setup lang="ts">
type SkeletonRadius = 'sm' | 'control' | 'interactive' | 'media' | 'panel' | 'full' | 'circle'

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
  '--notification-skeleton-width': props.width,
  '--notification-skeleton-height': props.height,
}))
</script>

<template>
  <span
    class="notification-skeleton-block"
    :class="`notification-skeleton-block--${radius}`"
    :style="blockStyle"
    aria-hidden="true"
  />
</template>

<style scoped lang="scss">
.notification-skeleton-block {
  display: block;
  flex: 0 0 auto;
  width: var(--notification-skeleton-width);
  max-width: 100%;
  height: var(--notification-skeleton-height);
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
  animation: notification-skeleton-shimmer 1.4s linear infinite;
}

.notification-skeleton-block--sm {
  border-radius: var(--bew-radius-sm);
  corner-shape: var(--bew-corner-shape);
}

.notification-skeleton-block--control {
  border-radius: var(--bew-control-radius);
  corner-shape: var(--bew-corner-shape-round);
}

.notification-skeleton-block--interactive {
  border-radius: var(--bew-interactive-radius);
  corner-shape: var(--bew-corner-shape);
}

.notification-skeleton-block--media {
  border-radius: var(--bew-media-radius);
  corner-shape: var(--bew-corner-shape);
}

.notification-skeleton-block--panel {
  border-radius: var(--bew-panel-radius);
  corner-shape: var(--bew-corner-shape);
}

.notification-skeleton-block--full {
  border-radius: var(--bew-badge-radius);
  corner-shape: var(--bew-corner-shape-round);
}

.notification-skeleton-block--circle {
  border-radius: 50%;
  corner-shape: var(--bew-corner-shape-round);
}

@keyframes notification-skeleton-shimmer {
  from {
    background-position: 100% 0;
  }

  to {
    background-position: -120% 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .notification-skeleton-block {
    animation: none;
  }
}
</style>
