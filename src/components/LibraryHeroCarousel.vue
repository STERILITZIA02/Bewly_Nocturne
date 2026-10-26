<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { LIBRARY_HERO_RENDER_RADIUS } from '~/constants/library'
import { holdAnimation } from '~/utils/motionPriority'
import { getMotionDuration } from '~/utils/motionTiming'
import { normalizeWheelDelta } from '~/utils/wheelStep'

/**
 * The library hero as a row of cards (user-specified): the current one about
 * 85% of the content wide, the next peeking at the right (the previous at the
 * left on the last). Like the strips it passes under the rail glass to the
 * window edges, so the previous card shows under the glass.
 *
 * A sideways trackpad or touch drag moves the row with the gesture, without
 * steps; on release it settles on the neighbour once more than half of it has
 * come in, else back. A tap on a neighbour settles on it. Vertical wheels and
 * drags keep scrolling the page.
 *
 * Motion before content: the settle is a registered animation (transform
 * only), and `select` is emitted when it ends, so the host switches the page
 * (requests, the parts that change, new neighbours) after the motion. The
 * cards stay mounted across a switch. The committed card and
 * `LIBRARY_HERO_RENDER_RADIUS` cards on each side render, so the cards a swipe
 * or two brings in have loaded already.
 *
 * It is pinned under the top bar like the strips and fades as the content
 * after it covers it, from when it is pinned. The host sets
 * `--library-hero-pin` (the scroll before it pins: the strip above it and
 * their spacing), `--library-hero-gap` (the space to the content after it)
 * and `--library-hero-margin` (its own share of that space).
 */
const props = defineProps<{ items: ReadonlyArray<{ key: string, label: string }>, current: string, label: string, disabled?: boolean }>()
const emit = defineEmits<{ (event: 'select', key: string): void }>()
const { t } = useI18n()

const track = ref<HTMLElement | null>(null)
const index = computed(() => Math.max(0, props.items.findIndex(item => item.key === props.current)))
const last = computed(() => props.items.length > 1 && index.value === props.items.length - 1)
// A gesture ends after this long without wheel events (its inertial tail included).
const WHEEL_IDLE_MS = 140
// Past an end the row follows at this fraction of the gesture.
const EDGE_RESISTANCE = 0.3

interface Drag { base: number, offset: number, step: number, frame: number, idle?: ReturnType<typeof setTimeout> }
let drag: Drag | undefined
let settling: Animation | undefined
let touch: { id: number, x: number, y: number, lastX: number, horizontal?: boolean } | undefined
let dragged = false
onBeforeUnmount(() => {
  settling?.cancel()
  if (drag) {
    cancelAnimationFrame(drag.frame)
    clearTimeout(drag.idle)
  }
})

function placeTrack(element: HTMLElement, target: number) {
  element.style.setProperty('--carousel-index', String(target))
  element.style.setProperty('--carousel-end-shift', props.items.length > 1 && target === props.items.length - 1 ? '1' : '0')
}
function trackX(element: HTMLElement) {
  return new DOMMatrixReadOnly(getComputedStyle(element).transform).m41
}
// A card's resting position, read with its index applied for one style pass.
function restingX(element: HTMLElement, target: number) {
  placeTrack(element, target)
  const x = trackX(element)
  placeTrack(element, index.value)
  return x
}
function canMove() {
  return props.items.length > 1 && !props.disabled && !settling
}

