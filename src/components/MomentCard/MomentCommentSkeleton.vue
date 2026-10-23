<script setup lang="ts">
import SkeletonBlock from '~/components/SkeletonBlock.vue'

// Mirrors `.moment-comments__item`: avatar column, caption meta row, body copy
// and the caption action row. Rows are separated like threads.
withDefaults(defineProps<{ count?: number }>(), { count: 3 })
</script>

<template>
  <div class="moment-comment-skeleton" aria-hidden="true">
    <div v-for="row in count" :key="row" class="moment-comment-skeleton__row" data-bew-skeleton-group>
      <SkeletonBlock width="var(--bew-comment-avatar-size)" height="var(--bew-comment-avatar-size)" radius="circle" />
      <div class="moment-comment-skeleton__body">
        <div class="moment-comment-skeleton__meta">
          <SkeletonBlock width="28%" height="var(--bew-line-height-caption)" />
          <SkeletonBlock width="16%" height="var(--bew-line-height-caption)" />
        </div>
        <SkeletonBlock height="var(--bew-line-height-body)" />
        <SkeletonBlock :width="row % 2 ? '64%' : '42%'" height="var(--bew-line-height-body)" />
        <div class="moment-comment-skeleton__actions">
          <SkeletonBlock v-for="action in 2" :key="action" width="calc(var(--bew-space-12) - var(--bew-space-2))" height="var(--bew-line-height-caption)" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.moment-comment-skeleton {
  display: flex;
  flex-direction: column;
  gap: var(--bew-space-3);
}

.moment-comment-skeleton__row {
  display: grid;
  grid-template-columns: var(--bew-comment-avatar-size) minmax(0, 1fr);
  gap: var(--bew-space-2);

  + .moment-comment-skeleton__row {
    padding-top: var(--bew-space-3);
  }
}

.moment-comment-skeleton__body {
  display: grid;
  gap: var(--bew-space-1);
  min-width: 0;
}

.moment-comment-skeleton__meta,
.moment-comment-skeleton__actions {
  display: flex;
  align-items: center;
  gap: var(--bew-space-3);
}

.moment-comment-skeleton__meta {
  gap: var(--bew-space-2);
}

// `.moment-comments__action` keeps a 24px hit row under the copy.
.moment-comment-skeleton__actions {
  min-height: var(--bew-space-6);
}
</style>
