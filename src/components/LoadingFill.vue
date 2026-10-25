<script setup lang="ts">
import LoadingRing from '~/components/LoadingRing.vue'

/**
 * The middle of a region whose result count is unknown (a search, a filter
 * scan): only the ring, no skeletons or progress text. The owner keeps it
 * mounted while its `useLoadingRingPhase` is not idle, so the ring closes
 * before the results, an empty state or an error take its place.
 * `bew-empty--fill` lets workspace layouts stretch it like a filling empty state.
 */
defineProps<{ loading: boolean }>()
</script>

<template>
  <div class="bew-loading-fill bew-empty--fill" role="status" :aria-label="loading ? $t('common.loading') : undefined" :aria-busy="loading">
    <LoadingRing :loading="loading" size="var(--bew-icon-size-xl)" />
  </div>
</template>

<style scoped>
.bew-loading-fill {
  display: grid;
  flex: 1;
  align-self: stretch;
  place-items: center;
  min-height: 240px;
  color: var(--bew-text-2);
}
</style>
