<script setup lang="ts">
import './mediaResults.scss'

import SkeletonBlock from '~/components/SkeletonBlock.vue'
</script>

<template>
  <article class="media-highlight-skeleton bew-media-result-card" aria-hidden="true">
    <SkeletonBlock class="media-highlight-skeleton__cover" width="var(--bew-media-result-cover-width)" height="auto" radius="media" />
    <div class="media-highlight-skeleton__info">
      <SkeletonBlock width="64%" height="var(--bew-line-height-heading)" />
      <div class="media-highlight-skeleton__meta">
        <SkeletonBlock width="56px" height="var(--bew-line-height-control)" />
        <SkeletonBlock width="72px" height="var(--bew-line-height-control)" />
      </div>
      <div class="media-highlight-skeleton__description">
        <SkeletonBlock height="var(--bew-line-height-body)" />
        <SkeletonBlock height="var(--bew-line-height-body)" />
        <SkeletonBlock width="76%" height="var(--bew-line-height-body)" />
      </div>
      <div class="media-highlight-skeleton__episodes">
        <SkeletonBlock width="min(100%, var(--bew-media-episode-control-width))" height="var(--bew-control-height)" radius="interactive" />
      </div>
      <SkeletonBlock class="media-highlight-skeleton__action" width="96px" height="var(--bew-control-height)" radius="interactive" />
    </div>
  </article>
</template>

<style scoped lang="scss">
.media-highlight-skeleton__cover {
  aspect-ratio: 3 / 4;
  flex: 0 0 var(--bew-media-result-cover-width);
}

.media-highlight-skeleton__info {
  display: flex;
  min-width: 0;
  flex: 1 1 auto;
  flex-direction: column;
  gap: var(--bew-space-2);
}

.media-highlight-skeleton__meta,
.media-highlight-skeleton__episodes {
  display: flex;
  align-items: center;
  gap: var(--bew-space-2);
}

.media-highlight-skeleton__description {
  display: grid;
  gap: 0;
}
.media-highlight-skeleton__action {
  margin-top: var(--bew-space-2);
}
</style>
