<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const props = withDefaults(defineProps<{
  modelValue: string
  label: string
  clearable?: boolean
  submitDisabled?: boolean
  clearOnEscape?: boolean
  filterActive?: boolean
  scope?: object
}>(), { modelValue: '', label: '' })
const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void
  (event: 'submit', keyboard?: KeyboardEvent): void
  (event: 'clear'): void
}>()
const { t } = useI18n()
const input = ref<HTMLInputElement | null>(null)
const value = computed({ get: () => props.modelValue, set: value => emit('update:modelValue', value) })
watch(() => props.scope, () => {
  // A reused input must not carry an unfinished IME composition into a different
  // page. Vue's native v-model uses this flag to defer composition updates.
  const element = input.value as (HTMLInputElement & { composing?: boolean }) | null
  if (element) {
    element.composing = false
    element.blur()
  }
}, { flush: 'sync' })
function focus() {
  input.value?.focus({ preventScroll: true })
}
function clear() {
  emit('update:modelValue', '')
  emit('clear')
  focus()
}
function escape(event: KeyboardEvent, enabled?: boolean) {
  if (!enabled || event.isComposing)
    return
  event.preventDefault()
  event.stopPropagation()
  clear()
}
defineExpose({ focus })
</script>

<template>
  <div class="library-search-field" role="search" :aria-label="label">
    <button type="button" :disabled="submitDisabled" :aria-label="t('common.search')" @click="emit('submit')">
      <i i-tabler:search aria-hidden="true" />
    </button>
    <input
      ref="input" v-model="value" type="text" inputmode="search" enterkeyhint="search"
      autocomplete="off" autocapitalize="off" autocorrect="off" :spellcheck="false" :aria-label="label"
      @keydown.enter="!$event.isComposing && !$event.defaultPrevented && !submitDisabled && ($event.preventDefault(), emit('submit', $event))"
      @keydown.esc="escape($event, clearOnEscape)"
    >
    <button v-if="modelValue || clearable" type="button" :aria-label="t('library_tools.clear_search')" class="library-search-field__clear" @click="clear">
      <i i-tabler:x aria-hidden="true" />
    </button>
    <span v-if="$slots.filter" class="library-search-field__filter" :class="{ 'library-search-field__filter--active': filterActive }">
      <svg
        viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"
        stroke-linejoin="round" aria-hidden="true"
      >
        <path d="M4 5h16l-6 7v6l-4 2v-8Z" />
      </svg>
      <slot name="filter" />
    </span>
  </div>
</template>

<style scoped lang="scss">
// Shared with the message sidebar: one surface, permanent neutral border,
// and icon-only feedback. No extra focus capsule or nested glass sampling.
.library-search-field {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: var(--bew-space-1);
  min-width: 0;
  height: var(--bew-control-height);
  padding: 0 var(--bew-space-1) 0 var(--bew-space-2);
  color: var(--bew-text-3);
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);
  border: 1px solid var(--bew-input-border-color);
  border-radius: var(--bew-pill-radius);
  corner-shape: var(--bew-corner-shape-round);
  background: var(--bew-content-solid);
}
.library-search-field:hover {
  border-color: var(--bew-input-border-color-hover);
}
.library-search-field:focus-within {
  border-color: var(--bew-focus-ring-color);
}
.library-search-field input {
  flex: 1 1 auto;
  min-width: 0;
  width: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--bew-text-1);
  font: inherit;
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
  border-radius: var(--bew-pill-radius);
  color: var(--bew-text-2);
  background: transparent;
  transition: color var(--bew-duration-normal) var(--bew-ease-standard);
}
.library-search-field button {
  cursor: pointer;
}
.library-search-field > button:first-child {
  width: var(--bew-icon-button-size-sm);
  height: var(--bew-icon-button-size-sm);
  border-radius: var(--bew-interactive-radius);
}
.library-search-field button:is(:hover, :focus-visible):not(:disabled) {
  color: var(--bew-message-icon-hover);
}
.library-search-field button:disabled {
  color: var(--bew-text-3);
  cursor: not-allowed;
}
.library-search-field i {
  font-size: var(--bew-icon-size-sm);
}
.library-search-field__filter {
  position: relative;
  margin-inline-end: var(--bew-space-1);
}
.library-search-field__filter svg {
  width: var(--bew-icon-size-sm);
  height: var(--bew-icon-size-sm);
  pointer-events: none;
}
.library-search-field__filter :deep(select) {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: pointer;
}
.library-search-field__filter:is(:hover, :focus-within, :active),
.library-search-field__filter--active {
  color: var(--bew-message-icon-hover);
}
.library-search-field__clear:is(:hover, :focus-visible):not(:disabled) {
  color: var(--bew-text-1);
}
@media (prefers-reduced-motion: reduce) {
  .library-search-field button,
  .library-search-field__filter {
    transition: none;
  }
}
</style>
