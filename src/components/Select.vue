<script setup lang="ts">
import { onClickOutside } from '@vueuse/core'

import { FORM_FIELD_LABEL_ID } from '~/components/formFieldLabel'
import LoadingRing from '~/components/LoadingRing.vue'
import SkeletonBlock from '~/components/SkeletonBlock.vue'
import { useBewlyApp } from '~/composables/useAppProvider'
import { useFloatingMenuPosition } from '~/composables/useFloatingMenuPosition'
import { DIALOG_FOCUS_OWNER } from '~/utils/dialogFocus'
import { holdMotion } from '~/utils/motionPriority'
import { getMotionDuration } from '~/utils/motionTiming'
import { prefersReducedMotion } from '~/utils/reducedMotion'
import { createSelectOptionKey } from '~/utils/selectOptionKey'

type SelectValue = string | number | boolean | null | undefined

interface OptionType {
  value: SelectValue
  label: string
}

const props = withDefaults(defineProps<{
  options: readonly OptionType[]
  modelValue: SelectValue
  disabled?: boolean
  loading?: boolean
  accessibleLabel?: string
  size?: 'default' | 'compact'
  commitAfterLeave?: boolean
}>(), {
  disabled: false,
  loading: false,
  size: 'default',
})

const emit = defineEmits<{
  'update:modelValue': [value: SelectValue]
  change: [value: SelectValue]
}>()

const { mainAppRef } = useBewlyApp()
const fieldLabelId = inject(FORM_FIELD_LABEL_ID, undefined)
const dialogOwner = inject(DIALOG_FOCUS_OWNER, undefined)

// UX 上限：菜单不应无限高，实际高度始终与可用空间取小
const DROPDOWN_MAX_HEIGHT = 300

const selectInstanceId = getCurrentInstance()?.uid ?? 0
const listboxId = `bew-select-listbox-${selectInstanceId}`
const valueLabelId = `${listboxId}-value`
const label = computed(() => props.options.find(item => Object.is(item.value, props.modelValue))?.label ?? '')
const unavailable = computed(() => props.disabled || props.loading)
const showOptions = ref<boolean>(false)
const keyboardOpened = ref(false)
const activeOptionIndex = ref(-1)
let typedPrefix = ''
let lastTypedAt = 0
const triggerRef = ref<HTMLButtonElement | null>(null)
const containerRef = ref<HTMLElement | null>(null)
const dropdownRef = ref<HTMLElement | null>(null)
let pendingSelection: OptionType | undefined
let releaseMotion: (() => void) | undefined
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
  if (!showOptions.value)
    return
  const option = dropdownRef.value?.querySelector<HTMLElement>(`[data-option-index="${activeOptionIndex.value}"]`)
  option?.focus({ preventScroll: true })
  option?.scrollIntoView({ block: 'nearest' })
}

function openOptions(initialIndex = selectedOptionIndex()) {
  if (unavailable.value || props.options.length === 0)
    return

  pendingSelection = undefined
  activeOptionIndex.value = initialIndex >= 0 ? initialIndex : 0
  // 先写好坐标再挂载，避免 enter 动画把 top/left 从 0 过渡到真实位置（左上角飞入）
  startPositionTracking()
  showOptions.value = true
  void focusOption(activeOptionIndex.value)
}

function closeOptions(restoreFocus = false) {
  showOptions.value = false
  typedPrefix = ''
  if (restoreFocus)
    triggerRef.value?.focus({ preventScroll: true })
}

function toggleOptions(event: MouseEvent) {
  keyboardOpened.value = event.detail === 0
  if (unavailable.value)
    return

  if (showOptions.value)
    closeOptions(true)
  else
    openOptions()
}

function selectOption(option: OptionType) {
  if (unavailable.value)
    return

  if (props.commitAfterLeave)
    pendingSelection = option
  else commitSelection(option)
  closeOptions(true)
}

function commitSelection(option: OptionType) {
  if (Object.is(props.modelValue, option.value))
    return
  emit('update:modelValue', option.value)
  emit('change', option.value)
}

