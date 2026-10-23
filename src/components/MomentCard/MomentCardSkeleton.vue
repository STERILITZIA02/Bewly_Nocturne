<script setup lang="ts">
import SkeletonBlock from '~/components/SkeletonBlock.vue'

import type { MomentCardSkeletonVariant } from './utils'

const { variant = 'video' } = defineProps<{ variant?: MomentCardSkeletonVariant }>()
</script>

<template>
  <article
    class="moment-card-skeleton"
    :class="[`moment-card-skeleton--${variant}`, { 'moment-card-skeleton--media': variant !== 'text' }]"
    aria-hidden="true"
  >
    <!-- Mirrors the card: the picture fills the top edge to edge and fades
         into the card colour; several pictures add the thumbnail strip. -->
    <div v-if="variant !== 'text'" class="moment-card-skeleton__stage">
      <SkeletonBlock class="moment-card-skeleton__media" height="auto" radius="interactive" />
    </div>
    <div v-if="variant === 'gallery'" class="moment-card-skeleton__thumbs">
      <SkeletonBlock
        v-for="thumb in 4" :key="thumb" class="moment-card-skeleton__thumb" width="var(--bew-space-12)" height="var(--bew-space-12)"
        radius="interactive"
      />
    </div>
    <div class="moment-card-skeleton__header">
      <SkeletonBlock width="var(--bew-control-height)" height="var(--bew-control-height)" radius="circle" />
      <div class="moment-card-skeleton__identity">
        <SkeletonBlock width="40%" height="var(--bew-line-height-title)" />
        <SkeletonBlock width="26%" height="var(--bew-line-height-caption)" />
      </div>
      <SkeletonBlock width="var(--bew-icon-button-size-md)" height="var(--bew-icon-button-size-md)" radius="circle" />
    </div>
    <div class="moment-card-skeleton__main">
      <div class="moment-card-skeleton__body">
        <SkeletonBlock v-if="variant === 'video'" width="76%" height="var(--bew-line-height-title)" />
        <SkeletonBlock
          v-for="line in variant === 'text' ? 4 : 2"
          :key="line"
          :width="line === (variant === 'text' ? 4 : 2) ? '64%' : '100%'"
          height="var(--bew-line-height-body)"
        />
      </div>
    </div>
    <div class="moment-card-skeleton__footer">
      <SkeletonBlock v-for="action in 3" :key="action" width="40%" height="var(--bew-line-height-control)" />
    </div>
  </article>
</template>

<style scoped lang="scss">
@use "../../styles/breakpoints";
@use "../../styles/contentCard";

.moment-card-skeleton {
  // Same corner, frame and opaque colour as the card.
  @include contentCard.media-frame;
  position: relative;
  container-type: inline-size;
  box-sizing: border-box;
  overflow: hidden;
  border-radius: var(--bew-media-radius);
  corner-shape: var(--bew-corner-shape);
  background: var(--bew-elevated-over-page);
}
.moment-card-skeleton__stage {
  position: relative;
}
// The card's colour fade over the picture's bottom edge.
.moment-card-skeleton__stage::after {
  content: "";
  position: absolute;
  inset: auto 0 0;
  height: var(--bew-space-6);
  background: linear-gradient(to bottom, transparent, var(--bew-elevated-over-page));
  pointer-events: none;
}
.moment-card-skeleton__media.moment-card-skeleton__media {
  display: block;
  width: 100%;
  aspect-ratio: 16 / 9;
  border-radius: 0;
}
.moment-card-skeleton--image .moment-card-skeleton__media.moment-card-skeleton__media {
  aspect-ratio: 4 / 3;
}
.moment-card-skeleton--gallery .moment-card-skeleton__media.moment-card-skeleton__media {
  aspect-ratio: 1;
}
// The thumbnail strip under the fade: edge to edge with hairlines between.
.moment-card-skeleton__thumbs {
  display: flex;
  width: fit-content;
  margin: var(--bew-space-2) var(--bew-card-inset) 0;
  overflow: hidden;
  border-radius: var(--bew-interactive-radius);
  corner-shape: var(--bew-corner-shape);
}
.moment-card-skeleton__thumb.moment-card-skeleton__thumb {
  border-radius: 0;
}
.moment-card-skeleton__thumb + .moment-card-skeleton__thumb {
  border-inline-start: 1px solid var(--bew-surface-border-color);
}
.moment-card-skeleton__header {
  display: flex;
  align-items: center;
  gap: var(--bew-space-3);
  padding: var(--bew-card-inset) var(--bew-card-inset) var(--bew-card-stack-gap);
}
.moment-card-skeleton--media .moment-card-skeleton__header {
  padding-top: var(--bew-card-stack-gap);
}
.moment-card-skeleton__identity {
  display: grid;
  flex: 1;
  gap: var(--bew-space-1);
  min-width: 0;
}
.moment-card-skeleton__main {
  display: flex;
  flex-direction: column;
  gap: var(--bew-space-3);
  padding: 0 var(--bew-card-inset) var(--bew-space-3);
}
.moment-card-skeleton__body {
  display: grid;
  gap: 0;
  min-width: 0;
  padding: var(--bew-space-3);
}
.moment-card-skeleton--video .moment-card-skeleton__body > :first-child {
  margin-bottom: var(--bew-space-2);
}
.moment-card-skeleton__footer {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  place-items: center;
  min-height: var(--bew-space-10);
  padding: 0 var(--bew-space-2);
  box-sizing: border-box;
}

@container (min-width: #{breakpoints.$moment-card-wide}) {
  // Wide cards (single picture or cover) put it down the left beside the
  // header and body, as the card does.
  .moment-card-skeleton:is(.moment-card-skeleton--video, .moment-card-skeleton--image) {
    display: grid;
    grid-template-columns: minmax(0, 3fr) minmax(320px, 2fr);
    align-items: start;
  }
  .moment-card-skeleton:is(.moment-card-skeleton--video, .moment-card-skeleton--image) .moment-card-skeleton__stage {
    grid-column: 1;
    grid-row: 1 / span 2;
  }
  .moment-card-skeleton:is(.moment-card-skeleton--video, .moment-card-skeleton--image) .moment-card-skeleton__header {
    padding-top: var(--bew-card-inset);
  }
  .moment-card-skeleton:is(.moment-card-skeleton--video, .moment-card-skeleton--image) .moment-card-skeleton__footer {
    grid-column: 1 / -1;
  }
}
</style>
