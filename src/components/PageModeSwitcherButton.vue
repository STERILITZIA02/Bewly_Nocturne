<script setup lang="ts">
import { computed, ref, toRef } from 'vue'

import { usePageModeSwitcher } from '~/composables/usePageModeSwitcher'
import type { AppPage } from '~/enums/appEnums'
import { vLayoutEditable } from '~/logic/layoutEdit'
import type { PageMode } from '~/utils/pageMode'

import Tooltip from './Tooltip.vue'

type TooltipPlacement = 'left' | 'right' | 'top' | 'bottom' | 'bottom-left' | 'bottom-right'

const props = defineProps<{
  activatedPage: AppPage
  placement: TooltipPlacement
  variant: 'dock' | 'sidebar'
}>()

// Kept in this template-scanned file so UnoCSS emits every icon class.
const PAGE_MODE_ICONS: Readonly<Record<PageMode, string>> = {
  original: 'i-tabler:brand-bilibili',
  bewly: 'bew-mark-icon',
  custom: 'i-tabler:adjustments-horizontal',
}

const hovered = ref(false)
const focused = ref(false)
const {
  currentMode,
  disabled,
  previewMode,
  tooltip,
  cyclePageMode,
} = usePageModeSwitcher(toRef(props, 'activatedPage'))
const previewNextMode = computed(() => (hovered.value || focused.value) && !disabled.value)
const displayedIcon = computed(() => PAGE_MODE_ICONS[previewNextMode.value ? previewMode.value : currentMode.value])
const layoutEditableId = computed(() => `${props.variant}-page-mode-switcher`)
</script>

<template>
  <Tooltip :content="tooltip" :placement="placement">
    <button
      v-layout-editable="layoutEditableId"
      type="button"
      class="page-mode-switcher"
      :data-layout-editable-id="layoutEditableId"
      :class="`page-mode-switcher--${variant}`"
      :disabled="disabled"
      :aria-label="tooltip"
      @click="cyclePageMode"
      @mouseenter="hovered = true"
      @mouseleave="hovered = false"
      @focus="focused = true"
      @blur="focused = false"
    >
      <span class="page-mode-switcher__glyph">
        <Transition name="mode-glyph">
          <span :key="displayedIcon" :class="displayedIcon" aria-hidden="true" />
        </Transition>
      </span>
    </button>
  </Tooltip>
</template>

<style lang="scss" scoped>
@use "../styles/breakpoints";

.page-mode-switcher__glyph {
  position: relative;
  display: grid;
  place-items: center;
  width: var(--page-mode-icon-size);
  height: var(--page-mode-icon-size);
  > span {
    grid-area: 1 / 1;
    display: block;
    width: 100%;
    height: 100%;
  }
}
.mode-glyph-enter-active,
.mode-glyph-leave-active {
  transition: opacity var(--bew-duration-fast) var(--bew-ease-standard);
}
.mode-glyph-enter-from,
.mode-glyph-leave-to {
  opacity: 0;
}
.mode-glyph-leave-active {
  pointer-events: none;
}
@media (prefers-reduced-motion: reduce) {
  .mode-glyph-enter-active,
  .mode-glyph-leave-active {
    transition: none;
  }
}

.page-mode-switcher {
  position: relative;
  box-sizing: border-box;
  display: grid;
  flex: none;
  place-items: center;
  aspect-ratio: 1;
  padding: 0;
  border-radius: var(--bew-radius-full);
  corner-shape: var(--bew-corner-shape-round);
  appearance: none;
  color: var(--bew-text-1);
  cursor: pointer;
  transition:
    color var(--bew-duration-moderate) var(--bew-ease-standard),
    background-color var(--bew-duration-moderate) var(--bew-ease-standard),
    border-color var(--bew-duration-moderate) var(--bew-ease-standard),
    box-shadow var(--bew-duration-moderate) var(--bew-ease-standard),
    opacity var(--bew-duration-moderate) var(--bew-ease-standard),
    transform var(--bew-duration-moderate) var(--bew-ease-emphasized);

  &:hover:not(:disabled) {
    transform: scale(1.1);
  }

  &:active:not(:disabled) {
    transform: scale(0.9);
  }

  &:focus-visible {
    outline: var(--bew-focus-ring, 1px solid CanvasText);
    outline-offset: var(--bew-space-0-5);
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.45;
    transform: none;
  }

  &--dock {
    // Matches the Dock navigation glyphs at every breakpoint.
    --page-mode-icon-size: var(--bew-icon-size-md);
    width: var(--bew-dock-control-size);
    height: var(--bew-dock-control-size);
    border: 0;
    background: transparent;
    box-shadow: none;

    &:hover:not(:disabled) {
      background: transparent;
      box-shadow: none;
    }
  }

  &--sidebar {
    --page-mode-icon-size: var(--bew-floating-control-icon-size);
    width: var(--bew-floating-control-size);
    height: var(--bew-floating-control-size);
    border: 1px solid var(--bew-glass-border-color);
    background: var(--bew-glass-tint);
    box-shadow: var(--bew-shadow-1);
    backdrop-filter: var(--bew-filter-glass-1);

    &:hover:not(:disabled) {
      background: var(--bew-glass-tint-hover);
      box-shadow: var(--bew-shadow-2);
    }
  }

  &:disabled,
  &:disabled:hover {
    box-shadow: var(--bew-shadow-1);
  }
}

:global(.dark) .page-mode-switcher--dock:hover:not(:disabled) {
  background: transparent;
  box-shadow: none;
}

.page-mode-switcher--dock:disabled,
.page-mode-switcher--dock:disabled:hover {
  box-shadow: none;
}

@media (min-width: breakpoints.$grid-lg) {
  .page-mode-switcher--dock {
    width: var(--bew-dock-control-size-lg);
    height: var(--bew-dock-control-size-lg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .page-mode-switcher {
    transition: none;
  }
}
</style>
