<script lang="ts" setup>
import { FORM_FIELD_LABEL_ID } from '~/components/formFieldLabel'

type Size = 'small' | 'medium' | 'large'
interface Props {
  size?: Size
  type?: 'text' | 'password' | 'email' | 'number'
  min?: number
  max?: number
  maxlength?: number
  placeholder?: string
}
const props = withDefaults(defineProps<Props>(), { size: 'medium' })

const emit = defineEmits(['enter', 'blur'])

const fieldLabelId = inject(FORM_FIELD_LABEL_ID, undefined)
const modelValue = defineModel<string | number>()

const inputRef = ref<HTMLInputElement | null>(null)

const height = computed(() => {
  if (props.size === 'small')
    return 'var(--bew-control-height-sm)'
  if (props.size === 'medium')
    return 'var(--bew-control-height)'
  if (props.size === 'large')
    return 'var(--bew-control-height-lg)'
  return 'var(--bew-control-height)'
})

const padding = computed(() => {
  if (props.size === 'small')
    return '0 var(--bew-space-2)'
  return '0 var(--bew-space-3)'
})

function focus() {
  inputRef.value?.focus()
}

function handleEnter(event: KeyboardEvent) {
  if (!event.isComposing && event.keyCode !== 229)
    emit('enter')
}

defineExpose({ focus })
</script>

<template>
  <div
    class="b-input"
    :class="`b-input--${size}`"
    :style="{ height, padding }"
    focus-within:ring="2px $bew-theme-focus-ring"
    p="x-4"
    rounded="$bew-interactive-radius" border="1 $bew-surface-border-color" box-border
    transition="border-color duration-300, background-color duration-300, box-shadow duration-300"
    bg="$bew-fill-1" flex="~ gap-2"
  >
    <div v-if="$slots.prefix" class="prefix">
      <div>
        <slot name="prefix" />
      </div>
    </div>

    <input
      ref="inputRef"
      v-model="modelValue"
      :style="{ lineHeight: height }"
      :type="type"
      :min="min"
      :max="max"
      :maxlength="maxlength"
      :placeholder="placeholder"
      :aria-labelledby="fieldLabelId"
      w-inherit min-w-0 h-inherit
      outline-none flex-1 bg-transparent
      @keydown.enter="handleEnter"
      @blur="$emit('blur')"
    >

    <div v-if="$slots.suffix" class="suffix">
      <div>
        <slot name="suffix" />
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.prefix,
.suffix {
  --uno: "flex items-center";

  flex: 0 0 auto;
  white-space: nowrap;
}

.b-input input {
  color: var(--bew-text-1);
  font-size: var(--bew-font-size-body);
  font-weight: var(--bew-font-weight-regular);
  line-height: var(--bew-line-height-body);

  &:focus-visible {
    outline: none;
  }
}

.b-input--small input {
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);
}
</style>
