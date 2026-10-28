<script setup lang="ts">
import type { CSSProperties } from 'vue'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { useBewlyApp } from '~/composables/useAppProvider'
import { LAYOUT_EDITOR_LAYOUT } from '~/constants/layout'
import {
  activeLayoutEditPreviewSettingId,
  activeLayoutEditPreviewValue,
  activeLayoutEditTargetElement,
  activeLayoutEditTargetId,
  beginLayoutEditSettingPreview,
  completeLayoutEditMode,
  exitLayoutEditMode,
  findVisualEditTarget,
  getLayoutEditableDescriptor,
  getRegisteredLayoutEditableElement,
  getSettingDescriptor,
  isLayoutEditing,
  layoutEditableRegistryVersion,
  selectVisualEditElement,
  updateLayoutEditSettingPreview,
  useLayoutEditSettingValue,
} from '~/logic/layoutEdit'
import { getDeepActiveElement, moveDialogTabFocus, restoreOverlayFocus } from '~/utils/dialogFocus'
import { computeAnchoredPopoverPosition } from '~/utils/floatingMenu'
import { getLayoutEditAncestors, getLayoutEditViewport, measureLayoutEditTarget } from '~/utils/layoutEditGeometry'
import type { ViewportFrameReason, ViewportGeometry } from '~/utils/viewportGeometry'
import { invalidateViewportGeometry, subscribeViewportFrame } from '~/utils/viewportGeometry'
import { normalizeWheelDelta } from '~/utils/wheelStep'

import Button from './Button.vue'

const emit = defineEmits<{ openSetting: [settingId: string, origin?: DOMRect] }>()
const { t } = useI18n()
const { scrollViewportRef, mainAppRef } = useBewlyApp()
const supportsTopLayer = 'popover' in HTMLElement.prototype
const dockPosition = useLayoutEditSettingValue('navigation.dock.position', () => getSettingDescriptor('navigation.dock.position')!.get())
const overlayRef = ref<HTMLElement>()
const toolbarRef = ref<HTMLElement>()
const actionMenuRef = ref<HTMLElement>()
const hoveredElement = shallowRef<Element>()
const selectedElement = activeLayoutEditTargetElement
const hoveredGeometry = shallowRef<ReturnType<typeof measureLayoutEditTarget>>()
const selectedGeometry = shallowRef<ReturnType<typeof measureLayoutEditTarget>>()
const actionMenuStyle = shallowRef<CSSProperties>({})
const toolbarStyle = shallowRef<CSSProperties>({ visibility: 'hidden' })
const disposers: Array<() => void> = []
const scrollDisposers = new Map<HTMLElement, () => void>()
const observedElements = new Set<Element>()
const frameElements = shallowRef<HTMLIFrameElement[]>([])
const frameGeometries = shallowRef<{ element: HTMLIFrameElement, style: CSSProperties }[]>([])
let resizeObserver: ResizeObserver | undefined
let geometryObserver: MutationObserver | undefined
let frameOwner: HTMLElement | undefined
let returnFocus: HTMLElement | null = null
let trackedElements: Element[] = []
let mounted = false
let pressedTarget: { element: Element, x: number, y: number, disabled: boolean } | undefined

const selectedDescriptor = computed(() => {
  const descriptor = activeLayoutEditTargetId.value ? getLayoutEditableDescriptor(activeLayoutEditTargetId.value) : undefined
  return descriptor && getSettingDescriptor(descriptor.settingId) ? descriptor : undefined
})
const selectedControlValue = computed(() => {
  const descriptor = selectedDescriptor.value
  if (!descriptor)
    return undefined
  return activeLayoutEditPreviewSettingId.value === descriptor.settingId
    ? activeLayoutEditPreviewValue.value
    : getSettingDescriptor(descriptor.settingId)?.get()
})

function scheduleGeometryUpdate() {
  invalidateViewportGeometry(frameOwner)
}

