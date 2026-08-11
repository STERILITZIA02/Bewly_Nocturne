<script lang="ts" setup>
defineProps<{
  modelValue: boolean
  label?: string
  ariaLabel?: string
  disabled?: boolean
}>()

const model = defineModel()
</script>

<template>
  <label
    :class="{ 'is-disabled': disabled }"
    cursor="pointer" pointer="auto" flex items-center gap-3
  >
    <span v-if="label">{{ label }}</span>
    <input v-model="model" type="checkbox" class="radio-input" :disabled="disabled" :aria-label="ariaLabel || label">
    <span class="radio-switch" aria-hidden="true" />
  </label>
</template>

<style lang="scss" scoped>
label {
  --b-switch-width: 44px;
  --b-switch-height: 24px;
  --b-switch-border-width: 1px;
  --b-switch-edge-inset: 2px;
  --b-switch-thumb-size: 20px;

  position: relative;

  &.is-disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
}

.radio-input {
  position: absolute;
  z-index: 1;
  inset: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  cursor: inherit;
  opacity: 0;
}

.radio-switch {
  position: relative;
  display: inline-block;
  box-sizing: border-box;
  width: var(--b-switch-width);
  height: var(--b-switch-height);
  flex: 0 0 auto;
  background: var(--bew-fill-1);
  border: var(--b-switch-border-width) solid var(--bew-surface-border-color);
  border-radius: var(--bew-radius-full);
  corner-shape: round;
  overflow: hidden;

  &::after {
    --b-switch-thumb-offset: 0px;
    --b-switch-thumb-scale: 1;

    position: absolute;
    top: 50%;
    // Absolute horizontal offsets start at the padding edge, so subtract the
    // track border to retain the intended outer-edge inset.
    left: calc(var(--b-switch-edge-inset) - var(--b-switch-border-width));
    width: var(--b-switch-thumb-size);
    height: var(--b-switch-thumb-size);
    aspect-ratio: 1;
    background: white;
    border-radius: 50%;
    corner-shape: round;
    content: "";
    transform: translate(var(--b-switch-thumb-offset), -50%) scale(var(--b-switch-thumb-scale));
  }
}

input[type="checkbox"] {
  &:focus-visible + .radio-switch {
    outline: 2px solid var(--bew-theme-focus-ring);
    outline-offset: var(--bew-space-0-5);
  }

  &:not(:disabled):hover + .radio-switch {
    background: var(--bew-fill-2);
  }

  &:not(:disabled):active + .radio-switch::after {
    --b-switch-thumb-scale: 0.9;
  }

  &:checked + .radio-switch {
    background: var(--bew-theme-color-60);
    border-color: var(--bew-theme-color);
  }

  &:checked:not(:disabled):hover + .radio-switch {
    background: var(--bew-theme-color-80);
    border-color: var(--bew-theme-color);
    box-shadow:
      0 0 6px 2px var(--bew-theme-color-40),
      inset 0 0 6px var(--bew-theme-color-30);
  }

  & + .radio-switch,
  & + .radio-switch::after {
    transition:
      transform 0.25s var(--bew-ease-emphasized, cubic-bezier(0.34, 1.3, 0.64, 1)),
      background-color 0.25s ease,
      border-color 0.25s ease,
      box-shadow 0.25s ease;
  }

  &:checked + .radio-switch::after {
    // Track width minus the thumb and equal outer-edge inset on both sides.
    --b-switch-thumb-offset: calc(
      var(--b-switch-width) - var(--b-switch-thumb-size) - var(--b-switch-edge-inset) - var(--b-switch-edge-inset)
    );
  }
}
</style>