function beginDrag() {
  const element = track.value
  if (drag || !element || !canMove())
    return drag
  const card = element.children[index.value] as HTMLElement | undefined
  const gap = Number.parseFloat(getComputedStyle(element).columnGap) || 0
  drag = { base: trackX(element), offset: 0, step: (card?.offsetWidth ?? 0) + gap, frame: 0 }
  return drag
}
// `delta` > 0 brings the next card in. The row is written once a frame.
function moveDrag(delta: number) {
  const current = drag ?? beginDrag()
  if (!current || !current.step)
    return
  current.offset = Math.max(-current.step, Math.min(current.step, current.offset + delta))
  if (current.frame)
    return
  current.frame = requestAnimationFrame(() => {
    current.frame = 0
    const element = track.value
    const toward = current.offset > 0 ? index.value + 1 : index.value - 1
    const resisted = props.items[toward] ? current.offset : current.offset * EDGE_RESISTANCE
    if (element && drag === current)
      element.style.transform = `translateX(${current.base - resisted}px)`
  })
}
function endDrag() {
  const current = drag
  if (!current)
    return
  drag = undefined
  cancelAnimationFrame(current.frame)
  clearTimeout(current.idle)
  const direction = Math.abs(current.offset) > current.step / 2 ? Math.sign(current.offset) : 0
  const target = props.items[index.value + direction] ? index.value + direction : index.value
  settle(target, current.step)
}
function settle(target: number, step?: number) {
  const element = track.value
  if (!element)
    return
  const from = element.style.transform || getComputedStyle(element).transform
  element.style.transform = ''
  const fromX = new DOMMatrixReadOnly(from).m41
  const toX = restingX(element, target)
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const full = reduced ? 0 : getMotionDuration(getComputedStyle(element), '--bew-duration-moderate', 300)
  // The rest of the way takes its share of the time, never too abrupt.
  const share = step ? Math.min(1, Math.max(0.35, Math.abs(toX - fromX) / step)) : 1
  const finish = () => {
    if (target !== index.value)
      emit('select', props.items[target].key)
  }
  if (!full || Math.abs(toX - fromX) < 1) {
    finish()
    return
  }
  const animation = settling = element.animate([{ transform: `translateX(${fromX}px)` }, { transform: `translateX(${toX}px)` }], {
    duration: full * share,
    easing: 'cubic-bezier(0.2, 0, 0, 1)',
    fill: 'forwards',
  })
  holdAnimation(animation)
  void animation.finished.then(async () => {
    finish()
    // Hold the end frame until the committed index has moved the row there.
    await nextTick()
    animation.cancel()
    settling = undefined
  }, () => {
    settling = undefined
  })
}

function handleWheel(event: WheelEvent) {
  if (event.ctrlKey || event.defaultPrevented || Math.abs(event.deltaX) <= Math.abs(event.deltaY) || !(drag || canMove()))
    return
  event.preventDefault()
  moveDrag(normalizeWheelDelta(event.deltaX, event.deltaMode, 120))
  if (drag) {
    clearTimeout(drag.idle)
    drag.idle = setTimeout(endDrag, WHEEL_IDLE_MS)
  }
}
function handlePointerDown(event: PointerEvent) {
  dragged = false
  touch = event.pointerType === 'touch' && canMove() ? { id: event.pointerId, x: event.clientX, y: event.clientY, lastX: event.clientX } : undefined
}
function handlePointerMove(event: PointerEvent) {
  if (!touch || touch.id !== event.pointerId)
    return
  const dx = event.clientX - touch.x
  const dy = event.clientY - touch.y
  if (touch.horizontal === undefined) {
    if (Math.abs(dx) < 8 && Math.abs(dy) < 8)
      return
    touch.horizontal = Math.abs(dx) > Math.abs(dy)
    if (!touch.horizontal) {
      touch = undefined
      return
    }
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  }
  moveDrag(touch.lastX - event.clientX)
  touch.lastX = event.clientX
}
function handlePointerUp(event: PointerEvent) {
  if (touch?.id === event.pointerId && touch.horizontal) {
    dragged = true
    endDrag()
  }
  touch = undefined
}
function selectPeek(target: number) {
  if (dragged) {
    dragged = false
    return
  }
  if (canMove())
    settle(target)
}
</script>

