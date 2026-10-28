<script setup lang="ts">
import { useId } from 'vue'

import { useSidebarRail } from '~/composables/useSidebarHost'
import { settings } from '~/logic'
import { useLayoutEditSettingValue } from '~/logic/layoutEdit'

defineProps<{ label: string }>()
const contentId = `library-content-${useId()}`
const sidebarHost = useSidebarRail()
const dockPosition = useLayoutEditSettingValue('navigation.dock.position', () => settings.value.dockPosition)
</script>

<template>
  <div class="library-workspace" :class="{ 'library-workspace--solid': settings.disableFrostedGlass, 'library-workspace--bottom-dock': dockPosition === 'bottom' }">
    <div v-if="sidebarHost" aria-hidden="true" />
    <Teleport :to="sidebarHost?.rail.value ?? 'body'" :disabled="!sidebarHost?.rail.value">
      <aside class="library-workspace__rail" :class="{ 'bew-sidebar-hosted': sidebarHost }" :aria-label="label">
        <div class="library-workspace__rail-scroll">
          <slot name="sidebar" :content-id="contentId" />
        </div>
      </aside>
    </Teleport>
    <div :id="contentId" class="library-workspace__content" role="tabpanel" :aria-label="label">
      <slot />
    </div>
  </div>
</template>

<style lang="scss">
@use "../styles/breakpoints";
@use "../styles/sidebarSurface";
@use "../styles/scrollEdgeFade";
@use "../styles/sidebarAction";
.library-workspace {
  display: grid;
  grid-template-columns: var(--bew-messages-sidebar-width) minmax(0, 1fr);
  min-height: 100dvh;
  align-items: start;
}

.library-workspace-login {
  box-sizing: border-box;
  min-height: 100dvh;
  padding-top: calc(var(--bew-top-bar-height) + var(--bew-space-4));
}

.library-workspace__rail {
  @include sidebarSurface.rail;
  --bew-sidebar-control: var(--bew-fill-1);
  --bew-sidebar-control-hover: var(--bew-fill-2);
  position: sticky;
  top: 0;
  display: flex;
  flex-direction: column;
  z-index: var(--bew-z-base-overlay);
  box-sizing: border-box;
  height: 100dvh;
  min-width: 0;
  padding: var(--bew-top-bar-height) var(--bew-sidebar-inline-padding) var(--bew-space-3);
  overflow: hidden;
  border-inline-end: var(--bew-hairline) solid var(--bew-edge-color);
}
.library-workspace__rail-scroll {
  @include sidebarSurface.vertical-scroll;
  // A rail never fades; its bottom is the screen edge, which needs no line.
  @include scrollEdgeFade.lines($bottom: false);
  flex: 1;
  min-height: 0;
  margin-inline: calc(-1 * var(--bew-sidebar-inline-padding));
  padding-inline: var(--bew-sidebar-inline-padding);
  scrollbar-width: thin;
}

.library-workspace--solid .library-workspace__rail:not(.bew-sidebar-hosted) {
  @include sidebarSurface.solid;
}

.library-workspace__content {
  // Read by content that bleeds to the window edges (the Moments up-list).
  --library-content-inline-padding: var(--bew-page-inline-inset);
  min-width: 0;
  padding: calc(var(--bew-top-bar-height) + var(--bew-space-4)) var(--library-content-inline-padding) var(--bew-space-6);
}

// Only empty/error views stretch; populated grids retain their existing layout.
.library-workspace__content:has(.bew-empty--fill) {
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  min-height: 100dvh;
  > main {
    display: flex;
    flex-direction: column;
    flex: 1;
  }
}

.library-workspace--bottom-dock .library-workspace__content {
  padding-bottom: calc(var(--bew-space-12) + var(--bew-space-8));
}

.library-rail-content {
  display: flex;
  flex-direction: column;
  gap: var(--bew-sidebar-section-gap);
  min-width: 0;
}
.library-rail-content > * {
  flex-shrink: 0;
  min-width: 0;
  max-width: 100%;
}
.library-rail-tools {
  display: grid;
  gap: var(--bew-space-2);
  min-width: 0;
}
// The search and the button row under it end with an edge-to-edge hairline
// (user-specified), like the rail's other separators.
.library-rail-tools--ruled {
  box-sizing: border-box;
  // Wider than the content box by its bleed (lifts the rail children's 100% cap).
  max-width: none;
  margin-inline: calc(-1 * var(--bew-sidebar-inline-padding));
  padding: 0 var(--bew-sidebar-inline-padding) var(--bew-space-3);
  border-bottom: var(--bew-hairline) solid var(--bew-separator-color);
}
.library-rail-content .b-button {
  border-radius: var(--bew-pill-radius);
  corner-shape: var(--bew-corner-shape-capsule);
}
.library-rail-actions {
  display: grid;
  gap: var(--bew-space-2);
  min-width: 0;
}
.library-rail-content .library-rail-segments {
  --bew-control-radius: var(--bew-pill-radius);
  --bew-control-item-radius: var(--bew-pill-radius);
  --bew-liquid-indicator-bg: var(--bew-segment-item-active-bg);
  --bew-liquid-indicator-shadow: var(--bew-segment-item-active-shadow);
  width: 100%;
  min-height: var(--bew-control-height);
  height: auto;
  flex-wrap: wrap;
  background: transparent;

  .bew-segment-control__item {
    flex: 1 0 auto;
    min-width: 0;
  }
}
.library-rail-content .bew-cover-sidebar__action:not(.b-button--type-primary) {
  background: var(--bew-fill-1);
  color: var(--bew-library-action-foreground, var(--bew-text-1));
  border: 0;
}
.library-rail-content .bew-cover-sidebar__action:not(.b-button--type-primary):hover:not(:disabled) {
  background: var(--bew-fill-2);
}
.library-rail-field {
  display: grid;
  gap: var(--bew-space-2);
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);
}
.library-rail-field input,
.library-rail-field select {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  height: var(--bew-control-height);
  padding: 0 var(--bew-space-3);
  border: 0;
  border-radius: var(--bew-pill-radius);
  corner-shape: var(--bew-corner-shape-capsule);
  color: var(--bew-text-1);
  background: var(--bew-fill-1);
  font: inherit;
  color-scheme: inherit;
}

@media (max-width: breakpoints.$mobile-max) {
  .library-workspace__content {
    --library-content-inline-padding: var(--bew-space-3);
  }
}
</style>
