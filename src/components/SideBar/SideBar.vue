<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { useMediaQuery, useMutationObserver } from '@vueuse/core'

import { useDark } from '~/composables/useDark'
import { useDelayedHover } from '~/composables/useDelayedHover'
import type { AppPage } from '~/enums/appEnums'
import { settings } from '~/logic'
import {
  completeLayoutEditMode,
  enterLayoutEditMode,
  isLayoutEditing,
  useLayoutEditableRoot,
  useLayoutEditSettingValue,
  vLayoutEditable,
} from '~/logic/layoutEdit'

import PageModeSwitcherButton from '../PageModeSwitcherButton.vue'
import Tooltip from '../Tooltip.vue'
import type { HoveringDockItem } from './types'

const props = defineProps<{
  activatedPage: AppPage
}>()
const emit = defineEmits<{
  (e: 'settingsVisibilityChange', origin: DOMRect): void
}>()
const { isDark, toggleDark } = useDark()
const sidebarPosition = useLayoutEditSettingValue('navigation.sidebar.position', () => settings.value.sidebarPosition)

const widescreenDocked = ref(document.body.classList.contains('bewly-widescreen-active'))
useMutationObserver(
  document.body,
  () => {
    widescreenDocked.value = document.body.classList.contains('bewly-widescreen-active')
  },
  { attributes: true, attributeFilter: ['class'] },
)

const tooltipPlacement = computed<'left' | 'right' | 'top'>(() => {
  if (widescreenDocked.value)
    return 'top'
  return sidebarPosition.value === 'left' ? 'right' : 'left'
})

const hideSidebar = ref<boolean>(false)
const coarsePointer = useMediaQuery('(pointer: coarse)')
const effectiveAutoHideSidebar = computed(() => settings.value.autoHideSidebar
  && !coarsePointer.value
  && !isLayoutEditing.value
  && !widescreenDocked.value)
const sideBarContentHover = ref<boolean>(false)
const sideBarContentRef = useDelayedHover({
  enterDelay: 100,
  leaveDelay: 600,
  enter: () => {
    if (isLayoutEditing.value)
      return
    sideBarContentHover.value = true
    toggleHideSidebar(false)
  },
  leave: () => {
    if (isLayoutEditing.value) {
      sideBarContentHover.value = false
      return
    }
    sideBarContentHover.value = false
    toggleHideSidebar(true)
  },
})
useLayoutEditableRoot('sidebar', sideBarContentRef)

const hoveringDockItem = reactive<HoveringDockItem>({
  themeMode: false,
  settings: false,
})

watch(effectiveAutoHideSidebar, (newValue) => {
  if (newValue)
    hideSidebar.value = true
  else
    hideSidebar.value = false
}, {
  immediate: true,
})

watch(isLayoutEditing, (editing) => {
  if (!editing)
    return
  sideBarContentHover.value = false
  hideSidebar.value = false
})

function toggleHideSidebar(hide: boolean) {
  if (effectiveAutoHideSidebar.value)
    hideSidebar.value = hide
  else
    hideSidebar.value = false
}

function openSettings(event: MouseEvent) {
  emit('settingsVisibilityChange', (event.currentTarget as HTMLElement).getBoundingClientRect())
}

function toggleLayoutEditMode() {
  if (isLayoutEditing.value)
    completeLayoutEditMode()
  else
    enterLayoutEditMode('sidebar', 'sidebar')
}
</script>

