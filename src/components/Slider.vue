<script lang="ts" setup>
import { FORM_FIELD_LABEL_ID } from '~/components/formFieldLabel'
import { clampRangeValue, getRangeProgress } from '~/utils/range'

interface Props {
  min?: number
  max?: number
  step?: number | string
  modelValue: number
  label: string
}
const props = withDefaults(defineProps<Props>(), {
  min: 0,
  max: 100,
  step: 1,
})

const emit = defineEmits<{
  (event: 'update:modelValue', value: number): void
}>()

const fieldLabelId = inject(FORM_FIELD_LABEL_ID, undefined)

const model = computed({
  get: () => clampRangeValue(props.modelValue, props.min, props.max),
  set: value => emit('update:modelValue', clampRangeValue(Number(value), props.min, props.max)),
})
const sliderStyle = computed(() => ({
  '--slider-progress': `${getRangeProgress(props.modelValue, props.min, props.max)}%`,
}))
</script>

<template>
  <label cursor-pointer flex items-center gap-3 w="$b-slider-width">
    <input
      v-model.number="model"
      type="range"
      :min="min"
      :max="max"
      :step="step"
      :aria-labelledby="fieldLabelId"
      :style="sliderStyle"
      class="slider"
      appearance-none outline-none rounded="$b-slider-height"
      border="size-$b-border-width color-$bew-border-color" w="$b-slider-width" h="$b-slider-height"
    >
    <span>{{ label }}</span>
  </label>
</template>

<style lang="scss" scoped>
label {
  --b-border-width: 2px;
  --b-slider-height: 10px;
  --b-slider-width: 100%;
  --b-thumb-width: calc(20px - var(--b-border-width));
  --b-thumb-height: calc(20px - var(--b-border-width));
}

.slider {
  background: linear-gradient(
    to right,
    var(--bew-theme-color) 0,
    var(--bew-theme-color) var(--slider-progress),
    var(--bew-fill-1) var(--slider-progress),
    var(--bew-fill-1) 100%
  );
}

input[type="range"] {
  &::-webkit-slider-thumb {
    --uno: "appearance-none w-$b-thumb-height h-$b-thumb-height bg-white rounded-$b-thumb-height";
    --uno: "ring-$bew-border-color ring-2 cursor-pointer duration-300";
    corner-shape: var(--bew-corner-shape-round);
  }

  &::-webkit-slider-thumb:hover {
    --uno: "ring-$bew-theme-focus-ring";
  }
}
</style>
