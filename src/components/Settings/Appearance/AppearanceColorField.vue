<script setup lang="ts">
import Input from '~/components/Input.vue'
import { useMeasuredDisclosure } from '~/composables/useMeasuredDisclosure'
import { normalizeHexColor } from '~/utils/themeColor'

const props = withDefaults(defineProps<{
  modelValue: string | null
  label: string
  fallback: string
  swatchColor?: string
  presets?: readonly string[]
  neutral?: boolean
  automatic?: boolean
}>(), { presets: () => [], neutral: false, automatic: false })
const emit = defineEmits<{ 'update:modelValue': [value: string | null] }>()
const editing = ref(false)
const draft = ref(props.modelValue ?? '')
const invalid = ref(false)
let draftGeneration = 0
const optionsOpen = ref(false)
const optionsMounted = ref(false)
const optionsShell = ref<HTMLElement | null>(null)
const optionsBody = ref<HTMLElement | null>(null)
const optionsTrigger = ref<HTMLButtonElement | null>(null)
const optionsId = `appearance-colors-${useId()}`
const disclosure = useMeasuredDisclosure(optionsShell, optionsBody, optionsOpen, () => {
  optionsMounted.value = false
}, () => {})
function toggleOptions() {
  optionsOpen.value = !optionsOpen.value
  if (optionsOpen.value)
    optionsMounted.value = true
}
function closeOptions() {
  optionsOpen.value = false
  optionsTrigger.value?.focus({ preventScroll: true })
}
function cancelDraft() {
  draftGeneration++
  draft.value = props.modelValue ?? ''
  invalid.value = false
  editing.value = false
}
const pickerValue = computed(() => normalizeHexColor(props.modelValue) ?? props.fallback)
watch(() => props.modelValue, (value) => {
  if (!editing.value) {
    draft.value = value ?? ''
    invalid.value = false
  }
})
function edit(value: string | number | undefined) {
  draftGeneration++
  draft.value = String(value ?? '')
  editing.value = true
  invalid.value = false
}
function commit() {
  if (!editing.value)
    return
  const color = normalizeHexColor(draft.value)
  if (!color) {
    invalid.value = true
    return
  }
  invalid.value = false
  editing.value = false
  const generation = ++draftGeneration
  if (color !== props.modelValue)
    emit('update:modelValue', color)
  void nextTick(() => {
    if (generation === draftGeneration && !editing.value)
      draft.value = props.modelValue ?? ''
  })
}
function choose(color: string | null) {
  draftGeneration++
  editing.value = false
  invalid.value = false
  draft.value = color ?? ''
  if (color !== props.modelValue)
    emit('update:modelValue', color)
}
function finishEdit() {
  commit()
  editing.value = false
}
</script>

<template>
  <div class="appearance-color-field">
    <div class="appearance-color-field__value">
      <label class="appearance-color-field__picker" :style="{ background: swatchColor ?? (modelValue === 'neutral' ? 'var(--bew-text-1)' : pickerValue) }">
        <input type="color" :value="pickerValue" :aria-label="label" @change="choose(($event.target as HTMLInputElement).value)">
      </label>
      <Input
        v-if="modelValue !== null && modelValue !== 'neutral'"
        :model-value="draft" class="appearance-color-field__hex" size="small" :maxlength="7"
        :accessible-label="label" :aria-invalid="invalid"
        @update:model-value="edit" @focusin="editing = true" @enter="commit" @blur="finishEdit"
        @keydown.esc.stop.prevent="cancelDraft"
      />
      <span v-else class="appearance-color-field__name">{{ modelValue === 'neutral' ? $t('settings.theme_color_opt.neutral') : $t('settings.visual_style.automatic') }}</span>
      <button v-if="automatic && modelValue !== null" type="button" class="appearance-color-field__reset" @click="choose(null)">
        {{ $t('settings.visual_style.automatic') }}
      </button>
    </div>
    <div v-if="neutral || presets.length" class="appearance-color-field__options">
      <button
        ref="optionsTrigger" type="button" class="appearance-color-field__toggle" :aria-expanded="optionsOpen" :aria-controls="optionsId"
        @click="toggleOptions"
      >
        {{ $t('settings.visual_style.choose_color') }}<i i-tabler:chevron-down />
      </button>
      <div
        v-if="optionsMounted" :id="optionsId" ref="optionsShell" class="appearance-color-field__disclosure" :style="{ height: `${disclosure.height.value ?? 0}px` }"
        :inert="!optionsOpen || undefined" @transitionend="disclosure.onTransitionEnd" @keydown.esc.stop.prevent="closeOptions"
      >
        <div ref="optionsBody" class="appearance-color-field__presets" :aria-label="label">
          <button
            v-if="neutral" type="button" class="appearance-color-field__swatch appearance-color-field__swatch--neutral"
            :aria-label="$t('settings.theme_color_opt.neutral')" :aria-pressed="modelValue === 'neutral'"
            @click="choose('neutral')"
          >
            <i v-if="modelValue === 'neutral'" i-tabler:check />
          </button>
          <button
            v-for="color in presets" :key="color" type="button" class="appearance-color-field__swatch"
            :style="{ '--swatch-color': color }" :aria-label="`${label}: ${color}`" :aria-pressed="modelValue === color"
            @click="choose(color)"
          >
            <i v-if="modelValue === color" i-tabler:check />
          </button>
        </div>
      </div>
    </div>
    <span v-if="invalid" class="bew-help" role="status">{{ $t('settings.visual_style.invalid_color') }}</span>
  </div>
