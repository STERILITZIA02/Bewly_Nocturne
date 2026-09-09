<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import SkeletonBlock from '~/components/SkeletonBlock.vue'
import { useVideoPreviewSwipeSeek } from '~/composables/useVideoPreviewSwipeSeek'
import { settings } from '~/logic'

const props = defineProps<{ url: string, loading: boolean, generation?: number, live?: boolean }>()
const emit = defineEmits<{
  video: [element: HTMLVideoElement | null]
  interactionChange: [held: boolean]
  leave: []
  activate: [event: MouseEvent]
}>()
const videoRef = ref<HTMLVideoElement | null>(null)
const fullscreen = ref(false)
let leaveFrame: number | undefined
const controls = computed(() => !props.live && !props.loading && settings.value.momentsEnableVideoControls)
const swipe = computed(() => !props.live && !props.loading && settings.value.momentsEnableVideoPreviewSwipeSeek)
const gestureSource = computed(() => `${props.generation ?? 0}:${props.url}`)
const gesture = useVideoPreviewSwipeSeek(videoRef, swipe, controls, gestureSource)
const interaction = computed(() => fullscreen.value || gesture.isScrubbing.value)
watch(interaction, held => emit('interactionChange', held), { flush: 'sync' })
watch([videoRef, () => props.url, () => props.generation], ([element]) => emit('video', element), { flush: 'post' })

function syncFullscreen() {
  const next = videoRef.value?.matches(':fullscreen') === true
  const wasFullscreen = fullscreen.value
  fullscreen.value = next
  if (wasFullscreen && !next)
    reconcileHover()
}

function reconcileHover() {
  const surface = settings.value.momentsOnlyCoverVideoPreview
    ? '.moment-card__forward-video-cover, .moment-card__cover--media'
    : '.moment-card'
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

onMounted(() => document.addEventListener('fullscreenchange', syncFullscreen))
onBeforeUnmount(() => {
  if (leaveFrame !== undefined)
    cancelAnimationFrame(leaveFrame)
  document.removeEventListener('fullscreenchange', syncFullscreen)
  emit('interactionChange', false)
  emit('video', null)
})
</script>

<template>
  <span
    class="moment-video-preview"
    :class="{ 'moment-video-preview--scrubbable': swipe }"
    :aria-busy="loading"
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
    />
    <SkeletonBlock v-if="loading" height="100%" radius="media" class="moment-video-preview__loading" />
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
  border-radius: inherit;
  corner-shape: inherit;
  pointer-events: none;
}

.moment-video-preview__progress {
  position: absolute;
  inset: auto var(--bew-space-2) var(--bew-space-2);
  height: var(--bew-space-1);
  overflow: hidden;
  border-radius: var(--bew-badge-radius);
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
