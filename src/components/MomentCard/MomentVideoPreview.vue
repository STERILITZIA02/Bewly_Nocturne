<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'

import LoadingRing from '~/components/LoadingRing.vue'
import { useVideoPreviewSwipeSeek } from '~/composables/useVideoPreviewSwipeSeek'
import { settings } from '~/logic'
import { subscribeFullscreenChange } from '~/utils/fullscreenChange'

const props = withDefaults(defineProps<{ url: string, loading: boolean, generation?: number, live?: boolean, controls?: boolean, hoverSurface?: string }>(), { controls: undefined })
const emit = defineEmits<{
  video: [element: HTMLVideoElement | null]
  interactionChange: [held: boolean]
  leave: []
  activate: [event: MouseEvent]
}>()
const videoRef = ref<HTMLVideoElement | null>(null)
const frameReady = ref(false)
const frameFailed = ref(false)
let cancelFirstFrame: (() => void) | undefined
const fullscreen = ref(false)
let leaveFrame: number | undefined
const controls = computed(() => !props.live && !props.loading && frameReady.value && (props.controls ?? settings.value.momentsEnableVideoControls))
const swipe = computed(() => !props.live && !props.loading && settings.value.momentsEnableVideoPreviewSwipeSeek)
const gestureSource = computed(() => `${props.generation ?? 0}:${props.url}`)
const gesture = useVideoPreviewSwipeSeek(videoRef, swipe, controls, gestureSource)
const interaction = computed(() => fullscreen.value || gesture.isScrubbing.value)
watch(interaction, held => emit('interactionChange', held), { flush: 'sync' })
watch([videoRef, () => props.url, () => props.generation], ([element]) => emit('video', element), { flush: 'post' })
watch([videoRef, () => props.url, () => props.generation], () => {
  cancelFirstFrame?.()
  frameReady.value = false
  frameFailed.value = false
}, { flush: 'sync' })

function revealFirstFrame(event: Event) {
  const video = event.currentTarget as HTMLVideoElement
  if (video !== videoRef.value || frameReady.value)
    return
  cancelFirstFrame?.()
  let current = true
  const reveal = () => {
    if (current && video === videoRef.value)
      frameReady.value = true
  }
  if (typeof video.requestVideoFrameCallback === 'function') {
    const frame = video.requestVideoFrameCallback(reveal)
    cancelFirstFrame = () => {
      current = false
      video.cancelVideoFrameCallback(frame)
    }
  }
  else {
    reveal()
    cancelFirstFrame = () => {
      current = false
    }
  }
}

function failFrame() {
  cancelFirstFrame?.()
  frameFailed.value = true
  frameReady.value = false
}

function syncFullscreen() {
  const next = videoRef.value?.matches(':fullscreen') === true
  const wasFullscreen = fullscreen.value
  fullscreen.value = next
  if (wasFullscreen && !next)
    reconcileHover()
}

function reconcileHover() {
  const surface = props.hoverSurface ?? (settings.value.momentsOnlyCoverVideoPreview
    ? '.moment-card__forward-video-cover, .moment-card__cover--media'
    : '.moment-card')
  if (!interaction.value && !videoRef.value?.closest(surface)?.matches(':hover'))
    emit('leave')
}

function finishGesture(event: PointerEvent, cancelled = false) {
  const wasScrubbing = gesture.isScrubbing.value
  gesture.finishPreviewScrub(event, cancelled)
  if (wasScrubbing) {
    if (leaveFrame !== undefined)
      cancelAnimationFrame(leaveFrame)
    leaveFrame = requestAnimationFrame(() => {
      leaveFrame = undefined
      reconcileHover()
    })
  }
}

function handleClick(event: MouseEvent) {
  gesture.handlePreviewClick(event)
  if (controls.value) {
    event.stopPropagation()
  }
  else if (!event.defaultPrevented) {
    emit('activate', event)
  }
}

// Mounted only with its media element; listens through the shared owner.
const stopFullscreenSubscription = subscribeFullscreenChange(syncFullscreen)
onBeforeUnmount(() => {
  cancelFirstFrame?.()
  if (leaveFrame !== undefined)
    cancelAnimationFrame(leaveFrame)
  stopFullscreenSubscription()
  emit('interactionChange', false)
  emit('video', null)
})
</script>

<template>
  <span
    class="moment-video-preview"
    :class="{ 'moment-video-preview--scrubbable': swipe, 'moment-video-preview--ready': frameReady }"
    :aria-busy="loading || (!!url && !frameReady && !frameFailed)"
    @pointerdown="gesture.handlePreviewPointerDown"
    @pointermove="gesture.handlePreviewPointerMove"
    @pointerup="finishGesture"
    @pointercancel="finishGesture($event, true)"
    @dragstart="swipe && gesture.handlePreviewDragStart($event)"
    @click="handleClick"
    @keydown.stop
  >
    <video
      v-if="url" ref="videoRef" :controls="controls" :loop="!live" :draggable="false"
      autoplay muted playsinline
      @loadeddata="revealFirstFrame" @playing="revealFirstFrame" @error="failFrame"
    />
    <LoadingRing :loading="Boolean(loading || (url && !frameReady && !frameFailed))" class="moment-video-preview__loading" size="var(--bew-icon-size-xl)" />
    <span v-if="gesture.isScrubbing.value && !controls" class="moment-video-preview__progress" aria-hidden="true">
      <span :style="{ transform: `scaleX(${gesture.scrubProgress.value / 100})` }" />
    </span>
  </span>
</template>

<style scoped lang="scss">
.moment-video-preview {
  position: absolute;
  inset: 0;
  z-index: 3;
  display: block;
  border-radius: inherit;
  corner-shape: inherit;

  video {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: inherit;
    corner-shape: inherit;
    opacity: 0;
    transition: opacity var(--bew-duration-fast) var(--bew-ease-standard);
  }
}

.moment-video-preview--ready video {
  opacity: 1;
}
@media (prefers-reduced-motion: reduce) {
  .moment-video-preview video {
    transition: none;
  }
}

.moment-video-preview--scrubbable {
  touch-action: pan-y;
  user-select: none;

  video {
    -webkit-user-drag: none;
  }
}

.moment-video-preview__loading {
  position: absolute;
  inset: 0;
  display: grid;
  color: #fff;
  background: var(--bew-cover-scrim);
  border-radius: inherit;
  corner-shape: inherit;
  pointer-events: none;
}

.moment-video-preview__progress {
  position: absolute;
  inset: auto var(--bew-space-2) var(--bew-space-2);
  height: var(--bew-space-1);
  overflow: hidden;
  border-radius: var(--bew-pill-radius);
  corner-shape: var(--bew-corner-shape-capsule);
  background: rgb(255 255 255 / 35%);
  pointer-events: none;

  > span {
    display: block;
    height: 100%;
    background: var(--bew-theme-color);
    transform-origin: left center;
  }
}
</style>