</template>

<style scoped lang="scss">
.appearance-color-field {
  display: grid;
  justify-items: end;
  gap: var(--bew-space-2);
  max-width: 100%;
}
.appearance-color-field__value {
  display: flex;
  align-items: center;
  gap: var(--bew-space-2);
  min-height: var(--bew-control-height);
}
.appearance-color-field__picker {
  position: relative;
  width: var(--bew-icon-size-md);
  height: var(--bew-icon-size-md);
  border-radius: 50%;
  overflow: hidden;
  border: var(--bew-hairline) solid var(--bew-edge-color);
  cursor: pointer;
}
.appearance-color-field__picker input {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: pointer;
}
.appearance-color-field__picker:focus-within {
  box-shadow: 0 0 0 var(--bew-space-1) var(--bew-selected-bg);
}
.appearance-color-field__hex {
  width: 9ch;
  font-variant-numeric: tabular-nums;
}
.appearance-color-field__name {
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-control);
}
.appearance-color-field__reset {
  color: var(--bew-text-2);
  padding: var(--bew-space-1) var(--bew-space-2);
  border-radius: var(--bew-interactive-radius);
  cursor: pointer;
}
.appearance-color-field__reset:is(:hover, :focus-visible) {
  background: var(--bew-hover-bg);
  color: var(--bew-text-1);
}
.appearance-color-field__presets {
  display: flex;
  flex-wrap: wrap;
  justify-content: end;
  gap: var(--bew-space-1);
  max-width: calc(var(--bew-control-height) * 6);
}
.appearance-color-field__toggle {
  display: flex;
  align-items: center;
  justify-content: end;
  gap: var(--bew-space-1);
  padding: var(--bew-space-1) var(--bew-space-2);
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-callout);
  cursor: pointer;
  list-style: none;
  border-radius: var(--bew-interactive-radius);
}
.appearance-color-field__toggle:is(:hover, :focus-visible) {
  color: var(--bew-text-1);
  background: var(--bew-hover-bg);
}
.appearance-color-field__toggle i {
  width: var(--bew-icon-size-xs);
  height: var(--bew-icon-size-xs);
  transition: transform var(--bew-duration-normal) var(--bew-ease-standard);
}
.appearance-color-field__toggle[aria-expanded="true"] i {
  transform: rotate(180deg);
}
.appearance-color-field__presets {
  padding-top: var(--bew-space-2);
}
.appearance-color-field__disclosure {
  overflow: clip;
  transition: height var(--bew-duration-normal) var(--bew-ease-standard);
}
@media (prefers-reduced-motion: reduce) {
  .appearance-color-field__toggle i,
  .appearance-color-field__disclosure {
    transition: none;
  }
}
.appearance-color-field__swatch {
  display: grid;
  place-items: center;
  position: relative;
  width: var(--bew-control-height-sm);
  height: var(--bew-control-height-sm);
  border-radius: var(--bew-interactive-radius);
  cursor: pointer;
}
.appearance-color-field__swatch::before {
  content: "";
  width: var(--bew-icon-size-sm);
  height: var(--bew-icon-size-sm);
  background: var(--swatch-color, var(--bew-text-1));
  border-radius: 50%;
}
.appearance-color-field__swatch:is(:hover, :focus-visible, [aria-pressed="true"]) {
  background: var(--bew-selected-bg);
}
.appearance-color-field__swatch i {
  position: absolute;
  width: var(--bew-icon-size-xs);
  height: var(--bew-icon-size-xs);
  color: var(--bew-text-1);
  background: var(--bew-content-solid);
  border-radius: 50%;
}
</style>
