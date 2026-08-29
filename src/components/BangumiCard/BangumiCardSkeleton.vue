<script setup lang="ts">
import SkeletonBlock from '~/components/SkeletonBlock.vue'

defineProps<{
  horizontal?: boolean
}>()
</script>

<template>
  <article class="bangumi-card-skeleton" :class="{ 'bangumi-card-skeleton--horizontal': horizontal }" aria-hidden="true">
    <SkeletonBlock class="bangumi-card-skeleton__media" height="auto" radius="media" />
    <div class="bangumi-card-skeleton__content">
      <SkeletonBlock height="var(--bew-space-5)" />
      <div class="bangumi-card-skeleton__meta">
        <SkeletonBlock width="52px" height="24px" radius="interactive" />
        <SkeletonBlock width="60%" height="22px" />
      </div>
    </div>
  </article>
</template>

<style scoped lang="scss">
.bangumi-card-skeleton {
  display: block;
  min-width: 0;
  margin-bottom: var(--bew-space-6);
}

.bangumi-card-skeleton--horizontal {
  display: flex;
  gap: var(--bew-space-4);
}

.bangumi-card-skeleton__media {
  width: 100% !important;
  aspect-ratio: 12 / 16;
  margin-bottom: var(--bew-space-4);
}

.bangumi-card-skeleton--horizontal .bangumi-card-skeleton__media {
  width: 170px !important;
  flex: 0 0 170px;
}

.bangumi-card-skeleton__content {
  display: grid;
  width: 100%;
  gap: var(--bew-space-3);
}

.bangumi-card-skeleton__meta {
  display: flex;
  align-items: center;
  gap: var(--bew-space-2);
  margin-bottom: var(--bew-space-10);
}
</style>
