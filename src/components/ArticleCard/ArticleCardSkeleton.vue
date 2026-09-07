<script setup lang="ts">
import SkeletonBlock from '~/components/SkeletonBlock.vue'
</script>

<template>
  <article class="article-card-skeleton bew-surface-border" aria-hidden="true">
    <div class="article-card-skeleton__content">
      <SkeletonBlock width="72%" height="var(--bew-line-height-title)" />
      <div class="article-card-skeleton__description">
        <SkeletonBlock height="var(--bew-line-height-control)" />
        <SkeletonBlock width="84%" height="var(--bew-line-height-control)" />
      </div>
      <div class="article-card-skeleton__meta">
        <SkeletonBlock width="72px" height="var(--bew-line-height-caption)" />
        <SkeletonBlock width="56px" height="var(--bew-line-height-caption)" />
        <SkeletonBlock width="64px" height="var(--bew-line-height-caption)" />
      </div>
      <div class="article-card-skeleton__stats">
        <SkeletonBlock v-for="index in 3" :key="index" width="56px" height="var(--bew-line-height-caption)" />
      </div>
    </div>
    <SkeletonBlock class="article-card-skeleton__cover bew-surface-border" width="calc(var(--bew-base-font-size) * 8)" height="calc(var(--bew-base-font-size) * 6)" radius="media" />
  </article>
</template>

<style scoped lang="scss">
.article-card-skeleton {
  --uno: "gap-4 p-4";
  display: flex;
  box-sizing: border-box;
  border-radius: var(--bew-card-radius);
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

.article-card-skeleton__meta,
.article-card-skeleton__stats {
  --uno: "gap-3";
  display: flex;
  align-items: center;
}

.article-card-skeleton__cover {
  flex-shrink: 0;
}
</style>
