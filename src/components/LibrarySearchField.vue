<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, useAttrs, useSlots } from 'vue'

import type { SidebarControlBinding } from '~/composables/useSidebarHost'
import { useSidebarHost } from '~/composables/useSidebarHost'

import SidebarSearchControl from './SidebarSearchControl.vue'

defineOptions({ inheritAttrs: false })
const props = defineProps<{
  modelValue: string
  label: string
  clearable?: boolean
  submitDisabled?: boolean
  clearOnEscape?: boolean
  filterActive?: boolean
}>()
const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void
  (event: 'submit', keyboard?: KeyboardEvent): void
  (event: 'clear'): void
}>()
const host = useSidebarHost()
const target = ref<HTMLElement | null>(null)
const control = ref<InstanceType<typeof SidebarSearchControl> | null>(null)
const attrs = useAttrs()
const slots = useSlots()
function controlProps() {
  return {
    ...attrs,
    ...props,
    'onUpdate:modelValue': (value: string) => emit('update:modelValue', value),
    'onSubmit': (event?: KeyboardEvent) => emit('submit', event),
    'onClear': () => emit('clear'),
  }
}
let binding: SidebarControlBinding | null = null
onMounted(() => {
  if (host && target.value) {
    binding = { target: target.value, props: controlProps, slots }
    host.search.value = binding
  }
})
onBeforeUnmount(() => {
  if (host && host.search.value === binding)
    host.search.value = null
})
defineExpose({ focus: () => {
  if (!host)
    control.value?.focus()
  else if (host.search.value === binding)
    host.searchControl.value?.focus()
} })
</script>

<template>
  <div v-if="host" ref="target" class="sidebar-search-slot" />
  <SidebarSearchControl v-else ref="control" v-bind="controlProps()">
    <template v-if="$slots.filter" #filter>
      <slot name="filter" />
    </template>
  </SidebarSearchControl>
</template>

<style scoped>
.sidebar-search-slot {
  min-width: 0;
  height: var(--bew-control-height);
}
</style>
