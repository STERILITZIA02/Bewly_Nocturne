<script setup lang="ts">
import SkeletonBlock from '~/components/SkeletonBlock.vue'

withDefaults(defineProps<{ kind?: 'page' | 'video' | 'article' }>(), { kind: 'page' })
</script>

<template>
  <div class="loading-container" :class="`loading-container--${kind}`" role="status" :aria-label="$t('common.loading')" aria-busy="true">
    <div class="loading-container__heading" aria-hidden="true">
      <SkeletonBlock v-if="kind === 'article'" width="var(--bew-space-12)" height="var(--bew-space-12)" radius="circle" />
      <SkeletonBlock width="min(70%, 400px)" height="var(--bew-line-height-heading)" />
    </div>
    <div class="loading-container__body" aria-hidden="true">
      <SkeletonBlock v-if="kind !== 'page'" class="loading-container__media" height="auto" radius="media" />
      <div class="loading-container__copy">
        <SkeletonBlock v-for="index in 6" :key="index" :width="index % 3 === 0 ? '64%' : '100%'" height="var(--bew-line-height-body)" />
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.loading-container {
  display: grid;
  width: 100%;
  min-height: 240px;
  align-content: start;
  gap: var(--bew-space-6);
  padding: var(--bew-space-6);
  box-sizing: border-box;
}
.loading-container__heading {
  display: flex;
  gap: var(--bew-space-3);
  align-items: center;
}
.loading-container__body,
.loading-container__copy {
  display: grid;
  gap: var(--bew-space-4);
  min-width: 0;
}
.loading-container__media {
  aspect-ratio: 16 / 9;
}
.loading-container--video .loading-container__body {
  grid-template-columns: minmax(0, 3fr) minmax(0, 1fr);
  align-items: start;
}
.loading-container--article {
  max-width: var(--bew-layout-drawer-max-width);
  margin-inline: auto;
}
</style>
