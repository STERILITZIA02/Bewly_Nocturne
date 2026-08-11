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
  width: var(--bew-icon-button-size-sm);
  height: var(--bew-icon-button-size-sm);

  svg {
    width: var(--bew-icon-size-xs);
    height: var(--bew-icon-size-xs);
  }
}

.bew-close-button--medium {
  width: var(--bew-icon-button-size-md);
  height: var(--bew-icon-button-size-md);

  svg {
    width: var(--bew-icon-size-sm);
    height: var(--bew-icon-size-sm);
  }
}

.bew-close-button--large {
  width: var(--bew-icon-button-size-lg);
  height: var(--bew-icon-button-size-lg);

  svg {
    width: var(--bew-icon-size-md);
    height: var(--bew-icon-size-md);
  }
}

.bew-close-button--overlay {
  color: var(--bew-on-overlay-color);
  background: var(--bew-overlay-background);
  border-color: transparent;
  box-shadow: none;
  backdrop-filter: none;

  &:hover {
    color: var(--bew-on-overlay-color);
    background: var(--bew-overlay-background-hover);
  }
}
</style>
