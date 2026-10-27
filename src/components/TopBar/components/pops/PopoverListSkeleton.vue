<script setup lang="ts">
import SkeletonBlock from '~/components/SkeletonBlock.vue'

withDefaults(defineProps<{
  count?: number
  variant?: 'media' | 'moments'
}>(), { count: 4, variant: 'media' })
</script>

<template>
  <div class="popover-list-skeleton" role="status" :aria-label="$t('common.loading')">
    <article v-for="index in count" :key="index" class="popover-card" aria-hidden="true">
      <div class="popover-card__content">
        <SkeletonBlock v-if="variant === 'moments'" class="popover-list-skeleton__avatar" width="var(--bew-space-10)" height="var(--bew-space-10)" radius="circle" />
        <SkeletonBlock v-else class="popover-list-skeleton__media" height="auto" radius="interactive" />
        <div class="popover-card__copy">
          <SkeletonBlock v-if="variant === 'moments'" class="popover-list-skeleton__author" width="40%" height="var(--bew-line-height-callout)" />
          <div class="popover-list-skeleton__title">
            <SkeletonBlock height="var(--bew-media-pop-title-line-height)" />
            <SkeletonBlock width="76%" height="var(--bew-media-pop-title-line-height)" />
          </div>
          <div class="popover-card__footer">
            <SkeletonBlock width="48%" height="var(--bew-line-height-caption)" />
          </div>
        </div>
        <SkeletonBlock v-if="variant === 'moments'" class="popover-list-skeleton__media" height="auto" radius="interactive" />
      </div>
    </article>
  </div>
</template>

<style scoped lang="scss">
@use "../../styles/popoverCards";

// Placeholder rows share the real rows' geometry and lines, without hover.
.popover-list-skeleton {
  display: flex;
  flex-direction: column;
  width: 100%;
  pointer-events: none;
}
.popover-list-skeleton__media {
  flex: 0 0 var(--bew-popover-media-width);
  width: var(--bew-popover-media-width);
  aspect-ratio: var(--bew-popover-media-ratio, 16 / 9);
}
.popover-list-skeleton__avatar {
  flex: 0 0 auto;
}
.popover-list-skeleton__author {
  margin-bottom: var(--bew-space-0-5);
}
.popover-list-skeleton__title {
  display: grid;
}
</style>
