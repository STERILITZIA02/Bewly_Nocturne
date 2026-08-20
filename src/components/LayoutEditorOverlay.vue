<script setup lang="ts">
import { Icon } from '@iconify/vue'
import type { CSSProperties } from 'vue'
import { nextTick, onBeforeUnmount, onMounted, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { DOCK_LAYOUT, LAYOUT_EDITOR_LAYOUT } from '~/constants/layout'
import { settings } from '~/logic'
import {
  activeLayoutEditPreviewSettingId,
  activeLayoutEditPreviewValue,
  activeLayoutEditTargetId,
  beginLayoutEditSettingPreview,
  completeLayoutEditMode,
  enterLayoutEditMode,
  exitLayoutEditMode,
  getLayoutEditableDescriptor,
  getLayoutEditableDescriptors,
  getRegisteredLayoutEditableElement,
  getSettingDescriptor,
  isLayoutEditing,
  layoutEditableRegistryVersion,
  setActiveLayoutEditTarget,
  updateLayoutEditSettingPreview,
  useLayoutEditSettingValue,
} from '~/logic/layoutEdit'
import { pickLayoutEditableAtPoint } from '~/logic/layoutEditHitTest'

import Button from './Button.vue'

const emit = defineEmits<{
  (event: 'openSetting', settingId: string, origin?: DOMRect): void
}>()

interface OverlayRect {
  height: number
  left: number
  top: number
  width: number
}

interface SafeInsets {
  bottom: number
  left: number
  right: number
  top: number
}

interface RegisteredHitTarget {
  depth: number
  element: HTMLElement
  id: string
  rect: OverlayRect & { bottom: number, right: number }
}

const { t } = useI18n()
const hoveredTargetId = ref<string | null>(null)
const hoveredElement = shallowRef<HTMLElement>()
const selectedElement = shallowRef<HTMLElement>()
const hoveredRect = shallowRef<OverlayRect>()
const selectedRect = shallowRef<OverlayRect>()
const contextTargetId = ref<string | null>(null)
const contextPoint = ref({ x: 0, y: 0 })
const actionMenuRef = ref<HTMLElement>()
const contextMenuRef = ref<HTMLElement>()
const inlineControlRef = ref<HTMLSelectElement>()
const safeInsets = ref<SafeInsets>({ top: 8, right: 8, bottom: 8, left: 8 })
const actionMenuStyle = ref<CSSProperties>({})
const contextMenuStyle = ref<CSSProperties>({})
const registeredHitTargets = shallowRef<RegisteredHitTarget[]>([])
const overlayStyle = {
  '--layout-editor-action-menu-width': `${LAYOUT_EDITOR_LAYOUT.actionMenuWidth}px`,
  '--layout-editor-context-menu-width': `${LAYOUT_EDITOR_LAYOUT.contextMenuWidth}px`,
} as CSSProperties
const permanentDisposers: Array<() => void> = []
const editingDisposers: Array<() => void> = []
const contextMenuDisposers: Array<() => void> = []
let trackedElementsObserver: ResizeObserver | undefined
let updateFrame: number | undefined
let overlayMounted = false

const selectedDescriptor = computed(() => activeLayoutEditTargetId.value
  ? getLayoutEditableDescriptor(activeLayoutEditTargetId.value)
  : undefined)
const contextDescriptor = computed(() => contextTargetId.value
  ? getLayoutEditableDescriptor(contextTargetId.value)
  : undefined)
const persistedSelectedSettingValue = computed(() => selectedDescriptor.value
  ? getSettingDescriptor(selectedDescriptor.value.settingId)?.get()
  : undefined)
const selectedControlValue = computed(() =>
  activeLayoutEditPreviewSettingId.value === selectedDescriptor.value?.settingId
    ? activeLayoutEditPreviewValue.value
    : persistedSelectedSettingValue.value,
)
const dockPosition = useLayoutEditSettingValue(
  'navigation.dock.position',
  () => settings.value.dockPosition,
)

function toOverlayRect(rect: DOMRect): OverlayRect | undefined {
  if (rect.width <= 0 || rect.height <= 0)
    return undefined
  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  }
}

