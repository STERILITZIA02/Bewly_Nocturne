<script setup lang="ts">
import { useBewlyApp } from '~/composables/useAppProvider'
import { useFloatingMenuPosition } from '~/composables/useFloatingMenuPosition'

type SelectValue = string | number | boolean | null | undefined

interface OptionType {
  value: SelectValue
  label: string
}

const props = withDefaults(defineProps<{
  options: readonly OptionType[]
  modelValue: SelectValue
  disabled?: boolean
}>(), {
  disabled: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: SelectValue]
  change: [value: SelectValue]
}>()

const { mainAppRef } = useBewlyApp()

// UX 上限：菜单不应无限高，实际高度始终与可用空间取小
const DROPDOWN_MAX_HEIGHT = 300

const selectInstanceId = getCurrentInstance()?.uid ?? 0
const listboxId = `bew-select-listbox-${selectInstanceId}`
const label = computed(() => props.options.find(item => Object.is(item.value, props.modelValue))?.label ?? '')
const showOptions = ref<boolean>(false)
const activeOptionIndex = ref(-1)
const triggerRef = ref<HTMLButtonElement | null>(null)
const containerRef = ref<HTMLElement | null>(null)
const dropdownRef = ref<HTMLElement | null>(null)
const {
  position: dropdownPosition,
  scheduleUpdate: schedulePositionUpdate,
  start: startPositionTracking,
  stop: stopPositionTracking,
} = useFloatingMenuPosition(containerRef, dropdownRef, DROPDOWN_MAX_HEIGHT)

function selectedOptionIndex() {
  return props.options.findIndex(option => Object.is(option.value, props.modelValue))
}

async function focusOption(index: number) {
  if (props.options.length === 0)
    return

  activeOptionIndex.value = Math.max(0, Math.min(index, props.options.length - 1))
  await nextTick()
  const option = dropdownRef.value?.querySelector<HTMLElement>(`[data-option-index="${activeOptionIndex.value}"]`)
  option?.focus({ preventScroll: true })
  option?.scrollIntoView({ block: 'nearest' })
}

function openOptions(initialIndex = selectedOptionIndex()) {
  if (props.disabled || props.options.length === 0)
    return

  activeOptionIndex.value = initialIndex >= 0 ? initialIndex : 0
  // 先写好坐标再挂载，避免 enter 动画把 top/left 从 0 过渡到真实位置（左上角飞入）
  startPositionTracking()
  showOptions.value = true
  void focusOption(activeOptionIndex.value)
}

function closeOptions(restoreFocus = false) {
  showOptions.value = false
  window.removeEventListener('click', handleWindowClick)
  if (restoreFocus)
    void nextTick(() => triggerRef.value?.focus())
}

function toggleOptions() {
  if (props.disabled)
    return

  if (showOptions.value)
    closeOptions(true)
  else
    openOptions()
}

function selectOption(option: OptionType) {
  if (props.disabled)
    return

  emit('update:modelValue', option.value)
  emit('change', option.value)
  closeOptions(true)
}

function handleTriggerKeyDown(event: KeyboardEvent) {
  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault()
      openOptions(Math.max(0, selectedOptionIndex()))
      break
    case 'ArrowUp':
      event.preventDefault()
      openOptions(selectedOptionIndex() >= 0 ? selectedOptionIndex() : props.options.length - 1)
      break
    case 'Home':
      event.preventDefault()
      openOptions(0)
      break
    case 'End':
      event.preventDefault()
      openOptions(props.options.length - 1)
      break
    case 'Escape':
      if (showOptions.value) {
        event.preventDefault()
        closeOptions(true)
      }
      break
  }
}

function handleOptionKeyDown(event: KeyboardEvent) {
  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault()
      void focusOption((activeOptionIndex.value + 1) % props.options.length)
      break
    case 'ArrowUp':
      event.preventDefault()
      void focusOption((activeOptionIndex.value - 1 + props.options.length) % props.options.length)
      break
    case 'Home':
      event.preventDefault()
      void focusOption(0)
      break
    case 'End':
      event.preventDefault()
      void focusOption(props.options.length - 1)
      break
    case 'Enter':
    case ' ':
      event.preventDefault()
      if (activeOptionIndex.value >= 0)
        selectOption(props.options[activeOptionIndex.value])
      break
    case 'Escape':
      event.preventDefault()
      closeOptions(true)
      break
    case 'Tab':
      closeOptions()
      break
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
  if (disabled)
    closeOptions()
})

function handleWindowClick() {
  closeOptions()
}

/** when you click on it outside, the selection option will be turned off  */
function onMouseLeave() {
  if (!props.disabled)
    window.addEventListener('click', handleWindowClick)
}

function onMouseEnter() {
  window.removeEventListener('click', handleWindowClick)
}

onBeforeUnmount(() => window.removeEventListener('click', handleWindowClick))
</script>

<template>
  <div
    ref="containerRef"
    pos="relative"
    @mouseleave="onMouseLeave"
    @mouseenter="onMouseEnter"
  >
    <button
      ref="triggerRef"
      type="button"
      class="select-trigger"
      :class="{ 'is-disabled': props.disabled }"
      :disabled="props.disabled"
      aria-haspopup="listbox"
      :aria-expanded="showOptions"
      :aria-controls="listboxId"
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
      @keydown="handleTriggerKeyDown"
    >
      <div
        truncate
        overflow="hidden"
        m="r-2"
        v-text="label"
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
    </button>

    <Teleport :to="mainAppRef">
      <Transition :name="dropdownPosition.openUp ? 'dropdown-up' : 'dropdown'">
        <div
          v-if="showOptions"
          :id="listboxId"
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
        >
          <div
            v-for="(option, index) in options"
            :key="String(option.value)"
            :data-option-index="index"
            role="option"
            :aria-selected="Object.is(option.value, modelValue)"
            :tabindex="activeOptionIndex === index ? 0 : -1"
            p="x-2 y-2"
            rounded="$bew-interactive-radius"
            w="full"
            bg="hover:$bew-fill-2"
            transition="background-color duration-200, border-color duration-200, transform duration-200"
            cursor="pointer"
            @focus="activeOptionIndex = index"
            @keydown="handleOptionKeyDown"
            @click="selectOption(option)"
          >
            <span v-text="option.label" />
          </div>
        </div>
      </Transition>

      <!-- 遮罩 外部滚动时关闭下拉菜单 -->
      <div
        v-if="showOptions"
        aria-hidden="true"
        pos="fixed top-0 left-0" w-full h-full
        z="$bew-z-control-backdrop"
        @click="closeOptions()"
      />
    </Teleport>
  </div>
</template>

<style lang="scss" scoped>
.select-trigger {
  appearance: none;
  font: inherit;
  transition: background-color var(--bew-duration-normal) var(--bew-ease-standard);
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
