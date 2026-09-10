<script setup lang="ts">
import { computed, ref } from 'vue'

import { settings } from '~/logic'

const props = defineProps<{ cover?: string }>()
const failedCover = ref('')
const showCover = computed(() => settings.value.enableSidebarCoverBlur !== false && Boolean(props.cover) && props.cover !== failedCover.value)
function markCoverFailed(event: Event) {
  const source = event.currentTarget instanceof HTMLElement ? event.currentTarget.getAttribute('src') : null
  if (source && source === props.cover)
    failedCover.value = source
}
</script>

<template>
  <div class="bew-cover-sidebar" :data-cover-background="showCover">
    <div v-if="showCover" class="bew-cover-sidebar__background" aria-hidden="true">
      <img :key="cover" :src="cover" alt="" decoding="async" @error="markCoverFailed">
    </div>
    <slot />
  </div>
</template>

<style scoped lang="scss">
.bew-cover-sidebar {
  isolation: isolate;
  overflow: hidden;
  color: var(--bew-sidebar-text);
  background: var(--bew-content-solid);
  border-radius: var(--bew-panel-radius);
  corner-shape: var(--bew-corner-shape);
  scrollbar-color: var(--bew-sidebar-scrollbar) transparent;
}
.bew-cover-sidebar__background {
  position: absolute;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  border-radius: inherit;
  corner-shape: inherit;
  overflow: hidden;

  &::after {
    position: absolute;
    inset: 0;
    content: "";
    background: var(--bew-fill-4);
  }

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    filter: blur(var(--bew-sidebar-cover-blur));
    transform: scale(1.12);
  }
}
.bew-cover-sidebar :deep(.bew-cover-sidebar__action) {
  flex-shrink: 0;
  color: var(--bew-sidebar-text);
  background: var(--bew-sidebar-control);
  border-color: var(--bew-sidebar-border);
  text-shadow: var(--bew-sidebar-text-shadow);

  &:hover:not(:disabled) {
    background: var(--bew-sidebar-control-hover);
  }
}
</style>
