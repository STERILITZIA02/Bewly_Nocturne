<script setup lang="ts">
import SkeletonBlock from '~/components/SkeletonBlock.vue'
</script>

<template>
  <article class="article-card-skeleton bew-surface-border" aria-hidden="true">
    <div class="article-card-skeleton__content">
      <SkeletonBlock width="72%" height="var(--bew-line-height-body)" />
      <div class="article-card-skeleton__description">
        <SkeletonBlock height="var(--bew-line-height-control)" />
        <SkeletonBlock width="84%" height="var(--bew-line-height-control)" />
      </div>
      <div class="article-card-skeleton__meta">
        <SkeletonBlock width="72px" height="var(--bew-line-height-caption)" />
        <SkeletonBlock width="56px" height="var(--bew-line-height-caption)" />
        <SkeletonBlock width="64px" height="var(--bew-line-height-caption)" />
      </div>
      <div class="article-card-skeleton__tags">
        <SkeletonBlock width="56px" height="20px" radius="full" />
        <SkeletonBlock width="68px" height="20px" radius="full" />
      </div>
    </div>
    <SkeletonBlock class="article-card-skeleton__cover" width="128px" height="96px" radius="media" />
  </article>
</template>

<style scoped lang="scss">
.article-card-skeleton {
  display: flex;
  box-sizing: border-box;
  gap: var(--bew-space-4);
  min-height: 128px;
  padding: var(--bew-space-4);
  border-radius: var(--bew-card-radius);
  corner-shape: var(--bew-corner-shape);
  background: var(--bew-elevated);
}

.article-card-skeleton__content {
  display: flex;
  min-width: 0;
  flex: 1 1 auto;
  flex-direction: column;
  gap: var(--bew-space-2);
}

.article-card-skeleton__description {
  display: grid;
  gap: var(--bew-space-1);
}

.article-card-skeleton__meta,
.article-card-skeleton__tags {
  display: flex;
  align-items: center;
  gap: var(--bew-space-3);
}

.article-card-skeleton__cover {
  flex: 0 0 128px;
}
</style>
