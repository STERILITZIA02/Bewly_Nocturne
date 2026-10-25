<script setup lang="ts">
defineProps<{ sidebarLabel: string }>()
</script>

<template>
  <div class="moments-content-layout">
    <div class="moments-content-layout__grid">
      <aside class="moments-content-layout__aside" :aria-label="sidebarLabel">
        <slot name="sidebar" />
      </aside>
      <div class="moments-content-layout__feed">
        <slot />
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use "../../../styles/breakpoints";
.moments-content-layout {
  min-width: 0;
  container-type: inline-size;
}
.moments-content-layout:has(.bew-empty--fill) {
  display: flex;
  flex: 1;
  .moments-content-layout__grid {
    flex: 1;
    align-items: stretch;
  }
  .moments-content-layout__feed {
    display: flex;
    flex-direction: column;
  }
  .moments-content-layout__aside {
    align-self: start;
  }
}
.moments-content-layout__grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) var(--bew-moments-hot-search-width);
  align-items: start;
  gap: var(--bew-space-6);
}
.moments-content-layout__feed {
  grid-column: 1;
  grid-row: 1;
  min-width: 0;
}
.moments-content-layout__aside {
  grid-column: 2;
  grid-row: 1;
  position: sticky;
  top: calc(var(--bew-top-bar-height) + var(--bew-space-4));
  // Hot search and the reading buttons below it share the viewport height:
  // the card's list shrinks so the buttons stay on screen.
  display: flex;
  flex-direction: column;
  max-height: calc(100dvh - var(--bew-top-bar-height) - var(--bew-space-4) - var(--bew-space-6));
  min-width: 0;
}
// A 360px feed, 240px hot-search card and their gap need more than 624px.
@container (max-width: #{breakpoints.$grid-sm}) {
  .moments-content-layout__grid {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--bew-space-4);
  }
  .moments-content-layout__aside {
    --bew-moments-hot-search-max-height: var(--bew-moments-hot-search-compact-max-height);
    position: static;
    max-height: none;
    grid-column: 1;
    grid-row: 1;
  }
  .moments-content-layout__feed {
    grid-column: 1;
    grid-row: 2;
  }
}
</style>
