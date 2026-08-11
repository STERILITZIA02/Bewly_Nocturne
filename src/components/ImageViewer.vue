<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import CloseButton from '~/components/CloseButton.vue'
import { useBewlyApp } from '~/composables/useAppProvider'
import { lockPageScroll, unlockPageScroll } from '~/utils/pageScrollLock'

const props = defineProps<{
  images: readonly string[]
  modelValue: number
}>()

const emit = defineEmits<{
  'update:modelValue': [index: number]
  'close': []
}>()

const { t } = useI18n()
const { mainAppRef } = useBewlyApp()
const viewerRef = ref<HTMLElement | null>(null)
const scale = ref(1)
const rotation = ref(0)
const panX = ref(0)
const panY = ref(0)
const dragging = ref(false)
const imageFailed = ref(false)
const imageLoaded = ref(false)
let dragStartX = 0
let dragStartY = 0
let dragOriginX = 0
let dragOriginY = 0
let closing = false
let scrollLocked = false

const currentUrl = computed(() => props.images[props.modelValue] || '')
const imageTransform = computed(() =>
  `translate3d(${panX.value}px, ${panY.value}px, 0) scale(${scale.value}) rotate(${rotation.value}deg)`,
)

function resetTransform() {
  scale.value = 1
  rotation.value = 0
  panX.value = 0
  panY.value = 0
}

function setScale(nextScale: number) {
  scale.value = Math.min(4, Math.max(0.25, nextScale))
  if (scale.value <= 1) {
    panX.value = 0
    panY.value = 0
  }
}

function showImage(index: number) {
  const count = props.images.length
  if (!count)
    return

  emit('update:modelValue', ((index % count) + count) % count)
  imageFailed.value = false
  imageLoaded.value = false
  resetTransform()
}

watch(currentUrl, () => {
  imageFailed.value = false
  imageLoaded.value = false
})

function close() {
  if (closing)
    return
  closing = true
  emit('close')
}

function handleWheel(event: WheelEvent) {
  const delta = event.deltaY || event.deltaX
  if (delta)
    setScale(scale.value * (delta < 0 ? 1.15 : 0.87))
}

function handlePointerDown(event: PointerEvent) {
  if (scale.value <= 1)
    return

  event.preventDefault()
  dragging.value = true
  dragStartX = event.clientX
  dragStartY = event.clientY
  dragOriginX = panX.value
  dragOriginY = panY.value
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
}

function handlePointerMove(event: PointerEvent) {
  if (!dragging.value)
    return

  panX.value = dragOriginX + event.clientX - dragStartX
  panY.value = dragOriginY + event.clientY - dragStartY
}

function handlePointerEnd(event: PointerEvent) {
  if (!dragging.value)
    return

  dragging.value = false
  try {
    ;(event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId)
  }
  catch {
    // The pointer may already have been released by the browser.
  }
}

function handleDoubleClick() {
  if (scale.value > 1)
    resetTransform()
  else
    setScale(2)
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopImmediatePropagation()
    close()
  }
  else if (event.key === 'ArrowLeft') {
    event.preventDefault()
    event.stopImmediatePropagation()
    showImage(props.modelValue - 1)
  }
  else if (event.key === 'ArrowRight') {
    event.preventDefault()
    event.stopImmediatePropagation()
    showImage(props.modelValue + 1)
  }
  else if (event.key === '+' || event.key === '=') {
    event.preventDefault()
    event.stopImmediatePropagation()
    setScale(scale.value + 0.25)
  }
  else if (event.key === '-' || event.key === '_') {
    event.preventDefault()
    event.stopImmediatePropagation()
    setScale(scale.value - 0.25)
  }
  else if (event.key === '0') {
    event.preventDefault()
    event.stopImmediatePropagation()
    resetTransform()
  }
}

onMounted(() => {
  lockPageScroll()
  scrollLocked = true
  nextTick(() => viewerRef.value?.focus({ preventScroll: true }))
})

onBeforeUnmount(() => {
  if (scrollLocked)
    unlockPageScroll()
})
</script>

