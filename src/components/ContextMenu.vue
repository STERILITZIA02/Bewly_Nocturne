<script setup lang="ts">
import { useEventListener } from '@vueuse/core'
import type { CSSProperties } from 'vue'

import { useBewlyApp } from '~/composables/useAppProvider'
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
}>()

const emit = defineEmits<{
  (event: 'select', value: string | number): void
  (event: 'close'): void
}>()

const { mainAppRef } = useBewlyApp()
const menuRef = ref<HTMLElement | null>(null)
const menuStyles = ref<CSSProperties>({ position: 'fixed', visibility: 'hidden' })
let resizeObserver: ResizeObserver | undefined

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
  updatePosition()
  resizeObserver = new ResizeObserver(updatePosition)
  if (menuRef.value)
    resizeObserver.observe(menuRef.value)
})
watch(() => props.anchor, () => void nextTick(updatePosition))
useEventListener(window, 'resize', updatePosition, { passive: true })
onBeforeUnmount(() => resizeObserver?.disconnect())
</script>

<template>
  <Teleport :to="mainAppRef">
    <div
      ref="menuRef"
      class="context-menu-container bew-popover-surface"
      :style="menuStyles"
    >
      <ul flex="~ col gap-1">
        <li
          v-for="option in options"
          :key="option.value"
          class="context-menu-item"
          :class="{ danger: option.danger }"
          @click="emit('select', option.value); emit('close')"
        >
          <i class="item-icon" :class="option.icon" />
          {{ option.label }}
        </li>
      </ul>
    </div>

    <!-- 点击遮罩关闭菜单 -->
    <div
      pos="fixed top-0 left-0" w-full h-full
      style="z-index: var(--bew-z-context-backdrop);"
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
