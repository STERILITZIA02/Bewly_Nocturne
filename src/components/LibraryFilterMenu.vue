<script setup lang="ts">
import { computed, ref } from 'vue'

import type { ContextMenuOption } from '~/components/ContextMenu.vue'
import ContextMenu from '~/components/ContextMenu.vue'

/**
 * The filter behind a rail search field's funnel (its `#filter` slot): one
 * menu of titled single-choice groups that apply at once. Every rail filter
 * (Moments, Favorites, History, Watch Later, Messages) uses it. A group whose
 * options are still loading marks one `pending` (its check becomes the ring);
 * an `action` option (such as a retry) runs instead of being chosen.
 */
export interface LibraryFilterOption {
  value: string
  label: string
  icon: string
  pending?: boolean
  action?: boolean
}
export interface LibraryFilterGroup {
  key: string
  title: string
  value: string
  options: LibraryFilterOption[]
}

const props = defineProps<{ label: string, groups: LibraryFilterGroup[], disabled?: boolean }>()
const emit = defineEmits<{ (event: 'select', key: string, value: string): void, (event: 'open'): void }>()

const menu = ref<{ anchor: { x: number, y: number }, trigger: HTMLElement }>()
const options = computed<ContextMenuOption[]>(() => props.groups.flatMap(group => group.options.map((option): ContextMenuOption => {
  const item = { value: `${group.key}:${option.value}`, label: option.label, icon: option.icon, section: group.title, pending: option.pending }
  return option.action
    ? { ...item, closeOnSelect: false }
    : { ...item, kind: 'radio', closeOnSelect: false, checked: group.value === option.value }
})))

function open(event: MouseEvent) {
  const trigger = event.currentTarget as HTMLElement
  const rect = trigger.getBoundingClientRect()
  menu.value = { anchor: { x: rect.right, y: rect.bottom }, trigger }
  emit('open')
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
