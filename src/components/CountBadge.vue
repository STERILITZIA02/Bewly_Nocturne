<script setup lang="ts">
const props = defineProps<{ count: number }>()
const count = computed(() => Number.isFinite(props.count) ? Math.max(0, Math.floor(props.count)) : 0)
</script>

<template>
  <span v-if="count > 0" class="bew-count-badge bew-centered-numeral" :aria-label="String(count)"><span>{{ count > 99 ? '99+' : count }}</span></span>
</template>

<style scoped lang="scss">
.bew-count-badge {
  display: inline-flex;
  flex: 0 0 auto;
  box-sizing: border-box;
  align-items: center;
  justify-content: center;
  min-width: var(--bew-space-5);
  height: var(--bew-space-5);
  padding-inline: var(--bew-space-1);
  border-radius: var(--bew-pill-radius);
  corner-shape: var(--bew-corner-shape-capsule);
  background: var(--bew-accent-solid);
  color: var(--bew-on-accent-solid);
  border: 0;
  font-family: var(--bew-fonts-monospace);
  font-variant-numeric: tabular-nums;
  font-size: var(--bew-font-size-caption);
  font-weight: var(--bew-font-weight-regular);
  white-space: nowrap;
  pointer-events: none;
}
</style>
