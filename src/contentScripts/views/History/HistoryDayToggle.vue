<script setup lang="ts">
defineProps<{ label: string, expanded: boolean, disabled?: boolean }>()
defineEmits<{ (event: 'toggle', trigger: MouseEvent): void }>()
</script>

<template>
  <button type="button" class="history-day-toggle" :aria-expanded="expanded" :disabled="disabled" @click="$emit('toggle', $event)">
    <span>{{ label }}</span>
    <svg class="history-day-toggle__chevron" :class="{ 'history-day-toggle__chevron--collapsed': !expanded }" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="m4 6 4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  </button>
</template>

<style scoped lang="scss">
.history-day-toggle {
  display: flex;
  align-items: center;
  gap: var(--bew-space-2);
  min-height: var(--bew-control-item-height);
  padding: 0;
  border: 0;
  border-radius: var(--bew-interactive-radius);
  appearance: none;
  background: transparent;
  color: var(--bew-history-timeline-color);
  font-size: var(--bew-font-size-title);
  font-weight: var(--bew-font-weight-regular);
  line-height: var(--bew-line-height-title);
  text-align: start;
  cursor: pointer;
  &:focus-visible {
    outline: var(--bew-focus-ring);
    outline-offset: var(--bew-space-1);
  }
  &:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
}
.history-day-toggle__chevron {
  flex: none;
  width: var(--bew-icon-size-sm);
  height: var(--bew-icon-size-sm);
  transition: transform var(--bew-duration-normal) var(--bew-ease-standard);
}
.history-day-toggle__chevron--collapsed {
  transform: rotate(-90deg);
}
@media (prefers-reduced-motion: reduce) {
  .history-day-toggle,
  .history-day-toggle__chevron {
    transition: none;
  }
}
</style>
