<script setup lang="ts">
import SkeletonBlock from '~/components/SkeletonBlock.vue'

defineProps<{ history?: boolean }>()
</script>

<template>
  <article class="library-video-skeleton" :class="{ 'library-video-skeleton--history': history }" aria-hidden="true">
    <SkeletonBlock class="library-video-skeleton__cover" height="auto" radius="media" />
    <div class="library-video-skeleton__details">
      <div class="library-video-skeleton__title">
        <SkeletonBlock width="88%" height="var(--bew-font-size-title)" />
        <SkeletonBlock width="68%" height="var(--bew-font-size-title)" />
      </div>
      <div class="library-video-skeleton__author">
        <SkeletonBlock width="var(--bew-space-6)" height="var(--bew-space-6)" radius="circle" />
        <SkeletonBlock width="45%" height="var(--bew-line-height-control)" />
      </div>
      <div v-if="history" class="library-video-skeleton__time">
        <SkeletonBlock width="60%" height="var(--bew-line-height-control)" />
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
  border-radius: var(--bew-card-radius);
  corner-shape: var(--bew-corner-shape);
}
.library-video-skeleton__cover {
  width: 100%;
  aspect-ratio: 16 / 9;
}
.library-video-skeleton__details {
  display: grid;
  gap: var(--bew-space-2);
}
.library-video-skeleton__title {
  display: grid;
  grid-template-rows: repeat(2, var(--bew-line-height-title));
  align-items: center;
}
.library-video-skeleton__author {
  display: flex;
  align-items: center;
  gap: var(--bew-space-2);
}
.library-video-skeleton__time {
  display: flex;
  align-items: center;
  min-height: var(--bew-control-height-sm);
}
.library-video-skeleton--history {
  padding: var(--bew-space-3);
}
</style>
