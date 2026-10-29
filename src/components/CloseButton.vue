<script setup lang="ts">
import IconButton from '~/components/IconButton.vue'

// `plain`: a bare × in a window or card corner. `floating`: over embedded
// content (a page or a video), which a bare × could vanish into. `overlay`:
// the image viewer's dark media room.
const props = withDefaults(defineProps<{
  label: string
  size?: 'small' | 'medium' | 'large'
  variant?: 'plain' | 'floating' | 'overlay'
}>(), {
  size: 'medium',
  variant: 'plain',
})
</script>

<template>
  <IconButton
    class="bew-close-button"
    :class="[
      `bew-close-button--${props.size}`,
      `bew-close-button--${props.variant}`,
    ]"
    :shape="props.variant === 'overlay' ? 'circle' : 'smooth-rect'"
    :label="props.label"
  >
    <span class="bew-close-button__icon i-tabler:x" aria-hidden="true" />
  </IconButton>
</template>

<style scoped lang="scss">
// No border in any state (user-specified). The corner nests in its card's: the
// host sets `--bew-close-button-radius` to its radius minus the button's inset
// (see modalWindow.header), and may set `--bew-close-button-size`.
.bew-close-button {
  box-sizing: border-box;
  border: 0;
  box-shadow: none;
  backdrop-filter: none;

  .bew-close-button__icon {
    display: block;
  }
}

.bew-close-button--plain,
.bew-close-button--floating {
  border-radius: var(--bew-close-button-radius, var(--bew-interactive-radius));
}

// Only the × at rest; hover lays a fill under it.
.bew-close-button--plain {
  color: var(--bew-text-2);
  background: transparent;

  &:hover {
    color: var(--bew-text-1);
    background: var(--bew-hover-bg);
  }

  &:active:not(:disabled) {
    background: var(--bew-pressed-bg);
  }
}

.bew-close-button--floating {
  color: var(--bew-text-1);
  background: var(--bew-elevated-solid);
  box-shadow: var(--bew-shadow-2);

  &:hover {
    background: var(--bew-elevated-solid-hover);
  }
}

.bew-close-button--overlay {
  color: var(--bew-on-overlay-color);
  background: var(--bew-overlay-background);

  &:hover {
    color: var(--bew-on-overlay-color);
    background: var(--bew-overlay-background-hover);
  }
}

.bew-close-button--small {
  width: var(--bew-close-button-size, var(--bew-icon-button-size-sm));
  height: var(--bew-close-button-size, var(--bew-icon-button-size-sm));

  .bew-close-button__icon {
    width: var(--bew-icon-size-xs);
    height: var(--bew-icon-size-xs);
  }
}

.bew-close-button--medium {
  width: var(--bew-close-button-size, var(--bew-icon-button-size-md));
  height: var(--bew-close-button-size, var(--bew-icon-button-size-md));

  .bew-close-button__icon {
    width: var(--bew-icon-size-sm);
    height: var(--bew-icon-size-sm);
  }
}

.bew-close-button--large {
  width: var(--bew-close-button-size, var(--bew-icon-button-size-lg));
  height: var(--bew-close-button-size, var(--bew-icon-button-size-lg));

  .bew-close-button__icon {
    width: var(--bew-icon-size-md);
    height: var(--bew-icon-size-md);
  }
}
</style>
