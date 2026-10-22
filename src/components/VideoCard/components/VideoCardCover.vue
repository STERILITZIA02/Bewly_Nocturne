<script setup lang="ts">
import type flvjs from 'flv.js'
import type Hls from 'hls.js'
import type { ErrorData, Events } from 'hls.js'

import Button from '~/components/Button.vue'
import LazyPicture from '~/components/LazyPicture.vue'
import LoadingRing from '~/components/LoadingRing.vue'
import { useVideoPreviewSwipeSeek } from '~/composables/useVideoPreviewSwipeSeek'
import { settings } from '~/logic'
import { loadFlvModule } from '~/utils/flv'
import { getFullscreenElement, subscribeFullscreenChange } from '~/utils/fullscreenChange'
import { loadHlsModule } from '~/utils/hls'
import { releaseMediaElement } from '~/utils/mediaResources'
import { createPreviewMediaSession } from '~/utils/previewMediaSession'
import { normalizePreviewPosition } from '~/utils/videoPreviewProgress'

import type { Video } from '../types'

interface Props {
  skeleton?: boolean
  video?: Video
  removed: boolean
  isHover: boolean
  previewVideoUrl: string
  previewIdentity?: string
  previewCurrentTime?: number | null
  coverTopLeftAlwaysVisible?: boolean
  coverImageUrl: string
}

const props = defineProps<Props>()
const emit = defineEmits<{
  previewProgress: [time: number, identity: string]
  undo: []
  previewError: []
  previewFullscreenChange: [isFullscreen: boolean]
  previewScrubChange: [scrubbing: boolean]
}>()
const streamSession = createPreviewMediaSession()
const videoRef = ref<HTMLVideoElement | null>(null)
const isPreviewLoading = ref<boolean>(false)
const isPreviewFullscreen = ref<boolean>(false)
const shouldEnableVideoControls = computed(() => settings.value.enableVideoCtrlBarOnVideoCard && !props.video?.roomid)
const shouldEnableSwipeSeek = computed(() => settings.value.enableVideoPreviewSwipeSeek && !props.video?.roomid)
const {
  isScrubbing,
  scrubProgress,
  resetPreviewScrub,
  disposeSwipeSeek,
  handlePreviewPointerDown,
  handlePreviewPointerMove,
  finishPreviewScrub,
  handlePreviewClick,
  handlePreviewDragStart,
} = useVideoPreviewSwipeSeek(videoRef, shouldEnableSwipeSeek, shouldEnableVideoControls, computed(() => props.previewVideoUrl))
watch(isScrubbing, value => emit('previewScrubChange', value), { flush: 'sync' })
const showVideoControls = computed(() => shouldEnableVideoControls.value
  && Boolean(props.previewVideoUrl)
  && (props.isHover || isPreviewFullscreen.value || isScrubbing.value))

let previewSetupGeneration = 0
let progressOwner: { video: HTMLVideoElement, generation: number, identity: string } | undefined

function recordPreviewPosition() {
  const owner = progressOwner
  if (!owner || owner.generation !== previewSetupGeneration || owner.identity !== props.previewIdentity
    || props.video?.roomid || owner.video.readyState === 0) {
    return
  }
  const time = normalizePreviewPosition(owner.video.currentTime, owner.video.duration, owner.video.ended)
  if (time !== null)
    emit('previewProgress', time, owner.identity)
}

const previewInteractionEvents = computed(() => ({
  ...(shouldEnableSwipeSeek.value
    ? { pointermove: handlePreviewPointerMove }
    : {}),
  ...(shouldEnableSwipeSeek.value
    ? {
        pointerdown: handlePreviewPointerDown,
        pointerup: finishPreviewScrub,
        pointercancel: (event: PointerEvent) => finishPreviewScrub(event, true),
        click: handlePreviewClick,
        dragstart: handlePreviewDragStart,
      }
    : {}),
}))

function resetVideoElement(videoEl: HTMLVideoElement) {
  releaseMediaElement(videoEl)
}

