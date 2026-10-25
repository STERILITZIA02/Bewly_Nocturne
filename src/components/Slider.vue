<script lang="ts" setup>
import { FORM_FIELD_LABEL_ID } from '~/components/formFieldLabel'
import { clampRangeValue, getRangeProgress } from '~/utils/range'

interface Props {
  min?: number
  max?: number
  step?: number | string
  modelValue: number
  label: string
  accessibleLabel?: string
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
const labelWidthSample = computed(() => {
  const numbers = [...props.label.matchAll(/[−+-]?(?:\d+(?:\.\d*)?|\.\d+)/g)]
  const number = numbers.findLast(match => Number(match[0].replace('−', '-')) === props.modelValue) ?? numbers.at(-1)
  if (!number)
    return props.label
  const decimals = (value: number | string) => {
    const [mantissa, exponent = '0'] = String(value).toLowerCase().split('e')
    return Math.max(0, (mantissa.split('.')[1]?.length ?? 0) - Number(exponent))
  }
  const precision = Math.max(decimals(number[0]), decimals(props.min), decimals(props.max), props.step === 'any' ? 0 : decimals(props.step))
  const digits = String(Math.trunc(Math.max(Math.abs(props.min), Math.abs(props.max)))).length
  const sign = props.min < 0 || /^[−-]/.test(number[0]) ? '−' : number[0].startsWith('+') ? '+' : ''
  const sample = sign + '0'.repeat(digits) + (precision ? `.${'0'.repeat(precision)}` : '')
  return props.label.slice(0, number.index) + sample + props.label.slice(number.index + number[0].length)
})
</script>

<template>
  <label cursor-pointer flex items-center gap-3 w="$b-slider-width">
    <input
      v-model.number="model"
      type="range"
      :min="min"
      :max="max"
      :step="step"
      :aria-label="accessibleLabel"
      :aria-labelledby="accessibleLabel ? undefined : fieldLabelId"
      :style="sliderStyle"
      class="slider"
      appearance-none outline-none rounded="$b-slider-height"
      border="size-$b-border-width color-$bew-separator-color" w="$b-slider-width" h="$b-slider-height"
    >
    <span class="slider-label">
      <span class="slider-label__sizer" aria-hidden="true">{{ labelWidthSample }}</span>
      <span>{{ label }}</span>
    </span>
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
  // The gradient uses the padding box. Repeating it into the border box paints
  // a second strip of theme color at the far end of the otherwise empty track.
  background-repeat: no-repeat;
  background-clip: padding-box;
  corner-shape: var(--bew-corner-shape-capsule);
  background-image: linear-gradient(
    to right,
    var(--bew-theme-color) 0,
    var(--bew-theme-color) var(--slider-progress),
    var(--bew-fill-1) var(--slider-progress),
    var(--bew-fill-1) 100%
  );
}

.slider-label {
  display: grid;
  flex: none;
  text-align: right;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;

  > span {
    grid-area: 1 / 1;
  }

  &__sizer {
    visibility: hidden;
  }
}

input[type="range"] {
  &::-webkit-slider-thumb {
    --uno: "appearance-none w-$b-thumb-height h-$b-thumb-height bg-white rounded-$b-thumb-height";
    --uno: "ring-$bew-separator-color ring-1 cursor-pointer duration-300";
    corner-shape: var(--bew-corner-shape-round);
  }

  &::-webkit-slider-thumb:hover {
    --uno: "ring-$bew-focus-ring-color";
  }
}
</style>
