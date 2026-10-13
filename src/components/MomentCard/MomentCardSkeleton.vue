<script setup lang="ts">
import SkeletonBlock from '~/components/SkeletonBlock.vue'

withDefaults(defineProps<{ media?: boolean }>(), { media: true })
</script>

<template>
  <article class="moment-card-skeleton" :class="{ 'moment-card-skeleton--media': media }" aria-hidden="true">
    <div class="moment-card-skeleton__header">
      <SkeletonBlock width="var(--bew-control-height)" height="var(--bew-control-height)" radius="circle" />
      <div class="moment-card-skeleton__identity">
        <SkeletonBlock width="40%" height="var(--bew-line-height-title)" />
        <SkeletonBlock width="26%" height="var(--bew-line-height-caption)" />
      </div>
      <SkeletonBlock width="var(--bew-icon-button-size-md)" height="var(--bew-icon-button-size-md)" radius="circle" />
    </div>
    <div class="moment-card-skeleton__main">
      <SkeletonBlock v-if="media" class="moment-card-skeleton__media" height="auto" radius="interactive" />
      <div class="moment-card-skeleton__body">
        <SkeletonBlock width="76%" height="var(--bew-line-height-title)" />
        <SkeletonBlock v-for="line in 3" :key="line" :width="line === 3 ? '64%' : '100%'" height="var(--bew-line-height-body)" />
      </div>
    </div>
    <div class="moment-card-skeleton__footer">
      <SkeletonBlock v-for="action in 3" :key="action" width="40%" height="var(--bew-line-height-control)" />
    </div>
  </article>
</template>

<style scoped lang="scss">
@use "../../styles/breakpoints";

.moment-card-skeleton {
  container-type: inline-size;
  box-sizing: border-box;
  overflow: hidden;
  border: 1px solid var(--bew-surface-border-color);
  border-radius: var(--bew-card-radius);
  corner-shape: var(--bew-corner-shape);
  background: var(--bew-elevated);
}
.moment-card-skeleton__header {
  display: flex;
  align-items: center;
  gap: var(--bew-space-3);
  padding: var(--bew-card-inset) var(--bew-card-inset) var(--bew-card-stack-gap);
}
.moment-card-skeleton__identity {
  display: grid;
  flex: 1;
  gap: var(--bew-space-1);
  min-width: 0;
}
.moment-card-skeleton__main {
  display: flex;
  flex-direction: column;
  gap: var(--bew-space-3);
  padding: 0 var(--bew-space-4) var(--bew-space-3);
}
.moment-card-skeleton__media {
  width: 100%;
  aspect-ratio: 16 / 9;
}
.moment-card-skeleton__body {
  display: grid;
  gap: 0;
  min-width: 0;
  > :first-child {
    margin-bottom: var(--bew-space-1);
  }
}
.moment-card-skeleton__footer {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  place-items: center;
  min-height: var(--bew-space-10);
  padding: 0 var(--bew-space-2);
  box-sizing: border-box;
  border-top: 1px solid color-mix(in oklab, var(--bew-border-color), transparent 64%);
}

@container (min-width: #{breakpoints.$moment-card-wide}) {
  .moment-card-skeleton--media .moment-card-skeleton__main {
    display: grid;
    grid-template-columns: minmax(0, 3fr) minmax(320px, 2fr);
    align-items: start;
  }
}
</style>
