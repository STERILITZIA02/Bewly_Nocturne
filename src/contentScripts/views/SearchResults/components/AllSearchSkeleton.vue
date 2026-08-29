<script setup lang="ts">
import ArticleCardSkeleton from '~/components/ArticleCard/ArticleCardSkeleton.vue'
import SkeletonBlock from '~/components/SkeletonBlock.vue'
import type { Video } from '~/components/VideoCard/types'
import VideoCardGrid from '~/components/VideoCardGrid.vue'

const emptySkeletonItems: unknown[] = []

function transformSkeletonItem(_item: unknown): Video | undefined {
  return undefined
}

function getSkeletonItemKey() {
  return 'all-search-skeleton'
}
</script>

<template>
  <div class="all-search-skeleton" aria-hidden="true">
    <section class="all-search-skeleton__section">
      <SkeletonBlock width="120px" height="var(--bew-line-height-heading)" />
      <VideoCardGrid
        :items="emptySkeletonItems"
        :transform-item="transformSkeletonItem"
        :get-item-key="getSkeletonItemKey"
        grid-layout="adaptive"
        :loading="true"
        :no-more-content="false"
        :initial-skeleton-count="8"
        :show-loading-more-skeleton="false"
        :show-load-more-indicator="false"
      />
    </section>

    <section class="all-search-skeleton__section">
      <SkeletonBlock width="96px" height="var(--bew-line-height-heading)" />
      <article class="all-search-skeleton__user-card">
        <header class="all-search-skeleton__user-header">
          <SkeletonBlock width="64px" height="64px" radius="circle" />
          <div class="all-search-skeleton__user-info">
            <SkeletonBlock width="132px" height="var(--bew-line-height-body)" />
            <SkeletonBlock width="184px" height="var(--bew-line-height-caption)" />
            <SkeletonBlock width="68%" height="var(--bew-line-height-control)" />
          </div>
          <SkeletonBlock width="80px" height="var(--bew-control-height)" radius="interactive" />
        </header>
        <div class="all-search-skeleton__samples">
          <div v-for="index in 7" :key="index" class="all-search-skeleton__sample">
            <SkeletonBlock height="auto" radius="media" />
            <SkeletonBlock width="84%" height="var(--bew-line-height-caption)" />
          </div>
        </div>
      </article>
    </section>

    <section class="all-search-skeleton__section">
      <SkeletonBlock width="112px" height="var(--bew-line-height-heading)" />
      <div class="all-search-skeleton__article-grid">
        <ArticleCardSkeleton v-for="index in 2" :key="index" />
      </div>
    </section>
  </div>
</template>

<style scoped lang="scss">
@use "../../../../styles/breakpoints";

.all-search-skeleton,
.all-search-skeleton__section,
.all-search-skeleton__sample {
  display: grid;
}

.all-search-skeleton {
  gap: var(--bew-space-6);
}

.all-search-skeleton__section {
  gap: var(--bew-space-3);
}

.all-search-skeleton__user-card {
  box-sizing: border-box;
  padding: var(--bew-space-4);
  border: 1px solid var(--bew-surface-border-color);
  border-radius: var(--bew-card-radius);
  corner-shape: var(--bew-corner-shape);
  background: var(--bew-elevated);
}

.all-search-skeleton__user-header {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: var(--bew-space-3);
}

.all-search-skeleton__user-info {
  display: grid;
  min-width: 0;
  flex: 1 1 auto;
  gap: var(--bew-space-1);
}

.all-search-skeleton__samples {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: var(--bew-space-3);
  margin-top: var(--bew-space-3);
}

.all-search-skeleton__sample {
  min-width: 0;
  gap: var(--bew-space-2);
}

.all-search-skeleton__sample > :first-child {
  aspect-ratio: 16 / 9;
}

.all-search-skeleton__article-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--bew-space-4);
}

@media (max-width: breakpoints.$grid-lg) {
  .all-search-skeleton__samples {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .all-search-skeleton__sample:nth-child(n + 5) {
    display: none;
  }
}

@media (max-width: breakpoints.$grid-sm) {
  .all-search-skeleton__user-header {
    align-items: flex-start;
  }

  .all-search-skeleton__samples {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .all-search-skeleton__sample:nth-child(n + 3) {
    display: none;
  }

  .all-search-skeleton__article-grid {
    grid-template-columns: 1fr;
  }
}
</style>
