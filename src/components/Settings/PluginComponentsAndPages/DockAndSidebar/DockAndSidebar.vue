<script lang="ts" setup>
import { useI18n } from 'vue-i18n'
import draggable from 'vuedraggable'

import Button from '~/components/Button.vue'
import Radio from '~/components/Radio.vue'
import Select from '~/components/Select.vue'
import Slider from '~/components/Slider.vue'
import type { DockCollapseMode } from '~/constants/dock'
import { LIQUID_GLASS_MODES, LIQUID_GLASS_PARAMETERS, LIQUID_GLASS_TINT_SOURCES } from '~/constants/liquidGlass'
import { settings } from '~/logic'
import type { DockItem } from '~/stores/mainStore'
import { useMainStore } from '~/stores/mainStore'
import { useSettingsStore } from '~/stores/settingsStore'

import SettingsItem from '../../components/SettingsItem.vue'
import SettingsItemGroup from '../../components/SettingsItemGroup.vue'

const { t } = useI18n()
const mainStore = useMainStore()
const settingsStore = useSettingsStore()
const liquidGlassModes = computed(() => LIQUID_GLASS_MODES.map(value => ({ label: t(`settings.dock_glass_mode_${value}`), value })))
const liquidGlassTintSources = computed(() => LIQUID_GLASS_TINT_SOURCES.map(value => ({ label: t(`settings.dock_glass_tint_${value}`), value })))
const liquidGlassSliders = [
  { key: 'dockLiquidGlassRefraction', title: 'settings.dock_glass_refraction', unit: '', ...LIQUID_GLASS_PARAMETERS.refraction },
  { key: 'dockLiquidGlassBlur', title: 'settings.dock_glass_blur', unit: 'px', ...LIQUID_GLASS_PARAMETERS.blur },
  { key: 'dockLiquidGlassTintOpacity', title: 'settings.dock_glass_tint_opacity', unit: '%', ...LIQUID_GLASS_PARAMETERS.tintOpacity },
  { key: 'dockLiquidGlassDispersion', title: 'settings.dock_glass_dispersion', unit: '', ...LIQUID_GLASS_PARAMETERS.dispersion },
  { key: 'dockLiquidGlassSaturation', title: 'settings.dock_glass_saturation', unit: '%', ...LIQUID_GLASS_PARAMETERS.saturation },
] as const

const dockPositions = computed(() => {
  return [
    {
      label: t('common.position.left'),
      value: 'left',
    },
    {
      label: t('common.position.right'),
      value: 'right',
    },
    {
      label: t('common.position.bottom'),
      value: 'bottom',
    },
  ]
})

const dockCollapseModeOptions = computed((): { label: string, value: DockCollapseMode }[] => {
  return [
    {
      label: t('settings.dock_collapse_mode_button'),
      value: 'button',
    },
    {
      label: t('settings.dock_collapse_mode_hidden'),
      value: 'hidden',
    },
    {
      label: t('settings.dock_collapse_mode_automatic'),
      value: 'automatic',
    },
  ]
})

const pageOptions = computed((): { label: string, icon: string, value: string }[] => {
  return mainStore.dockItems.map((e: any) => {
    return {
      label: t(e.i18nKey),
      icon: e.icon,
      value: e.page,
    }
  })
})

const topBarModeOptions = computed(() => [
  {
    label: t('settings.topbar_mode_bewly'),
    value: false,
  },
  {
    label: t('settings.topbar_mode_bilibili'),
    value: true,
  },
])

const topBarMode = computed({
  get: () => settingsStore.getUseOriginalBilibiliTopBar(),
  set: (useOriginalBilibiliTopBar: boolean) => {
    if (settings.value.pageMode === 'custom')
      settingsStore.setCustomUseOriginalBilibiliTopBar(useOriginalBilibiliTopBar)
  },
})

const topBarModeDisabled = computed(() => settings.value.pageMode !== 'custom')

const sidebarPositions = computed(() => {
  return [
    {
      label: t('common.position.left'),
      value: 'left',
    },
    {
      label: t('common.position.right'),
      value: 'right',
    },
  ]
})

function resetDockContent() {
  settingsStore.resetDockItemsConfig()
}

function handleToggleDockItem(dockItem: any) {
  // Prevent disabling all dock items if there is only one
  if (settings.value.dockItemsConfig.filter(dockItem => dockItem.visible === true).length > 1)
    dockItem.visible = !dockItem.visible
  else
    dockItem.visible = true
}

