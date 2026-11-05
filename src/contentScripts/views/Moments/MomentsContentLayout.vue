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
// The content beside the rail is the page's 12 columns: the feed takes nine
// and hot search three, then 8 + 4 and 7 + 5 as the content narrows, so the
// card stays about 250px wide before it moves above the feed.
.moments-content-layout__grid {
  --moments-feed-columns: 9;
  --moments-aside-columns: 3;
  display: grid;
  grid-template-columns: repeat(var(--bew-grid-columns), minmax(0, 1fr));
  align-items: start;
  gap: var(--bew-grid-gutter);
}
@container (max-width: 1100px) {
  .moments-content-layout__grid {
    --moments-feed-columns: 8;
    --moments-aside-columns: 4;
  }
}
@container (max-width: 800px) {
  .moments-content-layout__grid {
    --moments-feed-columns: 7;
    --moments-aside-columns: 5;
  }
}
.moments-content-layout__feed {
  grid-column: 1 / span var(--moments-feed-columns);
  grid-row: 1;
  min-width: 0;
}
.moments-content-layout__aside {
  grid-column: span var(--moments-aside-columns) / -1;
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
