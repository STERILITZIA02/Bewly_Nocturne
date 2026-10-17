<script setup lang="ts">
const props = defineProps<{ count: number }>()
const count = computed(() => Number.isFinite(props.count) ? Math.max(0, Math.floor(props.count)) : 0)
</script>

<template>
  <span v-if="count > 0" class="bew-count-badge" :aria-label="String(count)">{{ count > 99 ? '99+' : count }}</span>
</template>

<style scoped lang="scss">
.bew-count-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  flex: 0 0 auto;
  min-width: var(--bew-space-5);
  height: var(--bew-space-5);
  padding-inline: var(--bew-space-1);
  border-radius: var(--bew-badge-radius);
  corner-shape: var(--bew-corner-shape-round);
  // Solid fallback for browsers without backdrop filtering.
  background: var(--bew-elevated-solid);
  color: var(--bew-text-1);
  font-size: var(--bew-font-size-caption);
  font-weight: var(--bew-font-weight-medium);
  line-height: var(--bew-line-height-caption);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  pointer-events: none;

  // Explicitly requested for the Dock and top-bar unread capsules, including
  // over the Dock's glass shell; do not generalize this to other nested controls.
  @supports (backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)) {
    background: var(--bew-count-badge-bg);
    backdrop-filter: var(--bew-filter-glass-1);
    -webkit-backdrop-filter: var(--bew-filter-glass-1);
  }
}
</style>