function clearHover() {
  if (!hoveredElement.value)
    return
  hoveredElement.value = undefined
  hoveredGeometry.value = undefined
}

function handleViewportFrame(_geometry: ViewportGeometry, reason: ViewportFrameReason) {
  if (reason === 'scroll' && hoveredElement.value) {
    clearHover()
    refreshTrackedElements()
  }
  updateGeometry()
}

function refreshTrackedElements() {
  if (!isLayoutEditing.value)
    return
  if (selectedElement.value && !selectedElement.value.isConnected) {
    const descriptor = activeLayoutEditTargetId.value ? getLayoutEditableDescriptor(activeLayoutEditTargetId.value) : undefined
    selectVisualEditElement(descriptor?.region ? getRegisteredLayoutEditableElement(descriptor.id) : undefined)
  }
  if (!hoveredElement.value?.isConnected)
    clearHover()
  const nextTracked = [...new Set([selectedElement.value, hoveredElement.value, getRegisteredLayoutEditableElement('dock'), ...frameElements.value]
    .flatMap(element => element ? getLayoutEditAncestors(element) : []))]
  if (nextTracked.length !== trackedElements.length || nextTracked.some((element, index) => element !== trackedElements[index])) {
    geometryObserver?.disconnect()
    for (const element of nextTracked)
      geometryObserver?.observe(element, { attributes: true, attributeFilter: ['class', 'style', 'hidden', 'inert'] })
  }
  trackedElements = nextTracked
  frameOwner = scrollViewportRef.value ?? document.scrollingElement as HTMLElement
  const scrollOwners = new Set([frameOwner, document.scrollingElement as HTMLElement])
  for (const element of trackedElements) {
    const style = getComputedStyle(element)
    if (element instanceof HTMLElement && /auto|scroll/.test(`${style.overflowX} ${style.overflowY}`))
      scrollOwners.add(element)
  }
  for (const [owner, stop] of scrollDisposers) {
    if (!scrollOwners.has(owner)) {
      stop()
      scrollDisposers.delete(owner)
    }
  }
  for (const owner of scrollOwners) {
    if (!scrollDisposers.has(owner))
      scrollDisposers.set(owner, subscribeViewportFrame(owner, handleViewportFrame))
  }
  const nextObserved = new Set<Element>([...trackedElements, toolbarRef.value, actionMenuRef.value].filter((element): element is Element => Boolean(element)))
  for (const element of observedElements) {
    if (!nextObserved.has(element)) {
      resizeObserver?.unobserve(element)
      observedElements.delete(element)
    }
  }
  for (const element of nextObserved) {
    if (!observedElements.has(element)) {
      resizeObserver?.observe(element)
      observedElements.add(element)
    }
  }
  scheduleGeometryUpdate()
}