function stopPreview(videoEl: HTMLVideoElement) {
  recordPreviewPosition()
  previewSetupGeneration++
  progressOwner = undefined
  cleanupPlayers()
  resetPreviewScrub()
  resetVideoElement(videoEl)
}

function syncPreviewFullscreenState() {
  const isFullscreen = Boolean(videoRef.value && (getFullscreenElement() === videoRef.value || videoRef.value.matches(':fullscreen')))

  if (isPreviewFullscreen.value === isFullscreen)
    return

  isPreviewFullscreen.value = isFullscreen
  emit('previewFullscreenChange', isFullscreen)

  if (isFullscreen)
    return

  if (!videoRef.value)
    return

  if (!props.isHover || !props.previewVideoUrl) {
    stopPreview(videoRef.value)
  }
}

function cleanupPlayers() {
  streamSession.clear()
  isPreviewLoading.value = false
}

function isPreviewSetupCurrent(generation: number, url: string, videoEl: HTMLVideoElement) {
  return generation === previewSetupGeneration
    && videoRef.value === videoEl
    && props.previewVideoUrl === url
    && (props.isHover || isPreviewFullscreen.value)
}

function isHlsPlayerCurrent(player: Hls, generation: number, url: string, videoEl: HTMLVideoElement) {
  return streamSession.hls === player && isPreviewSetupCurrent(generation, url, videoEl)
}

function isFlvPlayerCurrent(player: flvjs.Player, generation: number, url: string, videoEl: HTMLVideoElement) {
  return streamSession.flv === player && isPreviewSetupCurrent(generation, url, videoEl)
}

function failPreviewSetup(generation: number, url: string, videoEl: HTMLVideoElement) {
  if (!isPreviewSetupCurrent(generation, url, videoEl))
    return
  cleanupPlayers()
  resetPreviewScrub()
  resetVideoElement(videoEl)
  isPreviewLoading.value = false
  emit('previewError')
}

