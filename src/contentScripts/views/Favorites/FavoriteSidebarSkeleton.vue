<template>
  <ul class="favorite-sidebar-skeleton" aria-hidden="true">
    <li v-for="index in 5" :key="index">
      <SkeletonBlock width="var(--bew-space-12)" height="var(--bew-space-12)" radius="interactive" />
      <SkeletonBlock :width="index % 2 ? '72%' : '56%'" height="var(--bew-line-height-control)" />
      <SkeletonBlock width="var(--bew-space-6)" height="var(--bew-line-height-caption)" />
    </li>
  </ul>
</template>

<style scoped lang="scss">
.favorite-sidebar-skeleton {
  display: grid;
  gap: var(--bew-space-1);
  margin: 0;
  padding: 0;
  list-style: none;
  li {
    display: grid;
    grid-template-columns: var(--bew-space-12) minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--bew-space-2);
    padding: var(--bew-space-2);
  }
}
</style>