function updateGeometry() {
  if (!isLayoutEditing.value)
    return
  // Read both targets and both panels before publishing any reactive styles.
  const selected = selectedElement.value && measureLayoutEditTarget(selectedElement.value)
  const hovered = hoveredElement.value && hoveredElement.value !== selectedElement.value
    ? measureLayoutEditTarget(hoveredElement.value)
    : undefined
  const viewport = getLayoutEditViewport()
  const toolbar = toolbarRef.value?.getBoundingClientRect()
  const menu = actionMenuRef.value?.getBoundingClientRect()
  const frames = frameElements.value.flatMap((element) => {
    const geometry = measureLayoutEditTarget(element)
    return geometry ? [{ element, style: geometry.style }] : []
  })
  const dock = getRegisteredLayoutEditableElement('dock')?.getBoundingClientRect()
  const right = dock && dockPosition.value === 'right' ? Math.min(viewport.right, dock.left - 8) : viewport.right
  const bottom = dock && dockPosition.value === 'bottom' ? Math.min(viewport.bottom, dock.top - 8) : viewport.bottom
  const toolbarTop = Math.max(viewport.top + 8, bottom - (toolbar?.height || 40) - 8)
  const availableHeight = Math.max(0, toolbarTop - viewport.top - 8)
  const width = Math.max(0, right - viewport.left)
  const position = selected && computeAnchoredPopoverPosition({
    ...selected.visible,
    left: selected.visible.left - viewport.left,
    right: selected.visible.right - viewport.left,
    top: selected.visible.top - viewport.top,
    bottom: selected.visible.bottom - viewport.top,
  }, { width: menu?.width || LAYOUT_EDITOR_LAYOUT.actionMenuWidth, height: menu?.height || LAYOUT_EDITOR_LAYOUT.actionMenuFallbackHeight }, width, availableHeight)
  // Track only finite motion on the measured branch (Dock movement and layout transitions).
  const moving = trackedElements.some(element => element.getAnimations().some(animation =>
    animation.timeline === element.ownerDocument.timeline && animation.playState === 'running' && animation.effect?.getComputedTiming().endTime !== Infinity,
  ))
  selectedGeometry.value = selected
  hoveredGeometry.value = hovered
  frameGeometries.value = frames
  toolbarStyle.value = { top: `${toolbarTop}px`, left: `${viewport.left + width / 2}px`, maxWidth: `${Math.max(0, width - 16)}px` }
  actionMenuStyle.value = position
    ? {
        left: `${position.left + viewport.left}px`,
        top: `${position.top + viewport.top}px`,
        width: `${Math.min(LAYOUT_EDITOR_LAYOUT.actionMenuWidth, Math.max(0, width - 32))}px`,
        maxHeight: `${Math.max(0, availableHeight - 32)}px`,
      }
    : {}
  if (moving)
    scheduleGeometryUpdate()
}

function eventIsEditorControl(event: Event) {
  return event.composedPath().some(node => node instanceof HTMLElement && node.hasAttribute('data-layout-editor-control'))
}

function frameTarget(event: Event) {
  const path = event.composedPath()
  const shield = path.find((node): node is HTMLElement => node instanceof HTMLElement && node.hasAttribute('data-layout-editor-frame'))
  if (shield)
    return frameGeometries.value[Number(shield.dataset.layoutEditorFrame)]?.element
}

function eventTarget(event: Event) {
  const frame = frameTarget(event)
  return findVisualEditTarget(frame ? getLayoutEditAncestors(frame) : event.composedPath())
}

function selectElement(element: Element | undefined) {
  selectVisualEditElement(element)
  clearHover()
  refreshTrackedElements()
}

function selectTarget(event: Event) {
  selectElement(eventTarget(event))
}

function handlePointerMove(event: Event) {
  if (eventIsEditorControl(event)) {
    clearHover()
    return
  }
  event.stopImmediatePropagation()
  const target = eventTarget(event)
  if (hoveredElement.value !== target) {
    hoveredElement.value = target
    refreshTrackedElements()
  }
}

function blockInteraction(event: Event) {
  if (eventIsEditorControl(event))
    return
  event.stopImmediatePropagation()
  event.preventDefault()
  if (event.type === 'click' || event.type === 'contextmenu')
    selectTarget(event)
  if (event.type === 'pointerup' && pressedTarget) {
    const pointer = event as PointerEvent
    if (pressedTarget.disabled && Math.hypot(pointer.clientX - pressedTarget.x, pointer.clientY - pressedTarget.y) < 8)
      selectElement(pressedTarget.element)
    pressedTarget = undefined
  }
}

function blockPress(event: Event) {
  if (eventIsEditorControl(event))
    return
  event.stopImmediatePropagation()
  if (event instanceof PointerEvent) {
    const element = eventTarget(event)
    pressedTarget = element ? { element, x: event.clientX, y: event.clientY, disabled: event.composedPath().some(node => node instanceof Element && node.matches(':disabled')) } : undefined
  }
  // Keep native touch scrolling; the subsequent click only selects an object.
  if (!(event instanceof PointerEvent) || event.pointerType === 'mouse')
    event.preventDefault()
}

