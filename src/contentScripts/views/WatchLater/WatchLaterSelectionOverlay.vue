<script setup lang="ts">
defineProps<{ label: string, selected: boolean, disabled?: boolean }>()
defineEmits<{ (event: 'toggle'): void }>()
</script>

<template>
  <label class="watch-later-selection">
    <input type="checkbox" :checked="selected" :disabled="disabled" :aria-label="label" @change="$emit('toggle')">
    <span class="watch-later-selection__mark" aria-hidden="true">
      <i i-tabler:check />
    </span>
  </label>
</template>

<style scoped lang="scss">
.watch-later-selection {
  position: absolute;
  inset: 0;
  z-index: 3;
  border-radius: var(--bew-surface-radius);
  corner-shape: var(--bew-corner-shape);
}
.watch-later-selection input {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  opacity: 0;
  cursor: pointer;
}
.watch-later-selection__mark {
  position: absolute;
  top: var(--bew-space-3);
  right: var(--bew-space-3);
  display: grid;
  place-items: center;
  box-sizing: border-box;
  width: var(--bew-space-6);
  height: var(--bew-space-6);
  border: 1px solid var(--bew-surface-border-color);
  border-radius: var(--bew-interactive-radius);
  color: var(--bew-text-1);
  background: var(--bew-content-solid);
  pointer-events: none;
  transition: background-color var(--bew-duration-fast) var(--bew-ease-standard);
  animation: selection-mark-enter var(--bew-duration-fast) var(--bew-ease-standard);
}
.watch-later-selection__mark i {
  font-size: var(--bew-icon-size-md);
  opacity: 0;
  transform: scale(0.8);
  transition:
    opacity var(--bew-duration-fast) var(--bew-ease-standard),
    transform var(--bew-duration-fast) var(--bew-ease-standard);
}
.watch-later-selection input:checked + .watch-later-selection__mark i {
  opacity: 1;
  transform: scale(1);
}
@keyframes selection-mark-enter {
  from {
    opacity: 0;
    transform: scale(0.9);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}
.watch-later-selection input:checked + .watch-later-selection__mark {
  color: var(--bew-on-theme-color);
  background: var(--bew-theme-color);
}
.watch-later-selection input:hover:not(:checked):not(:disabled) + .watch-later-selection__mark {
  background: var(--bew-content-solid-hover);
}
.watch-later-selection:has(input:focus-visible) {
  outline: var(--bew-focus-ring);
  outline-offset: var(--bew-space-0-5);
}
.watch-later-selection input:disabled {
  cursor: not-allowed;
}
.watch-later-selection input:disabled + .watch-later-selection__mark {
  opacity: 0.5;
}
@media (prefers-reduced-motion: reduce) {
  .watch-later-selection__mark,
  .watch-later-selection__mark i {
    transition: none;
    animation: none;
  }
}
</style>