<template>
  <section
    class="library-hero-carousel" :class="{ 'library-hero-carousel--single': items.length < 2 }" :aria-label="label"
    @wheel="handleWheel" @pointerdown="handlePointerDown" @pointermove="handlePointerMove" @pointerup="handlePointerUp" @pointercancel="handlePointerUp"
  >
    <div class="library-hero-carousel__viewport">
      <div ref="track" class="library-hero-carousel__track" :style="{ '--carousel-index': index, '--carousel-end-shift': last ? '1' : '0' }">
        <div
          v-for="(item, itemIndex) in items" :key="item.key" class="library-hero-carousel__slide"
          :class="{ 'is-current': itemIndex === index }"
        >
          <template v-if="Math.abs(itemIndex - index) <= LIBRARY_HERO_RENDER_RADIUS">
            <div class="library-hero-carousel__card" :inert="itemIndex === index ? undefined : true">
              <slot :item="item" :current="itemIndex === index" />
            </div>
            <!-- Kept on the current card too, hidden, so its scrim fades rather than pops. -->
            <button
              type="button" class="library-hero-carousel__peek" :class="{ 'is-hidden': itemIndex === index }"
              :aria-label="t('library_tools.switch_to', { name: item.label })" :aria-hidden="itemIndex === index ? true : undefined"
              :tabindex="itemIndex === index ? -1 : undefined" :disabled="disabled"
              @click="selectPeek(itemIndex)"
            />
          </template>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped lang="scss">
@use "../styles/bleedStrip";

.library-hero-carousel {
  @include bleedStrip.bar(
    var(--bew-library-hero-height),
    var(--library-hero-gap, var(--bew-space-6)),
    var(--library-hero-pin, 0px)
  );
  margin-bottom: var(--library-hero-margin, var(--bew-space-6));
  min-width: 0;
  // Card widths are shares of the content width, not of the bleeding viewport.
  container-type: inline-size;
  // Sideways drags are the row's; vertical ones scroll the page.
  touch-action: pan-y;
  transition: transform var(--bew-duration-moderate) var(--bew-ease-standard);
}
// Entering and leaving under `<Transition name="library-hero">`: the row
// scales a little while each card fades its own layers (LibraryHero).
.library-hero-enter-from,
.library-hero-leave-to {
  transform: scale(0.98);
}
// Out to the window edges like the strips' scroller: the cards pass under the
// rail glass on the left and past the content edge on the right.
.library-hero-carousel__viewport {
  --bew-bleed-strip-start: calc(var(--bew-messages-sidebar-width) + var(--library-content-inline-padding));
  --carousel-slide: 85cqi;
  --carousel-gap: var(--bew-space-4);
  height: 100%;
  margin-inline: calc(-1 * var(--bew-bleed-strip-start)) calc(-1 * var(--library-content-inline-padding));
  overflow: clip visible;
}
.library-hero-carousel--single .library-hero-carousel__viewport {
  --carousel-slide: 100cqi;
}
// The current card starts at the content's left edge; on the last it ends at
// the right edge instead, so the previous one peeks at the left as well.
.library-hero-carousel__track {
  display: flex;
  gap: var(--carousel-gap);
  height: 100%;
  padding-inline-start: var(--bew-bleed-strip-start);
  transform: translateX(
    calc(
      var(--carousel-index) * -1 * (var(--carousel-slide) + var(--carousel-gap)) + var(--carousel-end-shift) *
        (100cqi - var(--carousel-slide))
    )
  );
}
.library-hero-carousel__slide {
  position: relative;
  flex: 0 0 var(--carousel-slide);
  height: 100%;
  min-width: 0;
}
.library-hero-carousel__card {
  height: 100%;
}
// A neighbour is quieter than the current card, and one tap away. A scrim
// dims it: the card's own opacity would stop its progressive blur.
.library-hero-carousel__peek {
  position: absolute;
  inset: 0;
  z-index: 3;
  padding: 0;
  border: 0;
  border-radius: var(--bew-media-radius);
  corner-shape: var(--bew-corner-shape);
  background: color-mix(in srgb, var(--bew-homepage-bg) 45%, transparent);
  cursor: pointer;
  transition:
    opacity var(--bew-duration-moderate) var(--bew-ease-standard),
    background-color var(--bew-duration-fast) var(--bew-ease-standard);
  &.is-hidden {
    opacity: 0;
    pointer-events: none;
  }
  &:hover:not(:disabled) {
    background: color-mix(in srgb, var(--bew-homepage-bg) 25%, transparent);
  }
  &:disabled {
    cursor: default;
  }
}
@media (prefers-reduced-motion: reduce) {
  .library-hero-carousel,
  .library-hero-carousel__peek {
    transition: none;
  }
}
</style>