async function setupPreviewVideo(url: string, videoEl: HTMLVideoElement, generation: number) {
  if (!isPreviewSetupCurrent(generation, url, videoEl))
    return

  cleanupPlayers()
  resetVideoElement(videoEl)
  const identity = props.previewIdentity || ''
  progressOwner = { video: videoEl, generation, identity }
  const current = () => identity === props.previewIdentity && isPreviewSetupCurrent(generation, url, videoEl)
  const save = () => {
    if (current())
      recordPreviewPosition()
  }
  videoEl.addEventListener('loadedmetadata', () => {
    if (!current() || !identity || props.video?.roomid)
      return
    const time = props.previewCurrentTime
    const restored = time == null ? null : normalizePreviewPosition(time, videoEl.duration)
    if (restored !== null)
      videoEl.currentTime = restored
  }, { once: true, signal: streamSession.signal })
  for (const event of ['timeupdate', 'pause', 'ended'])
    videoEl.addEventListener(event, save, { signal: streamSession.signal })
  isPreviewLoading.value = true
  const onFrameReady = () => {
    if (isPreviewSetupCurrent(generation, url, videoEl) && videoEl.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA)
      isPreviewLoading.value = false
  }
  videoEl.addEventListener('loadeddata', onFrameReady, { once: true, signal: streamSession.signal })
  videoEl.addEventListener('canplay', onFrameReady, { once: true, signal: streamSession.signal })

  // Check if URL is FLV stream
  if (url.includes('.flv')) {
    try {
      const flvjsModule = await loadFlvModule()
      const flvjs = flvjsModule.default
      if (!isPreviewSetupCurrent(generation, url, videoEl))
        return

      if (flvjs.isSupported()) {
        const player = flvjs.createPlayer({
          type: 'flv',
          url,
          isLive: true,
        }, {
          enableWorker: false, // 在扩展环境中禁用 worker
          enableStashBuffer: false, // 禁用存储缓冲，减少延迟
          stashInitialSize: 128, // 初始缓冲大小
          lazyLoad: false,
          lazyLoadMaxDuration: 1,
          seekType: 'range',
        })
        streamSession.flv = player

        player.attachMediaElement(videoEl)

        player.on(flvjs.Events.ERROR, () => {
          if (!isFlvPlayerCurrent(player, generation, url, videoEl))
            return

          streamSession.flv = null
          streamSession.releaseFlv(player)
          failPreviewSetup(generation, url, videoEl)
        })

        // 当有数据可以播放时立即播放
        videoEl.addEventListener('loadeddata', () => {
          if (!isFlvPlayerCurrent(player, generation, url, videoEl))
            return
          videoEl.play().catch(() => {
            // Ignore autoplay errors
          })
        }, { once: true, signal: streamSession.signal })

        player.load()
      }
      else {
        failPreviewSetup(generation, url, videoEl)
      }
    }
    catch (error) {
      console.error('Failed to load flv.js:', error)
      failPreviewSetup(generation, url, videoEl)
    }
  }
  // Check if URL is HLS stream (.m3u8)
  else if (url.includes('.m3u8') || url.includes('m3u8')) {
    try {
      const Hls = (await loadHlsModule()).default
      if (!isPreviewSetupCurrent(generation, url, videoEl))
        return
      if (Hls.isSupported()) {
        const player = new Hls({
          enableWorker: true,
          lowLatencyMode: true,
          // 优化配置以更快开始播放
          maxBufferLength: 10, // 减少缓冲长度
          maxMaxBufferLength: 20,
          liveSyncDurationCount: 2, // 减少直播同步计数
          liveMaxLatencyDurationCount: 5,
          maxBufferSize: 60 * 1000 * 1000, // 60MB
        })
        streamSession.hls = player

        player.loadSource(url)
        player.attachMedia(videoEl)

        player.on(Hls.Events.MANIFEST_PARSED, () => {
          if (!isHlsPlayerCurrent(player, generation, url, videoEl))
            return
          videoEl.play().catch(() => {
            // Ignore autoplay errors
          })
        })

        player.on(Hls.Events.ERROR, (_event: Events.ERROR, data: ErrorData) => {
          if (!isHlsPlayerCurrent(player, generation, url, videoEl) || !data.fatal)
            return
          switch (data.type) {
            case Hls.ErrorTypes.MEDIA_ERROR:
              // Bounded per instance; exhaustion releases it into the failure state.
              streamSession.recoverHlsMediaError(player, videoEl, () => {
                if (!isHlsPlayerCurrent(player, generation, url, videoEl))
                  return
                streamSession.releaseHls(player)
                failPreviewSetup(generation, url, videoEl)
              })
              break
            default:
              streamSession.releaseHls(player)
              failPreviewSetup(generation, url, videoEl)
              break
          }
        })
      }
      // cSpell:ignore mpegurl
      else if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
        videoEl.src = url
        videoEl.play().catch(() => {
          if (isPreviewSetupCurrent(generation, url, videoEl))
            failPreviewSetup(generation, url, videoEl)
        })
      }
      else {
        failPreviewSetup(generation, url, videoEl)
      }
    }
    catch (error) {
      console.error('Failed to load hls.js:', error)
      failPreviewSetup(generation, url, videoEl)
    }
  }
  else {
    videoEl.src = url
    videoEl.load()
    videoEl.play().catch(() => {
      failPreviewSetup(generation, url, videoEl)
    })
  }
}

// Watch for preview URL and videoRef changes
watch([() => props.previewVideoUrl, () => props.isHover, videoRef, () => props.previewIdentity], ([url, isHover, videoEl], [, , previousVideo]) => {
  recordPreviewPosition()
  if (!videoEl) {
    cleanupPlayers()
    if (previousVideo)
      releaseMediaElement(previousVideo)
    previewSetupGeneration++
    return
  }

  if (!isHover && isPreviewFullscreen.value && url)
    return

  const generation = ++previewSetupGeneration

  if (!isHover || !url) {
    stopPreview(videoEl)
    return
  }

  void setupPreviewVideo(url, videoEl, generation).catch((error) => {
    console.error('Failed to set up video preview:', error)
    failPreviewSetup(generation, url, videoEl)
  })
}, { flush: 'post' })