function blockHover(event: Event) {
  if (!eventIsEditorControl(event))
    event.stopImmediatePropagation()
}

function handleWheel(event: WheelEvent) {
  if (eventIsEditorControl(event))
    return
  event.stopImmediatePropagation()
  const target = frameTarget(event)
  if (!(target instanceof HTMLIFrameElement))
    return
  event.preventDefault()
  const owner = getLayoutEditAncestors(target).find(element => element instanceof HTMLElement && scrollDisposers.has(element)) as HTMLElement | undefined
  const viewport = owner ?? frameOwner!
  viewport.scrollBy({ left: normalizeWheelDelta(event.deltaX, event.deltaMode, viewport.clientWidth), top: normalizeWheelDelta(event.deltaY, event.deltaMode, viewport.clientHeight), behavior: 'instant' })
}

function handleKeyDown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopImmediatePropagation()
    exitLayoutEditMode()
  }
  else if (event.key === 'Tab' && overlayRef.value) {
    event.stopImmediatePropagation()
    moveDialogTabFocus(overlayRef.value, overlayRef.value, event)
  }
  else if (!eventIsEditorControl(event)) {
    event.stopImmediatePropagation()
    if (event.key === 'Enter' || event.key === ' ')
      event.preventDefault()
  }
}

function updateSelectedPreview(value: unknown) {
  const descriptor = selectedDescriptor.value
  if (descriptor && beginLayoutEditSettingPreview(descriptor.settingId))
    updateLayoutEditSettingPreview(value)
}

function openSelectedSetting() {
  const descriptor = selectedDescriptor.value
  if (!descriptor)
    return
  const origin = selectedGeometry.value?.rect
  completeLayoutEditMode()
  emit('openSetting', descriptor.settingId, origin)
}

function startEditingResources() {
  if (!mounted || disposers.length)
    return
  const active = getDeepActiveElement(document)
  returnFocus = active instanceof HTMLElement ? active : null
  returnFocus?.blur()
  resizeObserver = new ResizeObserver(scheduleGeometryUpdate)
  geometryObserver = new MutationObserver(scheduleGeometryUpdate)
  function listen(target: EventTarget, type: string, listener: EventListener, passive = false) {
    target.addEventListener(type, listener, { capture: true, passive })
    disposers.push(() => target.removeEventListener(type, listener, true))
  }
  const root = mainAppRef.value.getRootNode()
  // enter/leave events inside Shadow DOM do not cross the shadow boundary.
  for (const target of [window, root]) {
    listen(target, 'pointermove', handlePointerMove, true)
    for (const type of ['pointerover', 'pointerout', 'pointerenter', 'pointerleave', 'pointercancel', 'mouseover', 'mouseout', 'mouseenter', 'mouseleave', 'mousemove', 'touchstart', 'touchmove', 'touchend', 'touchcancel'])
      listen(target, type, blockHover, true)
    listen(target, 'wheel', handleWheel as EventListener)
    for (const type of ['pointerdown', 'mousedown'])
      listen(target, type, blockPress)
    for (const type of ['click', 'dblclick', 'auxclick', 'contextmenu', 'pointerup', 'mouseup', 'dragstart', 'selectstart'])
      listen(target, type, blockInteraction)
  }
  listen(window, 'keydown', handleKeyDown as EventListener)
  listen(window, 'keyup', blockHover, true)
  listen(window, 'focusin', (event) => {
    if (event.composedPath().includes(overlayRef.value!) || eventIsEditorControl(event))
      return
    event.stopImmediatePropagation()
    overlayRef.value?.focus({ preventScroll: true })
  })
  listen(window, 'blur', clearHover)
  for (const type of ['transitionrun', 'transitionend', 'transitioncancel', 'animationstart', 'animationend'])
    listen(root, type, scheduleGeometryUpdate, true)
  if (window.visualViewport) {
    listen(window.visualViewport, 'resize', scheduleGeometryUpdate, true)
    listen(window.visualViewport, 'scroll', scheduleGeometryUpdate, true)
  }
  // A transparent shield selects the iframe itself without entering its document.
  function refreshFrames() {
    frameElements.value = [...new Set([...document.querySelectorAll('iframe'), ...mainAppRef.value.querySelectorAll('iframe')])]
    refreshTrackedElements()
  }
  const mutationObserver = new MutationObserver((records) => {
    if (records.some(record => [...record.addedNodes, ...record.removedNodes].some(node => node instanceof Element && (node.matches('iframe') || node.querySelector('iframe')))))
      refreshFrames()
    if (selectedElement.value && !selectedElement.value.isConnected)
      refreshTrackedElements()
  })
  mutationObserver.observe(document.body, { childList: true, subtree: true })
  mutationObserver.observe(root, { childList: true, subtree: true })
  disposers.push(() => mutationObserver.disconnect())
  refreshFrames()
  refreshTrackedElements()
  void nextTick(() => {
    if (!isLayoutEditing.value)
      return
    overlayRef.value?.showPopover?.()
    refreshTrackedElements()
    overlayRef.value?.focus({ preventScroll: true })
  })
}

