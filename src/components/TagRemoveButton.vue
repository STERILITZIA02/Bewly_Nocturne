<script setup lang="ts">
import { Icon } from '@iconify/vue'

import IconButton from '~/components/IconButton.vue'

defineProps<{
  label: string
}>()
</script>

<template>
  <IconButton class="bew-tag-remove-button" :label="label">
    <Icon icon="mingcute:close-line" aria-hidden="true" />
  </IconButton>
</template>

<style scoped lang="scss">
.bew-tag-remove-button {
  width: 24px;
  height: 24px;
  margin-left: var(--bew-space-1);
  color: var(--bew-text-2);
  background: transparent;
  opacity: 0.6;

  &:hover {
    color: var(--bew-theme-foreground);
    background: var(--bew-theme-color-20);
    opacity: 1;
  }

  svg {
    width: 12px;
    height: 12px;
  }
}
</style>
