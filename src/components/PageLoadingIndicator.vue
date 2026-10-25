<script setup lang="ts">
import LoadingRing from '~/components/LoadingRing.vue'

// The label is announced, not shown: a load of unknown length shows only the ring.

withDefaults(defineProps<{
  label?: string
  announce?: boolean
  loading?: boolean
}>(), {
  label: '',
  announce: true,
  loading: true,
})
</script>

<template>
  <div
    class="bew-page-loading-indicator"
    :role="announce ? 'status' : undefined"
    :aria-label="announce && label && loading ? label : undefined"
  >
    <LoadingRing :loading="loading" size="var(--bew-icon-size-sm)" />
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
</style>
