<script setup lang="ts">
withDefaults(defineProps<{
  label?: string
  announce?: boolean
}>(), {
  label: '',
  announce: true,
})
</script>

<template>
  <div
    class="bew-page-loading-indicator"
    :role="announce ? 'status' : undefined"
    :aria-label="announce && label ? label : undefined"
  >
    <span class="bew-page-loading-indicator__spinner" aria-hidden="true" />
    <span v-if="label" class="bew-page-loading-indicator__label">{{ label }}</span>
  </div>
</template>

<style scoped lang="scss">
.bew-page-loading-indicator {
  display: inline-flex;
  min-height: var(--bew-control-height);
  align-items: center;
  justify-content: center;
  gap: var(--bew-space-2);
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);
}

.bew-page-loading-indicator__spinner {
  width: var(--bew-icon-size-lg);
  height: var(--bew-icon-size-lg);
  box-sizing: border-box;
  flex: 0 0 auto;
  border: 2px solid var(--bew-theme-color-20);
  border-top-color: var(--bew-theme-foreground);
  border-radius: 50%;
  corner-shape: var(--bew-corner-shape-round);
  animation: bew-page-loading-spin 720ms linear infinite;
}

.bew-page-loading-indicator__label {
  color: inherit;
}

@keyframes bew-page-loading-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .bew-page-loading-indicator__spinner {
    border-color: var(--bew-theme-foreground);
    animation: none;
  }
}
</style>
