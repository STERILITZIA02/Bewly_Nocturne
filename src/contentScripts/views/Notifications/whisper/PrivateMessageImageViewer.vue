<script setup lang="ts">
import { useResizeObserver } from '@vueuse/core'
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import Button from '~/components/Button.vue'
import IconButton from '~/components/IconButton.vue'
import SkeletonBlock from '~/components/SkeletonBlock.vue'

const props = withDefaults(defineProps<{
  src: string
  images?: string[]
}>(), { images: () => [] })

const emit = defineEmits<{
  (event: 'close'): void
}>()

const { t } = useI18n()
const currentSrc = ref(props.src)
// Keep the currently viewed image reachable when the conversation trims older messages.
const gallery = computed(() => [...new Set([...props.images, props.src, currentSrc.value])].filter(Boolean))
const currentIndex = computed(() => gallery.value.indexOf(currentSrc.value))
const viewport = ref<HTMLElement>()
const picture = ref<HTMLImageElement>()
const natural = ref({ width: 0, height: 0 })
const available = ref({ width: 0, height: 0 })
const fitMode = ref(true)
const manualScale = ref(1)
const failed = ref(false)
const imageAttempt = ref(0)
const fitScale = computed(() => natural.value.width && available.value.width && available.value.height
  ? Math.min(1, available.value.width / natural.value.width, available.value.height / natural.value.height)
  : 1)
const scale = computed(() => fitMode.value ? fitScale.value : manualScale.value)
const imageWidth = computed(() => natural.value.width * scale.value)
const imageHeight = computed(() => natural.value.height * scale.value)
const pannable = computed(() => imageWidth.value > available.value.width || imageHeight.value > available.value.height)
const dragging = ref(false)
let drag: { id: number, x: number, y: number, left: number, top: number } | undefined

function endDrag() {
  if (drag && viewport.value?.hasPointerCapture?.(drag.id))
    viewport.value.releasePointerCapture(drag.id)
  drag = undefined
  dragging.value = false
}
function resetImage() {
  endDrag()
  natural.value = { width: 0, height: 0 }
  failed.value = false
  fitMode.value = true
}
watch(() => props.src, value => currentSrc.value = value)
watch(currentSrc, resetImage, { flush: 'sync' })
onBeforeUnmount(endDrag)
function imageFailed(event: Event) {
  if (event.target === picture.value)
    failed.value = true
}
useResizeObserver(viewport, () => {
  available.value = { width: viewport.value?.clientWidth ?? 0, height: viewport.value?.clientHeight ?? 0 }
})
function loaded(event: Event) {
  const image = event.currentTarget as HTMLImageElement
  if (image !== picture.value)
    return
  natural.value = { width: image.naturalWidth, height: image.naturalHeight }
  available.value = { width: viewport.value?.clientWidth ?? 0, height: viewport.value?.clientHeight ?? 0 }
  void nextTick(() => {
    if (image === picture.value)
      viewport.value?.scrollTo({ left: 0, top: 0 })
  })
}
async function zoom(value: number, x = available.value.width / 2, y = available.value.height / 2) {
  const element = viewport.value
  if (!element || !natural.value.width)
    return
  const owner = currentSrc.value
  const imageX = (element.scrollLeft + x - Math.max(0, (available.value.width - imageWidth.value) / 2)) / scale.value
  const imageY = (element.scrollTop + y - Math.max(0, (available.value.height - imageHeight.value) / 2)) / scale.value
  manualScale.value = Math.min(8, Math.max(Math.min(0.1, fitScale.value), value))
  fitMode.value = false
  await nextTick()
  if (viewport.value !== element || owner !== currentSrc.value)
    return
  element.scrollLeft = imageX * scale.value + Math.max(0, (available.value.width - imageWidth.value) / 2) - x
  element.scrollTop = imageY * scale.value + Math.max(0, (available.value.height - imageHeight.value) / 2) - y
}
function fit() {
  fitMode.value = true
  void nextTick(() => viewport.value?.scrollTo({ left: 0, top: 0 }))
}
function navigate(direction: number) {
  const index = currentIndex.value + direction
  if (index >= 0 && index < gallery.value.length)
    currentSrc.value = gallery.value[index]
}
function wheel(event: WheelEvent) {
  if (!event.ctrlKey && !event.metaKey)
    return
  event.preventDefault()
  const bounds = viewport.value!.getBoundingClientRect()
  void zoom(scale.value * Math.exp(-event.deltaY * 0.002), event.clientX - bounds.left, event.clientY - bounds.top)
}
function pointerDown(event: PointerEvent) {
  if (event.button !== 0 || !pannable.value || !viewport.value || event.target !== picture.value)
    return
  event.preventDefault()
  drag = { id: event.pointerId, x: event.clientX, y: event.clientY, left: viewport.value.scrollLeft, top: viewport.value.scrollTop }
  viewport.value.setPointerCapture(event.pointerId)
  dragging.value = true
}
function pointerMove(event: PointerEvent) {
  if (drag?.id === event.pointerId && viewport.value) {
    viewport.value.scrollLeft = drag.left + drag.x - event.clientX
    viewport.value.scrollTop = drag.top + drag.y - event.clientY
  }
}
function keydown(event: KeyboardEvent) {
  if (event.isComposing || (event.target as HTMLElement).matches('input,textarea,select'))
    return
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault()
    navigate(event.key === 'ArrowLeft' ? -1 : 1)
  }
}
</script>

