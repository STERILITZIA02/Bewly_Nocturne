<script setup lang="ts">
import SkeletonBlock from '~/components/SkeletonBlock.vue'
</script>

<template>
  <article class="user-card-skeleton bew-surface-border" aria-hidden="true">
    <SkeletonBlock width="96px" height="96px" radius="circle" />
    <div class="user-card-skeleton__content">
      <SkeletonBlock width="42%" height="var(--bew-line-height-body)" />
      <SkeletonBlock width="82%" height="var(--bew-line-height-control)" />
      <div class="user-card-skeleton__stats">
        <SkeletonBlock width="68px" height="var(--bew-line-height-caption)" />
        <SkeletonBlock width="76px" height="var(--bew-line-height-caption)" />
      </div>
      <SkeletonBlock width="80px" height="var(--bew-control-item-height)" radius="interactive" />
    </div>
  </article>
</template>

<style scoped lang="scss">
.user-card-skeleton {
  display: flex;
  box-sizing: border-box;
  align-items: center;
  gap: var(--bew-space-5);
  min-width: 0;
  min-height: 122px;
  padding: var(--bew-space-3);
  border-radius: var(--bew-interactive-radius);
  corner-shape: var(--bew-corner-shape);
  background: var(--bew-elevated);
}

.user-card-skeleton__content {
  display: flex;
  min-width: 0;
  flex: 1 1 auto;
  flex-direction: column;
  gap: var(--bew-space-2);
}

.user-card-skeleton__stats {
  display: flex;
  align-items: center;
  gap: var(--bew-space-3);
}
</style>