function holdMenuMotion(element: Element) {
  const duration = keyboardOpened.value || prefersReducedMotion() ? 0 : getMotionDuration(getComputedStyle(element), '--bew-duration-fast')
  const previous = releaseMotion
  releaseMotion = holdMotion(duration)
  previous?.()
}
function settleMenuMotion() {
  releaseMotion?.()
  releaseMotion = undefined
}
function finishLeave() {
  settleMenuMotion()
  const selection = pendingSelection
  pendingSelection = undefined
  if (selection && !unavailable.value && props.options.some(option => Object.is(option.value, selection.value)))
    commitSelection(selection)
}
watch(() => props.modelValue, () => {
  pendingSelection = undefined
}, { flush: 'sync' })
onScopeDispose(() => {
  pendingSelection = undefined
  settleMenuMotion()
})

function handleTriggerKeyDown(event: KeyboardEvent) {
  if (event.isComposing)
    return
  keyboardOpened.value = true
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
        event.stopPropagation()
        closeOptions(true)
      }
      break
  }
}

function handleOptionKeyDown(event: KeyboardEvent) {
  if (event.isComposing)
    return
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
    case ' ': {
      event.preventDefault()
      const option = props.options[activeOptionIndex.value]
      if (option)
        selectOption(option)
      break
    }
    case 'Escape':
      event.preventDefault()
      event.stopPropagation()
      closeOptions(true)
      break
    case 'Tab':
      closeOptions()
      break
    default: {
      if (event.key.length !== 1 || event.ctrlKey || event.altKey || event.metaKey)
        return
      event.preventDefault()
      const now = performance.now()
      const key = event.key.toLocaleLowerCase()
      typedPrefix = now - lastTypedAt > 700 || typedPrefix === key ? key : typedPrefix + key
      lastTypedAt = now
      const count = props.options.length
      for (let offset = typedPrefix.length === 1 ? 1 : 0; offset < count + 1; offset++) {
        const index = (Math.max(0, activeOptionIndex.value) + offset) % count
        if (props.options[index].label.toLocaleLowerCase().split(/\s+/).some(word => word.startsWith(typedPrefix))) {
          void focusOption(index)
          break
        }
      }
    }
  }
}

watch(() => props.options, (options, previous) => {
  if (!showOptions.value)
    return
  const active = previous[activeOptionIndex.value]?.value
  const index = options.findIndex(option => Object.is(option.value, active))
  if (index < 0)
    closeOptions(true)
  else activeOptionIndex.value = index
})

// 打开后再用真实内容高度校正方向与 maxHeight（此时坐标已接近正确，不再从 0,0 起步）
watch(showOptions, async (visible, _previous, onCleanup) => {
  if (!visible) {
    stopPositionTracking()
    return
  }

  onCleanup(onClickOutside(dropdownRef, () => closeOptions(), { ignore: [containerRef] }))
  await nextTick()
  schedulePositionUpdate()
}, { flush: 'post' })

watch(unavailable, (disabled) => {
  if (disabled) {
    pendingSelection = undefined
    closeOptions()
  }
})
</script>

