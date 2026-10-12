<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{ modelValue: string, label: string, clearable?: boolean, submitDisabled?: boolean }>()
const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void
  (event: 'submit'): void
  (event: 'clear'): void
}>()
const { t } = useI18n()
const input = ref<HTMLInputElement | null>(null)
const value = computed({ get: () => props.modelValue, set: value => emit('update:modelValue', value) })
function clear() {
  emit('update:modelValue', '')
  emit('clear')
  input.value?.focus()
}
</script>

<template>
  <div class="library-search-field" role="search" :aria-label="label">
    <button type="button" :disabled="submitDisabled" :aria-label="t('common.search')" @click="emit('submit')">
      <i i-mingcute:search-line aria-hidden="true" />
    </button>
    <input
      ref="input" v-model="value" type="search" :aria-label="label"
      @keydown.enter="!$event.isComposing && !submitDisabled && emit('submit')"
    >
    <button v-if="modelValue || clearable" type="button" :aria-label="t('library_tools.clear_search')" class="library-search-field__clear" @click="clear">
      <i i-mingcute:close-line aria-hidden="true" />
    </button>
    <span v-if="$slots.filter" class="library-search-field__filter">
      <svg
        viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"
        stroke-linejoin="round" aria-hidden="true"
      ><path d="M4 5h16l-6 7v6l-4 2v-8Z" /></svg>
      <slot name="filter" />
    </span>
  </div>
</template>

<style scoped lang="scss">
.library-search-field {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: var(--bew-space-1);
  min-width: 0;
  min-height: var(--bew-control-height);
  height: var(--bew-control-height);
  padding: 0 var(--bew-space-2);
  border: 1px solid var(--bew-text-3);
  border-radius: var(--bew-badge-radius);
  background: var(--bew-fill-1);
}
.library-search-field input {
  flex: 1;
  min-width: 0;
  width: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--bew-text-1);
  font: inherit;
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);
}
.library-search-field input::-webkit-search-cancel-button {
  display: none;
}

.library-search-field:has(input:focus-visible) {
  // Text inputs can match :focus-visible after a pointer click as well.
  // Reuse the permanent border instead of drawing a second capsule around it.
  border-color: var(--bew-text-1);
}
.library-search-field input:focus-visible {
  outline: none;
  box-shadow: none;
}
.library-search-field button,
.library-search-field__filter {
  display: grid;
  place-items: center;
  flex: none;
  width: var(--bew-control-item-height);
  height: var(--bew-control-item-height);
  padding: 0;
  border: 0;
  border-radius: var(--bew-badge-radius);
  color: var(--bew-text-2);
  background: transparent;
  transition: color var(--bew-duration-normal) var(--bew-ease-standard);
}
.library-search-field button {
  cursor: pointer;
}
.library-search-field button:is(:hover, :focus-visible):not(:disabled) {
  color: var(--bew-message-icon-hover);
}
.library-search-field button:disabled {
  color: var(--bew-text-3);
  cursor: not-allowed;
}
.library-search-field i {
  font-size: var(--bew-icon-size-md);
}
.library-search-field__filter {
  position: relative;
  margin-inline-end: var(--bew-space-1);
}
.library-search-field__filter svg {
  width: var(--bew-icon-size-md);
  height: var(--bew-icon-size-md);
}
.library-search-field__filter :deep(select) {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: pointer;
}
.library-search-field__filter:is(:hover, :focus-within, :active) {
  color: var(--bew-message-icon-hover);
}
.library-search-field__filter:has(:focus-visible) {
  outline: var(--bew-focus-ring);
  outline-offset: var(--bew-space-0-5);
}
.library-search-field button.library-search-field__clear:is(:hover, :focus-visible):not(:disabled) {
  color: var(--bew-theme-foreground);
}

@media (prefers-reduced-motion: reduce) {
  .library-search-field button,
  .library-search-field__filter {
    transition: none;
  }
}
</style>
