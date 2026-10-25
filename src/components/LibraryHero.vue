<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import ProgressiveBlur from '~/components/ProgressiveBlur.vue'
import SkeletonBlock from '~/components/SkeletonBlock.vue'
import { useImageTone } from '~/composables/useImageTone'
import { settings } from '~/logic'
import { removeHttpFromUrl } from '~/utils/main'
import { hasLoadedPicture, rememberLoadedPicture } from '~/utils/pictureRevealMemory'

/**
 * The immersive head of a library page (user-specified, after the Moments
 * cards): a cover across the top that fades through a progressive blur into
 * the card, and below it the page's title, details and actions on the colour
 * the cover has where it is cut. Without an image it is a plain card.
 */
// `mediaPending`: the cover is expected but its URL has not arrived yet; a
// skeleton holds the band so the content below does not jump when it does.
const props = defineProps<{ image?: string, label: string, mediaPending?: boolean }>()
const cover = computed(() => props.image ? removeHttpFromUrl(`${props.image}@960w_540h_1c.webp`) : '')
// The cover fades in once loaded; one seen before shows at once.
const coverLoaded = ref(false)
watch(cover, src => coverLoaded.value = hasLoadedPicture(src), { immediate: true })
function handleCoverLoad() {
  coverLoaded.value = true
  rememberLoadedPicture(cover.value)
}
// The band above the cut (the cover's bottom) gives the card its colour.
const tone = useImageTone(() => ({ portrait: Boolean(props.image), image: props.image }))
</script>

<template>
  <section class="library-hero" :style="tone" :aria-label="label">
    <div class="library-hero__surface">
      <div v-if="cover || mediaPending" class="library-hero__media" aria-hidden="true">
        <img
          v-if="cover" :src="cover" alt="" decoding="async" :class="{ 'is-loaded': coverLoaded }"
          @load="handleCoverLoad"
        >
        <SkeletonBlock v-else class="library-hero__skeleton" height="100%" radius="media" />
        <ProgressiveBlur v-if="cover && !settings.disableFrostedGlass" edge="bottom" class="library-hero__blur" />
      </div>
      <div class="library-hero__body">
        <div class="library-hero__text">
          <slot />
        </div>
        <div v-if="$slots.actions" class="library-hero__actions">
          <slot name="actions" />
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped lang="scss">
@use "../styles/contentCard";
@use "../styles/imageTone" as *;

// The fallbacks sit on the host and the overrides on the surface: on one
// element they would refer to each other.
.library-hero {
  --moment-tone: var(--bew-elevated-over-page);
  --moment-tone-fg: var(--bew-neutral-fg);
  --library-hero-fade: var(--bew-space-12);
  min-width: 0;
}
.library-hero__surface {
  @include contentCard.media-frame;
  @include toned-surface;
  position: relative;
  border-radius: var(--bew-media-radius);
  corner-shape: var(--bew-corner-shape);
  background: var(--moment-tone);
}
// The cover clips itself (its top corners): a smooth-cornered overflow clip
// on the surface would make Chromium drop the blur's masks.
.library-hero__media {
  position: relative;
  height: clamp(160px, 22vw, 260px);
  > img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: var(--bew-media-radius) var(--bew-media-radius) 0 0;
    corner-shape: var(--bew-corner-shape);
    opacity: 0;
    &.is-loaded {
      opacity: 1;
    }
  }
  // A gradient to the card colour over the blur; one pixel past the cover so
  // its solid end also covers the cover's bottom edge pixel.
  &::after {
    content: "";
    position: absolute;
    inset: auto 0 -1px;
    z-index: 2;
    height: calc(var(--library-hero-fade) + 1px);
    background: linear-gradient(to bottom, transparent, var(--moment-tone));
    pointer-events: none;
  }
}
.library-hero__blur {
  inset: auto 0 0;
  z-index: 1;
  height: var(--library-hero-fade);
}
.library-hero__body {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--bew-space-4);
  padding: var(--bew-space-4);
}
.library-hero__text {
  display: grid;
  flex: 1 1 280px;
  gap: var(--bew-space-2);
  min-width: 0;
}
.library-hero__actions {
  display: flex;
  flex: none;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--bew-space-2);
  min-width: 0;
}
// Entering and leaving (the host wraps it in `<Transition name="library-hero"
// :duration="300">`) fade the layers, never the hero or the surface: an
// ancestor's opacity would stop the blur. The surface lets its colour, shadow
// and frame go; the blur fades its own layers.
.library-hero {
  transition: transform var(--bew-duration-moderate) var(--bew-ease-standard);
}
.library-hero__surface {
  transition:
    $tone-transition,
    background-color var(--bew-duration-moderate) var(--bew-ease-standard),
    box-shadow var(--bew-duration-moderate) var(--bew-ease-standard);
  &::after {
    transition: opacity var(--bew-duration-moderate) var(--bew-ease-standard);
  }
}
.library-hero__media > img,
.library-hero__media::after,
.library-hero__body,
.library-hero__blur :deep(.bew-progressive-blur__layer) {
  transition: opacity var(--bew-duration-moderate) var(--bew-ease-standard);
}
.library-hero-enter-from,
.library-hero-leave-to {
  transform: scale(0.98);
  .library-hero__surface {
    background-color: transparent;
    box-shadow: none;
    &::after {
      opacity: 0;
    }
  }
  .library-hero__media > img,
  .library-hero__media::after,
  .library-hero__body,
  .library-hero__blur :deep(.bew-progressive-blur__layer) {
    opacity: 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .library-hero,
  .library-hero__surface,
  .library-hero__surface::after,
  .library-hero__media > img,
  .library-hero__media::after,
  .library-hero__body,
  .library-hero__blur :deep(.bew-progressive-blur__layer) {
    transition: none;
  }
}
</style>
