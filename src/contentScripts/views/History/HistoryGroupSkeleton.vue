<script setup lang="ts">
import LibraryBleedStrip from '~/components/LibraryBleedStrip.vue'
import SkeletonBlock from '~/components/SkeletonBlock.vue'
import VideoCard from '~/components/VideoCard/VideoCard.vue'

/** Watch-history groups while they load: a heading over a strip of cards each. */
withDefaults(defineProps<{ rows?: number, cards?: number }>(), { rows: 2, cards: 6 })
</script>

<template>
  <div class="history-group-skeleton" aria-hidden="true">
    <section v-for="row in rows" :key="row" class="history-group-skeleton__row">
      <div class="history-group-skeleton__heading">
        <SkeletonBlock width="160px" height="var(--bew-line-height-title)" />
      </div>
      <LibraryBleedStrip label="">
        <VideoCard v-for="card in cards" :key="card" skeleton class="history-group-skeleton__card" />
      </LibraryBleedStrip>
    </section>
  </div>
</template>

<style scoped lang="scss">
.history-group-skeleton {
  display: flex;
  flex-direction: column;
  gap: var(--bew-space-6);
  min-width: 0;
}
.history-group-skeleton__row {
  display: grid;
  gap: var(--bew-space-3);
  min-width: 0;
}
.history-group-skeleton__heading {
  display: flex;
  align-items: center;
  min-height: var(--bew-control-item-height);
}
// The page sets the card width from its own column count; elsewhere a card
// keeps the smallest video-card width.
.history-group-skeleton__card {
  flex: none;
  width: var(--history-card-width, var(--bew-video-card-min-width));
}
</style>
