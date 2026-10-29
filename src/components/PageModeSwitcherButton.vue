<script setup lang="ts">
import { computed, toRef } from 'vue'

import { usePageModeSwitcher } from '~/composables/usePageModeSwitcher'
import type { AppPage } from '~/enums/appEnums'
import { vLayoutEditable } from '~/logic/layoutEdit'
import type { PageMode } from '~/utils/pageMode'

import Tooltip from './Tooltip.vue'

type TooltipPlacement = 'left' | 'right' | 'top' | 'bottom' | 'bottom-left' | 'bottom-right'

const props = defineProps<{
  activatedPage: AppPage
  /** Sidebar only: the Dock names the control under its glyph instead. */
  placement?: TooltipPlacement
  /** Dock only: the name under the glyph (absent when the Dock hides names). */
  label?: string
  variant: 'dock' | 'sidebar'
}>()

// Kept in this template-scanned file so UnoCSS emits every icon class.
const PAGE_MODE_ICONS: Readonly<Record<PageMode, string>> = {
  original: 'i-tabler:brand-bilibili',
  bewly: 'bew-mark-icon',
  custom: 'i-tabler:adjustments-horizontal',
}

const {
  currentMode,
  disabled,
  tooltip,
  cyclePageMode,
} = usePageModeSwitcher(toRef(props, 'activatedPage'))
const displayedIcon = computed(() => PAGE_MODE_ICONS[currentMode.value])
const layoutEditableId = computed(() => `${props.variant}-page-mode-switcher`)
</script>

<template>
  <component :is="variant === 'sidebar' ? Tooltip : 'div'" v-bind="variant === 'sidebar' ? { content: tooltip, placement } : {}">
    <button
      v-layout-editable="layoutEditableId"
      type="button"
      class="page-mode-switcher"
      :data-layout-editable-id="layoutEditableId"
      :class="`page-mode-switcher--${variant}`"
      :disabled="disabled"
      :aria-label="tooltip"
      @click="cyclePageMode"
    >
      <span class="page-mode-switcher__glyph">
        <Transition name="mode-glyph">
          <span :key="displayedIcon" :class="displayedIcon" aria-hidden="true" />
        </Transition>
      </span>
      <span v-if="label" class="page-mode-switcher__label" aria-hidden="true">{{ label }}</span>
    </button>
  </component>
</template>

<style lang="scss" scoped>
@use "../styles/breakpoints";
@use "../styles/dockTab";

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
  border-radius: var(--bew-pill-radius);
  corner-shape: var(--bew-corner-shape-capsule);
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

  &--sidebar {
    --page-mode-icon-size: var(--bew-floating-control-icon-size);
    width: var(--bew-floating-control-size);
    height: var(--bew-floating-control-size);
    border: var(--bew-glass-edge-width) solid var(--bew-glass-edge-color);
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

// The Dock draws it as one of its tabs: glyph over name, glyph-only hover.
.page-mode-switcher.page-mode-switcher--dock {
  @include dockTab.item(".page-mode-switcher__glyph");
  aspect-ratio: auto;

  &:hover:not(:disabled),
  &:active:not(:disabled) {
    transform: none;
  }

  &:disabled,
  &:disabled:hover {
    box-shadow: none;
  }
}

.page-mode-switcher__label {
  @include dockTab.label;
}

@media (prefers-reduced-motion: reduce) {
  .page-mode-switcher {
    transition: none;
  }
}
</style>
