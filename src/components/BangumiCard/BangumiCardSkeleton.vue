<script setup lang="ts">
import SkeletonBlock from '~/components/SkeletonBlock.vue'
import { useBangumiCardSharedStyles } from '~/composables/useVideoCardSharedStyles'

defineProps<{
  horizontal?: boolean
  showStats?: boolean
}>()
const { bangumiTitleClass, bangumiTitleStyle } = useBangumiCardSharedStyles()
</script>

<template>
  <article class="bangumi-card-skeleton" :class="{ 'bangumi-card-skeleton--horizontal': horizontal }" aria-hidden="true">
    <div class="bangumi-card-skeleton__media bew-surface-border">
      <SkeletonBlock class="bangumi-card-skeleton__image" height="auto" radius="media" />
    </div>
    <div class="bangumi-card-skeleton__content">
      <div :class="bangumiTitleClass" :style="bangumiTitleStyle" un-text="lg">
        <SkeletonBlock height="1lh" />
      </div>
      <SkeletonBlock v-if="showStats" width="68%" height="var(--bew-line-height-control)" />
      <div class="bangumi-card-skeleton__meta">
        <SkeletonBlock width="52px" height="var(--bew-line-height-body)" radius="interactive" />
        <SkeletonBlock width="60%" height="var(--bew-line-height-body)" />
      </div>
    </div>
  </article>
</template>

<style scoped lang="scss">
@use "./title";

.bangumi-card-skeleton {
  --uno: "mb-6";
  display: block;
  min-width: 0;
}

.bangumi-card-skeleton--horizontal {
  --uno: "gap-4";
  display: flex;
}

.bangumi-card-skeleton__media {
  width: 100% !important;
  border-radius: var(--bew-media-radius);
  overflow: hidden;
}

.bangumi-card-skeleton__image {
  aspect-ratio: 12 / 16;
}

.bangumi-card-skeleton--horizontal .bangumi-card-skeleton__media {
  width: 170px !important;
  flex: 0 0 170px;
}

.bangumi-card-skeleton__content {
  --uno: "gap-2";
  display: flex;
  flex-direction: column;
  width: 100%;
  margin-top: var(--bew-space-4);
}
.bangumi-card-skeleton--horizontal .bangumi-card-skeleton__content {
  margin-top: 0;
}

.bangumi-card-skeleton__meta {
  display: flex;
  align-items: center;
  gap: var(--bew-space-2);
}
</style>
