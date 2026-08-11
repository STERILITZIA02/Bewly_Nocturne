<script setup lang="ts">
import { useBewlyApp } from '~/composables/useAppProvider'
import { useFloatingMenuPosition } from '~/composables/useFloatingMenuPosition'

const props = withDefaults(defineProps<{
  options: readonly OptionType[]
  modelValue: any
  disabled?: boolean
  ariaLabel?: string
}>(), {
  disabled: false,
})

const emit = defineEmits(['update:modelValue', 'change'])

interface OptionType {
  value: any
  label: string
}

const { mainAppRef } = useBewlyApp()

// UX 上限：菜单不应无限高，实际高度始终与可用空间取小
const DROPDOWN_MAX_HEIGHT = 300

const label = ref<string>('')
const showOptions = ref<boolean>(false)
const containerRef = ref<HTMLElement | null>(null)
const triggerRef = ref<HTMLElement | null>(null)
const dropdownRef = ref<HTMLElement | null>(null)
const {
  position: dropdownPosition,
  scheduleUpdate: schedulePositionUpdate,
  start: startPositionTracking,
  stop: stopPositionTracking,
} = useFloatingMenuPosition(containerRef, dropdownRef, DROPDOWN_MAX_HEIGHT)

onUpdated(() => {
  // fix the issue when the dropdown menu text doesn't update in real-time based on the updated page language
  if (props.options)
    label.value = `${props.options.find((item: OptionType) => item.value === props.modelValue)?.label}`
})

onMounted(() => {
  if (props.options)
    label.value = `${props.options.find((item: OptionType) => item.value === props.modelValue)?.label}`
})

function openOptions() {
  if (props.disabled)
    return

  // 先写好坐标再挂载，避免 enter 动画把 top/left 从 0 过渡到真实位置（左上角飞入）
  startPositionTracking()
  showOptions.value = true
}

function toggleOptions() {
  if (props.disabled)
    return

  if (showOptions.value)
    showOptions.value = false
  else
    openOptions()
}

function getOptionElements(): HTMLElement[] {
  return Array.from(dropdownRef.value?.querySelectorAll<HTMLElement>('[data-select-option]') || [])
}

async function focusOption(index: number) {
  await nextTick()
  const options = getOptionElements()
  options.at(Math.min(Math.max(index, 0), options.length - 1))?.focus()
}

