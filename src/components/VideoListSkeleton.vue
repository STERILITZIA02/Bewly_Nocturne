<script setup lang="ts">
import SkeletonBlock from '~/components/SkeletonBlock.vue'

withDefaults(defineProps<{
  count?: number
  actionCount?: number
  history?: boolean
}>(), {
  count: 4,
  actionCount: 1,
})
</script>

<template>
  <div class="video-list-skeleton" :class="{ 'video-list-skeleton--history': history }" aria-hidden="true">
    <article v-for="index in count" :key="index" class="video-list-skeleton__row">
      <div v-if="history" class="bew-history-time-slot">
        <span class="bew-history-time-chip video-list-skeleton__time" data-bew-skeleton>0000-00-00 00:00:00</span>
      </div>
      <div class="video-list-skeleton__item">
        <SkeletonBlock class="video-list-skeleton__cover" height="auto" radius="media" />
        <div class="video-list-skeleton__content">
          <div class="video-list-skeleton__title">
            <SkeletonBlock width="88%" height="var(--bew-font-size-heading)" />
            <SkeletonBlock width="68%" height="var(--bew-font-size-heading)" />
          </div>
          <div class="video-list-skeleton__author">
            <SkeletonBlock width="30px" height="30px" radius="circle" />
            <SkeletonBlock width="112px" height="var(--bew-line-height-control)" />
          </div>
          <SkeletonBlock class="video-list-skeleton__meta" width="136px" height="var(--bew-line-height-control)" />
        </div>
        <div class="video-list-skeleton__actions">
          <SkeletonBlock
            v-for="action in actionCount"
            :key="action"
            width="var(--bew-icon-size-lg)"
            height="var(--bew-icon-size-lg)"
            radius="circle"
          />
        </div>
      </div>
    </article>
  </div>
</template>

<style scoped lang="scss">
@use "../styles/breakpoints";
@use "../styles/videoList";

.video-list-skeleton {
  display: grid;
}
.video-list-skeleton__row {
  display: flex;
  width: 100%;
}
.video-list-skeleton__time {
  color: transparent;
}
.video-list-skeleton__row > .bew-history-time-slot {
  border-left: var(--bew-space-0-5) solid transparent;
}
.video-list-skeleton__title {
  display: grid;
  grid-template-rows: repeat(2, var(--bew-line-height-heading));
}
.video-list-skeleton__meta {
  --uno: "mt-2";
}
@media (min-width: breakpoints.$grid-xl) {
  .video-list-skeleton--history .video-list-skeleton__meta {
    display: none;
  }
}

.video-list-skeleton__item {
  --uno: "gap-6 p-2 m-1";
  display: flex;
  box-sizing: border-box;
  align-items: flex-start;
  width: 100%;
  min-width: 0;
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
  gap: 0;
}

.video-list-skeleton__author {
  --uno: "gap-2 mt-4";
  display: flex;
  align-items: center;
}

.video-list-skeleton__actions {
  --uno: "gap-1";
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  margin-left: auto;
  align-self: stretch;
}

@media (max-width: (breakpoints.$grid-lg - 1px)) {
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
