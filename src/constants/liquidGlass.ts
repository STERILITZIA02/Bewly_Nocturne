export const LIQUID_GLASS_MODES = ['standard', 'polar', 'prominent'] as const
export type LiquidGlassMode = typeof LIQUID_GLASS_MODES[number]
export const LIQUID_GLASS_TINT_SOURCES = ['theme', 'custom'] as const
export type LiquidGlassTintSource = typeof LIQUID_GLASS_TINT_SOURCES[number]

// Keep labels readable even when bright video frames move behind a panel.
export const LIQUID_GLASS_THEME_TINT_STRENGTH = { light: 5, dark: 4.5, oled: 6.5 } as const

export const LIQUID_GLASS_PARAMETERS = {
  refraction: { min: 0, max: 100, step: 1, default: 35 },
  blur: { min: 0, max: 36, step: 0.5, default: 6 },
  tintOpacity: { min: 0, max: 100, step: 1, default: 30 },
  dispersion: { min: 0, max: 5, step: 0.1, default: 1.5 },
  saturation: { min: 0, max: 200, step: 5, default: 140 },
} as const
