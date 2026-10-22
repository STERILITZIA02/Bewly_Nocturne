<script setup lang="ts">
import LibraryVideoCardSkeleton from '~/components/LibraryVideoCardSkeleton.vue'
import SkeletonBlock from '~/components/SkeletonBlock.vue'
import { useGridLayout } from '~/composables/useGridLayout'

withDefaults(defineProps<{ history?: boolean, count?: number }>(), { count: 12 })
const { gridClass } = useGridLayout(() => 'adaptive')
</script>

<template>
  <div class="library-video-grid-skeleton" :class="{ 'history-timeline-skeleton': history }" aria-hidden="true">
    <div v-if="history" class="library-video-grid-skeleton__date" data-bew-skeleton-group>
      <SkeletonBlock width="112px" height="var(--bew-line-height-title)" />
    </div>
    <div :class="gridClass">
      <LibraryVideoCardSkeleton v-for="index in count" :key="index" :history="history" />
    </div>
  </div>
</template>

<style scoped lang="scss">
@use "../contentScripts/views/History/historyTimeline";
.library-video-grid-skeleton {
  min-width: 0;
  container-type: inline-size;
}
.library-video-grid-skeleton__date {
  min-height: var(--bew-control-item-height);
  margin-bottom: var(--bew-space-4);
}
</style>
