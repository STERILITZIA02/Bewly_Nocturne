<script setup lang="ts">
import { Icon } from '@iconify/vue'

import IconButton from '~/components/IconButton.vue'

withDefaults(defineProps<{
  label: string
  size?: 'small' | 'medium' | 'large'
  variant?: 'surface' | 'overlay'
}>(), {
  size: 'medium',
  variant: 'surface',
})
</script>

<template>
  <IconButton
    class="bew-close-button"
    :class="[
      `bew-close-button--${size}`,
      `bew-close-button--${variant}`,
    ]"
    :label="label"
  >
    <Icon icon="mingcute:close-line" aria-hidden="true" />
  </IconButton>
</template>

<style scoped lang="scss">
.bew-close-button {
  color: var(--bew-text-1);
  background: var(--bew-elevated-solid);
  box-sizing: border-box;
  border: 1px solid var(--bew-surface-border-color);
  box-shadow: var(--bew-shadow-edge-glow-1), var(--bew-shadow-2);
  backdrop-filter: var(--bew-filter-glass-1);
  &:hover {
    color: var(--bew-theme-foreground);
    background: var(--bew-elevated-solid-hover);
  }

  svg {
    display: block;
    color: currentColor;
  }
}

.bew-close-button--small {
  width: 24px;
  height: 24px;

  svg {
    width: 14px;
    height: 14px;
  }
}

.bew-close-button--medium {
  width: 32px;
  height: 32px;

  svg {
    width: 16px;
    height: 16px;
  }
}

.bew-close-button--large {
  width: 44px;
  height: 44px;

  svg {
    width: 20px;
    height: 20px;
  }
}

.bew-close-button--overlay {
  color: white;
  background: rgb(0 0 0 / 72%);
  border-color: transparent;
  box-shadow: none;
  backdrop-filter: none;

  &:hover {
    color: white;
    background: rgb(0 0 0 / 84%);
  }
}
</style>
