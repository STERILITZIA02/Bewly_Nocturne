<script setup lang="ts">
import { useEventListener } from '@vueuse/core'
import { computed, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import ContextMenu from '~/components/ContextMenu.vue'
import { useBewlyApp } from '~/composables/useAppProvider'
import { useCurrentLocationHref } from '~/composables/useCurrentLocationHref'
import { findElementSettingsTarget, getElementSettingsActions } from '~/logic/elementSettingsMenu'
import { isLayoutEditing, layoutEditableRegistryVersion } from '~/logic/layoutEdit'
import { useMainStore } from '~/stores/mainStore'
import { useSettingsStore } from '~/stores/settingsStore'
import { getDeepActiveElement } from '~/utils/dialogFocus'

const emit = defineEmits<{ openSetting: [id: string, origin: DOMRect] }>()
const { mainAppRef } = useBewlyApp()
const mainStore = useMainStore()
const settingsStore = useSettingsStore()
const { t } = useI18n()
const target = shallowRef<ReturnType<typeof findElementSettingsTarget>>()
const trigger = shallowRef<HTMLElement | null>(null)
const anchor = ref({ x: 0, y: 0 })
const generation = ref(0)
const actions = computed(() => target.value ? getElementSettingsActions(target.value.descriptor, mainStore.dockItems, settingsStore, t) : [])
const options = computed(() => [...actions.value, { value: 'settings', label: t('dock.settings'), icon: 'i-mingcute:settings-3-line' }])
function close() {
  target.value = undefined
}

function open(event: MouseEvent | KeyboardEvent) {
  if (event.defaultPrevented || isLayoutEditing.value || document.getSelection()?.toString())
    return
  if (event instanceof MouseEvent && event.shiftKey)
    return
  const found = findElementSettingsTarget(event.composedPath(), mainAppRef.value ?? null)
  if (!found)
    return
  event.preventDefault()
  event.stopPropagation()
  const active = getDeepActiveElement(document)
  trigger.value = active instanceof HTMLElement && found.element.contains(active) ? active : found.element
  const rect = trigger.value.getBoundingClientRect()
  anchor.value = event instanceof MouseEvent && (event.clientX || event.clientY)
    ? { x: event.clientX, y: event.clientY }
    : { x: rect.right, y: rect.bottom }
  target.value = found
  generation.value++
}
function select(value: string | number) {
  if (!target.value?.element.isConnected)
    return close()
  if (value === 'settings')
    emit('openSetting', target.value.descriptor.settingId, target.value.element.getBoundingClientRect())
  else
    actions.value.find(action => action.value === value)?.run()
}
useEventListener(mainAppRef, 'contextmenu', open)
useEventListener(mainAppRef, 'keydown', (event) => {
  if (!event.isComposing && !event.ctrlKey && !event.metaKey && !event.altKey
    && (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey))) {
    open(event)
  }
})
useEventListener(mainAppRef, 'scroll', (event) => {
  if (!(event.target instanceof Element) || !event.target.closest('.context-menu-container'))
    close()
}, { capture: true, passive: true })
useEventListener(window, 'blur', close)
watch([isLayoutEditing, useCurrentLocationHref()], close)
watch(layoutEditableRegistryVersion, () => {
  if (target.value && !target.value.element.isConnected)
    close()
})
</script>

<template>
  <ContextMenu
    v-if="target" :key="generation" :options="options" :anchor="anchor" :trigger="trigger"
    @select="select" @close="close"
  />
</template>
