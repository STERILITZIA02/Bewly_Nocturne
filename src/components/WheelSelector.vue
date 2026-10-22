<script setup lang="ts">
import { computed, nextTick, ref, useId, watch } from 'vue'

import { useSpringValue } from '~/composables/useSpringValue'
import { getMotionDuration, getTravelDuration } from '~/utils/motionTiming'
import { createWheelStepper } from '~/utils/wheelStep'

const props = defineProps<{
  modelValue: string
  label: string
  panelId: string
  scope?: object
  items: readonly { value: string, label: string, ariaLabel: string, icon?: string, badge?: number }[]
}>()

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void
}>()

const id = useId()
const root = ref<HTMLElement | null>(null)
const selectedIndex = computed(() => Math.max(0, props.items.findIndex(item => item.value === props.modelValue)))
const cursor = ref(selectedIndex.value)
const position = useSpringValue(() => cursor.value, () => {
  const duration = root.value ? getMotionDuration(getComputedStyle(root.value), '--bew-duration-normal') : 200
  // Read when the target changes: multi-step jumps (Home/End, external
  // selection) settle more slowly than a single step.
  return getTravelDuration(duration, Math.abs(cursor.value - position.value)) / 1000
})
const wheelStepper = createWheelStepper()
let interactionGeneration = 0

watch(selectedIndex, index => cursor.value = index)
watch(() => props.scope, () => {
  interactionGeneration++
  cursor.value = selectedIndex.value
  wheelStepper.reset()
}, { flush: 'sync' })

function itemStyle(index: number) {
  const distance = index - position.value
  // A short arc keeps adjacent labels readable without a second render tree.
  const angle = Math.max(-90, Math.min(90, distance * 24))
  return {
    transform: `translateY(calc(${Math.sin(angle * Math.PI / 180)} * var(--bew-wheel-radius))) rotateX(${-angle}deg) scale(${1 - (1 - 13 / 24) * Math.min(1, Math.abs(distance))})`,
    opacity: Math.max(0, Math.min(1, 2 - Math.abs(distance))),
    pointerEvents: Math.abs(index - cursor.value) > 1 ? 'none' as const : undefined,
  }
}

function select(index: number) {
  const item = props.items[index]
  if (!item)
    return
  cursor.value = index
  if (item.value !== props.modelValue)
    emit('update:modelValue', item.value)
  if (root.value?.querySelector('[role="tab"]:focus')) {
    const generation = interactionGeneration
    void nextTick(() => {
      if (generation === interactionGeneration)
        root.value?.querySelector<HTMLButtonElement>(`[data-wheel-index="${index}"]`)?.focus({ preventScroll: true })
    })
  }
}

async function handleKeydown(event: KeyboardEvent) {
  if (event.isComposing || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)
    return
  const index = cursor.value
  const next = event.key === 'ArrowDown'
    ? Math.min(props.items.length - 1, index + 1)
    : event.key === 'ArrowUp'
      ? Math.max(0, index - 1)
      : event.key === 'Home' ? 0 : event.key === 'End' ? props.items.length - 1 : -1
  if (next < 0 || next === index)
    return
  event.preventDefault()
  // Focus previews a category; Enter/Space commits it, so browsing the wheel
  // with a keyboard does not fetch or mark every intermediate feed as read.
  cursor.value = next
  const generation = interactionGeneration
  await nextTick()
  if (generation === interactionGeneration)
    root.value?.querySelector<HTMLButtonElement>(`[data-wheel-index="${next}"]`)?.focus({ preventScroll: true })
}

function handleWheel(event: WheelEvent) {
  if (event.ctrlKey || Math.abs(event.deltaX) > Math.abs(event.deltaY) || !event.deltaY)
    return
  const direction = Math.sign(event.deltaY)
  const next = selectedIndex.value + direction
  if (next < 0 || next >= props.items.length)
    return
  event.preventDefault()
  // The spring retains its position and velocity across consecutive commits.
  if (wheelStepper.step(event.deltaY, event.deltaMode, event.timeStamp))
    select(next)
}

