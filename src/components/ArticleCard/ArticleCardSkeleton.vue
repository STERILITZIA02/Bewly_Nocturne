<script setup lang="ts">
import SkeletonBlock from '~/components/SkeletonBlock.vue'

defineProps<{
  coverFill?: boolean
}>()
</script>

<template>
  <article
    class="article-card-skeleton bew-surface-border"
    :class="{ 'article-card-skeleton--cover-fill': coverFill }"
    aria-hidden="true"
  >
    <div class="article-card-skeleton__content">
      <SkeletonBlock width="72%" height="var(--bew-line-height-title)" />
      <div class="article-card-skeleton__description">
        <SkeletonBlock height="var(--bew-line-height-body)" />
        <SkeletonBlock width="84%" height="var(--bew-line-height-body)" />
      </div>
      <div class="article-card-skeleton__meta">
        <SkeletonBlock width="72px" height="var(--bew-line-height-caption)" />
        <SkeletonBlock width="56px" height="var(--bew-line-height-caption)" />
        <SkeletonBlock width="64px" height="var(--bew-line-height-caption)" />
      </div>
    </div>
    <SkeletonBlock class="article-card-skeleton__cover" width="min(32%, 160px)" height="auto" radius="interactive" />
  </article>
</template>

<style scoped lang="scss">
.article-card-skeleton {
  --uno: "gap-4 p-4";
  display: flex;
  box-sizing: border-box;
  border-radius: var(--bew-surface-radius);
  corner-shape: var(--bew-corner-shape);
  background: var(--bew-elevated);
}

.article-card-skeleton__content {
  --uno: "gap-2";
  display: flex;
  min-width: 0;
  flex: 1 1 auto;
  flex-direction: column;
}

.article-card-skeleton__description {
  display: grid;
  gap: 0;
}

.article-card-skeleton__meta {
  --uno: "gap-2";
  display: flex;
  flex-wrap: wrap;
  align-items: center;
}

.article-card-skeleton__cover {
  flex-shrink: 0;
  aspect-ratio: 16 / 10;
  align-self: flex-start;
}

.article-card-skeleton--cover-fill {
  --article-cover-width: min(38%, 180px);
  position: relative;
  display: block;
  padding: 0;

  .article-card-skeleton__content {
    padding: var(--bew-space-4);
    padding-right: calc(var(--article-cover-width) + var(--bew-space-4));
  }

  .article-card-skeleton__cover {
    position: absolute;
    inset: 0 0 0 auto;
    // The side-by-side layout aligns the cover to the start; on an absolute box
    // that shrinks it to its content (the image's own height) instead of
    // filling between the insets, so the cover would stop short or overflow.
    align-self: stretch;
    width: var(--article-cover-width);
    max-width: none;
    aspect-ratio: auto;
    border-radius: 0 var(--bew-surface-radius) var(--bew-surface-radius) 0;
  }
}
</style>
