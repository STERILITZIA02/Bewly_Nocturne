<script setup lang="ts">
import IconButton from '~/components/IconButton.vue'

defineProps<{
  label: string
}>()
</script>

<template>
  <IconButton class="bew-tag-remove-button" :label="label">
    <span class="bew-tag-remove-button__icon i-tabler:x" aria-hidden="true" />
  </IconButton>
</template>

<style scoped lang="scss">
.bew-tag-remove-button {
  width: var(--bew-icon-button-size-sm);
  height: var(--bew-icon-button-size-sm);
  margin-left: var(--bew-space-1);
  color: var(--bew-text-2);
  background: transparent;
  opacity: 0.6;

  &:hover {
    color: var(--bew-text-1);
    background: var(--bew-pressed-bg);
    opacity: 1;
  }

  .bew-tag-remove-button__icon {
    width: 12px;
    height: 12px;
  }
}
</style>