function toOutlineStyle(rect: OverlayRect | undefined): CSSProperties | undefined {
  if (!rect)
    return undefined
  return {
    top: `${rect.top}px`,
    left: `${rect.left}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
  }
}

const hoveredOutlineStyle = computed(() => toOutlineStyle(hoveredRect.value))
const selectedOutlineStyle = computed(() => toOutlineStyle(selectedRect.value))

function getViewportBounds() {
  const visualViewport = window.visualViewport
  const left = visualViewport?.offsetLeft ?? 0
  const top = visualViewport?.offsetTop ?? 0
  return {
    left,
    top,
    right: left + (visualViewport?.width ?? window.innerWidth),
    bottom: top + (visualViewport?.height ?? window.innerHeight),
  }
}

function getDockSurfaceRect() {
  const dockRoot = getRegisteredLayoutEditableElement('dock')
  const dockSurface = dockRoot?.querySelector<HTMLElement>('.dock-shell-surface')
  return (dockSurface ?? dockRoot)?.getBoundingClientRect()
}

function updateSafeInsets() {
  const viewport = getViewportBounds()
  const gap = Math.max(8, DOCK_LAYOUT.controlGap)
  const nextInsets: SafeInsets = { top: 8, right: 8, bottom: 8, left: 8 }
  const dockRect = getDockSurfaceRect()
  if (dockRect && dockRect.width > 0 && dockRect.height > 0) {
    if (dockPosition.value === 'left')
      nextInsets.left = Math.max(nextInsets.left, dockRect.right - viewport.left + gap)
    else if (dockPosition.value === 'right')
      nextInsets.right = Math.max(nextInsets.right, viewport.right - dockRect.left + gap)
    else
      nextInsets.bottom = Math.max(nextInsets.bottom, viewport.bottom - dockRect.top + gap)
  }
  safeInsets.value = nextInsets
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum))
}

function updateMenuPosition(
  menu: HTMLElement | undefined,
  anchor: OverlayRect | undefined,
): CSSProperties {
  if (!anchor)
    return {}
  const viewport = getViewportBounds()
  const menuRect = menu?.getBoundingClientRect()
  const width = menuRect?.width || LAYOUT_EDITOR_LAYOUT.actionMenuWidth
  const height = menuRect?.height || LAYOUT_EDITOR_LAYOUT.actionMenuFallbackHeight
  const gap = 8
  const minimumLeft = viewport.left + safeInsets.value.left
  const maximumRight = viewport.right - safeInsets.value.right
  const minimumTop = viewport.top + safeInsets.value.top
  const maximumBottom = viewport.bottom - safeInsets.value.bottom
  const left = clamp(anchor.left + (anchor.width - width) / 2, minimumLeft, maximumRight - width)
  const belowTop = anchor.top + anchor.height + gap
  const top = belowTop + height <= maximumBottom
    ? belowTop
    : clamp(anchor.top - height - gap, minimumTop, maximumBottom - height)
  return { left: `${left}px`, top: `${top}px` }
}

function updateContextMenuPosition(): CSSProperties {
  const viewport = getViewportBounds()
  const menuRect = contextMenuRef.value?.getBoundingClientRect()
  const width = menuRect?.width || LAYOUT_EDITOR_LAYOUT.contextMenuWidth
  const height = menuRect?.height || LAYOUT_EDITOR_LAYOUT.contextMenuFallbackHeight
  const minimumLeft = viewport.left + safeInsets.value.left
  const maximumRight = viewport.right - safeInsets.value.right
  const minimumTop = viewport.top + safeInsets.value.top
  const maximumBottom = viewport.bottom - safeInsets.value.bottom
  return {
    left: `${clamp(contextPoint.value.x, minimumLeft, maximumRight - width)}px`,
    top: `${clamp(contextPoint.value.y, minimumTop, maximumBottom - height)}px`,
  }
}

function refreshTrackedElements() {
  if (!isLayoutEditing.value) {
    trackedElementsObserver?.disconnect()
    return
  }
  if (hoveredElement.value && !hoveredElement.value.isConnected) {
    hoveredTargetId.value = null
    hoveredElement.value = undefined
    hoveredRect.value = undefined
  }
  selectedElement.value = activeLayoutEditTargetId.value
    ? getRegisteredLayoutEditableElement(activeLayoutEditTargetId.value)
    : undefined
  if (selectedElement.value && !selectedElement.value.isConnected) {
    exitLayoutEditMode()
    return
  }

  trackedElementsObserver?.disconnect()
  const observed = new Set([selectedElement.value, hoveredElement.value].filter(Boolean) as HTMLElement[])
  observed.forEach(element => trackedElementsObserver?.observe(element))
}

function getElementDepth(element: HTMLElement) {
  let depth = 0
  let current: HTMLElement | null = element
  while (current) {
    depth++
    current = current.parentElement
  }
  return depth
}

function refreshRegisteredHitTargets() {
  if (!isLayoutEditing.value) {
    registeredHitTargets.value = []
    return
  }

  registeredHitTargets.value = getLayoutEditableDescriptors().flatMap((descriptor) => {
    const element = getRegisteredLayoutEditableElement(descriptor.id)
    if (!element)
      return []
    const style = window.getComputedStyle(element)
    if (style.display === 'none' || style.visibility === 'hidden' || Number.parseFloat(style.opacity) === 0)
      return []
    const rect = element.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0)
      return []
    return [{
      id: descriptor.id,
      element,
      depth: getElementDepth(element),
      rect: {
        top: rect.top,
        left: rect.left,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      },
    }]
  })
}

function updateGeometry() {
  updateFrame = undefined
  updateSafeInsets()
  refreshRegisteredHitTargets()
  hoveredRect.value = hoveredElement.value?.isConnected
    ? toOverlayRect(hoveredElement.value.getBoundingClientRect())
    : undefined
  selectedRect.value = selectedElement.value?.isConnected
    ? toOverlayRect(selectedElement.value.getBoundingClientRect())
    : undefined
  actionMenuStyle.value = updateMenuPosition(actionMenuRef.value, selectedRect.value)
  contextMenuStyle.value = updateContextMenuPosition()
}

function scheduleGeometryUpdate() {
  if ((!isLayoutEditing.value && !contextTargetId.value) || updateFrame !== undefined)
    return
  updateFrame = requestAnimationFrame(updateGeometry)
}

function stopDisposers(target: Array<() => void>) {
  target.splice(0).forEach(dispose => dispose())
}

function addViewportTracking(target: Array<() => void>) {
  window.addEventListener('resize', scheduleGeometryUpdate, { passive: true })
  window.addEventListener('scroll', scheduleGeometryUpdate, { capture: true, passive: true })
  target.push(
    () => window.removeEventListener('resize', scheduleGeometryUpdate),
    () => window.removeEventListener('scroll', scheduleGeometryUpdate, true),
  )

  const visualViewport = window.visualViewport
  if (!visualViewport)
    return
  visualViewport.addEventListener('resize', scheduleGeometryUpdate, { passive: true })
  visualViewport.addEventListener('scroll', scheduleGeometryUpdate, { passive: true })
  target.push(
    () => visualViewport.removeEventListener('resize', scheduleGeometryUpdate),
    () => visualViewport.removeEventListener('scroll', scheduleGeometryUpdate),
  )
}

function startEditingResources() {
  if (!overlayMounted || editingDisposers.length)
    return
  trackedElementsObserver = new ResizeObserver(scheduleGeometryUpdate)
  window.addEventListener('pointermove', handlePointerMove, { capture: true, passive: true })
  window.addEventListener('pointerdown', blockBusinessPress, true)
  window.addEventListener('mousedown', blockBusinessPress, true)
  window.addEventListener('touchstart', blockBusinessPress, { capture: true, passive: true })
  window.addEventListener('click', blockBusinessInteraction, true)
  window.addEventListener('auxclick', blockBusinessInteraction, true)
  window.addEventListener('keydown', handleKeyDown, true)
  editingDisposers.push(
    () => window.removeEventListener('pointermove', handlePointerMove, true),
    () => window.removeEventListener('pointerdown', blockBusinessPress, true),
    () => window.removeEventListener('mousedown', blockBusinessPress, true),
    () => window.removeEventListener('touchstart', blockBusinessPress, true),
    () => window.removeEventListener('click', blockBusinessInteraction, true),
    () => window.removeEventListener('auxclick', blockBusinessInteraction, true),
    () => window.removeEventListener('keydown', handleKeyDown, true),
  )
  addViewportTracking(editingDisposers)
  refreshTrackedElements()
  scheduleGeometryUpdate()
}

function stopEditingResources() {
  stopDisposers(editingDisposers)
  trackedElementsObserver?.disconnect()
  trackedElementsObserver = undefined
  if (updateFrame !== undefined)
    cancelAnimationFrame(updateFrame)
  updateFrame = undefined
}

function startContextMenuResources() {
  if (!overlayMounted || contextMenuDisposers.length || isLayoutEditing.value)
    return
  window.addEventListener('pointerdown', handlePointerDown, true)
  window.addEventListener('keydown', handleKeyDown, true)
  contextMenuDisposers.push(
    () => window.removeEventListener('pointerdown', handlePointerDown, true),
    () => window.removeEventListener('keydown', handleKeyDown, true),
  )
  addViewportTracking(contextMenuDisposers)
  scheduleGeometryUpdate()
}

function stopContextMenuResources() {
  stopDisposers(contextMenuDisposers)
  if (!isLayoutEditing.value && updateFrame !== undefined)
    cancelAnimationFrame(updateFrame)
  if (!isLayoutEditing.value)
    updateFrame = undefined
}

function composedElements(event: Event) {
  return event.composedPath().filter((target): target is HTMLElement => target instanceof HTMLElement)
}

function eventIsEditorControl(event: Event) {
  return composedElements(event).some(element => element.hasAttribute('data-layout-editor-control'))
}

function eventIsTextEditingControl(event: Event) {
  return composedElements(event).some(element =>
    element instanceof HTMLInputElement
    || element instanceof HTMLTextAreaElement
    || element instanceof HTMLSelectElement
    || element.isContentEditable
    || Boolean(element.closest('[contenteditable="true"]')),
  )
}

function resolveTargetFromEvent(event: Event) {
  for (const element of composedElements(event)) {
    const id = element.dataset.layoutEditableId
    if (id && getLayoutEditableDescriptor(id))
      return { id, element }
  }

  if (event instanceof MouseEvent) {
    const candidate = pickLayoutEditableAtPoint(
      registeredHitTargets.value.filter(target => target.element.isConnected),
      event.clientX,
      event.clientY,
    )
    if (candidate)
      return { id: candidate.id, element: candidate.element }
  }
}

function clearHover() {
  if (!hoveredTargetId.value && !hoveredElement.value && !hoveredRect.value)
    return
  hoveredTargetId.value = null
  hoveredElement.value = undefined
  hoveredRect.value = undefined
  refreshTrackedElements()
}

function handlePointerMove(event: PointerEvent) {
  if (!isLayoutEditing.value || eventIsEditorControl(event)) {
    clearHover()
    return
  }
  const target = resolveTargetFromEvent(event)
  if (!target) {
    clearHover()
    return
  }
  if (hoveredTargetId.value === target.id && hoveredElement.value === target.element)
    return
  hoveredTargetId.value = target.id
  hoveredElement.value = target.element
  refreshTrackedElements()
  scheduleGeometryUpdate()
}

function blockBusinessInteraction(event: MouseEvent) {
  if (!isLayoutEditing.value || eventIsEditorControl(event))
    return
  event.preventDefault()
  event.stopImmediatePropagation()
  const target = resolveTargetFromEvent(event)
  if (target) {
    setActiveLayoutEditTarget(target.id)
    selectedElement.value = target.element
    refreshTrackedElements()
    scheduleGeometryUpdate()
  }
  contextTargetId.value = null
}

function blockBusinessPress(event: Event) {
  if (!isLayoutEditing.value || eventIsEditorControl(event))
    return

  event.stopImmediatePropagation()
  const isTouchEvent = typeof TouchEvent !== 'undefined' && event instanceof TouchEvent
  const isTouchPointer = typeof PointerEvent !== 'undefined' && event instanceof PointerEvent && event.pointerType !== 'mouse'
  if (!isTouchEvent && !isTouchPointer)
    event.preventDefault()
}

function handleContextMenu(event: MouseEvent) {
  if (eventIsEditorControl(event) || eventIsTextEditingControl(event)) {
    if (!isLayoutEditing.value)
      contextTargetId.value = null
    return
  }
  const target = resolveTargetFromEvent(event)
  if (!target) {
    contextTargetId.value = null
    return
  }
  event.preventDefault()
  event.stopImmediatePropagation()
  if (isLayoutEditing.value) {
    setActiveLayoutEditTarget(target.id)
    selectedElement.value = target.element
    refreshTrackedElements()
  }
  else {
    contextTargetId.value = target.id
    contextPoint.value = { x: event.clientX, y: event.clientY }
  }
  scheduleGeometryUpdate()
  void nextTick(scheduleGeometryUpdate)
}

function handlePointerDown(event: PointerEvent) {
  if (contextTargetId.value && !eventIsEditorControl(event))
    contextTargetId.value = null
}

function handleKeyDown(event: KeyboardEvent) {
  if (event.key !== 'Escape')
    return
  if (isLayoutEditing.value) {
    event.preventDefault()
    event.stopImmediatePropagation()
    exitLayoutEditMode()
  }
  else if (contextTargetId.value) {
    event.preventDefault()
    contextTargetId.value = null
  }
}

function beginSelectedPreview() {
  const descriptor = selectedDescriptor.value
  if (!descriptor)
    return
  if (!descriptor.previewControl) {
    openSelectedSetting()
    return
  }
  if (activeLayoutEditPreviewSettingId.value !== descriptor.settingId)
    beginLayoutEditSettingPreview(descriptor.settingId)
  void nextTick(() => inlineControlRef.value?.focus())
}

function updateSelectedPreview(event: Event) {
  const descriptor = selectedDescriptor.value
  const control = descriptor?.previewControl
  if (!descriptor || !control)
    return
  if (activeLayoutEditPreviewSettingId.value !== descriptor.settingId)
    beginLayoutEditSettingPreview(descriptor.settingId)
  const selectedValue = (event.currentTarget as HTMLSelectElement).value
  const option = control.options.find(item => String(item.value) === selectedValue)
  if (option)
    updateLayoutEditSettingPreview(option.value)
}

function openSelectedSetting() {
  const descriptor = selectedDescriptor.value
  if (!descriptor)
    return
  const origin = selectedElement.value?.getBoundingClientRect()
  exitLayoutEditMode()
  emit('openSetting', descriptor.settingId, origin)
}

function editContextTarget() {
  const descriptor = contextDescriptor.value
  if (!descriptor)
    return
  contextTargetId.value = null
  enterLayoutEditMode(descriptor.section, descriptor.id)
  refreshTrackedElements()
  scheduleGeometryUpdate()
}

function openContextSetting() {
  const descriptor = contextDescriptor.value
  if (!descriptor)
    return
  const origin = getRegisteredLayoutEditableElement(descriptor.id)?.getBoundingClientRect()
  contextTargetId.value = null
  emit('openSetting', descriptor.settingId, origin)
}

function setEditingClasses(active: boolean) {
  document.body?.classList.toggle('bewly-layout-editing', active)
  const host = document.getElementById('bewly')
  host?.classList.toggle('bewly-layout-editing', active)
  host?.shadowRoot?.querySelector('.bewly-wrapper')?.classList.toggle('bewly-layout-editing', active)
}

watch(activeLayoutEditTargetId, () => {
  refreshTrackedElements()
  scheduleGeometryUpdate()
  void nextTick(scheduleGeometryUpdate)
})

watch(layoutEditableRegistryVersion, () => {
  refreshTrackedElements()
  scheduleGeometryUpdate()
})

watch([activeLayoutEditPreviewValue, dockPosition], scheduleGeometryUpdate)

watch(isLayoutEditing, (active) => {
  setEditingClasses(active)
  contextTargetId.value = null
  if (!active) {
    stopEditingResources()
    hoveredTargetId.value = null
    hoveredElement.value = undefined
    hoveredRect.value = undefined
    selectedElement.value = undefined
    selectedRect.value = undefined
    registeredHitTargets.value = []
  }
  else {
    startEditingResources()
  }
}, { immediate: true })

watch(contextTargetId, (id) => {
  if (id)
    startContextMenuResources()
  else
    stopContextMenuResources()
})

onMounted(() => {
  overlayMounted = true
  window.addEventListener('contextmenu', handleContextMenu, true)
  permanentDisposers.push(
    () => window.removeEventListener('contextmenu', handleContextMenu, true),
  )
  if (isLayoutEditing.value)
    startEditingResources()
  else if (contextTargetId.value)
    startContextMenuResources()
})

onBeforeUnmount(() => {
  overlayMounted = false
  exitLayoutEditMode()
  setEditingClasses(false)
  stopEditingResources()
  stopContextMenuResources()
  stopDisposers(permanentDisposers)
})
</script>

<template>
  <div class="layout-editor-overlay" :class="{ 'is-editing': isLayoutEditing }" :style="overlayStyle">
    <div
      v-if="isLayoutEditing"
      class="layout-editor-hint"
      :style="{
        top: `${safeInsets.top}px`,
        right: `${safeInsets.right}px`,
        left: `${safeInsets.left}px`,
      }"
      aria-live="polite"
    >
      <span>{{ t('layout_editor.hint') }}</span>
    </div>

    <div
      v-if="isLayoutEditing && hoveredRect && hoveredTargetId !== activeLayoutEditTargetId"
      class="layout-editor-outline layout-editor-outline--hovered"
      :style="hoveredOutlineStyle"
      aria-hidden="true"
    />
    <div
      v-if="isLayoutEditing && selectedRect"
      class="layout-editor-outline layout-editor-outline--selected"
      :style="selectedOutlineStyle"
      aria-hidden="true"
    />

    <section
      v-if="isLayoutEditing && selectedDescriptor && selectedRect"
      ref="actionMenuRef"
      class="layout-editor-menu bew-shape-smooth-rect"
      :class="{ 'layout-editor-menu--solid': settings.disableFrostedGlass }"
      :style="actionMenuStyle"
      data-layout-editor-control
      role="dialog"
      :aria-label="t('layout_editor.menu_label')"
    >
      <header class="layout-editor-menu__header" data-layout-editor-control>
        <strong>{{ t(selectedDescriptor.titleKey) }}</strong>
        <span>{{ t(selectedDescriptor.scope === 'all-pages' ? 'layout_editor.scope_all_pages' : 'layout_editor.scope_current_page') }}</span>
      </header>

      <div class="layout-editor-menu__actions" data-layout-editor-control>
        <Button
          type="secondary"
          size="small"
          data-layout-editor-control
          @click="beginSelectedPreview"
        >
          <template #left>
            <Icon icon="mingcute:edit-3-line" />
          </template>
          {{ t('layout_editor.adjust_target') }}
        </Button>
        <Button type="secondary" size="small" data-layout-editor-control @click="openSelectedSetting">
          <template #left>
            <Icon icon="mingcute:settings-3-line" />
          </template>
          {{ t('layout_editor.open_setting') }}
        </Button>
      </div>

      <label
        v-if="selectedDescriptor.previewControl"
        class="layout-editor-menu__control"
        data-layout-editor-control
      >
        <span>{{ t('layout_editor.preview') }}</span>
        <select
          ref="inlineControlRef"
          :value="String(selectedControlValue)"
          data-layout-editor-control
          @focus="beginSelectedPreview"
          @change="updateSelectedPreview"
        >
          <option
            v-for="option in selectedDescriptor.previewControl.options"
            :key="String(option.value)"
            :value="String(option.value)"
          >
            {{ t(option.labelKey) }}
          </option>
        </select>
      </label>

      <footer class="layout-editor-menu__footer" data-layout-editor-control>
        <Button type="tertiary" size="small" data-layout-editor-control @click="exitLayoutEditMode">
          {{ t('common.operation.cancel') }}
        </Button>
        <Button type="primary" size="small" data-layout-editor-control @click="completeLayoutEditMode">
          {{ t('layout_editor.done') }}
        </Button>
      </footer>
    </section>

    <section
      v-if="contextDescriptor"
      ref="contextMenuRef"
      class="layout-editor-context-menu bew-popover-surface"
      :style="contextMenuStyle"
      data-layout-editor-control
      role="menu"
    >
      <button type="button" data-layout-editor-control role="menuitem" @click="editContextTarget">
        <Icon icon="mingcute:edit-3-line" />
        <span>{{ t('layout_editor.edit_layout') }}</span>
      </button>
      <button type="button" data-layout-editor-control role="menuitem" @click="openContextSetting">
        <Icon icon="mingcute:settings-3-line" />
        <span>{{ t('layout_editor.open_setting') }}</span>
      </button>
    </section>
  </div>
</template>

<style scoped lang="scss">
.layout-editor-overlay {
  position: fixed;
  z-index: var(--bew-z-layout-editor);
  inset: 0;
  pointer-events: none;
}

.layout-editor-hint {
  position: fixed;
  display: flex;
  justify-content: center;
  pointer-events: none;

  span {
    padding: var(--bew-space-2) var(--bew-space-4);
    color: var(--bew-on-theme-color);
    background: var(--bew-theme-color);
    border-radius: var(--bew-badge-radius);
    corner-shape: var(--bew-corner-shape);
    box-shadow: var(--bew-shadow-2);
    font-size: var(--bew-font-size-control);
    font-weight: var(--bew-font-weight-semibold);
    line-height: var(--bew-line-height-control);
  }
}

.layout-editor-outline {
  position: fixed;
  box-sizing: border-box;
  border-radius: var(--bew-panel-radius);
  corner-shape: var(--bew-corner-shape);
  pointer-events: none;
  transition:
    top var(--bew-duration-fast) var(--bew-ease-standard),
    left var(--bew-duration-fast) var(--bew-ease-standard),
    width var(--bew-duration-fast) var(--bew-ease-standard),
    height var(--bew-duration-fast) var(--bew-ease-standard),
    opacity var(--bew-duration-fast) var(--bew-ease-standard);
}

.layout-editor-outline--hovered {
  border: 2px solid var(--bew-theme-focus-ring);
  box-shadow: 0 0 0 3px var(--bew-theme-color-20);
}

.layout-editor-outline--selected {
  border: 2px solid var(--bew-theme-color);
  box-shadow:
    0 0 0 4px var(--bew-theme-color-20),
    var(--bew-shadow-2);
}

.layout-editor-menu {
  position: fixed;
  display: flex;
  width: min(var(--layout-editor-action-menu-width), calc(100vw - var(--bew-space-4) * 2));
  padding: var(--bew-space-3);
  flex-direction: column;
  gap: var(--bew-space-3);
  color: var(--bew-text-1);
  background: var(--bew-elevated-alt);
  border: 1px solid var(--bew-surface-border-color);
  border-radius: var(--bew-popover-radius);
  backdrop-filter: var(--bew-filter-glass-1);
  box-shadow: var(--bew-shadow-4), var(--bew-shadow-edge-glow-1);
  pointer-events: auto;
}

.layout-editor-menu--solid {
  background: var(--bew-elevated-alt-solid);
  backdrop-filter: none;
}

.layout-editor-menu__header {
  display: flex;
  gap: var(--bew-space-2);
  align-items: flex-start;
  justify-content: space-between;

  strong {
    font-size: var(--bew-font-size-title);
    font-weight: var(--bew-font-weight-semibold);
    line-height: var(--bew-line-height-title);
  }

  span {
    flex: 0 0 auto;
    color: var(--bew-text-2);
    font-size: var(--bew-font-size-caption);
    line-height: var(--bew-line-height-caption);
  }
}

.layout-editor-menu__actions,
.layout-editor-menu__footer {
  display: flex;
  gap: var(--bew-space-2);
}

.layout-editor-menu__actions > *,
.layout-editor-menu__footer > * {
  flex: 1 1 0;
}

.layout-editor-menu__control {
  display: grid;
  gap: var(--bew-space-2);

  span {
    color: var(--bew-text-2);
    font-size: var(--bew-font-size-caption);
    line-height: var(--bew-line-height-caption);
  }

  select {
    width: 100%;
    height: var(--bew-control-height);
    padding: 0 var(--bew-space-3);
    color: var(--bew-text-1);
    background: var(--bew-content-solid);
    border: 1px solid var(--bew-surface-border-color);
    border-radius: var(--bew-interactive-radius);
    corner-shape: var(--bew-corner-shape);
    outline: none;

    &:focus-visible {
      border-color: var(--bew-theme-focus-ring);
      box-shadow: 0 0 0 2px var(--bew-theme-focus-ring);
    }
  }
}

.layout-editor-menu__footer {
  justify-content: flex-end;
  padding-top: var(--bew-space-1);
  border-top: 1px solid var(--bew-border-color);
}

.layout-editor-context-menu {
  position: fixed;
  display: flex;
  min-width: var(--layout-editor-context-menu-width);
  padding: var(--bew-space-2);
  flex-direction: column;
  gap: var(--bew-space-1);
  pointer-events: auto;

  button {
    display: flex;
    min-height: var(--bew-control-item-height);
    padding: var(--bew-space-2) var(--bew-space-3);
    gap: var(--bew-space-2);
    align-items: center;
    color: var(--bew-text-1);
    border-radius: var(--bew-interactive-radius);
    corner-shape: var(--bew-corner-shape);
    font-size: var(--bew-font-size-control);
    font-weight: var(--bew-font-weight-medium);
    line-height: var(--bew-line-height-control);
    text-align: left;

    &:hover,
    &:focus-visible {
      background: var(--bew-fill-2);
    }

    &:focus-visible {
      outline: 2px solid var(--bew-theme-focus-ring);
      outline-offset: -2px;
    }
  }

  svg {
    width: var(--bew-icon-size-md);
    height: var(--bew-icon-size-md);
  }
}

:global(body.bewly-layout-editing),
:global(#bewly.bewly-layout-editing),
:global(.bewly-wrapper.bewly-layout-editing) {
  cursor: default;
  overscroll-behavior-x: none;
}

:global(.bewly-wrapper.bewly-layout-editing) {
  touch-action: pan-y;
}

:global(body.bewly-layout-editing [data-layout-editable-id]),
:global(#bewly.bewly-layout-editing [data-layout-editable-id]),
:global(.bewly-wrapper.bewly-layout-editing [data-layout-editable-id]) {
  pointer-events: none !important;
}

:global(body.bewly-layout-editing [data-layout-editor-control]),
:global(#bewly.bewly-layout-editing [data-layout-editor-control]),
:global(.bewly-wrapper.bewly-layout-editing [data-layout-editor-control]) {
  pointer-events: auto !important;
}

@media (prefers-reduced-motion: reduce) {
  .layout-editor-outline {
    transition-duration: 1ms;
  }
}
</style>
