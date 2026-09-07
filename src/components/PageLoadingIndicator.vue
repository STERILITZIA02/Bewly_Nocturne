<script setup lang="ts">
import SkeletonBlock from '~/components/SkeletonBlock.vue'

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
    <span class="bew-page-loading-indicator__skeleton" aria-hidden="true">
      <SkeletonBlock width="100%" height="var(--bew-space-2)" />
      <SkeletonBlock width="72%" height="var(--bew-space-2)" />
    </span>
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

.bew-page-loading-indicator__skeleton {
  display: grid;
  gap: var(--bew-space-2);
  width: calc(var(--bew-space-12) * 2);
}

.bew-page-loading-indicator__label {
  color: inherit;
}
</style>
