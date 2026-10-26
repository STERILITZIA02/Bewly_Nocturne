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
 * cards): the page's title, details and actions on the left, on the colour
 * of the cover's left edge, and the cover on the right fading into it through
 * a progressive blur. Without an image it is a plain card.
 *
 * Every page lays its info out the same way: an optional eyebrow, the title
 * (two lines at most) and a meta line at the top, anything else under them
 * (the default slot), and the actions along the bottom.
 */
// `mediaPending`: the cover is expected but its URL has not arrived yet; a
// skeleton holds its place so nothing moves when it does.
const props = defineProps<{ image?: string, label: string, mediaPending?: boolean, eyebrow?: string, title?: string, meta?: string }>()
const cover = computed(() => props.image ? removeHttpFromUrl(`${props.image}@960w_540h_1c.webp`) : '')
// The cover fades in once loaded; one seen before shows at once.
const coverLoaded = ref(false)
watch(cover, src => coverLoaded.value = hasLoadedPicture(src), { immediate: true })
function handleCoverLoad() {
  coverLoaded.value = true
  rememberLoadedPicture(cover.value)
}
// The cover's left edge, where it meets the info, gives the card its colour.
const tone = useImageTone(() => ({ portrait: Boolean(props.image), image: props.image, edge: 'left' }))
</script>

<template>
  <section class="library-hero" :style="tone" :aria-label="label">
    <div class="library-hero__surface">
      <div class="library-hero__body">
        <div class="library-hero__text">
          <span v-if="eyebrow" class="library-hero__eyebrow">{{ eyebrow }}</span>
          <h2 class="library-hero__title keep-two-lines">
            <slot name="title">
              {{ title }}
            </slot>
          </h2>
          <span v-if="meta" class="library-hero__meta">{{ meta }}</span>
          <slot />
        </div>
        <!-- A card that becomes current (or stops being) fades its actions. -->
        <Transition name="library-hero-swap">
          <div v-if="$slots.actions" class="library-hero__actions">
            <slot name="actions" />
          </div>
        </Transition>
      </div>
      <div v-if="cover || mediaPending" class="library-hero__media" aria-hidden="true">
        <img
          v-if="cover" :src="cover" alt="" decoding="async" :class="{ 'is-loaded': coverLoaded }"
          @load="handleCoverLoad"
        >
        <SkeletonBlock v-else class="library-hero__skeleton" height="100%" radius="media" />
        <ProgressiveBlur v-if="cover && !settings.disableFrostedGlass" edge="left" class="library-hero__blur" />
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
  // Wider than the top-edge fades elsewhere: it runs across the cover's width.
  --library-hero-fade: calc(var(--bew-space-12) * 2);
  // A card of `LibraryHeroCarousel`, which pins and sizes it.
  height: 100%;
  min-width: 0;
}
.library-hero__surface {
  @include contentCard.media-frame;
  @include toned-surface;
  position: relative;
  display: flex;
  height: 100%;
  border-radius: var(--bew-media-radius);
  corner-shape: var(--bew-corner-shape);
  background: var(--moment-tone);
}
// About 30% of the card for the info (user-specified), never narrower than a
// two-line title needs; the cover takes the rest.
.library-hero__body {
  display: flex;
  flex: 0 0 max(30%, 240px);
  flex-direction: column;
  justify-content: space-between;
  gap: var(--bew-space-4);
  min-width: 0;
  padding: var(--bew-space-5);
}
.library-hero__text {
  display: grid;
  align-content: start;
  gap: var(--bew-space-1);
  min-width: 0;
}
.library-hero__eyebrow {
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);
}
.library-hero__title {
  margin: 0;
  color: var(--bew-text-1);
  font-size: var(--bew-font-size-display);
  font-weight: var(--bew-font-weight-regular);
  line-height: var(--bew-line-height-display);
}
.library-hero__meta {
  margin-top: var(--bew-space-1);
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-callout);
  line-height: var(--bew-line-height-callout);
  font-variant-numeric: tabular-nums;
}
.library-hero__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--bew-space-2);
  min-width: 0;
}
// As tall as the card across the rest of its width. The cover fills it from
// its left edge, so the colour read there always meets the info.
.library-hero__media {
  position: relative;
  flex: 1 1 0;
  min-width: 0;
  // The cover clips itself (its right corners): a smooth-cornered overflow
  // clip on the surface would make Chromium drop the blur's masks.
  > img {
    position: absolute;
    inset: 0;
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: left center;
    border-radius: 0 var(--bew-media-radius) var(--bew-media-radius) 0;
    corner-shape: var(--bew-corner-shape);
    opacity: 0;
    &.is-loaded {
      opacity: 1;
    }
  }
  // A gradient from the card colour over the blur; one pixel past the cover
  // so its solid end also covers the cover's left edge pixel.
  &::after {
    content: "";
    position: absolute;
    inset: 0 auto 0 -1px;
    z-index: 2;
    width: calc(var(--library-hero-fade) + 1px);
    background: linear-gradient(to right, var(--moment-tone), transparent);
    pointer-events: none;
  }
}
.library-hero__skeleton {
  position: absolute;
  inset: 0;
}
.library-hero__blur {
  inset: 0 auto 0 0;
  z-index: 1;
  width: var(--library-hero-fade);
}
// Entering and leaving (the host wraps the carousel in `<Transition
// name="library-hero" :duration="300">`; the carousel scales) fade the
// layers, never the hero or the surface: an ancestor's opacity would stop the
// blur. The surface lets its colour, shadow and frame go; the blur fades its
// own layers.
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
.library-hero-swap-enter-active,
.library-hero-swap-leave-active {
  transition: opacity var(--bew-duration-moderate) var(--bew-ease-standard);
}
.library-hero-swap-enter-from,
.library-hero-swap-leave-to {
  opacity: 0;
}
@media (prefers-reduced-motion: reduce) {
  .library-hero-swap-enter-active,
  .library-hero-swap-leave-active,
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