function resetPreview(event: FocusEvent) {
  if (!(event.relatedTarget instanceof Node) || !root.value?.contains(event.relatedTarget))
    cursor.value = selectedIndex.value
}
</script>

<template>
  <div ref="root" class="wheel-selector" @focusout="resetPreview" @wheel="handleWheel">
    <div class="wheel-selector__viewport" role="tablist" aria-orientation="vertical" :aria-label="label">
      <button
        v-for="(item, index) in items"
        :id="`${id}-${item.value}`"
        :key="item.value"
        type="button"
        role="tab"
        class="wheel-selector__item"
        :data-wheel-index="index"
        :data-active="modelValue === item.value"
        :aria-selected="modelValue === item.value"
        :aria-controls="modelValue === item.value ? panelId : undefined"
        :aria-label="item.ariaLabel"
        :tabindex="cursor === index ? 0 : -1"
        :style="itemStyle(index)"
        @keydown="handleKeydown"
        @click="select(index)"
      >
        <i v-if="item.icon" :class="item.icon" aria-hidden="true" />
        <span class="wheel-selector__label">{{ item.label }}</span>
        <span v-if="item.badge && item.badge > 0" class="wheel-selector__badge" aria-hidden="true">
          {{ item.badge > 99 ? '99+' : item.badge }}
        </span>
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.wheel-selector {
  display: block;
  min-width: 0;
  overscroll-behavior: contain;
}

.wheel-selector__viewport {
  position: relative;
  height: var(--bew-wheel-viewport-height);
  // Only the three front-facing rows paint, so the viewport needs no clip.
  overflow: visible;
  perspective: calc(var(--bew-wheel-radius) * 4);
  perspective-origin: left center;
}

.wheel-selector__item {
  --wheel-item-line-height: var(--bew-wheel-label-line-height);

  position: absolute;
  top: calc(50% - var(--wheel-item-line-height) / 2);
  left: var(--bew-space-1);
  display: flex;
  gap: var(--bew-space-2);
  align-items: center;
  justify-content: flex-start;
  height: var(--wheel-item-line-height);
  min-width: 0;
  width: max-content;
  max-width: calc(100% - var(--bew-space-2));
  padding: 0;
  color: var(--bew-wheel-text);
  font-size: var(--bew-wheel-label-size);
  font-weight: var(--bew-wheel-label-weight);
  line-height: var(--wheel-item-line-height);
  text-align: left;
  cursor: pointer;
  background: transparent;
  border: 0;
  border-radius: var(--bew-interactive-radius);
  corner-shape: var(--bew-corner-shape);
  backface-visibility: hidden;
  transform-origin: left center;
  transition: color var(--bew-duration-fast) var(--bew-ease-standard);

  // Keep the visible row at text height while retaining a usable pointer target.
  &::before {
    position: absolute;
    inset: calc(-1 * var(--bew-space-2)) 0;
    content: "";
  }

  &[data-active="true"] {
    color: var(--bew-wheel-text-active);
    &::before {
      inset: 0;
    }
  }

  i {
    flex: 0 0 auto;
    font-size: var(--bew-icon-size-md);
  }
}

.wheel-selector__label {
  line-height: var(--bew-wheel-label-line-height);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.wheel-selector__badge {
  flex: 0 0 auto;
  font-size: var(--bew-font-size-caption);
  font-variant-numeric: tabular-nums;
  opacity: 0;
  transition: opacity var(--bew-duration-moderate) var(--bew-ease-standard);
}

.wheel-selector__item[data-active="true"] .wheel-selector__badge {
  opacity: 1;
}

.wheel-selector button:focus-visible {
  outline: var(--bew-focus-ring);
  outline-offset: var(--bew-space-0-5);
}

.wheel-selector__item:active {
  color: var(--bew-wheel-text-active);
}

@media (hover: hover) {
  .wheel-selector__item:hover {
    color: var(--bew-wheel-text-active);
  }
}

@media (prefers-reduced-motion: reduce) {
  .wheel-selector__item {
    transition: none;
  }
  .wheel-selector__badge {
    transition: none;
  }
}
</style>