// Only a card that holds a preview element (or is still fullscreen) listens,
// through the shared owner. A fullscreen mouseleave keeps the element and the
// subscription; exit, replacement or unmount releases them.
let stopFullscreenSubscription: (() => void) | undefined
watch(() => Boolean(videoRef.value) || isPreviewFullscreen.value, (holdsMedia) => {
  if (holdsMedia) {
    stopFullscreenSubscription ??= subscribeFullscreenChange(syncPreviewFullscreenState)
    return
  }
  stopFullscreenSubscription?.()
  stopFullscreenSubscription = undefined
}, { immediate: true, flush: 'post' })

onBeforeUnmount(() => {
  recordPreviewPosition()
  previewSetupGeneration++
  progressOwner = undefined
  stopFullscreenSubscription?.()
  stopFullscreenSubscription = undefined
  disposeSwipeSeek()
  cleanupPlayers()
  if (videoRef.value)
    releaseMediaElement(videoRef.value)
})

// Shadow styles are now injected globally via CSS variables from App.vue
// No per-card computation needed - significant performance improvement!
</script>

<template>
  <div
    class="video-card-cover group/cover bew-shape-smooth-rect"
    shrink-0
    relative bg="$bew-skeleton" rounded="$bew-video-cover-radius"
    overflow-hidden
    cursor-pointer
    group-hover:z-2
    style="aspect-ratio: var(--bew-video-cover-aspect-ratio); contain: layout style; will-change: auto;"
  >
    <!-- Skeleton mode -->
    <div
      v-if="skeleton"
      data-bew-skeleton
      w-full h-full bg="$bew-skeleton" rounded-inherit
    />

    <!-- Normal mode -->
    <template v-else>
      <!-- Video cover -->
      <LazyPicture
        responsive-cover
        aspect-ratio="var(--bew-video-cover-aspect-ratio)"
        h-full
        :src="coverImageUrl"
        loading="lazy"
        :retain-screens="3"
        :show-skeleton="true"
      />

      <div
        v-if="removed"
        pos="absolute top-0 left-0" w-full h-full flex="~ col gap-2 items-center justify-center"
        bg="$bew-fill-4" backdrop-blur-20px mix-blend-luminosity rounded-inherit z-2
      >
        <p mb-2 color-white text-lg>
          {{ $t('video_card.video_removed') }}
        </p>
        <Button
          color="rgba(255,255,255,.35)" text-color="white" size="small"
          @click.prevent.stop="emit('undo')"
        >
          <template #left>
            <div i-mingcute-back-line text-lg />
          </template>
          {{ $t('common.undo') }}
        </Button>
      </div>

      <!-- Video preview -->
      <Transition v-if="!removed && settings.enableVideoPreview" name="fade">
        <div
          v-if="previewVideoUrl && (isHover || isPreviewFullscreen)"
          class="video-card-preview"
          :aria-busy="isPreviewLoading"
          :class="{ 'video-card-preview--scrubbable': shouldEnableSwipeSeek }"
          pos="absolute top-0 left-0" w-full h-full rounded-inherit bg-black
          v-on="previewInteractionEvents"
        >
          <video
            :key="previewIdentity"
            ref="videoRef"
            autoplay
            muted
            :draggable="false" :controls="showVideoControls && !isPreviewLoading"
            w-full
            h-full
            class="video-card-preview__video" @click.capture="recordPreviewPosition"
          />

          <div
            v-if="isScrubbing && !shouldEnableVideoControls"
            class="video-card-preview__scrub-progress"
            aria-hidden="true"
          >
            <div
              class="video-card-preview__scrub-progress-value"
              :style="{ transform: `scaleX(${scrubProgress / 100})` }"
            />
          </div>

          <!-- The cover stays readable under the scrim; only the buffering preview is pending. -->
          <LoadingRing
            :loading="isPreviewLoading"
            class="video-card-preview__loading"
            role="status"
            :aria-label="$t('common.loading')"
            pos="absolute top-0 left-0"
            w-full h-full
            bg="black/50"
            text-white
            rounded-inherit
            pointer-events-none
            size="var(--bew-icon-size-xl)"
          />
        </div>
      </Transition>

      <!-- Ranking Number -->
      <div
        v-if="video?.rank"
        class="video-card-overlay-transition group-hover:opacity-0"
        pos="absolute top-0"
        p-2
      >
        <div
          v-if="Number(video?.rank) <= 3"
          class="bew-shape-circle bew-centered-numeral"
          bg="$bew-selected-bg" h-28px w-28px
          text="$bew-text-1 xl" shadow="$bew-shadow-1"
          border="1 $bew-surface-border-color"
          fw-bold
        >
          <span>{{ video?.rank }}</span>
        </div>
        <div
          v-else
          class="bew-shape-circle bew-centered-numeral"
          bg="$bew-elevated-solid" h-28px w-28px
          shadow="$bew-shadow-1"
          border="1 $bew-border-color"
        >
          <span>{{ video?.rank }}</span>
        </div>
      </div>

      <template v-if="!removed && video">
        <div
          class="video-card-overlay-transform-transition"
          :class="coverTopLeftAlwaysVisible ? 'opacity-100' : 'opacity-0 group-hover/cover:opacity-100'"
          :transform="coverTopLeftAlwaysVisible ? 'scale-100' : 'scale-70 group-hover/cover:scale-100'"
          pos="absolute top-0 left-0" z-2
          @click.stop=""
        >
          <slot name="coverTopLeft" />
        </div>

        <div
          v-if="video?.liveStatus === 1"
          class="video-card-overlay-transition bew-shape-pill group-hover:opacity-0"

          pos="absolute left-0 top-0" bg="$bew-selected-bg" text="xs $bew-text-1" fw-bold
          p="x-2 y-1" m="$bew-cover-overlay-inset" inline-block
        >
          LIVE
          <i i-svg-spinners:pulse-3 align-middle mt--0.2em />
        </div>

        <div
          v-if="Object.keys(video?.badge ?? {}).length > 0"
          class="video-card-overlay-transition bew-shape-pill group-hover:opacity-0"

          :style="{
            backgroundColor: video?.badge?.bgColor,
            color: video?.badge?.color,
          }"
          pos="absolute right-0 top-0" bg="$bew-selected-bg" text="xs $bew-text-1"
          p="x-2 y-1" m="$bew-cover-overlay-inset" inline-block
        >
          {{ video?.badge?.text }}
        </div>
      </template>
    </template>
  </div>