<template>
  <Teleport v-if="mainAppRef" :to="mainAppRef">
    <div
      ref="viewerRef"
      class="image-viewer"
      role="dialog"
      aria-modal="true"
      :aria-label="t('moments.image_viewer')"
      tabindex="-1"
      @keydown="handleKeydown"
      @wheel.prevent.stop="handleWheel"
    >
      <CloseButton
        class="image-viewer__close"
        :label="t('moments.close_image_viewer')"
        size="large"
        variant="overlay"
        @click="close"
      />
      <div class="image-viewer__stage" @click.self="close">
        <div v-if="!currentUrl || imageFailed" class="image-viewer__unavailable" role="status" aria-live="polite">
          <span i-tabler-photo-off aria-hidden="true" />
          <span>{{ t('notifications.status.image_unavailable') }}</span>
        </div>
        <img
          v-else
          :src="currentUrl"
          :alt="t('moments.image_large')"
          class="image-viewer__image"
          :class="{
            'is-zoomed': scale > 1,
            'is-dragging': dragging,
            'is-loading': !imageLoaded,
          }"
          :style="{ transform: imageTransform }"
          draggable="false"
          @load="imageLoaded = true"
          @error="imageFailed = true"
          @dblclick.prevent.stop="handleDoubleClick"
          @pointerdown="handlePointerDown"
          @pointermove="handlePointerMove"
          @pointerup="handlePointerEnd"
          @pointercancel="handlePointerEnd"
        >
      </div>
      <button
        v-if="images.length > 1"
        type="button"
        class="image-viewer__nav image-viewer__nav--prev"
        :aria-label="t('moments.previous_image')"
        @click="showImage(modelValue - 1)"
      >
        <span i-tabler-chevron-left />
      </button>
      <button
        v-if="images.length > 1"
        type="button"
        class="image-viewer__nav image-viewer__nav--next"
        :aria-label="t('moments.next_image')"
        @click="showImage(modelValue + 1)"
      >
        <span i-tabler-chevron-right />
      </button>
      <div class="image-viewer__toolbar">
        <span class="image-viewer__counter">
          {{ modelValue + 1 }}/{{ images.length }}
        </span>
        <span class="image-viewer__divider" />
        <button type="button" :aria-label="t('moments.zoom_out')" :title="t('moments.zoom_out')" @click="setScale(scale - 0.25)">
          −
        </button>
        <span class="image-viewer__zoom">{{ Math.round(scale * 100) }}%</span>
        <button type="button" :aria-label="t('moments.zoom_in')" :title="t('moments.zoom_in')" @click="setScale(scale + 0.25)">
          +
        </button>
        <button type="button" :aria-label="t('moments.fit_window')" :title="t('moments.fit_window')" @click="resetTransform">
          1:1
        </button>
        <button
          type="button"
          :aria-label="t('moments.rotate_clockwise')"
          :title="t('moments.rotate_clockwise')"
          @click="rotation = (rotation + 90) % 360"
        >
          ↻
        </button>
      </div>
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
@use "../styles/breakpoints";

.image-viewer {
  position: fixed;
  inset: 0;
  z-index: var(--bew-z-image-viewer);
  overflow: hidden;
  color: #fff;
  background: rgb(18 18 18 / 76%);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  touch-action: none;
}

.image-viewer__stage {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  padding: 24px 72px 96px;
  overflow: hidden;
}

.image-viewer__image {
  display: block;
  width: auto;
  height: auto;
  max-width: 100%;
  max-height: 100%;
  border: 0 !important;
  outline: 0 !important;
  border-radius: 0;
  box-shadow: none !important;
  object-fit: contain;
  transform-origin: center center;
  transition: transform 0.12s ease-out;
  user-select: none;
  -webkit-user-drag: none;
  cursor: zoom-in;
}

.image-viewer__image.is-loading {
  opacity: 0;
}

.image-viewer__unavailable {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: var(--bew-space-3);
  color: rgb(255 255 255 / 72%);
  text-align: center;

  > span:first-child {
    width: 48px;
    height: 48px;
  }
}

.image-viewer__image.is-zoomed {
  cursor: grab;
}

.image-viewer__image.is-dragging {
  cursor: grabbing;
  transition: none;
}

.image-viewer__nav,
.image-viewer__toolbar button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  padding: 0;
  border: 0 !important;
  outline: 0;
  color: #fff;
  background: rgb(0 0 0 / 48%);
  box-shadow: none !important;
  font-family: inherit;
  cursor: pointer;
}

.image-viewer__nav:hover,
.image-viewer__toolbar button:hover {
  background: rgb(0 0 0 / 72%);
}

.image-viewer__close {
  position: absolute;
  top: 20px;
  left: 20px;
  z-index: 4;
}

.image-viewer__nav {
  position: absolute;
  top: 50%;
  z-index: 4;
  width: 44px;
  height: 56px;
  border-radius: var(--bew-radius-md);
  corner-shape: var(--bew-corner-shape);
  transform: translateY(-50%);
  font-size: var(--bew-icon-size-xl);
  line-height: 1;
}

.image-viewer__nav--prev {
  left: 16px;
}

.image-viewer__nav--next {
  right: 16px;
}

.image-viewer__toolbar {
  position: absolute;
  left: 50%;
  bottom: 24px;
  z-index: 4;
  display: flex;
  align-items: center;
  gap: var(--bew-space-2);
  padding: var(--bew-space-2) var(--bew-space-3);
  border: 0;
  border-radius: var(--bew-radius-full);
  corner-shape: var(--bew-corner-shape-round);
  background: rgb(0 0 0 / 58%);
  box-shadow: 0 8px 30px rgb(0 0 0 / 28%);
  transform: translateX(-50%);
  white-space: nowrap;
}

.image-viewer__toolbar button {
  width: 34px;
  height: 34px;
  aspect-ratio: 1;
  border-radius: 50%;
  corner-shape: var(--bew-corner-shape-round);
  background: transparent;
  font-size: var(--bew-icon-size-md);
}

.image-viewer__counter,
.image-viewer__zoom {
  min-width: 48px;
  text-align: center;
  font-size: var(--bew-font-size-control);
  font-variant-numeric: tabular-nums;
}

.image-viewer__divider {
  width: 1px;
  height: 24px;
  margin: 0 4px;
  background: rgb(255 255 255 / 24%);
}

@media (max-width: breakpoints.$grid-sm) {
  .image-viewer__stage {
    padding: 68px 12px 92px;
  }

  .image-viewer__nav {
    top: auto;
    bottom: 24px;
    width: 36px;
    height: 42px;
    transform: none;
  }
}
</style>
