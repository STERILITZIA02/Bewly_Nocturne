<script setup lang="ts">
import { useEventListener } from '@vueuse/core'
import type { CSSProperties } from 'vue'

import SkeletonBlock from '~/components/SkeletonBlock.vue'
import { useBewlyApp } from '~/composables/useAppProvider'
import { DIALOG_FOCUS_OWNER, getDeepActiveElement, restoreOverlayFocus } from '~/utils/dialogFocus'
import { computeAnchoredFloatingMenuPosition } from '~/utils/floatingMenu'
import { getMotionDuration } from '~/utils/motionTiming'

interface ContextMenuItem {
  value: string | number
  label: string
  description?: string
  icon: string
  danger?: boolean
  disabled?: boolean
  pending?: boolean
}
export type ContextMenuOption = ContextMenuItem & (
  | { kind?: 'action', closeOnSelect?: boolean, checked?: never }
  | { kind: 'toggle' | 'radio', closeOnSelect: boolean, checked: boolean }
)

const props = withDefaults(defineProps<{
  options: ContextMenuOption[]
  anchor: { x: number, y: number }
  trigger?: HTMLElement | null
  restoreFocus?: boolean
  loading?: boolean
}>(), { restoreFocus: true })

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
let entryAnimation: Animation | undefined

function menuItems() {
  return Array.from(menuRef.value?.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]') ?? []).filter(item => !item.disabled)
}

function focusItem(index: number) {
  const items = menuItems()
  if (disposed)
    return
  if (items.length === 0) {
    menuRef.value?.focus({ preventScroll: true })
    return
  }
  const item = items[(index + items.length) % items.length]
  item.focus({ preventScroll: true })
  item.scrollIntoView({ block: 'nearest' })
}

function restoreMenuFocus() {
  if (focusRestored)
    return
  focusRestored = true
  if (props.restoreFocus === false)
    return
  restoreOverlayFocus(menuRef.value, previousFocus)
}

function selectOption(option: ContextMenuOption) {
  if (option.disabled)
    return
  const closes = option.closeOnSelect !== false
  // Restore before the action opens its next overlay. Unmount must not move
  // focus back out of a Dialog or Settings that the action has just opened.
  if (closes)
    restoreMenuFocus()
  emit('select', option.value)
  if (closes)
    emit('close')
}

function dismissFromPointer() {
  focusRestored = true
  emit('close')
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

onMounted(async () => {
  const active = props.trigger ?? getDeepActiveElement(document)
  previousFocus = active instanceof HTMLElement ? active : null
  updatePosition()
  resizeObserver = new ResizeObserver(updatePosition)
  if (menuRef.value)
    resizeObserver.observe(menuRef.value)
  await nextTick()
  const menu = menuRef.value
  const content = menu?.querySelector('ul')
  if (!disposed && content?.animate && !previousFocus?.matches(':focus-visible') && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const style = getComputedStyle(menu!)
    entryAnimation = content.animate([{ opacity: 0, scale: 0.98 }, { opacity: 1, scale: 1 }], {
      duration: getMotionDuration(style, '--bew-duration-fast', 120),
      easing: style.getPropertyValue('--bew-ease-standard').trim() || 'ease-out',
    })
  }
  focusItem(0)
})
watch(() => props.anchor, () => void nextTick(updatePosition))
watch(() => props.options, async () => {
  const hadFocus = menuRef.value?.contains(getDeepActiveElement(document))
  await nextTick()
  const active = getDeepActiveElement(document)
  const focusWasRemoved = !active || active === document.body || active === document.documentElement || active === menuRef.value
  if (!disposed && hadFocus && focusWasRemoved)
    focusItem(0)
})
useEventListener(window, 'resize', updatePosition, { passive: true })
onBeforeUnmount(() => {
  disposed = true
  entryAnimation?.cancel()
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
      tabindex="-1"
      :aria-busy="loading"
      :data-bewly-dialog-owner="dialogOwner"
      :aria-label="trigger?.getAttribute('aria-label') || undefined"
      @keydown="handleKeydown"
      @contextmenu.prevent.stop
    >
      <ul role="presentation" flex="~ col gap-1">
        <li v-if="loading && !options.length" role="presentation" class="context-menu-loading">
          <SkeletonBlock v-for="index in 3" :key="index" height="var(--bew-control-height-sm)" radius="interactive" />
        </li>
        <li
          v-for="option in options"
          :key="option.value"
          role="presentation"
        >
          <button
            type="button"
            :role="option.kind === 'radio' ? 'menuitemradio' : option.kind === 'toggle' ? 'menuitemcheckbox' : 'menuitem'"
            :aria-checked="option.kind === 'radio' || option.kind === 'toggle' ? option.checked : undefined"
            :disabled="option.disabled"
            tabindex="-1"
            class="context-menu-item"
            :class="{ danger: option.danger }"
            @click="selectOption(option)"
          >
            <i class="item-icon" :class="option.icon" aria-hidden="true" />
            <span class="item-label">{{ option.label }}<small v-if="option.description" class="item-description">{{ option.description }}</small></span>
            <span v-if="option.kind === 'toggle' || option.kind === 'radio'" class="item-check" aria-hidden="true">
              <SkeletonBlock v-if="option.pending" width="var(--bew-control-icon-size)" height="var(--bew-control-icon-size)" />
              <i v-else-if="option.checked" class="i-tabler:check" />
            </span>
          </button>
        </li>
      </ul>
    </div>

    <!-- 点击遮罩关闭菜单 -->
    <div
      pos="fixed top-0 left-0" w-full h-full
      style="z-index: var(--bew-z-context-backdrop);"
      :style="dialogOwner ? { zIndex: 'var(--bew-z-control-backdrop)' } : undefined"
      @click="dismissFromPointer"
      @contextmenu.prevent.stop="dismissFromPointer"
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

  min-height: var(--bew-space-8);
  border: 0;
  background: transparent;
  color: inherit;
  width: 100%;
  text-align: left;
  padding: var(--bew-space-2);
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-medium);
  line-height: var(--bew-line-height-control);

  &:active:not(:disabled) {
    background: var(--bew-fill-3);
  }

  &:disabled {
    opacity: 0.5;
    cursor: default;
  }

  &.danger {
    color: var(--bew-error-color);

    .item-icon {
      color: var(--bew-error-color);
    }
  }
}

.context-menu-container > ul {
  display: flex;
  flex-direction: column;
  gap: var(--bew-space-1);
  list-style: none;
  margin: 0;
  padding: 0;
}

.item-icon {
  --uno: "inline-block";

  width: var(--bew-control-icon-size);
  height: var(--bew-control-icon-size);
  flex: none;
  margin-right: var(--bew-space-2);
}

.item-label {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}

.context-menu-loading {
  display: flex;
  flex-direction: column;
  gap: var(--bew-space-1);
  min-width: var(--bew-layout-sidebar-width);
}

.item-description {
  display: block;
  color: var(--bew-text-3);
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);
  font-weight: var(--bew-font-weight-regular);
}

.item-check {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--bew-control-icon-size);
  height: var(--bew-control-icon-size);
  flex: none;
  margin-left: var(--bew-space-2);
  color: var(--bew-text-1);

  > i {
    display: block;
    width: 100%;
    height: 100%;
  }
}
</style>
