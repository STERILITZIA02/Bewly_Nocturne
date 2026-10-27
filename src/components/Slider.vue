<script lang="ts" setup>
import { FORM_FIELD_LABEL_ID } from '~/components/formFieldLabel'
import Input from '~/components/Input.vue'
import { clampRangeValue, getRangeProgress } from '~/utils/range'

interface Props {
  min?: number
  max?: number
  step?: number | string
  modelValue: number
  label?: string
  editable?: boolean
  unit?: string
  accessibleLabel?: string
  commitOnChange?: boolean
}
const props = withDefaults(defineProps<Props>(), {
  min: 0,
  max: 100,
  step: 1,
  editable: false,
})

const emit = defineEmits<{
  (event: 'update:modelValue', value: number): void
}>()

const fieldLabelId = inject(FORM_FIELD_LABEL_ID, undefined)
const rangeDraft = ref<number>()

const model = computed({
  get: () => clampRangeValue(rangeDraft.value ?? props.modelValue, props.min, props.max),
  set: (value) => {
    const next = clampRangeValue(Number(value), props.min, props.max)
    if (next !== props.modelValue)
      emit('update:modelValue', next)
  },
})
const rangeModel = computed({
  get: () => model.value,
  set: (value: number) => {
    if (props.commitOnChange)
      rangeDraft.value = clampRangeValue(value, props.min, props.max)
    else model.value = value
  },
})
function commitRange() {
  if (rangeDraft.value === undefined)
    return
  model.value = rangeDraft.value
  rangeDraft.value = undefined
}
watch(() => props.modelValue, () => {
  rangeDraft.value = undefined
})
const editing = ref(false)
const draft = ref(String(model.value))
const displayedLabel = computed(() => props.label ?? `${model.value}${props.unit ?? ''}`)
function decimals(value: number | string) {
  const [mantissa, exponent = '0'] = String(value).toLowerCase().split('e')
  return Math.max(0, (mantissa.split('.')[1]?.length ?? 0) - Number(exponent))
}
function normalize(value: number) {
  const step = Number(props.step)
  const bounded = clampRangeValue(value, props.min, props.max)
  if (props.step === 'any' || !Number.isFinite(step) || step <= 0)
    return bounded
  const stepped = props.min + Math.round((bounded - props.min) / step) * step
  return clampRangeValue(Number(stepped.toFixed(Math.max(decimals(step), decimals(props.min)))), props.min, props.max)
}
function edit(value: string | number | undefined) {
  draft.value = String(value ?? '')
  // Text input preserves transient '-', '.', and '1.' that number inputs sanitize.
  if (!/^[+-]?(?:\d+|\d*\.\d+)$/.test(draft.value))
    return
  const parsed = Number(draft.value)
  if (Number.isFinite(parsed) && normalize(parsed) === parsed)
    model.value = parsed
}
function commitDraft() {
  const parsed = draft.value.trim() ? Number(draft.value) : Number.NaN
  const next = Number.isFinite(parsed) ? normalize(parsed) : model.value
  model.value = next
  draft.value = String(next)
}
function finishEdit() {
  commitDraft()
  editing.value = false
}
function stepDraft(event: KeyboardEvent) {
  if (event.isComposing || !['ArrowUp', 'ArrowDown'].includes(event.key))
    return
  event.preventDefault()
  const parsed = Number(draft.value)
  const next = normalize((draft.value.trim() && Number.isFinite(parsed) ? parsed : model.value) + (event.key === 'ArrowUp' ? 1 : -1) * (Number(props.step) || 1))
  model.value = next
  draft.value = String(next)
}
watch(model, (value) => {
  if (!editing.value)
    draft.value = String(value)
})
const sliderStyle = computed(() => ({
  '--slider-progress': `${getRangeProgress(model.value, props.min, props.max)}%`,
}))
const labelWidthSample = computed(() => {
  const label = displayedLabel.value
  const numbers = [...label.matchAll(/[−+-]?(?:\d+(?:\.\d*)?|\.\d+)/g)]
  const number = numbers.findLast(match => Number(match[0].replace('−', '-')) === props.modelValue) ?? numbers.at(-1)
  if (!number)
    return label
  const precision = Math.max(decimals(number[0]), decimals(props.min), decimals(props.max), props.step === 'any' ? 0 : decimals(props.step))
  const digits = String(Math.trunc(Math.max(Math.abs(props.min), Math.abs(props.max)))).length
  const sign = props.min < 0 || /^[−-]/.test(number[0]) ? '−' : number[0].startsWith('+') ? '+' : ''
  const sample = sign + '0'.repeat(digits) + (precision ? `.${'0'.repeat(precision)}` : '')
  return label.slice(0, number.index) + sample + label.slice(number.index + number[0].length)
})
</script>

<template>
  <component
    :is="editable ? 'div' : 'label'" class="b-slider" :class="{ 'cursor-pointer': !editable }" flex items-center
    gap-3 w="$b-slider-width"
  >
    <input
      v-model.number="rangeModel"
      type="range"
      :min="min"
      :max="max"
      :step="step"
      :aria-label="accessibleLabel"
      :aria-labelledby="accessibleLabel ? undefined : fieldLabelId"
      :style="sliderStyle"
      class="slider"
      appearance-none outline-none rounded="$b-slider-height"
      border="size-$b-border-width color-$bew-separator-color" w="$b-slider-width"
      h="$b-slider-height" @change="commitRange" @pointercancel="rangeDraft = undefined"
    >
    <Input
      v-if="editable" :model-value="draft" class="slider-editor" size="small" type="text"
      inputmode="decimal"
      :min="min" :max="max" :step="step === 'any' ? 'any' : Number(step)" :accessible-label="accessibleLabel"
      @update:model-value="edit" @focusin="editing = true" @enter="commitDraft" @blur="finishEdit" @keydown="stepDraft"
    >
      <template v-if="unit" #suffix>
        <span class="slider-unit">{{ unit }}</span>
      </template>
    </Input>
    <span v-else class="slider-label">
      <span class="slider-label__sizer" aria-hidden="true">{{ labelWidthSample }}</span>
      <span>{{ displayedLabel }}</span>
    </span>
  </component>
</template>

<style lang="scss" scoped>
.b-slider {
  --b-border-width: 2px;
  --b-slider-height: 10px;
  --b-slider-width: 100%;
  --b-thumb-width: calc(20px - var(--b-border-width));
  --b-thumb-height: calc(20px - var(--b-border-width));
}

.slider {
  min-width: 0;
  flex: 1;
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

.slider-editor {
  flex: 0 0 7em;
  min-width: 0;
  :deep(input) {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
}
.slider-unit {
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-control);
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