<template>
  <div
    v-layout-editable="'sidebar-auto-hide'"
    :class="{
      'left-side': sidebarPosition === 'left',
      'right-side': sidebarPosition === 'right',
      'hide': hideSidebar,
      'widescreen-docked': widescreenDocked,
    }"
    pos="fixed top-0" h-full flex items-center px-6px
    z-10 pointer-events-none
  >
    <!-- Edge Div -->
    <div
      v-if="effectiveAutoHideSidebar && hideSidebar"
      class="sidebar-edge"
      :class="`sidebar-edge-${sidebarPosition}`"
      pointer-events-auto
      @mouseenter="toggleHideSidebar(false)"
      @mouseleave="toggleHideSidebar(true)"
    />

    <div
      ref="sideBarContentRef"
      class="sidebar-content"
      data-layout-editable-id="sidebar"
      :class="{
        hover: sideBarContentHover,
      }"
      flex="~ gap-2 col justify-center items-center"
      pointer-events-auto
      duration-300
    >
      <PageModeSwitcherButton
        v-if="settings.showBewlyOrBiliPageSwitcher"
        :activated-page="props.activatedPage"
        :placement="tooltipPlacement"
        variant="sidebar"
      />
      <Tooltip :content="isDark ? $t('dock.dark_mode') : $t('dock.light_mode')" :placement="tooltipPlacement">
        <Button
          v-layout-editable="'sidebar-theme-toggle'"
          class="ctrl-btn bew-shape-circle"
          :aria-label="isDark ? $t('dock.dark_mode') : $t('dock.light_mode')"
          center size="small" round
          @click="toggleDark"
          @mouseenter="hoveringDockItem.themeMode = true"
          @mouseleave="hoveringDockItem.themeMode = false"
        >
          <Transition name="fade">
            <div v-show="hoveringDockItem.themeMode" absolute flex>
              <Icon v-if="isDark" icon="line-md:sunny-outline-to-moon-loop-transition" />
              <Icon v-else icon="line-md:moon-alt-to-sunny-outline-loop-transition" />
            </div>
          </Transition>
          <Transition name="fade">
            <div v-show="!hoveringDockItem.themeMode" absolute flex>
              <Icon v-if="isDark" icon="line-md:sunny-outline-to-moon-transition" />
              <Icon v-else icon="line-md:moon-to-sunny-outline-transition" />
            </div>
          </Transition>
        </Button>
      </Tooltip>
      <Tooltip :content="$t('dock.settings')" :placement="tooltipPlacement">
        <Button
          class="ctrl-btn group bew-shape-circle"
          :aria-label="$t('dock.settings')"
          center size="small" round
          @click="openSettings"
        >
          <div mt--2px>
            <i
              i-mingcute:settings-3-line w-20px h-20px group-hover:rotate-180
              transition="transform duration-400 ease-out"
            />
          </div>
        </Button>
      </Tooltip>
      <Tooltip
        v-if="settings.showLayoutEditButton || isLayoutEditing"
        :content="isLayoutEditing ? $t('layout_editor.done') : $t('layout_editor.edit_layout')"
        :placement="tooltipPlacement"
      >
        <Button
          class="ctrl-btn layout-edit-button bew-shape-circle"
          :class="{ active: isLayoutEditing }"
          data-layout-editor-control
          :aria-label="isLayoutEditing ? $t('layout_editor.done') : $t('layout_editor.edit_layout')"
          :aria-pressed="isLayoutEditing"
          center size="small" round
          @click="toggleLayoutEditMode"
        >
          <Icon :icon="isLayoutEditing ? 'mingcute:check-line' : 'mingcute:edit-3-line'" />
        </Button>
      </Tooltip>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.ctrl-btn {
  --b-button-width: var(--bew-floating-control-size);
  --b-button-height: var(--bew-floating-control-size);
  --b-button-border-width: 1px;
  --b-button-color: var(--bew-elevated);
  --b-button-color-hover: var(--bew-elevated-hover);
  --b-button-shadow: var(--bew-shadow-1);
  --b-button-shadow-hover: var(--bew-shadow-2);
  --b-button-shadow-active: var(--bew-shadow-1);

  backdrop-filter: var(--bew-filter-glass-1);

  svg {
    width: var(--bew-floating-control-icon-size);
    height: var(--bew-floating-control-icon-size);
    flex-shrink: 0;
  }

  &::after {
    // safety area
    --uno: "content-empty absolute w-[calc(100%+12px)] h-[calc(100%+12px)] left--6px right--6px z--1";
  }
}

.ctrl-btn.ctrl-btn {
  transition:
    color var(--bew-duration-moderate) var(--bew-ease-standard),
    background-color var(--bew-duration-moderate) var(--bew-ease-standard),
    border-color var(--bew-duration-moderate) var(--bew-ease-standard),
    box-shadow var(--bew-duration-moderate) var(--bew-ease-standard),
    opacity var(--bew-duration-moderate) var(--bew-ease-standard),
    transform var(--bew-duration-moderate) var(--bew-ease-emphasized);

  &:hover {
    transform: scale(1.1);
  }

  &:active {
    transform: scale(0.9);
  }
}

.layout-edit-button.active {
  color: var(--bew-on-theme-color);
  background: var(--bew-theme-color);
}

.left-side {
  --uno: "left-0";
}

.right-side {
  --uno: "right-0";
}

.sidebar-edge {
  --uno: "absolute top-0 w-14px h-full hover:w-60px duration-300";

  &-left {
    --uno: "left-0";
  }

  &-right {
    --uno: "right-0";
  }
}

.left-side .sidebar-content {
  --uno: "translate-x-[calc(-50%-6px)] opacity-60";
}

.left-side .sidebar-content.hover {
  --uno: "translate-x-0 opacity-100";
}

.hide.left-side .sidebar-content {
  --uno: "translate-x--100% opacity-0 pointer-events-none";
}

.right-side .sidebar-content {
  --uno: "translate-x-[calc(50%+6px)] opacity-60";
}

.right-side .sidebar-content.hover {
  --uno: "translate-x-0 opacity-100";
}

.hide.right-side .sidebar-content {
  --uno: "translate-x-100% opacity-0 pointer-events-none";
}

.widescreen-docked {
  top: auto !important;
  right: auto !important;
  bottom: var(--bewly-widescreen-aux-controls-bottom, var(--bew-space-2));
  left: var(--bewly-widescreen-aux-controls-left, var(--bew-space-8));
  width: auto;
  height: var(--bew-control-height);
  padding: 0;

  .sidebar-content {
    --bew-floating-control-size: var(--bew-control-height);
    --bew-floating-control-icon-size: var(--bew-icon-size-md);

    flex-direction: row;
    gap: var(--bew-space-2);
    opacity: 1;
    transform: none;
  }
}
</style>
