<script setup lang="ts">
import { computed } from 'vue'

import WheelSelector from './WheelSelector.vue'

const props = withDefaults(defineProps<{
  title: string
  modelValue?: string
  options?: readonly { value: string, label: string, badge?: number, ariaLabel?: string }[]
  contentId: string
  disabled?: boolean
  count?: number
  hideTitle?: boolean
  scope?: object
}>(), { modelValue: '', options: () => [] })
const emit = defineEmits<{ (event: 'update:modelValue', value: string): void }>()
const items = computed(() => props.options.map(item => ({ ...item, ariaLabel: item.ariaLabel ?? `${props.title} · ${item.label}` })))
</script>

<template>
  <header class="library-sidebar-heading" :class="{ 'library-sidebar-heading--static': !items.length, 'library-sidebar-heading--wheel-only': hideTitle && items.length }" :inert="disabled ? true : undefined">
    <template v-if="items.length">
      <span v-if="!hideTitle" class="library-sidebar-heading__title">{{ title }}</span>
      <WheelSelector
        :model-value="modelValue" :label="title" :panel-id="contentId" :items="items" :scope="scope"
        @update:model-value="emit('update:modelValue', $event)"
      />
    </template>
    <div v-else class="library-sidebar-heading__row">
      <h1 class="library-sidebar-heading__emphasis">
        {{ title }}
      </h1>
      <span v-if="count !== undefined" class="library-sidebar-heading__count">{{ count }}</span>
    </div>
  </header>
</template>

<style scoped lang="scss">
.library-sidebar-heading {
  min-width: 0;
  box-sizing: border-box;
  height: var(--bew-sidebar-heading-height);
  margin-inline: calc(-1 * var(--bew-sidebar-inline-padding));
  padding: 0 calc(var(--bew-sidebar-inline-padding) + var(--bew-sidebar-label-inset) - var(--bew-space-1))
    var(--bew-space-2);
}
.library-sidebar-heading__title {
  padding-inline: var(--bew-space-1);
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);
  color: var(--bew-text-3);
}
.library-sidebar-heading--wheel-only {
  padding-block-start: 0;
}
.library-sidebar-heading--static {
  padding-inline-end: var(--bew-space-3);
}
.library-sidebar-heading__row {
  display: flex;
  height: var(--bew-wheel-viewport-height);
  align-items: center;
  gap: var(--bew-space-2);
}
.library-sidebar-heading__emphasis {
  flex: 0 1 auto;
  min-width: 0;
  margin: 0;
  padding: 0 var(--bew-space-1);
  color: var(--bew-wheel-text-active);
  font-size: var(--bew-wheel-label-size);
  font-weight: var(--bew-wheel-label-weight);
  line-height: var(--bew-wheel-label-line-height);
}
.library-sidebar-heading__count {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  min-width: var(--bew-space-8);
  height: var(--bew-space-6);
  padding-inline: var(--bew-space-2);
  color: var(--bew-text-auto);
  background: var(--bew-wheel-text-active);
  border-radius: var(--bew-badge-radius);
  corner-shape: var(--bew-corner-shape-round);
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-medium);
  line-height: var(--bew-line-height-control);
  font-variant-numeric: tabular-nums;
}
</style>