<template>
  <Dialog
    append-to-bewly-body
    content-flush
    :show-footer="false"
    :title="t('notifications.whisper.messages.image_preview')"
    width="min(90vw, calc(var(--bew-space-12) * 16))"
    max-width="90vw"
    content-max-height="80vh"
    @close="emit('close')"
  >
    <div class="private-message-image-viewer" @keydown="keydown">
      <div class="private-message-image-viewer__tools">
        <IconButton class="bew-icon-button--control" :label="t('moments.previous_image')" :disabled="currentIndex <= 0" @click="navigate(-1)">
          <i i-mingcute:left-line />
        </IconButton>
        <span aria-live="polite">{{ currentIndex + 1 }} / {{ gallery.length }}</span>
        <IconButton class="bew-icon-button--control" :label="t('moments.next_image')" :disabled="currentIndex >= gallery.length - 1" @click="navigate(1)">
          <i i-mingcute:right-line />
        </IconButton>
        <IconButton class="bew-icon-button--control" :label="t('moments.zoom_out')" :disabled="!natural.width" @click="zoom(scale / 1.25)">
          <i i-mingcute:zoom-out-line />
        </IconButton>
        <span class="private-message-image-viewer__scale">{{ Math.round(scale * 100) }}%</span>
        <IconButton class="bew-icon-button--control" :label="t('moments.zoom_in')" :disabled="!natural.width || scale >= 8" @click="zoom(scale * 1.25)">
          <i i-mingcute:zoom-in-line />
        </IconButton>
        <Button type="tertiary" :aria-pressed="fitMode" @click="fit">
          {{ t('moments.fit_window') }}
        </Button>
        <Button type="tertiary" :disabled="!natural.width" @click="zoom(1)">
          {{ t('library_tools.original_size') }}
        </Button>
      </div>
      <div
        ref="viewport" class="private-message-image-viewer__viewport" tabindex="0" data-dialog-initial-focus
        :aria-label="t('library_tools.image_navigation')"
        :class="{ 'is-pannable': pannable, 'is-dragging': dragging }"
        @wheel="wheel" @pointerdown="pointerDown" @pointermove="pointerMove" @pointerup="endDrag" @pointercancel="endDrag"
        @lostpointercapture="endDrag"
      >
        <SkeletonBlock v-if="!natural.width && !failed" class="private-message-image-viewer__loading" width="100%" height="100%" radius="media" />
        <div v-if="failed" class="private-message-image-viewer__error" role="alert">
          <span>{{ t('common.load_failed') }}</span>
          <Button type="secondary" @click="failed = false; imageAttempt++">
            {{ t('common.retry') }}
          </Button>
        </div>
        <div v-else class="private-message-image-viewer__canvas" :style="{ width: `${Math.max(available.width, imageWidth)}px`, height: `${Math.max(available.height, imageHeight)}px` }">
          <img
            ref="picture" :key="`${currentSrc}:${imageAttempt}`" :src="currentSrc" :alt="t('notifications.whisper.messages.image_alt')" draggable="false"
            :style="natural.width ? { width: `${imageWidth}px`, height: `${imageHeight}px` } : { visibility: 'hidden', width: '0', height: '0' }"
            @load="loaded" @error="imageFailed" @dblclick.prevent="fitMode ? zoom(scale < 1 ? 1 : 2) : fit()"
          >
        </div>
      </div>
    </div>
  </Dialog>
</template>

<style scoped lang="scss">
.private-message-image-viewer {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 0;
  background: var(--bew-homepage-bg);
}

.private-message-image-viewer__tools {
  position: relative;
  z-index: 2;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: var(--bew-space-1);
  padding: var(--bew-space-2);
  font-size: var(--bew-font-size-control);
  background: var(--bew-content-alt-solid);
}
.private-message-image-viewer__scale {
  min-width: 4ch;
  text-align: center;
  font-variant-numeric: tabular-nums;
}
.private-message-image-viewer__viewport {
  position: relative;
  width: 100%;
  height: 64dvh;
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
  touch-action: pan-x pan-y;
}
.private-message-image-viewer__loading {
  position: absolute;
  inset: 0;
}
.private-message-image-viewer__canvas {
  display: grid;
  place-items: center;
  min-width: 100%;
  min-height: 100%;
}
.private-message-image-viewer__error {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--bew-space-4);
}
.is-pannable img {
  cursor: grab;
  touch-action: none;
}
.is-dragging img {
  cursor: grabbing;
}

.private-message-image-viewer img {
  display: block;
  max-width: none;
  max-height: none;
  object-fit: contain;
  user-select: none;
}
</style>
