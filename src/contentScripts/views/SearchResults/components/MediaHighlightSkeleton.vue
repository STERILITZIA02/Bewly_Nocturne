<script setup lang="ts">
import SkeletonBlock from '~/components/SkeletonBlock.vue'
</script>

<template>
  <article class="media-highlight-skeleton" aria-hidden="true">
    <SkeletonBlock class="media-highlight-skeleton__cover" width="160px" height="auto" radius="media" />
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
        <SkeletonBlock width="56px" height="var(--bew-control-item-height)" radius="interactive" />
        <SkeletonBlock width="56px" height="var(--bew-control-item-height)" radius="interactive" />
        <SkeletonBlock width="56px" height="var(--bew-control-item-height)" radius="interactive" />
      </div>
      <SkeletonBlock width="96px" height="var(--bew-control-height)" radius="interactive" />
    </div>
  </article>
</template>

<style scoped lang="scss">
.media-highlight-skeleton {
  display: flex;
  box-sizing: border-box;
  gap: var(--bew-space-4);
  min-width: 0;
  padding: var(--bew-space-4);
  border: 1px solid var(--bew-surface-border-color);
  border-radius: var(--bew-card-radius);
  corner-shape: var(--bew-corner-shape);
  background: var(--bew-elevated);
}

.media-highlight-skeleton__cover {
  aspect-ratio: 3 / 4;
  flex: 0 0 160px;
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
  gap: var(--bew-space-1);
}
</style>
