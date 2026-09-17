<script setup lang="ts" generic="T extends string">
import LiquidSegmentIndicator from '~/components/LiquidSegmentIndicator.vue'

const props = defineProps<{
  modelValue: T
  options: readonly { label: string, value: T }[]
  label: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: T]
  'change': [value: T]
}>()

function selectOption(value: T) {
  emit('update:modelValue', value)
  emit('change', value)
}

function handleKeydown(event: KeyboardEvent, index: number) {
  const direction = ['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : ['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 0
  const targetIndex = event.key === 'Home' ? 0 : event.key === 'End' ? props.options.length - 1 : (index + direction + props.options.length) % props.options.length
  if (!direction && event.key !== 'Home' && event.key !== 'End')
    return
  event.preventDefault()
  selectOption(props.options[targetIndex].value)
  const group = (event.currentTarget as HTMLElement).parentElement
  group?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[targetIndex]?.focus()
}
</script>

<template>
  <div
    class="settings-segmented-control bew-segment-control bew-segment-control--surface"
    role="radiogroup"
    :aria-label="label"
    :style="{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }"
  >
    <LiquidSegmentIndicator
      :active-key="modelValue"
    />

    <button
      v-for="(option, index) in options"
      :key="option.value"
      type="button"
      class="settings-segmented-control__option bew-segment-control__item"
      :class="{ 'is-selected': modelValue === option.value }"
      data-segment-item
      :data-active="modelValue === option.value ? 'true' : undefined"
      role="radio"
      :aria-checked="modelValue === option.value"
      :tabindex="modelValue === option.value || (!options.some(item => item.value === modelValue) && index === 0) ? 0 : -1"
      @keydown="handleKeydown($event, index)"
      @click="selectOption(option.value)"
    >
      {{ option.label }}
    </button>
  </div>
</template>

<style scoped lang="scss">
.settings-segmented-control {
  display: grid;
  width: 300px;
  max-width: 100%;
}

.settings-segmented-control__option {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
