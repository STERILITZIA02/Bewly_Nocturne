<script setup lang="ts">
import { computed, nextTick, ref, useId, watch } from 'vue'

import { useSpringValue } from '~/composables/useSpringValue'
import { SIDEBAR_HEADING_MOTION } from '~/utils/motionPriority'
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
/**
 * The wheel is a ring: the cursor counts steps without bounds so stepping past
 * the last item keeps moving forward onto the first (and back), and the item
 * shown is the cursor modulo the item count.
 */
const cursor = ref(selectedIndex.value)
const cursorIndex = computed(() => wrapIndex(cursor.value))
const position = useSpringValue(() => cursor.value, () => {
  const duration = root.value ? getMotionDuration(getComputedStyle(root.value), '--bew-duration-normal') : 200
  // Read when the target changes: multi-step jumps (Home/End, external
  // selection) take longer than a single step, up to the 300ms ceiling.
  return getTravelDuration(duration, Math.abs(cursor.value - position.value)) / 1000
}, SIDEBAR_HEADING_MOTION)
const wheelStepper = createWheelStepper()
let interactionGeneration = 0

watch(selectedIndex, index => moveCursorTo(index))
watch(() => props.scope, () => {
  interactionGeneration++
  moveCursorTo(selectedIndex.value)
  wheelStepper.reset()
}, { flush: 'sync' })

function wrapIndex(step: number) {
  const count = props.items.length || 1
  return ((step % count) + count) % count
}

/** Signed distance from `from` to item `index` the short way around the ring. */
function ringDistance(index: number, from: number) {
  const count = props.items.length || 1
  const distance = index - from
  return distance - count * Math.round(distance / count)
}

function moveCursorTo(index: number) {
  cursor.value += ringDistance(index, cursor.value)
}

function itemStyle(index: number) {
  const distance = ringDistance(index, position.value)
  // A short arc keeps adjacent labels readable without a second render tree.
  const angle = Math.max(-90, Math.min(90, distance * 24))
  return {
    transform: `translateY(calc(${Math.sin(angle * Math.PI / 180)} * var(--bew-wheel-radius))) rotateX(${-angle}deg) scale(${1 - (1 - 13 / 24) * Math.min(1, Math.abs(distance))})`,
    opacity: Math.max(0, Math.min(1, 2 - Math.abs(distance))),
    pointerEvents: Math.abs(ringDistance(index, cursor.value)) > 1 ? 'none' as const : undefined,
  }
}

function select(index: number, step?: -1 | 1) {
  const item = props.items[index]
  if (!item)
    return
  if (step) {
    // Arrive from the neighbour the wheel left, so the ring turns the same way
    // across the ends.
    cursor.value += ringDistance(wrapIndex(index - step), cursor.value) + step
  }
  else {
    moveCursorTo(index)
  }
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
  const index = cursorIndex.value
  // Arrow keys step around the ring; Home/End jump to the first/last item.
  const step = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0
  const next = step
    ? wrapIndex(index + step)
    : event.key === 'Home' ? 0 : event.key === 'End' ? props.items.length - 1 : -1
  if (next < 0 || next === index)
    return
  event.preventDefault()
  // Focus previews a category; Enter/Space commits it, so browsing the wheel
  // with a keyboard does not fetch or mark every intermediate feed as read.
  if (step)
    cursor.value += step
  else
    moveCursorTo(next)
  const generation = interactionGeneration
  await nextTick()
  if (generation === interactionGeneration)
    root.value?.querySelector<HTMLButtonElement>(`[data-wheel-index="${next}"]`)?.focus({ preventScroll: true })
}

function handleWheel(event: WheelEvent) {
  if (event.ctrlKey || Math.abs(event.deltaX) > Math.abs(event.deltaY) || !event.deltaY)
    return
  if (props.items.length < 2)
    return
  event.preventDefault()
  // The spring retains its position and velocity across consecutive commits;
  // past either end the wheel carries on around to the other.
  const direction = wheelStepper.step(event.deltaY, event.deltaMode, event.timeStamp)
  if (direction)
    select(wrapIndex(selectedIndex.value + direction), direction)
}

function resetPreview(event: FocusEvent) {
  if (!(event.relatedTarget instanceof Node) || !root.value?.contains(event.relatedTarget))
    moveCursorTo(selectedIndex.value)
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
        :tabindex="cursorIndex === index ? 0 : -1"
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
@use "../styles/truncateFade";
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
  @include truncateFade.line;
}

.wheel-selector__badge {
  flex: 0 0 auto;
  font-size: var(--bew-font-size-caption);
  font-family: var(--bew-fonts-monospace);
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