function stopEditingResources() {
  disposers.splice(0).forEach(dispose => dispose())
  scrollDisposers.forEach(dispose => dispose())
  scrollDisposers.clear()
  resizeObserver?.disconnect()
  resizeObserver = undefined
  geometryObserver?.disconnect()
  geometryObserver = undefined
  observedElements.clear()
  frameOwner = undefined
  trackedElements = []
  hoveredElement.value = undefined
  frameElements.value = []
  frameGeometries.value = []
  pressedTarget = undefined
  hoveredGeometry.value = undefined
  selectedGeometry.value = undefined
  toolbarStyle.value = { visibility: 'hidden' }
  const target = returnFocus
  returnFocus = null
  void nextTick(() => {
    if (!isLayoutEditing.value)
      restoreOverlayFocus(overlayRef.value ?? null, target)
  })
}

watch([activeLayoutEditTargetId, activeLayoutEditTargetElement, layoutEditableRegistryVersion, scrollViewportRef], refreshTrackedElements, { flush: 'post' })
watch(selectedElement, () => selectedGeometry.value = undefined, { flush: 'sync' })
watch(selectedDescriptor, (descriptor) => {
  if (descriptor?.previewControl)
    beginLayoutEditSettingPreview(descriptor.settingId)
})
watch([activeLayoutEditPreviewValue, actionMenuRef], () => {
  refreshTrackedElements()
}, { flush: 'post' })
watch(isLayoutEditing, (active) => {
  if (active)
    startEditingResources()
  else
    stopEditingResources()
}, { flush: 'post' })
onMounted(() => {
  mounted = true
  if (isLayoutEditing.value)
    startEditingResources()
})
onBeforeUnmount(() => {
  mounted = false
  exitLayoutEditMode()
  stopEditingResources()
})
</script>

