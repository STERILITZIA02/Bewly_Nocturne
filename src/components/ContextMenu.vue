<script setup lang="ts">
import { useEventListener } from '@vueuse/core'
import type { CSSProperties } from 'vue'

import { useBewlyApp } from '~/composables/useAppProvider'
import { DIALOG_FOCUS_OWNER, getDeepActiveElement, restoreOverlayFocus } from '~/utils/dialogFocus'
import { computeAnchoredFloatingMenuPosition } from '~/utils/floatingMenu'

export interface ContextMenuOption {
  value: string | number
  label: string
  icon: string
  danger?: boolean
}

const props = defineProps<{
  options: ContextMenuOption[]
  anchor: { x: number, y: number }
  trigger?: HTMLElement | null
}>()

const emit = defineEmits<{
  (event: 'select', value: string | number): void
  (event: 'close'): void
}>()

const { mainAppRef } = useBewlyApp()
const dialogOwner = inject(DIALOG_FOCUS_OWNER, undefined)
const menuRef = ref<HTMLElement | null>(null)
const menuStyles = ref<CSSProperties>({ position: 'fixed', visibility: 'hidden' })
let resizeObserver: ResizeObserver | undefined
let previousFocus: HTMLElement | null = null
let focusRestored = false
let disposed = false

function menuItems() {
  return Array.from(menuRef.value?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])
}

function focusItem(index: number) {
  const items = menuItems()
  if (disposed || items.length === 0)
    return
  const item = items[(index + items.length) % items.length]
  item.focus({ preventScroll: true })
  item.scrollIntoView({ block: 'nearest' })
}

function restoreMenuFocus() {
  if (focusRestored)
    return
  focusRestored = true
  restoreOverlayFocus(menuRef.value, previousFocus)
}

function handleKeydown(event: KeyboardEvent) {
  if (event.defaultPrevented || event.isComposing || event.keyCode === 229)
    return
  const items = menuItems()
  const index = items.indexOf(getDeepActiveElement(document) as HTMLButtonElement)
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End') {
    event.preventDefault()
    event.stopPropagation()
    focusItem(event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : event.key === 'ArrowDown' ? index + 1 : index <= 0 ? items.length - 1 : index - 1)
  }
  else if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    emit('close')
  }
  else if (event.key === 'Tab') {
    // Restore the trigger before the browser performs its normal Tab movement.
    restoreMenuFocus()
    emit('close')
  }
  else if (event.key === 'Enter' || event.key === ' ') {
    event.stopPropagation()
  }
}

function updatePosition() {
  const menu = menuRef.value
  if (!menu)
    return
  const width = menu.getBoundingClientRect().width
  const x = Math.max(0, Math.min(props.anchor.x, window.innerWidth))
  const y = Math.max(0, Math.min(props.anchor.y, window.innerHeight))
  const position = computeAnchoredFloatingMenuPosition({
    top: y,
    bottom: y,
    left: x - width,
    right: x,
    width,
  }, menu.scrollHeight, window.innerWidth, window.innerHeight, window.innerHeight)
  menuStyles.value = {
    position: 'fixed',
    top: `${position.top}px`,
    left: `${position.left}px`,
    maxHeight: `${position.maxHeight}px`,
    transform: position.openUp ? 'translateY(-100%)' : undefined,
  }
}

onMounted(() => {
  const active = props.trigger ?? getDeepActiveElement(document)
  previousFocus = active instanceof HTMLElement ? active : null
  updatePosition()
  resizeObserver = new ResizeObserver(updatePosition)
  if (menuRef.value)
    resizeObserver.observe(menuRef.value)
  focusItem(0)
})
watch(() => props.anchor, () => void nextTick(updatePosition))
watch(() => props.options, async () => {
  await nextTick()
  if (!disposed && !menuRef.value?.contains(getDeepActiveElement(document)))
    focusItem(0)
})
useEventListener(window, 'resize', updatePosition, { passive: true })
onBeforeUnmount(() => {
  disposed = true
  resizeObserver?.disconnect()
  restoreMenuFocus()
})
</script>

<template>
  <Teleport :to="mainAppRef">
    <div
      ref="menuRef"
      class="context-menu-container bew-popover-surface"
      :style="[menuStyles, dialogOwner ? { zIndex: 'var(--bew-z-control-menu)' } : undefined]"
      role="menu"
      :data-bewly-dialog-owner="dialogOwner"
      :aria-label="trigger?.getAttribute('aria-label') || undefined"
      @keydown="handleKeydown"
    >
      <ul role="presentation" flex="~ col gap-1">
        <li
          v-for="option in options"
          :key="option.value"
          role="presentation"
        >
          <button
            type="button"
            role="menuitem"
            tabindex="-1"
            class="context-menu-item"
            :class="{ danger: option.danger }"
            @click="emit('select', option.value); emit('close')"
          >
            <i class="item-icon" :class="option.icon" aria-hidden="true" />
            {{ option.label }}
          </button>
        </li>
      </ul>
    </div>

    <!-- 点击遮罩关闭菜单 -->
    <div
      pos="fixed top-0 left-0" w-full h-full
      style="z-index: var(--bew-z-context-backdrop);"
      :style="dialogOwner ? { zIndex: 'var(--bew-z-control-backdrop)' } : undefined"
      @click="emit('close')"
    />
  </Teleport>
</template>

<style lang="scss" scoped>
.context-menu-container {
  z-index: var(--bew-z-popover);
  width: max-content;
  min-width: min(140px, calc(100vw - var(--bew-space-4)));
  max-width: calc(100vw - var(--bew-space-4));
  box-sizing: border-box;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: var(--bew-space-1);
}

.context-menu-item {
  --uno: "hover:bg-$bew-fill-2 rounded-$bew-interactive-radius cursor-pointer";
  --uno: "flex items-center";

  min-height: 32px;
  width: 100%;
  text-align: left;
  padding: var(--bew-space-2);
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-medium);
  line-height: var(--bew-line-height-control);

  &.danger {
    color: var(--bew-error-color);

    .item-icon {
      color: var(--bew-error-color);
    }
  }
}

.item-icon {
  --uno: "inline-block";

  width: var(--bew-control-icon-size);
  height: var(--bew-control-icon-size);
  margin-right: var(--bew-space-2);
}
</style>
