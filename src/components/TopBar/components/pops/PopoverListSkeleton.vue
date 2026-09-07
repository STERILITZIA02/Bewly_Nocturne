<script setup lang="ts">
import SkeletonBlock from '~/components/SkeletonBlock.vue'

withDefaults(defineProps<{
  count?: number
  variant?: 'media' | 'history' | 'moments'
}>(), { count: 4, variant: 'media' })
</script>

<template>
  <div class="popover-list-skeleton" role="status" :aria-label="$t('common.loading')">
    <article v-for="index in count" :key="index" class="popover-card" aria-hidden="true">
      <div class="popover-card__content popover-list-skeleton__row">
        <SkeletonBlock v-if="variant === 'moments'" class="popover-list-skeleton__avatar" width="var(--bew-space-10)" height="var(--bew-space-10)" radius="circle" />
        <SkeletonBlock v-else class="popover-list-skeleton__media" height="auto" radius="half" />
        <div class="popover-card__copy">
          <SkeletonBlock v-if="variant === 'moments'" width="64%" height="var(--bew-line-height-body)" />
          <div class="popover-card__title popover-list-skeleton__title">
            <SkeletonBlock height="var(--bew-media-pop-title-line-height)" />
            <SkeletonBlock width="76%" height="var(--bew-media-pop-title-line-height)" />
          </div>
          <SkeletonBlock class="popover-card__meta" width="62%" height="var(--bew-line-height-caption)" />
          <SkeletonBlock v-if="variant === 'history'" class="popover-card__meta" width="88%" height="var(--bew-line-height-caption)" />
        </div>
        <SkeletonBlock v-if="variant === 'moments'" class="popover-list-skeleton__media" height="auto" radius="half" />
      </div>
    </article>
  </div>
</template>

<style scoped lang="scss">
@use "../../styles/popoverCards";

.popover-list-skeleton {
  display: grid;
  gap: var(--bew-space-1);
  width: 100%;
}
.popover-list-skeleton__row {
  display: flex;
  align-items: flex-start;
}
.popover-list-skeleton__media {
  flex: 0 0 var(--bew-popover-media-width);
  width: var(--bew-popover-media-width);
  aspect-ratio: var(--bew-popover-media-ratio, 16 / 9);
}
.popover-list-skeleton__avatar {
  margin-right: var(--bew-space-4);
}
.popover-list-skeleton__title {
  display: grid;
  gap: 0;
}
</style>