<template>
  <div
    v-if="isLayoutEditing" ref="overlayRef" class="layout-editor-overlay" tabindex="-1" :popover="supportsTopLayer ? 'manual' : undefined"
    :aria-label="t('layout_editor.quick_edit')" @keydown.stop @keyup.stop
  >
    <div
      ref="toolbarRef" class="layout-editor-toolbar" :style="toolbarStyle" data-layout-editor-control
      role="toolbar" :aria-label="t('layout_editor.quick_edit')"
    >
      <span class="layout-editor-toolbar__title">{{ t('layout_editor.quick_edit') }}</span>
      <Button type="tertiary" size="small" title="Esc" @click="exitLayoutEditMode">
        {{ t('common.operation.cancel') }}
      </Button>
      <Button type="primary" size="small" @click="completeLayoutEditMode">
        {{ t('layout_editor.done') }}
      </Button>
    </div>

    <div
      v-for="(frame, index) in frameGeometries" :key="index" class="layout-editor-frame"
      :data-layout-editor-frame="index" :style="frame.style" aria-hidden="true"
    />
    <div v-if="hoveredGeometry" class="layout-editor-outline layout-editor-outline--hovered" :style="hoveredGeometry.style" aria-hidden="true" />
    <div v-if="selectedGeometry" class="layout-editor-outline" :style="selectedGeometry.style" aria-hidden="true" />

    <section
      v-if="selectedElement && selectedGeometry" ref="actionMenuRef"
      class="layout-editor-menu" :style="actionMenuStyle" data-layout-editor-control
      tabindex="-1" role="region" :aria-label="t('layout_editor.menu_label')"
    >
      <header class="layout-editor-menu__header">
        <span>{{ t(selectedDescriptor?.titleKey ?? 'layout_editor.no_settings') }}</span>
      </header>
      <div v-if="selectedDescriptor?.previewControl" class="layout-editor-menu__choices" role="group" :aria-label="t('layout_editor.preview')">
        <Button
          v-for="option in selectedDescriptor.previewControl.options" :key="String(option.value)"
          type="secondary" size="small" :aria-pressed="Object.is(selectedControlValue, option.value)"
          @click="updateSelectedPreview(option.value)"
        >
          {{ t(option.labelKey) }}
        </Button>
      </div>
      <Button v-if="selectedDescriptor" type="secondary" size="small" @click="openSelectedSetting">
        <template #left>
          <span class="i-tabler:settings" aria-hidden="true" />
        </template>
        {{ t('layout_editor.apply_open_setting') }}
      </Button>
    </section>
  </div>
</template>

<style scoped lang="scss">
.layout-editor-overlay {
  position: fixed;
  z-index: var(--bew-z-layout-editor);
  inset: 0;
  width: auto;
  height: auto;
  max-width: none;
  max-height: none;
  margin: 0;
  padding: 0;
  overflow: visible;
  color: inherit;
  background: transparent;
  border: 0;
  pointer-events: none;

  &::backdrop {
    background: transparent;
    pointer-events: none;
  }
}

.layout-editor-toolbar,
.layout-editor-menu {
  position: fixed;
  display: flex;
  box-sizing: border-box;
  gap: var(--bew-space-2);
  padding: var(--bew-space-2);
  color: var(--bew-text-1);
  background: var(--bew-elevated-alt-solid);
  border: var(--bew-hairline) solid var(--bew-edge-color);
  border-radius: var(--bew-surface-radius);
  corner-shape: var(--bew-corner-shape);
  box-shadow: var(--bew-shadow-2);
  pointer-events: auto;
}

.layout-editor-toolbar {
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  width: max-content;
  translate: -50% 0;
  z-index: 1;
}

.layout-editor-toolbar__title {
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);
}

.layout-editor-frame {
  position: fixed;
  pointer-events: auto;
  touch-action: pan-y;
}

.layout-editor-outline {
  position: fixed;
  box-sizing: border-box;
  border: 1px solid var(--bew-layout-editor-outline-color);
  pointer-events: none;
}

.layout-editor-outline--hovered {
  border-style: dashed;
}

.layout-editor-menu {
  flex-direction: column;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.layout-editor-menu__header {
  display: flex;
  gap: var(--bew-space-2);
  justify-content: space-between;
  align-items: baseline;
  font-size: var(--bew-font-size-title);
  line-height: var(--bew-line-height-title);
}

.layout-editor-menu__choices {
  display: flex;
  flex-wrap: wrap;
  gap: var(--bew-space-1);

  [aria-pressed="true"] {
    background: var(--bew-selected-bg);
    color: var(--bew-text-1);
  }
}
</style>
