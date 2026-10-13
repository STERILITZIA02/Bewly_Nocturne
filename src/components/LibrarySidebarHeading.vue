<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, useAttrs } from 'vue'

import type { SidebarControlBinding } from '~/composables/useSidebarHost'
import { useSidebarHost } from '~/composables/useSidebarHost'

import SidebarHeadingControl from './SidebarHeadingControl.vue'

defineOptions({ inheritAttrs: false })
const props = defineProps<{
  title: string
  modelValue?: string
  options?: readonly { value: string, label: string, badge?: number, ariaLabel?: string }[]
  contentId: string
  disabled?: boolean
  count?: number
  hideTitle?: boolean
}>()
const emit = defineEmits<{ (event: 'update:modelValue', value: string): void }>()
const host = useSidebarHost()
const target = ref<HTMLElement | null>(null)
const attrs = useAttrs()
const controlProps = () => ({ ...attrs, ...props, 'onUpdate:modelValue': (value: string) => emit('update:modelValue', value) })
let binding: SidebarControlBinding | null = null
onMounted(() => {
  if (host && target.value) {
    binding = { target: target.value, props: controlProps, slots: {} }
    host.heading.value = binding
  }
})
onBeforeUnmount(() => {
  if (host && host.heading.value === binding)
    host.heading.value = null
})
</script>

<template>
  <div v-if="host" ref="target" class="sidebar-heading-slot" />
  <SidebarHeadingControl v-else v-bind="{ ...attrs, ...props }" @update:model-value="emit('update:modelValue', $event)" />
</template>

<style scoped>
.sidebar-heading-slot {
  min-width: 0;
  height: var(--bew-sidebar-heading-height);
}
</style>
