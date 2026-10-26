<script setup lang="ts">
import SkeletonBlock from '~/components/SkeletonBlock.vue'

/**
 * A library hero row while it loads, in the shape of `LibraryHeroCarousel`:
 * the current card about 85% of the content wide and the next one peeking out
 * to the window edge (`single`: one card across the content).
 */
defineProps<{ single?: boolean }>()
</script>

<template>
  <div class="library-hero-skeleton" :class="{ 'library-hero-skeleton--single': single }" aria-hidden="true">
    <div class="library-hero-skeleton__row">
      <SkeletonBlock class="library-hero-skeleton__card" height="100%" radius="media" />
      <SkeletonBlock v-if="!single" class="library-hero-skeleton__next" height="100%" radius="media" />
    </div>
  </div>
</template>

<style scoped lang="scss">
.library-hero-skeleton {
  height: var(--bew-library-hero-height);
  margin-bottom: var(--library-hero-margin, var(--bew-space-6));
  min-width: 0;
  container-type: inline-size;
}
.library-hero-skeleton__row {
  display: flex;
  gap: var(--bew-space-4);
  height: 100%;
  margin-inline-end: calc(-1 * var(--library-content-inline-padding, 0px));
  overflow: hidden;
}
.library-hero-skeleton__card {
  flex: 0 0 85cqi;
}
.library-hero-skeleton--single .library-hero-skeleton__card {
  flex-basis: 100cqi;
}
.library-hero-skeleton__next {
  flex: 1 0 0;
}
</style>