</template>

<style lang="scss" scoped>
@use "../../../styles/contentCard";

.video-card-cover {
  @include contentCard.media-frame;
  transition: box-shadow var(--bew-duration-moderate) var(--bew-ease-standard);
}

.video-card-overlay-transition {
  transition: opacity var(--bew-duration-moderate, 300ms) var(--bew-ease-standard, ease);
}

.video-card-overlay-transform-transition {
  transition:
    opacity var(--bew-duration-moderate, 300ms) var(--bew-ease-standard, ease),
    transform var(--bew-duration-moderate, 300ms) var(--bew-ease-standard, ease);
}

.video-card-preview--scrubbable {
  cursor: ew-resize;
  touch-action: pan-y;
  user-select: none;
  -webkit-user-drag: none;
}

.video-card-preview--scrubbable video {
  -webkit-user-drag: none;
}

.video-card-preview__video {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: inherit;
  corner-shape: inherit;
}

.video-card-preview__scrub-progress {
  position: absolute;
  right: 0.5rem;
  bottom: 0.5rem;
  left: 0.5rem;
  z-index: 3;
  height: 0.25rem;
  overflow: hidden;
  border-radius: var(--bew-radius-full);
  corner-shape: round;
  background: rgb(255 255 255 / 35%);
  pointer-events: none;
}

.video-card-preview__scrub-progress-value {
  width: 100%;
  height: 100%;
  border-radius: inherit;
  corner-shape: inherit;
  background: var(--bew-theme-color);
  transform-origin: left center;
  will-change: transform;
}
</style>
