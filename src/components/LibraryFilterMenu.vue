<script setup lang="ts">
import { computed, ref } from 'vue'

import type { ContextMenuOption } from '~/components/ContextMenu.vue'
import ContextMenu from '~/components/ContextMenu.vue'

/**
 * The filter behind a rail search field's funnel (its `#filter` slot): one
 * menu of titled single-choice groups that apply at once. Moments, History,
 * Watch Later and the other library pages share it.
 */
export interface LibraryFilterGroup {
  key: string
  title: string
  value: string
  options: Array<{ value: string, label: string, icon: string }>
}

const props = defineProps<{ label: string, groups: LibraryFilterGroup[], disabled?: boolean }>()
const emit = defineEmits<{ (event: 'select', key: string, value: string): void }>()

const menu = ref<{ anchor: { x: number, y: number }, trigger: HTMLElement }>()
const options = computed<ContextMenuOption[]>(() => props.groups.flatMap(group => group.options.map(option => ({
  value: `${group.key}:${option.value}`,
  label: option.label,
  icon: option.icon,
  section: group.title,
  kind: 'radio' as const,
  closeOnSelect: false,
  checked: group.value === option.value,
}))))

function open(event: MouseEvent) {
  const trigger = event.currentTarget as HTMLElement
  const rect = trigger.getBoundingClientRect()
  menu.value = { anchor: { x: rect.right, y: rect.bottom }, trigger }
}
function select(value: string | number) {
  const [key, ...choice] = String(value).split(':')
  emit('select', key, choice.join(':'))
}
</script>

<template>
  <button
    type="button" class="library-filter-menu" :aria-label="label" aria-haspopup="menu" :aria-expanded="Boolean(menu)"
    :disabled="disabled" @click="open"
  />
  <ContextMenu
    v-if="menu" :options="options" :anchor="menu.anchor" :trigger="menu.trigger" @select="select"
    @close="menu = undefined"
  />
</template>

<style scoped>
/* The hit area over the search field's funnel glyph. */
.library-filter-menu {
  position: absolute;
  inset: 0;
  padding: 0;
  border: 0;
  border-radius: inherit;
  background: transparent;
  cursor: pointer;
}
.library-filter-menu:disabled {
  cursor: not-allowed;
}
</style>
