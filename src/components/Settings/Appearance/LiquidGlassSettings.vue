<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import Radio from '~/components/Radio.vue'
import Select from '~/components/Select.vue'
import Slider from '~/components/Slider.vue'
import { LIQUID_GLASS_MODES, LIQUID_GLASS_PARAMETERS, LIQUID_GLASS_TINT_SOURCES } from '~/constants/liquidGlass'
import { settings } from '~/logic'

import SettingsItem from '../components/SettingsItem.vue'
import SettingsItemGroup from '../components/SettingsItemGroup.vue'

const { t } = useI18n()
const modes = computed(() => LIQUID_GLASS_MODES.map(value => ({ label: t(`settings.liquid_glass_mode_${value}`), value })))
const tintSources = computed(() => LIQUID_GLASS_TINT_SOURCES.map(value => ({ label: t(`settings.liquid_glass_tint_${value}`), value })))
const sliders = [
  { key: 'dockLiquidGlassRefraction', title: 'settings.liquid_glass_refraction', unit: '', ...LIQUID_GLASS_PARAMETERS.refraction },
  { key: 'dockLiquidGlassBlur', title: 'settings.liquid_glass_blur', unit: 'px', ...LIQUID_GLASS_PARAMETERS.blur },
  { key: 'dockLiquidGlassTintOpacity', title: 'settings.liquid_glass_tint_opacity', unit: '%', ...LIQUID_GLASS_PARAMETERS.tintOpacity },
  { key: 'dockLiquidGlassDispersion', title: 'settings.liquid_glass_dispersion', unit: '', ...LIQUID_GLASS_PARAMETERS.dispersion },
  { key: 'dockLiquidGlassSaturation', title: 'settings.liquid_glass_saturation', unit: '%', ...LIQUID_GLASS_PARAMETERS.saturation },
] as const
</script>

<template>
  <SettingsItemGroup :title="$t('settings.group_liquid_glass')">
    <SettingsItem setting-id="appearance.liquidGlass" :title="$t('settings.liquid_glass')" :desc="$t('settings.liquid_glass_desc')" right-width="auto">
      <Radio v-model="settings.enableDockLiquidGlass" />
    </SettingsItem>
    <template v-if="settings.enableDockLiquidGlass">
      <p v-if="settings.disableFrostedGlass" class="liquid-glass-paused">
        {{ $t('settings.liquid_glass_paused') }}
      </p>
      <SettingsItem setting-id="appearance.liquidGlass.mode" :title="$t('settings.liquid_glass_mode')" right-width="auto">
        <Select v-model="settings.dockLiquidGlassMode" :options="modes" w="160px" />
      </SettingsItem>
      <SettingsItem setting-id="appearance.liquidGlass.tint" :title="$t('settings.liquid_glass_tint')" right-width="auto">
        <div class="liquid-glass-tint-controls">
          <Select v-model="settings.dockLiquidGlassTintSource" :options="tintSources" w="160px" />
          <input
            v-if="settings.dockLiquidGlassTintSource === 'custom'"
            v-model="settings.dockLiquidGlassTintColor"
            type="color"
            class="liquid-glass-color"
            :aria-label="$t('settings.liquid_glass_tint_color')"
          >
        </div>
      </SettingsItem>
      <SettingsItem
        v-for="slider in sliders"
        :key="slider.key"
        :setting-id="`appearance.${slider.key}`"
        :title="$t(slider.title)"
        :desc="slider.key === 'dockLiquidGlassBlur' ? $t('settings.liquid_glass_blur_desc') : slider.key === 'dockLiquidGlassTintOpacity' ? $t('settings.liquid_glass_tint_opacity_desc') : undefined"
      >
        <template #bottom>
          <Slider v-model="settings[slider.key]" :min="slider.min" :max="slider.max" :step="slider.step" :label="`${settings[slider.key]}${slider.unit}`" />
        </template>
      </SettingsItem>
    </template>
  </SettingsItemGroup>
</template>

<style scoped lang="scss">
.liquid-glass-paused {
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);
}

.liquid-glass-tint-controls {
  display: flex;
  align-items: center;
  gap: var(--bew-space-2);
}

.liquid-glass-color {
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
