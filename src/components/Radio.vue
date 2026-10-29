<script lang="ts" setup>
import { FORM_FIELD_LABEL_ID } from '~/components/formFieldLabel'
import { useMotionValue } from '~/composables/useMotionValue'
import { holdMotion } from '~/utils/motionPriority'
import { getMotionDuration } from '~/utils/motionTiming'
import { prefersReducedMotion } from '~/utils/reducedMotion'

const props = defineProps<{
  modelValue: boolean
  label?: string
  accessibleLabel?: string
  disabled?: boolean
  commitAfterMotion?: boolean
}>()

const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()

const fieldLabelId = inject(FORM_FIELD_LABEL_ID, undefined)

const switchRef = ref<HTMLElement>()
let releaseMotion: (() => void) | undefined
const deferred = props.commitAfterMotion ? useMotionValue(() => props.modelValue, value => emit('update:modelValue', value)) : undefined
const model = computed({
  get: () => deferred?.value ?? props.modelValue,
  set: (value: boolean) => {
    if (props.disabled || value === model.value)
      return
    if (!deferred) {
      emit('update:modelValue', value)
      return
    }
    const previous = releaseMotion
    releaseMotion = holdMotion(prefersReducedMotion() || !switchRef.value ? 0 : getMotionDuration(getComputedStyle(switchRef.value), '--bew-duration-normal'))
    previous?.()
    deferred.value = value
  },
})
onScopeDispose(() => releaseMotion?.())
</script>

<template>
  <label cursor="pointer" pointer="auto" flex items-center gap-3>
    <span v-if="label">{{ label }}</span>
    <input
      v-model="model" type="checkbox" class="radio-input"
      :disabled="disabled"
      :aria-label="accessibleLabel"
      :aria-labelledby="label || accessibleLabel ? undefined : fieldLabelId"
    >
    <span ref="switchRef" class="radio-switch" aria-hidden="true" />
  </label>
</template>

<style lang="scss" scoped>
label {
  --b-switch-width: 44px;
  --b-switch-height: 24px;
  --b-switch-border-width: var(--bew-hairline);
  --b-switch-edge-inset: 2px;
  --b-switch-thumb-size: 20px;

  position: relative;
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
  border: var(--b-switch-border-width) solid var(--bew-edge-color);
  border-radius: var(--bew-pill-radius);
  corner-shape: var(--bew-corner-shape-capsule);
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
    // Nested in the track's end: the capsule shape keeps the gap even.
    corner-shape: var(--bew-corner-shape-capsule);
    content: "";
    transform: translate(var(--b-switch-thumb-offset), -50%) scale(var(--b-switch-thumb-scale));
  }
}

input[type="checkbox"] {
  &:disabled {
    cursor: not-allowed;
  }

  &:disabled + .radio-switch {
    opacity: 0.5;
  }
  &:focus-visible + .radio-switch {
    outline: var(--bew-focus-ring, 1px solid CanvasText);
    outline-offset: var(--bew-space-0-5);
    background: var(--bew-fill-3);
  }

  &:hover + .radio-switch {
    background: var(--bew-fill-2);
  }

  &:active + .radio-switch::after {
    --b-switch-thumb-scale: 0.9;
  }

  &:checked + .radio-switch {
    background: var(--bew-theme-color);
  }

  &:checked:hover + .radio-switch {
    background: var(--bew-theme-color);
    box-shadow: var(--bew-shadow-1);
  }

  &:checked:focus-visible + .radio-switch {
    background: color-mix(in srgb, var(--bew-theme-color), var(--bew-switch-thumb-active) 16%);
  }

  & + .radio-switch,
  & + .radio-switch::after {
    transition:
      transform var(--bew-duration-normal) var(--bew-ease-standard),
      background-color var(--bew-duration-normal) var(--bew-ease-standard),
      border-color var(--bew-duration-normal) var(--bew-ease-standard),
      box-shadow var(--bew-duration-normal) var(--bew-ease-standard);
  }

  &:checked + .radio-switch::after {
    // This is a non-text shape: retain the white thumb when it has 3:1 contrast,
    // switching only for pale tracks instead of borrowing the text foreground.
    background: var(--bew-switch-thumb-active);
    // Track width minus the thumb and equal outer-edge inset on both sides.
    --b-switch-thumb-offset: calc(
      var(--b-switch-width) - var(--b-switch-thumb-size) - var(--b-switch-edge-inset) - var(--b-switch-edge-inset)
    );
  }
}

@media (prefers-reduced-motion: reduce) {
  input[type="checkbox"] {
    & + .radio-switch,
    & + .radio-switch::after {
      transition-property: background-color, border-color, box-shadow;
    }

    &:active + .radio-switch::after {
      --b-switch-thumb-scale: 1;
    }
  }
}
</style>