function onTriggerKeydown(event: KeyboardEvent) {
  if (props.disabled)
    return

  if (event.key === 'Escape') {
    closeOptions()
    return
  }

  if (!['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(event.key))
    return

  event.preventDefault()
  if (!showOptions.value)
    openOptions()
  const selectedIndex = props.options.findIndex(option => option.value === props.modelValue)
  void focusOption(event.key === 'ArrowUp'
    ? (selectedIndex >= 0 ? selectedIndex : props.options.length - 1)
    : (selectedIndex >= 0 ? selectedIndex : 0))
}

function onDropdownKeydown(event: KeyboardEvent) {
  const options = getOptionElements()
  const activeIndex = options.indexOf(document.activeElement as HTMLElement)
  if (event.key === 'Escape') {
    event.preventDefault()
    closeOptions()
    triggerRef.value?.focus()
  }
  else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    const step = event.key === 'ArrowDown' ? 1 : -1
    options[(activeIndex + step + options.length) % options.length]?.focus()
  }
  else if (event.key === 'Home' || event.key === 'End') {
    event.preventDefault()
    options[event.key === 'Home' ? 0 : options.length - 1]?.focus()
  }
}

// 打开后再用真实内容高度校正方向与 maxHeight（此时坐标已接近正确，不再从 0,0 起步）
watch(showOptions, async (visible) => {
  if (!visible) {
    stopPositionTracking()
    return
  }

  await nextTick()
  schedulePositionUpdate()
}, { flush: 'post' })

watch(() => props.disabled, (disabled) => {
  if (disabled) {
    showOptions.value = false
    window.removeEventListener('click', closeOptions)
  }
})

function onClickOption(val: OptionType) {
  if (props.disabled)
    return

  window.removeEventListener('click', closeOptions)
  label.value = val.label
  emit('update:modelValue', val.value)
  emit('change', val.value)
  showOptions.value = false
}

function closeOptions() {
  showOptions.value = false
}

/** when you click on it outside, the selection option will be turned off  */
function onMouseLeave() {
  if (!props.disabled)
    window.addEventListener('click', closeOptions)
}

function onMouseEnter() {
  window.removeEventListener('click', closeOptions)
}

onBeforeUnmount(() => window.removeEventListener('click', closeOptions))
</script>

<template>
  <div
    ref="containerRef"
    pos="relative"
    @mouseleave="onMouseLeave"
    @mouseenter="onMouseEnter"
  >
    <div
      ref="triggerRef"
      class="select-trigger"
      :class="{ 'is-disabled': props.disabled }"
      role="combobox"
      aria-haspopup="listbox"
      :aria-label="props.ariaLabel"
      :aria-expanded="showOptions"
      :aria-disabled="props.disabled"
      :tabindex="props.disabled ? -1 : 0"
      p="x-4 y-2"
      bg="$bew-fill-1"
      rounded="$bew-interactive-radius"
      border="1 $bew-surface-border-color"
      box-border
      text="center $bew-text-1"
      cursor="pointer"
      flex="~"
      justify="between"
      items="center" w="full"
      :ring="showOptions ? '2px $bew-theme-color' : ''" duration-300
      @click="toggleOptions"
      @keydown="onTriggerKeydown"
    >
      <div
        truncate
        overflow="hidden"
        m="r-2"
        v-text="label === 'undefined' ? '' : label"
      />

      <div class="select-arrow-slot" flex="none" grid place-items="center" m="l-2">
        <!-- arrow -->
        <div
          class="select-arrow"
          border="~ solid t-0 l-0 r-2 b-2"
          :border-color="showOptions ? '$bew-theme-color' : '$bew-fill-4'"
          p="3px"
          display="inline-block"
          :transform="`~ ${!showOptions ? 'rotate-45 -translate-y-1/4' : 'rotate-225 translate-y-1/4'} `"
          transition="background-color duration-200, border-color duration-200, transform duration-200"
        />
      </div>
    </div>

    <Teleport :to="mainAppRef">
      <Transition :name="dropdownPosition.openUp ? 'dropdown-up' : 'dropdown'">
        <div
          v-if="showOptions"
          ref="dropdownRef"
          class="bew-popover-surface"
          role="listbox"
          :style="{
            top: `${dropdownPosition.top}px`,
            left: `${dropdownPosition.left}px`,
            width: `${dropdownPosition.width}px`,
            maxHeight: `${dropdownPosition.maxHeight}px`,
            transform: dropdownPosition.openUp ? 'translateY(-100%)' : undefined,
          }"
          pos="fixed" p="2"
          z="$bew-z-control-menu" flex="~ col gap-1"
          w="full" overflow-y-overlay will-change-transform
          @keydown="onDropdownKeydown"
        >
          <button
            v-for="option in options"
            :key="option.value"
            data-select-option
            type="button"
            role="option"
            :aria-selected="option.value === modelValue"
            p="x-2 y-2"
            rounded="$bew-interactive-radius"
            w="full"
            bg="hover:$bew-fill-2"
            transition="background-color duration-200, border-color duration-200, transform duration-200"
            cursor="pointer"
            @click="onClickOption(option)"
          >
            <span v-text="option.label" />
          </button>
        </div>
      </Transition>

      <!-- 遮罩 外部滚动时关闭下拉菜单 -->
      <div
        v-if="showOptions"
        pos="fixed top-0 left-0" w-full h-full
        z="$bew-z-control-backdrop"
      />
    </Teleport>
  </div>
</template>

<style lang="scss" scoped>
.select-trigger {
  transition: background-color var(--bew-duration-normal) var(--bew-ease-standard);
}

[data-select-option] {
  border: 0;
  color: inherit;
  font: inherit;
  text-align: start;
}

.select-trigger:hover {
  background-color: var(--bew-fill-2);
}

.select-trigger.is-disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.select-trigger.is-disabled:hover {
  background-color: var(--bew-fill-1);
}

// 向上弹出时的过渡：方向与全局 .dropdown（向下开）相反
// 使用独立的 translate 属性而非 transform，避免覆盖定位用的 inline transform
// 不要 transition: all，否则二次校正坐标时会带动 top/left 飞入
.dropdown-up-enter-active,
.dropdown-up-leave-active {
  transition:
    opacity 300ms ease,
    translate 300ms ease,
    filter 300ms ease;
}

.dropdown-up-enter-from,
.dropdown-up-leave-to {
  opacity: 0;
  translate: 0 12px;
  filter: blur(4px);
}
</style>
