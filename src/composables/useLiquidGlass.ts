import type { InjectionKey, Ref } from 'vue'
import { computed } from 'vue'

import { useDark } from '~/composables/useDark'
import { LIQUID_GLASS_THEME_TINT_STRENGTH } from '~/constants/liquidGlass'
import { settings } from '~/logic'

export const GLASS_SURFACE_CONTEXT: InjectionKey<Readonly<Ref<boolean>>> = Symbol('bew-glass-surface')

// Keep the existing persisted keys so moving the controls retains every choice.
export const liquidGlassEnabled = computed(() => settings.value.enableDockLiquidGlass && !settings.value.disableFrostedGlass)
const baseProps = computed(() => ({
  mode: settings.value.dockLiquidGlassMode,
  refraction: settings.value.dockLiquidGlassRefraction,
  blur: settings.value.dockLiquidGlassBlur,
  dispersion: settings.value.dockLiquidGlassDispersion,
  saturation: settings.value.dockLiquidGlassSaturation,
  tintColor: settings.value.dockLiquidGlassTintSource === 'custom' ? settings.value.dockLiquidGlassTintColor : 'var(--bew-liquid-glass-color)',
}))

export function useLiquidGlassOptions() {
  const { isDark, isOledDark } = useDark()
  return computed(() => {
    const theme = isOledDark.value ? 'oled' : isDark.value ? 'dark' : 'light'
    // Preserve both endpoints and keep the full slider range responsive.
    const tintOpacity = settings.value.dockLiquidGlassTintSource === 'theme'
      ? (1 - (1 - settings.value.dockLiquidGlassTintOpacity / 100) ** LIQUID_GLASS_THEME_TINT_STRENGTH[theme]) * 100
      : settings.value.dockLiquidGlassTintOpacity
    return { ...baseProps.value, tintOpacity }
  })
}
