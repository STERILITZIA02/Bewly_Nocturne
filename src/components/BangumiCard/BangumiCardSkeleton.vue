<script setup lang="ts">
import SkeletonBlock from '~/components/SkeletonBlock.vue'
import { useVideoCardSharedStyles } from '~/composables/useVideoCardSharedStyles'

defineProps<{
  horizontal?: boolean
  showStats?: boolean
}>()
const { textStyle } = useVideoCardSharedStyles()
</script>

<template>
  <article class="bangumi-card-skeleton" :class="{ 'bangumi-card-skeleton--horizontal': horizontal }" aria-hidden="true">
    <div class="bangumi-card-skeleton__media">
      <SkeletonBlock class="bangumi-card-skeleton__image" height="auto" radius="media" />
    </div>
    <div class="bangumi-card-skeleton__content">
      <div class="bangumi-card__heading" :style="textStyle">
        <SkeletonBlock height="1lh" />
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
@use "../../styles/contentCard";

.bangumi-card-skeleton {
  display: block;
  min-width: 0;
}

.bangumi-card-skeleton--horizontal {
  --uno: "gap-4";
  display: flex;
}

.bangumi-card-skeleton__media {
  width: 100% !important;
  border-radius: var(--bew-thumb-radius);
  overflow: hidden;
}

.bangumi-card-skeleton__image {
  aspect-ratio: 12 / 16;
}

.bangumi-card-skeleton--horizontal .bangumi-card-skeleton__media {
  width: min(170px, 42%) !important;
  flex: none;
}

.bangumi-card-skeleton__content {
  --uno: "gap-2";
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
  margin-top: var(--bew-card-stack-gap);
}
.bangumi-card-skeleton:not(.bangumi-card-skeleton--horizontal) .bangumi-card-skeleton__content {
  @include contentCard.under-cover;
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
