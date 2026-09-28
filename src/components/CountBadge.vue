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
  background: var(--bew-theme-color);
  color: var(--bew-on-theme-color);
  font-size: var(--bew-font-size-caption);
  font-weight: var(--bew-font-weight-semibold);
  line-height: var(--bew-line-height-caption);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  pointer-events: none;
}
</style>
