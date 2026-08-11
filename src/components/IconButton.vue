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
    transform var(--bew-duration-fast) var(--bew-ease-emphasized);

  &:active {
    transform: scale(0.92);
  }

  &:focus-visible {
    outline: 2px solid var(--bew-theme-focus-ring);
    outline-offset: var(--bew-space-0-5);
  }

  :deep(svg) {
    display: block;
    color: currentColor;
  }
}
</style>
