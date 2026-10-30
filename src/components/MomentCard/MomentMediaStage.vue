<script setup lang="ts">
import type { ComponentPublicInstance } from 'vue'
import { computed, nextTick, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import LiveMark from '~/components/LiveMark.vue'
import ProgressiveBlur from '~/components/ProgressiveBlur.vue'
import { useImageViewer } from '~/composables/useImageViewer'
import { usePictureReveal } from '~/composables/usePictureReveal'
import { getCrossfadeDuration, showCrossfadeLayer } from '~/utils/crossfadeLayers'
import { createElasticWheelScroll } from '~/utils/elasticScroll'
import { getMotionDuration } from '~/utils/motionTiming'
import { hasLoadedPicture, rememberLoadedPicture } from '~/utils/pictureRevealMemory'
import { isPortraitRatio, PORTRAIT_MAX_CLEAR_HEIGHT } from '~/utils/portraitMedia'
import { prefersReducedMotion } from '~/utils/reducedMotion'
import { createSideSwipe } from '~/utils/sideSwipe'

import { getMomentOriginalImageUrl, getMomentThumbnailSrcset, getMomentThumbnailUrl } from './utils'

// The media at the top of a moment card, and of a quoted moment inside one: a
// video or live cover, or an image post's images, edge to edge with its top
// corners rounded, ending in a short gradient blur and a fade into the colour
// beneath (`--moment-media-base`). Corners and insets come from the host
// (`--moment-media-corners`, `--moment-media-inset`, `--moment-media-strip-radius`)
// so a quoted moment nests its smaller corners inside the card's.
const {
  images = [],
  imageRatios = [],
  ratio = 1,
  authorName = '',
  gallery = false,
  cover = '',
  coverAlt = '',
  href = '',
  hrefLabel = '',
  live = false,
  portrait = false,
  previewing = false,
  blur = false,
} = defineProps<{
  images?: readonly string[]
  imageRatios?: ReadonlyArray<number | null>
  /** Width / height of the first image. */
  ratio?: number
  authorName?: string
  /** Show `images` one at a time with a thumbnail strip; otherwise `cover`. */
  gallery?: boolean
  cover?: string
  coverAlt?: string
  href?: string
  hrefLabel?: string
  live?: boolean
  portrait?: boolean
  previewing?: boolean
  /** Mount the gradient blur (an ancestor fading in would stop it). */
  blur?: boolean
}>()

const emit = defineEmits<{
  shown: [index: number]
  firstLoad: [event: Event]
  coverClick: [event: MouseEvent]
  coverEnter: [event: MouseEvent]
  coverLeave: []
  coverMenu: [event: MouseEvent]
}>()

const { t } = useI18n()
const { isRevealed, reveal } = usePictureReveal()

// A portrait picture shows its upper part clearly, up to 1.2 widths tall, then
// blends over a longer fade.
const imageBoxRatio = computed(() => portrait
  ? Math.max(1 / PORTRAIT_MAX_CLEAR_HEIGHT, ratio)
  : Math.min(2, ratio))

// One image at a time. Switching crossfades (user request): the new image
// fades in over the old one once it has loaded; crossfadeLayers keeps quick and
// reversed switches continuous.
const requestedImage = ref(0)
const shownImage = ref(0)
const mountedImages = ref(new Set([0]))
// Drawn images, bottom to top. A first image seen before (a remounted card)
// is drawn at once; otherwise it fades in when it loads.
const imageLayers = shallowRef<number[]>(firstImageSeen() ? [0] : [])
const imageFades = new Map<number, Animation>()
const imageElements: Array<HTMLImageElement | null> = []
const imageButtons: Array<HTMLButtonElement | null> = []
const thumbScrollerRef = ref<HTMLElement | null>(null)
// A sideways trackpad or touch swipe moves one image per gesture; vertical
// wheels keep scrolling the page.
const imageSwipe = createSideSwipe(direction => requestImage(requestedImage.value + direction), () => images.length > 1)
let thumbElastic: ReturnType<typeof createElasticWheelScroll> | undefined

watch(shownImage, index => emit('shown', index), { immediate: true })

// A card reused for another moment starts over (compared by content: an
// updated copy of the same moment keeps its place).
watch(() => images.join('\n'), () => {
  imageFades.forEach(animation => animation.cancel())
  imageFades.clear()
  requestedImage.value = 0
  shownImage.value = 0
  imageLayers.value = firstImageSeen() ? [0] : []
  mountedImages.value = new Set([0])
})

function firstImageSeen() {
  return gallery && images.length > 0 && hasLoadedPicture(getMomentThumbnailUrl(images[0]))
}

function bindImage(index: number, element: Element | ComponentPublicInstance | null) {
  imageElements[index] = element instanceof HTMLImageElement ? element : null
}

function bindImageButton(index: number, element: Element | ComponentPublicInstance | null) {
  imageButtons[index] = element instanceof HTMLButtonElement ? element : null
}

function showImage(index: number) {
  const step = showCrossfadeLayer(imageLayers.value, shownImage.value, index)
  if (!step)
    return
  shownImage.value = index
  imageLayers.value = step.layers
  step.fades.forEach(({ index: layer, to }) => fadeImageLayer(layer, to))
}

// Fades from the opacity drawn now, so a fade turned around mid-way continues
// from there. When every fade has ended only the shown image stays drawn.
function fadeImageLayer(index: number, to: 0 | 1) {
  const element = imageButtons[index]!
  const style = getComputedStyle(element)
  const from = Number(style.opacity)
  imageFades.get(index)?.cancel()
  const full = prefersReducedMotion()
    ? 0
    : getMotionDuration(style, '--bew-duration-moderate')
  const animation = element.animate([{ opacity: from }, { opacity: to }], {
    duration: getCrossfadeDuration(full, from, to),
    easing: style.getPropertyValue('--bew-ease-standard').trim() || 'ease-out',
    fill: 'forwards',
  })
  imageFades.set(index, animation)
  animation.finished.then(settleImageLayers, () => {})
}

async function settleImageLayers() {
  if ([...imageFades.values()].some(animation => animation.playState !== 'finished'))
    return
  const fades = [...imageFades.values()]
  imageFades.clear()
  imageLayers.value = [shownImage.value]
  // The classes now hold each end state; drop the fills after they render.
  await nextTick()
  fades.forEach(animation => animation.cancel())
}

function requestImage(index: number) {
  const next = Math.min(images.length - 1, Math.max(0, index))
  if (next === requestedImage.value)
    return
  requestedImage.value = next
  mountedImages.value.add(next)
  revealThumb(next)
  void nextTick(() => {
    if (requestedImage.value === next && imageElements[next]?.complete)
      showImage(next)
  })
}

function handleImageLoad(index: number, event: Event) {
  rememberLoadedPicture(getMomentThumbnailUrl(images[index]))
  if (index === 0)
    emit('firstLoad', event)
  if (index === requestedImage.value)
    showImage(index)
}

// The full-size images open in the shared viewer, growing out of this stage;
// closing shows the last viewed image here, so the viewer lands back on it.
const imageViewer = useImageViewer()
function handleImageClick(index: number, event: MouseEvent) {
  if (imageSwipe.consumeClick())
    return
  const trigger = event.currentTarget as HTMLElement
  imageViewer.open({
    urls: images.map(getMomentOriginalImageUrl),
    index,
    trigger,
    label: authorName || undefined,
    getOrigin: () => trigger.isConnected ? trigger.getBoundingClientRect() : undefined,
    onClose: requestImage,
  })
}

function handleImageKeydown(event: KeyboardEvent) {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')
    return
  event.preventDefault()
  requestImage(requestedImage.value + (event.key === 'ArrowRight' ? 1 : -1))
  void nextTick(() => imageButtons[requestedImage.value]?.focus({ preventScroll: true }))
}

// Thumbnails scroll sideways with the shared elastic edges; vertical wheels
// pass through to the page.
watch(thumbScrollerRef, (scroller, _previous, onCleanup) => {
  const track = scroller?.firstElementChild
  if (!scroller || !(track instanceof HTMLElement))
    return
  const elastic = createElasticWheelScroll(scroller, track)
  thumbElastic = elastic
  onCleanup(() => {
    elastic.dispose()
    if (thumbElastic === elastic)
      thumbElastic = undefined
  })
})

function handleThumbWheel(event: WheelEvent) {
  if (Math.abs(event.deltaX) <= Math.abs(event.deltaY))
    return
  thumbElastic?.handleWheel(event)
}

function revealThumb(index: number) {
  const scroller = thumbScrollerRef.value
  const thumb = scroller?.querySelectorAll<HTMLElement>('.moment-media__thumb')[index]
  if (!scroller || !thumb)
    return
  const start = thumb.offsetLeft
  const end = start + thumb.offsetWidth
  const left = start < scroller.scrollLeft
    ? start
    : end > scroller.scrollLeft + scroller.clientWidth ? end - scroller.clientWidth : scroller.scrollLeft
  if (left !== scroller.scrollLeft)
    scroller.scrollTo({ left, behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
}

function handleCoverLoad(event: Event) {
  reveal(cover)
  emit('firstLoad', event)
}

function getImageLabel(index: number) {
  return t('moment_card.preview_image', { author: authorName, index: index + 1 })
}
</script>

<template>
  <div class="moment-media" :class="{ 'moment-media--portrait': portrait }">
    <div class="moment-media__stage" :class="{ 'is-previewing': previewing }">
      <div
        v-if="gallery"
        class="moment-media__cover moment-media__cover--images"
        :style="{ '--moment-media-ratio': imageBoxRatio }"
        @wheel="imageSwipe.wheel"
        @pointerdown="imageSwipe.pointerdown"
        @pointerup="imageSwipe.pointerup"
        @pointercancel="imageSwipe.pointercancel"
        @keydown="handleImageKeydown"
      >
        <template v-for="(image, imageIndex) in images" :key="image">
          <button
            v-if="mountedImages.has(imageIndex)"
            :ref="element => bindImageButton(imageIndex, element)"
            type="button"
            class="moment-media__image"
            :class="{ 'is-layer': imageLayers.includes(imageIndex) }"
            :style="{ zIndex: imageLayers.indexOf(imageIndex) + 1 }"
            :tabindex="imageIndex === requestedImage ? 0 : -1"
            :aria-hidden="imageIndex === shownImage ? undefined : 'true'"
            :aria-label="getImageLabel(imageIndex)"
            :data-bewly-portrait="isPortraitRatio(imageRatios[imageIndex]) ? '' : undefined"
            @click.stop="handleImageClick(imageIndex, $event)"
          >
            <img
              :ref="element => bindImage(imageIndex, element)"
              :src="getMomentThumbnailUrl(image)"
              :srcset="getMomentThumbnailSrcset(image)"
              sizes="auto"
              :alt="t('moment_card.moment_image_alt', { author: authorName, index: imageIndex + 1 })"
              loading="lazy"
              decoding="async"
              @load="handleImageLoad(imageIndex, $event)"
              @error="imageIndex === requestedImage && showImage(imageIndex)"
            >
          </button>
        </template>
      </div>
      <div
        v-else
        class="moment-media__cover moment-media__cover--video"
        @mouseenter="emit('coverEnter', $event)"
        @mouseleave="emit('coverLeave')"
        @contextmenu="emit('coverMenu', $event)"
      >
        <a
          :href="href || undefined" class="moment-media__link" target="_blank" rel="noopener noreferrer" draggable="false"
          :aria-label="hrefLabel" @click="emit('coverClick', $event)"
        />
        <img
          :src="getMomentThumbnailUrl(cover)"
          :alt="coverAlt"
          :class="{ 'is-ready': isRevealed(cover) }"
          loading="lazy"
          decoding="async"
          @load="handleCoverLoad"
        >
        <!-- The hover preview, from the host. -->
        <slot />
        <!-- Like video cards the cover carries no stats; LIVE alone marks a live room. -->
        <LiveMark v-if="live" class="moment-media__live-mark" />
      </div>
      <ProgressiveBlur v-if="blur" edge="bottom" class="moment-media__blur" :visible="!previewing" sample-within=".moment-media__stage" />
    </div>
    <!-- Several images: a strip of all of them just under the fade, edge to
         edge with hairlines between, scrolling sideways. -->
    <div
      v-if="gallery && images.length > 1"
      ref="thumbScrollerRef"
      class="moment-media__thumbs"
      @wheel="handleThumbWheel"
    >
      <div class="moment-media__thumbs-track">
        <button
          v-for="(image, imageIndex) in images"
          :key="image"
          type="button"
          class="moment-media__thumb"
          :class="{ 'is-active': imageIndex === requestedImage }"
          :aria-current="imageIndex === requestedImage ? 'true' : undefined"
          :aria-label="getImageLabel(imageIndex)"
          @click.stop="requestImage(imageIndex)"
        >
          <img
            :src="getMomentThumbnailUrl(image, 96)" alt="" loading="lazy" decoding="async"
            :class="{ 'is-ready': isRevealed(getMomentThumbnailUrl(image, 96)) }"
            @load="reveal(getMomentThumbnailUrl(image, 96))"
          >
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.moment-media {
  // The host sets these; the defaults are the card's own top.
  --moment-media-fade: var(--bew-space-6);
  min-width: 0;
}

.moment-media__stage {
  // The blur and colour fade leave gently once a preview starts loading.
  --bew-progressive-blur-fade: var(--bew-duration-moderate);
  position: relative;
}

// No dark backing or placeholder fill under the picture: on a scaled card the
// bottom edge lands between pixels, and an edge pixel blending the picture with
// a dark backing draws a thin dark line along the bottom of the cover.
.moment-media__cover {
  position: relative;
  width: 100%;
  overflow: hidden;
  border-radius: var(--moment-media-corners, var(--bew-media-radius) var(--bew-media-radius) 0 0);
  corner-shape: var(--bew-corner-shape);
  pointer-events: auto;
}

.moment-media__cover--video {
  aspect-ratio: 16 / 9;
}

.moment-media__cover--video > img {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  opacity: 0;
  object-fit: cover;
  object-position: center top;
  transition: opacity var(--bew-duration-fast) var(--bew-ease-standard);
}

// Covers fade in as they load, unless loaded before.
.moment-media__cover--video > img.is-ready {
  opacity: 1;
}

.moment-media__cover--video > :deep(video) {
  position: absolute;
  inset: 0;
  z-index: 1;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.moment-media__link {
  position: absolute;
  inset: 0;
  z-index: 1;
  border-radius: inherit;
  corner-shape: inherit;
}

.moment-media__live-mark {
  position: absolute;
  top: var(--bew-cover-overlay-inset);
  left: var(--bew-cover-overlay-inset);
  z-index: 2;
}

// A short gradient blur, strongest at the cover's bottom edge, then a colour
// fade to what lies beneath on top of it; the fade alone remains when frosted
// glass is off (ProgressiveBlur renders nothing then).
.moment-media__blur {
  inset: auto 0 0;
  z-index: 2;
  height: var(--moment-media-fade);
}

// It mounts once the card has finished entering and fades in over the same
// time as it leaves for a preview.
@starting-style {
  .moment-media__blur :deep(.bew-progressive-blur__layer) {
    opacity: 0;
  }
}

.moment-media__stage::after {
  content: "";
  position: absolute;
  // One pixel past the cover so its solid end also covers the cover's
  // bottom edge pixel; that pixel lies over the colour beneath.
  inset: auto 0 -1px;
  z-index: 2;
  height: calc(var(--moment-media-fade) + 1px);
  background: linear-gradient(to bottom, transparent, var(--moment-media-base, var(--bew-elevated-over-page)));
  pointer-events: none;
  transition: opacity var(--bew-progressive-blur-fade) var(--bew-ease-standard);
}

// From the moment a preview starts (loading ring included) the fade leaves with
// the blur (its `visible` prop, same duration); both return when it stops.
.moment-media__stage.is-previewing::after {
  opacity: 0;
}

// Images stack in the cover box, drawn ones (layers) in order with the shown
// one on top; the fades run in script (crossfadeLayers). Sideways swipes are
// ours, vertical pans the page's.
.moment-media__cover--images {
  aspect-ratio: var(--moment-media-ratio, 1);
  touch-action: pan-y;
}

.moment-media__image {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  padding: 0;
  border: 0;
  border-radius: inherit;
  corner-shape: inherit;
  background: none;
  opacity: 0;
  cursor: zoom-in;
}

.moment-media__image.is-layer {
  opacity: 1;
}

.moment-media__image > img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center top;
}

.moment-media__image:focus-visible {
  outline: var(--bew-focus-ring, 1px solid CanvasText);
  outline-offset: -2px;
}

// A portrait picture keeps its clear upper part (at most 1.2 widths tall) and
// fades below it over a longer band, added as padding.
.moment-media--portrait {
  --moment-media-fade: var(--bew-space-12);
}

.moment-media--portrait .moment-media__cover--images {
  box-sizing: content-box;
  padding-bottom: var(--moment-media-fade);
}

// Under the fade: every image as a thumbnail, edge to edge with a hairline
// between, in one strip whose smaller corner nests in its host (the inset is
// not smaller than the host's corner). It sizes to its thumbnails and scrolls
// sideways.
.moment-media__thumbs {
  position: relative;
  width: fit-content;
  max-width: calc(100% - 2 * var(--moment-media-inset, var(--bew-card-inset)));
  margin: var(--bew-space-2) var(--moment-media-inset, var(--bew-card-inset)) 0;
  overflow-x: auto;
  overflow-y: hidden;
  overscroll-behavior-x: contain;
  border-radius: var(--moment-media-strip-radius, var(--bew-interactive-radius));
  corner-shape: var(--bew-corner-shape);
  scrollbar-width: none;
}

.moment-media__thumbs-track {
  display: flex;
  width: max-content;
}

.moment-media__thumb {
  flex: none;
  width: var(--bew-space-12);
  height: var(--bew-space-12);
  padding: 0;
  border: 0;
  // Holds the cell until its picture fades in.
  background: var(--bew-fill-1);
  opacity: 0.5;
  cursor: pointer;
  transition: opacity var(--bew-duration-fast) var(--bew-ease-standard);
}

.moment-media__thumb + .moment-media__thumb {
  border-inline-start: var(--bew-hairline) solid var(--bew-edge-color);
}

.moment-media__thumb > img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0;
  transition: opacity var(--bew-duration-fast) var(--bew-ease-standard);
}

.moment-media__thumb > img.is-ready {
  opacity: 1;
}

.moment-media__thumb:hover {
  opacity: 0.8;
}

.moment-media__thumb.is-active {
  opacity: 1;
}

.moment-media__thumb:focus-visible {
  outline: var(--bew-focus-ring, 1px solid CanvasText);
  outline-offset: -2px;
}

@media (prefers-reduced-motion: reduce) {
  .moment-media__stage::after,
  .moment-media__cover--video > img,
  .moment-media__thumb,
  .moment-media__thumb > img {
    transition: none;
  }
}
</style>
