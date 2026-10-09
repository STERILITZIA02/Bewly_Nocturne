<script setup lang="ts">
withDefaults(defineProps<{
  label: string
  shape?: 'circle' | 'pill' | 'smooth-rect'
}>(), {
  shape: 'circle',
})
</script>

<template>
  <button
    type="button"
    class="bew-icon-button"
    :class="`bew-shape-${shape}`"
    :aria-label="label"
  >
    <slot />
  </button>
</template>

<style scoped lang="scss">
.bew-icon-button {
  appearance: none;
  display: inline-grid;
  flex: 0 0 auto;
  place-items: center;
  padding: 0;
  color: inherit;
  background: none;
  border: 0;
  cursor: pointer;
  transition:
    color var(--bew-duration-fast) var(--bew-ease-standard),
    background-color var(--bew-duration-fast) var(--bew-ease-standard),
    transform var(--bew-duration-fast) var(--bew-ease-standard);

  &:active:not(:disabled) {
    transform: scale(var(--bew-control-press-scale));
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }

  &:focus-visible {
    outline: 2px solid var(--bew-theme-focus-ring);
    outline-offset: var(--bew-space-0-5);
  }

  :deep(svg) {
    display: block;
    color: currentColor;
  }

  &.bew-icon-button--control {
    box-sizing: border-box;
    width: var(--bew-control-height);
    height: var(--bew-control-height);
    background: var(--bew-content-alt-solid);

    &:hover:not(:disabled) {
      background: var(--bew-fill-2);
    }
    :deep(i) {
      width: var(--bew-control-icon-size);
      height: var(--bew-control-icon-size);
    }
  }
}

@media (prefers-reduced-motion: reduce) {
  .bew-icon-button {
    transition-property: color, background-color;

    &:active:not(:disabled) {
      transform: none;
    }
  }
}
</style>