<template>
  <div
    ref="containerRef"
    pos="relative"
  >
    <button
      ref="triggerRef"
      type="button"
      class="select-trigger"
      :class="{ 'is-disabled': unavailable, 'select-trigger--compact': size === 'compact' }"
      :disabled="unavailable"
      :aria-busy="loading"
      aria-haspopup="listbox"
      :aria-expanded="showOptions"
      :aria-controls="listboxId"
      :aria-label="accessibleLabel ? `${accessibleLabel}: ${label}` : undefined"
      :aria-labelledby="!accessibleLabel && fieldLabelId ? `${fieldLabelId} ${valueLabelId}` : undefined"
      p="x-4 y-2"
      bg="$bew-input-bg"
      rounded="$bew-interactive-radius"
      border="1 $bew-field-edge-color"
      box-border
      text="center $bew-text-1"
      cursor="pointer"
      flex="~"
      justify="between"
      items="center" w="full"
      duration-300
      @click="toggleOptions"
      @keydown="handleTriggerKeyDown"
    >
      <div
        :id="valueLabelId"
        class="select-value"
        m="r-2"
        :aria-label="loading && !label ? $t('common.loading') : undefined"
      >
        <SkeletonBlock v-if="loading && !label" width="5em" height="1lh" />
        <slot v-else name="value" :label="label" :value="modelValue">
          <span class="keep-one-line">{{ label }}</span>
        </slot>
      </div>

      <div class="select-arrow-slot" flex="none" grid place-items="center" m="l-2">
        <!-- Loading options replaces the arrow in place; an unknown label keeps its line skeleton. -->
        <LoadingRing :loading="Boolean(loading && label)" size="var(--bew-icon-size-xs)">
          <div
            class="select-arrow"
            border="~ solid t-0 l-0 r-2 b-2"
            :border-color="showOptions ? '$bew-focus-ring-color' : '$bew-field-edge-color'"
            p="3px"
            display="inline-block"
            :transform="`~ ${!showOptions ? 'rotate-45 -translate-y-1/4' : 'rotate-225 translate-y-1/4'} `"
            transition="background-color duration-200, border-color duration-200, transform duration-200"
          />
        </LoadingRing>
      </div>
    </button>

    <Teleport :to="mainAppRef">
      <Transition
        :name="dropdownPosition.openUp ? 'dropdown-up' : 'dropdown'" :css="!keyboardOpened"
        @enter="holdMenuMotion" @leave="holdMenuMotion"
        @after-enter="settleMenuMotion" @after-leave="finishLeave"
        @enter-cancelled="settleMenuMotion" @leave-cancelled="settleMenuMotion"
      >
        <div
          v-if="showOptions"
          :id="listboxId"
          ref="dropdownRef"
          class="bew-popover-surface"
          :class="{ 'select-options--compact': size === 'compact' }"
          role="listbox"
          :inert="!showOptions || undefined"
          :data-bewly-dialog-owner="dialogOwner"
          :style="{
            'top': `${dropdownPosition.top}px`,
            'left': `${dropdownPosition.left}px`,
            'width': `${dropdownPosition.width}px`,
            'maxHeight': `${dropdownPosition.maxHeight}px`,
            'transform': dropdownPosition.openUp ? 'translateY(-100%)' : undefined,
            '--bew-dropdown-origin': dropdownPosition.openUp ? 'bottom center' : 'top center',
          }"
          pos="fixed" p="2"
          z="$bew-z-control-menu" flex="~ col gap-1"
          w="full" overflow-y-overlay will-change-transform
        >
          <div
            v-for="(option, index) in options"
            :key="createSelectOptionKey(option.value, index)"
            :data-option-index="index"
            role="option"
            class="select-option"
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
            <slot name="option" :option="option" :selected="Object.is(option.value, modelValue)">
              <span v-text="option.label" />
            </slot>
            <i v-if="Object.is(option.value, modelValue)" i-tabler:check aria-hidden="true" />
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
.select-value {
  flex: 1;
  min-width: 0;
  text-align: start;
}
.select-trigger {
  appearance: none;
  font: inherit;
  transition: background-color var(--bew-duration-normal) var(--bew-ease-standard);
}

.select-trigger:hover {
  background-color: var(--bew-input-bg-hover);
}

.select-trigger:focus-visible,
.select-option:focus-visible {
  outline: var(--bew-focus-ring);
  outline-offset: var(--bew-space-0-5);
}

.select-trigger--compact {
  height: var(--bew-control-height);
  padding: 0 var(--bew-space-3);
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-regular);
  line-height: var(--bew-line-height-control);
}

.select-options--compact .select-option {
  min-height: var(--bew-control-height-sm);
  padding-block: var(--bew-space-1);
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);
}

.select-trigger.is-disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.select-trigger.is-disabled:hover {
  background-color: var(--bew-fill-1);
}

.select-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--bew-space-3);

  &[aria-selected="true"] {
    color: var(--bew-on-theme-surface);
    background: var(--bew-theme-surface);
  }

  i {
    flex: 0 0 var(--bew-icon-size-sm);
  }
}

@media (prefers-reduced-motion: reduce) {
  .select-arrow {
    transition: none;
  }
}
</style>
