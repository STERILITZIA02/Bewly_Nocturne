<script setup lang="ts">
import SkeletonBlock from '~/components/SkeletonBlock.vue'

withDefaults(defineProps<{
  count?: number
  actionCount?: number
}>(), {
  count: 4,
  actionCount: 1,
})
</script>

<template>
  <div class="video-list-skeleton" aria-hidden="true">
    <article v-for="index in count" :key="index" class="video-list-skeleton__item">
      <SkeletonBlock class="video-list-skeleton__cover" height="auto" radius="media" />
      <div class="video-list-skeleton__content">
        <SkeletonBlock width="88%" height="var(--bew-line-height-title)" />
        <SkeletonBlock width="68%" height="var(--bew-line-height-title)" />
        <div class="video-list-skeleton__author">
          <SkeletonBlock width="30px" height="30px" radius="circle" />
          <SkeletonBlock width="112px" height="var(--bew-line-height-control)" />
        </div>
        <SkeletonBlock width="136px" height="var(--bew-line-height-caption)" />
      </div>
      <div class="video-list-skeleton__actions">
        <SkeletonBlock
          v-for="action in actionCount"
          :key="action"
          width="var(--bew-control-height)"
          height="var(--bew-control-height)"
          radius="circle"
        />
      </div>
    </article>
  </div>
</template>

<style scoped lang="scss">
@use "../styles/breakpoints";

.video-list-skeleton {
  display: grid;
}

.video-list-skeleton__item {
  display: flex;
  box-sizing: border-box;
  align-items: flex-start;
  gap: var(--bew-space-6);
  width: 100%;
  padding: var(--bew-space-2);
  margin: var(--bew-space-1);
  border-radius: var(--bew-card-radius);
  corner-shape: var(--bew-corner-shape);
}

.video-list-skeleton__cover {
  width: 250px !important;
  aspect-ratio: 16 / 9;
  flex: 0 0 250px;
}

.video-list-skeleton__content {
  display: flex;
  min-width: 0;
  flex: 1 1 auto;
  flex-direction: column;
  gap: var(--bew-space-2);
}

.video-list-skeleton__author {
  display: flex;
  align-items: center;
  gap: var(--bew-space-2);
  margin-top: var(--bew-space-2);
}

.video-list-skeleton__actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: var(--bew-space-1);
  margin-left: auto;
}

@media (max-width: breakpoints.$grid-lg) {
  .video-list-skeleton__item {
    flex-direction: column;
  }

  .video-list-skeleton__cover {
    width: 100% !important;
    flex-basis: auto;
  }

  .video-list-skeleton__actions {
    display: none;
  }
}
</style>
