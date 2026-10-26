<script setup lang="ts">
import SkeletonBlock from '~/components/SkeletonBlock.vue'
import { useVideoCardSharedStyles } from '~/composables/useVideoCardSharedStyles'

const { textStyle } = useVideoCardSharedStyles()
</script>

<template>
  <article class="library-video-skeleton" :style="textStyle" aria-hidden="true">
    <SkeletonBlock class="library-video-skeleton__cover" height="auto" radius="media" />
    <div class="library-video-skeleton__details">
      <div class="library-video-skeleton__title">
        <SkeletonBlock width="88%" height="var(--video-card-title-size)" />
        <SkeletonBlock width="68%" height="var(--video-card-title-size)" />
      </div>
      <div class="library-video-skeleton__author">
        <SkeletonBlock width="45%" height="var(--bew-author-line-height)" />
      </div>
    </div>
  </article>
</template>

<style scoped lang="scss">
.library-video-skeleton {
  display: flex;
  box-sizing: border-box;
  min-width: 0;
  padding: var(--bew-space-2);
  flex-direction: column;
  gap: var(--bew-space-3);
  border-radius: var(--bew-surface-radius);
  corner-shape: var(--bew-corner-shape);
}
.library-video-skeleton__cover {
  width: 100%;
  aspect-ratio: var(--bew-video-cover-aspect-ratio);
}
.library-video-skeleton__details {
  display: grid;
  gap: var(--bew-space-1);
}
.library-video-skeleton__title {
  display: grid;
  grid-template-rows: repeat(2, var(--bew-title-line-height));
  align-items: center;
}
.library-video-skeleton__author {
  display: flex;
  align-items: center;
  gap: var(--bew-space-2);
}
</style>