function updateDockItemPageMode(dockItem: DockItem, useOriginalBiliPage: boolean) {
  settingsStore.setDockItemCustomUseOriginalBiliPage(dockItem.page, useOriginalBiliPage)
}
</script>

<template>
  <div>
    <SettingsItemGroup data-setting-id="navigation.pageMode" :title="$t('settings.group_dock')">
      <SettingsItem :title="$t('settings.always_use_dock')" :desc="$t('settings.always_use_dock_desc')" right-width="auto">
        <Radio v-model="settings.alwaysUseDock" />
      </SettingsItem>
      <SettingsItem
        setting-id="navigation.dock.collapseMode"
        :title="$t('settings.dock_collapse_mode')"
        :desc="$t('settings.dock_collapse_mode_desc')"
        right-width="auto"
      >
        <Select
          v-model="settings.dockCollapseMode"
          :options="dockCollapseModeOptions"
          w="160px"
        />
      </SettingsItem>
      <SettingsItem setting-id="navigation.dock.position" :title="$t('settings.dock_position')" :desc="$t('settings.dock_position_desc')" right-width="auto">
        <Select
          v-model="settings.dockPosition"
          :options="dockPositions"
          w="160px"
        />
      </SettingsItem>
      <SettingsItem
        setting-id="navigation.dock.items"
        :title="$t('settings.dock_content_adjustment')"
        :desc="$t('settings.dock_content_adjustment_desc')"
      >
        <template #title>
          <div flex="~ gap-4 items-center">
            {{ $t('settings.dock_content_adjustment') }}
            <Button size="small" type="secondary" @click="resetDockContent">
              <template #left>
                <div i-mingcute:back-line />
              </template>
              {{ $t('common.operation.reset') }}
            </Button>
          </div>
        </template>

        <template #bottom>
          <div
            class="bew-settings-option--lift"
            data-setting-id="navigation.topBar.mode"
            flex="~ gap-2 justify-between items-center wrap" p="x-4 y-2" bg="$bew-fill-1" rounded="$bew-radius"
            mb-2
          >
            <div flex="~ gap-2 items-center">
              <div i-mingcute:layout-top-line />
              <div w-80px text-ellipsis>
                {{ $t('settings.topbar_mode') }}
              </div>
            </div>
            <Select
              v-model="topBarMode"
              :options="topBarModeOptions"
              :disabled="topBarModeDisabled"
              w="160px"
            />
            <div v-if="topBarModeDisabled" w-full text="sm $bew-text-2">
              {{ $t('settings.custom_page_mode_required') }}
            </div>
          </div>

          <draggable
            v-model="settings.dockItemsConfig"
            data-setting-id="navigation.dock.items"
            item-key="page"
            :component-data="{ style: 'display: flex; gap: 0.5rem; flex-wrap: wrap; flex-direction: column;' }"
          >
            <template #item="{ element }">
              <div
                class="bew-settings-option--lift"
                flex="~ gap-2 justify-between items-center wrap" p="x-4 y-2" bg="$bew-fill-1" rounded="$bew-radius" cursor-all-scroll
                duration-300
                :style="{
                  background: element.visible ? 'var(--bew-theme-color-20)' : 'var(--bew-fill-1)',
                  color: element.visible ? 'var(--bew-theme-color)' : 'var(--bew-text-1)',
                }"
                @click="handleToggleDockItem(element)"
              >
                <div flex="~ gap-2 items-center">
                  <div :class="pageOptions.find((page:any) => (page.value === element.page))?.icon as string" />
                  <div w-80px text-ellipsis>
                    {{ pageOptions.find(option => option.value === element.page)?.label }}
                  </div>
                </div>
                <div flex="~ gap-4 items-center justify-between wrap" @click.stop>
                  <div
                    flex="~ items-center"
                  >
                    {{ $t('settings.dock_item_use_original_bili_web_page') }}
                    <Radio
                      :model-value="element.useOriginalBiliPage"
                      :disabled="settings.pageMode !== 'custom'"
                      @update:model-value="updateDockItemPageMode(element, $event as boolean)"
                    />
                  </div>
                  <div flex="~ items-center">
                    {{ $t('settings.dock_item_open_in_new_tab') }}
                    <Radio v-model="element.openInNewTab" />
                  </div>
                </div>
              </div>
            </template>
          </draggable>
        </template>
      </SettingsItem>
      <SettingsItem :title="$t('settings.disable_dock_glowing_effect')" right-width="auto">
        <Radio v-model="settings.disableDockGlowingEffect" />
      </SettingsItem>
      <SettingsItem
        :title="$t('settings.show_bewly_or_bili_page_switcher')"
        :desc="$t('settings.show_bewly_or_bili_page_switcher_desc')"
        right-width="auto"
      >
        <Radio v-model="settings.showBewlyOrBiliPageSwitcher" />
      </SettingsItem>
      <SettingsItem setting-id="navigation.dock.themeSwitcher" :title="$t('settings.disable_light_dark_mode_switcher')" right-width="auto">
        <Radio v-model="settings.disableLightDarkModeSwitcherOnDock" />
      </SettingsItem>
      <SettingsItem setting-id="navigation.dock.actionButtons" :title="$t('settings.back_to_top_and_refresh_buttons_are_separated')" right-width="auto">
        <Radio v-model="settings.backToTopAndRefreshButtonsAreSeparated" />
      </SettingsItem>
      <SettingsItem setting-id="navigation.dock.undoRefresh" :title="$t('settings.enable_undo_refresh_button')" :desc="$t('settings.enable_undo_refresh_button_desc')" right-width="auto">
        <Radio v-model="settings.enableUndoRefreshButton" />
      </SettingsItem>
    </SettingsItemGroup>

    <SettingsItemGroup :title="$t('settings.group_dock_glass')">
      <SettingsItem
        setting-id="navigation.dock.liquidGlass"
        :title="$t('settings.dock_liquid_glass')"
        :desc="$t('settings.dock_liquid_glass_desc')"
        right-width="auto"
      >
        <Radio v-model="settings.enableDockLiquidGlass" />
      </SettingsItem>
      <template v-if="settings.enableDockLiquidGlass">
        <p v-if="settings.disableFrostedGlass" class="dock-glass-paused">
          {{ $t('settings.dock_liquid_glass_paused') }}
        </p>
        <SettingsItem setting-id="navigation.dock.glassMode" :title="$t('settings.dock_glass_mode')" right-width="auto">
          <Select v-model="settings.dockLiquidGlassMode" :options="liquidGlassModes" w="160px" />
        </SettingsItem>
        <SettingsItem setting-id="navigation.dock.glassTint" :title="$t('settings.dock_glass_tint')" right-width="auto">
          <div class="dock-glass-tint-controls">
            <Select v-model="settings.dockLiquidGlassTintSource" :options="liquidGlassTintSources" w="160px" />
            <input
              v-if="settings.dockLiquidGlassTintSource === 'custom'"
              v-model="settings.dockLiquidGlassTintColor"
              type="color"
              class="dock-glass-color"
              :aria-label="$t('settings.dock_glass_tint_color')"
            >
          </div>
        </SettingsItem>
        <SettingsItem
          v-for="slider in liquidGlassSliders"
          :key="slider.key"
          :setting-id="`navigation.dock.${slider.key}`"
          :title="$t(slider.title)"
          :desc="slider.key === 'dockLiquidGlassBlur' ? $t('settings.dock_glass_blur_desc') : slider.key === 'dockLiquidGlassTintOpacity' ? $t('settings.dock_glass_tint_opacity_desc') : undefined"
        >
          <template #bottom>
            <Slider
              v-model="settings[slider.key]"
              :min="slider.min"
              :max="slider.max"
              :step="slider.step"
              :label="`${settings[slider.key]}${slider.unit}`"
            />
          </template>
        </SettingsItem>
      </template>
    </SettingsItemGroup>

    <SettingsItemGroup :title="$t('settings.group_sidebar')" :desc="$t('settings.group_sidebar_desc')">
      <SettingsItem setting-id="navigation.sidebar.position" :title="$t('settings.sidebar_position')" right-width="auto">
        <Select v-model="settings.sidebarPosition" :options="sidebarPositions" w="160px" />
      </SettingsItem>
      <SettingsItem setting-id="navigation.sidebar.autoHide" :title="$t('settings.auto_hide_sidebar')" right-width="auto">
        <Radio v-model="settings.autoHideSidebar" />
      </SettingsItem>
    </SettingsItemGroup>
  </div>
</template>

<style lang="scss" scoped>
.dock-glass-paused {
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);
}

.dock-glass-tint-controls {
  display: flex;
  align-items: center;
  gap: var(--bew-space-2);
}

.dock-glass-color {
  width: var(--bew-control-height);
  height: var(--bew-control-height);
  padding: var(--bew-space-1);
  border: 1px solid var(--bew-surface-border-color);
  border-radius: var(--bew-interactive-radius);
  background: var(--bew-elevated-solid);
  color-scheme: inherit;
  cursor: pointer;
}
</style>
